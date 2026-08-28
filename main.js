/*
    AE Snap Report — SAC Custom Widget

    Renders the "Traditional Snap Report" dashboard: a high-level daily view
    of Annual Enrollment (AE) progress. See DATASPHERE_VIEW_SPEC.md in this
    folder for exactly what each data binding below is meant to carry, and
    which SAP CDS view it traces back to.

    Data bindings (declared in widget.json), each following SAC's standard
    ResultSet row shape ({ data: [ { dimensions_0: {id,label}, ...,
    measures_0: {raw,formatted}, ... } ] }):

      - employerStatus  <- DS_AE_EMPLOYER_STATUS (wraps ZVHCM_AE_001Q)
            dimensions_0 = Status (Open / Completed EL / Completed OTP /
                            Default / Default Override / Cancelled /
                            Undetermined)
            dimensions_1 = Synod/Region ("" for non-geography rows)
            dimensions_2 = Election Sub-Type (Health / HSA One Time /
                            HSA Family / "" for plain status rows)
            measures_0   = Employer Count
            measures_1   = Employee Count (optional, may be absent)

      - dailyCounts     <- DS_AE_DAILY_COUNTS (wraps ZVHCM_AE_004Q)
            dimensions_0 = Date (YYYY-MM-DD)
            dimensions_1 = State tag
            measures_0   = Member Count

      - yoyComparison   <- DS_AE_YOY_COMPARISON (wraps ZVHCM_AE_005Q)
            dimensions_0 = Benefit Type (Health / Dental / Vision)
            dimensions_1 = Changed flag ("Y" / "N")
            measures_0   = Member Count

    Until these are wired to real Datasphere-backed models, the widget
    renders from the MOCK_* constants below so the layout can be built and
    reviewed standalone (see preview.html). The Status and Synod/Region
    filters below operate client-side over whatever's currently bound (or
    mocked) — they don't re-query SAC.
*/
(function () {
    "use strict";

    // ---- Statuses, grouped per AE_Employer Election's BR-1 vocabulary ----
    const COMPLETED_STATUSES = ["Completed EL", "Completed OTP"];
    const DEFAULTED_STATUSES = ["Default", "Default Override"];
    const OPEN_STATUSES = ["Open", "Undetermined"];

    // ---- Mock data (mirrors the real SAC ResultSet row shape) ----
    function row(dims, measures) {
        const out = {};
        dims.forEach((d, i) => { out["dimensions_" + i] = { id: d, label: d }; });
        measures.forEach((m, i) => { out["measures_" + i] = { raw: m, formatted: String(m) }; });
        return out;
    }

    const MOCK_EMPLOYER_STATUS = { data: [
        row(["Completed EL", "Southwestern Minnesota", ""], [42, 210]),
        row(["Completed OTP", "Southwestern Minnesota", ""], [11, 55]),
        row(["Open", "Southwestern Minnesota", ""], [9, 40]),
        row(["Default", "Southwestern Minnesota", ""], [3, 12]),
        row(["Completed EL", "Metropolitan Chicago", ""], [30, 300]),
        row(["Completed OTP", "Metropolitan Chicago", ""], [6, 61]),
        row(["Open", "Metropolitan Chicago", ""], [14, 88]),
        row(["Default", "Metropolitan Chicago", ""], [2, 9]),
        row(["Completed EL", "Southeastern Synod", ""], [18, 120]),
        row(["Open", "Southeastern Synod", ""], [7, 33]),
        row(["Default Override", "Southeastern Synod", ""], [1, 4]),
        // Of-complete election sub-type breakdown (see DATASPHERE_VIEW_SPEC.md
        // "Open design question" — employer/member join not yet resolved,
        // these mock counts stand in for it).
        row(["Completed", "", "Health"], [88]),
        row(["Completed", "", "HSA One Time"], [37]),
        row(["Completed", "", "HSA Family"], [21]),
    ] };

    const MOCK_DAILY_COUNTS = { data: [
        row(["2026-10-01", "Selection Made"], [14]),
        row(["2026-10-02", "Selection Made"], [22]),
        row(["2026-10-03", "Selection Made"], [19]),
        row(["2026-10-04", "Selection Made"], [8]),
        row(["2026-10-05", "Selection Made"], [3]),
        row(["2026-10-06", "Selection Made"], [27]),
        row(["2026-10-07", "Selection Made"], [31]),
        row(["2026-10-08", "Selection Made"], [25]),
        row(["2026-10-09", "Selection Made"], [18]),
        row(["2026-10-10", "Selection Made"], [12]),
        row(["2026-10-11", "Selection Made"], [4]),
        row(["2026-10-12", "Selection Made"], [2]),
        row(["2026-10-13", "Selection Made"], [30]),
        row(["2026-10-14", "Selection Made"], [41]),
    ] };

    const MOCK_YOY = { data: [
        row(["Health", "Y"], [64]),
        row(["Health", "N"], [201]),
        row(["Dental", "Y"], [22]),
        row(["Dental", "N"], [180]),
        row(["Vision", "Y"], [15]),
        row(["Vision", "N"], [140]),
    ] };

    // ---- Template ----
    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host {
                display: block;
                box-sizing: border-box;
                font-family: "72", "Segoe UI", Arial, sans-serif;

                /* ---- Dark theme (default) ---- */
                --bg: #0b0c12;
                --surface: #14161f;
                --surface-2: #1a1d29;
                --border: #262a3a;
                --text: #f2f3f7;
                --text-soft: #9096a8;
                --accent: #8b7cf6;
                --accent-bg: rgba(139, 124, 246, 0.14);
                --success: #2dd4a7;
                --success-bg: rgba(45, 212, 167, 0.14);
                --warning: #f0b429;
                --warning-bg: rgba(240, 180, 41, 0.14);
                --info: #5b8def;
                --info-bg: rgba(91, 141, 239, 0.14);
                --danger: #ef6f6f;
                --danger-bg: rgba(239, 111, 111, 0.14);
            }
            :host([data-theme="light"]) {
                --bg: #f5f6fa;
                --surface: #ffffff;
                --surface-2: #eef0f5;
                --border: #dde1ea;
                --text: #171a23;
                --text-soft: #5b6072;
                --accent: #6a5cf0;
                --accent-bg: rgba(106, 92, 240, 0.10);
                --success: #14976f;
                --success-bg: rgba(20, 151, 111, 0.10);
                --warning: #a5700c;
                --warning-bg: rgba(165, 112, 12, 0.10);
                --info: #2f6fe0;
                --info-bg: rgba(47, 111, 224, 0.10);
                --danger: #c94b4b;
                --danger-bg: rgba(201, 75, 75, 0.10);
            }
            * { box-sizing: border-box; }

            .dashboard {
                width: 100%;
                height: 100%;
                overflow: auto;
                background: var(--bg);
                color: var(--text);
                border: 1px solid var(--border);
                border-radius: 6px;
                padding: 16px;
            }

            /* ---- Header ---- */
            .topbar {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 12px;
                margin-bottom: 16px;
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
            .badge.accent { color: var(--accent); border-color: var(--accent); background: var(--accent-bg); }
            .badge.warning { color: var(--warning); border-color: var(--warning); background: var(--warning-bg); }
            .theme-toggle {
                font-family: inherit;
                font-size: 12px;
                font-weight: 600;
                color: var(--text);
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 100px;
                padding: 6px 12px;
                cursor: pointer;
                flex: none;
            }
            .theme-toggle:hover { border-color: var(--accent); }
            .asof { font-size: 11px; color: var(--text-soft); margin-top: 2px; }

            /* ---- Filters ---- */
            .filters {
                display: flex;
                flex-wrap: wrap;
                gap: 16px;
                align-items: center;
                margin-bottom: 16px;
                padding-bottom: 14px;
                border-bottom: 1px solid var(--border);
            }
            .filter-field { display: flex; flex-direction: column; gap: 4px; }
            .filter-field label {
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.06em;
                text-transform: uppercase;
                color: var(--text-soft);
            }
            .filter-field select {
                font-family: inherit;
                font-size: 12.5px;
                color: var(--text);
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 6px;
                padding: 6px 10px;
                min-width: 150px;
            }

            /* ---- Section titles ---- */
            .section-title {
                font-size: 11.5px;
                font-weight: 700;
                color: var(--text-soft);
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin: 20px 0 8px;
            }

            /* ---- KPI tiles ---- */
            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 10px;
            }
            .tile {
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 14px;
                display: flex;
                flex-direction: column;
                gap: 6px;
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
                height: 4px;
                border-radius: 4px;
                background: var(--surface-2);
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
            .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
            .panel {
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 14px;
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
            }
            .breakdown-row .name { flex: none; width: 40%; color: var(--text); }
            .breakdown-row .track {
                flex: 1 1 auto;
                height: 6px;
                border-radius: 4px;
                background: var(--surface-2);
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

            /* ---- Timeline chart ---- */
            .chart-grid-line { stroke: var(--border); stroke-width: 1; }
            .chart-bar-label { font-size: 9px; fill: var(--text-soft); }
            .chart-bar { fill: var(--accent); }
            .chart-bar.peak { fill: var(--success); }

            /* ---- Notice ---- */
            .notice {
                margin-top: 16px;
                background: var(--warning-bg);
                border: 1px solid var(--warning);
                border-radius: 8px;
                padding: 10px 14px;
                font-size: 11.5px;
                color: var(--text);
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
                <button class="theme-toggle" id="themeToggle" type="button">☾ Dark</button>
            </div>

            <div class="filters">
                <div class="filter-field">
                    <label for="statusFilter">Status</label>
                    <select id="statusFilter">
                        <option value="All">All</option>
                        <option value="Completed">Completed</option>
                        <option value="Open">Non-Completed</option>
                        <option value="Defaulted">Defaulted</option>
                    </select>
                </div>
                <div class="filter-field">
                    <label for="synodFilter">Synod / Region</label>
                    <select id="synodFilter"><option value="All">All</option></select>
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
                    <div class="section-title" style="margin-top:0;">Synod / Region</div>
                    <div id="synodBreakdown"></div>
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
            this._employerStatus = MOCK_EMPLOYER_STATUS;
            this._dailyCounts = MOCK_DAILY_COUNTS;
            this._yoyComparison = MOCK_YOY;
            this._usingMockData = true;
            this._filters = { status: "All", synod: "All" };
            this._theme = "dark";
        }

        connectedCallback() {
            this._bindControls();
            this._render();
        }

        onCustomWidgetBeforeUpdate(changedProperties) {
            this._props = Object.assign({}, this._props, changedProperties);
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            if ("width" in changedProperties) this.style.width = changedProperties.width + "px";
            if ("height" in changedProperties) this.style.height = changedProperties.height + "px";
            if ("employerStatus" in changedProperties) { this._employerStatus = changedProperties.employerStatus; this._usingMockData = false; }
            if ("dailyCounts" in changedProperties) { this._dailyCounts = changedProperties.dailyCounts; this._usingMockData = false; }
            if ("yoyComparison" in changedProperties) { this._yoyComparison = changedProperties.yoyComparison; this._usingMockData = false; }
            this._render();
        }

        onCustomWidgetDestroy() {
            // No timers/subscriptions held; nothing to tear down.
        }

        // Exposed scripting API method (see "methods" in widget.json)
        refresh() {
            this._render();
        }

        // ---- Controls (wired once; re-read state each render) ----
        _bindControls() {
            const root = this._shadowRoot;
            root.getElementById("themeToggle").addEventListener("click", () => {
                this._theme = this._theme === "dark" ? "light" : "dark";
                this._applyTheme();
            });
            root.getElementById("statusFilter").addEventListener("change", (e) => {
                this._filters.status = e.target.value;
                this._render();
            });
            root.getElementById("synodFilter").addEventListener("change", (e) => {
                this._filters.synod = e.target.value;
                this._render();
            });
        }

        _applyTheme() {
            if (this._theme === "light") {
                this.setAttribute("data-theme", "light");
            } else {
                this.removeAttribute("data-theme");
            }
            this._shadowRoot.getElementById("themeToggle").textContent = this._theme === "light" ? "☀ Light" : "☾ Dark";
        }

        // ---- Parsing helpers ----
        _dim(r, i) {
            const d = r["dimensions_" + i];
            return d ? d.label : "";
        }
        _measure(r, i) {
            const m = r["measures_" + i];
            return m ? Number(m.raw) : 0;
        }

        _availableSynods() {
            const rows = (this._employerStatus && this._employerStatus.data) || [];
            const set = new Set();
            rows.forEach((r) => { const s = this._dim(r, 1); if (s) set.add(s); });
            return Array.from(set).sort();
        }

        _statusBucket(status) {
            if (COMPLETED_STATUSES.includes(status)) return "Completed";
            if (DEFAULTED_STATUSES.includes(status)) return "Defaulted";
            if (OPEN_STATUSES.includes(status)) return "Open";
            return null; // Cancelled / Undetermined — excluded from bucketed totals
        }

        _parseEmployerStatus() {
            const rows = (this._employerStatus && this._employerStatus.data) || [];
            const bySynod = {};
            const byElectionType = {};
            let totalSetUp = 0, completed = 0, defaulted = 0, open = 0;
            const { status: statusFilter, synod: synodFilter } = this._filters;

            rows.forEach((r) => {
                const status = this._dim(r, 0);
                const synod = this._dim(r, 1);
                const subType = this._dim(r, 2);
                const employerCount = this._measure(r, 0);

                if (subType) {
                    byElectionType[subType] = (byElectionType[subType] || 0) + employerCount;
                    return; // election sub-type rows don't count toward status totals
                }

                if (synodFilter !== "All" && synod !== synodFilter) return;
                const bucket = this._statusBucket(status);
                if (statusFilter !== "All" && bucket !== statusFilter) return;

                totalSetUp += employerCount;
                if (bucket === "Completed") completed += employerCount;
                else if (bucket === "Defaulted") defaulted += employerCount;
                else if (bucket === "Open") open += employerCount;

                if (synod) bySynod[synod] = (bySynod[synod] || 0) + employerCount;
            });

            const pctComplete = totalSetUp ? Math.round((completed / totalSetUp) * 100) : 0;
            return { totalSetUp, completed, defaulted, open, pctComplete, bySynod, byElectionType };
        }

        _parseDailyCounts() {
            const rows = (this._dailyCounts && this._dailyCounts.data) || [];
            const byDate = {};
            rows.forEach((r) => {
                const date = this._dim(r, 0);
                const count = this._measure(r, 0);
                byDate[date] = (byDate[date] || 0) + count;
            });
            return Object.keys(byDate).sort().map((date) => ({ date, count: byDate[date] }));
        }

        _parseYoY() {
            const rows = (this._yoyComparison && this._yoyComparison.data) || [];
            const byType = {};
            rows.forEach((r) => {
                const type = this._dim(r, 0);
                const changed = this._dim(r, 1) === "Y";
                const count = this._measure(r, 0);
                if (!byType[type]) byType[type] = { changed: 0, total: 0 };
                byType[type].total += count;
                if (changed) byType[type].changed += count;
            });
            return byType;
        }

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
                    <span class="name">${e.name}</span>
                    <span class="track"><span class="fill" style="width:${Math.round((e.value / max) * 100)}%"></span></span>
                    <span class="val">${e.display !== undefined ? e.display : e.value}</span>
                </div>`
            ).join("");
        }

        // ---- Rendering ----
        _render() {
            const root = this._shadowRoot;
            const status = this._parseEmployerStatus();
            const daily = this._parseDailyCounts();
            const yoy = this._parseYoY();

            root.getElementById("asof").textContent = "As of: " + (this._props.asOfLabel || "Live");
            root.getElementById("dataBadge").textContent = this._usingMockData ? "Mock Data — Preview" : "Live";

            // Filter controls — populate synod options once data is known, preserve selection
            const synodSelect = root.getElementById("synodFilter");
            const synods = this._availableSynods();
            const desiredOptions = ["All", ...synods];
            const currentOptions = Array.from(synodSelect.options).map((o) => o.value);
            if (currentOptions.join("|") !== desiredOptions.join("|")) {
                synodSelect.innerHTML = desiredOptions.map((s) => `<option value="${s}">${s}</option>`).join("");
            }
            synodSelect.value = this._filters.synod;
            root.getElementById("statusFilter").value = this._filters.status;

            // Employer Selection tiles
            const tilesHtml = [
                this._tileHtml("Total Set Up", status.totalSetUp, "in current filter", 100, "accent"),
                this._tileHtml("Completed", status.completed, status.pctComplete + "% of total", status.pctComplete, "success"),
                this._tileHtml("% Complete", status.pctComplete + "%", "of total set up", status.pctComplete, "accent"),
                this._tileHtml("Non-Completed", status.open, (status.totalSetUp ? Math.round((status.open / status.totalSetUp) * 100) : 0) + "% of total", status.totalSetUp ? (status.open / status.totalSetUp) * 100 : 0, "warning"),
                this._tileHtml("Defaulted (running)", status.defaulted, (status.totalSetUp ? Math.round((status.defaulted / status.totalSetUp) * 100) : 0) + "% of total", status.totalSetUp ? (status.defaulted / status.totalSetUp) * 100 : 0, "danger"),
            ].join("");
            root.getElementById("employerTiles").innerHTML = tilesHtml;

            // Of-complete election sub-type breakdown
            const electionEntries = Object.keys(status.byElectionType).map((t) => ({ name: t, value: status.byElectionType[t] }));
            root.getElementById("electionBreakdown").innerHTML = this._breakdownRowsHtml(electionEntries, "No election sub-type data bound yet");

            // Synod/Region breakdown
            const synodEntries = Object.keys(status.bySynod).map((s) => ({ name: s, value: status.bySynod[s] }));
            root.getElementById("synodBreakdown").innerHTML = this._breakdownRowsHtml(synodEntries, "No Synod/Region data bound yet");

            // YoY breakdown
            const yoyEntries = Object.keys(yoy).map((t) => {
                const pct = yoy[t].total ? Math.round((yoy[t].changed / yoy[t].total) * 100) : 0;
                return { name: t, value: yoy[t].changed, display: `${yoy[t].changed} (${pct}%)` };
            });
            root.getElementById("yoyBreakdown").innerHTML = this._breakdownRowsHtml(yoyEntries, "No YoY data bound yet");

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
