#![allow(clippy::option_option)]

use std::collections::BTreeMap;
use std::io::prelude::*;
use std::path::PathBuf;

use anyhow::{ anyhow, Context as ErrorContext, Result };
use atty::Stream;
use log::{info, warn};
use owo_colors::OwoColorize;
use serde_json::{ Value, self };
use serde::{ Serialize, Deserialize };
use structopt::clap::AppSettings::*;
use structopt::StructOpt;
use subprocess::{ Exec, ExitStatus, NullFile };

mod render;
mod settings;

use settings::{ Flipper, Settings, When };

// Darn, I had to cap-case NPM. What a shame.
#[cfg(not(target_os = "windows"))]
static NPM: &str = "npm";
#[cfg(target_os = "windows")]
static NPM: &str = "npm.cmd";

#[derive(Clone, Serialize, StructOpt)]
#[structopt(name = "boltzmann", about = "Generate or update scaffolding for a Boltzmann service.
To enable a feature, mention it or set the option to `on`.
To remove a feature from an existing project, set it to `off`.

Examples:
boltzmann my-project --redis --website
boltzmann my-project --githubci=off --honeycomb --jwt")]
#[structopt(global_setting(ColoredHelp), global_setting(ColorAuto))]
pub struct Flags {
    #[structopt(long, help = "Enable redis")]
    redis: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable postgres")]
    postgres: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable honeycomb")]
    honeycomb: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable GitHub actions CI")]
    githubci: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable Nunjucks templates")]
    templates: Option<Option<Flipper>>,

    #[structopt(long, help = "Scaffold project using ES Modules")]
    esm: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable csrf protection middleware")]
    csrf: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable /monitor/status healthcheck endpoint; on by default")]
    status: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable /monitor/ping liveness endpoint; on by default")]
    ping: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable jwt middleware")]
    jwt: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable live reload in development")]
    livereload: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable OAuth")]
    oauth: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable static file serving in development")]
    staticfiles: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable asset bundling via ESBuild")]
    esbuild: Option<Option<Flipper>>,

    // Convenient option groups next. These aren't saved individually.
    #[structopt(long, help = "Enable website feature set (templates, csrf, staticfiles, jwt, livereload, ping, status)")]
    website: bool,

    #[structopt(long, help = "Enable everything!")]
    all: bool,

    #[structopt(long, help = "Update a git-repo destination even if there are changes")]
    force: bool, // for enemies

    #[structopt(short, long, parse(from_occurrences), help = "Pass -v or -vv to increase verbosity")]
    verbose: u64, // huge but this is what our logger wants

    #[structopt(long, short, help = "Suppress all output except errors")]
    silent: bool,

    #[structopt(long, help = "Build for a self-test")]
    selftest: bool, // turn on the oven in self-cleaning mode.

    #[structopt(long, help = "Open the Boltzmann documentation in a web browser")]
    docs: bool,

    #[structopt(parse(from_os_str), help = "The path to the Boltzmann service", default_value = "")]
    destination: PathBuf
}

#[derive(Deserialize, Debug, Serialize)]
struct RunScripts {
    lint: Option<String>,
    posttest: Option<String>,
    start: Option<String>,
    test: Option<String>,

    #[serde(rename = "boltzmann:upgrade")]
    upgrade: Option<String>,

    #[serde(rename = "boltzmann:routes")]
    routes: Option<String>,

    #[serde(rename = "boltzmann:esbuild")]
    esbuild: Option<String>,

    #[serde(rename = "boltzmann:docs")]
    docs: Option<String>,

    #[serde(flatten)]
    pub(crate) rest: BTreeMap<String, Value>,
}

impl RunScripts {
    fn upgrade_string() -> String {
        "npx boltzmann-cli".to_string()
    }

    fn routes_string() -> String {
        "node -e 'require(\"./boltzmann\").printRoutes()'".to_string()
    }

    fn routes_string_esm() -> String {
        "node -e 'import(\"./boltzmann.js\").then(xs => xs.printRoutes())'".to_string()
    }

    fn esbuild_string() -> String {
        "node -e 'require(\"./boltzmann\").buildAssets(...process.argv.slice(1, 2))'".to_string()
    }

    fn esbuild_string_esm() -> String {
        "node -e 'import(\"./boltzmann.js\").then(xs => xs.buildAssets(...process.argv.slice(1, 2)))'".to_string()
    }

    fn docs_string() -> String {
        "npx boltzmann-cli --docs".to_string()
    }
}

impl Default for RunScripts {
    fn default() -> Self {
        RunScripts {
            lint: Some("eslint .".to_string()),
            posttest: Some("npm run lint".to_string()),
            start: Some("nodemon ./boltzmann.js".to_string()),
            test: Some("tap test".to_string()),
            upgrade: Some(RunScripts::upgrade_string()),
            routes: Some(RunScripts::routes_string()),
            esbuild: None,
            docs: Some(RunScripts::docs_string()),
            rest: BTreeMap::new()
        }
    }
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct PackageJson {
    #[serde(flatten)]
    pub(crate) rest: BTreeMap<String, Value>,

    dependencies: Option<BTreeMap<String, String>>,

    #[serde(rename = "devDependencies")]
    dev_dependencies: Option<BTreeMap<String, String>>,

    #[serde(rename = "type")]
    module_type: Option<String>,

    scripts: Option<RunScripts>,
    boltzmann: Option<Settings>,
}

fn load_package_json(flags: &Flags, default_settings: Settings) -> Option<PackageJson> {
    let mut path = flags.destination.clone();
    path.push("package.json");

    let mut fd = std::fs::File::open(&path).ok()?;

    let mut contents = Vec::new();
    fd.read_to_end(&mut contents).ok()?;

    let mut package_json = serde_json::from_slice::<PackageJson>(&contents[..]).ok()?;
    package_json.boltzmann = package_json.boltzmann.or(Some(default_settings));
    Some(package_json)
}

// Return ok if we can proceed, and an error saying why if we can't.
fn check_git_status(flags: &Flags) -> Result<()> {
    if flags.force {
        return Ok(()); // YOLO!
    }

    if !std::path::Path::new(&flags.destination).exists() {
        return Ok(());
    }

    let exit_status = Exec::cmd("git")
        .arg("diff")
        .arg("--quiet")
        .cwd(&flags.destination)
        .stderr(NullFile)
        .join()?;

    match exit_status {
        ExitStatus::Exited(129) => Ok(()), // target is not a git dir; this is fine
        ExitStatus::Exited(0) => Ok(()),   // target is clean
        ExitStatus::Exited(1) => {
          Err(anyhow!("git working directory is dirty; pass --force if you want to run anyway"))
        },
        // all other exit codes are are fine
        _ => Ok(()),
    }
}

fn initialize_package_json(path: &PathBuf, verbosity: u64) -> Result<()> {
    if let Err(e) = std::fs::DirBuilder::new().create(&path) {
        if e.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(e.into())
        }
    }

    let mut subproc = Exec::cmd(NPM)
        .arg("init")
        .arg("--yes")
        .cwd(&path);

    subproc = if verbosity < 3 { // only noisy for trace
        subproc
            .stdout(NullFile)
            .stderr(NullFile)
    } else {
        subproc
    };

    let exit_status = subproc.join()?;

    match exit_status {
        ExitStatus::Exited(0) => Ok(()),
        _ => Err(anyhow!("npm init exited with non-zero status"))
    }
}

// data structures for dep lists
#[derive(Deserialize)]
enum DependencyType {
    Normal,
    Development
}

impl ::std::fmt::Display for DependencyType {
    fn fmt(&self, f: &mut ::std::fmt::Formatter) -> Result<(), ::std::fmt::Error> {
        match *self {
            DependencyType::Normal => f.write_str(""),
            DependencyType::Development => f.write_str("(dev)"),
        }
    }
}

#[derive(Deserialize)]
struct DependencySpec {
    name: String,
    version: String,
    kind: DependencyType,
    preconditions: Option<When>
}

fn main() -> std::result::Result<(), Box<dyn std::error::Error + 'static>> {
    let mut flags = Flags::from_args();

    let verbosity: u64 = if flags.silent {
        0
    } else {
        flags.verbose + 1
    };

    loggerv::Logger::new()
        .verbosity(verbosity)
        .line_numbers(false)
        .module_path(false)
        .colors(true)
        .init()
        .unwrap();

    let version = option_env!("CARGO_PKG_VERSION").unwrap_or_else(|| "0.0.0").to_string();

    if flags.docs {
        let subproc = match std::env::consts::OS {
            "windows" => Exec::cmd("cmd.exe").arg("/C").arg("start").arg(" "),
            "macos" => Exec::cmd("open"),
            // treat everything else as linux, since we don't release for bsd or phones
            _ => Exec::cmd("xdg-open"),
        };

        let docssite = format!("https://www.boltzmann.dev/en/docs/v{}/", version);
        info!("Opening documentation website at {}", docssite.blue().bold());
        subproc.arg(docssite).join()?;
        ::std::process::exit(0);
    }

    // Is this a tty? What is the user trying to do? Is there a user? What is an electron anyway?
    if flags.destination.as_os_str().is_empty() && atty::is(Stream::Stdout) {
        warn!("Scaffolding a Boltzmann service in the current working directory.");
        info!("To see full help, run `boltzmann --help`.");
        print!("Scaffold here? (y/n): ");
        std::io::stdout().flush()?;
        let mut buffer = String::new();
        std::io::stdin().read_line(&mut buffer)?;
        buffer.make_ascii_uppercase();
        match &buffer[..]{
            "Y\r\n" => {},
            "YES\r\n" => {},
            "Y\n" => {},
            "YES\n" => {},
            _ => {
                warn!("Exiting without scaffolding.");
                ::std::process::exit(0);
            }
        }
    }

    let cwd = std::env::current_dir()?;
    flags.destination = cwd.join(&flags.destination);
    let mut target = flags.destination.clone();

    check_git_status(&flags)?;

    info!("Scaffolding a Boltzmann service in {}", flags.destination.to_str().unwrap().bold().blue());
    let default_settings = Settings {
        githubci: Some(true),
        status: Some(true),
        ping: Some(true),
        ..Default::default()
    };

    let mut package_json = if let Some(mut package_json) = load_package_json(&flags, default_settings.clone()) {
        info!("    loaded settings from existing package.json");
        package_json.scripts = package_json.scripts.map(|mut scripts| {
            scripts.upgrade.replace(RunScripts::upgrade_string());
            scripts.routes.replace(RunScripts::routes_string());
            scripts.docs.replace(RunScripts::docs_string());
            scripts
        }).or_else(Default::default);

        package_json
    } else {
        info!("    initializing a new NPM package...");
        initialize_package_json(&flags.destination, verbosity)
            .with_context(|| format!("Failed to run `npm init -y` in {:?}", flags.destination))?;
        let mut package_json = load_package_json(&flags, default_settings).unwrap();
        package_json.scripts.replace(Default::default());
        package_json
    };

    if package_json.boltzmann.is_none() {
        return Err(anyhow!("Somehow we do not have default settings! Please file a bug.").into());
    }

    let settings = package_json.boltzmann.take().unwrap();
    let updated_settings = settings.merge_flags(version, &flags);

    render::scaffold(&mut target, &updated_settings)
        .context("Failed to render Boltzmann files")?;

    let old = serde_json::to_value(settings)?;
    let new = serde_json::to_value(&updated_settings)?;

    let mut dependencies = package_json.dependencies.take().unwrap_or_else(BTreeMap::new);
    let mut devdeps = package_json.dev_dependencies.take().unwrap_or_else(BTreeMap::new);
    let candidates: Vec<DependencySpec> = ron::de::from_str(include_str!("dependencies.ron"))?;
    info!("    updating dependencies...");

    for candidate in candidates {
        let target = match candidate.kind {
            DependencyType::Normal => &mut dependencies,
            DependencyType::Development => &mut devdeps
        };

        let has_dep_currently = target.contains_key(&candidate.name[..]);

        if let Some(preconditions) = candidate.preconditions {
            let feature = preconditions.feature.unwrap();
            let wants_feature = new.get(&feature)
                .map(|xs| xs.as_bool().unwrap_or(false))
                .unwrap_or(false);
            let used_to_have = old.get(&feature)
                .map(|xs| xs.as_bool().unwrap_or(false))
                .unwrap_or(false);

            // Note that we log on a state change, but we always make the change to pick up new versions.
            if wants_feature {
                if !has_dep_currently {
                    info!("        adding {} @ {} ({} activated)", candidate.name.bold().magenta(), candidate.version, feature);
                }
                target.insert(candidate.name, candidate.version);
            } else if wants_feature != used_to_have {
                if has_dep_currently {
                    info!("        removing {} ({} deactivated)", candidate.name.magenta().strikethrough(), feature);
                }
                target.remove(&candidate.name[..]);
            }
        } else if !has_dep_currently {
            info!("        adding {} @ {} {}", candidate.name.bold().magenta(), candidate.version, candidate.kind);
            target.insert(candidate.name, candidate.version);
        } else if let Some(current_value) = target.get(&candidate.name[..]) {
            if current_value.as_str() != candidate.version.as_str() {
                info!("        updating {} @ {} {}", candidate.name.bold().magenta(), candidate.version, candidate.kind);
                target.insert(candidate.name, candidate.version);
            }
        }
    }

    let has_esm = if let Some(esm) = updated_settings.esm {
        if esm {
            package_json.module_type = Some("module".to_string());
        }
        esm
    } else {
        false
    };

    if let Some(mut scripts) = package_json.scripts.as_mut() {
        if let Some(esbuild) = updated_settings.esbuild {
            if esbuild {
                scripts.esbuild = Some(if has_esm { RunScripts::esbuild_string_esm() } else { RunScripts::esbuild_string() });
            }
        }

        scripts.routes = Some(if has_esm { RunScripts::routes_string_esm() } else { RunScripts::routes_string() });
    }

    package_json.boltzmann.replace(updated_settings.clone());
    package_json.dependencies.replace(dependencies);
    package_json.dev_dependencies.replace(devdeps);

    info!("    writing updated package.json...");
    target.push("package.json");
    let mut fd = std::fs::OpenOptions::new().create(true).truncate(true).write(true).open(&target)
        .with_context(|| format!("Failed to update {:?}", target))?;
    serde_json::to_writer_pretty(&mut fd, &package_json)?;
    target.pop();

    let mut subproc = Exec::cmd(NPM)
        .arg("i")
        .cwd(&target);

    subproc = if verbosity < 2 {
        subproc
            .stdout(NullFile)
            .stderr(NullFile)
    } else {
        subproc
    };
    info!("    running package install...");
    let exit_status = subproc.join()?;

    match exit_status {
        ExitStatus::Exited(0) => {
            warn!("Boltzmann at {} with {}", option_env!("CARGO_PKG_VERSION").unwrap_or_else(|| "0.0.0").bold(), updated_settings);
            Ok(())
        },
        _ => Err(anyhow!("npm install exited with non-zero status").into())
    }
}
