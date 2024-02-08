
class Timeseries {
    #uri;
    #title;
    #targetEl;
    //#width;
    //#height;

    constructor(uri, targetEl, /** width, height **/) {
        this.#uri = uri;
        this.#targetEl = targetEl;
        //this.#width = width;
        //this.#height = height;
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
            Plotly.react(this.#targetEl, traces, { width: 500, height: 500 });
        } else if (data.Scalar) {
            // The graph should be a single value
        }
    }
}
