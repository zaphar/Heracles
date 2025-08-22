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


function yaxisNameGenerator() {
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
    return line.replace(/\x1b\[([0-9;]*)m/g, (_match, p1) => {
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
 * Formats the name for the plot trace.
 * @param {PlotConfig} config
 * @param {Map<string, string>} labels
 * @return string
 */
function formatName(config, labels) {
    var name = "";
    const formatter = config.name_format
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
 * Get's a css variable's value from the document.
 * @param {string} variableName - Name of the variable to get `--var-name`
 * @returns string
 */
function getCssVariableValue(variableName) {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName);
}

class ElementConfig {
    uri;
    /** @type {?boolean} */
    allowUriFilters;
    /** @type {?number} */
    width;
    /** @type {?number} */
    height;
    /** @type {?number} */
    intervalId;
    /** @type {?number} */
    pollSeconds;
    /** @type {?string} */
    end;
    /** @type {?number} */
    duration;
    /** @type {?string} */
    step_duration;
    /** @type {?string} */
    d3TickFormat = "~s";
    /** @type {?HTMLDivElement} */
    targetNode = null;
    /** @type {?HTMLElement} */
    menuContainer = null;
    /** @type {Object<string, HTMLSelectElement>} */
    filterSelectElements = {};
    /** @type {Object<string, Array<string>>} */
    filterLabels = {};
    /** @type {Object<string, Array<string>>} */
    filteredLabelSets = {};
    /** @type {?HTMLElement} */
    #container = null;

    constructor(/** @type {?HTMLElement} */ container) {
        this.#container = container;
        this.width = 800;
        this.height = 600;
        this.pollSeconds = 30;
        this.menuContainer = this.#container.appendChild(document.createElement('div'));
        // TODO(jwall): These should probably be done as template clones so we have less places
        // to look for class attributes.
        this.menuContainer.setAttribute("class", "row-flex max-120-char-width");
        this.targetNode = this.#container.appendChild(document.createElement("div"));
    }

    connectedHandler(/** @type {HtmlElement} */ element) {
        this.uri = element.getAttribute('uri') || this.uri;
        this.width = Number(element.getAttribute('width') || this.width);
        this.height = Number(element.getAttribute('height') || this.height);
        this.pollSeconds = Number(element.getAttribute('poll-seconds') || this.pollSeconds);
        this.end = element.getAttribute('end') || null;
        this.duration = Number(element.getAttribute('duration')) || null;
        this.step_duration = element.getAttribute('step-duration') || null;
        this.d3TickFormat = element.getAttribute('d3-tick-format') || this.d3TickFormat;
        this.allowUriFilters = Boolean(element.getAttribute('allow-uri-filters'));
    }

    stopInterval() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /* 
     * Get's the target node for placing the plotly graph.
     *
     * @returns {?HTMLDivElement}
     */
    getTargetNode() {
        return this.targetNode;
    }

    /**
     * Returns the uri formatted with any query strings if necessary.
     *
     * @returns {string}
     */
    getUri() {
        //var uriParts = [this.#uri];
        var uriParts = [];
        if (this.end && this.duration && this.step_duration) {
            uriParts.push("end=" + this.end);
            uriParts.push("duration=" + this.duration);
            uriParts.push("step_duration=" + this.step_duration);
        }
        if (this.allowUriFilters) {
            for (const filterName in this.filteredLabelSets) {
                const filterVals = this.filteredLabelSets[filterName].join("|");
                uriParts.push(`filter-${filterName}=${filterVals}`)
            }
        }
        if (uriParts) {
            return this.uri + "?" + uriParts.join('&');
        } else {
            return this.uri;
        }
    }

    /**
     * Returns the data from an api call.
     *
     * @return {Promise<QueryPayload>}
     */
    async fetchData() {
        // TODO(zaphar): Can we do some massaging on these
        // to get the full set of labels and possible values?
        const response = await fetch(this.getUri());
        const data = await response.json();
        return data;
    }

    getFilterLabels() {
        return this.filterLabels;
    }

    /**
     * @param {Object<string, string>} labels
     */
    populateFilterData(labels) {
        for (var key in labels) {
            const label = this.filterLabels[key];
            if (label) {
                if (!label.includes(labels[key])) {
                    this.filterLabels[key].push(labels[key]);
                }
            } else {
                this.filterLabels[key] = [labels[key]];
            }
        }
    }

    /**
      * @param {string} key
      * @returns {HTMLDivElement}
      */
    buildSelectElement(key, me) {
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
        for (var opt of this.filterLabels[key]) {
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
            self.filteredLabelSets[key] = filteredValues;
            me.reset(true);
        };
        element.appendChild(select);
        return element;
    }

    // FIXME(jwall): We pass the element down but that couples a little too tightly. We should do this differently.
    buildFilterMenu(me) {
        // We need to maintain a stable order for these
        var children = [];
        for (var key of Object.keys(this.filterLabels).sort()) {
            // If there are multiple items to filter by then show the selectElement.
            // otherwise there is no point.
            if (this.filterLabels[key].length > 1) {
                const element = this.filterSelectElements[key] || this.buildSelectElement(key, me);
                children.push(element);
            }
        }
        this.menuContainer.replaceChildren(...children);
    }

    attributeChangedHandler(name, newValue) {
        switch (name) {
            case 'uri':
                this.uri = newValue;
                break;
            case 'width':
                this.width = Number(newValue);
                break;
            case 'height':
                this.height = Number(newValue);
                break;
            case 'poll-seconds':
                this.pollSeconds = Number(newValue);
                break;
            case 'end':
                this.end = newValue;
                break;
            case 'duration':
                this.config.duration = Number(newValue);
                break;
            case 'step-duration':
                this.step_duration = newValue;
                break;
            case 'd3-tick-format':
                this.d3TickFormat = newValue;
                break;
            case 'allow-uri-filters':
                this.allowUriFilters = Boolean(newValue);
                break;
            default: // do nothing;
                break;
        }
    }
}


/**
 * Custom element for showing Log Output.
 *
 * @extends HTMLElement
 */
export class LogPlot extends HTMLElement {
    /** @type {?ElementConfig} */
    #config;

    constructor() {
        super();
        this.#config = new ElementConfig(this);
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
        this.#config.attributeChangedHandler(name, newValue);
        this.reset();
    }

    connectedCallback() {
        this.#config.connectedHandler(this);
        this.reset(true);
    }

    disconnectedCallback() {
        this.#config.stopInterval()
    }

    static elementName = "log-plot";

    /** Registers the custom element if it doesn't already exist */
    static registerElement() {
        if (!customElements.get(LogPlot.elementName)) {
            customElements.define(LogPlot.elementName, LogPlot);
        }
    }

    /**
     * Resets the entire graph and then restarts polling.
     * @param {boolean=} updateOnly
     */
    reset(updateOnly) {
        var self = this;
        self.#config.stopInterval()
        self.#config.fetchData().then((data) => {
            if (!updateOnly) {
                self.getLabelsForLogLines(data.Metrics || data.Logs.lines);
                self.#config.buildFilterMenu(this);
            }
            self.updateGraph(data).then(() => {
                self.#config.intervalId = setInterval(() => self.updateGraph(), 1000 * self.#config.pollSeconds);
            });
        });
    }

    /**
      * @param {LogLineList} graph
      */
    getLabelsForLogLines(graph) {
        if (graph.Stream) {
            for (const pair of graph.Stream) {
                const labels = pair[0];
                this.#config.populateFilterData(labels);
            }
        }
        if (graph.StreamInstant) {
            // TODO(zaphar): Handle this?
        }
    }

    /**
     * @param {Array} stream
     *
     * @returns {{dates: Array<string>, config: Array<string>, lines: Array<string>}}
     */
    buildStreamPlot(stream) {
        const dateColumn = [];
        const configColumn = [];
        const logColumn = [];

        loopStream: for (const pair of stream) {
            const labels = pair[0];
            var labelList = [];
            for (var label in labels) {
                var show = this.#config.filteredLabelSets[label];
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
                configColumn.push(labelsName);
                logColumn.push(ansiToHtml(line.line));
            }
        }
        return { dates: dateColumn, config: configColumn, lines: logColumn };
    }
    
    /**
     * Update the graph with new data.
     *
     * @param {?QueryPayload=} maybeGraph
     */
    async updateGraph(maybeGraph) {
        var graph = maybeGraph;
        if (!graph) {
            graph = await this.#config.fetchData();
        }
        if (graph.Metrics) {
            // FIXME(zaphar): Log an Error;
        } else if (graph.Logs) {
            this.updateLogsView(graph.Logs.lines);
        } else {
        }
    }

    /**
     * Update the logs view with new data.
     *
     * @param {?LogLineList=} logLineList
     */
    updateLogsView(logLineList) {
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
        var traces = [];
        if (logLineList.Stream) {
            // TODO(jwall): It's possible that this should actually be a separate custom
            // element.
            const trace = /** @type TableTrace  */ ({
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
            const columns = this.buildStreamPlot(logLineList.Stream);
            trace.cells.values.push(columns.dates);
            trace.cells.values.push(columns.config);
            trace.cells.values.push(columns.lines);
            traces.push(trace);
        } else if (logLineList.StreamInstant) {
            // TODO(zaphar): Handle this?
        }
        // https://plotly.com/javascript/plotlyjs-function-reference/#plotlyreact
        // @ts-ignore
        Plotly.react(this.#config.getTargetNode(), traces, layout, null);
    }

}

LogPlot.registerElement();

/**
 * Custom element for showing a plotly graph.
 *
 * @extends HTMLElement
 */
export class GraphPlot extends HTMLElement {
    /** @type {?ElementConfig} */
    #config;

    constructor() {
        super();
        this.#config = new ElementConfig(this);
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
        this.#config.attributeChangedHandler(name, newValue);
        this.reset();
    }

    connectedCallback() {
        this.#config.connectedHandler(this);
        this.reset(true);
    }

    disconnectedCallback() {
        this.#config.stopInterval()
    }

    static elementName = "graph-plot";

    /**
     * Resets the entire graph and then restarts polling.
     * @param {boolean=} updateOnly
     */
    reset(updateOnly) {
        var self = this;
        self.#config.stopInterval()
        self.#config.fetchData().then((data) => {
            if (!updateOnly) {
                self.getLabelsForQueryData(data.Metrics || data.Logs.lines);
                self.#config.buildFilterMenu(this);
            }
            self.updateGraph(data).then(() => {
                self.#config.intervalId = setInterval(() => self.updateGraph(), 1000 * self.#config.pollSeconds);
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
      * @param {QueryData} graph
      */
    getLabelsForQueryData(graph) {
        const data = graph.plots;
        for (var subplot of data) {
            if (subplot.Series) {
                for (const triple of subplot.Series) {
                    const labels = triple[0];
                    this.#config.populateFilterData(labels);
                }
            }
            if (subplot.Scalar) {
                for (const triple of subplot.Scalar) {
                    const labels = triple[0];
                    this.#config.populateFilterData(labels);
                }
            }
        }
    }

    /**
     * @param {any} triple
     */
    buildSeriesPlot(triple) {
        const labels = /** @type {Map<String, String>} */(triple[0]);
        for (var label in labels) {
            var show = this.#config.filteredLabelSets[label];
            if (show && !show.includes(labels[label])) {
                return null;
            }
        }
        const config = /** @type {PlotConfig} */(triple[1]);
        var yaxis = config.yaxis || "y";
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
        if (config.fill) {
            trace.fill = config.fill;
        }
        var name = formatName(config, labels);
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
            var show = this.#config.filteredLabelSets[label];
            if (show && !show.includes(labels[label])) {
                return null;
            }
        }
        const config = /** @type {PlotConfig} */(triple[1]);
        const series = triple[2];
        const trace = /** @type GraphTrace  */({
            type: "bar",
            x: [],
            y: [],
            yhoverformat: config["d3_tick_format"],
        });
        var name = formatName(config, labels);
        if (name) { trace.name = name; }
        trace.y.push(series.value);
        trace.x.push(trace.name);
        return trace;
    }

    /**
     * Update the graph with new data.
     *
     * @param {?QueryPayload=} maybeGraph
     */
    async updateGraph(maybeGraph) {
        var graph = maybeGraph;
        if (!graph) {
            graph = await this.#config.fetchData();
        }
        if (graph.Metrics) {
            this.updateMetricsGraph(graph.Metrics);
        } else if (graph.Logs) {
            // FIXME(zaphar): Log an Error;
        } else {
        }
    }

    /**
     * Update the metrics graph with new data.
     *
     * @param {?QueryData=} graph
     */
    updateMetricsGraph(graph) {
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
        var nextYaxis = yaxisNameGenerator();
        for (const yaxis of yaxes) {
            yaxis.tickformat = yaxis.tickformat || this.#config.d3TickFormat;
            yaxis.gridColor = getCssVariableValue("--grid-line-color");
            layout[nextYaxis()] = yaxis;
        }
        var traces = /** @type {Array<PlotTrace>} */ ([]);
        for (var subplot_idx in data) {
            const subplot = data[subplot_idx];
            var nextYaxis = yaxisNameGenerator();
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
            }
        }
        // https://plotly.com/javascript/plotlyjs-function-reference/#plotlyreact
        // @ts-ignore
        Plotly.react(this.#config.getTargetNode(), traces, layout, null);
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
        for (var node of document.getElementsByTagName(LogPlot.elementName)) {
            node.setAttribute('end', this.#endInput.value);
            node.setAttribute('duration', this.#durationInput.value);
            node.setAttribute('step-duration', this.#stepDurationInput.value);
        }
        for (var node of document.getElementsByTagName(LogViewer.elementName)) {
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

/**
 * Custom element for displaying log lines in a scrolling container.
 * Supports real-time updates and automatic scrolling to new content.
 *
 * @extends HTMLElement
 */
export class LogViewer extends HTMLElement {
    /** @type {?ElementConfig} */
    #config;
    /** @type {?HTMLDivElement} */
    #logContainer;
    /** @type {?HTMLDivElement} */
    #logLines;
    /** @type {Set<string>} */
    #displayedLines;
    /** @type {boolean} */
    #autoScroll = true;

    constructor() {
        super();
        this.#config = new ElementConfig(this);
        this.#displayedLines = new Set();
    }

    static observedAttributes = ['uri', 'width', 'height', 'poll-seconds', 'end', 'duration', 'step-duration', 'allow-uri-filter'];

    /**
     * Callback for attributes changes.
     *
     * @param {string} name       - The name of the attribute.
     * @param {?string} _oldValue - The old value for the attribute
     * @param {?string} newValue  - The new value for the attribute
     */
    attributeChangedCallback(name, _oldValue, newValue) {
        this.#config.attributeChangedHandler(name, newValue);
        this.reset();
    }

    connectedCallback() {
        this.#config.connectedHandler(this);
        this.#createLogContainer();
        this.reset(true);
    }

    disconnectedCallback() {
        this.#config.stopInterval();
    }

    static elementName = "log-viewer";

    /** Registers the custom element if it doesn't already exist */
    static registerElement() {
        if (!customElements.get(LogViewer.elementName)) {
            customElements.define(LogViewer.elementName, LogViewer);
        }
    }

    #createLogContainer() {
        // Create the main container
        this.#logContainer = document.createElement('div');
        this.#logContainer.className = 'log-container';

        // Create the scrollable log lines container
        this.#logLines = document.createElement('div');
        this.#logLines.className = 'log-lines';

        // Add scroll event listener to detect manual scrolling
        this.#logContainer.addEventListener('scroll', () => {
            const container = this.#logContainer;
            const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 5;
            this.#autoScroll = isAtBottom;
        });

        this.#logContainer.appendChild(this.#logLines);
        
        // Replace the target node content
        const targetNode = this.#config.getTargetNode();
        targetNode.innerHTML = '';
        targetNode.appendChild(this.#logContainer);
    }

    /**
     * Resets the entire log viewer and then restarts polling.
     * @param {boolean=} updateOnly
     */
    reset(updateOnly) {
        const self = this;
        self.#config.stopInterval();
        
        if (!updateOnly) {
            self.#displayedLines.clear();
            if (self.#logLines) self.#logLines.innerHTML = '';
        }

        self.#config.fetchData().then((data) => {
            if (!updateOnly) {
                self.getLabelsForLogLines(data.Metrics || data.Logs?.lines);
                self.#config.buildFilterMenu(this);
            }
            self.updateLogView(data).then(() => {
                self.#config.intervalId = setInterval(() => self.updateLogView(), 1000 * self.#config.pollSeconds);
            });
        });
    }

    /**
     * @param {LogLineList} graph
     */
    getLabelsForLogLines(graph) {
        if (!graph) return;
        
        if (graph.Stream) {
            for (const pair of graph.Stream) {
                const labels = pair[0];
                this.#config.populateFilterData(labels);
            }
        }
        if (graph.StreamInstant) {
            for (const pair of graph.StreamInstant) {
                const labels = pair[0];
                this.#config.populateFilterData(labels);
            }
        }
    }

    /**
     * Update the log view with new data.
     *
     * @param {?QueryPayload=} maybeGraph
     */
    async updateLogView(maybeGraph) {
        let graph = maybeGraph;
        if (!graph) {
            graph = await this.#config.fetchData();
        }

        if (graph.Logs?.lines) {
            this.#processLogLines(graph.Logs.lines);
        }
    }

    /**
     * Process and display log lines
     * @param {LogLineList} logLineList
     */
    #processLogLines(logLineList) {
        const newLines = [];

        if (logLineList.Stream) {
            newLines.push(...this.#processStreamLines(logLineList.Stream));
        }
        
        if (logLineList.StreamInstant) {
            newLines.push(...this.#processStreamInstantLines(logLineList.StreamInstant));
        }

        // Sort by timestamp and add new lines
        newLines.sort((a, b) => a.timestamp - b.timestamp);
        
        const hadContent = this.#logLines.children.length > 0;
        
        for (const line of newLines) {
            this.#addLogLine(line);
        }

        // Only auto-scroll if we had content before and auto-scroll is enabled
        // For initial load, stay at the top
        if (this.#autoScroll && hadContent) {
            this.#scrollToBottom();
        }
    }

    /**
     * Process Stream format log lines
     * @param {Array} stream
     * @returns {Array}
     */
    #processStreamLines(stream) {
        const lines = [];
        
        loopStream: for (const pair of stream) {
            const labels = pair[0];
            
            // Apply filters
            for (const label in labels) {
                const show = this.#config.filteredLabelSets[label];
                if (show && !show.includes(labels[label])) {
                    continue loopStream;
                }
            }

            const logLines = pair[1];
            const labelStr = this.#formatLabels(labels);
            
            for (const line of logLines) {
                const timestamp = line.timestamp / 1000000; // Convert from nanoseconds to milliseconds
                const lineId = `${timestamp}-${line.line}`;
                
                if (!this.#displayedLines.has(lineId)) {
                    lines.push({
                        id: lineId,
                        timestamp,
                        labels: labelStr,
                        content: line.line
                    });
                }
            }
        }
        
        return lines;
    }

    /**
     * Process StreamInstant format log lines
     * @param {Array} streamInstant
     * @returns {Array}
     */
    #processStreamInstantLines(streamInstant) {
        const lines = [];
        
        loopStream: for (const pair of streamInstant) {
            const labels = pair[0];
            
            // Apply filters
            for (const label in labels) {
                const show = this.#config.filteredLabelSets[label];
                if (show && !show.includes(labels[label])) {
                    continue loopStream;
                }
            }

            const line = pair[1];
            const labelStr = this.#formatLabels(labels);
            const timestamp = line.timestamp;
            const lineId = `${timestamp}-${line.line}`;
            
            if (!this.#displayedLines.has(lineId)) {
                lines.push({
                    id: lineId,
                    timestamp,
                    labels: labelStr,
                    content: line.line
                });
            }
        }
        
        return lines;
    }

    /**
     * Format labels for display
     * @param {Object<string, string>} labels
     * @returns {string}
     */
    #formatLabels(labels) {
        const labelPairs = [];
        for (const [key, value] of Object.entries(labels)) {
            labelPairs.push(`${key}=${value}`);
        }
        return labelPairs.join(' ');
    }

    /**
     * Add a single log line to the display
     * @param {Object} line
     */
    #addLogLine(line) {
        if (this.#displayedLines.has(line.id)) {
            return;
        }

        this.#displayedLines.add(line.id);

        const lineElement = document.createElement('div');
        lineElement.className = 'log-line';

        // Main line container
        const mainLineDiv = document.createElement('div');
        mainLineDiv.className = 'log-main-line';

        const timestamp = new Date(line.timestamp / 1000000).toISOString();
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'log-timestamp';
        timestampSpan.textContent = timestamp;

        const contentSpan = document.createElement('span');
        contentSpan.className = 'log-content';
        contentSpan.innerHTML = ansiToHtml(line.content);

        mainLineDiv.appendChild(timestampSpan);
        mainLineDiv.appendChild(contentSpan);

        // Labels container (initially hidden)
        const labelsDiv = document.createElement('div');
        labelsDiv.className = 'log-labels';
        labelsDiv.textContent = line.labels;

        lineElement.appendChild(mainLineDiv);
        lineElement.appendChild(labelsDiv);

        // Click handler to toggle labels visibility
        lineElement.addEventListener('click', () => {
            const isExpanded = labelsDiv.classList.contains('visible');
            if (isExpanded) {
                labelsDiv.classList.remove('visible');
                lineElement.classList.remove('expanded');
            } else {
                labelsDiv.classList.add('visible');
                lineElement.classList.add('expanded');
            }
        });

        this.#logLines.appendChild(lineElement);

        // Limit the number of displayed lines to prevent memory issues
        const maxLines = 1000;
        if (this.#logLines.children.length > maxLines) {
            const linesToRemove = this.#logLines.children.length - maxLines;
            for (let i = 0; i < linesToRemove; i++) {
                this.#logLines.removeChild(this.#logLines.firstChild);
            }
            
            // Clean up the displayed lines set to prevent memory leaks
            if (this.#displayedLines.size > maxLines * 1.2) {
                this.#displayedLines.clear();
                // Re-add current visible lines
                for (const child of this.#logLines.children) {
                    const timestamp = child.querySelector('span').textContent;
                    const content = child.querySelector('span:last-child').textContent;
                    this.#displayedLines.add(`${new Date(timestamp).getTime()}-${content}`);
                }
            }
        }
    }

    /**
     * Scroll to the bottom of the log container
     */
    #scrollToBottom() {
        this.#logContainer.scrollTop = this.#logContainer.scrollHeight;
    }

    /**
     * Toggle auto-scroll behavior
     */
    toggleAutoScroll() {
        this.#autoScroll = !this.#autoScroll;
        if (this.#autoScroll) {
            this.#scrollToBottom();
        }
    }

    /**
     * Clear all displayed log lines
     */
    clearLogs() {
        this.#displayedLines.clear();
        this.#logLines.innerHTML = '';
    }
}

LogViewer.registerElement();

