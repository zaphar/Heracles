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

use super::{LogLine, LogQueryResult, QueryType, TimeSpan};

#[derive(Serialize, Deserialize, Debug)]
pub struct LogsqlResult {
    #[serde(rename = "_msg")]
    pub msg: String,
    #[serde(rename = "_stream")]
    pub stream: String,
    #[serde(rename = "_time")]
    pub time: String,
    #[serde(flatten)]
    pub fields: HashMap<String, serde_json::Value>,
}


pub fn logsql_to_sample(results: Vec<LogsqlResult>) -> LogQueryResult {
    let mut values = Vec::with_capacity(results.len());
    
    for result in results {
        let timestamp = DateTime::parse_from_rfc3339(&result.time)
            .map(|dt| dt.timestamp_nanos_opt().unwrap_or(0) as f64)
            .unwrap_or_else(|_| {
                error!("Invalid timestamp format: {}", result.time);
                0.0
            });
            
        let mut labels = HashMap::new();
        labels.insert("stream".to_string(), result.stream);
        
        for (key, value) in result.fields {
            if let Some(string_val) = value.as_str() {
                labels.insert(key, string_val.to_string());
            }
        }
        
        values.push((
            labels,
            LogLine {
                timestamp,
                line: result.msg,
            },
        ));
    }
    
    LogQueryResult::StreamInstant(values)
}


pub struct LogsqlConn<'conn> {
    url: &'conn str,
    query: &'conn str,
    span: Option<TimeSpan>,
    limit: Option<usize>,
}

const QUERY_API_PATH: &'static str = "/select/logsql/query";

impl<'conn> LogsqlConn<'conn> {
    pub fn new<'a: 'conn>(url: &'a str, query: &'a str, _query_type: QueryType) -> Self {
        Self {
            url,
            query,
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

    pub async fn get_results(&self) -> Result<Vec<LogsqlResult>> {
        let url = format!("{}{}", self.url, QUERY_API_PATH);
        let client = reqwest::Client::new();
        
        // Build form data for POST request using owned strings
        let mut form_data = vec![("query".to_string(), self.query.to_string())];
        
        if let Some(limit) = self.limit {
            form_data.push(("limit".to_string(), limit.to_string()));
        }
        
        // VictoriaLogs uses the same endpoint for both scalar and range queries
        // Time range is controlled by start/end parameters
        if let Some(span) = &self.span {
            let start = span.end - span.duration;
            form_data.push(("start".to_string(), start.to_rfc3339()));
            form_data.push(("end".to_string(), span.end.to_rfc3339()));
        }
        
        let req = client.post(url).form(&form_data);
        
        debug!(?req, "Building logsql POST reqwest client");
        debug!(?form_data, "Form data for VictoriaLogs query");

        debug!("Sending POST request");
        let response = req.send().await?;
        let text = response.text().await?;
        
        debug!("Raw response from VictoriaLogs: {}", text);
        
        let mut results = Vec::new();
        for line in text.lines() {
            if !line.trim().is_empty() {
                match serde_json::from_str::<LogsqlResult>(line) {
                    Ok(result) => results.push(result),
                    Err(e) => error!("Failed to parse LogsqlResult: {} for line: {}", e, line),
                }
            }
        }
        
        Ok(results)
    }

}