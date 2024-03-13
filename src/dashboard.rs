use std::collections::HashMap;
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

use anyhow::Result;
use chrono::prelude::*;
use chrono::Duration;
use serde::{Deserialize, Serialize};
use serde_yaml;
use tracing::{debug, error};

use crate::query::{
    loki_to_sample, prom_to_samples, LokiConn, PromQueryConn, QueryResult, QueryType,
};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlotMeta {
    name_format: Option<String>,
    fill: Option<FillTypes>,
    yaxis: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum FillTypes {
    #[serde(rename = "tonexty")]
    ToNextY,
    #[serde(rename = "tozeroy")]
    ToZeroY,
    #[serde(rename = "tonextx")]
    ToNextX,
    #[serde(rename = "tozerox")]
    ToZeroX,
    #[serde(rename = "toself")]
    ToSelf,
    #[serde(rename = "tonext")]
    ToNext,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum AxisSide {
    #[serde(rename = "right")]
    Right,
    #[serde(rename = "left")]
    Left,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AxisDefinition {
    anchor: Option<String>,
    overlaying: Option<String>,
    side: Option<AxisSide>,
    #[serde(rename = "tickformat")]
    tick_format: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct GraphSpan {
    // serialized with https://datatracker.ietf.org/doc/html/rfc3339 and special handling for 'now'
    pub end: String,
    pub duration: String,
    pub step_duration: String,
}

#[derive(Deserialize)]
pub struct Dashboard {
    pub title: String,
    pub graphs: Option<Vec<Graph>>,
    pub logs: Option<Vec<LogStream>>,
    pub span: Option<GraphSpan>,
}

#[derive(Deserialize)]
pub struct SubPlot {
    pub source: String,
    pub query: String,
    pub meta: PlotMeta,
}

#[derive(Deserialize, Serialize, Clone)]
pub enum Orientation {
    #[serde(rename = "h")]
    Horizontal,
    #[serde(rename = "v")]
    Vertical,
}

// NOTE(zapher): These two structs look repetitive but we haven't hit the rule of three yet.
// If we do then it might be time to restructure them a bit.
#[derive(Deserialize)]
pub struct Graph {
    pub title: String,
    pub legend_orientation: Option<Orientation>,
    pub yaxes: Vec<AxisDefinition>,
    pub plots: Vec<SubPlot>,
    pub span: Option<GraphSpan>,
    pub query_type: QueryType,
    pub d3_tick_format: Option<String>,
}

#[derive(Deserialize)]
pub struct LogStream {
    pub title: String,
    pub legend_orientation: Option<Orientation>,
    pub source: String,
    pub yaxes: Vec<AxisDefinition>,
    pub query: String,
    pub span: Option<GraphSpan>,
    pub limit: Option<usize>,
    pub query_type: QueryType,
}

pub async fn prom_query_data<'a>(
    graph: &Graph,
    dash: &Dashboard,
    query_span: Option<GraphSpan>,
    filters: &Option<HashMap<&'a str, &'a str>>,
) -> Result<Vec<QueryResult>> {
    let connections = graph.get_query_connections(&dash.span, &query_span, filters);
    let mut data = Vec::new();
    for conn in connections {
        data.push(prom_to_samples(
            conn.get_results().await?.data().clone(),
            conn.meta,
        ));
    }
    Ok(data)
}

pub async fn loki_query_data(
    stream: &LogStream,
    dash: &Dashboard,
    query_span: Option<GraphSpan>,
) -> Result<QueryResult> {
    let conn = stream.get_query_connection(&dash.span, &query_span);
    let response = conn.get_results().await?;
    if response.status == "success" {
        Ok(loki_to_sample(response.data))
    } else {
        // TODO(jwall): Better error handling than this
        panic!("Loki query status: {}", response.status)
    }
}

fn duration_from_string(duration_string: &str) -> Option<Duration> {
    match parse_duration::parse(duration_string) {
        Ok(d) => match Duration::from_std(d) {
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

fn graph_span_to_tuple(span: &Option<GraphSpan>) -> Option<(DateTime<Utc>, Duration, Duration)> {
    if span.is_none() {
        return None;
    }
    let span = span.as_ref().unwrap();
    let duration = match duration_from_string(&span.duration) {
        Some(d) => d,
        None => {
            error!("Invalid query duration not assigning span to to graph query");
            return None;
        }
    };
    let step_duration = match duration_from_string(&span.step_duration) {
        Some(d) => d,
        None => {
            error!("Invalid query step resolution not assigning span to to graph query");
            return None;
        }
    };
    let end = if span.end == "now" {
        Utc::now()
    } else if let Ok(end) = DateTime::parse_from_rfc3339(&span.end) {
        end.to_utc()
    } else {
        error!(?span.end, "Invalid DateTime using current time.");
        Utc::now()
    };
    Some((end, duration, step_duration))
}

impl Graph {
    pub fn get_query_connections<'conn, 'graph: 'conn>(
        &'graph self,
        graph_span: &'graph Option<GraphSpan>,
        query_span: &'graph Option<GraphSpan>,
        filters: &'graph Option<HashMap<&'graph str, &'graph str>>,
    ) -> Vec<PromQueryConn<'conn>> {
        let mut conns = Vec::new();
        for plot in self.plots.iter() {
            debug!(
                query = plot.query,
                source = plot.source,
                filters = ?filters,
                "Getting query connection for graph",
            );
            let mut conn = PromQueryConn::new(
                &plot.source,
                &plot.query,
                self.query_type.clone(),
                plot.meta.clone(),
            );
            if let Some(filters) = filters {
                debug!(?filters, "query connection with filters");
                conn = conn.with_filters(filters);
            }
            // Query params take precendence over all other settings. Then graph settings take
            // precedences and finally the dashboard settings take precendence
            if let Some((end, duration, step_duration)) = graph_span_to_tuple(query_span) {
                conn = conn.with_span(end, duration, step_duration);
            } else if let Some((end, duration, step_duration)) = graph_span_to_tuple(&self.span) {
                conn = conn.with_span(end, duration, step_duration);
            } else if let Some((end, duration, step_duration)) = graph_span_to_tuple(graph_span) {
                conn = conn.with_span(end, duration, step_duration);
            }
            conns.push(conn);
        }
        conns
    }
}

impl LogStream {
    pub fn get_query_connection<'conn, 'stream: 'conn>(
        &'stream self,
        graph_span: &'stream Option<GraphSpan>,
        query_span: &'stream Option<GraphSpan>,
    ) -> LokiConn<'conn> {
        debug!(
            query = self.query,
            source = self.source,
            "Getting query connection for log streams",
        );
        let mut conn = LokiConn::new(&self.source, &self.query, self.query_type.clone());
        // Query params take precendence over all other settings. Then graph settings take
        // precedences and finally the dashboard settings take precendence
        if let Some((end, duration, step_duration)) = graph_span_to_tuple(query_span) {
            conn = conn.with_span(end, duration, step_duration);
        } else if let Some((end, duration, step_duration)) = graph_span_to_tuple(&self.span) {
            conn = conn.with_span(end, duration, step_duration);
        } else if let Some((end, duration, step_duration)) = graph_span_to_tuple(graph_span) {
            conn = conn.with_span(end, duration, step_duration);
        }
        if let Some(limit) = self.limit {
            conn = conn.with_limit(limit);
        }
        conn
    }
}

pub fn read_dashboard_list(path: &Path) -> anyhow::Result<Vec<Dashboard>> {
    let f = std::fs::File::open(path)?;
    Ok(serde_yaml::from_reader(f)?)
}
