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
class TimeseriesGraph extends HTMLElement {
    #uri;
    #width;
    #height;
    #intervalId;
    #pollSeconds;
    #label;
    #targetNode = null;
    constructor() {
        super();
        this.#width = 800;
        this.#height = 600;
        this.#pollSeconds = 30;
        this.#targetNode = this.appendChild(document.createElement("div"));
    }

    static observedAttributes = ['uri', 'width', 'height', 'poll-seconds'];

    attributeChanged(name, _oldValue, newValue) {
        switch (name) {
           case 'uri':
                this.#uri = newValue;
                break;
           case 'width':
                this.#width = newValue;
                break;
           case 'height':
                this.#height = newValue;
                break;
           case 'poll-seconds':
                this.#pollSeconds = newValue;
                break;
           case 'label':
                this.#label = newValue;
                break;
           default: // do nothing;
                break;
        }
        this.resetInterval();
    }

    connectedCallback() {
        this.#uri = this.getAttribute('uri') || this.#uri;
        this.#width = this.getAttribute('width') || this.#width;
        this.#height = this.getAttribute('height') || this.#height;
        this.#pollSeconds = this.getAttribute('poll-seconds') || this.#pollSeconds;
        this.#label = this.getAttribute('label') || null;
        this.resetInterval()
    }

    disconnectedCallback() {
        this.stopInterval()
    }

    static elementName = "timeseries-graph";

    getTargetNode() {
        console.log("targetNode: ", this.#targetNode);
        return this.#targetNode;
    }
   
    stopInterval() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
            this.#intervalId = null;
        }
    }
    
    resetInterval() {
        this.stopInterval()
        if (this.#uri) {
            this.updateGraph();
        }
        this.#intervalId = setInterval(() => this.updateGraph(), 1000 * this.#pollSeconds);
    }

    static registerElement() {
        if (!customElements.get(TimeseriesGraph.elementName)) {
            customElements.define(TimeseriesGraph.elementName, TimeseriesGraph);
        }
    }
    
    async fetchData() {
        const response = await fetch(this.#uri);
        const data = await response.json();
        return data;
    }

    async updateGraph() {
        const data = await this.fetchData();
        if (data.Series) {
            // https://plotly.com/javascript/reference/scatter/
            var traces = [];
            for (const pair of data.Series) {
                const series = pair[1];
                const labels = pair[0];
                var trace = {
                    type: "scatter",
                    mode: "lines+text",
                    x: [],
                    y: []
                };
                console.log("labels: ", labels, this.#label);
                if (labels[this.#label]) {
                    trace.name = labels[this.#label];
                };
                for (const point of series) {
                    trace.x.push(point.timestamp);
                    trace.y.push(point.value);
                }
                traces.push(trace);
            }
            console.log("Traces: ", traces);
            // https://plotly.com/javascript/plotlyjs-function-reference/#plotlyreact
            Plotly.react(this.getTargetNode(), traces,
                {
                    legend: {
                        orientation: 'h'
                    }
                },
                {
                    displayModeBar: false,
                    responsive: true
                });
        } else if (data.Scalar) {
            // https://plotly.com/javascript/reference/bar/
            console.log("scalar data: ", data.Scalar);
            var traces = [];
            for (const pair of data.Scalar) {
                const series = pair[1];
                const labels = pair[0];
                var trace = {
                    type: "bar",
                    x: [],
                    y: []
                };
                console.log("labels: ", labels, this.#label);
                if (labels[this.#label]) {
                    trace.x.push(labels[this.#label]);
                };
                trace.y.push(series.value);
                traces.push(trace);
            }
            console.log("Traces: ", traces);
            Plotly.react(this.getTargetNode(), traces,
                {
                    legend: {
                        orientation: 'h'
                    }
                },
                {
                    displayModeBar: false,
                    responsive: true
                });
        }
    }
}

TimeseriesGraph.registerElement();
