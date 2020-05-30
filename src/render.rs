use std::io::prelude::*;
use std::os::unix::fs::{ DirBuilderExt, OpenOptionsExt };
use std::path::PathBuf;

use anyhow::{ Context as ErrorContext, Result };
use serde::{ Deserialize };
use tera::{ Tera, Context };

use super::Settings;
use super::When;

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

#[derive(Deserialize)]
enum Node {
    Dir(DirSpec),
    File(FileSpec),
    Template(TemplateSpec)
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

pub fn scaffold(mut cwd: &mut PathBuf, settings: &Settings) -> Result<Option<String>> {
    let root_node: Node = ron::de::from_str(include_str!("dirspec.ron"))?;
    let mut parents = Vec::new();
    root_node.render(&mut cwd, 0o777, &mut parents, &settings)?;

    Ok(None)
}
