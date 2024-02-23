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
use std::path::PathBuf;
use anyhow;
use axum::{self, extract::State, routing::*, Router};
use clap::{self, Parser, ValueEnum};
use dashboard::{Dashboard, query_data};
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tracing::{error, info};
use tracing::Level;
use tracing_subscriber::FmtSubscriber;

mod dashboard;
mod query;
mod routes;

#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum)]
enum Verbosity {
    ERROR,
    WARN,
    INFO,
    DEBUG,
    TRACE,
}

#[derive(clap::Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[arg(long)]
    pub listen: Option<String>,
    #[arg(long)]
    pub config: PathBuf,
    #[arg(long, value_enum, default_value_t = Verbosity::INFO)]
    pub verbose: Verbosity,
    #[arg(long, default_value_t = false)]
    pub validate: bool,
}

async fn validate(dash: &Dashboard) -> anyhow::Result<()> {
    for graph in dash.graphs.iter() {
        let data = query_data(graph, &dash, None).await;
        if data.is_err() {
            error!(err=?data, "Invalid dashboard query or queries");
        }
        let _ = data?;
    }
    return Ok(());
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Cli::parse();
    let subscriber_builder = FmtSubscriber::builder().with_max_level(match args.verbose {
        Verbosity::ERROR => Level::ERROR,
        Verbosity::WARN => Level::WARN,
        Verbosity::INFO => Level::INFO,
        Verbosity::DEBUG => Level::DEBUG,
        Verbosity::TRACE => Level::TRACE,
    });
    tracing::subscriber::set_global_default(
        subscriber_builder.with_writer(std::io::stderr).finish(),
    )
    .expect("setting default subscriber failed");

    let config = std::sync::Arc::new(dashboard::read_dashboard_list(args.config.as_path())?);

    if args.validate {
        for dash in config.iter() {
            validate(&dash).await?;
            info!("All Queries successfully run against source");
            return Ok(());
        }
    }
    let router = Router::new()
        // JSON api endpoints
        .nest("/js", routes::mk_js_routes(config.clone()))
        .nest("/static", routes::mk_static_routes(config.clone()))
        .nest("/api", routes::mk_api_routes(config.clone()))
        // HTMX ui component endpoints
        .nest("/ui", routes::mk_ui_routes(config.clone()))
        .route("/dash/:dash_idx", get(routes::dashboard_direct))
        .route("/", get(routes::index).with_state(State(config.clone())))
        .layer(TraceLayer::new_for_http())
        .with_state(State(config.clone()));
    let socket_addr = args.listen.unwrap_or("127.0.0.1:3000".to_string());
    let listener = TcpListener::bind(socket_addr).await.expect("Unable to bind listener to address");
    axum::serve(listener, router).await?;
    Ok(())
}
