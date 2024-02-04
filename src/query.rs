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

pub struct QueryConn<'conn> {
    source: &'conn str,
    query: &'conn str,
}

impl<'conn> QueryConn<'conn> {
    pub fn new<'a: 'conn>(source: &'a str, query: &'a str) -> Self {
        Self {
            source,
            query,
        }
    }

    pub async fn get_results(&self) -> anyhow::Result<PromqlResult> {
        debug!("Getting results for query");
        let client = Client::try_from(self.source)?;
        Ok(client.query(self.query).get().await?)
    }
}

#[derive(Serialize, Deserialize)]
pub struct DataPoint {
    timesstamp: f64,
    value: f64,
}


#[derive(Serialize, Deserialize)]
pub enum QueryResult {
    Series(Vec<(HashMap<String, String>, Vec<DataPoint>)>),
    Scalar(DataPoint),
}

pub fn to_samples(data: Data) -> QueryResult {
    match data {
        Data::Matrix(mut range) => {
            QueryResult::Series(range.drain(0..).map(|rv| {
                let (metric, mut samples) = rv.into_inner();
                (metric, samples.drain(0..).map(|s| {
                    DataPoint { timesstamp: s.timestamp(), value: s.value() }
                }).collect())
            }).collect())
        }
        Data::Vector(mut vector) => {
            QueryResult::Series(vector.drain(0..).map(|iv| {
                let (metric, sample) = iv.into_inner();
                (metric, vec![DataPoint { timesstamp: sample.timestamp(), value: sample.value() }])
            }).collect())
        }
        Data::Scalar(sample) => {
            QueryResult::Scalar(DataPoint { timesstamp: sample.timestamp(), value: sample.value() })
        }
    }
}
