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
use std::path::Path;

use serde::Deserialize;
use serde_yaml;
use tracing::debug;

use crate::query::{QueryConn, QueryType};

#[derive(Deserialize)]
pub struct Dashboard {
    pub title: String,
    pub graphs: Vec<Graph>,
}

#[derive(Deserialize)]
pub struct Graph {
    pub title: String,
    pub source: String,
    pub query: String,
    pub name_label: String,
    pub query_type: QueryType,
}

impl Graph {
    pub fn get_query_connection<'conn, 'graph: 'conn>(&'graph self) -> QueryConn<'conn> {
        debug!(query=self.query, source=self.source, "Getting query connection for graph");
        QueryConn::new(&self.source, &self.query, self.query_type.clone())
    }
}

pub fn read_dashboard_list(path: &Path) -> anyhow::Result<Vec<Dashboard>> {
    let f = std::fs::File::open(path)?;
    Ok(serde_yaml::from_reader(f)?)
}
