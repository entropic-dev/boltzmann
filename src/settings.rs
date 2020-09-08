#![allow(clippy::option_option)]

use std::collections::HashMap;
use std::fmt;

use serde::{ Serialize, Deserialize };
use serde_json::{ Value, self };
use tera::Context;

use super::Flags;

#[derive(Deserialize, Default)]
pub struct When {
    pub(crate) feature: Option<String>,
    pub(crate) if_not_present: Vec<String>
}

#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct Settings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) version: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) redis: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) postgres: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) honeycomb: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) selftest: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) githubci: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) templates: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) status: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) ping: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) jwt: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) csrf: Option<bool>,

    #[serde(flatten)]
    pub(crate) rest: HashMap<String, Value>,
}

impl Settings {
    pub fn merge_flags(&self, version: String, flags: &Flags) -> Settings {
        // TODO: This is becoming horrifying.
        let cast = |xs: &Option<Option<Flipper>>, default: &Option<bool>, set_by_group: bool| -> Option<bool> {
            if flags.selftest || set_by_group {
                return Some(true)
            }
            match xs {
                Some(None) => Some(true),                       // e.g., --postgres
                Some(Some(Flipper::On)) => Some(true),          // e.g., --postgres=on
                Some(Some(Flipper::Off)) => Some(false),        // e.g., --postgres=off
                None => default.map(|xs| xs)
            }
        };

        Settings {
            version: Some(version),
            csrf: cast(&flags.csrf, &self.csrf, flags.all || flags.website),
            githubci: cast(&flags.githubci, &self.githubci, flags.all),
            honeycomb: cast(&flags.honeycomb, &self.honeycomb, flags.all),
            jwt: cast(&flags.jwt, &self.jwt, flags.all || flags.website),
            ping: cast(&flags.ping, &self.ping, flags.all || flags.website),
            postgres: cast(&flags.postgres, &self.postgres, flags.all),
            redis: cast(&flags.redis, &self.redis, flags.all),
            status: cast(&flags.status, &self.status, flags.all || flags.website),
            templates: cast(&flags.templates, &self.templates, flags.all || flags.website),
            selftest: if flags.selftest {
                Some(true)
            } else {
                None
            },
            rest: HashMap::new()
        }
    }
}

impl fmt::Display for Settings {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut features = vec![];
        // I'm fairly horrified by this.
        if self.csrf.unwrap_or(false) {
            features.push("csrf");
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
        // In case we have some bad people who don't alphabetize the above.
        features.sort_unstable();

        // Oddball is last.
        if self.selftest.unwrap_or(false) {
            features.push("selftest");
        }

        write!(f, "{}", features.join(", "))
    }
}

impl Into<Context> for Settings {
    fn into(self) -> Context {
        let mut ctxt = Context::new();

        ctxt.insert("csrf", &self.csrf.unwrap_or(false));
        ctxt.insert("githubci", &self.githubci.unwrap_or(false));
        ctxt.insert("honeycomb", &self.honeycomb.unwrap_or(false));
        ctxt.insert("jwt", &self.jwt.unwrap_or(false));
        ctxt.insert("ping", &self.ping.unwrap_or(false));
        ctxt.insert("postgres", &self.postgres.unwrap_or(false));
        ctxt.insert("redis", &self.redis.unwrap_or(false));
        ctxt.insert("status", &self.status.unwrap_or(false));
        ctxt.insert("templates", &self.templates.unwrap_or(false));
        ctxt.insert("selftest", &self.selftest.unwrap_or(false));
        ctxt.insert("version", &self.version.unwrap_or_else(|| "<unknown version>".to_string())[..]);

        ctxt
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub enum Flipper {
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
