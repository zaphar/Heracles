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
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow;
use async_io::Async;
use axum::{self, extract::State, routing::*, Router};
use clap::{self, Parser};
use smol_macros::main;

mod dashboard;
mod query;
mod routes;

#[derive(clap::Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[arg(long)]
    listen: Option<std::net::SocketAddr>,
    #[arg(long)]
    config: PathBuf,
}

main! {
    async fn main(ex: &Arc<smol_macros::Executor<'_>>) -> anyhow::Result<()> {
        let args = Cli::parse();
        let config = std::sync::Arc::new(dashboard::read_dashboard_list(args.config.as_path())?);
        let router = Router::new()
            // JSON api endpoints
            .nest("/api", routes::mk_api_routes())
            // HTMX ui component endpoints
            .nest("/ui", routes::mk_ui_routes())
            .route("/", get(routes::index).with_state(config.clone()))
            .with_state(State(config.clone()));
        let socket_addr = args.listen.unwrap_or("127.0.0.1:3000".parse()?);
        // TODO(jwall): Take this from clap arguments
        let listener = Async::<TcpListener>::bind(socket_addr)?;
        smol_axum::serve(ex.clone(), listener, router).await?;
        Ok(())
    }
}
