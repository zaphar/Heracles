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
use std::collections::HashMap;

use serde::{Serialize, Deserialize};
use chrono::prelude::*;

use crate::dashboard::PlotMeta;

mod loki;
mod prom;

#[derive(Deserialize, Clone, Debug)]
pub enum QueryType {
    Range,
    Scalar,
}

#[derive(Debug)]
pub struct TimeSpan {
    pub end: DateTime<Utc>,
    pub duration: chrono::Duration,
    pub step_seconds: i64,
}


#[derive(Serialize, Deserialize, Debug)]
pub struct DataPoint {
    timestamp: f64,
    value: f64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct LogLine {
    timestamp: f64,
    line: String,
}

#[derive(Serialize, Deserialize)]
pub enum QueryResult {
    Series(Vec<(HashMap<String, String>, PlotMeta, Vec<DataPoint>)>),
    Scalar(Vec<(HashMap<String, String>, PlotMeta, DataPoint)>),
    StreamInstant(Vec<(HashMap<String, String>, LogLine)>),
    Stream(Vec<(HashMap<String, String>, Vec<LogLine>)>),
}

impl std::fmt::Debug for QueryResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QueryResult::Series(v) => {
                f.write_fmt(format_args!("Series trace count = {}", v.len()))?;
                for (idx, (tags, meta, trace)) in v.iter().enumerate() {
                    f.write_fmt(format_args!(
                        "; {}: tags {:?} meta: {:?} datapoint count = {};",
                        idx,
                        tags,
                        meta,
                        trace.len()
                    ))?;
                }
            }
            QueryResult::Scalar(v) => {
                f.write_fmt(format_args!("{} traces", v.len()))?;
            }
            QueryResult::StreamInstant(v) => {
                f.write_fmt(format_args!("{} traces", v.len()))?;
            }
            QueryResult::Stream(v) => {
                f.write_fmt(format_args!("stream trace count = {}", v.len()))?;
                for (idx, (tags, trace)) in v.iter().enumerate() {
                    f.write_fmt(format_args!(
                        "; {}: tags {:?} line count = {}",
                        idx,
                        tags,
                        trace.len()
                    ))?
                }
            }
        }
        Ok(())
    }
}

pub use prom::*;
pub use loki::*;
