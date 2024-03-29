#![allow(clippy::option_option)]

use std::collections::HashMap;
use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::{self, Value};
use tera::Context;

use super::Flags;

#[derive(Deserialize, Default)]
pub struct When {
    #[serde(default)]
    pub(crate) all_of: Vec<String>,
    #[serde(default)]
    pub(crate) none_of: Vec<String>,
    #[serde(default)]
    pub(crate) if_not_present: Vec<String>,
    #[serde(default)]
    pub(crate) any_of: Vec<String>,
}

impl When {
    /// Returns true if the passed-in settings meet the conditions described by the When.
    /// Does not consider `if_not_present` because the test for presence varies depending
    /// on what the spec is for: files vs runscripts.
    pub fn are_satisfied_by(&self, settings: &serde_json::Value) -> bool {
        let false_sentinel = Value::Bool(false);

        let has_a_prereq = if !self.all_of.is_empty() {
            self.all_of.iter().all(|feature| {
                let has_feature = settings.get(feature).unwrap_or(&false_sentinel);
                has_feature.as_bool().unwrap_or(false)
            })
        } else {
            true
        } && if !self.any_of.is_empty() {
            self.any_of.iter().any(|feature| {
                let has_feature = settings.get(feature).unwrap_or(&false_sentinel);
                has_feature.as_bool().unwrap_or(false)
            })
        } else {
            true
        };

        let has_no_exclusions = !self.none_of.iter().any(|feature| {
            let has_feature = settings.get(feature).unwrap_or(&false_sentinel);
            has_feature.as_bool().unwrap_or(false)
        });

        has_a_prereq && has_no_exclusions
    }
}

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct Settings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) version: Option<String>,

    #[serde(skip_serializing)]
    pub(crate) node_version: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) csrf: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) staticfiles: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) esbuild: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) githubci: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) honeycomb: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) jwt: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) livereload: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) oauth: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) ping: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) postgres: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) redis: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) selftest: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) status: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) templates: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) typescript: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) volta: Option<bool>,

    #[serde(flatten)]
    pub(crate) rest: HashMap<String, Value>,
}

impl Settings {
    pub fn merge_flags(&self, version: String, node_version: String, flags: &Flags) -> Settings {
        // TODO: This is becoming horrifying.
        let cast = |xs: &Option<Option<Flipper>>,
                    default: &Option<bool>,
                    set_by_group: bool|
         -> Option<bool> {
            if flags.selftest || set_by_group {
                return Some(true);
            }
            match xs {
                Some(None) => Some(true),                // e.g., --postgres
                Some(Some(Flipper::On)) => Some(true),   // e.g., --postgres=on
                Some(Some(Flipper::Off)) => Some(false), // e.g., --postgres=off
                None => default.map(|xs| xs),
            }
        };

        let is_typescript = match &flags.typescript {
            Some(None) => true,
            Some(Some(Flipper::On)) => true,
            Some(Some(Flipper::Off)) => false,
            None => self.typescript.unwrap_or(false),
        };

        let is_volta = match &flags.volta {
            Some(None) => true,
            Some(Some(Flipper::On)) => true,
            Some(Some(Flipper::Off)) => false,
            None => self.volta.unwrap_or(false),
        };

        Settings {
            // website features, grouped
            csrf: cast(&flags.csrf, &self.csrf, flags.all || flags.website),
            staticfiles: cast(
                &flags.staticfiles,
                &self.staticfiles,
                flags.all || flags.website,
            ),
            esbuild: cast(&flags.esbuild, &self.esbuild, flags.all || flags.website),
            jwt: cast(&flags.jwt, &self.jwt, flags.all || flags.website),
            livereload: cast(
                &flags.livereload,
                &self.livereload,
                flags.all || flags.website,
            ),
            oauth: cast(&flags.oauth, &self.oauth, flags.all || flags.website),
            ping: cast(&flags.ping, &self.ping, flags.all || flags.website),
            status: cast(&flags.status, &self.status, flags.all || flags.website),
            templates: cast(
                &flags.templates,
                &self.templates,
                flags.all || flags.website,
            ),

            // non-website features
            githubci: cast(&flags.githubci, &self.githubci, flags.all),
            honeycomb: cast(&flags.honeycomb, &self.honeycomb, flags.all),
            postgres: cast(&flags.postgres, &self.postgres, flags.all),
            redis: cast(&flags.redis, &self.redis, flags.all),

            // oddballs:
            typescript: if is_typescript { Some(true) } else { None },
            version: Some(version),
            node_version: Some(node_version),
            volta: if is_volta { Some(true) } else { None},

            selftest: if flags.selftest { Some(true) } else { None },
            rest: HashMap::new(),
        }
    }

    pub fn features(&self) -> Vec<&str> {
        let mut features = vec![];
        // I'm fairly horrified by this.
        if self.csrf.unwrap_or(false) {
            features.push("csrf");
        }
        if self.staticfiles.unwrap_or(false) {
            features.push("staticfiles");
        }
        if self.esbuild.unwrap_or(false) {
            features.push("esbuild");
        }
        if self.githubci.unwrap_or(false) {
            features.push("githubci");
        }
        if self.honeycomb.unwrap_or(false) {
            features.push("honeycomb");
        }
        if self.jwt.unwrap_or(false) {
            features.push("jwt");
        }
        if self.livereload.unwrap_or(false) {
            features.push("livereload");
        }
        if self.oauth.unwrap_or(false) {
            features.push("oauth");
        }
        if self.ping.unwrap_or(false) {
            features.push("ping");
        }
        if self.postgres.unwrap_or(false) {
            features.push("postgres");
        }
        if self.redis.unwrap_or(false) {
            features.push("redis");
        }
        if self.status.unwrap_or(false) {
            features.push("status");
        }
        if self.templates.unwrap_or(false) {
            features.push("templates");
        }
        if self.typescript.unwrap_or(false) {
            features.push("typescript");
        }
        // In case we have some bad people who don't alphabetize the above.
        features.sort_unstable();

        // Oddball is last.
        if self.selftest.unwrap_or(false) {
            features.push("selftest");
        }

        features
    }
}

impl fmt::Display for Settings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.features().join(", "))
    }
}

impl From<Settings> for Context {
    fn from(settings: Settings) -> Self {
        let mut ctxt = Context::new();

        ctxt.insert("staticfiles", &settings.staticfiles.unwrap_or(false));
        ctxt.insert("csrf", &settings.csrf.unwrap_or(false));
        ctxt.insert("githubci", &settings.githubci.unwrap_or(false));
        ctxt.insert("honeycomb", &settings.honeycomb.unwrap_or(false));
        ctxt.insert("esbuild", &settings.esbuild.unwrap_or(false));
        ctxt.insert("jwt", &settings.jwt.unwrap_or(false));
        ctxt.insert("livereload", &settings.livereload.unwrap_or(false));
        ctxt.insert("oauth", &settings.oauth.unwrap_or(false));
        ctxt.insert("ping", &settings.ping.unwrap_or(false));
        ctxt.insert("postgres", &settings.postgres.unwrap_or(false));
        ctxt.insert("redis", &settings.redis.unwrap_or(false));
        ctxt.insert("status", &settings.status.unwrap_or(false));
        ctxt.insert("templates", &settings.templates.unwrap_or(false));
        ctxt.insert("typescript", &settings.typescript.unwrap_or(false));
        ctxt.insert("selftest", &settings.selftest.unwrap_or(false));
        ctxt.insert(
            "version",
            &settings
                .version
                .unwrap_or_else(|| "<unknown version>".to_string())[..],
        );
        ctxt.insert("node_version", &settings.node_version.unwrap());

        ctxt
    }
}

#[derive(Clone, Serialize, Deserialize, clap::ArgEnum, Debug)]
pub enum Flipper {
    Off,
    On,
}

impl From<bool> for Flipper {
    fn from(v: bool) -> Self {
        if v {
            Flipper::On
        } else {
            Flipper::Off
        }
    }
}

impl std::str::FromStr for Flipper {
    type Err = Box<dyn std::error::Error + 'static + Send + Sync>;

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

            _ => return Err(anyhow::anyhow!("This is not a valid feature flag value.").into()),
        })
    }
}
