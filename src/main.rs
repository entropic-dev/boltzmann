use std::os::unix::fs::{ DirBuilderExt, OpenOptionsExt };
use std::collections::HashMap;
use std::io::prelude::*;
use std::path::PathBuf;

use anyhow::{ anyhow, Context as ErrorContext, Result };
use subprocess::{ Exec, ExitStatus, NullFile };
use serde::{ Serialize, Deserialize };
use serde_json::{ Value, self };
use tera::{ Tera, Context };
use structopt::StructOpt;

lazy_static::lazy_static! {
    pub static ref TEMPLATES: Tera = {
        match Tera::new("templates/**/*") {
            Ok(t) => t,
            Err(e) => {
                println!("Parsing error(s): {}", e);
                ::std::process::exit(1);
            }
        }
    };
}

#[derive(Clone, Serialize, Deserialize)]
enum Flipper {
    Off,
    On
}

impl Into<bool> for Flipper {
    fn into(self) -> bool {
        match self {
            Flipper::On => true,
            Flipper::Off => false
        }
    }
}

impl Into<Flipper> for bool {
    fn into(self) -> Flipper {
        if self {
            Flipper::On
        } else {
            Flipper::Off
        }
    }
}

impl std::str::FromStr for Flipper {
    type Err = Box<dyn std::error::Error + 'static>;

    fn from_str(s: &str) -> Result<Flipper, Self::Err> {
        Ok(match s {
            "on" => Flipper::On,
            "ON" => Flipper::On,
            "true" => Flipper::On,
            "yes" => Flipper::On,
            "y" => Flipper::On,
            "1" => Flipper::On,

            "0" => Flipper::Off,
            "n" => Flipper::Off,
            "no" => Flipper::Off,
            "false" => Flipper::Off,
            "OFF" => Flipper::Off,
            "off" => Flipper::Off,

            _ => return Err(anyhow::anyhow!("This is not a valid feature flag value.").into())
        })
    }
}

#[derive(Clone, Serialize, StructOpt)]
struct Flags {
    #[structopt(long, help = "Apply changes to destination even if there are changes")]
    force: bool, // for enemies

    #[structopt(long, help = "Apply changes to destination even if there are changes")]
    redis: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable postgres")]
    postgres: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable honeycomb")]
    honeycomb: Option<Option<Flipper>>,

    #[structopt(long, help = "Run the oven in self-cleaning mode.")]
    selftest: bool, // turn on boltzmann self test.

    #[structopt(long, help = "Enable GitHub actions CI")]
    githubci: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable /monitor/status healthcheck endpoint")]
    monitoring: Option<Option<Flipper>>,

    #[structopt(long, help = "Enable /monitor/ping healthcheck endpoint")]
    ping: Option<Option<Flipper>>,

    #[structopt(parse(from_os_str))]
    destination: PathBuf
}

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
struct Settings {
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    redis: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    postgres: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    honeycomb: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    selftest: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    githubci: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    monitoring: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    ping: Option<bool>,

    #[serde(flatten)]
    pub(crate) rest: HashMap<String, Value>,
}

impl Settings {
    fn merge_flags(&self, version: String, flags: &Flags) -> Settings {
        let cast = |xs: &Option<Option<Flipper>>, default: &Option<bool>| -> Option<bool> {
            match xs {
                Some(None) => Some(true),                       // e.g., --postgres
                Some(Some(Flipper::On)) => Some(true),          // e.g., --postgres=on
                Some(Some(Flipper::Off)) => Some(false),        // e.g., --postgres=off
                None => default.map(|xs| xs)
            }
        };

        Settings {
            version: Some(version),
            redis: cast(&flags.redis, &self.redis),
            postgres: cast(&flags.postgres, &self.postgres),
            honeycomb: cast(&flags.honeycomb, &self.honeycomb),
            githubci: cast(&flags.githubci, &self.githubci),
            monitoring: cast(&flags.monitoring, &self.monitoring),
            ping: cast(&flags.ping, &self.ping),
            selftest: if flags.selftest {
                Some(true)
            } else {
                None
            },
            rest: HashMap::new()
        }
    }
}

impl Into<Context> for Settings {
    fn into(self) -> Context {
        let mut ctxt = Context::new();

        ctxt.insert("redis", &self.redis.unwrap_or(false));
        ctxt.insert("postgres", &self.postgres.unwrap_or(false));
        ctxt.insert("honeycomb", &self.honeycomb.unwrap_or(false));
        ctxt.insert("selftest", &self.selftest.unwrap_or(false));
        ctxt.insert("githubci", &self.githubci.unwrap_or(false));
        ctxt.insert("monitoring", &self.monitoring.unwrap_or(false));
        ctxt.insert("ping", &self.ping.unwrap_or(false));
        ctxt.insert("version", &self.version.unwrap_or_else(|| "<unknown version>".to_string())[..]);

        ctxt
    }
}

#[derive(Default, Deserialize)]
struct PackageJson {
    dependencies: Option<HashMap<String, String>>,

    #[serde(rename = "devDependencies")]
    dev_dependencies: Option<HashMap<String, String>>,

    boltzmann: Option<Settings>,

    #[serde(flatten)]
    pub(crate) rest: HashMap<String, Value>,
}

#[derive(Deserialize)]
enum Node {
    Dir(DirSpec),
    File(FileSpec),
    Template(TemplateSpec)
}

#[derive(Deserialize, Default)]
struct When {
    feature: Option<String>,
    if_not_present: Vec<String>
}

#[derive(Deserialize)]
struct DirSpec {
    children: Vec<(String, u32, Node, Option<When>)>,
}

#[derive(Deserialize)]
struct FileSpec {
    contents: String,
}

#[derive(Deserialize)]
struct TemplateSpec {
    template_name: String
}

impl Node {
    pub fn render(self, cwd: &mut PathBuf, mode: u32, parents: &mut Vec<String>, settings: &Settings) -> Result<Option<String>> {
        match self {
            Node::Dir(spec) => render_dir(spec, cwd, mode, parents, settings),
            Node::File(spec) => Ok(Some(spec.contents)),
            Node::Template(spec) => {
                let target = parents.join("/");
                let mut context: Context = settings.clone().into();
                context.insert("filename", &target[..]);
                Ok(Some(TEMPLATES.render(&spec.template_name[..], &context)?))
            },
        }
    }
}

fn render_dir(spec: DirSpec, cwd: &mut PathBuf, mode: u32, parents: &mut Vec<String>, settings: &Settings) -> Result<Option<String>> {

    println!("entering \x1b[34m{:?}\x1b[0m;", cwd);
    if let Err(e) = std::fs::DirBuilder::new().mode(mode).create(&cwd) {
        if e.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(e.into())
        }
    }

    'next:
    for (basename, mode, node, when) in spec.children {
        if let Some(preconditions) = when {
            if let Some(feature) = preconditions.feature {
                let mapped = serde_json::to_value(settings)?;
                let has_feature = mapped.get(feature)
                    .map(|xs| xs.as_bool().unwrap_or(false))
                    .unwrap_or(false);

                if !has_feature {
                    continue
                }
            }

            let mut cloned_cwd = cwd.clone();
            for dir in preconditions.if_not_present {
                // if any of these directories exist, bail
                cloned_cwd.push(dir);
                if cloned_cwd.as_path().exists() {
                    continue 'next
                }
                cloned_cwd.pop();
            }
        }

        cwd.push(&basename[..]);
        parents.push(basename.clone());

        // failure to render is fatal.
        if let Some(data) = node.render(cwd, mode, parents, settings)? {
            let mut fd = std::fs::OpenOptions::new().create(true).truncate(true).write(true).mode(mode).open(&cwd)
                .with_context(|| format!("failed to open {:?} with mode {:?}", cwd, mode))?;

            fd.write_all(data.as_bytes())
                .with_context(|| format!("failed to write {:?}", cwd))?;
        }
        cwd.pop();
        parents.pop();
    }

    Ok(None)
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

    let exit_status = Exec::cmd("npm")
        .arg("init")
        .arg("--yes")
        .cwd(&path)
        .stdout(NullFile)
        .stderr(NullFile)
        .join()?;

    match exit_status {
        ExitStatus::Exited(0) => Ok(()),
        _ => Err(anyhow!("npm init exited with non-zero status"))
    }
}

fn main() -> std::result::Result<(), Box<dyn std::error::Error + 'static>> {
    let root_node: Node = ron::de::from_str(include_str!("dirspec.ron"))?;
    let flags = Flags::from_args();
    let mut parents = Vec::new();
    let mut cwd = flags.destination.clone();

    check_git_status(&flags)?;

    let default_settings = Settings {
        githubci: Some(true),
        monitoring: Some(true),
        ping: Some(true),
        ..Default::default()
    };

    let mut package_json = if let Some(xs) = load_package_json(&flags, default_settings.clone()) {
        xs
    } else {
        initialize_package_json(&flags.destination)
            .context("Failed to use npm to initialize the repo.")?;
        load_package_json(&flags, default_settings).unwrap()
    };

    if package_json.boltzmann.is_none() {
        return Err(anyhow!("Somehow we do not have default settings! Please file a bug.").into());
    }

    let settings = package_json.boltzmann.take().unwrap();
    let updated_settings = settings.merge_flags("the version of boltzmann".to_string(), &flags);
    root_node.render(&mut cwd, 0o777, &mut parents, &updated_settings)?;

    Ok(())
}
