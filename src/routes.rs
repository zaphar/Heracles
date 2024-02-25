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
use std::{collections::HashMap, sync::Arc};

use axum::{
    extract::{Path, Query, State},
    response::Response,
    routing::get,
    Json, Router,
};

// https://maud.lambda.xyz/getting-started.html
use maud::{html, Markup};
use serde::{Serialize, Deserialize};
use tracing::debug;

use crate::dashboard::{Dashboard, Graph, GraphSpan, AxisDefinition, Orientation, query_data};
use crate::query::QueryResult;

type Config = State<Arc<Vec<Dashboard>>>;

#[derive(Serialize, Deserialize)]
pub struct GraphPayload {
    pub legend_orientation: Option<Orientation>,
    pub yaxes: Vec<AxisDefinition>,
    pub plots: Vec<QueryResult>,
}

pub async fn graph_query(
    State(config): Config,
    Path((dash_idx, graph_idx)): Path<(usize, usize)>,
    Query(query): Query<HashMap<String, String>>,
) -> Json<GraphPayload> {
    debug!("Getting data for query");
    let dash = config.get(dash_idx).expect("No such dashboard index");
    let graph = dash
        .graphs
        .get(graph_idx)
        .expect(&format!("No such graph in dasboard {}", dash_idx));
    let query_span = {
        if query.contains_key("end")
            && query.contains_key("duration")
            && query.contains_key("step_duration")
        {
            Some(GraphSpan {
                end: query["end"].clone(),
                duration: query["duration"].clone(),
                step_duration: query["step_duration"].clone(),
            })
        } else {
            None
        }
    };
    let plots = query_data(graph, dash, query_span).await.expect("Unable to get query results");
    Json(GraphPayload{legend_orientation: graph.legend_orientation.clone(), yaxes: graph.yaxes.clone(), plots})
}

pub fn mk_api_routes(config: Arc<Vec<Dashboard>>) -> Router<Config> {
    // Query routes
    Router::new().route(
        "/dash/:dash_idx/graph/:graph_idx",
        get(graph_query).with_state(config),
    )
}

pub fn graph_component(dash_idx: usize, graph_idx: usize, graph: &Graph) -> Markup {
    let graph_id = format!("graph-{}-{}", dash_idx, graph_idx);
    let graph_data_uri = format!("/api/dash/{}/graph/{}", dash_idx, graph_idx);
    html!(
        div {
            h2 { (graph.title) }
            @if graph.d3_tick_format.is_some() { 
                timeseries-graph uri=(graph_data_uri) id=(graph_id) d3-tick-format=(graph.d3_tick_format.as_ref().unwrap()) { }
            } @else {
                timeseries-graph uri=(graph_data_uri) id=(graph_id) { }
            }
        }
    )
}

pub async fn graph_ui(
    State(config): State<Config>,
    Path((dash_idx, graph_idx)): Path<(usize, usize)>,
) -> Markup {
    let graph = config
        .get(dash_idx)
        .expect("No such dashboard")
        .graphs
        .get(graph_idx)
        .expect("No such graph");
    graph_component(dash_idx, graph_idx, graph)
}

pub async fn dash_ui(State(config): State<Config>, Path(dash_idx): Path<usize>) -> Markup {
    // TODO(zaphar): Should do better http error reporting here.
    dash_elements(config, dash_idx)
}

fn dash_elements(config: State<Arc<Vec<Dashboard>>>, dash_idx: usize) -> maud::PreEscaped<String> {
    let dash = config.get(dash_idx).expect("No such dashboard");
    let graph_iter = dash
        .graphs
        .iter()
        .enumerate()
        .collect::<Vec<(usize, &Graph)>>();
    html!(
        h1 { (dash.title) }
        span-selector class="row-flex" {}
        @for (idx, graph) in &graph_iter {
            (graph_component(dash_idx, *idx, *graph))
        }
    )
}

pub fn mk_ui_routes(config: Arc<Vec<Dashboard>>) -> Router<Config> {
    Router::new()
        .route(
            "/dash/:dash_idx",
            get(dash_ui).with_state(State(config.clone())),
        )
        .route(
            "/dash/:dash_idx/graph/:graph_idx",
            get(graph_ui).with_state(State(config)),
        )
}

async fn index_html(config: Config, dash_idx: Option<usize>) -> Markup {
    html! {
        html {
            head {
                title { ("Heracles - Prometheus Unshackled") }
            }
            body {
                script src="/js/plotly.js" { }
                script src="/js/htmx.js" {  }
                script defer src="/js/lib.js" {  }
                link rel="stylesheet" href="/static/site.css" {  }
                (app(State(config.clone()), dash_idx).await)
            }
        }
    }
}

pub async fn index(State(config): State<Config>) -> Markup {
    index_html(config, None).await
}

pub async fn dashboard_direct(
    State(config): State<Config>,
    Path(dash_idx): Path<usize>,
) -> Markup {
    index_html(config, Some(dash_idx)).await
}

fn render_index(config: State<Arc<Vec<Dashboard>>>, dash_idx: Option<usize>) -> Markup {
    let titles = config
        .iter()
        .map(|d| d.title.clone())
        .enumerate()
        .collect::<Vec<(usize, String)>>();
    html! {
        div class="row-flex" {
            div class="flex-item-shrink" {
                // Header menu
                ul {
                    @for title in &titles {
                        li hx-push-url=(format!("/dash/{}", title.0)) hx-get=(format!("/ui/dash/{}", title.0)) hx-target="#dashboard" { (title.1) }
                    }
                }
            }
            div class="flex-item-grow" id="dashboard" {
                @if let Some(dash_idx) = dash_idx {
                    (dash_elements(config, dash_idx))
                }
            }
        }
    }
}

pub async fn app(State(config): State<Config>, dash_idx: Option<usize>) -> Markup {
    render_index(config, dash_idx)
}

pub fn javascript_response(content: &str) -> Response<String> {
    Response::builder()
        .header("Content-Type", "text/javascript")
        .body(content.to_string())
        .expect("Invalid javascript response")
}

// TODO(jwall): Should probably hook in one of the axum directory serving crates here.
pub async fn htmx() -> Response<String> {
    javascript_response(include_str!("../static/htmx.min.js"))
}

pub async fn plotly() -> Response<String> {
    javascript_response(include_str!("../static/plotly-2.27.0.min.js"))
}

pub async fn lib() -> Response<String> {
    javascript_response(include_str!("../static/lib.js"))
}

pub fn mk_js_routes(config: Arc<Vec<Dashboard>>) -> Router<Config> {
    Router::new()
        .route("/plotly.js", get(plotly))
        .route("/lib.js", get(lib))
        .route("/htmx.js", get(htmx))
        .with_state(State(config))
}

pub fn mk_static_routes(config: Arc<Vec<Dashboard>>) -> Router<Config> {
    Router::new()
        .route("/site.css", get(|| async { return include_str!("../static/site.css"); }))
        .with_state(State(config))
}

