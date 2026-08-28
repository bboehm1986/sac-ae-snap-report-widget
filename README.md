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
  library — SAC widget iframes are CSP-strict). Light theme only (see Known
  limitations below — a dark/light toggle was tried and dropped), a "Mock
  Data — Preview" badge that flips to "Live" once real data is bound, and
  client-side Status / Synod-Region filters over whatever's currently bound.
  Falls back to built-in mock data when no data binding is bound, so the
  whole layout is reviewable standalone.
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
- ✅ Hosted on GitHub Pages, registered in SAC, confirmed rendering on the
  Story canvas in both Edit and View mode on mock data.
- ⚠️ Known limitation found during that testing — see below.
- ⏳ Datasphere views — **not built yet**. `DATASPHERE_VIEW_SPEC.md` is a
  handoff spec; the actual views need SAP Datasphere Web IDE access (see
  spec's "Next steps" section).
- ⏳ SAC model + data binding — blocked on the above.

## Known limitation: no internal interactivity in View mode

Confirmed by testing directly in SAC (Optimized story): the widget's
internal `<button>`/`<select>` controls receive click/change events normally
in **Edit** mode, but **View** mode delivers none of them — confirmed via a
completely silent DevTools console on click (no error, no log, nothing),
ruling out a JS bug. This isn't something fixable from the widget's own code
— SAC's Optimized-story View mode apparently doesn't forward internal DOM
events into a custom widget's shadow DOM, at least not in this
configuration.

**Consequence:** the dark/light theme toggle was removed entirely (dropped
2026-08-28) rather than ship a control that only works in Edit mode — the
widget now renders light theme only. The **Status / Synod-Region filter
dropdowns are still present in the code and still visually functional in
Edit mode, but have the identical problem in View mode** — they're not yet
removed or replaced, since that's a slightly bigger decision (see below).

**Recommended next step, not yet done:** replace the in-widget filters with
SAC's native **Input Control** widget wired to the Story's actual data
source(s) — that's SAP's own supported filtering mechanism and doesn't
depend on a custom widget receiving internal events at all. The widget would
then be purely a display component reacting to `onCustomWidgetAfterUpdate`,
which is already confirmed to work correctly end-to-end. Worth raising the
underlying platform behavior with SAP support/community separately, but
don't block on that.

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
