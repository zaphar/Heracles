// TODO(jwall): Figure out how to handle the missing browser apis in node contexts.
import { GraphPlot, SpanSelector } from '../static/lib.mjs';

function deepEqual(got, expected) {
      // Check if both are the same reference or both are null
  if (got === expected) { return true; }

  // Check if both are objects (including arrays) and neither is null
  if (typeof got !== 'object' || got === null ||
      typeof expected !== 'object' || expected === null) {
    return false;
  }

  // Get the keys of both objects
  const keysGot = Object.keys(got), keysExpected = Object.keys(expected);

  // If number of properties is different, objects are not equivalent
  if (keysGot.length !== keysExpected.length) { return false; }

  // Check all properties of a are in b and are equal
  for (let key of keysGot) {
    if (!keysExpected.includes(key) || !deepEqual(got[key], expected[key])) {  return false; }
  }

  // If we got this far, objects are considered equivalent
  return true;
}

/**
 * @type {TapSuite}
 */
export var tapSuite = [
    {
        plan: 2,
        name: "Custom Element registration Tests",
        test: function(t) {
            t.ok(customElements.get(GraphPlot.elementName), `GraphPlot element is registered with name ${GraphPlot.elementName}`);
            t.ok(customElements.get(SpanSelector.elementName), `SpanSelector element is registered with name ${SpanSelector.elementName}`);
        }
    },
    {
        plan: 5,
        name: "PopulateFilterData test",
        test: function(t) {
            const plot = new GraphPlot();
            t.ok(deepEqual(plot.getFilterLabels(), {}), "filter lables start out empty");
            plot.populateFilterData({});
            t.ok(typeof(deepEqual(plot.getFilterLabels()), {}), "filter lables are still empty");
            plot.populateFilterData({"foo": "bar"});
            t.ok(deepEqual(plot.getFilterLabels(), {"foo": ["bar"]}), "filter labels get set with list of one item on first label");
            plot.populateFilterData({"foo": "quux"});
            t.ok(deepEqual(plot.getFilterLabels(), {"foo": ["bar", "quux"]}), "list of two values after second label value");
            plot.populateFilterData({"foo": "bar"});
            t.ok(deepEqual(plot.getFilterLabels(), {"foo": ["bar", "quux"]}), "We don't double add the same value");
        }
    }
];
