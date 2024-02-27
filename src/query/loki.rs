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
use tracing::{debug, error};

use super::{LogLine, QueryResult, QueryType, TimeSpan};

// TODO(jwall): Should I allow non stream returns?
#[derive(Serialize, Deserialize, Debug)]
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

// Note that the value and volue types return a pair where the first item is a string but
// will in actuality always be an f64 number.
#[derive(Serialize, Deserialize, Debug)]
pub struct LokiResult {
    #[serde(alias = "metric")]
    #[serde(alias = "stream")]
    labels: HashMap<String, String>,
    /// Calculated Value returned by vector result types
    value: Option<(String, String)>,
    /// Stream of Log lines, Returned by matrix and stream result types
    values: Option<Vec<(String, String)>>,
}

#[derive(Serialize, Deserialize)]
pub struct LokiResponse {
    pub status: String,
    pub data: LokiData,
}

#[derive(Serialize, Deserialize)]
pub struct LokiData {
    #[serde(rename = "resultType")]
    result_type: ResultType,
    result: Vec<LokiResult>,
    //stats: // TODO
}

pub fn loki_to_sample(data: LokiData) -> QueryResult {
    match data.result_type {
        ResultType::Vector => {
            let mut values = Vec::with_capacity(data.result.len());
            for result in data.result {
                if let Some(value) = result.value {
                    values.push((
                        result.labels,
                        LogLine {
                            timestamp: value.0.parse::<f64>().expect("Invalid f64 type"),
                            line: value.1,
                        },
                    ));
                } else {
                    error!(
                        ?result,
                        "Invalid LokiResult: No value field when result type is {:?}",
                        data.result_type,
                    );
                }
            }
            QueryResult::StreamInstant(values)
        }
        ResultType::Matrix | ResultType::Streams => {
            let mut values = Vec::with_capacity(data.result.len());
            for result in data.result {
                if let Some(value) = result.values {
                    values.push((
                        result.labels,
                        value
                            .into_iter()
                            .map(|(timestamp, line)| LogLine {
                                timestamp: timestamp.parse::<f64>().expect("Invalid f64 type"),
                                line,
                            })
                            .collect(),
                    ));
                } else {
                    error!(
                        ?result,
                        "Invalid LokiResult: No values field when result type is {:?}",
                        data.result_type,
                    );
                }
            }
            QueryResult::Stream(values)
        }
    }
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

    pub async fn get_results(&self) -> Result<LokiResponse> {
        let url = match self.query_type {
            QueryType::Scalar => format!("{}{}", self.url, SCALAR_API_PATH),
            QueryType::Range => format!("{}{}", self.url, RANGE_API_PATH),
        };
        let client = reqwest::Client::new();
        let mut req = client.get(url).query(&[("query", self.query)]);
        debug!(?req, "Building loki reqwest client");
        if self.limit.is_some() {
            debug!(?req, "adding limit");
            req = req.query(&[("limit", &self.limit.map(|u| u.to_string()).unwrap())]);
        }
        if let QueryType::Range = self.query_type {
            debug!(?req, "Configuring span query params");
            let (since, end, step_resolution) = if let Some(span) = &self.span {
                (
                    span.duration,
                    span.end.timestamp(),
                    span.step_seconds as f64,
                )
            } else {
                let end = Utc::now();
                (chrono::Duration::minutes(10), end.timestamp(), 30 as f64)
            };
            req = req.query(&[
                ("end", &end.to_string()),
                ("since", &format!("{}s", since.num_seconds())),
                ("step", &step_resolution.to_string()),
            ]);
        }

        debug!(?req, "Sending request");
        Ok(req.send().await?.json().await?)
    }
}
