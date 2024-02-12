// Copyright 2021 Jeremy Wall
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

use prometheus_http_query::{Client, response::{PromqlResult, Data}};
use serde::{Serialize, Deserialize};
use tracing::debug;
use chrono::prelude::*;

#[derive(Deserialize, Clone)]
pub enum QueryType {
    Range,
    Scalar,
}

pub struct QueryConn<'conn> {
    source: &'conn str,
    query: &'conn str,
    query_type: QueryType,    
}

impl<'conn> QueryConn<'conn> {
    pub fn new<'a: 'conn>(source: &'a str, query: &'a str, query_type: QueryType) -> Self {
        Self {
            source,
            query,
            query_type,
        }
    }

    pub async fn get_results(&self) -> anyhow::Result<PromqlResult> {
        debug!("Getting results for query");
        let client = Client::try_from(self.source)?;
        let end = Utc::now().timestamp();
        let start = end - (60 * 10);
        let step_resolution = 10 as f64;
        match self.query_type {
            QueryType::Range => Ok(client.query_range(self.query, start, end, step_resolution).get().await?),
            QueryType::Scalar => Ok(client.query(self.query).get().await?),
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct DataPoint {
    timestamp: f64,
    value: f64,
}


#[derive(Serialize, Deserialize)]
pub enum QueryResult {
    Series(Vec<(HashMap<String, String>, Vec<DataPoint>)>),
    Scalar(Vec<(HashMap<String, String>, DataPoint)>),
}

pub fn to_samples(data: Data) -> QueryResult {
    match data {
        Data::Matrix(mut range) => {
            QueryResult::Series(range.drain(0..).map(|rv| {
                let (metric, mut samples) = rv.into_inner();
                (metric, samples.drain(0..).map(|s| {
                    DataPoint { timestamp: s.timestamp(), value: s.value() }
                }).collect())
            }).collect())
        }
        Data::Vector(mut vector) => {
            QueryResult::Scalar(vector.drain(0..).map(|iv| {
                let (metric, sample) = iv.into_inner();
                (metric, DataPoint { timestamp: sample.timestamp(), value: sample.value() })
            }).collect())
        }
        Data::Scalar(sample) => {
            QueryResult::Scalar(vec![(HashMap::new(), DataPoint { timestamp: sample.timestamp(), value: sample.value() })])
        }
    }
}
