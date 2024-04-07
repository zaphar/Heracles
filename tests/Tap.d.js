/** @interface */
class TapRenderer {
    /** Renders output for the test results
     * @param {string} text 
     */
    out(text) {
    }

    /** Diagnostic formatter for TAP Output.
     *
     * @param {Array<string>} lines
     */
    comment(lines) {
    }
}

/**
 * @typedef TapSuite
 * @type {Array<{'plan': Number, name: string, 'test': function(Tap)}}
 */
