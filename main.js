/*
    AE Snap Report — SAC Custom Widget

    Renders the "Traditional Snap Report" dashboard: a high-level daily view
    of Annual Enrollment (AE) progress. See DATASPHERE_VIEW_SPEC.md in this
    folder for exactly what each data binding below is meant to carry, and
    which SAP CDS view it traces back to.

    Data bindings (declared in widget.json), each following SAC's standard
    ResultSet row shape ({ data: [ { dimensions_0: {id,label}, ...,
    measures_0: {raw,formatted}, ... } ] }):

      - employerStatus  <- DS_EMPLOYER_ENROLLMENT_SUMMARY (rewritten
                            2026-09-10, extended 2026-09-11 for YoY — see
                            below, "Why one binding")
            dimensions_0 = Status (Success / Abandoned / Not Started /
                            In Progress / Needs Follow-up / "" for
                            election-type, HSA, YoY, or timeline rows)
            dimensions_1 = Synod/Region ("" for non-geography rows)
            dimensions_2 = Election_Category — carries several different
                            "kinds" of value depending on row-kind (see
                            dimensions_4 below to disambiguate):
                              - a Health_Plan_Bundle name (e.g. "Select
                                Copay", "Value HDHP") when dimensions_4
                                (Year) is populated — the same 4 bucket
                                names appear for both 2026 (from "2026
                                Employer Annual Elections") and 2027
                                (our own Gold) sides of the YoY comparison
                              - "HSA Annual - Elected 0" / "HSA Annual -
                                Elected >0" / "HSA One Time - Elected 0" /
                                "HSA One Time - Elected >0" — collapsed
                                2-bucket-per-type HSA scheme (replaced the
                                old 4-independent-field count 2026-09-11,
                                per Blair: Single+Family collapse into one
                                Annual bucket, OneTimeSingle+OneTimeFamily
                                into one One Time bucket)
                              - "Eligible Count" — employer eligible-
                                headcount YoY, from vEmployerEligibleCount
                              - "" for plain status/synod or timeline rows
            dimensions_3 = Date (Completed_Date; "" for all other row-
                            kinds) — Timeline data, added 2026-09-10
            dimensions_4 = Year — added 2026-09-11 for the YoY panel.
                            Populated only on Health_Plan_Bundle rows
                            (2027) / "Bucket" rows (2026, same bundle
                            names via a 2026-side regex parse) / "Eligible
                            Count" rows (2026 or 2027); "" on every other
                            row-kind (Status/Synod, HSA, Timeline)
            measures_0   = Employer Count (unused on "Eligible Count"
                            rows — that row-kind's total rides in
                            measures_1 instead, see below)
            measures_1   = Employee Count on Status/Synod rows; repurposed
                            to carry SUM(EligibleCount) on "Eligible
                            Count" rows specifically (optional/absent on
                            every other row-kind)

      - dailyCounts, yoyComparison — still declared in widget.json but no
        longer read by this widget's code. Why: SAC's Story Builder UI
        can only bind one model per custom widget through its
        point-and-click Builder panel — no UI path to configure a second
        or third named binding was found after extensive testing (2026-
        09-10). Timeline, and later the full YoY panel (health-plan
        bucket comparison, HSA collapse, eligible-count delta), were both
        folded into employerStatus above instead (same combined-cube
        pattern already used for Election Sub-Type — one row shape per
        "kind" of row, distinguished by which dimensions are populated,
        UNION ALL'd together in DS_EMPLOYER_ENROLLMENT_SUMMARY's own
        SQL). The `yoyComparison` binding's original design (member-level
        benefit-type/Y-N-changed shape) is now fully dead — superseded by
        the employer-level YoY design folded into employerStatus instead;
        kept declared in widget.json only for manifest compatibility, per
        the same deprecation pattern already used for dailyCounts.

    Until these are wired to real Datasphere-backed models, the widget
    renders from the MOCK_* constants below so the layout can be built and
    reviewed standalone (see preview.html).

    No in-widget filter controls by design: SAC's Optimized-story View mode
    doesn't deliver internal click/change events to a custom widget's shadow
    DOM (confirmed by testing — see README "Known limitation"), so any
    filter UI this widget drew itself would work in Edit mode and silently
    do nothing for the people actually viewing the Story. Filtering belongs
    in SAC's native Input Control, wired to the underlying data source(s) —
    this widget just renders whatever (already-filtered) data arrives
    through the three data bindings above.
*/
(function () {
    "use strict";

    // ---- Statuses — corrected 2026-09-10 to match GLD_AE_Employer_Enrollment's
    // real Enrollment_Status vocabulary (was still on AE_Employer Election's
    // original BR-1 vocabulary, which never matched anything from our real
    // source — Completed/Non-Completed silently showed 0 regardless of data) ----
    const COMPLETED_STATUSES = ["Success"];
    const DEFAULTED_STATUSES = []; // no real "Defaulted" status value exists yet — see BUILD_PLAN_VWEMPLOYERSAVES.md, "Not in this build"
    const OPEN_STATUSES = ["Abandoned", "Not Started", "In Progress", "Needs Follow-up"];

    // ---- Mock data (mirrors the real SAC ResultSet row shape) ----
    function row(dims, measures) {
        const out = {};
        dims.forEach((d, i) => { out["dimensions_" + i] = { id: d, label: d }; });
        measures.forEach((m, i) => { out["measures_" + i] = { raw: m, formatted: String(m) }; });
        return out;
    }

    // Updated 2026-09-10 to match GLD_AE_Employer_Enrollment's real
    // Enrollment_Status vocabulary (Success/Abandoned/Not Started/In
    // Progress/Needs Follow-up) — was still on AE_Employer Election's
    // original BR-1 vocabulary, which no longer matches anything real.
    // Extended 2026-09-11 with a 5th dimension (Year) and the new YoY
    // row-kinds — see header comment for the full shape.
    const MOCK_EMPLOYER_STATUS = { data: [
        row(["Success", "Southwestern Minnesota", "", "", ""], [53, 265]),
        row(["Not Started", "Southwestern Minnesota", "", "", ""], [5, 20]),
        row(["In Progress", "Southwestern Minnesota", "", "", ""], [2, 10]),
        row(["Abandoned", "Southwestern Minnesota", "", "", ""], [3, 12]),
        row(["Needs Follow-up", "Southwestern Minnesota", "", "", ""], [2, 8]),
        row(["Success", "Metropolitan Chicago", "", "", ""], [36, 361]),
        row(["Not Started", "Metropolitan Chicago", "", "", ""], [8, 50]),
        row(["In Progress", "Metropolitan Chicago", "", "", ""], [4, 25]),
        row(["Abandoned", "Metropolitan Chicago", "", "", ""], [2, 9]),
        row(["Needs Follow-up", "Metropolitan Chicago", "", "", ""], [2, 13]),
        row(["Success", "Southeastern Synod", "", "", ""], [18, 120]),
        row(["Not Started", "Southeastern Synod", "", "", ""], [4, 20]),
        row(["In Progress", "Southeastern Synod", "", "", ""], [3, 13]),
        row(["Abandoned", "Southeastern Synod", "", "", ""], [1, 4]),
        // Health-plan bucket breakdown, now carrying BOTH years for YoY —
        // combined into this same binding 2026-09-10, extended with Year
        // 2026-09-11, see header comment "Why one binding".
        row(["", "", "Value Copay", "", "2027"], [42]),
        row(["", "", "Select Copay", "", "2027"], [31]),
        row(["", "", "Value HDHP", "", "2027"], [22]),
        row(["", "", "Select HDHP", "", "2027"], [12]),
        row(["", "", "Value Copay", "", "2026"], [35]),
        row(["", "", "Select Copay", "", "2026"], [29]),
        row(["", "", "Value HDHP", "", "2026"], [28]),
        row(["", "", "Select HDHP", "", "2026"], [9]),
        // HSA — collapsed 2-bucket-per-type scheme, replaced the old 4
        // independent per-field counts 2026-09-11 (Annual = Single OR
        // Family; One Time = OneTimeSingle OR OneTimeFamily).
        row(["", "", "HSA Annual - Elected 0", "", ""], [66]),
        row(["", "", "HSA Annual - Elected >0", "", ""], [47]),
        row(["", "", "HSA One Time - Elected 0", "", ""], [98]),
        row(["", "", "HSA One Time - Elected >0", "", ""], [15]),
        // Eligible Count YoY — added 2026-09-11, from vEmployerEligibleCount.
        row(["", "", "Eligible Count", "", "2026"], [null, 1240]),
        row(["", "", "Eligible Count", "", "2027"], [null, 1310]),
        // Timeline data — folded into this same binding 2026-09-10 (was
        // MOCK_DAILY_COUNTS/dailyCounts, see header comment "Why one binding").
        row(["", "", "", "2026-10-01", ""], [14]),
        row(["", "", "", "2026-10-02", ""], [22]),
        row(["", "", "", "2026-10-03", ""], [19]),
        row(["", "", "", "2026-10-04", ""], [8]),
        row(["", "", "", "2026-10-05", ""], [3]),
        row(["", "", "", "2026-10-06", ""], [27]),
        row(["", "", "", "2026-10-07", ""], [31]),
        row(["", "", "", "2026-10-08", ""], [25]),
        row(["", "", "", "2026-10-09", ""], [18]),
        row(["", "", "", "2026-10-10", ""], [12]),
        row(["", "", "", "2026-10-11", ""], [4]),
        row(["", "", "", "2026-10-12", ""], [2]),
        row(["", "", "", "2026-10-13", ""], [30]),
        row(["", "", "", "2026-10-14", ""], [41]),
    ] };

    // MOCK_YOY / yoyComparison removed 2026-09-11 — that binding's design
    // (member-level Benefit Type / Changed Y-N flag) is dead, superseded
    // by the employer-level YoY rows now folded into MOCK_EMPLOYER_STATUS
    // above (Health_Plan_Bundle rows carrying Year, plus "Eligible Count"
    // rows). See header comment.

    // ---- Template ----
    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host {
                display: block;
                box-sizing: border-box;
                font-family: "72", "Segoe UI", Arial, sans-serif;

                /* Light mode only — SAC's View mode doesn't deliver internal
                   click/change events to this widget, so a manual dark/light
                   toggle couldn't work there. Dropped rather than shipped
                   broken; see README.

                   Glassmorphism/depth system: frosted, semi-transparent
                   surfaces over a soft gradient-mesh background, layered
                   shadows for elevation. --surface/--surface-2/--border are
                   translucent by design — see .tile/.panel for the
                   backdrop-filter that makes them read as "glass," and the
                   @supports fallback below for browsers without it. */
                --mesh-1: rgba(106, 92, 240, 0.16);
                --mesh-2: rgba(47, 111, 224, 0.12);
                --mesh-3: rgba(20, 151, 111, 0.10);
                --surface: rgba(255, 255, 255, 0.58);
                --surface-solid: #ffffff;
                --surface-2: rgba(23, 26, 35, 0.055);
                --border: rgba(255, 255, 255, 0.65);
                --text: #171a23;
                --text-soft: #5b6072;
                --accent: #6a5cf0;
                --accent-bg: rgba(106, 92, 240, 0.14);
                --success: #14976f;
                --success-bg: rgba(20, 151, 111, 0.14);
                --warning: #a5700c;
                --warning-bg: rgba(165, 112, 12, 0.14);
                --info: #2f6fe0;
                --info-bg: rgba(47, 111, 224, 0.14);
                --danger: #c94b4b;
                --danger-bg: rgba(201, 75, 75, 0.14);
                --glass-blur: blur(20px) saturate(180%);
                --shadow-card: 0 1px 1px rgba(23,26,35,0.03), 0 4px 12px -2px rgba(23,26,35,0.07), 0 14px 28px -10px rgba(23,26,35,0.10);
            }
            * { box-sizing: border-box; }

            .dashboard {
                width: 100%;
                height: 100%;
                overflow: auto;
                background:
                    radial-gradient(at 12% 8%, var(--mesh-1) 0%, transparent 45%),
                    radial-gradient(at 88% 14%, var(--mesh-2) 0%, transparent 45%),
                    radial-gradient(at 50% 100%, var(--mesh-3) 0%, transparent 50%),
                    #f4f5fa;
                color: var(--text);
                border-radius: 18px;
                padding: 18px;
            }

            /* Glass surface, shared by every card-like element. Fallback for
               browsers without backdrop-filter support raises the opacity
               to near-solid so it still reads correctly, just without blur. */
            .tile, .panel, .wave-card, .notice, .badge {
                backdrop-filter: var(--glass-blur);
                -webkit-backdrop-filter: var(--glass-blur);
            }
            @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
                .tile, .panel, .wave-card, .notice { background: rgba(255,255,255,0.94) !important; }
            }

            /* ---- Header ---- */
            .topbar {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 12px;
                margin-bottom: 18px;
            }
            .eyebrow {
                font-size: 10.5px;
                font-weight: 600;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: var(--text-soft);
                margin-bottom: 4px;
            }
            .topbar h1 {
                font-size: 19px;
                font-weight: 700;
                margin: 0;
                display: inline;
            }
            .titlewrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
            .badge {
                font-size: 10.5px;
                font-weight: 600;
                letter-spacing: 0.01em;
                padding: 3px 9px;
                border-radius: 100px;
                border: 1px solid;
                white-space: nowrap;
            }
            .badge.accent { color: var(--accent); border-color: rgba(106,92,240,0.35); background: var(--accent-bg); }
            .badge.warning { color: var(--warning); border-color: rgba(165,112,12,0.35); background: var(--warning-bg); }
            .asof { font-size: 11px; color: var(--text-soft); margin-top: 2px; }

            /* ---- Section titles ---- */
            .section-title {
                font-size: 11.5px;
                font-weight: 700;
                color: var(--text-soft);
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin: 22px 0 8px;
            }

            /* ---- KPI tiles ---- */
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 12px;
            }
            .tile {
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 14px;
                padding: 14px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                box-shadow: var(--shadow-card);
            }
            .tile .label {
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                color: var(--text-soft);
            }
            .tile .value {
                font-size: 26px;
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                color: var(--text);
            }
            .tile .sub { font-size: 11px; color: var(--text-soft); margin-top: -4px; }
            .tile .bar-track {
                height: 5px;
                border-radius: 4px;
                background: var(--surface-2);
                box-shadow: inset 0 1px 2px rgba(23,26,35,0.10);
                overflow: hidden;
                margin-top: 2px;
            }
            .tile .bar-fill { height: 100%; border-radius: 4px; }
            .tile.accent .value { color: var(--accent); }
            .tile.accent .bar-fill { background: var(--accent); }
            .tile.success .value { color: var(--success); }
            .tile.success .bar-fill { background: var(--success); }
            .tile.warning .value { color: var(--warning); }
            .tile.warning .bar-fill { background: var(--warning); }
            .tile.info .value { color: var(--info); }
            .tile.info .bar-fill { background: var(--info); }
            .tile.danger .value { color: var(--danger); }
            .tile.danger .bar-fill { background: var(--danger); }

            /* ---- Panels / breakdown rows ---- */
            .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
            .panel {
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 14px;
                padding: 14px;
                box-shadow: var(--shadow-card);
            }
            .breakdown-row {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 12.5px;
                padding: 6px 0;
            }
            .breakdown-row .dot {
                flex: none;
                width: 7px; height: 7px;
                border-radius: 50%;
                background: var(--accent);
                box-shadow: 0 0 0 3px rgba(106,92,240,0.16);
            }
            .breakdown-row .name { flex: none; width: 40%; color: var(--text); }
            .breakdown-row .track {
                flex: 1 1 auto;
                height: 6px;
                border-radius: 4px;
                background: var(--surface-2);
                box-shadow: inset 0 1px 2px rgba(23,26,35,0.10);
                overflow: hidden;
            }
            .breakdown-row .fill { height: 100%; border-radius: 4px; background: var(--accent); }
            .breakdown-row .val {
                flex: none;
                width: 3.5em;
                text-align: right;
                font-weight: 600;
                font-variant-numeric: tabular-nums;
                color: var(--text);
            }
            .empty-row { font-size: 12.5px; color: var(--text-soft); padding: 4px 0; }

            /* ---- YoY rows — added 2026-09-12, replaces the generic
               breakdown-row layout for this panel only. The generic layout's
               narrow fixed-width .val column crammed "2026: X → 2027: Y
               (delta)" into an unreadable line; this gives the delta its own
               prominent line and demotes the before/after detail to muted
               subtext instead. No bar-track here — a single bar doesn't
               meaningfully represent a two-point before/after comparison. */
            .yoy-row { padding: 7px 0; }
            .yoy-row-top { display: flex; align-items: center; gap: 8px; }
            .yoy-row-top .name { flex: 1 1 auto; font-size: 12.5px; color: var(--text); }
            .yoy-row-top .delta {
                flex: none;
                font-size: 13px;
                font-weight: 700;
                font-variant-numeric: tabular-nums;
                color: var(--text);
                white-space: nowrap;
            }
            .yoy-row-sub {
                font-size: 10.5px;
                color: var(--text-soft);
                margin: 1px 0 0 15px;
                font-variant-numeric: tabular-nums;
            }

            /* ---- Timeline chart ---- */
            .chart-grid-line { stroke: rgba(23,26,35,0.08); stroke-width: 1; }
            .chart-bar-label { font-size: 9px; fill: var(--text-soft); }
            .chart-bar { fill: var(--accent); }
            .chart-bar.peak { fill: var(--success); }

            /* ---- Notice ---- */
            .notice {
                margin-top: 18px;
                background: var(--warning-bg);
                border: 1px solid rgba(165,112,12,0.3);
                border-radius: 14px;
                padding: 10px 14px;
                font-size: 11.5px;
                color: var(--text);
                box-shadow: var(--shadow-card);
            }
        </style>
        <div class="dashboard">
            <div class="topbar">
                <div>
                    <div class="eyebrow" id="eyebrow">2026 Annual Enrollment</div>
                    <div class="titlewrap">
                        <h1>Snap Report</h1>
                        <span class="badge accent" id="dataBadge">Mock Data — Preview</span>
                        <span class="badge warning">2 Open Items</span>
                    </div>
                    <div class="asof" id="asof"></div>
                </div>
            </div>

            <div class="section-title">Employer Selection</div>
            <div class="grid" id="employerTiles"></div>

            <div class="section-title">Breakdowns</div>
            <div class="panels">
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Of Complete — Election Type</div>
                    <div id="electionBreakdown"></div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Non-Completed — By Status</div>
                    <div id="statusBreakdown"></div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Synod / Region</div>
                    <div id="synodBreakdown"></div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">HSA Elections</div>
                    <div id="hsaBreakdown"></div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Year-over-Year Changes</div>
                    <div id="yoyBreakdown"></div>
                </div>
            </div>

            <div class="section-title">Timeline (10/1 – 10/14)</div>
            <div class="panel">
                <svg id="timelineChart" width="100%" height="140" viewBox="0 0 700 140" preserveAspectRatio="none"></svg>
            </div>

            <div class="notice" id="notice"></div>
        </div>
    `;

    class AESnapReport extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.appendChild(template.content.cloneNode(true));

            this._props = { width: 900, height: 600, asOfLabel: "Live" };
            this._employerStatus = MOCK_EMPLOYER_STATUS; // now also carries Timeline + Election Type + YoY rows, see header comment
            this._usingMockData = true;
        }

        connectedCallback() {
            this._render();
        }

        onCustomWidgetBeforeUpdate(changedProperties) {
            this._props = Object.assign({}, this._props, changedProperties);
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            if ("width" in changedProperties) this.style.width = changedProperties.width + "px";
            if ("height" in changedProperties) this.style.height = changedProperties.height + "px";
            if ("employerStatus" in changedProperties) { this._employerStatus = changedProperties.employerStatus; this._usingMockData = false; }
            // "dailyCounts" and "yoyComparison" no longer read — Timeline and
            // YoY data both ride inside employerStatus now, see header comment

            // TEMP DEBUG 2026-09-12 — remove once the drag/drop data-revert
            // bug is diagnosed. Logs every lifecycle call so the console
            // history shows the full sequence of updates (and their row
            // counts) across a drag/resize/drop, not just a single snapshot.
            console.log("[AE Snap Report] onCustomWidgetAfterUpdate", {
                changedKeys: Object.keys(changedProperties),
                employerStatusRowCount: (this._employerStatus && this._employerStatus.data) ? this._employerStatus.data.length : null,
            });

            this._render();
        }

        onCustomWidgetDestroy() {
            // No timers/subscriptions held; nothing to tear down.
        }

        // Exposed scripting API method (see "methods" in widget.json)
        refresh() {
            this._render();
        }

        // ---- Parsing helpers ----
        _dim(r, i) {
            const d = r["dimensions_" + i];
            if (!d) return "";
            // Bug found 2026-09-12 via live data: SAC represents a blank/
            // unassigned dimension member with placeholder text like
            // "(Null)" or "(No Value)" (id "@NullMember") instead of an
            // empty string. Every row-kind branch below relies on a genuine
            // blank coming through as "" (if (date) {...}, if (subType)
            // {...}) — without this normalization, EVERY plain Status/Synod
            // row's Election_Category/Date came through as truthy literal
            // text, misrouting the entire dataset into the wrong branches.
            if (d.id === "@NullMember" || d.label === "(Null)" || d.label === "(No Value)") return "";
            return d.label;
        }
        _measure(r, i) {
            const m = r["measures_" + i];
            return m ? Number(m.raw) : 0;
        }

        _statusBucket(status) {
            if (COMPLETED_STATUSES.includes(status)) return "Completed";
            if (DEFAULTED_STATUSES.includes(status)) return "Defaulted";
            if (OPEN_STATUSES.includes(status)) return "Open";
            return null; // Cancelled / Undetermined — excluded from bucketed totals
        }

        // Bug found 2026-09-12: real SAC date labels for the Timeline's Date
        // dimension come through as human-readable text (e.g. "Oct 5, 2026
        // 0:00:00"), not the ISO "2026-10-05" format the mock data used —
        // main.js's daily-bar sort (Object.keys().sort()) and label logic
        // (date.slice(5) to get "MM-DD") both assumed ISO and broke against
        // real data (wrong sort order, garbled labels). Deliberately NOT
        // using `new Date(...)` here — its date-only-vs-datetime-string
        // parsing behavior differs (UTC vs local), which can silently shift
        // the day by one depending on the browser's timezone. Pure string
        // matching avoids that entirely. Normalizes either format to a
        // sortable "YYYY-MM-DD" key; anything unrecognized passes through
        // unchanged rather than throwing.
        _normalizeDateKey(raw) {
            const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
            if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
            const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
            const human = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(raw);
            if (human && MONTHS[human[1]]) {
                return `${human[3]}-${MONTHS[human[1]]}-${human[2].padStart(2, "0")}`;
            }
            return raw;
        }

        // Display-only rename, decided 2026-09-11: our own source says
        // "Value HDHP", but the YoY requirements doc's bucket name is
        // "Value High Deductible" — same plan, different label. Presentation
        // layer only, not a SQL-level change (see BUILD_PLAN_VWEMPLOYERSAVES.md).
        _displayBucketName(name) {
            return name === "Value HDHP" ? "Value High Deductible" : name;
        }

        // Groups "1A - Alaska Synod"/"1B - ..."/"1F - ..." etc. under one
        // "Synod 1" key — added 2026-09-12 (supersedes an earlier, less
        // aggressive fix that only shortened each row's label to "1A"
        // without collapsing the lettered sub-regions together). Falls back
        // to the full name if it doesn't start with a digit (e.g. mock data).
        _synodGroupKey(name) {
            const m = /^(\d+)/.exec(name);
            return m ? m[1] : name;
        }

        _parseEmployerStatus() {
            const rows = (this._employerStatus && this._employerStatus.data) || [];
            const bySynod = {};
            const bySynodNames = {}; // groupKey -> Set of raw sub-region names rolled into it, for hover tooltips
            const byStatus = {}; // added 2026-09-10 — granular Not Started/In Progress/Abandoned/Needs Follow-up breakdown
            const byDate = {}; // added 2026-09-10 — Timeline data now rides in this same binding, see note below
            const byHealthPlan = {}; // added 2026-09-11 — keyed by Year ("2026"/"2027"), then bucket name
            const byHsaBucket = {}; // added 2026-09-11 — "HSA Annual - Elected 0/>0" / "HSA One Time - Elected 0/>0"
            const byEligibleCount = {}; // added 2026-09-11 — keyed by Year ("2026"/"2027")
            let totalSetUp = 0, completed = 0, defaulted = 0, open = 0;

            rows.forEach((r) => {
                const status = this._dim(r, 0);
                const synod = this._dim(r, 1);
                const subType = this._dim(r, 2); // dimensions_2 = Election_Category — see header comment for the several row-kinds this carries
                const date = this._dim(r, 3); // dimensions_3 — see header comment, "employerStatus now also carries Timeline rows"
                const year = this._dim(r, 4); // dimensions_4 = Year — added 2026-09-11, see header comment
                const employerCount = this._measure(r, 0);
                const employeeCount = this._measure(r, 1);

                if (date) {
                    const dateKey = this._normalizeDateKey(date);
                    byDate[dateKey] = (byDate[dateKey] || 0) + employerCount;
                    return; // timeline rows don't count toward status/election/YoY totals
                }

                if (subType === "Eligible Count") {
                    // measures_1 is repurposed to carry SUM(EligibleCount) on this row-kind, see header comment
                    byEligibleCount[year] = (byEligibleCount[year] || 0) + employeeCount;
                    return;
                }

                if (subType && subType.indexOf("HSA ") === 0) {
                    byHsaBucket[subType] = (byHsaBucket[subType] || 0) + employerCount;
                    return;
                }

                if (subType && year) {
                    // Health-plan bucket, tagged 2026 or 2027 — see header comment
                    if (!byHealthPlan[year]) byHealthPlan[year] = {};
                    byHealthPlan[year][subType] = (byHealthPlan[year][subType] || 0) + employerCount;
                    return;
                }

                const bucket = this._statusBucket(status);

                totalSetUp += employerCount;
                if (bucket === "Completed") completed += employerCount;
                else if (bucket === "Defaulted") defaulted += employerCount;
                else if (bucket === "Open") open += employerCount;

                if (bucket === "Open" && status) byStatus[status] = (byStatus[status] || 0) + employerCount;
                if (synod) {
                    // Collapsed 2026-09-12, per Blair: group at the top-level
                    // synod number only ("Synod 1"), summing across its
                    // lettered sub-regions ("1A"/"1B"/.../"1F") rather than
                    // breaking each one out as its own row.
                    const groupKey = this._synodGroupKey(synod);
                    bySynod[groupKey] = (bySynod[groupKey] || 0) + employerCount;
                    if (!bySynodNames[groupKey]) bySynodNames[groupKey] = new Set();
                    bySynodNames[groupKey].add(synod);
                }
            });

            const pctComplete = totalSetUp ? Math.round((completed / totalSetUp) * 100) : 0;
            const daily = Object.keys(byDate).sort().map((date) => ({ date, count: byDate[date] }));
            return {
                totalSetUp, completed, defaulted, open, pctComplete,
                bySynod, bySynodNames, byStatus, daily,
                byElectionType: byHealthPlan["2027"] || {}, // current-year bucket, same data the "Of Complete" panel always showed
                byHealthPlan, byHsaBucket, byEligibleCount,
            };
        }

        // _parseDailyCounts() removed 2026-09-10 — SAC's Story Builder UI can only
        // bind one model per custom widget through the point-and-click Builder
        // panel; dailyCounts/yoyComparison as separate bindings were unreachable
        // (no UI path found after extensive testing). Timeline data now rides
        // inside the employerStatus binding instead (dimensions_3 = Date, see
        // header comment and _parseEmployerStatus() above) — same combined-cube
        // pattern already used for the Election Type breakdown. yoyComparison
        // stays genuinely separate/deferred — it's member-level benefit-type
        // data with no shared grain to employer data, so it can't be folded in
        // the same way; would need the scripting workaround if pursued later.

        // _parseYoY() removed 2026-09-11 — that binding's design (member-level
        // Benefit Type / Changed Y-N flag) is dead. The real YoY panel (health-
        // plan bucket comparison, HSA collapse, eligible-count delta) is built
        // entirely from employerStatus now — see _parseEmployerStatus() above
        // (byHealthPlan/byHsaBucket/byEligibleCount) and header comment.

        // ---- Small render helpers ----
        _tileHtml(label, value, sub, pctOfMax, cls) {
            return `
                <div class="tile ${cls}">
                    <div class="label">${label}</div>
                    <div class="value">${value}</div>
                    <div class="sub">${sub}</div>
                    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, pctOfMax))}%"></div></div>
                </div>`;
        }

        _breakdownRowsHtml(entries, emptyMessage) {
            if (!entries.length) return `<div class="empty-row">${emptyMessage}</div>`;
            const max = Math.max(1, ...entries.map((e) => e.value));
            return entries.map((e) =>
                `<div class="breakdown-row">
                    <span class="dot"></span>
                    <span class="name"${e.title ? ` title="${e.title}"` : ""}>${e.name}</span>
                    <span class="track"><span class="fill" style="width:${Math.round((e.value / max) * 100)}%"></span></span>
                    <span class="val">${e.display !== undefined ? e.display : e.value}</span>
                </div>`
            ).join("");
        }

        // YoY-specific row layout, added 2026-09-12 — see the .yoy-row CSS
        // comment above for why this replaces _breakdownRowsHtml here.
        // Entries: { name, before, after }. No color-coding on the delta —
        // 2026 is a full completed cycle being compared against a 2027
        // cycle that's only just begun, so a "decrease" here isn't
        // meaningfully bad news; color-coding would imply a judgment the
        // data doesn't support yet.
        _yoyRowsHtml(entries, emptyMessage) {
            if (!entries.length) return `<div class="empty-row">${emptyMessage}</div>`;
            const fmt = (n) => Number(n).toLocaleString();
            return entries.map((e) => {
                const delta = e.after - e.before;
                const sign = delta > 0 ? "+" : "";
                return `<div class="yoy-row">
                    <div class="yoy-row-top">
                        <span class="dot"></span>
                        <span class="name">${e.name}</span>
                        <span class="delta">${sign}${fmt(delta)}</span>
                    </div>
                    <div class="yoy-row-sub">${fmt(e.before)} (2026) → ${fmt(e.after)} (2027)</div>
                </div>`;
            }).join("");
        }

        // ---- Rendering ----
        _render() {
            const root = this._shadowRoot;
            const status = this._parseEmployerStatus();
            const daily = status.daily; // now rides inside employerStatus — see _parseEmployerStatus()

            root.getElementById("asof").textContent = "As of: " + (this._props.asOfLabel || "Live");
            root.getElementById("dataBadge").textContent = this._usingMockData ? "Mock Data — Preview" : "Live";

            // Employer Selection tiles
            const tilesHtml = [
                this._tileHtml("Total Set Up", status.totalSetUp, "in current filter", 100, "accent"),
                this._tileHtml("Completed", status.completed, status.pctComplete + "% of total", status.pctComplete, "success"),
                this._tileHtml("% Complete", status.pctComplete + "%", "of total set up", status.pctComplete, "accent"),
                this._tileHtml("Non-Completed", status.open, (status.totalSetUp ? Math.round((status.open / status.totalSetUp) * 100) : 0) + "% of total", status.totalSetUp ? (status.open / status.totalSetUp) * 100 : 0, "warning"),
                this._tileHtml("Defaulted (running)", status.defaulted, (status.totalSetUp ? Math.round((status.defaulted / status.totalSetUp) * 100) : 0) + "% of total", status.totalSetUp ? (status.defaulted / status.totalSetUp) * 100 : 0, "danger"),
            ].join("");
            root.getElementById("employerTiles").innerHTML = tilesHtml;

            // Of-complete election sub-type breakdown (current year — 2027)
            const electionEntries = Object.keys(status.byElectionType).map((t) => ({ name: this._displayBucketName(t), value: status.byElectionType[t] }));
            root.getElementById("electionBreakdown").innerHTML = this._breakdownRowsHtml(electionEntries, "No election sub-type data bound yet");

            // Non-Completed by status (Not Started / In Progress / Abandoned / Needs Follow-up)
            const statusEntries = Object.keys(status.byStatus).map((s) => {
                const pct = status.open ? Math.round((status.byStatus[s] / status.open) * 100) : 0;
                return { name: s, value: status.byStatus[s], display: `${status.byStatus[s]} (${pct}% of non-completed)` };
            });
            root.getElementById("statusBreakdown").innerHTML = this._breakdownRowsHtml(statusEntries, "No status data bound yet");

            // Synod/Region breakdown — collapsed to top-level synod number
            // only ("Synod 1" instead of separate "1A"/"1B"/.../"1F" rows)
            // 2026-09-12, per Blair — the lettered sub-regions summed
            // together were still blowing up this panel's height even after
            // shortening each label. Sub-region names kept as a hover
            // tooltip (comma-joined) via e.title.
            const synodEntries = Object.keys(status.bySynod).map((s) => ({
                name: /^\d+$/.test(s) ? `Synod ${s}` : s,
                title: status.bySynodNames[s] ? Array.from(status.bySynodNames[s]).sort().join(", ") : undefined,
                value: status.bySynod[s],
            }));
            root.getElementById("synodBreakdown").innerHTML = this._breakdownRowsHtml(synodEntries, "No Synod/Region data bound yet");

            // HSA breakdown — collapsed 2-bucket-per-type scheme, added 2026-09-11
            // (Annual = Single OR Family; One Time = OneTimeSingle OR OneTimeFamily)
            const HSA_LABELS = {
                "HSA Annual - Elected 0": "Annual — None Elected",
                "HSA Annual - Elected >0": "Annual — Elected",
                "HSA One Time - Elected 0": "One Time — None Elected",
                "HSA One Time - Elected >0": "One Time — Elected",
            };
            const hsaEntries = Object.keys(HSA_LABELS)
                .filter((k) => status.byHsaBucket[k] !== undefined)
                .map((k) => ({ name: HSA_LABELS[k], value: status.byHsaBucket[k] }));
            root.getElementById("hsaBreakdown").innerHTML = this._breakdownRowsHtml(hsaEntries, "No HSA data bound yet");

            // YoY breakdown — added 2026-09-11: health-plan bucket comparison
            // (2026 "2026 Employer Annual Elections" vs. 2027 our own Gold) plus
            // eligible-count delta, from vEmployerEligibleCount. See
            // BUILD_PLAN_VWEMPLOYERSAVES.md, "YoY panel" for the full design.
            // Row layout redesigned 2026-09-12 — see _yoyRowsHtml().
            const y2026 = status.byHealthPlan["2026"] || {};
            const y2027 = status.byHealthPlan["2027"] || {};
            const bucketNames = Array.from(new Set([...Object.keys(y2026), ...Object.keys(y2027)]));
            const yoyEntries = bucketNames.map((b) => ({
                name: this._displayBucketName(b),
                before: y2026[b] || 0,
                after: y2027[b] || 0,
            }));
            const eligibleBefore = status.byEligibleCount["2026"] || 0;
            const eligibleAfter = status.byEligibleCount["2027"] || 0;
            if (eligibleBefore || eligibleAfter) {
                yoyEntries.push({ name: "Eligible Employees", before: eligibleBefore, after: eligibleAfter });
            }
            root.getElementById("yoyBreakdown").innerHTML = this._yoyRowsHtml(yoyEntries, "No YoY data bound yet");

            // Timeline bar chart (hand-rolled SVG, no external chart library)
            this._renderTimeline(root.getElementById("timelineChart"), daily);

            root.getElementById("notice").textContent =
                "⚠ Open items pending confirmation: church membership YoY count source " +
                "(Venkata's Datasphere view vs. Matt Christensen's CDS-view catalogue), and " +
                "Synod/Region data access — see DATASPHERE_VIEW_SPEC.md.";
        }

        _renderTimeline(svg, daily) {
            const W = 700, H = 140, padBottom = 20, padTop = 8;
            const max = Math.max(1, ...daily.map((d) => d.count));
            const barW = daily.length ? (W / daily.length) * 0.7 : 0;
            const gap = daily.length ? (W / daily.length) * 0.3 : 0;

            // Faint horizontal grid lines (25/50/75%) for a sense of scale
            let grid = "";
            [0.25, 0.5, 0.75].forEach((f) => {
                const y = padTop + (H - padTop - padBottom) * (1 - f);
                grid += `<line class="chart-grid-line" x1="0" y1="${y}" x2="${W}" y2="${y}"></line>`;
            });

            let bars = "";
            const peakCount = max;
            daily.forEach((d, i) => {
                const x = i * (barW + gap) + gap / 2;
                const barH = ((H - padTop - padBottom) * d.count) / max;
                const y = H - padBottom - barH;
                const dayLabel = d.date.slice(5); // MM-DD
                const isPeak = d.count === peakCount;
                bars += `<rect class="chart-bar${isPeak ? " peak" : ""}" x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2"></rect>`;
                bars += `<text class="chart-bar-label" x="${x + barW / 2}" y="${H - 6}" text-anchor="middle">${dayLabel}</text>`;
            });

            svg.innerHTML = daily.length
                ? (grid + bars)
                : `<text x="10" y="20" class="chart-bar-label">No timeline data bound yet</text>`;
        }
    }

    customElements.define("com-porticobenefits-aesnapreport", AESnapReport);
})();
