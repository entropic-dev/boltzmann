#![allow(clippy::option_option)]

use std::collections::HashMap;
use std::io::prelude::*;
use std::path::PathBuf;

use anyhow::{ anyhow, Context as ErrorContext, Result };
use atty::Stream;
use subprocess::{ Exec, ExitStatus, NullFile };
use serde::{ Serialize, Deserialize };
use serde_json::{ Value, self };
use structopt::StructOpt;
use structopt::clap::AppSettings::*;

mod render;
mod settings;

use settings::{ Flipper, Settings, When };

// Darn, I had to cap-case NPM. What a shame.
#[cfg(not(target_os = "windows"))]
static NPM: &'static str = "npm";
#[cfg(target_os = "windows")]
static NPM: &'static str = "npm.cmd";

#[derive(Clone, Serialize, StructOpt)]
#[structopt(name = "boltzmann", about = "Generate or update scaffolding for a Boltzmann service.
To enable a feature, mention it or set the option to `on`.
To remove a feature from an existing project, set it to `off`.")]
#[structopt(global_setting(ColoredHelp), global_setting(ColorAuto))]
pub struct Flags {
    #[structopt(long, help = "Enable redis")]
    redis: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable postgres")]
    postgres: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable honeycomb",
        about = "some help text")]
    honeycomb: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable GitHub actions CI")]
    githubci: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable /monitor/status healthcheck endpoint")]
    status: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable /monitor/ping liveness endpoint")]
    ping: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable jwt middleware")]
    jwt: Option<Option<Flipper>>,

    #[structopt(long, help = "Update a git-repo destination even if there are changes")]
    force: bool, // for enemies

    #[structopt(long, help = "Build for a self-test.")]
    selftest: bool, // turn on the oven in self-cleaning mode.

    #[structopt(parse(from_os_str), help = "The path to the Boltzmann service", default_value = "")]
    destination: PathBuf
}

#[derive(Default, Deserialize, Serialize)]
struct PackageJson {
    dependencies: Option<HashMap<String, String>>,

    #[serde(rename = "devDependencies")]
    dev_dependencies: Option<HashMap<String, String>>,

    boltzmann: Option<Settings>,

    #[serde(flatten)]
    pub(crate) rest: HashMap<String, Value>,
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
        ExitStatus::Exited(_) => Ok(()),
        ExitStatus::Signaled(_) => Ok(()),
        ExitStatus::Other(_) => Ok(()),
        ExitStatus::Undetermined => Ok(()),
    }
}

fn initialize_package_json(path: &PathBuf) -> Result<()> {
    if let Err(e) = std::fs::DirBuilder::new().create(&path) {
        if e.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(e.into())
        }
    }

    let mut subproc = Exec::cmd(NPM)
        .arg("init")
        .arg("--yes")
        .cwd(&path);

    subproc = if std::env::var("DEBUG").ok().unwrap_or_else(|| "".to_string()).is_empty() {
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

#[derive(Deserialize)]
struct DependencySpec {
    name: String,
    version: String,
    kind: DependencyType,
    preconditions: Option<When>
}

fn main() -> std::result::Result<(), Box<dyn std::error::Error + 'static>> {
    let mut flags = Flags::from_args();
    // Is this a tty? What is the user trying to do? Is there a user? What is an electron anyway?
    if flags.destination.as_os_str().is_empty() && atty::is(Stream::Stdout) {
        println!("Scaffolding a Boltzmann service in the current working directory.");
        println!("To see full help, run `boltzmann --help`.");
        print!("Scaffold here? (y/n): ");
        std::io::stdout().flush()?;
        let mut buffer = String::new();
        std::io::stdin().read_line(&mut buffer)?;
        buffer.make_ascii_uppercase();
        match &buffer[..]{
            "Y\n" => {},
            "YES\n" => {},
            _ => {
                println!("Exiting without scaffolding.");
                ::std::process::exit(0);
            }
        }
    }
    let cwd = std::env::current_dir()?;
    flags.destination = cwd.join(&flags.destination);
    let mut target = flags.destination.clone();

    check_git_status(&flags)?;

    let default_settings = Settings {
        githubci: Some(true),
        status: Some(true),
        ping: Some(true),
        ..Default::default()
    };

    let initial_settings = Settings {
        ..Default::default()
    };

    let mut package_json = if let Some(xs) = load_package_json(&flags, default_settings) {
        xs
    } else {
        initialize_package_json(&flags.destination)
            .with_context(|| format!("Failed to run `npm init -y` in {:?}", flags.destination))?;
        load_package_json(&flags, initial_settings).unwrap()
    };

    if package_json.boltzmann.is_none() {
        return Err(anyhow!("Somehow we do not have default settings! Please file a bug.").into());
    }

    let settings = package_json.boltzmann.take().unwrap();
    let version = option_env!("CARGO_PKG_VERSION").unwrap_or_else(|| "0.0.0").to_string();
    let updated_settings = settings.merge_flags(version, &flags);

    render::scaffold(&mut target, &updated_settings)
        .context("Failed to render Boltzmann files")?;

    let old = serde_json::to_value(settings)?;
    let new = serde_json::to_value(&updated_settings)?;

    let mut dependencies = package_json.dependencies.take().unwrap_or_else(HashMap::new);
    let mut devdeps = package_json.dev_dependencies.take().unwrap_or_else(HashMap::new);
    let candidates: Vec<DependencySpec> = ron::de::from_str(include_str!("dependencies.ron"))?;

    for candidate in candidates {
        let target = match candidate.kind {
            DependencyType::Normal => &mut dependencies,
            DependencyType::Development => &mut devdeps
        };

        if let Some(preconditions) = candidate.preconditions {
            let feature = preconditions.feature.unwrap();
            let wants_feature = new.get(&feature)
                .map(|xs| xs.as_bool().unwrap_or(false))
                .unwrap_or(false);
            let used_to_have = old.get(&feature)
                .map(|xs| xs.as_bool().unwrap_or(false))
                .unwrap_or(false);

            if wants_feature != used_to_have {
                if wants_feature {
                    target.insert(candidate.name, candidate.version);
                } else {
                    target.remove(&candidate.name[..]);
                }
            }
        } else {
            target.insert(candidate.name, candidate.version);
        }
    }

    package_json.boltzmann.replace(updated_settings);
    package_json.dependencies.replace(dependencies);
    package_json.dev_dependencies.replace(devdeps);

    target.push("package.json");
    let mut fd = std::fs::OpenOptions::new().create(true).truncate(true).write(true).open(&target)
        .with_context(|| format!("Failed to update {:?}", target))?;
    serde_json::to_writer_pretty(&mut fd, &package_json)?;
    target.pop();

    let exit_status = Exec::cmd(NPM)
        .arg("i")
        .cwd(&target)
        .join()?;

    match exit_status {
        ExitStatus::Exited(0) => Ok(()),
        _ => Err(anyhow!("npm install exited with non-zero status").into())
    }
}
