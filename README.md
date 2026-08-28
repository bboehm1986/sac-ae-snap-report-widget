# AE Snap Report — SAC Custom Widget

A single custom widget for SAP Analytics Cloud that renders the "Traditional
Snap Report" dashboard: a high-level daily view of Annual Enrollment (AE)
progress. Built the same way as the [Hello World
POC](../sac-hello-world-widget) — a `widget.json` manifest plus a
web-component JS file — but with real dashboard content instead of a single
label, and three real data bindings instead of none.

**Before wiring real data**, read
[`DATASPHERE_VIEW_SPEC.md`](DATASPHERE_VIEW_SPEC.md) — it defines exactly
what Datasphere view(s) this widget expects, tracing every field back to the
already-approved SAP CDS views it reuses (no new business logic invented).
It also documents two **open items that are not yet resolved** (church
membership YoY count source, Synod/Region data access) — the widget itself
surfaces these as a standing notice until they're settled.

## Files

- `widget.json` — manifest: properties (`width`, `height`, `asOfLabel`),
  three data bindings (`employerStatus`, `dailyCounts`, `yoyComparison`),
  one exposed scripting method (`refresh`), and a reference to the hosted
  `main.js`.
- `main.js` — defines the `<com-porticobenefits-aesnapreport>` custom
  element. Parses the three data bindings and renders: Employer Selection
  KPI tiles (Total Set Up / Completed / % Complete / Non-Completed /
  Defaulted) with per-tile progress bars, an Of-Complete election-type
  breakdown, a Synod/Region breakdown, a YoY change-rate breakdown, and a
  hand-rolled inline SVG timeline bar chart (10/1–10/14, no external chart
  library — SAC widget iframes are CSP-strict). Dark theme by default with a
  light-mode toggle (`data-theme="light"` on the host element), a "Mock Data
  — Preview" badge that flips to "Live" once real data is bound, and
  client-side Status / Synod-Region filters over whatever's currently bound.
  Falls back to built-in mock data when no data binding is bound, so the
  whole layout — filters, theme toggle, and all — is reviewable standalone.
- `icon.svg` — icon shown in the SAC widget panel.
- `preview.html` — standalone local test harness; loads `main.js` and drives
  the widget through the same `onCustomWidgetBeforeUpdate` /
  `onCustomWidgetAfterUpdate` lifecycle hooks SAC uses, so verifying it here
  is a faithful test of the real update path.
- `DATASPHERE_VIEW_SPEC.md` — the data design this widget is built against:
  which Datasphere views feed which data binding, and the two open items
  still pending confirmation.

## Status of this build

- ✅ Widget scaffold, layout, and rendering logic — done, verified locally
  against mock data (see `preview.html`).
- ⏳ Datasphere views — **not built yet**. `DATASPHERE_VIEW_SPEC.md` is a
  handoff spec; the actual views need SAP Datasphere Web IDE access (see
  spec's "Next steps" section).
- ⏳ SAC model + data binding — blocked on the above.

## 1. Preview locally (no SAC needed)

```bash
python -m http.server 8420 --directory sac-ae-snap-report-widget
```

Then open `http://localhost:8420/preview.html`. You should see the full
dashboard rendered from the mock data baked into `main.js`.

## 2. Host `main.js` and `icon.svg`

Same pattern as the Hello World POC — host this folder on GitHub Pages
(`Settings > Pages`, source: branch `main`, folder `/root`). `widget.json`
already points at:

- `https://bboehm1986.github.io/sac-ae-snap-report-widget/main.js`
- `https://bboehm1986.github.io/sac-ae-snap-report-widget/icon.svg`

If `main.js` changes, recompute the `integrity` hash in `widget.json`:

```bash
openssl dgst -sha384 -binary main.js | openssl base64 -A
```

## 3. Register the widget in SAC

1. **System > Custom Widgets > Add Custom Widget (+)**.
2. Upload `widget.json`.
3. Name it (e.g. "AE Snap Report") and save.

## 4. Build the Datasphere views and SAC model

Follow `DATASPHERE_VIEW_SPEC.md` end to end — do not skip its two open
items. Once `DS_AE_SNAP_REPORT` (or the source-aligned views individually)
exist in Datasphere:

1. Build a SAC model on top.
2. Create three queries/data sources matching the shapes in
   `DATASPHERE_VIEW_SPEC.md` section 2 (employer status, daily counts, YoY).

## 5. Bind and place in a Story

1. Drag the widget onto a Story/Analytic Application canvas.
2. In the widget's data-binding panel, bind `employerStatus`, `dailyCounts`,
   and `yoyComparison` to the three queries from step 4.
3. Set the Story's refresh interval (real-time is a stretch goal — see
   `DATASPHERE_VIEW_SPEC.md` section 4 — start with scheduled refresh).
4. Confirm the tiles/chart match real numbers, not the mock data.

## Next steps beyond this build

- Catalogue `ZVHCM_AE_004Q` and `ZVHCM_AE_005Q` in the Data Product
  Catalogue (they're not there yet — see `DATASPHERE_VIEW_SPEC.md`).
- Resolve the employer→member join question for the election-type
  sub-breakdown (flagged in the spec).
- Once real data is flowing, revisit whether true real-time (vs. scheduled
  refresh) is actually worth the added complexity.
