use std::io::prelude::*;

#[cfg(not(target_os = "windows"))]
use std::os::unix::fs::{ DirBuilderExt, OpenOptionsExt };
#[cfg(target_os = "windows")]
use std::os::windows::fs::OpenOptionsExt;

use std::path::PathBuf;

use anyhow::{ Context as ErrorContext, Result };
use serde::{ Deserialize };
use tera::{ Tera, Context };

use super::Settings;
use super::When;

const TEMPLATES_DIR: include_dir::Dir = include_dir::include_dir!("templates");

lazy_static::lazy_static! {
    pub static ref TEMPLATES: Tera = {
        let mut tera = Tera::default();

        let items: Vec<_> = TEMPLATES_DIR.find("**/*.tmpl").unwrap().filter_map(|xs| {
            if let include_dir::DirEntry::File(fd) = xs {
                Some((fd.path().to_str()?, fd.contents_utf8()?))
            } else {
                None
            }
        }).collect();

        tera.add_raw_templates(items).expect("added templates");
        tera
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

    let mut db = std::fs::DirBuilder::new();

    #[cfg(not(target_os = "windows"))]
    db.mode(mode);

    if let Err(e) = db.create(&cwd) {
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
            let mut oo = std::fs::OpenOptions::new();

            oo.create(true).truncate(true).write(true);

            #[cfg(not(target_os = "windows"))]
            oo.mode(mode);

            let mut fd = oo.open(&cwd)
                .with_context(|| format!("Failed to open {:?} with mode {:?}", cwd, mode))?;

            fd.write_all(data.as_bytes())
                .with_context(|| format!("Failed to write {:?}", cwd))?;
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
