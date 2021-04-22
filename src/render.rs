use std::io::prelude::*;

use log::{debug, info, trace};
use owo_colors::OwoColorize;

use std::collections::HashSet;
#[cfg(not(target_os = "windows"))]
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
#[cfg(target_os = "windows")]
use std::os::windows::fs::OpenOptionsExt;

use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::{Context as ErrorContext, Result};
use serde::Deserialize;
use serde_json::Value;
use tera::{Context, Tera};

use super::Settings;
use super::When;

use pulldown_cmark::{Event, LinkType, Options, Parser, Tag};
use pulldown_cmark_to_cmark::cmark;

const TEMPLATES_DIR: include_dir::Dir = include_dir::include_dir!("templates");
const DOCS_DIR: include_dir::Dir = include_dir::include_dir!("docs/content/reference");

fn tsdoc(args: &HashMap<String, Value>) -> tera::Result<Value> {
    let page = args
        .get("page")
        .map(|xs| xs.as_str())
        .flatten()
        .ok_or_else(|| tera::Error::msg("page argument is required"))?;

    let section = args
        .get("section")
        .map(|xs| xs.as_str())
        .flatten()
        .ok_or_else(|| tera::Error::msg("section argument is required"))?;

    let file = DOCS_DIR
        .get_file(page)
        .ok_or_else(|| tera::Error::msg(format!("cannot find page \"{}\"", &page)))?;

    let contents = file
        .contents_utf8()
        .ok_or_else(|| tera::Error::msg(format!("cannot find page \"{}\"", &page)))?;

    let mut opts = Options::empty();
    opts.insert(Options::ENABLE_TABLES);
    opts.insert(Options::ENABLE_FOOTNOTES);
    opts.insert(Options::ENABLE_STRIKETHROUGH);
    opts.insert(Options::ENABLE_TASKLISTS);

    // transformations:
    // 1. slice from heading match to next heading of same level
    // 2. turn bold "Arguments" next to a list into @param <li>
    // 3. add a link to the full docs.
    let mut recording = false;
    let mut match_level = 0u32;
    let mut last: Option<String> = None;
    let mut events: Vec<_> = Parser::new_ext(contents, opts)
        .filter_map(|event| match event {
            Event::Start(Tag::Heading(level)) => {
                if recording {
                    if match_level == level {
                        recording = false;
                        None
                    } else {
                        Some(event)
                    }
                } else {
                    match_level = level;
                    last = Some(String::new());
                    None
                }
            }

            Event::End(Tag::Heading(_)) => {
                if let Some(text) = last.take() {
                    let id = if text.as_bytes().last() == Some(&b'}') {
                        if let Some(mut i) = text.find("{#") {
                            let id = text[i + 2..text.len() - 1].to_owned();
                            while i > 0 && text.as_bytes()[i - 1] == b' ' {
                                i -= 1;
                            }
                            id
                        } else {
                            slug::slugify(text)
                        }
                    } else {
                        slug::slugify(text)
                    };

                    if id == section {
                        recording = true;
                    }

                    return None;
                }

                if recording {
                    Some(event)
                } else {
                    None
                }
            }

            Event::Start(Tag::Link(_, _, _)) => {
                last = Some(String::new());
                if recording {
                    Some(Event::Start(Tag::Link(
                        LinkType::Reference,
                        "".into(),
                        "".into(),
                    )))
                } else {
                    None
                }
            }

            Event::End(Tag::Link(_, url, _)) => {
                if recording {
                    Some(Event::End(Tag::Link(LinkType::Reference, "".into(), url)))
                } else {
                    None
                }
            }

            Event::Text(ref text) | Event::Code(ref text) => {
                if let Some(v) = &mut last {
                    v.push_str(text.as_ref());
                }

                if recording {
                    Some(event)
                } else {
                    None
                }
            }

            _ => {
                if recording {
                    Some(event)
                } else {
                    None
                }
            }
        })
        .collect();

    let canonical = format!("\"https://www.boltzmann.dev/en/latest/docs/reference/{}#{}\"", &page[..page.len() - 3], section);
    events.push(Event::Start(Tag::Link(LinkType::Reference, canonical.as_str().into(), "".into())));
    events.push(Event::Text("Docs".into()));
    events.push(Event::End(Tag::Link(LinkType::Reference, canonical.as_str().into(), "".into())));

    let mut buf = String::with_capacity(1024);
    cmark(events.into_iter(), &mut buf, None).map_err(|e| tera::Error::msg(e.to_string()))?;

    Ok(buf.split("\n").collect::<Vec<_>>().join("\n * ").into())
}

lazy_static::lazy_static! {
    pub static ref TEMPLATES: Tera = {
        let mut tera = Tera::default();

        tera.register_function("tsdoc", tsdoc);

        let items: Vec<_> = TEMPLATES_DIR.find("**/*").unwrap().filter_map(|xs| {
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
    Template(TemplateSpec),
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
    template_name: String,
}

impl Node {
    pub fn render(
        self,
        cwd: &mut PathBuf,
        mode: u32,
        parents: &mut Vec<String>,
        settings: &Settings,
    ) -> Result<Option<String>> {
        match self {
            Node::Dir(spec) => render_dir(spec, cwd, mode, parents, settings),
            Node::File(spec) => Ok(Some(spec.contents)),
            Node::Template(spec) => {
                let target = parents.join("/");
                let mut context: Context = settings.clone().into();
                context.insert("filename", &target[..]);
                Ok(Some(TEMPLATES.render(&spec.template_name[..], &context)?))
            }
        }
    }
}

fn render_dir(
    spec: DirSpec,
    cwd: &mut PathBuf,
    mode: u32,
    parents: &mut Vec<String>,
    settings: &Settings,
) -> Result<Option<String>> {
    trace!("        entering {}", cwd.to_str().unwrap().blue());
    let mut db = std::fs::DirBuilder::new();

    #[cfg(not(target_os = "windows"))]
    db.mode(mode);

    if let Err(e) = db.create(&cwd) {
        if e.kind() != std::io::ErrorKind::AlreadyExists {
            return Err(e.into());
        }
    }
    let mapped = serde_json::to_value(settings)?;

    // Track files we created in prior iterations of the loop. If we created them on this run, do
    // not log the "git rm" message when skipping.
    let mut created = HashSet::new();

    'next: for (basename, mode, node, when) in spec.children {
        if let Some(preconditions) = when {
            // first, skip what we skip if they already exist...
            let mut cloned_cwd = cwd.clone();
            for dir in &preconditions.if_not_present {
                // if any of these directories exist, bail
                cloned_cwd.push(dir);
                if cloned_cwd.as_path().exists() {
                    trace!("        skipping {:?}; already exists", cloned_cwd);
                    continue 'next;
                }
                cloned_cwd.pop();
            }

            let wants_item = preconditions.are_satisfied_by(&mapped);
            if wants_item {
                trace!("        prereqs met for {}", basename.blue().bold());
            } else {
                trace!("        skipping {}", basename.strikethrough().blue());
                cwd.push(&basename[..]);
                if !created.contains(cwd.as_path()) && cwd.as_path().exists() {
                    info!(
                        "        {} left in place; `git rm` to remove files you no longer need",
                        basename.blue().bold()
                    );
                }
                cwd.pop();
                continue 'next;
            }
        }

        cwd.push(&basename[..]);
        created.insert(cwd.clone());
        parents.push(basename.clone());

        // failure to render is fatal.
        if let Some(data) = node.render(cwd, mode, parents, settings)? {
            debug!("        rendering {}", basename.bold().blue());
            let mut oo = std::fs::OpenOptions::new();

            oo.create(true).truncate(true).write(true);

            #[cfg(not(target_os = "windows"))]
            oo.mode(mode);

            let mut fd = oo
                .open(&cwd)
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
    info!("    writing boltzmann files...");
    let root_node: Node = ron::de::from_str(include_str!("dirspec.ron"))?;
    let mut parents = Vec::new();
    root_node.render(&mut cwd, 0o777, &mut parents, &settings)?;

    Ok(None)
}
