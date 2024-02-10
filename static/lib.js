class TimeseriesGraph extends HTMLElement {
    #uri;
    #width;
    #height;
    #intervalId;
    #pollSeconds;
    #label;
    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        var template = document.getElementById("timeseries_template");
        this.#width = 800;
        this.#height = 600;
        this.#pollSeconds = 30;
        root.appendChild(template.content.cloneNode(true));
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
        // TODO(zaphar): Set up the timer loop to update graph data.
        this.#uri = this.getAttribute('uri');
        this.#width = this.getAttribute('width');
        this.#height = this.getAttribute('height');
        this.#pollSeconds = this.getAttribute('poll-seconds');
        this.#label = this.getAttribute('label');
        this.resetInterval()
    }

    disconnectedCallback() {
        // TODO(zaphar): Turn off the timer loop to update graph.
        clearInterval(this.#intervalId);
        this.#intervalId = null;
    }

    static elementName = "timeseries-graph";

    getTargetNode() {
        console.log("shadowroot: ", this.shadowRoot);
        return this.shadowRoot.firstChild;
    }
   
    stopInterval() {
        if (this.#intervalId) {
            clearInterval(this.#intervalId);
            this.#intervalId = null;
        }
    }
    
    resetInterval() {
        if (this.#uri) {
            this.updateGraph();
        }
        this.stopInterval()
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
            var traces = [];
            for (const pair of data.Series) {
                const series = pair[1];
                const labels = pair[0];
                var trace = {
                    type: "scatter",
                    mode: "lines",
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
            Plotly.react(this.getTargetNode(), traces, { width: this.#width, height: this.#height });
        } else if (data.Scalar) {
            // The graph should be a single value
        }
    }
}

TimeseriesGraph.registerElement();
