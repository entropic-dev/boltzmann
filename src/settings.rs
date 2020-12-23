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
        } else if !self.any_of.is_empty() {
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

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) csrf: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) staticfiles: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) esbuild: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) esm: Option<bool>,

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

    #[serde(flatten)]
    pub(crate) rest: HashMap<String, Value>,
}

impl Settings {
    pub fn merge_flags(&self, version: String, flags: &Flags) -> Settings {
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

        // ESM is the odd one:
        let is_esm = match &flags.esm {
            Some(None) => true,
            Some(Some(Flipper::On)) => true,
            Some(Some(Flipper::Off)) => false,
            None => self.esm.unwrap_or(false),
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
            typescript: cast(&flags.typescript, &self.typescript, false),
            version: Some(version),
            esm: if is_esm { Some(true) } else { None },

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
        if self.esm.unwrap_or(false) {
            features.push("esm");
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

impl Into<Context> for Settings {
    fn into(self) -> Context {
        let mut ctxt = Context::new();

        ctxt.insert("staticfiles", &self.staticfiles.unwrap_or(false));
        ctxt.insert("csrf", &self.csrf.unwrap_or(false));
        ctxt.insert("githubci", &self.githubci.unwrap_or(false));
        ctxt.insert("honeycomb", &self.honeycomb.unwrap_or(false));
        ctxt.insert("esbuild", &self.esbuild.unwrap_or(false));
        ctxt.insert("esm", &self.esm.unwrap_or(false));
        ctxt.insert("jwt", &self.jwt.unwrap_or(false));
        ctxt.insert("livereload", &self.livereload.unwrap_or(false));
        ctxt.insert("oauth", &self.oauth.unwrap_or(false));
        ctxt.insert("ping", &self.ping.unwrap_or(false));
        ctxt.insert("postgres", &self.postgres.unwrap_or(false));
        ctxt.insert("redis", &self.redis.unwrap_or(false));
        ctxt.insert("status", &self.status.unwrap_or(false));
        ctxt.insert("templates", &self.templates.unwrap_or(false));
        ctxt.insert("typescript", &self.typescript.unwrap_or(false));
        ctxt.insert("selftest", &self.selftest.unwrap_or(false));
        ctxt.insert(
            "version",
            &self
                .version
                .unwrap_or_else(|| "<unknown version>".to_string())[..],
        );

        ctxt
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub enum Flipper {
    Off,
    On,
}

impl Into<bool> for Flipper {
    fn into(self) -> bool {
        match self {
            Flipper::On => true,
            Flipper::Off => false,
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

            _ => return Err(anyhow::anyhow!("This is not a valid feature flag value.").into()),
        })
    }
}
