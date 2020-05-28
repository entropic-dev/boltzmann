use std::path::PathBuf;
use std::os::unix::fs::{ DirBuilderExt, OpenOptionsExt };
use std::io::prelude::*;

use serde::{ Serialize, Deserialize };
use anyhow::{ Context as ErrorContext, Result };
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

#[derive(Clone, Serialize, StructOpt)]
struct Flags {
    #[structopt(long, help = "Apply changes to destination even if there are changes")]
    force: bool, // for enemies

    #[structopt(long, help = "Apply changes to destination even if there are changes", default_value = "off")]
    redis: Option<Option<String>>,

    #[structopt(long, help = "Enable postgres", default_value = "off")]
    postgres: Option<Option<String>>,

    #[structopt(long, help = "Enable honeycomb", default_value = "off")]
    honeycomb: Option<Option<String>>,

    #[structopt(long, help = "Run the oven in self-cleaning mode.")]
    selftest: bool, // turn on boltzmann self test.

    #[structopt(long, help = "Enable GitHub actions CI", default_value = "on")]
    githubci: Option<Option<String>>,

    #[structopt(long, help = "Enable GitHub actions CI", default_value = "off")]
    monitoring: Option<Option<String>>,

    #[structopt(long, help = "Enable GitHub actions CI", default_value = "on")]
    ping: Option<Option<String>>,

    #[structopt(parse(from_os_str))]
    destination: PathBuf
}

#[derive(Deserialize)]
enum Node {
    Dir(DirSpec),
    File(FileSpec),
    Template(TemplateSpec)
}

#[derive(Deserialize)]
struct DirSpec {
    children: Vec<(String, Node, u32)>
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
    pub fn render(self, cwd: &mut PathBuf, mode: u32, parents: &mut Vec<String>, context: &mut Context) -> Result<Option<String>> {
        match self {
            Node::Dir(spec) => render_dir(spec, cwd, mode, parents, context),
            Node::File(spec) => Ok(Some(spec.contents)),
            Node::Template(spec) => {
                let target = parents.join("/");
                context.insert("filename", &target[..]);
                Ok(Some(TEMPLATES.render(&spec.template_name[..], &context)?))
            },
        }
    }
}

fn render_dir(spec: DirSpec, cwd: &mut PathBuf, mode: u32, parents: &mut Vec<String>, context: &mut Context) -> Result<Option<String>> {

    println!("entering \x1b[34m{:?}\x1b[0m;", cwd);
    if let Err(e) = std::fs::DirBuilder::new().mode(mode).create(&cwd) {
        if e.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(e.into())
        }
    }

    for (basename, node, mode) in spec.children {
        cwd.push(&basename[..]);
        parents.push(basename.clone());

        // failure to render is fatal.
        if let Some(data) = node.render(cwd, mode, parents, context)? {
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

fn load_project_settings(dir: &PathBuf) -> Result<()> {
    Ok(())
}

fn check_git_status(flags: &Flags) -> Result<()> {
    Ok(())
}

fn main() -> std::result::Result<(), Box<dyn std::error::Error + 'static>> {



    let root_node: Node = ron::de::from_str(include_str!("dirspec.ron"))?;
    let flags = Flags::from_args();
    let mut parents = Vec::new();
    let mut cwd = flags.destination.clone();

    let package_json = load_project_settings(&cwd)?;
    check_git_status(&flags)?;

    let mut context = Context::from_serialize(flags)?;

    root_node.render(&mut cwd, 0o777, &mut parents, &mut context)?;

    // the template dir does not map 1:1 with output dir
    // options set values in template rendering
    // options can imply additional post-templating npm actions

    // 2 modes:
    // initial
    // - subprocess runs npm init
    // - creates directory + file structure
    //      - create middleware.js / handlers.js / etc
    // - npm installs prereqs from flags
    // update
    // - chickens out if run on an unclean git dir w/ no force flag given
    // - ensures "boltzmann-owned" files are up-to-date
    // - npm installs or uninstalls prereqs from flags
    // - that's all, folks
    //
    // there may be room for a "ludwig validate" or "ludwig doctor" someday
    Ok(())
}
