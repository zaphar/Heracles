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

function getCssVariableValue(variableName) {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName);
}

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
    #menuContainer = null;
    #filterSelectElements = {};
    #filterLabels = {};
    #filteredLabelSets = {};
    constructor() {
        super();
        this.#width = 800;
        this.#height = 600;
        this.#pollSeconds = 30;
        this.#menuContainer = this.appendChild(document.createElement('div'));
        // TODO(jwall): These should probably be done as template clones so we have less places
        // to look for class attributes.
        this.#menuContainer.setAttribute("class", "row-flex");
        this.#targetNode = this.appendChild(document.createElement("div"));
    }

    static observedAttributes = ['uri', 'width', 'height', 'poll-seconds', 'end', 'duration', 'step-duration', 'd3-tick-format'];

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
        this.reset();
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
        var self = this;
        this.reset();
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

    reset(updateOnly) {
        var self = this;
        self.stopInterval()
        self.fetchData().then((data) => {
            if (!updateOnly) {
                self.getLabelsForData(data);
                self.buildFilterMenu();
            }
            self.updateGraph(data).then(() => {
                self.#intervalId = setInterval(() => self.updateGraph(), 1000 * self.#pollSeconds);
            });
        });
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
        // TODO(zaphar): Can we do some massaging on these
        // to get the full set of labels and possible values?
        const response = await fetch(this.getUri());
        const data = await response.json();
        return data;
    }

    formatName(meta, labels) {
      var name = "";
      const formatter = meta.name_format
      if (formatter) {
          name = eval(formatter);
      } else {
          var names = [];
          for (const value of labels) {
              names.push(value);
          }
          name = names.join(" ");
      }
      return name;
    }

    populateFilterData(labels) {
        for (var key in labels) {
            const label = this.#filterLabels[key];
            if (label) {
                if (!label.includes(labels[key])) {
                    this.#filterLabels[key].push(labels[key]);
                }
            } else {
                this.#filterLabels[key] = [labels[key]];
            }
        }
    }

    buildSelectElement(key) {
        var id = key + "-select" + Math.random();
        const element = document.createElement("div");
        const label = document.createElement("label");
        label.innerText = key + ": ";
        label.setAttribute("for", id);
        element.appendChild(label);
        const select = document.createElement("select");
        select.setAttribute("name", id);
        select.setAttribute("multiple", true);
        const optElement = document.createElement("option");
        const optValue = "Select " + key;
        optElement.innerText = optValue;
        select.appendChild(optElement);
        for (var opt of this.#filterLabels[key]) {
            const optElement = document.createElement("option");
            optElement.setAttribute("value", opt);
            optElement.setAttribute("selected", true);
            optElement.innerText = opt;
            select.appendChild(optElement);
        }
       
        var self = this;
        select.onchange = function(evt) {
            evt.stopPropagation();
            var filteredValues = [];
            for (var opt of evt.target.selectedOptions) {
                filteredValues.push(opt.getAttribute("value"));
            }
            self.#filteredLabelSets[key] = filteredValues;
            self.reset(true);
        };
        element.appendChild(select);
        return element;
    }

    buildFilterMenu() {
        // We need to maintain a stable order for these
        var children = [];
        for (var key of Object.keys(this.#filterLabels).sort()) {
            const element = this.#filterSelectElements[key] || this.buildSelectElement(key);
            children.push(element);
        }
        this.#menuContainer.replaceChildren(...children);
    }

    getLabelsForData(data) {
        for (var subplot of data) {
            if (subplot.Series) {
                for (const triple of subplot.Series) {
                    const labels = triple[0];
                    this.populateFilterData(labels);
                }
            }
            if (subplot.Scalar) {
                for (const triple of subplot.Scalar) {
                    const labels = triple[0];
                    this.populateFilterData(labels);
                }
            }
        }
    }

    async updateGraph(maybeData) {
        var data = maybeData;
        if (!data) {
            data = await this.fetchData();
        }
        const config = {
            legend: {
                orientation: 'h'
            }
        };
        var layout = {
            displayModeBar: false,
            responsive: true,
            plot_bgcolor: getCssVariableValue('--paper-background-color').trim(),
            paper_bgcolor: getCssVariableValue('--paper-background-color').trim(),
            font: {
                color: getCssVariableValue('--text-color').trim()
            },
            xaxis: {
                gridcolor: getCssVariableValue("--accent-color")
            }
        };
        var traces = [];
        for (var subplot_idx in data) {
            const subplot = data[subplot_idx];
            const subplotCount = Number(subplot_idx) + 1;
            const default_yaxis = "y" + subplotCount
            if (subplot.Series) {
                // https://plotly.com/javascript/reference/scatter/
                loopSeries: for (const triple of subplot.Series) {
                    const labels = triple[0];
                    for (var label in labels) {
                        var show = this.#filteredLabelSets[label];
                        if (show && !show.includes(labels[label])) {
                            continue loopSeries;
                        }
                    }
                    const meta = triple[1];
                    const yaxis = meta["named_axis"] || default_yaxis;
                    // https://plotly.com/javascript/reference/layout/yaxis/
                    layout["yaxis" + subplotCount] = {
                        anchor: yaxis,
                        gridcolor: getCssVariableValue("--accent-color"),
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
                    var name = this.formatName(meta, labels);
                    if (name) { trace.name = name; }
                    for (const point of series) {
                        trace.x.push(new Date(point.timestamp * 1000));
                        trace.y.push(point.value);
                    }
                    traces.push(trace);
                }
            } else if (subplot.Scalar) {
                // https://plotly.com/javascript/reference/bar/
                layout["yaxis"] = {
                    tickformat: this.#d3TickFormat,
                    gridcolor: getCssVariableValue("--accent-color")
                };
                loopScalar: for (const triple of subplot.Scalar) {
                    const labels = triple[0];
                    for (var label in labels) {
                        var show = this.#filteredLabelSets[label];
                        if (show && !show.includes(labels[label])) {
                            continue loopScalar;
                        }
                    }
                    const meta = triple[1];
                    const series = triple[2];
                    var trace = {
                        type: "bar",
                        x: [],
                        y: [],
                        yhoverformat: meta["d3_tick_format"],
                    };
                    var name = this.formatName(meta, labels);
                    if (name) { trace.name = name; }
                    trace.y.push(series.value);
                    trace.x.push(trace.name);
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
        // TODO(jwall): We should probably show a loading indicator of some kind.
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
