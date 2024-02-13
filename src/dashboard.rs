// Copyright 2023 Jeremy Wall
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
use std::path::Path;

use chrono::prelude::*;
use serde::Deserialize;
use serde_yaml;
use tracing::{debug, error};

use crate::query::{QueryConn, QueryType};

#[derive(Deserialize)]
pub struct Dashboard {
    pub title: String,
    pub graphs: Vec<Graph>,
}

#[derive(Deserialize)]
pub struct GraphSpan {
    pub start: DateTime<Utc>,
    pub duration: String,
    pub step_duration: String,
}

#[derive(Deserialize)]
pub struct Graph {
    pub title: String,
    pub source: String,
    pub query: String,
    // serialized with https://datatracker.ietf.org/doc/html/rfc3339
    pub span: Option<GraphSpan>,
    pub name_label: String,
    pub query_type: QueryType,
}

fn duration_from_string(duration: &str) -> Option<chrono::Duration> {
    match parse_duration::parse(duration) {
        Ok(d) => match chrono::Duration::from_std(d) {
            Ok(d) => Some(d),
            Err(e) => {
                error!(err = ?e, "specified Duration is out of bounds");
                return None;
            }
        },
        Err(e) => {
            error!(
                err = ?e,
                "Failed to parse duration"
            );
            return None;
        }
    }
}

impl Graph {
    pub fn get_query_connection<'conn, 'graph: 'conn>(&'graph self) -> QueryConn<'conn> {
        debug!(
            query = self.query,
            source = self.source,
            "Getting query connection for graph"
        );
        let mut conn = QueryConn::new(&self.source, &self.query, self.query_type.clone());
        if let Some(span) = &self.span {
            let duration = match duration_from_string(&span.duration) {
                Some(d) => d,
                None => {
                    error!("Invalid query duration not assigning span to to graph query");
                    return conn;
                }
            };
            let step_duration = match duration_from_string(&span.step_duration) {
                Some(d) => d,
                None => {
                    error!("Invalid query step resolution not assigning span to to graph query");
                    return conn;
                }
            };
            conn = conn.with_span(span.start.clone(), duration, step_duration);
        }
        conn
    }
}

pub fn read_dashboard_list(path: &Path) -> anyhow::Result<Vec<Dashboard>> {
    let f = std::fs::File::open(path)?;
    Ok(serde_yaml::from_reader(f)?)
}
