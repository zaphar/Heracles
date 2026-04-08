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
    let counter = 1;
    return function() {
        let name = "yaxis";
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

    let openSpans = 0;
    let result = line.replace(/\x1b\[([0-9;]*)m/g, (_match, p1) => {
        const parts = p1.split(';');
        let styles = '';
        for (let part of parts) {
            if (ansiToHtmlMap[part]) {
                styles += `color: ${ansiToHtmlMap[part]};`;
            }
        }
        if (styles) {
            // Close any previously open span before opening a new one
            let prefix = '';
            if (openSpans > 0) {
                prefix = '</span>';
            } else {
                openSpans++;
            }
            return prefix + `<span style="${styles}">`;
        } else {
            // Reset code — close the open span
            if (openSpans > 0) {
                openSpans--;
                return '</span>';
            }
            return '';
        }
    });
    // Close any remaining open spans
    while (openSpans > 0) {
        result += '</span>';
        openSpans--;
    }
    return result;
}

/**
 * Formats the name for the plot trace.
 * Supports two format syntaxes:
 *   - Legacy template literal: "`${labels.instance}`" (from pre-eval removal configs)
 *   - Simple braces: "{instance} - {job}"
 * @param {PlotConfig} config
 * @param {Map<string, string>} labels
 * @return string
 */
export function formatName(config, labels) {
    const formatter = config.name_format;
    if (formatter) {
        // Strip surrounding backticks from legacy template literal format
        let fmt = formatter;
        if (fmt.startsWith('`') && fmt.endsWith('`')) {
            fmt = fmt.slice(1, -1);
        }
        // Replace ${labels.key} (legacy) and {key} (current) with label values
        return fmt.replace(/\$\{labels\.(\w+)\}|\{(\w+)\}/g, function(_match, legacyKey, simpleKey) {
            const key = legacyKey || simpleKey;
            return labels[key] !== undefined ? labels[key] : _match;
        });
    }
    const names = [];
    for (const value of Object.values(labels)) {
        names.push(value);
    }
    return names.join(" ");
}

/**
 * Get's a css variable's value from the document.
 * @param {string} variableName - Name of the variable to get `--var-name`
 * @returns string
 */
function getCssVariableValue(variableName) {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName);
}

export class MultiSelectFilter extends HTMLElement {
    static elementName = "multi-select-filter";
    /** @type {string[]} */
    #options = [];
    /** @type {string[]} */
    #value = [];
    /** @type {boolean} */
    #open = false;
    /** @type {HTMLButtonElement} */
    #trigger;
    /** @type {HTMLDivElement} */
    #dropdown;
    /** @type {string} */
    #panelId;
    /** @type {function} */
    #outsideClickHandler;

    constructor() {
        super();
        this.#panelId = 'msf-panel-' + Math.random().toString(36).slice(2, 9);
        this.#outsideClickHandler = (e) => {
            if (this.#open && !this.contains(e.target)) {
                this.#close();
            }
        };
    }

    static get observedAttributes() {
        return ['label'];
    }

    get options() { return this.#options; }
    set options(val) {
        this.#options = val;
        if (this.#open) this.#close();
        this.#buildDropdown();
        this.#updateTriggerText();
    }

    get value() { return this.#value; }
    set value(val) {
        this.#value = val;
        this.#syncCheckboxes();
        this.#updateTriggerText();
    }

    connectedCallback() {
        this.style.position = 'relative';
        this.style.display = 'inline-block';
        this.#buildTrigger();
        this.#buildDropdown();
        this.#updateTriggerText();

        document.addEventListener('click', this.#outsideClickHandler);
        document.addEventListener('multi-select-open', (e) => {
            if (e.detail !== this && this.#open) this.#close();
        });
    }

    disconnectedCallback() {
        document.removeEventListener('click', this.#outsideClickHandler);
    }

    attributeChangedCallback(_name, _oldVal, _newVal) {
        if (this.#trigger) this.#updateTriggerText();
    }

    #buildTrigger() {
        this.#trigger = document.createElement('button');
        this.#trigger.className = 'msf-trigger';
        this.#trigger.setAttribute('role', 'combobox');
        this.#trigger.setAttribute('aria-haspopup', 'listbox');
        this.#trigger.setAttribute('aria-expanded', 'false');
        this.#trigger.setAttribute('aria-controls', this.#panelId);

        const label = document.createElement('span');
        label.className = 'msf-label';
        const count = document.createElement('span');
        count.className = 'msf-count';
        const chevron = document.createElement('span');
        chevron.className = 'msf-chevron';
        chevron.textContent = '\u25BE';

        this.#trigger.append(label, count, chevron);
        this.appendChild(this.#trigger);

        this.#trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.#open ? this.#close() : this.#openDropdown();
        });
        this.#trigger.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!this.#open) this.#openDropdown();
                const first = this.#dropdown.querySelector('[role="option"]');
                if (first) first.focus();
            }
        });
    }

    #buildDropdown() {
        if (this.#dropdown) this.#dropdown.remove();
        this.#dropdown = document.createElement('div');
        this.#dropdown.className = 'msf-dropdown';
        this.#dropdown.id = this.#panelId;
        this.#dropdown.setAttribute('role', 'listbox');
        this.#dropdown.setAttribute('aria-multiselectable', 'true');
        this.#dropdown.setAttribute('aria-label', 'Values for ' + (this.getAttribute('label') || ''));
        this.#dropdown.hidden = true;

        // Select all row
        const selectAll = this.#createOptionRow('Select all', null, true);
        selectAll.classList.add('msf-select-all');
        this.#dropdown.appendChild(selectAll);

        const sep = document.createElement('div');
        sep.className = 'msf-separator';
        this.#dropdown.appendChild(sep);

        for (const opt of this.#options) {
            this.#dropdown.appendChild(this.#createOptionRow(opt, opt, false));
        }

        this.appendChild(this.#dropdown);
        this.#syncCheckboxes();
    }

    #createOptionRow(text, dataValue, isSelectAll) {
        const row = document.createElement('div');
        row.className = 'msf-option';
        row.setAttribute('role', 'option');
        row.setAttribute('tabindex', '-1');
        if (dataValue !== null) row.dataset.value = dataValue;

        const checkbox = document.createElement('span');
        checkbox.className = 'msf-checkbox';
        const label = document.createElement('span');
        label.className = 'msf-option-text';
        label.textContent = text;

        row.append(checkbox, label);

        row.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isSelectAll) {
                this.#toggleAll();
            } else {
                this.#toggleValue(dataValue);
            }
        });

        row.addEventListener('keydown', (e) => {
            const options = [...this.#dropdown.querySelectorAll('[role="option"]')];
            const idx = options.indexOf(row);
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    if (idx < options.length - 1) options[idx + 1].focus();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    if (idx > 0) options[idx - 1].focus();
                    else this.#trigger.focus();
                    break;
                case 'Home':
                    e.preventDefault();
                    options[0].focus();
                    break;
                case 'End':
                    e.preventDefault();
                    options[options.length - 1].focus();
                    break;
                case ' ':
                case 'Enter':
                    e.preventDefault();
                    row.click();
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.#close();
                    this.#trigger.focus();
                    break;
            }
        });

        return row;
    }

    #toggleValue(val) {
        const idx = this.#value.indexOf(val);
        if (idx >= 0) {
            this.#value = this.#value.filter(v => v !== val);
        } else {
            this.#value = [...this.#value, val];
        }
        this.#syncCheckboxes();
        this.#updateTriggerText();
        this.#fireChange();
    }

    #toggleAll() {
        if (this.#value.length === this.#options.length) {
            this.#value = [];
        } else {
            this.#value = [...this.#options];
        }
        this.#syncCheckboxes();
        this.#updateTriggerText();
        this.#fireChange();
    }

    #syncCheckboxes() {
        if (!this.#dropdown) return;
        const allRow = this.#dropdown.querySelector('.msf-select-all');
        if (allRow) {
            const cb = allRow.querySelector('.msf-checkbox');
            cb.classList.toggle('checked', this.#value.length === this.#options.length && this.#options.length > 0);
            cb.classList.toggle('indeterminate', this.#value.length > 0 && this.#value.length < this.#options.length);
            allRow.setAttribute('aria-selected', this.#value.length === this.#options.length ? 'true' : 'false');
        }
        for (const row of this.#dropdown.querySelectorAll('.msf-option:not(.msf-select-all)')) {
            const val = row.dataset.value;
            const selected = this.#value.includes(val);
            row.querySelector('.msf-checkbox').classList.toggle('checked', selected);
            row.setAttribute('aria-selected', selected ? 'true' : 'false');
        }
    }

    #updateTriggerText() {
        if (!this.#trigger) return;
        const label = this.getAttribute('label') || '';
        this.#trigger.querySelector('.msf-label').textContent = label;
        const total = this.#options.length;
        const selected = this.#value.length;
        const countEl = this.#trigger.querySelector('.msf-count');
        countEl.textContent = selected === total ? '(all)' : `(${selected}/${total})`;
        countEl.classList.toggle('msf-partial', selected !== total);
        this.#trigger.setAttribute('aria-label',
            `Filter by ${label}: ${selected === total ? 'all' : selected + ' of ' + total} selected`);
    }

    #openDropdown() {
        document.dispatchEvent(new CustomEvent('multi-select-open', { detail: this }));
        this.#open = true;
        this.#dropdown.hidden = false;
        this.#trigger.setAttribute('aria-expanded', 'true');
        this.#trigger.classList.add('msf-open');
        const first = this.#dropdown.querySelector('[role="option"]');
        if (first) first.focus();
    }

    #close() {
        this.#open = false;
        this.#dropdown.hidden = true;
        this.#trigger.setAttribute('aria-expanded', 'false');
        this.#trigger.classList.remove('msf-open');
    }

    #fireChange() {
        this.dispatchEvent(new CustomEvent('change', {
            detail: { key: this.getAttribute('label') || '', values: [...this.#value] },
            bubbles: true,
        }));
    }

    static registerElement() {
        if (!customElements.get(MultiSelectFilter.elementName)) {
            customElements.define(MultiSelectFilter.elementName, MultiSelectFilter);
        }
    }
}

MultiSelectFilter.registerElement();

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
        this.menuContainer.setAttribute("class", "filter-menu");
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
        const uriParts = [];
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
        for (const key in labels) {
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
        const filter = document.createElement('multi-select-filter');
        filter.setAttribute('label', key);
        filter.options = this.filterLabels[key];
        filter.value = [...this.filterLabels[key]]; // all selected by default

        const self = this;
        filter.addEventListener('change', (e) => {
            self.filteredLabelSets[key] = e.detail.values;
            me.reset(true);
        });

        return filter;
    }

    // FIXME(jwall): We pass the element down but that couples a little too tightly. We should do this differently.
    buildFilterMenu(me) {
        // We need to maintain a stable order for these
        const children = [];
        for (const key of Object.keys(this.filterLabels).sort()) {
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
        const self = this;
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
        for (const subplot of data) {
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
        for (const label in labels) {
            const show = this.#config.filteredLabelSets[label];
            if (show && !show.includes(labels[label])) {
                return null;
            }
        }
        const config = /** @type {PlotConfig} */(triple[1]);
        const yaxis = config.yaxis || "y";
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
        const name = formatName(config, labels);
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
        for (const label in labels) {
            const show = this.#config.filteredLabelSets[label];
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
        const name = formatName(config, labels);
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
        let graph = maybeGraph;
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
        const data = graph.plots;
        const yaxes = graph.yaxes;
        const layout = {
            displayModeBar: false,
            responsive: true,
            plot_bgcolor: getCssVariableValue('--plot-bg').trim(),
            paper_bgcolor: getCssVariableValue('--bg-secondary').trim(),
            font: {
                family: getCssVariableValue('--font-sans').trim(),
                color: getCssVariableValue('--text-secondary').trim(),
                size: 11
            },
            xaxis: {
                gridcolor: getCssVariableValue("--plot-grid").trim(),
                linecolor: getCssVariableValue("--plot-axis").trim(),
                zerolinecolor: getCssVariableValue("--plot-grid").trim()
            },
            margin: { t: 8, r: 16, b: 40, l: 48 },
            legend: {
                orientation: 'v',
                font: { size: 10 }
            }
        };
        if (graph.legend_orientation) {
            layout.legend.orientation = graph.legend_orientation;
        }
        let nextYaxis = yaxisNameGenerator();
        for (const yaxis of yaxes) {
            yaxis.tickformat = yaxis.tickformat || this.#config.d3TickFormat;
            yaxis.gridColor = getCssVariableValue("--plot-grid").trim();
            layout[nextYaxis()] = yaxis;
        }
        const traces = /** @type {Array<PlotTrace>} */ ([]);
        for (const subplot_idx in data) {
            const subplot = data[subplot_idx];
            let nextYaxis = yaxisNameGenerator();
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
        for (const node of document.getElementsByTagName(GraphPlot.elementName)) {
            node.setAttribute('end', this.#endInput.value);
            node.setAttribute('duration', this.#durationInput.value);
            node.setAttribute('step-duration', this.#stepDurationInput.value);
        }
        for (const node of document.getElementsByTagName(LogViewer.elementName)) {
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
                self.getLabelsForLogLines(data.Logs?.lines);
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
        if (graph.Fields) {
            // For table data, we don't populate filter data since it's structured differently
            // The filtering will be done on the table rows instead
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
        if (logLineList.Fields) {
            newLines.push(...this.#processFieldsLines(logLineList.Fields));
        }

        // Sort by timestamp in descending order
        newLines.sort((a, b) => b.timestamp - a.timestamp);
        
        let hadContent = 0;
        if (this.#logLines) {
            hadContent = this.#logLines.children.length > 0;
        }
        
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

    /** @param logTable {Table} */
    #processFieldsLines(logTable) {
        // For Fields result type, we create a single table element instead of individual lines
        const tableId = `table-${Date.now()}`;
        
        if (!this.#displayedLines.has(tableId)) {
            this.#displayedLines.add(tableId);
            
            // Clear existing content and display table
            this.#logLines.innerHTML = '';
            this.#createTableView(logTable);
        }
        
        return []; // Return empty since we're handling display directly
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
        lineElement.dataset.lineId = line.id;

        // Main line container
        this.createLineElement(line, lineElement);

        this.#logLines.appendChild(lineElement);

        // Limit the number of displayed lines to prevent memory issues
        const maxLines = 1000;
        if (this.#logLines.children.length > maxLines) {
            const linesToRemove = this.#logLines.children.length - maxLines;
            for (let i = 0; i < linesToRemove; i++) {
                const removed = this.#logLines.firstChild;
                if (removed && removed.dataset && removed.dataset.lineId) {
                    this.#displayedLines.delete(removed.dataset.lineId);
                }
                this.#logLines.removeChild(removed);
            }
        }
    }

    createLineElement(line, lineElement) {
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
    }

    /**
     * Create and display a table view for Fields data
     * @param {Table} logTable
     */
    #createTableView(logTable) {
        const table = document.createElement('table');
        table.className = 'log-table';
        
        // Create header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        for (const header of logTable.header) {
            const th = document.createElement('th');
            th.textContent = header;
            th.className = 'log-table-header';
            headerRow.appendChild(th);
        }
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create body rows
        const tbody = document.createElement('tbody');
        
        for (const row of logTable.rows) {
            const tr = document.createElement('tr');
            tr.className = 'log-table-row';
            
            for (const cell of row) {
                const td = document.createElement('td');
                td.className = 'log-table-cell';
                td.textContent = cell;
                tr.appendChild(td);
            }
            
            tbody.appendChild(tr);
        }
        
        table.appendChild(tbody);
        this.#logLines.appendChild(table);
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

// Sidebar active state management for HTMX navigation
document.addEventListener('htmx:afterSwap', function(evt) {
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    navItems.forEach(function(item) {
        const pushUrl = item.getAttribute('hx-push-url');
        if (pushUrl && window.location.pathname === pushUrl) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
});

