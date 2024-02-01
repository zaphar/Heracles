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
use std::io;
use std::net::TcpListener;
use std::sync::Arc;

use async_io::Async;
use axum::{self, routing::*, Router};
use smol_macros::main;

mod routes;

main! {
    async fn main(ex: &Arc<smol_macros::Executor<'_>>) -> io::Result<()> {
        let router = Router::new()
            // JSON api endpoints
            .nest("/api", routes::mk_api_routes())
            // HTMX ui component endpoints
            .nest("/ui", routes::mk_ui_routes())
            .route("/", get(routes::index));
        
        // TODO(jwall): Take this from clap arguments
        let listener = Async::<TcpListener>::bind(([127, 0, 0, 1], 3000)).unwrap();
        smol_axum::serve(ex.clone(), listener, router).await
    }
}
