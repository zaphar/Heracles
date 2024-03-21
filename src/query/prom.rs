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

use chrono::prelude::*;
use prometheus_http_query::{
    response::{Data, PromqlResult},
    Client,
};
use tracing::debug;

use crate::dashboard::PlotMeta;

use super::{DataPoint, MetricsQueryResult, QueryType, TimeSpan};

pub const FILTER_PLACEHOLDER: &'static str = "FILTERS";
pub const FILTER_COMMA_PLACEHOLDER: &'static str = ",FILTERS";
pub const FILTER_PLACEHOLDER_COMMA: &'static str = "FILTERS,";

#[derive(Debug)]
pub struct PromQueryConn<'conn> {
    source: &'conn str,
    query: &'conn str,
    span: Option<TimeSpan>,
    query_type: QueryType,
    filters: Option<&'conn HashMap<&'conn str, &'conn str>>,
    pub meta: PlotMeta,
}

impl<'conn> PromQueryConn<'conn> {
    pub fn new<'a: 'conn>(
        source: &'a str,
        query: &'a str,
        query_type: QueryType,
        meta: PlotMeta,
    ) -> Self {
        Self {
            source,
            query,
            query_type,
            meta,
            span: None,
            filters: None,
        }
    }

    pub fn with_filters(mut self, filters: &'conn HashMap<&'conn str, &'conn str>) -> Self {
        self.filters = Some(filters);
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

    fn get_query(&self) -> String {
        let first = true;
        let mut filter_string = String::new();
        debug!(filters=?self.filters, orig=?self.query, "Filters from request");
        if let Some(filters) = self.filters {
            for (k, v) in filters.iter() {
                if !first {
                    filter_string.push_str(",");
                }
                filter_string.push_str(*k);
                filter_string.push_str("=~");
                filter_string.push('"');
                filter_string.push_str(*v);
                filter_string.push('"');
            }
        }
        let mut query = self.query.to_string();
        if self.query.contains(FILTER_PLACEHOLDER_COMMA) {
            debug!("Replacing Filter comma placeholder");
            if !filter_string.is_empty() {
                filter_string.push(',');
            }
            query = query.replace(FILTER_PLACEHOLDER_COMMA, &filter_string);
        }
        if query.contains(FILTER_COMMA_PLACEHOLDER) {
            debug!("Replacing Filter comma placeholder");
            if !filter_string.is_empty() {
                let mut temp: String = ",".into();
                temp.push_str(&filter_string);
                filter_string = temp;
            }
            query = query.replace(FILTER_COMMA_PLACEHOLDER, &filter_string);
        }
        if query.contains(FILTER_PLACEHOLDER) {
            debug!("Replacing Filter placeholder");
            query = query.replace(FILTER_PLACEHOLDER, &filter_string)
        }
        query
    }

    pub async fn get_results(&self) -> anyhow::Result<PromqlResult> {
        debug!("Getting results for query");
        let client = Client::try_from(self.source)?;
        let (start, end, step_resolution) = if let Some(TimeSpan {
            end,
            duration: du,
            step_seconds,
        }) = self.span
        {
            let start = end - du;
            debug!(
                ?start,
                ?end,
                step_seconds,
                "Running Query with range values"
            );
            (start.timestamp(), end.timestamp(), step_seconds as f64)
        } else {
            let end = Utc::now();
            let start = end - chrono::Duration::minutes(10);
            debug!(
                ?start,
                ?end,
                step_seconds = 30,
                "Running Query with range values"
            );
            (start.timestamp(), end.timestamp(), 30 as f64)
        };
        //debug!(start, end, step_resolution, "Running Query with range values");
        let query = self.get_query();
        debug!(?query, "Using promql query");
        match self.query_type {
            QueryType::Range => {
                let results = client
                    .query_range(&query, start, end, step_resolution)
                    .get()
                    .await?;
                //debug!(?results, "range results");
                Ok(results)
            }
            QueryType::Scalar => Ok(client.query(&query).get().await?),
        }
    }
}

pub fn prom_to_samples(data: Data, meta: PlotMeta) -> MetricsQueryResult {
    match data {
        Data::Matrix(mut range) => MetricsQueryResult::Series(
            range
                .drain(0..)
                .map(|rv| {
                    let (metric, mut samples) = rv.into_inner();
                    (
                        metric,
                        meta.clone(),
                        samples
                            .drain(0..)
                            .map(|s| DataPoint {
                                timestamp: s.timestamp(),
                                value: s.value(),
                            })
                            .collect(),
                    )
                })
                .collect(),
        ),
        Data::Vector(mut vector) => MetricsQueryResult::Scalar(
            vector
                .drain(0..)
                .map(|iv| {
                    let (metric, sample) = iv.into_inner();
                    (
                        metric,
                        meta.clone(),
                        DataPoint {
                            timestamp: sample.timestamp(),
                            value: sample.value(),
                        },
                    )
                })
                .collect(),
        ),
        Data::Scalar(sample) => MetricsQueryResult::Scalar(vec![(
            HashMap::new(),
            meta.clone(),
            DataPoint {
                timestamp: sample.timestamp(),
                value: sample.value(),
            },
        )]),
    }
}
