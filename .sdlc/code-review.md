# Heracles Code Review

**Date:** 2026-04-08
**Scope:** Full codebase review
**Reviewer:** Claude Code (Codebase Design Critic)

---

## Overall Assessment

Heracles is a well-scoped, cleanly architected project that delivers on its promise of a stateless, single-binary dashboard viewer. The code is readable, the module boundaries are sensible, and the recent visual refresh demonstrates good design taste. The findings below are primarily about hardening correctness and eliminating a security issue; the structural foundation is solid.

---

## CRITICAL / HIGH Findings

### 1. [CRITICAL] `eval()` in `formatName` -- Code Injection via Config

**Files:** `static/lib.mjs` (line 73)

The `formatName` function uses `eval(formatter)` to execute the `name_format` string from the dashboard configuration. While the config is file-based and admin-controlled, this is still a live code injection path:

```javascript
// line 73
name = eval(formatter);
```

If a config file is ever sourced from an untrusted location, shared publicly, or copy-pasted from the internet, arbitrary JavaScript will execute in every viewer's browser. The `name_format` string also has implicit access to the `config` and `labels` variables in the closure scope, which is undocumented and fragile.

Even in a homelab context, `eval` is a recognized anti-pattern that static analysis tools will flag, CSP policies will block, and future maintainers will distrust.

**Category:** Security / Input Validation
**Impact:** Architecture -- any future CSP hardening or config-sharing feature will be blocked by this.

---

### 2. [HIGH] Panicking in Request Handlers -- Server Crash on Bad Input

**Files:** `src/routes.rs` (lines 61-68, 84-91, 196-201, 209-216, 227-228), `src/dashboard.rs` (line 185)

Every API and UI handler uses `.expect()` to unwrap user-controlled index lookups, meaning an out-of-bounds `dash_idx` or `graph_idx` from the URL will panic and crash the Axum task (or worse, abort the process depending on panic configuration):

```rust
// routes.rs line 61-68
let dash = config
    .get(dash_idx)
    .expect(&format!("No such dashboard index {}", dash_idx));
let log = dash
    .logs
    .as_ref()
    .expect("No logs in this dashboard")
    .get(loki_idx)
    .expect(&format!("No such log query {}", loki_idx));
```

Additionally, in `dashboard.rs` line 185:
```rust
panic!("Loki query status: {}", response.status)
```

This `panic!` on a non-success Loki response will crash the handler when the upstream Loki server returns an error status.

These should return proper HTTP error responses (404/502) instead of panicking.

**Category:** Correctness / Error Handling
**Impact:** Implementation -- each `.expect()` site needs to return an HTTP error.

---

### 3. [HIGH] Filter Values Injected Unsanitized into PromQL

**Files:** `src/query/prom.rs` (lines 77-114)

The `get_query` method builds a PromQL label matcher by directly interpolating user-supplied `filter-*` query parameters into the query string:

```rust
// prom.rs lines 86-91
filter_string.push_str(*k);   // from URL query param key
filter_string.push_str("=~");
filter_string.push('"');
filter_string.push_str(*v);   // from URL query param value
filter_string.push('"');
```

A request like `?filter-foo=bar"%2C__name__%3D~".%2B"` would break out of the quoted value and inject arbitrary PromQL label matchers. While Prometheus itself limits the blast radius (no data mutation), an attacker can extract data from any metric series on the Prometheus instance.

**Category:** Security / Input Validation
**Impact:** Implementation -- filter values need escaping (at minimum, escape double quotes and backslashes in values).

---

### 4. [HIGH] `first` Variable Never Updated in Filter Loop -- All Filters Get Comma-Separated Incorrectly

**Files:** `src/query/prom.rs` (lines 78-91)

```rust
let first = true;  // line 78 -- never mutated
let mut filter_string = String::new();
if let Some(filters) = self.filters {
    for (k, v) in filters.iter() {
        if !first {            // this branch is NEVER taken
            filter_string.push_str(",");
        }
        // ...
    }
}
```

The `first` variable is immutable and always `true`, so the comma separator between multiple filter matchers is never inserted. With multiple filters, the generated PromQL will be `key1=~"val1"key2=~"val2"` -- a syntax error that Prometheus will reject.

**Category:** Correctness / Edge Case
**Impact:** Implementation -- simple fix (make `first` mutable and set to `false` after first iteration).

---

## MEDIUM Findings

### 5. [MEDIUM] Validation Loop Returns After First Dashboard

**Files:** `src/main.rs` (lines 92-99)

```rust
if args.validate {
    if !args.offline {
        for dash in config.iter() {
            validate(&dash).await?;
            info!("All Queries successfully run against source");
            return Ok(());  // <-- exits after first dashboard
        }
    }
}
```

The `return Ok(())` inside the loop causes only the first dashboard to be validated. If the config contains multiple dashboards, the rest are silently skipped. The success message "All Queries successfully run" is misleading.

**Category:** Correctness / Edge Case
**Impact:** Implementation

---

### 6. [MEDIUM] `parse::<f64>().expect()` on External Data

**Files:** `src/query/loki.rs` (lines 74, 99)

Timestamps from Loki responses are parsed with `.expect("Invalid f64 type")`, which will panic if the Loki API ever returns a non-numeric timestamp string:

```rust
timestamp: value.0.parse::<f64>().expect("Invalid f64 type"),
```

Since this data comes from an external HTTP service, it should be handled with `?` or a default.

**Category:** Correctness / Error Handling
**Impact:** Implementation

---

### 7. [MEDIUM] Duplicate Span-Application Logic Across Three Connection Types

**Files:** `src/dashboard.rs` (lines 287-293, 314-319, 340-345)

The "query span > graph span > dashboard span" precedence logic is copy-pasted identically three times (for `PromQueryConn`, `LokiConn`, and `LogsqlConn`). This is noted in a code comment (line 118: "haven't hit the rule of three yet"), but in fact it already appears three times. A shared trait or helper function would eliminate this duplication.

**Category:** Consistency / Code Duplication
**Impact:** Implementation

---

### 8. [MEDIUM] `LogsqlConn` Ignores `query_type` Parameter

**Files:** `src/query/logsql.rs` (line 118)

```rust
pub fn new<'a: 'conn>(url: &'a str, query: &'a str, _query_type: QueryType) -> Self {
```

The `_query_type` parameter is accepted but ignored. The `LogStream` struct requires a `query_type` field which is passed through but has no effect on VictoriaLogs queries. This is confusing for users who set `query_type: Scalar` expecting different behavior.

**Category:** Structural / API Surface
**Impact:** Implementation

---

### 9. [MEDIUM] No `Content-Type` Header for CSS Response

**Files:** `src/routes.rs` (lines 400-408)

The CSS route returns the file content as a plain string. While Axum may infer `text/plain`, browsers may not apply the stylesheet without a proper `Content-Type: text/css` header. The JS routes correctly use `javascript_response()` to set Content-Type, but CSS does not get the same treatment.

```rust
get(|| async {
    return include_str!("../static/site.css");
})
```

**Category:** Correctness / Consistency
**Impact:** Implementation

---

### 10. [MEDIUM] Unbounded `displayedLines` Set Memory Growth

**Files:** `static/lib.mjs` (lines 929-962)

The `#displayedLines` Set grows unboundedly during the log line deduplication check. The cleanup logic on line 953 only fires when the set exceeds `maxLines * 1.2`, and the reconstruction on lines 957-959 is fragile -- it re-derives line IDs from DOM element text content, which may not match the original ID format (especially for StreamInstant where the timestamp format differs from Stream).

**Category:** Correctness / Resource Lifecycle
**Impact:** Implementation

---

## LOW Findings

### 11. [LOW] `var` Declarations in ES Module Code

**Files:** `static/lib.mjs` (throughout -- lines 17, 18, 70, 75-78, 171, 249, 251-253, etc.)

The module uses `var` extensively where `let` or `const` would be appropriate. This is not a bug, but `var` has function-scoped hoisting that can cause subtle issues, and it is inconsistent with the `let`/`const` usage elsewhere in the same file.

**Category:** Consistency / Pattern Consistency
**Impact:** Implementation

---

### 12. [LOW] `ansiToHtml` Produces Unclosed `<span>` Tags

**Files:** `static/lib.mjs` (lines 32-61)

The function appends a closing `</span>` at line 60, but each ANSI code replacement either opens a `<span>` or inserts a `</span>`. An input with N color codes will produce N-1 unclosed spans (or mismatched nesting). The trailing `</span>` only closes the last one.

For example, `"\x1b[31mred\x1b[32mgreen"` produces:
`<span style="color: red;">red<span style="color: green;">green</span>`

The first span is never closed.

**Category:** Correctness / Edge Case
**Impact:** Implementation

---

### 13. [LOW] Inconsistent Naming: `graph_span` vs `query_span` vs `span`

**Files:** `src/dashboard.rs`, `src/routes.rs`

The concept of "time span" is referred to as `graph_span`, `query_span`, `span`, and `GraphSpan` across different contexts. In `dashboard.rs` the dashboard-level span is the first parameter (`graph_span`) and the URL parameter span is the second parameter (`query_span`), but the function parameter name `graph_span` actually refers to the *dashboard's* span, not a graph's span. This creates confusion when reading the precedence logic.

**Category:** Consistency / Naming
**Impact:** Implementation

---

### 14. [LOW] `serde_yaml` is Deprecated

**Files:** `Cargo.toml` (line 22)

The `serde_yaml` crate (v0.9.31) has been deprecated in favor of alternatives. It will not receive further updates. Consider migrating to an actively maintained YAML parsing library.

**Category:** Structural / Dependency Health
**Impact:** Implementation

---

### 15. [LOW] Static Assets Embedded at Compile Time with No Cache Headers

**Files:** `src/routes.rs` (lines 380-408)

The JS and CSS assets are served via `include_str!` with no `Cache-Control`, `ETag`, or `Last-Modified` headers. Every page load re-transfers the full Plotly library (~3.5MB minified). For a homelab this is tolerable, but adding basic cache headers would significantly improve load times.

**Category:** Structural / API Surface
**Impact:** Implementation

---

## Strengths

- Clean module boundaries: query backends are properly isolated behind a common result type
- The `PlotConfig` / `AxisDefinition` pass-through from YAML config to Plotly is elegant
- CSS design system is well-organized with proper custom properties, dark/light modes, and responsive breakpoints
- Web components follow the standard lifecycle correctly (`connectedCallback`, `disconnectedCallback`, `observedAttributes`)
- JSDoc type definitions in `lib.d.js` provide good documentation for the JS API shape
- The builder pattern for query connections (`with_span`, `with_limit`, `with_filters`) is idiomatic and readable

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 3     |
| Medium   | 6     |
| Low      | 5     |

**Top priorities:** Fix the `eval()` usage (finding 1), replace `.expect()` with proper HTTP errors (finding 2), sanitize PromQL filter injection (finding 3), and fix the `first` variable bug (finding 4).
