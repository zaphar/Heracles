# Heracles Visual Design Specification

Version: 1.0
Date: 2026-04-08

---

## 1. Color System

### Design Philosophy

Dark mode is the primary surface. The palette draws from a cool, muted base (influenced by Solarized but tightened for better contrast ratios and a more contemporary feel) with a single saturated accent for interactive elements. Status colors follow ops conventions (green = healthy, amber = warning, red = critical).

### Dark Mode (Primary)

```
--bg-primary:         #0f1419    /* App background - near-black with warm undertone */
--bg-secondary:       #1a2028    /* Card/panel surfaces */
--bg-tertiary:        #232b35    /* Elevated surfaces: dropdowns, tooltips, hover states */
--bg-sidebar:         #111820    /* Sidebar background - slightly darker than primary */
--bg-input:           #1a2028    /* Input field background */

--text-primary:       #d4d9e0    /* Primary text - high contrast on dark bg */
--text-secondary:     #8b95a3    /* Secondary text - labels, timestamps, metadata */
--text-muted:         #5c6670    /* Muted text - placeholders, disabled states */
--text-inverse:       #0f1419    /* Text on accent-colored backgrounds */

--border-default:     #2a3340    /* Default borders - subtle separation */
--border-strong:      #3a4550    /* Emphasized borders - active cards, focused inputs */

--accent-primary:     #3b82f6    /* Primary accent - links, buttons, active nav */
--accent-hover:       #60a5fa    /* Accent hover state */
--accent-muted:       rgba(59, 130, 246, 0.15)  /* Accent background tint */

--status-healthy:     #22c55e    /* Green - healthy/success */
--status-warning:     #eab308    /* Amber - warning */
--status-critical:    #ef4444    /* Red - critical/error */
--status-info:        #3b82f6    /* Blue - informational */

--plot-bg:            #141a22    /* Chart plot area background */
--plot-grid:          #1e2730    /* Chart gridlines - barely visible */
--plot-axis:          #3a4550    /* Chart axis lines and labels */

--scrollbar-thumb:    #2a3340
--scrollbar-track:    #111820
```

### Light Mode

```
--bg-primary:         #f8f9fb
--bg-secondary:       #ffffff
--bg-tertiary:        #f0f2f5
--bg-sidebar:         #f0f2f5
--bg-input:           #ffffff

--text-primary:       #1a2028
--text-secondary:     #5c6670
--text-muted:         #8b95a3
--text-inverse:       #ffffff

--border-default:     #e2e5ea
--border-strong:      #cbd0d8

--accent-primary:     #2563eb
--accent-hover:       #1d4ed8
--accent-muted:       rgba(37, 99, 235, 0.08)

--status-healthy:     #16a34a
--status-warning:     #ca8a04
--status-critical:    #dc2626
--status-info:        #2563eb

--plot-bg:            #ffffff
--plot-grid:          #f0f2f5
--plot-axis:          #8b95a3

--scrollbar-thumb:    #cbd0d8
--scrollbar-track:    #f0f2f5
```

### Mode Detection

Use `prefers-color-scheme: dark` media query (existing approach). Dark mode is defined in `:root`, light mode overrides in `@media (prefers-color-scheme: light)`. This makes dark the default for any user-agent that does not advertise a preference.

---

## 2. Typography

### Font Stack

```
--font-sans:   -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono:   "SF Mono", "Cascadia Code", "JetBrains Mono", Menlo, Monaco, Consolas, "Courier New", monospace;
```

Use `--font-sans` for all UI chrome: headings, labels, nav, buttons. Use `--font-mono` for data: log lines, metric values, timestamps, code, query text.

### Type Scale

All sizes in `rem` with `1rem = 16px` base.

| Token              | Size    | Weight | Line-height | Use                                    |
|--------------------|---------|--------|-------------|----------------------------------------|
| `--type-h1`        | 1.25rem | 600    | 1.3         | Dashboard title                        |
| `--type-h2`        | 0.9375rem | 600  | 1.3         | Graph/log section titles               |
| `--type-body`      | 0.8125rem | 400  | 1.5         | General UI text                        |
| `--type-label`     | 0.75rem | 500    | 1.4         | Form labels, sidebar nav items         |
| `--type-small`     | 0.6875rem | 400  | 1.4         | Timestamps, metadata, secondary info   |
| `--type-mono`      | 0.75rem | 400    | 1.5         | Log lines, metric values               |
| `--type-mono-sm`   | 0.6875rem | 400  | 1.4         | Log timestamps, label metadata         |

### Heading Treatment

- `h1` (dashboard title): `--type-h1`, `--text-primary`, no text-transform. Compact: 4px bottom margin.
- `h2` (card titles): `--type-h2`, `--text-secondary`, uppercase tracking `0.03em`. Sits inside card header area.

---

## 3. Layout

### Overall Structure

```
+----------------------------------------------+
| Sidebar (fixed)  |  Main Content (scrollable) |
| 220px            |  flex: 1                   |
|                  |                             |
| [nav items]      |  [dashboard header]         |
|                  |  [span-selector]            |
|                  |  [graph cards]              |
|                  |  [log cards]                |
+----------------------------------------------+
```

### Sidebar

- Width: `220px`, fixed position, full height.
- Background: `--bg-sidebar`.
- Top area: "Heracles" wordmark or app name, `--type-label`, `--text-muted`, uppercase, `0.05em` tracking. Padding: `20px 16px 12px`.
- Nav list: vertical stack of dashboard links. No bullet points - clean list.
- Border-right: `1px solid var(--border-default)`.

### Main Content Area

- Left margin: `220px` (clears sidebar).
- Padding: `24px 32px`.
- Max-width: none (fills available space - ops dashboards benefit from width).
- Overflow-y: auto (main scroll context).

### Dashboard Header

- Dashboard title (`h1`) + span-selector on the same horizontal line, space-between alignment.
- Sticky top: `0`, background: `--bg-primary`, z-index: `100`, bottom border: `1px solid var(--border-default)`.
- Padding: `12px 0 16px`.
- This keeps time controls always visible while scrolling through graphs.

### Card Grid

- Graph and log cards stack vertically, full width.
- Gap between cards: `16px`.
- Each card is a self-contained block with its own header and content area.

### Responsive Behavior

At viewport widths below `768px`:
- Sidebar collapses to a horizontal nav bar at the top (height: `48px`), dashboard names in a horizontal scrollable row.
- Main content becomes full width, padding reduces to `16px`.
- Graph cards scale down; Plotly responsive mode handles chart resizing.
- Log container width becomes `100%` (remove the fixed `120em` width).

---

## 4. Component Styling

### 4.1 Sidebar Navigation

```css
.sidebar {
    width: 220px;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border-default);
    padding: 0;
    overflow-y: auto;
    z-index: 200;
}

.sidebar-header {
    padding: 20px 16px 12px;
    font-family: var(--font-sans);
    font-size: var(--type-label);     /* 0.75rem */
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.sidebar-nav-item {
    display: block;
    padding: 8px 16px;
    font-family: var(--font-sans);
    font-size: var(--type-label);     /* 0.75rem */
    font-weight: 500;
    color: var(--text-secondary);
    text-decoration: none;
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.sidebar-nav-item:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
}

.sidebar-nav-item.active {
    color: var(--accent-primary);
    background: var(--accent-muted);
    border-left-color: var(--accent-primary);
}
```

### 4.2 Dashboard Header + Span Selector

The dashboard title and time controls share a single sticky bar.

```css
.dashboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0 16px;
    position: sticky;
    top: 0;
    background: var(--bg-primary);
    z-index: 100;
    border-bottom: 1px solid var(--border-default);
    margin-bottom: 16px;
}

.dashboard-title {
    font-family: var(--font-sans);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
}
```

**Span Selector** - Inline control group, right-aligned in the header:

```css
span-selector {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-sans);
    font-size: var(--type-small);   /* 0.6875rem */
}

span-selector input {
    background: var(--bg-input);
    border: 1px solid var(--border-default);
    border-radius: 4px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--type-mono-sm);  /* 0.6875rem */
    padding: 6px 8px;
    width: 140px;
    transition: border-color 0.15s ease;
}

span-selector input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-muted);
}

span-selector label,
span-selector span {
    color: var(--text-secondary);
    font-size: var(--type-small);
    font-weight: 500;
    white-space: nowrap;
}

span-selector button {
    background: var(--accent-primary);
    color: var(--text-inverse);
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    font-family: var(--font-sans);
    font-size: var(--type-small);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
}

span-selector button:hover {
    background: var(--accent-hover);
}

span-selector button:active {
    transform: translateY(1px);
}
```

### 4.3 Graph Cards

Each graph (time-series or scalar) sits in a card container.

```css
.graph-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 16px;
}

.graph-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-default);
}

.graph-card-title {
    font-family: var(--font-sans);
    font-size: var(--type-h2);    /* 0.9375rem */
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin: 0;
}

.graph-card-header a {
    font-family: var(--font-sans);
    font-size: var(--type-small);
    color: var(--text-muted);
    text-decoration: none;
    transition: color 0.15s ease;
}

.graph-card-header a:hover {
    color: var(--accent-primary);
}

.graph-card-body {
    padding: 8px;
}
```

**Plotly Layout Overrides** (applied via JS, referencing CSS vars):

```javascript
layout = {
    plot_bgcolor:  getCssVariableValue('--plot-bg'),
    paper_bgcolor: getCssVariableValue('--bg-secondary'),
    font: {
        family: getCssVariableValue('--font-sans'),
        color:  getCssVariableValue('--text-secondary'),
        size:   11
    },
    xaxis: {
        gridcolor:  getCssVariableValue('--plot-grid'),
        linecolor:  getCssVariableValue('--plot-axis'),
        zerolinecolor: getCssVariableValue('--plot-grid')
    },
    margin: { t: 8, r: 16, b: 40, l: 48 },
    legend: { orientation: 'v', font: { size: 10 } }
};
```

### 4.4 Log Viewer

```css
.log-container {
    height: 400px;
    width: 100%;                   /* Changed from 120em to full width */
    margin-top: 0;
    border: none;                  /* Border handled by parent card */
    border-radius: 0;
    overflow: auto;
    background: var(--plot-bg);
    font-family: var(--font-mono);
    font-size: var(--type-mono);   /* 0.75rem */
    position: relative;
    box-sizing: border-box;
}

.log-lines {
    padding: 4px 0;
    color: var(--text-primary);
    min-width: 100%;
    box-sizing: border-box;
}

.log-line {
    margin-bottom: 0;
    padding: 2px 12px;
    border-left: 2px solid transparent;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.1s ease;
}

.log-line:hover {
    border-left-color: var(--accent-primary);
    background: var(--accent-muted);
}

.log-line.expanded {
    background: rgba(59, 130, 246, 0.08);
}

.log-timestamp {
    color: var(--text-muted);
    margin-right: 12px;
    font-size: var(--type-mono-sm);  /* 0.6875rem */
    flex-shrink: 0;
    font-weight: 400;
    user-select: all;
}

.log-content {
    white-space: nowrap;
    color: var(--text-primary);
}

.log-labels {
    display: none;
    margin: 4px 0 4px 24px;
    padding: 6px 10px;
    background: var(--bg-tertiary);
    border-radius: 3px;
    border-left: 2px solid var(--accent-primary);
    font-size: var(--type-mono-sm);
    color: var(--text-secondary);
}

.log-labels.visible {
    display: block;
}
```

**Log Table (Fields mode):**

```css
.log-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--plot-bg);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--type-mono);
}

.log-table-header {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border-strong);
    font-weight: 600;
    font-size: var(--type-mono-sm);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    position: sticky;
    top: 0;
    z-index: 1;
}

.log-table-row {
    border-bottom: 1px solid var(--border-default);
}

.log-table-row:hover {
    background: var(--accent-muted);
}

.log-table-cell {
    padding: 6px 12px;
    border-right: 1px solid var(--border-default);
    vertical-align: top;
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.log-table-cell:last-child {
    border-right: none;
}
```

### 4.5 Scalar Displays

Scalar values rendered as bar charts by Plotly follow the same card treatment as time-series graphs. No separate component needed - the card container handles it.

For scalar-only graphs, the Plotly layout should use reduced margins and larger font for the value labels:

```javascript
// When subplot type is Scalar
scalarLayout = {
    ...layout,
    margin: { t: 8, r: 16, b: 48, l: 16 },
    font: { ...layout.font, size: 13 }
};
```

### 4.6 Filter Select Elements

Multi-select dropdowns that appear when graphs have filterable labels.

```css
.filter-menu {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border-default);
}

select {
    background: var(--bg-input);
    border: 1px solid var(--border-default);
    border-radius: 4px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--type-mono-sm);
    padding: 4px 6px;
}

select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-muted);
}

option {
    background: var(--bg-secondary);
    color: var(--text-primary);
    padding: 4px 8px;
}

option:checked,
option[selected] {
    background: var(--accent-muted);
    color: var(--accent-primary);
}
```

### 4.7 General Form Controls

```css
input, textarea, select, button {
    background: var(--bg-input);
    border: 1px solid var(--border-default);
    color: var(--text-primary);
    padding: 6px 10px;
    border-radius: 4px;
    font-family: var(--font-sans);
    font-size: var(--type-body);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-muted);
}

button {
    cursor: pointer;
    font-weight: 600;
}
```

---

## 5. Micro-Interactions

### Transitions

All interactive state changes use `transition: 0.15s ease` unless noted. This is fast enough to feel instant but smooth enough to feel intentional.

| Element             | Property                        | Duration | Easing |
|---------------------|---------------------------------|----------|--------|
| Nav items           | color, background, border-color | 150ms    | ease   |
| Buttons             | background                      | 150ms    | ease   |
| Button press        | transform (translateY 1px)      | 50ms     | ease   |
| Input focus         | border-color, box-shadow        | 150ms    | ease   |
| Log line hover      | background                      | 100ms    | ease   |
| Log labels expand   | (none - display toggle)         | instant  | --     |
| Card hover          | (none - cards do not hover)     | --       | --     |

### Focus Indicators

All focusable elements receive:
```css
:focus-visible {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-muted);
}
```

This provides visible focus rings for keyboard navigation while suppressing them for mouse clicks (`:focus-visible` vs `:focus`).

### Loading States

When graphs or logs are fetching data, display a subtle pulsing indicator. This can be implemented with a CSS animation on the card body area:

```css
@keyframes pulse-loading {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 0.7; }
}

.graph-card-body.loading::before {
    content: '';
    display: block;
    height: 2px;
    background: var(--accent-primary);
    animation: pulse-loading 1.5s ease-in-out infinite;
    border-radius: 1px;
    margin-bottom: 8px;
}
```

### Scrollbar Styling

```css
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: var(--border-strong);
}
```

---

## 6. Spacing System

Use a 4px base unit. Common spacing values:

| Token   | Value | Use                                              |
|---------|-------|--------------------------------------------------|
| `--sp-1`| 4px   | Tight gaps: within log lines, between inline items |
| `--sp-2`| 8px   | Standard gap: between form elements, card padding  |
| `--sp-3`| 12px  | Section padding, nav item vertical padding          |
| `--sp-4`| 16px  | Card padding, gap between cards, sidebar padding    |
| `--sp-6`| 24px  | Main content padding, major section gaps            |
| `--sp-8`| 32px  | Main content horizontal padding                     |

---

## 7. Elevation and Borders

No box-shadows. Depth is communicated through background color layering:

- `--bg-primary` (base layer)
- `--bg-secondary` (cards, panels)
- `--bg-tertiary` (elevated: hovers, dropdowns, expanded labels)

Separation between elements uses 1px solid borders with `--border-default`. Strong borders (`--border-strong`) only for focused inputs and active card states.

Border-radius: `4px` for inputs and small elements, `6px` for cards.

---

## 8. Implementation Notes

### CSS Variable Organization

All design tokens live in `:root`. The dark palette is the default. Light mode overrides in a media query block:

```css
:root {
    /* Dark mode tokens (default) */
    --bg-primary: #0f1419;
    /* ... all dark tokens ... */
}

@media (prefers-color-scheme: light) {
    :root {
        --bg-primary: #f8f9fb;
        /* ... all light tokens ... */
    }
}
```

### Migration Path from Current CSS

The current `site.css` uses different variable names (`--background-color`, `--text-color`, `--paper-background-color`, etc.). The migration should:

1. Add the new variables alongside the old ones.
2. Update component styles to reference the new tokens.
3. Remove old variables once all references are updated.
4. The existing `body *` padding rule (`padding-left: .3em; padding-right: .3em`) should be removed - it applies padding to every element indiscriminately. Replace with targeted padding on specific components.

### Plotly Chart Color Sequence

For multi-series charts, use this trace color sequence to ensure distinctness on dark backgrounds:

```
#3b82f6  (blue)
#22c55e  (green)
#f59e0b  (amber)
#ef4444  (red)
#a855f7  (purple)
#06b6d4  (cyan)
#f97316  (orange)
#ec4899  (pink)
```

### Sidebar Active State

When HTMX swaps dashboard content, add the `.active` class to the corresponding sidebar nav item. This can be handled by listening to `htmx:afterSwap` and toggling classes based on the URL, or by re-rendering the sidebar with active state server-side.

### Embed Pages

Embed routes (`/embed/dash/:id/graph/:id`, `/embed/dash/:id/log/:id`) should render without the sidebar or dashboard header. They get just the card body content on `--bg-primary` background. The existing embed route structure supports this already.

---

## 9. Accessibility

- All text meets WCAG AA contrast ratios (4.5:1 for body text, 3:1 for large text).
  - `--text-primary` (#d4d9e0) on `--bg-primary` (#0f1419): ratio ~12:1.
  - `--text-secondary` (#8b95a3) on `--bg-primary` (#0f1419): ratio ~5.5:1.
  - `--text-muted` (#5c6670) on `--bg-primary` (#0f1419): ratio ~3.2:1 (decorative/non-essential only).
- Focus indicators are visible (2px accent ring).
- Interactive elements have minimum 44x44px touch targets on mobile.
- Log viewer is keyboard-navigable (individual lines are focusable).
- Status colors are never the sole indicator - always paired with text or icons.
