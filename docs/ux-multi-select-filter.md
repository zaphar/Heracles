# UX Specification: `<multi-select-filter>` Web Component

## Overview

A custom web component that replaces the native `<select multiple>` elements used
for filtering graph and log data in Heracles dashboards. The component presents a
compact dropdown button that opens a checkbox list, making multi-selection intuitive
and visible at a glance.

## Problem Statement

The current native `<select multiple>` has several usability issues:
- Requires Ctrl/Cmd+click for multi-selection (non-obvious interaction)
- Shows only 3 rows (`size="3"`), hiding most options behind a scroll
- Mixes a "Select All: {key}" pseudo-option in with real values
- Selected state is hard to read at a glance, especially in dark mode
- Accidentally clicking without modifier keys deselects everything

## Component API

### Tag Name

```html
<multi-select-filter></multi-select-filter>
```

### Attributes

| Attribute | Type   | Required | Description                                    |
|-----------|--------|----------|------------------------------------------------|
| `label`   | string | yes      | The filter key name displayed on the button (e.g., "instance", "job") |

### Properties (set via JS)

| Property  | Type       | Default | Description                                         |
|-----------|------------|---------|-----------------------------------------------------|
| `options` | `string[]` | `[]`    | Available filter values. Setting this rebuilds the checkbox list. |
| `value`   | `string[]` | `[]`    | Currently selected values. Readable and writable.    |

### Events

| Event    | Detail                        | Description                              |
|----------|-------------------------------|------------------------------------------|
| `change` | `{ key: string, values: string[] }` | Fired when the selection changes. `key` is the `label` attribute value; `values` is the new set of selected option strings. |

### Static Members

| Member            | Value                    |
|-------------------|--------------------------|
| `elementName`     | `"multi-select-filter"`  |
| `registerElement()` | Registers with `customElements.define` if not already registered |

### Usage Example

```js
const filter = document.createElement('multi-select-filter');
filter.setAttribute('label', 'instance');
filter.options = ['localhost:9090', 'localhost:9091', 'localhost:9092'];
filter.value = ['localhost:9090', 'localhost:9091', 'localhost:9092']; // all selected
filter.addEventListener('change', (e) => {
    const { key, values } = e.detail;
    config.filteredLabelSets[key] = values;
    graphElement.reset(true);
});
```

## Visual Design

### Button (Closed State)

```
+-----------------------------------+
| instance (2/5)              [v]   |
+-----------------------------------+
```

- Background: `var(--bg-input)` with `1px solid var(--border-default)` border
- Border-radius: `4px`
- Font: `var(--font-mono)` at `0.6875rem` (matches existing select styling)
- Text color: `var(--text-primary)` for the label, `var(--text-secondary)` for the count
- The count format is `(selected/total)`. When all are selected, show `(all)` instead of the fraction.
- Chevron indicator: a small downward-pointing CSS triangle or the character `\u25BE` in `var(--text-muted)`
- Padding: `4px 8px` (compact, matching existing `select` padding of `4px 6px`)
- Min-width: none (sizes to content)
- Cursor: `pointer`

### Button States

| State         | Appearance                                                        |
|---------------|-------------------------------------------------------------------|
| Default       | `--bg-input` background, `--border-default` border                |
| Hover         | `--border-strong` border                                          |
| Focus-visible | `--accent-primary` border, `0 0 0 2px var(--accent-muted)` shadow (matches existing `:focus-visible` rule) |
| Open          | `--accent-primary` border, `--accent-muted` background            |
| Partial selection | Count text in `var(--accent-primary)` to signal not-all-selected |

### Dropdown Panel (Open State)

```
+-----------------------------------+
| instance (2/5)              [^]   |
+===================================+
| [x] Select all                    |
|-----------------------------------|
| [x] localhost:9090                |
| [x] localhost:9091                |
| [ ] localhost:9092                |
| [ ] localhost:9093                |
| [ ] localhost:9094                |
+-----------------------------------+
```

- Position: `absolute`, anchored below the button, left-aligned
- Background: `var(--bg-secondary)`
- Border: `1px solid var(--border-strong)`
- Border-radius: `4px` (top corners square when flush with button, bottom corners rounded)
- Box-shadow: `0 4px 12px rgba(0,0,0,0.3)` (subtle depth in dark mode)
- Z-index: `300` (above dashboard header which is `z-index: 100`)
- Max-height: `240px` with `overflow-y: auto` (scrollable when many options)
- Min-width: matches the button width; max-width: `300px`
- The "Select all" row is visually separated from value rows with a `1px solid var(--border-default)` bottom border

### Checkbox Rows

- Padding: `4px 8px` per row
- Font: `var(--font-mono)` at `0.6875rem`
- Text color: `var(--text-primary)`
- Hover background: `var(--accent-muted)`
- The entire row is clickable, not just the checkbox
- Checkbox appearance: custom-styled square using CSS, colored with `var(--accent-primary)` when checked
- Checked state: filled square with a check mark, border `var(--accent-primary)`
- Unchecked state: empty square, border `var(--border-strong)`

### "Select All" Row

- Text: "Select all" (no colon, no key name -- the key is already visible on the button)
- Font-weight: `600` (slightly bolder than value rows)
- Color: `var(--text-secondary)`
- When all items are selected, this row's checkbox is checked
- When some items are selected, this row's checkbox shows an indeterminate state (a horizontal dash instead of checkmark)
- When no items are selected, this row's checkbox is unchecked
- Clicking when checked or indeterminate: deselects all
- Clicking when unchecked: selects all

## Interaction Patterns

### Opening the Dropdown

- Click the button to toggle the dropdown open/closed
- If the dropdown is already open, clicking the button closes it

### Closing the Dropdown

The dropdown closes when:
1. The user clicks the button again
2. The user clicks anywhere outside the component (document-level click listener)
3. The user presses `Escape`
4. The user tabs out of the component (focusout, with a microtask delay to allow internal focus movement)

### Selection Behavior

- Clicking a value row toggles that value's checkbox
- Clicking "Select all" when not all selected: selects all, fires `change`
- Clicking "Select all" when all selected: deselects all, fires `change`
- Each toggle fires a `change` event with the updated `values` array
- The button text updates immediately to reflect the new count

### Multiple Dropdowns

- Only one `<multi-select-filter>` dropdown should be open at a time
- Opening one should close any other open dropdown in the same `.filter-menu`
- Implementation: dispatch a custom event `multi-select-open` on `document` with the instance identity; other instances listen and close themselves

## Keyboard Behavior

| Key          | Context              | Action                                           |
|--------------|----------------------|--------------------------------------------------|
| `Enter`/`Space` | Button focused    | Toggle dropdown open/closed                      |
| `Escape`     | Dropdown open        | Close dropdown, return focus to button            |
| `ArrowDown`  | Button focused       | Open dropdown (if closed), move focus to first item |
| `ArrowDown`  | Item focused         | Move focus to next item                           |
| `ArrowUp`    | Item focused         | Move focus to previous item                       |
| `ArrowUp`    | First item focused   | Move focus to button                              |
| `Home`       | Item focused         | Move focus to first item                          |
| `End`        | Item focused         | Move focus to last item                           |
| `Space`      | Item focused         | Toggle checkbox for focused item                  |
| `Tab`        | Dropdown open        | Close dropdown (natural focus moves out)          |

Focus management:
- When the dropdown opens, focus moves to the "Select all" row
- When the dropdown closes, focus returns to the button
- Focus is trapped within the dropdown while open (ArrowUp/ArrowDown cycle, but Tab exits)

## Accessibility

### ARIA Attributes

**Button element:**
```html
<button
  role="combobox"
  aria-haspopup="listbox"
  aria-expanded="false|true"
  aria-label="Filter by {label}: {selected}/{total} selected"
  aria-controls="{panel-id}"
>
```

**Dropdown panel:**
```html
<div
  role="listbox"
  id="{panel-id}"
  aria-multiselectable="true"
  aria-label="Values for {label}"
>
```

**Each option row:**
```html
<div
  role="option"
  aria-selected="true|false"
  tabindex="-1"
>
```

**"Select all" row:**
```html
<div
  role="option"
  aria-selected="true|false|mixed"
  tabindex="-1"
>
```

### Screen Reader Announcements

- Button reads: "Filter by instance, 2 of 5 selected"
- On selection change, update the button's `aria-label` so the new count is announced
- Each option reads its value and selected state naturally via `role="option"` + `aria-selected`

### Color Contrast

All text/background combinations must meet WCAG 2.1 AA (4.5:1 for normal text):
- `--text-primary` (#d4d9e0) on `--bg-secondary` (#1a2028): ~10:1 ratio -- passes
- `--text-secondary` (#8b95a3) on `--bg-secondary` (#1a2028): ~5.3:1 ratio -- passes
- `--accent-primary` (#3b82f6) on `--bg-secondary` (#1a2028): ~4.9:1 ratio -- passes

### Motion

- Dropdown open/close: no animation (instant). Ops dashboards favor speed over flourish.
- Hover transitions: `0.1s ease` on background color only, matching existing log-line hover behavior.

## Component Structure (Shadow DOM: No)

The component uses Light DOM (no Shadow DOM), consistent with the existing
`SpanSelector`, `GraphPlot`, and `LogViewer` components in the project. This means
it inherits all styles from `site.css` automatically.

### Internal DOM Structure

```html
<multi-select-filter label="instance">
  <button class="msf-trigger" ...aria attrs...>
    <span class="msf-label">instance</span>
    <span class="msf-count">(2/5)</span>
    <span class="msf-chevron">\u25BE</span>
  </button>
  <div class="msf-dropdown" ...aria attrs... hidden>
    <div class="msf-option msf-select-all" role="option" tabindex="-1">
      <span class="msf-checkbox"></span>
      <span class="msf-option-text">Select all</span>
    </div>
    <div class="msf-separator"></div>
    <div class="msf-option" role="option" tabindex="-1" data-value="localhost:9090">
      <span class="msf-checkbox checked"></span>
      <span class="msf-option-text">localhost:9090</span>
    </div>
    <!-- ...more options... -->
  </div>
</multi-select-filter>
```

### CSS Class Naming

All classes prefixed with `msf-` (multi-select-filter) to avoid collisions with
existing styles.

## CSS to Add to `site.css`

New rules should be added in a `/* ---- Multi-Select Filter ---- */` section,
placed after the existing `/* ---- Form Controls ---- */` section. The styles
should use existing CSS custom properties exclusively -- no hardcoded colors.

Key style targets:

| Selector               | Key Properties                                        |
|------------------------|-------------------------------------------------------|
| `multi-select-filter`  | `position: relative; display: inline-block;`          |
| `.msf-trigger`         | Matches existing select styling; adds flex layout      |
| `.msf-dropdown`        | Absolute positioning, bg-secondary, border, shadow     |
| `.msf-option`          | Full-width clickable row, hover highlight              |
| `.msf-checkbox`        | Custom 14x14 square, accent-primary when checked       |
| `.msf-separator`       | 1px border-default line between select-all and values  |

## Integration with Existing Code

### Changes to `ElementConfig.buildSelectElement()`

Replace the current method body. Instead of creating a `<select multiple>`, create a
`<multi-select-filter>` element:

```js
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
```

The return value is still an element appended to the `.filter-menu` flex container,
so `buildFilterMenu()` needs no changes.

### Changes to `ElementConfig.buildFilterMenu()`

Minimal change: cache the `<multi-select-filter>` element in
`this.filterSelectElements[key]` instead of the wrapper div. The existing caching
logic (`this.filterSelectElements[key] || this.buildSelectElement(key, me)`) works
unchanged.

When options need updating (new label values appear from fresh query results), set
`filter.options = newValues` and `filter.value = newValues` on the cached element
rather than rebuilding it.

### File Organization

The component class (`MultiSelectFilter`) should be defined in `static/lib.mjs`
alongside the existing `SpanSelector`, `GraphPlot`, and `LogViewer` classes. Follow
the same patterns:
- `static elementName = "multi-select-filter";`
- `static registerElement()` with guard
- Call `MultiSelectFilter.registerElement()` at module level
- Export the class

CSS additions go in `static/site.css` in a new section.

## Edge Cases

| Scenario                     | Behavior                                                |
|------------------------------|---------------------------------------------------------|
| 0 options                    | Component not rendered (existing `length > 1` guard)    |
| 1 option                     | Component not rendered (existing guard)                 |
| Very long option text        | Truncate with `text-overflow: ellipsis` in dropdown     |
| Many options (50+)           | Scroll within `max-height: 240px`; consider adding a search/filter input at top if this becomes common (future enhancement) |
| Options update while open    | Close dropdown, rebuild option list, preserve selections where values still exist |
| Rapid open/close             | No debounce needed; toggle is synchronous                |
| Multiple filters in one row  | Each is independent; flex-wrap handles overflow          |
| Mobile / touch               | Tap to open, tap option to toggle, tap outside to close. No hover states on touch. |

## Testing Considerations

- Unit test: setting `options` and `value` properties produces correct DOM
- Unit test: clicking an option toggles selection and fires `change` event
- Unit test: "Select all" toggles all on/off
- Unit test: clicking outside closes dropdown
- Unit test: keyboard navigation (ArrowDown, ArrowUp, Space, Escape, Enter)
- Integration test: verify `filteredLabelSets` is updated correctly when used with `ElementConfig`
- Visual test: verify appearance in both dark and light mode

## Migration Notes

This is a drop-in replacement. The external API consumed by `ElementConfig` changes
from a wrapper `<div>` containing a `<select multiple>` to a `<multi-select-filter>`
element. The `buildSelectElement` method is the only code that needs modification.

No changes are needed to:
- `buildFilterMenu()` (already works with any element)
- `filteredLabelSets` (same data structure)
- `reset()` call pattern (same trigger mechanism)
- Query construction in `buildUri()` (consumes `filteredLabelSets` unchanged)
- Backend code (filters are purely frontend)
