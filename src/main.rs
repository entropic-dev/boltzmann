#![allow(clippy::option_option)]

use std::io::prelude::*;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context as ErrorContext, Result};
use atty::Stream;
use clap::Parser;
use log::{debug, info, warn};
use owo_colors::OwoColorize;
use prettytable::Table;
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{self, Value};
use subprocess::{Exec, ExitStatus, NullFile};

mod render;
mod settings;

use settings::{Flipper, Settings, When};

// Darn, I had to cap-case NPM. What a shame.
#[cfg(not(target_os = "windows"))]
static NPM: &str = "npm";
#[cfg(target_os = "windows")]
static NPM: &str = "npm.cmd";

#[derive(Clone, Serialize, Parser)]
#[clap(
    name = "boltzmann",
    version,
    author,
    about = "Generate or update scaffolding for a Boltzmann service.
To enable a feature, mention it or set the option to `on`.
To remove a feature from an existing project, set it to `off`.

Examples:
boltzmann my-project --redis --website
boltzmann my-project --githubci=off --honeycomb --jwt"
)]
pub struct Flags {
    #[clap(long)]
    /// Enable redis middleware
    redis: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable postgres middleware
    postgres: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable tracing via Honeycomb
    honeycomb: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable GitHub actions CI
    githubci: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable Nunjucks templates
    templates: Option<Option<Flipper>>,

    #[clap(long)]
    /// Scaffold a project implemented in TypeScript
    typescript: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable csrf protection middleware
    csrf: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable /monitor/status healthcheck endpoint; on by default
    status: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable /monitor/ping liveness endpoint; on by default
    ping: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable jwt middleware
    jwt: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable live reload in development
    livereload: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable OAuth
    oauth: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable static file serving in development
    staticfiles: Option<Option<Flipper>>,

    #[clap(long)]
    /// Enable asset bundling via ESBuild
    esbuild: Option<Option<Flipper>>,

    // Convenient option groups next. These aren't saved individually.
    #[clap(
        long,
        help = ""
    )]
    /// Enable all features relevant to building websites
    ///
    /// This option group enables the templates, csrf, staticfile, jwt, livereload, ping, and
    /// status options.
    website: bool,

    #[clap(long)]
    /// Enable everything (mostly for testing)
    all: bool,

    #[clap(long)]
    /// Update a git-repo destination even if there are changes
    force: bool, // for enemies

    #[clap(
        short,
        long,
        parse(from_occurrences),
    )]
    /// Pass -v or -vv to increase verbosity
    verbose: u64, // huge but this is what our logger wants

    #[clap(long, short)]
    /// Suppress all output except errors
    silent: bool,

    #[clap(long, short)]
    /// Suppress all output except errors; an alias for silent
    quiet: bool,

    #[clap(long)]
    /// Template a project with the self-test code enabled.
    selftest: bool, // turn on the oven in self-cleaning mode.

    #[clap(long)]
    /// Open the Boltzmann documentation in a web browser
    docs: bool,

    #[clap(
        parse(from_os_str),
        default_value = ""
    )]
    /// The path to the Boltzmann service
    destination: PathBuf,
}

#[derive(Deserialize, Clone)]
struct VersionedScript {
    version: Version,
    value: String,
}

#[derive(Deserialize)]
struct RunScriptSpec {
    key: String,
    value: String,
    preconditions: Option<When>,
    #[serde(default)]
    versions: Vec<VersionedScript>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct PackageJson {
    #[serde(flatten)]
    pub(crate) rest: serde_json::Map<String, Value>,

    #[serde(skip_serializing_if = "Option::is_none")]
    dependencies: Option<serde_json::Map<String, Value>>,

    #[serde(rename = "devDependencies", skip_serializing_if = "Option::is_none")]
    dev_dependencies: Option<serde_json::Map<String, Value>>,

    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    module_type: Option<String>,

    scripts: Option<serde_json::Map<String, Value>>,
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
        ExitStatus::Exited(1) => Err(anyhow!(
            "git working directory is dirty; pass --force if you want to run anyway"
        )),
        // all other exit codes are are fine
        _ => Ok(()),
    }
}

fn initialize_package_json(path: &Path, verbosity: u64) -> Result<()> {
    if let Err(e) = std::fs::DirBuilder::new().create(&path) {
        if e.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(e.into());
        }
    }

    let mut subproc = Exec::cmd(NPM).arg("init").arg("--yes").cwd(&path);

    subproc = if verbosity < 3 {
        // only noisy for trace
        subproc.stdout(NullFile).stderr(NullFile)
    } else {
        subproc
    };

    let exit_status = subproc.join()?;

    match exit_status {
        ExitStatus::Exited(0) => Ok(()),
        _ => Err(anyhow!("npm init exited with non-zero status")),
    }
}

fn print_table<T: std::fmt::Display + Clone>(mut input: Vec<T>, columns: usize, indent: usize) {
    let mut table = Table::new();
    table.set_format(*prettytable::format::consts::FORMAT_CLEAN);
    table.get_format().indent(indent);

    while input.len() > columns {
        let (line, remainder) = input.split_at(columns);
        table.add_row(line.into());
        input = remainder.to_vec();
    }
    table.add_row(input.into());
    table.printstd();
}

// data structures for dep lists
#[derive(Deserialize)]
enum DependencyType {
    Normal,
    Development,
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
    preconditions: Option<When>,
}

fn main() -> anyhow::Result<(), anyhow::Error> {
    let mut flags = Flags::parse();

    let verbosity: u64 = if flags.silent || flags.quiet {
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

    let version = option_env!("CARGO_PKG_VERSION")
        .unwrap_or_else(|| "0.0.0")
        .to_string();
    let semver_version = Version::parse(&version).unwrap_or_else(|_| Version::new(0, 0, 0));

    if flags.docs {
        let subproc = match std::env::consts::OS {
            "windows" => Exec::cmd("cmd.exe").arg("/C").arg("start").arg(" "),
            "macos" => Exec::cmd("open"),
            // treat everything else as linux, since we don't release for bsd or phones
            _ => Exec::cmd("xdg-open"),
        };

        let docssite = format!("https://www.boltzmann.dev/en/docs/v{}/", version);
        info!(
            "Opening documentation website at {}",
            docssite.blue().bold()
        );
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
        match &buffer[..] {
            "Y\r\n" => {}
            "YES\r\n" => {}
            "Y\n" => {}
            "YES\n" => {}
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

    let mut first_scaffold = false;
    let mut prev_version: Version = Version::new(0, 0, 0);

    info!(
        "Scaffolding a Boltzmann service in {}",
        flags.destination.to_str().unwrap().bold().blue()
    );
    let default_settings = Settings {
        githubci: Some(true),
        status: Some(true),
        ping: Some(true),
        ..Default::default()
    };

    let mut package_json = if let Some(mut package_json) =
        load_package_json(&flags, default_settings.clone())
    {
        if let Some(t) = package_json.boltzmann.clone() {
            prev_version = Version::parse(&t.version.unwrap_or_else(|| "0.0.0".to_string()))
                .unwrap_or(prev_version);
        }
        if semver_version > prev_version {
            info!(
                "    upgrading from boltzmann@{}",
                prev_version.to_string().bold().blue()
            );
        } else {
            info!("    loaded settings from existing package.json");
        }
        package_json.scripts = package_json.scripts.or_else(Default::default);
        package_json
    } else {
        first_scaffold = true;
        info!("    initializing a new NPM package...");
        initialize_package_json(&flags.destination, verbosity)
            .with_context(|| format!("Failed to run `npm init -y` in {:?}", flags.destination))?;
        let mut package_json = load_package_json(&flags, default_settings).unwrap();
        package_json.scripts.replace(Default::default());
        package_json
    };

    if package_json.boltzmann.is_none() {
        return Err(anyhow!("Somehow we do not have default settings! Please file a bug."));
    }

    let settings = package_json.boltzmann.take().unwrap();
    let updated_settings = settings.merge_flags(version.clone(), &flags);

    render::scaffold(&mut target, &updated_settings).context("Failed to render Boltzmann files")?;

    let old = serde_json::to_value(settings)?;
    let new = serde_json::to_value(&updated_settings)?;

    let mut dependencies = package_json
        .dependencies
        .take()
        .unwrap_or_default();
    let mut devdeps = package_json
        .dev_dependencies
        .take()
        .unwrap_or_default();
    let candidates: Vec<DependencySpec> = ron::de::from_str(include_str!("dependencies.ron"))?;

    let mut table = Table::new();
    table.set_format(*prettytable::format::consts::FORMAT_CLEAN);

    let mut actions: Vec<String> = Vec::new();
    let false_sentinel = Value::Bool(false);

    for candidate in candidates {
        let target = match candidate.kind {
            DependencyType::Normal => &mut dependencies,
            DependencyType::Development => &mut devdeps,
        };

        let has_dep_currently = target.contains_key(&candidate.name[..]);

        if let Some(preconditions) = candidate.preconditions {
            let wants_feature = preconditions.are_satisfied_by(&new);
            let used_to_have = preconditions.are_satisfied_by(&old);

            // Note that we log on a state change, but we always make the change to pick up new versions.
            if wants_feature {
                if !has_dep_currently {
                    let why = if !preconditions.all_of.is_empty() {
                        preconditions.all_of.join(", ")
                    } else {
                        "prereqs".to_string()
                    };
                    actions.push(format!(
                        "{}@{} ({} enabled)",
                        candidate.name.bold().magenta(),
                        candidate.version,
                        why
                    ));
                }
                target.insert(candidate.name, candidate.version.into());
            } else if wants_feature != used_to_have {
                if has_dep_currently {
                    let why = if !preconditions.all_of.is_empty() {
                        preconditions.all_of.join(", ")
                    } else {
                        "prereqs".to_string()
                    };
                    actions.push(format!(
                        "ⅹ {} ({} disabled)",
                        candidate.name.strikethrough().magenta(),
                        why
                    ));
                }
                target.remove(&candidate.name[..]);
            }
        } else if !has_dep_currently {
            actions.push(format!(
                "{}@{} {}",
                candidate.name.bold().magenta(),
                candidate.version,
                candidate.kind
            ));
            target.insert(candidate.name, candidate.version.into());
        } else if let Some(current_value) = target.get(&candidate.name[..]) {
            if current_value.as_str().unwrap_or("") != candidate.version.as_str() {
                actions.push(format!(
                    "{}@{} ➜ {} {}",
                    candidate.name.bold().magenta(),
                    current_value,
                    candidate.version,
                    candidate.kind
                ));
                target.insert(candidate.name, candidate.version.into());
            }
        }
    }

    if verbosity > 0 && !actions.is_empty() {
        // There is something to log, and we're not silent...
        if verbosity == 1 && first_scaffold {
            info!("    {} dependencies added", actions.len());
        } else {
            info!("    managing dependencies...");
            actions.sort_unstable();
            print_table(actions, 2, 7);
        }
    }

    package_json.dependencies.replace(dependencies);
    package_json.dev_dependencies.replace(devdeps);
    package_json.boltzmann.replace(updated_settings.clone());

    // Update package.json run scripts.
    // We manage run scripts that meet the following criteria:
    // - name starts with `boltzman:`, always
    // - on first run, all run scripts we define
    // - on subsequent runs, run scripts that match the string from a previous version
    actions = Vec::new();
    let candidates: Vec<RunScriptSpec> = ron::de::from_str(include_str!("runscripts.ron"))?;
    let mut scripts = package_json.scripts.take().unwrap();

    'next: for candidate in candidates {
        if let Some(preconditions) = candidate.preconditions {
            let wants_feature = preconditions.all_of.iter().all(|feature| {
                let has_feature = new.get(feature).unwrap_or(&false_sentinel);
                has_feature.as_bool().unwrap_or(false)
            }) && !preconditions.none_of.iter().any(|feature| {
                let has_feature = new.get(feature).unwrap_or(&false_sentinel);
                has_feature.as_bool().unwrap_or(false)
            });

            if !wants_feature {
                // TODO consider removing a boltzmann-managed run script if the feature is now unwanted.
                continue;
            }

            for check_presence in preconditions.if_not_present {
                if let Some(value) = scripts.get(check_presence.as_str()) {
                    // Easy case: no work to do.
                    if value.as_str().unwrap_or("") == candidate.value {
                        continue 'next;
                    }

                    // Here's the tricky case! The if-not-present tagged scripts are standardized
                    // targets like `test` and `postinstall`. If they're present and set to a value we
                    // previously gave them, we can feel free to update them. If not, we move on.
                    if candidate.versions.is_empty() {
                        debug!(
                            "{} has no history",
                            format!("npm run {}", candidate.key).bold().red()
                        );
                        continue 'next;
                    }

                    // First, find the previous-in-semver-order version in our list of versions.
                    // This is the version our runscript would have come from. If a match, we want to update.
                    // If not a match, we continue with the next script candidate.
                    let mut history = candidate.versions.clone();
                    history
                        .sort_by(|left, right| right.version.partial_cmp(&left.version).unwrap()); // yes reversed
                    for potential_source in history {
                        if potential_source.version <= prev_version {
                            // We have found our previous managed value for this run script.
                            let current = scripts
                                .get(&candidate.key)
                                .unwrap_or(&false_sentinel)
                                .as_str()
                                .unwrap_or("");
                            if !current.to_string().is_empty() && current != potential_source.value
                            {
                                actions.push(format!(
                                    "{} left in place",
                                    format!("npm run {}", candidate.key).bold().red()
                                ));
                                continue 'next;
                            }
                            break;
                        }
                    }
                }
            }
        }

        if scripts
            .get(&candidate.key)
            .unwrap_or(&false_sentinel)
            .as_str()
            .unwrap_or("")
            != candidate.value
        {
            actions.push(format!(
                "{} set",
                format!("npm run {}", candidate.key).bold().green()
            ));
            scripts.insert(candidate.key, serde_json::Value::String(candidate.value));
        }
    }
    package_json.scripts.replace(scripts);
    if !actions.is_empty() && verbosity > 0 {
        info!("    managing run scripts...");
        actions.sort_unstable();
        print_table(actions, 3, 6);
    }

    info!("    writing updated package.json...");
    target.push("package.json");
    let mut fd = std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&target)
        .with_context(|| format!("Failed to update {:?}", target))?;
    serde_json::to_writer_pretty(&mut fd, &package_json)?;
    target.pop();

    let mut subproc = Exec::cmd(NPM).arg("i").cwd(&target);

    subproc = if verbosity < 2 {
        subproc.stdout(NullFile).stderr(NullFile)
    } else {
        subproc
    };
    info!("    running package install...");
    let exit_status = subproc.join()?;

    match exit_status {
        ExitStatus::Exited(0) => {
            warn!("Boltzmann@{} with:", version.blue().bold());
            let features = updated_settings.features();
            print_table(features, 8, 3);
            Ok(())
        }
        _ => Err(anyhow!("npm install exited with non-zero status; run by hand to diagnose.")),
    }
}

#[test]
fn verify_app() {
    use clap::CommandFactory;
    let app = Flags::command();
    app.debug_assert()
}
