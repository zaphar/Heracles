class TimeseriesGraph extends HTMLElement {
    #uri;
    #width;
    #height;
    #intervalId;
    #pollSeconds;
    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        var template = document.getElementById("timeseries_template");
        this.#width = 1000;
        this.#height = 500;
        this.#pollSeconds = 5;
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
           default: // do nothing;
                break;
        }
        this.updateGraph();
        // TODO(zaphar): reset update timer as well
    }

    connectedCallback() {
        // TODO(zaphar): Set up the timer loop to update graph data.
        this.#uri = this.getAttribute('uri');
        if (this.#uri) {
            this.updateGraph();
        }
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
                var trace = {
                    type: "scatter",
                    mode: "lines",
                    x: [],
                    y: []
                };
                //const labels = pair[0];
                const series = pair[1];
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
