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

class TimeseriesGraph extends HTMLElement {
    #uri;
    #width;
    #height;
    #intervalId;
    #pollSeconds;
    #end;
    #duration;
    #step_duration;
    #d3TickFormat = "~s";
    #targetNode = null;
    constructor() {
        super();
        this.#width = 800;
        this.#height = 600;
        this.#pollSeconds = 30;
        this.#targetNode = this.appendChild(document.createElement("div"));
    }

    static observedAttributes = ['uri', 'width', 'height', 'poll-seconds', 'end', 'duration', 'step-duration'];

    attributeChangedCallback(name, _oldValue, newValue) {
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
            case 'end':
                this.#end = newValue;
                break;
            case 'duration':
                this.#duration = newValue;
                break;
            case 'step-duration':
                this.#step_duration = newValue;
                break;
            case 'd3-tick-format':
                this.#d3TickFormat = newValue;
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
        this.#end = this.getAttribute('end') || null;
        this.#duration = this.getAttribute('duration') || null;
        this.#step_duration = this.getAttribute('step-duration') || null;
        this.#d3TickFormat = this.getAttribute('d3-tick-format') || this.#d3TickFormat;
        this.resetInterval()
    }

    disconnectedCallback() {
        this.stopInterval()
    }

    static elementName = "timeseries-graph";

    getTargetNode() {
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

    getUri() {
        if (this.#end && this.#duration && this.#step_duration) {
            return this.#uri + "?end=" + this.#end + "&duration=" + this.#duration + "&step_duration=" + this.#step_duration;
        } else {
            return this.#uri;
        }
    }

    async fetchData() {
        const response = await fetch(this.getUri());
        const data = await response.json();
        return data;
    }

    async updateGraph() {
        const data = await this.fetchData();
        const config = {
            legend: {
                orientation: 'h'
            }
        };
        var layout = {
            displayModeBar: false,
            responsive: true,
        };
        var traces = [];
        for (var subplot_idx in data) {
            const subplot = data[subplot_idx];
            const subplotCount = Number(subplot_idx) + 1;
            const default_yaxis = "y" + subplotCount
            if (subplot.Series) {
                // https://plotly.com/javascript/reference/scatter/
                for (const triple of subplot.Series) {
                    const labels = triple[0];
                    const meta = triple[1];
                    const yaxis = meta["named_axis"] || default_yaxis;
                    // https://plotly.com/javascript/reference/layout/yaxis/
                    layout["yaxis" + subplotCount] = {
                        anchor: yaxis,
                        tickformat: meta["d3_tick_format"] || this.#d3TickFormat
                    };
                    const series = triple[2];
                    var trace = {
                        type: "scatter",
                        mode: "lines+text",
                        x: [],
                        y: [],
                        // We always share the x axis for timeseries graphs.
                        xaxis: "x",
                        yaxis: yaxis,
                        yhoverformat: meta["d3_tick_format"],
                    };
                    const namePrefix = meta["name_prefix"];
                    const nameSuffix = meta["name_suffix"];
                    const nameLabel = meta["name_label"];
                    var name = "";
                    if (namePrefix) {
                        name = namePrefix + "-";
                    };
                    if (nameLabel && labels[nameLabel]) {
                        name = name + labels[nameLabel];
                    };
                    if (nameSuffix) {
                        name = name + " - " + nameSuffix;
                    };
                    if (name) { trace.name = name; }
                    for (const point of series) {
                        trace.x.push(new Date(point.timestamp * 1000));
                        trace.y.push(point.value);
                    }
                    traces.push(trace);
                }
            } else if (subplot.Scalar) {
                // https://plotly.com/javascript/reference/bar/
                for (const triple of subplot.Scalar) {
                    const labels = triple[0];
                    const meta = triple[1];
                    const series = triple[2];
                    var trace = {
                        type: "bar",
                        x: [],
                        y: [],
                        yaxis: yaxis,
                        yhoverformat: meta["d3_tick_format"],
                    };
                    let nameLabel = meta["name_label"];
                    if (nameLabel && labels[nameLabel]) {
                        trace.name = labels[nameLabel];
                    };
                    if (nameLabel && labels[nameLabel]) {
                        trace.x.push(labels[nameLabel]);
                    };
                    trace.y.push(series.value);
                    traces.push(trace);
                }
            }
        }
        // https://plotly.com/javascript/plotlyjs-function-reference/#plotlyreact
        Plotly.react(this.getTargetNode(), traces, layout, config);
    }
}

TimeseriesGraph.registerElement();

class SpanSelector extends HTMLElement {
    #targetNode = null;
    #endInput = null;
    #durationInput = null;
    #stepDurationInput = null;
    #updateInput = null

    constructor() {
        super();
        this.#targetNode = this.appendChild(document.createElement('div'));

        this.#targetNode.appendChild(document.createElement('span')).innerText = "end: ";
        this.#endInput = this.#targetNode.appendChild(document.createElement('input'));

        this.#targetNode.appendChild(document.createElement('span')).innerText = "duration: ";
        this.#durationInput = this.#targetNode.appendChild(document.createElement('input'));

        this.#targetNode.appendChild(document.createElement('span')).innerText = "step duration: ";
        this.#stepDurationInput = this.#targetNode.appendChild(document.createElement('input'));

        this.#updateInput = this.#targetNode.appendChild(document.createElement('button'));
        this.#updateInput.innerText = "Update";
    }

    connectedCallback() {
        const self = this;
        self.#updateInput.onclick = function(_evt) {
            self.updateGraphs()
        };
    }

    disconnectedCallback() {
        this.#updateInput.onclick = undefined;
    }

    updateGraphs() {
        for (var node of document.getElementsByTagName(TimeseriesGraph.elementName)) {
            node.setAttribute('end', this.#endInput.value);
            node.setAttribute('duration', this.#durationInput.value);
            node.setAttribute('step-duration', this.#stepDurationInput.value);
        }
    }

    static elementName = "span-selector";

    static registerElement() {
        if (!customElements.get(SpanSelector.elementName)) {
            customElements.define(SpanSelector.elementName, SpanSelector);
        }
    }
}

SpanSelector.registerElement();
