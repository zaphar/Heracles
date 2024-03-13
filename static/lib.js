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

/**
 * Map ansi terminal codes to html color codes.
 * @param {string} line
 */
function ansiToHtml(line) {
    const ansiToHtmlMap = {
        // Map ANSI color codes to HTML color names or hex values
        // We don't necessarily handle all the colors but this is enough to start.
        "30": "black",
        "31": "red",
        "32": "green",
        "33": "yellow",
        "34": "blue",
        "35": "magenta",
        "36": "cyan",
        "37": "white",
        "39": "initial"
    };

    // NOTE(zaphar): Yes this is gross and I should really do a better parser but I'm lazy.
    // Replace ANSI codes with HTML span elements styled with the corresponding color
    return line.replace(/\x1b\[([0-9;]*)m/g, (match, p1) => {
        const parts = p1.split(';'); // ANSI codes can be compounded, e.g., "1;31" for bold red
        let styles = '';
        for (let part of parts) {
            if (ansiToHtmlMap[part]) {
                // If the code is a color, map it to a CSS color
                styles += `color: ${ansiToHtmlMap[part]};`;
            }
            // TODO(zaphar): Add more conditions here to handle other styles like bold or underline?
        }
        return styles ? `<span style="${styles}">` : '</span>';
    }) + '</span>';
}

/**
 * Get's a css variable's value from the document.
 * @param {string} variableName - Name of the variable to get `--var-name`
 * @returns string
 */
function getCssVariableValue(variableName) {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName);
}

/**
 * Custom element for showing a plotly graph.
 *
 * @extends HTMLElement
 */
export class GraphPlot extends HTMLElement {
    /** @type {?string} */
    #uri;
    /** @type {?boolean} */
    #allowUriFilters;
    /** @type {?number} */
    #width;
    /** @type {?number} */
    #height;
    /** @type {?number} */
    #intervalId;
    /** @type {?number} */
    #pollSeconds;
    /** @type {?string} */
    #end;
    /** @type {?number} */
    #duration;
    /** @type {?string} */
    #step_duration;
    /** @type {?string} */
    #d3TickFormat = "~s";
    /** @type {?HTMLDivElement} */
    #targetNode = null;
    /** @type {?HTMLElement} */
    #menuContainer = null;
    /** @type {Object<string, HTMLSelectElement>} */
    #filterSelectElements = {};
    /** @type {Object<string, Array<string>>} */
    #filterLabels = {};
    /** @type {Object<string, Array<string>>} */
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

    static observedAttributes = ['uri', 'width', 'height', 'poll-seconds', 'end', 'duration', 'step-duration', 'd3-tick-format', 'allow-uri-filter'];

    /**
     * Callback for attributes changes.
     *
     * @param {string} name       - The name of the attribute.
     * @param {?string} _oldValue - The old value for the attribute
     * @param {?string} newValue  - The new value for the attribute
     */
    attributeChangedCallback(name, _oldValue, newValue) {
        switch (name) {
            case 'uri':
                this.#uri = newValue;
                break;
            case 'width':
                this.#width = Number(newValue);
                break;
            case 'height':
                this.#height = Number(newValue);
                break;
            case 'poll-seconds':
                this.#pollSeconds = Number(newValue);
                break;
            case 'end':
                this.#end = newValue;
                break;
            case 'duration':
                this.#duration = Number(newValue);
                break;
            case 'step-duration':
                this.#step_duration = newValue;
                break;
            case 'd3-tick-format':
                this.#d3TickFormat = newValue;
                break;
            case 'allow-uri-filters':
                this.#allowUriFilters = Boolean(newValue);
                break;
            default: // do nothing;
                break;
        }
        this.reset();
    }

    connectedCallback() {
        this.#uri = this.getAttribute('uri') || this.#uri;
        this.#width = Number(this.getAttribute('width') || this.#width);
        this.#height = Number(this.getAttribute('height') || this.#height);
        this.#pollSeconds = Number(this.getAttribute('poll-seconds') || this.#pollSeconds);
        this.#end = this.getAttribute('end') || null;
        this.#duration = Number(this.getAttribute('duration')) || null;
        this.#step_duration = this.getAttribute('step-duration') || null;
        this.#d3TickFormat = this.getAttribute('d3-tick-format') || this.#d3TickFormat;
        this.#allowUriFilters = Boolean(this.getAttribute('allow-uri-filters'));
        this.reset();
    }

    disconnectedCallback() {
        this.stopInterval()
    }

    static elementName = "graph-plot";

    /* 
     * Get's the target node for placing the plotly graph.
     *
     * @returns {?HTMLDivElement}
     */
    getTargetNode() {
        return this.#targetNode;
    }

    /**
     */
    stopInterval() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
            this.#intervalId = null;
        }
    }

    /**
     * Resets the entire graph and then restarts polling.
     * @param {boolean=} updateOnly
     */
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

    /** Registers the custom element if it doesn't already exist */
    static registerElement() {
        if (!customElements.get(GraphPlot.elementName)) {
            customElements.define(GraphPlot.elementName, GraphPlot);
        }
    }

    /**
     * Returns the uri formatted with any query strings if necessary.
     *
     * @returns {string}
     */
    getUri() {
        //var uriParts = [this.#uri];
        var uriParts = [];
        if (this.#end && this.#duration && this.#step_duration) {
            uriParts.push("end=" + this.#end);
            uriParts.push("duration=" + this.#duration);
            uriParts.push("step_duration=" + this.#step_duration);
        }
        if (this.#allowUriFilters) {
            for (const filterName in this.#filteredLabelSets) {
                const filterVals = this.#filteredLabelSets[filterName].join("|");
                uriParts.push(`filter-${filterName}=${filterVals}`)
            }
        }
        if (uriParts) {
            return this.#uri + "?" + uriParts.join('&');
        } else {
            return this.#uri;
        }
    }

    /**
     * Returns the data from an api call.
     *
     * @return {Promise<QueryData>}
     */
    async fetchData() {
        // TODO(zaphar): Can we do some massaging on these
        // to get the full set of labels and possible values?
        const response = await fetch(this.getUri());
        const data = await response.json();
        return data;
    }

    /** 
     * Formats the name for the plot trace.
     * @param {PlotMeta} meta
     * @param {Map<string, string>} labels
     * @return string
     */
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

    /**
     * @param {Object<string, string>} labels
     */
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

    /**
      * @param {string} key
      * @returns {HTMLDivElement}
      */
    buildSelectElement(key) {
        var id = key + "-select" + Math.random();
        const element = document.createElement("div");
        const select = document.createElement("select");
        select.setAttribute("name", id);
        // TODO(jwall): This is how you set boolean attributes. Use the attribute name... :-(
        select.setAttribute("multiple", "multiple");
        select.setAttribute("size", "3");
        const optElement = document.createElement("option");
        const optValue = "Select All: " + key;
        optElement.innerText = optValue;
        select.appendChild(optElement);
        for (var opt of this.#filterLabels[key]) {
            const optElement = document.createElement("option");
            optElement.setAttribute("value", opt);
            optElement.setAttribute("selected", "selected");
            optElement.selected = true;
            optElement.innerText = opt;
            select.appendChild(optElement);
        }

        var self = this;
        select.onchange = function(evt) {
            evt.stopPropagation();
            var filteredValues = [];
            const selectElement = /** @type {HTMLSelectElement} */(evt.target);
            var selectAll = /** @type {?HTMLOptionElement}*/(null);
            for (const optEl of selectElement.selectedOptions) {
                if (optEl.value && optEl.value.startsWith("Select All: ")) {
                    selectAll = optEl;
                    break;
                }
            }
            for (const o of selectElement.options) {
                if (selectAll) {
                    if (o != selectAll) {
                        o.setAttribute("selected", "selected");
                        o.selected = true;
                        filteredValues.push(o.value);
                    } else {
                        o.removeAttribute("selected");
                    }
                } else if (!o.selected) {
                    o.removeAttribute("selected");
                } else {
                    o.setAttribute("selected", "selected");
                    filteredValues.push(o.value);
                }
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
            // If there are multiple items to filter by then show the selectElement.
            // otherwise there is no point.
            if (this.#filterLabels[key].length > 1) {
                const element = this.#filterSelectElements[key] || this.buildSelectElement(key);
                children.push(element);
            }
        }
        this.#menuContainer.replaceChildren(...children);
    }

    /**
      * @param {QueryData} graph
      */
    getLabelsForData(graph) {
        const data = graph.plots;
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
            if (subplot.Stream) {
                for (const pair of subplot.Stream) {
                    const labels = pair[0];
                    this.populateFilterData(labels);
                }
            }
        }
    }

    yaxisNameGenerator() {
        var counter = 1;
        return function() {
            var name = "yaxis";
            if (counter != 1) {
                name = "yaxis" + counter;
            }
            counter++;
            return name;
        };
    }

    /**
     * @param {any} triple
     */
    buildSeriesPlot(triple) {
        const labels = /** @type {Map<String, String>} */(triple[0]);
        for (var label in labels) {
            var show = this.#filteredLabelSets[label];
            if (show && !show.includes(labels[label])) {
                return null;
            }
        }
        const meta = /** @type {PlotMeta} */(triple[1]);
        var yaxis = meta.yaxis || "y";
        // https://plotly.com/javascript/reference/layout/yaxis/
        const series = triple[2];
        const trace = /** @type GraphTrace */({
            type: "scatter",
            mode: "lines+text",
            x: [],
            y: [],
            // We always share the x axis for timeseries graphs.
            xaxis: "x",
            yaxis: yaxis,
            //yhoverformat: yaxis.tickformat,
        });
        if (meta.fill) {
            trace.fill = meta.fill;
        }
        var name = this.formatName(meta, labels);
        if (name) { trace.name = name; }
        for (const point of series) {
            trace.x.push(new Date(point.timestamp * 1000));
            trace.y.push(point.value);
        }
        return trace;
    }

    /**
     * @param {any} triple
     */
    buildScalarPlot(triple) {
        const labels = /** @type {Map<String,String>} */(triple[0]);
        for (var label in labels) {
            var show = this.#filteredLabelSets[label];
            if (show && !show.includes(labels[label])) {
                return null;
            }
        }
        const meta = /** @type {PlotMeta} */(triple[1]);
        const series = triple[2];
        const trace = /** @type GraphTrace  */({
            type: "bar",
            x: [],
            y: [],
            yhoverformat: meta["d3_tick_format"],
        });
        var name = this.formatName(meta, labels);
        if (name) { trace.name = name; }
        trace.y.push(series.value);
        trace.x.push(trace.name);
        return trace;
    }

    /**
     * @param {Array} stream
     */
    buildStreamPlot(stream) {
        const dateColumn = [];
        const metaColumn = [];
        const logColumn = [];

        loopStream: for (const pair of stream) {
            const labels = pair[0];
            var labelList = [];
            for (var label in labels) {
                var show = this.#filteredLabelSets[label];
                if (show && !show.includes(labels[label])) {
                    continue loopStream;
                }
                labelList.push(`${label}:${labels[label]}`);
            }
            const labelsName = labelList.join("<br>");
            const lines = pair[1];
            for (const line of lines) {
                // For streams the timestamps are in nanoseconds
                let timestamp = new Date(line.timestamp / 1000000);
                dateColumn.push(timestamp.toISOString());
                metaColumn.push(labelsName);
                logColumn.push(ansiToHtml(line.line));
            }
        }
        return [dateColumn, metaColumn, logColumn];
    }

    /**
     * Update the graph with new data.
     *
     * @param {?QueryData=} maybeGraph
     */
    async updateGraph(maybeGraph) {
        var graph = maybeGraph;
        if (!graph) {
            graph = await this.fetchData();
        }
        var data = graph.plots;
        var yaxes = graph.yaxes;
        var layout = {
            displayModeBar: false,
            responsive: true,
            plot_bgcolor: getCssVariableValue('--plot-background-color').trim(),
            paper_bgcolor: getCssVariableValue('--paper-background-color').trim(),
            font: {
                color: getCssVariableValue('--text-color').trim()
            },
            xaxis: {
                gridcolor: getCssVariableValue("--grid-line-color")
            },
            legend: {
                orientation: 'v'
            }
        };
        if (graph.legend_orientation) {
            layout.legend.orientation = graph.legend_orientation;
        }
        var nextYaxis = this.yaxisNameGenerator();
        for (const yaxis of yaxes) {
            yaxis.tickformat = yaxis.tickformat || this.#d3TickFormat;
            yaxis.gridColor = getCssVariableValue("--grid-line-color");
            layout[nextYaxis()] = yaxis;
        }
        var traces = /** @type {Array<PlotTrace>} */ ([]);
        for (var subplot_idx in data) {
            const subplot = data[subplot_idx];
            var nextYaxis = this.yaxisNameGenerator();
            if (subplot.Series) {
                // https://plotly.com/javascript/reference/scatter/
                for (const triple of subplot.Series) {
                    const trace = this.buildSeriesPlot(triple);
                    if (trace) {
                        traces.push(trace);
                    }
                }
            } else if (subplot.Scalar) {
                // https://plotly.com/javascript/reference/bar/
                for (const triple of subplot.Scalar) {
                    const trace = this.buildScalarPlot(triple);
                    if (trace) {
                        traces.push(trace);
                    }
                }
            } else if (subplot.Stream) {
                // TODO(jwall): It would be nice if scroll behavior would handle replots better.
                // TODO(jwall): It's possible that this should actually be a separate custom
                // element.
                const trace = /** @type TableTrace  */({
                    type: "table",
                    columnwidth: [15, 20, 70],
                    header: {
                        align: "left",
                        values: ["Timestamp", "Labels", "Log"],
                        fill: { color: layout.xaxis.paper_bgcolor },
                        font: { color: getCssVariableValue('--text-color').trim() }
                    },
                    cells: {
                        align: "left",
                        values: [],
                        fill: { color: layout.plot_bgcolor }
                    },
                });
                const [dateColumn, metaColumn, logColumn] = this.buildStreamPlot(subplot.Stream);
                trace.cells.values.push(dateColumn);
                trace.cells.values.push(metaColumn);
                trace.cells.values.push(logColumn);
                traces.push(trace);
            }
        }
        // https://plotly.com/javascript/plotlyjs-function-reference/#plotlyreact
        // @ts-ignore
        Plotly.react(this.getTargetNode(), traces, layout, null);
    }
}

GraphPlot.registerElement();

/** Custom Element for selecting a timespan for the dashboard. */
export class SpanSelector extends HTMLElement {
    /** @type {HTMLElement} */
    #targetNode = null;
    /** @type {HTMLInputElement} */
    #endInput = null;
    /** @type {HTMLInputElement} */
    #durationInput = null;
    /** @type {HTMLInputElement} */
    #stepDurationInput = null;
    /** @type {HTMLButtonElement} */
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

    /** Updates all the graphs on the dashboard with the new timespan. */
    updateGraphs() {
        for (var node of document.getElementsByTagName(GraphPlot.elementName)) {
            node.setAttribute('end', this.#endInput.value);
            node.setAttribute('duration', this.#durationInput.value);
            node.setAttribute('step-duration', this.#stepDurationInput.value);
        }
    }

    static elementName = "span-selector";

    /** Register the element if it doesn't exist */
    static registerElement() {
        if (!customElements.get(SpanSelector.elementName)) {
            customElements.define(SpanSelector.elementName, SpanSelector);
        }
    }
}

SpanSelector.registerElement();

