// Copyright 2024 Jeremy Wall
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
use std::collections::HashMap;

use anyhow::Result;
use chrono::prelude::*;
use reqwest;
use serde::{Deserialize, Serialize};

use super::{QueryType, TimeSpan};

// TODO(jwall): Should I allow non stream returns?
#[derive(Serialize, Deserialize)]
pub enum ResultType {
    /// Returned by query endpoints
    #[serde(rename = "vector")]
    Vector,
    /// Returned by query_range endpoints
    #[serde(rename = "matrix")]
    Matrix,
    /// Returned by query and query_range endpoints
    #[serde(rename = "streams")]
    Streams,
}

#[derive(Serialize, Deserialize)]
pub struct LokiResult {
    #[serde(alias = "metric")]
    #[serde(alias = "stream")]
    labels: Option<HashMap<String, String>>,
    value: Option<(i64, String)>,
    /// The only version that returns log lines
    values: Option<Vec<(f64, String)>>,
}

#[derive(Serialize, Deserialize)]
pub struct LokiData {
    result_type: ResultType,
    result: Vec<LokiResult>,
    //stats: // TODO
}

#[derive(Serialize, Deserialize)]
pub struct LokiResponse {
    status: String,
    data: LokiData,
}

pub struct LokiConn<'conn> {
    url: &'conn str,
    query: &'conn str,
    span: Option<TimeSpan>,
    query_type: QueryType,
    limit: Option<usize>,
}

const SCALAR_API_PATH: &'static str = "/loki/api/v1/query";
const RANGE_API_PATH: &'static str = "/loki/api/v1/query_range";

impl<'conn> LokiConn<'conn> {
    pub fn new<'a: 'conn>(url: &'a str, query: &'a str, query_type: QueryType) -> Self {
        Self {
            url,
            query,
            query_type,
            span: None,
            limit: None,
        }
    }

    pub fn with_limit(mut self, limit: usize) -> Self {
        self.limit = Some(limit);
        self
    }

    pub fn with_span(
        mut self,
        end: DateTime<Utc>,
        duration: chrono::Duration,
        step: chrono::Duration,
    ) -> Self {
        self.span = Some(TimeSpan {
            end,
            duration,
            step_seconds: step.num_seconds(),
        });
        self
    }

    pub async fn get_results(&self) -> Result<LokiResult> {
        let url = match self.query_type {
            QueryType::Scalar => format!("{}{}", self.url, SCALAR_API_PATH),
            QueryType::Range => format!("{}{}", self.url, RANGE_API_PATH),
        };
        let client = reqwest::Client::new();
        let mut req = client.get(url).query(&["query", self.query]);
        if self.limit.is_some() {
            req = req.query(&["limit", &self.limit.map(|u| u.to_string()).unwrap()]);
        }
        if let QueryType::Range = self.query_type {
            let (start, end, step_resolution) = if let Some(span) = &self.span {
                let start = span.end - span.duration;
                (start.timestamp(), span.end.timestamp(), span.step_seconds as f64)
            } else {
                let end = Utc::now();
                let start = end - chrono::Duration::minutes(10);
                (start.timestamp(), end.timestamp(), 30 as f64)
            };
            req = req.query(&["end", &end.to_string()]);
            req = req.query(&["since", &start.to_string()]);
            req = req.query(&["step", &step_resolution.to_string()]);
        }

        Ok(req.send().await?.json().await?)
    }
}
