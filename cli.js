'use strict'

module.exports = main

const { execSync } = require('child_process')
const oblique = require('oblique-strategies')
const micromatch = require('micromatch')
const { promises: fs } = require('fs')
const nunjucks = require('nunjucks')
const toml = require('@iarna/toml')
const chalk = require('chalk')
const klaw = require('klaw')
const path = require('path')

if (require.main === module) {
  const minimist = require('minimist')
  return main(minimist(process.argv.slice(2))).catch(err => {
    console.error(err.stack)
    process.exit(1)
  })
}

async function main (rawArgv, {
  configFile = '.boltzmann.toml',
  loglevel = 'info',
  templateDir = path.join(__dirname, 'templates'),
  templateDirectories = []
} = {}) {
  if (!templateDir.endsWith(path.sep)) {
    templateDir += path.sep
  }

  const { force, _, ...argv } = rawArgv
  const [destination, ...rest] = _
  if (!destination || argv.h || argv.help) {
    return help()
  }
  const updating = await fs.access(destination).catch(() => false)

  const context = {
    ignore: [],
    ...Object.fromEntries(Object.entries(argv).map(([key, value]) => {
      if (key.startsWith('with-')) {
        return [key.slice(5), value]
      }
      return [key, value]
    }))
  }

  try {
    const rawConfig = await fs.readFile(path.join(destination, configFile), 'utf8')
    const config = parse(rawConfig)

    for (const key of config) {
      if (!(key in context)) {
        context[key] = config[key]
      }
    }

    if (!Array.isArray(context.ignore)) {
      context.ignore = []
    }
  } catch {}

  if (updating && !force) {
    try {
      const stdout = execSync(
        `git --git-dir=${path.join(
          destpath,
          '.git'
        )}  --no-optional-locks status --short`,
        { cwd: destpath, stdio: ['pipe', 'pipe', 'ignore'] }
      );

      if (String(stdout).trim().length !== 0) {
        console.error(
          'Cowardly refusing to regenerate on top of directory with uncommitted changes. Rerun with `--force` to continue.'
        );
        process.exit(1);
      }
    } catch {
      // git failed. Probably `.git` doesn't exist, which means the directory
      // isn't fully initialized. Ignore.
    }
  }

  templateDirectories.push(templateDir)
  nunjucks.configure(templateDirectories, {
    autoescape: false,
    tags: {
      blockStart: '<%',
      blockEnd: '%>',
      variableStart: '<$',
      variableEnd: '$>',
      commentStart: '<#',
      commentEnd: '#>'
    }
  })

  const jobs = []
  for await (const { path } of klaw(templateDir)) {
    if (path.endsWith('.tmpl')) {
      const job = render(path, context, context.ignore, templateDir, destination)
      job.catch(() => {})
      jobs.push(job)
    }
  }

  await Promise.all(jobs)
}

async function render (tpl, context, ignore, templateDir, destination) {
  const target = tpl.replace(templateDir, '')
  const relpath = target.slice(0, -'.tmpl'.length)
  const destpath = path.join(destination, relpath)
  if (micromatch.isMatch(relpath, ignore)) {
    console.log(
      `    ➜ ${chalk.yellow(destpath)} (ignored!)`
    )
    return
  }
  const result = nunjucks.render(target, context)
  await fs.mkdir(path.dirname(destpath), { recursive: true })
  await fs.writeFile(destpath, result);
  console.log(`    ➜ ${chalk.green.bold(destpath)}`);
}

function help () {
  console.error(`
usage: boltzmann path/to/boltzdir [--with-postgres] [--with-redis]
  `)
  process.exit(1)
}
