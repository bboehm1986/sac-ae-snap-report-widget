# Employer Selection — Gold Layer Build Plan (for Ahmed)

**Bug found and fixed 2026-09-10 — `main.js`'s status vocabulary never
matched our real data.** `_statusBucket()`'s `COMPLETED_STATUSES`/
`DEFAULTED_STATUSES`/`OPEN_STATUSES` were still `AE_Employer Election`'s
*original* BR-1 vocabulary (`"Completed EL"`, `"Open"`, `"Default"`,
etc.) — none of which match our real `Enrollment_Status` values (`Success`
/`Abandoned`/`Not Started`/`In Progress`/`Needs Follow-up`). Practical
effect: **"Completed" and "Non-Completed" tiles have likely shown 0
regardless of actual data since the dashboard first went live** — only
"Total Set Up" was ever accurate, since it accumulates unconditionally.
Fixed: `COMPLETED_STATUSES = ["Success"]`, `OPEN_STATUSES = ["Abandoned",
"Not Started", "In Progress", "Needs Follow-up"]`, `DEFAULTED_STATUSES =
[]` (empty — no real Defaulted status value exists yet, see "Not in this
build"). Verified against mock data in the Browser pane: Completed/%
Complete now compute correctly, console clean.

**Added same session:** a new "Non-Completed — By Status" breakdown panel
(granular Not Started/In Progress/Abandoned/Needs Follow-up counts +
% of non-completed), since `Enrollment_Status` already carries this
detail — `main.js`'s `_parseEmployerStatus()` now also returns `byStatus`,
rendered via the same `_breakdownRowsHtml()` helper already used for
Synod/Election-Type. Verified rendering correctly in the Browser pane
(17/9/6/4 across the four statuses, summing to 100% and to the
Non-Completed total).

**Mock data also updated** (`MOCK_EMPLOYER_STATUS`) to use the real
vocabulary — it was still using the old BR-1 labels too, which is why
this bug wasn't caught by the standalone preview until now.

**Architecture change 2026-09-10 — SAC's Story Builder can only bind one
model per custom widget.** After extensive testing (scrolling, clicking
the widget directly, right-click, deselect/reselect, the pencil/edit
icon, delete-and-readd, the Data panel's chevron drill-in, the far-right
icon strip), no UI path was ever found to configure `dailyCounts` or
`yoyComparison` as independent bindings once `employerStatus` was bound
— consistent with SAC Community reports that the Story Builder UI only
supports one data-binding configuration per custom widget through
point-and-click; additional bindings need a scripting workaround.

**Decided: fold Timeline into `employerStatus` instead**, same
combined-cube pattern already used for Election Type — one row shape per
"kind" of row (status/synod, election-type, or now date), distinguished
by which dimension is populated, `UNION ALL`'d together in
`DS_EMPLOYER_ENROLLMENT_SUMMARY`. `main.js` updated: `dimensions_3` =
`Date`, `_parseEmployerStatus()` now also returns `daily`, the standalone
`_parseDailyCounts()`/`dailyCounts` binding removed from the render path
(still declared in `widget.json` for manifest compatibility, marked
deprecated). Verified in the Browser pane: no console errors, all
existing tiles/breakdowns unchanged, Timeline bars render correctly from
the same binding.

**`yoyComparison` could NOT be folded in the same way** — it's
member-level benefit-type data with no shared grain to employer data.
Stays genuinely deferred; would need the "hidden table + Story Script"
workaround if pursued later, not this combined-cube pattern.

**`AM_EMPLOYER_ENROLLMENT_DAILY`/`DS_EMPLOYER_ENROLLMENT_DAILY` are now
unnecessary** — Timeline's data lives in `DS_EMPLOYER_ENROLLMENT_SUMMARY`
instead. Fine to leave them deployed unused, or delete — your call.

**Resolved 2026-09-04:** `vEmployerSaves` exists — exposed Datasphere view
over `BRZ_vwEmployerSaves`, already filtered to `EventTypeCode =
'EmplrElect'`. No longer blocked. Gold SQL below builds directly on it.

**Status 2026-09-04:** `GLD_AE_Employer_Enrollment` deployed, Semantic
Usage = Relational Dataset. Synod_Region join was temporarily commented
out (placeholder `NULL` column) — see below for the current status.

**Resolved 2026-09-09 by Blair: `ODSPRIME_Employer` is abandoned as a
path entirely — not coming.** Not just blocked on ticket 32054 anymore;
stop tracking that ticket for this purpose. **`vDimEmployer` (Ahmed
Sheikh's star-schema layer) is the confirmed replacement path for Synod.**

**Resolved 2026-09-10:** `vDimEmployer` now has `RegionSynodCode`/
`RegionSynodName`/`synodrateclasscode` (added 2026-09-09, per its
catalogue entry) and `EMPRNAME` (Employer Name) — both blocked fields now
have a real join target. Gold SQL below uses `RegionSynodName` and
`EMPRNAME`. Two things to know before treating this as fully solved:

- **`RegionSynodName` is CSV-backed, not live** — sourced via `LEFT JOIN
  employer_synods_csv`, a presumed static, manually-uploaded table (same
  freshness risk already flagged on Health Census's own Synod source).
  It'll work, but can silently go stale.
- **A better, live alternative may already exist**: the catalogue entry
  flags that `AE_Employer Election` already has a confirmed-working
  *live* source for the same data — `PORTICO.ODSPRIME_Employer.
  RegionSynodName`, confirmed working 2026-08-24 — via a different access
  path (SAP HCM-native, not through our Datasphere space) than the one
  that 404'd for us directly. Worth a separate investigation into whether
  that access path could be exposed to our space too, rather than
  permanently relying on the CSV. Not blocking today's build.
- ~~`vDimEmployer` was still "Not Released"~~ — **confirmed working
  2026-09-10**: despite the "Not Released" status, the join resolves and
  Data Preview shows real Synod names and Employer Names populating
  correctly, not blank/NULL. Not a blocker after all.

**Dropped 2026-09-10: `Employer_Type` isn't needed.** Checked `main.js`'s
own data-binding contract — the widget's `employerStatus` feed only has
three dimensions (Status, Synod/Region, Election Sub-Type); `Employer
Type` was never one of them and nothing in the widget's code references
it. It was carried into the Gold column list from the *original* CDS-view
spec's available-fields list (`ertype`), not because anything downstream
actually consumes it. Removed from the Gold column list and SQL below —
no longer tracked as an open item.

`DS_EMPLOYER_ENROLLMENT_SUMMARY` deployed (Fact, `EmployerCount`/
`EmployeeCount` as Measures, `Synod_Region`/`Enrollment_Status` as
Attributes) — both objects were deleted and rebuilt clean partway through
after a rename cascade left stale semantic-layer references (a real
Datasphere quirk: renaming a Fact-typed view's columns doesn't
auto-relink its Attribute/Measure definitions — cleanest fix was
delete+recreate rather than patch). `AM_EMPLOYER_ENROLLMENT_SUMMARY`
Analytic Model built on top and deployed — that's the object SAC's
picker actually surfaces. Next: bind it in the SAC Story.

**Naming convention, confirmed 2026-09-04 via a Datasphere engineer:**
column aliases must not contain spaces or other special characters (`/`)
— causes problems upstream. All technical column names below use
underscores; the business-readable label (spelled out with spaces) is
still the intended *display* name — set that separately as each column's
label in the Analytic Model editor (Model Properties → Attributes/
Measures → pencil icon), not in the raw SQL alias. `GLD_AE_Employer_
Enrollment` was originally built with spaces in the aliases and has
already been corrected once (see "Gold SQL" below) — the slash in
`Synod/Region` → `Synod_Region` was my own extension of this same
guidance (engineer's advice was specifically about spaces) — worth a
quick confirm next time it comes up, not treated as definitively covered.

**Grain:** one row per Employer per AE cycle.

## Build steps

1. **Source:** `vEmployerSaves`, already filtered to `EventTypeCode =
   'EmplrElect'`.
2. **Dedupe to latest attempt:** ~~the view already carries a precomputed
   `rownum` column — filter `rownum = 1`~~ — **bug found 2026-09-10 by
   Blair: don't trust the source's `rownum`.** Every eligible employer's
   auto-created row loads with **no `rownum` value at all (`NULL`)**, and
   only starts accumulating a real value once actual attempts are made,
   with the latest attempt landing on `1`. Filtering `WHERE rownum = 1`
   would silently exclude every employer who hasn't made a real attempt
   yet — `NULL` never equals `1` — undercounting "Total Set Up" exactly
   where it matters most. **Fix: compute our own `ROW_NUMBER() OVER
   (PARTITION BY RequestId ORDER BY AttemptedOn DESC)`**, same approach
   already used for Member Gold — a `RequestId` with only the
   auto-created row still correctly gets `rownum = 1` this way, regardless
   of `AttemptedOn` being `NULL`. See Gold SQL below.
3. **Employer key:** use `EmployerNumber`, not `EMPRNO`.
4. **HSA amounts:** use `HSA_HRA_SINGLE` / `HSA_HRA_FAMILY`, not
   `annualHsaSingle` / `annualHsaFamily`.
5. **Enrollment Status** — derive from the latest attempt's `ResultCode`:
   - `S` → Success
   - `A` → Abandoned
   - `N` → Not Started
   - `IP` → In Progress
   - `F` / `E` / `W` / `I` → Needs Follow-up
6. **Join Synod/Region + Employer Name:** ~~`PORTICO.ODSPRIME_Employer`~~
   — **abandoned 2026-09-09, will never happen.** Replacement:
   `vDimEmployer` on `EMPRNO` (`RegionSynodName`, `EMPRNAME`) — resolved
   2026-09-10, see status note above for the CSV-staleness caveat.
7. **Exclude `taxIdentificationNumber` (EIN)** — do not carry it through.
8. No separate eligible-employer roster needed — a row auto-creates for
   every eligible employer.

## Gold column list (in order)

Technical name (SQL alias) — business label to set on it in the Analytic
Model editor:

| Technical name | Business label |
|---|---|
| `Employer_Number` | Employer Number |
| `Employer_Name` | Employer Name |
| `Synod_Region` | Synod/Region |
| `Enrollment_Status` | Enrollment Status |
| `Contribution_Set` | Contribution Set |
| `HSA_Single` | HSA Single |
| `HSA_Family` | HSA Family |
| `Employee_Count` | Employee Count |
| `Completed_Date` | Completed Date |
| `Abandoned_Date` | Abandoned Date |

## Then: aggregate cube — the widget binds to this, not Gold directly

**`DS_EMPLOYER_ENROLLMENT_SUMMARY`**
**Grain:** one row per (Synod_Region, Enrollment_Status)
**Measures:** `EmployerCount`, `EmployeeCount` (sum of `Employee_Count`)

Replaces `DS_AE_EMPLOYER_STATUS` in `sac-ae-snap-report-widget/main.js`'s
`employerStatus` binding — same dimension shape the widget already reads
(Synod/Region, Status), so no widget code changes needed beyond swapping
the source.

**Done and confirmed live, 2026-09-04.** `AM_EMPLOYER_ENROLLMENT_SUMMARY`
bound to the widget's `employerStatus` feed in the SAC Story, dashboard
rendering real counts (Total Set Up, Completed, etc.).

**Gotcha worth remembering:** this custom widget reads its measures by
**position**, not by name (`main.js`'s own header comment: `measures_0 =
Employer Count`, `measures_1 = Employee Count`) — SAC's Builder panel
initially had them in the opposite order, which produced `NaN` on the
Total Set Up tile. Fix was just reordering the two measures in the
Builder panel (drag by the handle) to match the widget's expected order.
This is specific to *this* custom widget's own code — the native SAC
Table widget planned for the download experience below reads columns by
name, not position, so it won't hit the same issue.

## Timeline panel — corrected 2026-09-10, then folded into employerStatus

**Original assumption was wrong.** The widget's `dailyCounts` binding
(`main.js` header comment: `DS_AE_DAILY_COUNTS`, wrapping `ZVHCM_AE_004Q`,
`Member Count`) is member-level — but **employers go through the election
process too**, and the Timeline panel should track *employer* activity by
day, not members.

**Then superseded again** — a separate `DS_EMPLOYER_ENROLLMENT_DAILY`
cube was briefly built and deployed for this, but since SAC's Story
Builder UI can only bind one model per custom widget (see the
architecture-change note above), `dailyCounts` as an independent binding
turned out to be unreachable anyway. Folded into `employerStatus` instead
— see the combined `DS_EMPLOYER_ENROLLMENT_SUMMARY` SQL below, which now
includes a `Date`-carrying `UNION ALL` block for this. The standalone
`DS_EMPLOYER_ENROLLMENT_DAILY`/`AM_EMPLOYER_ENROLLMENT_DAILY` objects are
no longer needed.

**Bug found and fixed 2026-09-12 — garbled x-axis labels once live data
arrived.** `Completed_Date` (from `SubmittedOn`) carries a full timestamp,
not just a date, so `GROUP BY "Completed_Date"` grouped by the exact
second instead of by day — producing one bar per submission moment
instead of one per day, with all their raw timestamp labels overlapping
into unreadable text on the x-axis. **Fix:** truncate to just the date
before grouping, while keeping the output typed as `TIMESTAMP` (not
`DATE`) so it stays consistent with every other branch's `Date` column
— same "every branch needs the same type" lesson learned the hard way
during the `Enrollment_Year` debugging above:
```sql
CAST(CAST("Completed_Date" AS DATE) AS TIMESTAMP) AS "Date"
...
GROUP BY CAST("Completed_Date" AS DATE)
```
See the combined-cube SQL below for the full corrected block. Redeployed
2026-09-12 — fixed the multiple-bars-per-day symptom (one clean bar per
day now), but surfaced a **second bug**: real SAC date labels for this
dimension come through as human-readable text (e.g. `"Oct 5, 2026
0:00:00"`), not the ISO `"2026-10-05"` format the mock data used —
`main.js`'s daily-bar sort (`Object.keys().sort()`) and label logic
(`date.slice(5)` to get `"MM-DD"`) both assumed ISO and broke against
real data (wrong sort order, garbled labels). **Fixed in `main.js`** with
a new `_normalizeDateKey()` helper that converts either format to a
sortable `"YYYY-MM-DD"` key via regex matching — deliberately not using
`new Date(...)`, since its ISO-date-only-vs-datetime parsing behavior
differs (UTC vs local) and can silently shift the day by one depending on
the browser's timezone. Verified against both formats directly in the
Browser pane; mock-data rendering unaffected. Pushed; not yet reverified
against live SAC data as of this writing.

## Download experience — decided 2026-09-04

Leadership needs to download the full, one-row-per-Employer Gold data —
not just the aggregate counts the SAC widget shows. **Decided: a native
SAC Table widget, bound directly to `GLD_AE_Employer_Enrollment`, using
SAC's own built-in export (right-click → Export to Excel/CSV) — not a
button inside the custom widget.** Same decision, same reasoning, already
made for Member Enrollment (`ae-member-enrollment-report/GOLD_VIEW_SPEC.md`
§8a) — kept consistent across both reports rather than re-litigated here.

**Why not the custom widget:** a button in the widget's own shadow DOM
would fail the same way the theme toggle and filters did on this project
(the confirmed View-mode click-delivery platform bug). A native SAC
component's click isn't subject to that bug, so this sidesteps the risk
entirely rather than betting on an untested workaround.

This also keeps the architecture clean: the aggregate cube stays the only
thing the dashboard widget ever touches — employer-level data only ever
reaches the browser on the separate Table+Export surface, at the moment
someone deliberately downloads it.

**Resolved 2026-09-10:** `Employer_Name` now in Gold, via `vDimEmployer.
EMPRNAME` — see Gold SQL below.

**Access/sensitivity conversation — resolved 2026-09-12 by Blair: not a
concern for this data.** No access restriction needed on the download
beyond what's already in place for the Story itself.

### Binding the Table — findings 2026-09-11, supersedes the note below

Tried "bind the Table directly to `GLD_AE_Employer_Enrollment`" first,
since it's already an existing object with no new build needed. **Doesn't
work**: `GLD_AE_Employer_Enrollment` never appears in the Table widget's
"Select Dataset or Model" picker while it's a plain Relational Dataset —
confirmed live (empty picker), matching the same "Model or Dataset" gap
already documented below for the aggregate cube. So a **native SAC Table
widget has the identical Analytic-Model requirement as a custom widget** —
this isn't a custom-widget-specific rule, it's SAC's picker in general.

Went looking for "Create Analytic Model" on `GLD_AE_Employer_Enrollment`
while still Relational Dataset — not present, confirmed via scrolling,
toggling "Run in Analytical Mode" on, and attempting Data Validation (the
Validate control itself was disabled/unclickable). **Correction to an
earlier claim in this doc:** I initially thought this button appears on a
Relational Dataset view directly — wrong. Cross-checking against how
`DS_EMPLOYER_ENROLLMENT_SUMMARY` itself was built (below), "Create
Analytic Model" only became available there *after* Semantic Usage was
set to Fact — not before. Gold needs the same treatment.

**Decided:** set `GLD_AE_Employer_Enrollment`'s Semantic Usage to **Fact**,
mark `HSA_Single` / `HSA_Family` / `HSA_One_Time_Single` /
`HSA_One_Time_Family` / `Employee_Count` as Measures, then build an
Analytic Model on top — named `AM_EMPLOYER_ENROLLMENT_DETAIL` (decided
2026-09-13, mirrors `AM_EMPLOYER_ENROLLMENT_SUMMARY`'s naming: "Detail"
vs. "Summary" signals row-level download data vs. the aggregate
dashboard cube) — for the Table widget to bind to. **Confirmed no downstream SQL impact**:
Semantic Usage is a Datasphere consumption-layer/metadata classification,
not part of query execution — `DS_EMPLOYER_ENROLLMENT_SUMMARY`'s own
`SELECT ... FROM "GLD_AE_Employer_Enrollment"` reads the same columns/rows
regardless of Gold's Fact/Relational-Dataset classification, so this
redeploys with zero changes needed to the cube SQL. Not yet confirmed
whether this actually surfaces "Create Analytic Model" — next thing to
test.

**Governance trade-off, accepted deliberately:** once those HSA/headcount
fields are flagged as Measures, they become available for potential
misuse in an inappropriate aggregate visualization elsewhere in SAC
(summing per-employer dollar amounts across employers isn't a meaningful
metric) — the same concern that caused an earlier *accidental* Fact-typing
of Gold to be caught and reverted. This time it's a deliberate, understood
trade-off, made only to unlock the Table binding, not a design goal in
itself.

**Scope confirmed 2026-09-11 by Blair — narrower than "all of Gold":**
the download only needs to show the **most recent attempt per employer**
(already guaranteed by Gold's own `ROW_NUMBER()` dedup — no additional
work) and **only employers with `Enrollment_Status = 'Success'`**. That
filter will be a **fixed condition on the Table widget's own binding**,
not exposed as a shared, user-adjustable Input Control option — leadership
downloads completed employers only, full stop.

**Input Controls still apply on top of that fixed filter**, via standard
SAC Linked Analysis: a shared Input Control (e.g. Synod/Region) can filter
both the dashboard's aggregate-cube widget and the Table widget at once,
as long as both models expose a compatible dimension — this is ordinary,
fully-supported SAC behavior across two different models on one Story
page, **not** the same limitation as the one-model-per-*custom*-widget
problem documented above (that one is specific to the custom-widget
Builder panel's binding UI; native widgets like this Table don't have it).

**Status as of 2026-09-11: decided, not yet executed.** Next steps once
resumed: flip Gold's Semantic Usage to Fact, mark the five Measures,
confirm "Create Analytic Model" appears, build the Analytic Model, bind
the Table to it with the fixed `Enrollment_Status = 'Success'` filter,
then wire up Linked Analysis for the shared Input Control.

**Resumed 2026-09-12. Bug found marking Measures:** `HSA_HRA_SINGLE`/
`HSA_HRA_FAMILY` converted to Measures fine, but `HSA_One_Time_Single`/
`HSA_One_Time_Family` threw "The selection contains either a column which
does not have a numeric data type or a key. It cannot be converted into a
measure." Root cause: `HSAONETIMESINGLE`/`HSAONETIMEFAMILY` aren't
actually numeric in `vEmployerSaves` (likely string/varchar holding
numeric-looking text) — HANA SQL comparisons like `> 0` in the combined-
cube SQL still worked at the engine level via implicit conversion, but
Datasphere's stricter Measure-conversion check correctly rejects the
column's declared type. **Fix: explicit `CAST(... AS DECIMAL(18,2))` on
both fields in Gold's own SQL** — see the updated SQL above. Needs
redeploying before retrying the Measure conversion.

**Done 2026-09-13:** all 5 fields marked as Measures; Analytic Model
`AM_EMPLOYER_ENROLLMENT_DETAIL` created on top of Gold. Table widget
added to the same page as the dashboard, bound to it as a flat grid — all
8 Attributes in **Rows** (Employer_Number as the natural key keeps it
flat rather than pivoted), all 5 Measures in **Columns → Measures**, and
the fixed `Enrollment_Status = 'Success'` filter applied under
**Filters**.

**Button + scripted export — tried, not available.** Wanted a small
"Download" button rather than relying on SAC's right-click export
directly. Checked two likely places for a Button's On Click script: the
`{...}` toolbar icon (turned out to be "Link Variables," unrelated) and
the **Tools** menu (Add New Data / Edit Prompts / Link Dimensions / Chart
Scaling / Conditional Formatting / Formula Bar / Value Lock Management /
Cell References and Formulas / Linked Widgets Diagram — no scripting
option anywhere in that list). **Conclusion:** this is a SAC **Story**
(not an Analytics Designer Analytic Application) — arbitrary Button
on-click scripting appears to be an Analytics Designer-only capability,
not available here. Rebuilding this dashboard in Analytics Designer to
get a scripted button would be a much bigger undertaking (separate
authoring tool entirely), not attempted.

**Decided instead:** no custom button. Table shrunk down to a small,
unobtrusive footprint on the page rather than a large dominant grid, with
a plain Text widget next to it ("Right-click table → Export to Excel/
CSV") so the built-in export mechanism is discoverable without a
dedicated button.

## Not in this build — pending, added later

- **"Defaulted"** status — definition not yet confirmed. Not part of Gold
  or the aggregate cube above; will be a field addition once answered.
  Note: Member Enrollment's version of this same question turned out to
  hinge on a per-member "chosen for PSP" tag (see `ae-member-enrollment-
  report/BUILD_PLAN_FOR_AHMED.md`) — worth checking whether Employer
  Selection has an equivalent tag-based mechanism before assuming a
  simple date-comparison will do.
- ~~**Health/HSA election-type breakdown** — needs a separate
  employer↔member join, not resolved by this source~~ — **corrected
  2026-09-10 by Blair: wrong assumption.** The employer itself elects a
  health plan too — `vEmployerSaves` already has `healthPlan`,
  `HSAONETIMESINGLE`, `HSAONETIMEFAMILY` (none currently in Gold),
  mapping directly to the widget's three Election Sub-Type categories
  (Health / HSA One Time / HSA Family). No member-level join needed.
  **Not yet built** — need real preview values for those three fields
  first (is `healthPlan` a flag or a plan name? are the two HSAONETIME
  fields amounts or flags? does "HSA Family" in the widget mean
  `HSAONETIMEFAMILY` specifically, distinct from the already-used
  `HSA_HRA_FAMILY`?) before writing the derivation logic.

## Gold SQL

**History (all superseded by the current version below, kept as one-line
notes only — do not use):** original build joined `PORTICO.
ODSPRIME_Employer` (abandoned 2026-09-09); then switched to `vDimEmployer`
but trusted the source's own `rownum` column (bug found 2026-09-10, see
Build step 2 above).

**Current version (2026-09-10) — self-computed `rownum`, `vDimEmployer`
join, `Completed_Date`/`Abandoned_Date`, `Health_Plan_Bundle`, HSA One
Time fields all included:**

```sql
SELECT
    a."EmployerNumber"     AS "Employer_Number",
    de."EMPRNAME"          AS "Employer_Name",
    de."RegionSynodName"   AS "Synod_Region",
    CASE a."ResultCode"
        WHEN 'S'  THEN 'Success'
        WHEN 'A'  THEN 'Abandoned'
        WHEN 'N'  THEN 'Not Started'
        WHEN 'IP' THEN 'In Progress'
        WHEN 'F'  THEN 'Needs Follow-up'
        WHEN 'E'  THEN 'Needs Follow-up'
        WHEN 'W'  THEN 'Needs Follow-up'
        WHEN 'I'  THEN 'Needs Follow-up'
        ELSE 'Needs Follow-up'
    END                     AS "Enrollment_Status",
    a."CONTRIBUTIONSET"    AS "Contribution_Set",
    a."CUST_BUND_NAME"     AS "Health_Plan_Bundle",
    a."HSA_HRA_SINGLE"     AS "HSA_Single",
    a."HSA_HRA_FAMILY"     AS "HSA_Family",
    CAST(a."HSAONETIMESINGLE" AS DECIMAL(18,2)) AS "HSA_One_Time_Single",
    CAST(a."HSAONETIMEFAMILY" AS DECIMAL(18,2)) AS "HSA_One_Time_Family",
    a."numberOfEmployees"  AS "Employee_Count",
    CASE WHEN a."ResultCode" = 'S' THEN a."SubmittedOn" END AS "Completed_Date",
    CASE WHEN a."ResultCode" = 'A' THEN a."SubmittedOn" END AS "Abandoned_Date"
FROM (
    SELECT
        "EmployerNumber", "RequestId", "ResultCode", "AttemptedOn",
        "CONTRIBUTIONSET", "CUST_BUND_NAME", "HSA_HRA_SINGLE", "HSA_HRA_FAMILY",
        "HSAONETIMESINGLE", "HSAONETIMEFAMILY", "numberOfEmployees", "SubmittedOn",
        ROW_NUMBER() OVER (PARTITION BY "RequestId" ORDER BY "AttemptedOn" DESC) AS "rn"
    FROM "vEmployerSaves"
) a
LEFT JOIN "vDimEmployer" de
    ON de."EMPRNO" = a."EmployerNumber"
WHERE a."rn" = 1
```

**Status: drafted, not yet deployed** — supersedes everything previously
built in `GLD_AE_Employer_Enrollment`; needs a full rebuild with this
version, not an incremental edit, given how much has changed.

Then the aggregate cube on top — **combined design, now carrying THREE
kinds of rows** (Status/Synod, Election Type, and — added 2026-09-10 once
the multi-binding limitation was found — Timeline). One `Election_Category`
column and one `Date` column, each blank except on the row-kind they
apply to:

```sql
SELECT
    "Synod_Region",
    "Enrollment_Status",
    CAST('' AS NVARCHAR(50)) AS "Election_Category",
    CAST(NULL AS TIMESTAMP)  AS "Date",
    COUNT(*)                AS "EmployerCount",
    SUM("Employee_Count")   AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
GROUP BY "Synod_Region", "Enrollment_Status"

UNION ALL

SELECT CAST('' AS NVARCHAR(50)), CAST('' AS NVARCHAR(50)), "Health_Plan_Bundle", CAST(NULL AS TIMESTAMP), COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success'
GROUP BY "Health_Plan_Bundle"

UNION ALL

SELECT '', '', 'HSA Single', CAST(NULL AS TIMESTAMP), COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_Single" > 0

UNION ALL

SELECT '', '', 'HSA Family', CAST(NULL AS TIMESTAMP), COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_Family" > 0

UNION ALL

SELECT '', '', 'HSA One Time Single', CAST(NULL AS TIMESTAMP), COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_One_Time_Single" > 0

UNION ALL

SELECT '', '', 'HSA One Time Family', CAST(NULL AS TIMESTAMP), COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_One_Time_Family" > 0

UNION ALL

SELECT CAST('' AS NVARCHAR(50)), CAST('' AS NVARCHAR(50)), CAST('' AS NVARCHAR(50)), "Completed_Date", COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "Completed_Date" IS NOT NULL
GROUP BY "Completed_Date"
```

**Status: the Election-Type-only version (no `Date` column) was
deployed and confirmed working 2026-09-10** — Total Set Up/Completed/%
Complete/Synod/Election Type breakdowns all verified live in SAC.
**The `Date` column above is the next revision, not yet deployed** —
adding it needs the same steps as before: redeploy this SQL into
`DS_EMPLOYER_ENROLLMENT_SUMMARY`, then add `Date` as a new Attribute on
`AM_EMPLOYER_ENROLLMENT_SUMMARY` ("Show Inherited Elements" alone won't
refresh it — the underlying view has to actually redeploy first), then
add it to the SAC Builder panel's Dimensions list, **after**
`Election_Category` (so it lands in `dimensions_3`, matching `main.js`'s
updated contract).

**Important, confirmed 2026-09-04 via a Datasphere engineer:** SAC's
"Model or Dataset" picker only surfaces Datasphere objects that have an
**Analytic Model** built on top — a plain Relational Dataset view never
shows up there, no matter how its SQL is written. This cube needs
Semantic Usage → Fact, `EmployerCount`/`EmployeeCount` marked as Measures,
and an Analytic Model built on top (`AM_EMPLOYER_ENROLLMENT_SUMMARY`) —
already done for the pre-rework version, needs re-validating once this
SQL redeploys.

**`GLD_AE_Employer_Enrollment` — updated 2026-09-11, supersedes the
"stays Relational Dataset" line that used to be here.** It's still
row-level Gold, reserved for the Table+Export detail download (see
"Download experience" above) and never bound directly to the dashboard
widget — that part hasn't changed. What changed: the Table widget turns
out to need an Analytic Model too (same "Model or Dataset" picker gap as
the aggregate cube), so Gold itself now needs Semantic Usage → Fact and
five Measures (`HSA_Single`, `HSA_Family`, `HSA_One_Time_Single`,
`HSA_One_Time_Family`, `Employee_Count`) — see "Binding the Table —
findings 2026-09-11" above for the full reasoning and trade-off.

## Synod/Region panel redesigned into completion progress — 2026-09-12

Original panel just showed a flat headcount per synod (all statuses
combined, i.e. the same population as "Total Set Up" broken out by
region) — Blair pointed out this wasn't actionable: a raw count doesn't
say anything about which regions are behind on completion. **Redesigned
into a per-synod completion-progress panel**: each row now tracks
`{ total, completed }` per synod group (not a flat count), and shows
`% complete` prominently with `X of Y completed` as subtext, plus a
progress bar whose fill is that **specific row's own 0-100% completion
rate** — not sized relative to the other rows the way `_breakdownRowsHtml`
does it. New `_progressRowsHtml()` (in `main.js`) handles this; added a
`.panel-caption` under the section title ("% of employers completed, by
synod") so the meaning is explicit rather than assumed. Verified against
a simulated mixed-status dataset in the Browser pane (two sub-regions
with different completion rates, grouped and averaged correctly).

## YoY panel row design — cleaned up 2026-09-12

Original row layout crammed `"2026: 2246 → 2027: 5 (-2241)"` into the
shared `.breakdown-row`'s narrow fixed-width `.val` column (designed for
a single short number) — unreadably dense once real data arrived.
**Redesigned this panel's rows specifically** (new `_yoyRowsHtml()`, not
the shared `_breakdownRowsHtml()` every other panel still uses): name +
a prominent delta on the top line (`+7`, `−1,073`), with the before/after
detail demoted to small muted subtext below (`35 (2026) → 42 (2027)`),
proper thousands-separator formatting, and no bar-track (a single bar
doesn't meaningfully represent a two-point before/after comparison).
**Deliberately no color-coding on the delta** — 2026 is a full completed
cycle being compared against a 2027 cycle that's only just begun, so a
"decrease" isn't meaningfully bad news yet; color would imply a judgment
the data doesn't support until both cycles are more comparable.

**Generalized 2026-09-12** once "Non-Completed — By Status" hit the exact
same problem (`"4934 (100% of non-completed)"` wrapping into an
unreadable 3-line mess in the same narrow `.val` column). `_yoyRowsHtml()`
became the generic `_statRowsHtml()` (entries: `{ name, value, sub }`,
both `value`/`sub` pre-formatted strings), `.yoy-row`/`.delta` CSS classes
renamed to `.stat-row`/`.value`. Both panels now use it.

## YoY panel — in progress, started 2026-09-11

The widget's `yoyComparison` binding (`widget.json`: "Benefit Type / Changed
Flag" dimensions, "Member Count" measure) predates this investigation and
is now known to be the wrong shape — being redesigned from scratch below.
Not yet built; captured here as it develops so nothing gets lost given how
much has already turned up.

**Confirmed source pairing:** YoY compares two separate Datasphere objects
side by side, not one object's own before/after flag —
**"2026 Employer Annual Elections"** (`ZVHCM_AE_1_26Q`, Matt Christensen,
catalogued as a Near-Duplicate of AE_Employer Election — see
`data-catalogue/products/2026-employer-annual-elections.md`) is the 2026
half, and **our own `GLD_AE_Employer_Enrollment`** (this doc) is the 2027
half — confirmed by Blair 2026-09-11 that "Ahmed's 2027 ProcessAttempt
Results," named in the requirements doc below, means this Gold view
(`AttemptedOn`/`RequestId` match the "ProcessAttempt" terminology).

**Requirements doc (Blair, 2026-09-11) breaks "YoY" into five metrics,**
not one panel:

1. **Sponsored Members YoY** — delta between employee count as of
   1/1/2026 and as of 1/1/2027.
2. **Sponsored Members at Employer** — the 1/1/2027 count on its own.
3. **Health Plan Method** — employer count in each of 4 buckets: Value
   High Deductible, Select HDHP, Select Copay, Value Copay.
4. **Health Plan YoY** — the same 4 buckets, 2026 count vs. 2027 count vs.
   Delta, one column each.
5. **HSA** — 2 buckets for Annual (Elected 0 / Elected >0), 2 buckets for
   One-time (Elected 0 / Elected >0).

**Metrics 1 & 2 — data source found 2026-09-11, not yet catalogued or
built into Gold.** Blair found/wrote a Datasphere view,
`vEmployerEligibleCount` (Quality (200) CRM space, Data Builder — see
screenshots in chat for exact location), that computes exactly the two
fields these metrics need without waiting on Ahmed to append them
separately:

```sql
SELECT
    EnrollmentYear,
    EMPRNO,
    count(ELIGIBLE) + 1 AS EligibleCount
FROM (
    SELECT DISTINCT 2026 EnrollmentYear, M."MEMBERID", M."EMPRNO",
        D."ERBNR" AS DEPENDENT_MEMBERID, D."SUBTY" AS DEPENDENT_TYPE,
        ...,
        CASE WHEN MAX(DX."SMOKE") OVER (...) = 'X' THEN 0
             WHEN D."SUBTY" = 'SPOU' THEN 1
             WHEN MAX(DX."DISAB") OVER (...) = 'X' THEN 1
             WHEN '20260101' <= LAST_DAY(ADD_YEARS(D."FGBDT", 26)) THEN 1
             ELSE 0 END AS ELIGIBLE
    FROM ZV_MEMBER_ASSOC M
        JOIN "PA0021" D ON ... AND 20260101 BETWEEN D."BEGDA" AND D."ENDDA"
        JOIN "PA0106" DX ON ... AND 20260101 BETWEEN DX."BEGDA" AND DX."ENDDA"
    WHERE 20260101 BETWEEN M."BEGDA" AND M."ENDDA"
    UNION
    SELECT DISTINCT 2027 EnrollmentYear, ... -- identical logic, 2027-dated
) dep_cnt
GROUP BY EnrollmentYear, EMPRNO
ORDER BY EnrollmentYear, EMPRNO
```

Grain: one row per (`EnrollmentYear`, `EMPRNO`), both 2026 and 2027 present
as separate rows via the `UNION` — exactly what's needed to fold into the
combined cube as another `UNION ALL` block carrying a `Year` dimension.
Model Properties confirm: Semantic Usage already **Fact**, `EligibleCount`
already a Measure (SUM), `EnrollmentYear`/`Employer Number` as Attributes
— so the Analytic-Model gate hit twice already on this project (the Table
download and the aggregate cube) isn't a concern for this one; it's
already past that step. Release State: **Not Released**; Validated: **Not
Validated** — confirm both before relying on it in production.

**Added to the cataloguing to-do list (per Blair, 2026-09-11) — not done
yet:** `vEmployerEligibleCount` needs a Notion Data Product Catalogue
entry, same as the other new objects tracked in "Last step" below.

**Metrics 3/4's health-plan bucket mapping — resolved 2026-09-11.** Blair
confirmed the approach: map by business name between the two sources,
collapsing to display labels. Data Preview confirmed:
- `vEmployerSaves.CUST_BUND_NAME` (passes straight through to Gold's
  `Health_Plan_Bundle`, no `CASE`/lookup) has all 4 buckets: `Select
  Copay`, `Select HDHP`, `Value HDHP`, `Value Copay` — the 4th
  (`Value Copay`) was unconfirmed as of the first preview pass, then
  independently confirmed to exist on a second check.
- One label mismatch, display-only, not a data issue: source says
  `Value HDHP`, requirements doc's bucket name is `Value High
  Deductible` — same plan, different label. **Decided:** map `Value
  HDHP` → `Value High Deductible` as a presentation-layer rename in the
  widget, not a SQL-level change.
- "2026 Employer Annual Elections"'s `Comment` column holds
  `"<Plan Name> <Amount>"` strings (`Select Copay 2000`, `Value HDHP
  4000`, ...) — the bucket name needs the trailing number stripped:
  ```sql
  SUBSTR_REGEXPR('^(.+?)\s+[0-9]+$' IN "<comment_column>" GROUP 1) AS "Health_Plan_Bundle_2026"
  ```
  **Still needed before this can be written for real:** (1) the
  technical column name behind the "Comment" label (its Business Name is
  a leftover default, not descriptive — check the Columns (22) tab), and
  (2) confirmation the object is queryable in SQL as `"ZVHCM_AE_1_26Q"`
  (the name shown under its title) or whatever its real Datasphere
  technical object name turns out to be.

**Metric 5's HSA bucket collapsing — resolved 2026-09-11 by Blair:**
"Annual" = `HSA_Single` OR `HSA_Family` either >0, collapsed into one
bucket; "One-time" = `HSA_One_Time_Single` OR `HSA_One_Time_Family`
either >0, collapsed into one bucket similarly — a real change from
today's four independent per-field counts. Since `main.js` already keys
row-kind off the `Election_Category` string, the "Elected 0 / Elected
>0" split can ride inside that same string rather than needing a new
dimension:
```sql
UNION ALL
SELECT '', '', 'HSA Annual - Elected 0', CAST(NULL AS TIMESTAMP), CAST(NULL AS INT), COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_Single" <= 0 AND "HSA_Family" <= 0

UNION ALL
SELECT '', '', 'HSA Annual - Elected >0', CAST(NULL AS TIMESTAMP), CAST(NULL AS INT), COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND ("HSA_Single" > 0 OR "HSA_Family" > 0)

-- same two-block pattern again for "HSA One Time - Elected 0/>0" using
-- HSA_One_Time_Single / HSA_One_Time_Family
```
This replaces the existing 4 independent HSA `UNION ALL` blocks in the
cube SQL above once built — not additive to them, since they'd otherwise
report the same underlying data two conflicting ways.

**Metrics 1/2's eligible-count YoY — draft ready, needs the new `Year`
column added to the cube schema first** (nullable, `NULL` on every
existing row, same pattern as `Date`):
```sql
UNION ALL
SELECT CAST('' AS NVARCHAR(50)), CAST('' AS NVARCHAR(50)), 'Eligible Count',
       CAST(NULL AS TIMESTAMP), "EnrollmentYear", CAST(NULL AS BIGINT), SUM("EligibleCount")
FROM "vEmployerEligibleCount"
GROUP BY "EnrollmentYear"
```
(reuses the existing `EmployeeCount` measure slot for `SUM(EligibleCount)`,
since that column is otherwise unused on non-Status rows)

**Still open — STATUS vocabulary mismatch** between "2026 Employer
Annual Elections" (`Undetermined`/`Completed EL`/`Completed OTP`) and our
own `Enrollment_Status` (`Success`/`Abandoned`/etc.) — not resolved, may
not matter if the 5 metrics above never actually need to join on status.

**Technical identifiers confirmed 2026-09-11** via the Columns (22) tab
on "2026 Employer Annual Elections": two different columns both default
to Business Name "Comment" (a leftover UI quirk, not a conflict) —
`CONTRIBUTIONSET` (String 50) and `GEOG` (String 50). Column order in the
Data Preview grid ("Comment" right after "R/2 table", before
"ContributionSet") matches the Columns tab order exactly, confirming
**`CONTRIBUTIONSET` is the one holding `"Select Copay 2000"`-style
values** — `GEOG`'s "Comment" default is the unrelated Synod/geography
field; `CONTRIB_PR` (labeled "ContributionSet" in the UI, confusingly)
holds the `CLASS-X_GOLD` tier codes, not needed here. General tab
confirms the object's real technical name is `ZVHCM_AE_1_26Q`, Status:
Deployed — queryable now as `FROM "ZVHCM_AE_1_26Q"`.

**Full combined-cube SQL rewrite — first attempt failed to deploy
2026-09-11**, error: `Column Year could not be resolved. Column xpr2
could not be resolved. Column xpr1 could not be resolved.` Root cause:
every branch after the first left the new `Year` column unaliased (bare
`2027`, bare `2026`, bare `CAST(NULL AS INT)`, or `"EnrollmentYear"` —
none said `AS "Year"`). Unlike raw HANA `UNION ALL` semantics (only the
first branch's aliases matter for the real result set), Datasphere's SQL
View validator apparently requires every branch to name every column
explicitly. **Corrected version below aliases every column in every
branch** — this is the one to actually deploy:

```sql
SELECT
    "Synod_Region"            AS "Synod_Region",
    "Enrollment_Status"       AS "Enrollment_Status",
    CAST('' AS NVARCHAR(50))  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)   AS "Date",
    NULL                      AS "Enrollment_Year",
    COUNT(*)                  AS "EmployerCount",
    SUM("Employee_Count")     AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
GROUP BY "Synod_Region", "Enrollment_Status"

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))  AS "Synod_Region",
    CAST('' AS NVARCHAR(50))  AS "Enrollment_Status",
    "Health_Plan_Bundle"      AS "Election_Category",
    CAST(NULL AS TIMESTAMP)   AS "Date",
    2027                      AS "Enrollment_Year",
    COUNT(*)                  AS "EmployerCount",
    CAST(NULL AS DECIMAL)     AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success'
GROUP BY "Health_Plan_Bundle"

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))  AS "Synod_Region",
    CAST('' AS NVARCHAR(50))  AS "Enrollment_Status",
    "Bucket"                  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)   AS "Date",
    2026                      AS "Enrollment_Year",
    COUNT(*)                  AS "EmployerCount",
    CAST(NULL AS DECIMAL)     AS "EmployeeCount"
FROM (
    SELECT SUBSTR_REGEXPR('^(.+?)\s+[0-9]+$' IN "CONTRIBUTIONSET" GROUP 1) AS "Bucket"
    FROM "ZVHCM_AE_1_26Q"
) x
GROUP BY "Bucket"

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                       AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                       AS "Enrollment_Status",
    CAST('HSA Annual - Elected 0' AS NVARCHAR(50))  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                        AS "Date",
    NULL                                            AS "Enrollment_Year",
    COUNT(*)                                       AS "EmployerCount",
    CAST(NULL AS DECIMAL)                          AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_Single" <= 0 AND "HSA_Family" <= 0

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                       AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                       AS "Enrollment_Status",
    CAST('HSA Annual - Elected >0' AS NVARCHAR(50)) AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                        AS "Date",
    NULL                                            AS "Enrollment_Year",
    COUNT(*)                                       AS "EmployerCount",
    CAST(NULL AS DECIMAL)                          AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND ("HSA_Single" > 0 OR "HSA_Family" > 0)

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                          AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                          AS "Enrollment_Status",
    CAST('HSA One Time - Elected 0' AS NVARCHAR(50))   AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                           AS "Date",
    NULL                                               AS "Enrollment_Year",
    COUNT(*)                                          AS "EmployerCount",
    CAST(NULL AS DECIMAL)                             AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_One_Time_Single" <= 0 AND "HSA_One_Time_Family" <= 0

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                          AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                          AS "Enrollment_Status",
    CAST('HSA One Time - Elected >0' AS NVARCHAR(50))  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                           AS "Date",
    NULL                                               AS "Enrollment_Year",
    COUNT(*)                                          AS "EmployerCount",
    CAST(NULL AS DECIMAL)                             AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND ("HSA_One_Time_Single" > 0 OR "HSA_One_Time_Family" > 0)

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))  AS "Synod_Region",
    CAST('' AS NVARCHAR(50))  AS "Enrollment_Status",
    CAST('' AS NVARCHAR(50))  AS "Election_Category",
    CAST(CAST("Completed_Date" AS DATE) AS TIMESTAMP) AS "Date",
    NULL                      AS "Enrollment_Year",
    COUNT(*)                  AS "EmployerCount",
    CAST(NULL AS DECIMAL)     AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "Completed_Date" IS NOT NULL
GROUP BY CAST("Completed_Date" AS DATE)

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                AS "Enrollment_Status",
    CAST('Eligible Count' AS NVARCHAR(50))  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                 AS "Date",
    "EnrollmentYear"                        AS "Enrollment_Year",
    CAST(NULL AS BIGINT)                    AS "EmployerCount",
    SUM("EligibleCount")                    AS "EmployeeCount"
FROM "vEmployerEligibleCount"
GROUP BY "EnrollmentYear"
```

**Important:** if you already have a `Year` attribute sitting in this
view's Model Properties from the earlier failed attempts, delete it
first (pencil/edit icon next to "Attributes" → remove `Year`) before
pasting this SQL in — a stale attribute definition pointing at the old
name could keep causing problems even after the SQL itself no longer
references `Year` at all.

Notes on this version:
- Replaces the 4 independent HSA blocks with the 2-bucket collapsed
  version — don't run both at once, they'd double-report the same data
  two conflicting ways.
- The `Year` column is `NULL` on every row except the two new
  YoY-relevant row-kinds (`Health_Plan_Bundle`/`Bucket` rows get
  2027/2026 respectively, `Eligible Count` rows get whatever
  `vEmployerEligibleCount.EnrollmentYear` is).
- `SUBSTR_REGEXPR` **confirmed working 2026-09-11** — tested standalone
  in a throwaway SQL View against `"ZVHCM_AE_1_26Q"`, returned clean
  values (`Select Copay`, `Value HDHP`, ...), no `NULL`s or malformed
  rows. Safe to trust in the full `UNION ALL` below.
- `Value HDHP` → `Value High Deductible` label mapping stays a
  presentation-layer rename in `main.js`, not in this SQL.
- **Lesson for future edits to this view:** always alias every column in
  every `UNION ALL` branch explicitly, even when raw SQL wouldn't require
  it — Datasphere's own SQL View validator is stricter than plain HANA
  here.
- **Second lesson, 2026-09-11 — reserved-name theory tested and
  disproven.** `Year` kept failing with the identical "Column Year could
  not be resolved" error even after (1) full aliasing fixed the earlier
  `xpr1`/`xpr2` symptom and (2) explicitly `CAST`-ing the one remaining
  raw passthrough to `INT`. Renamed the column to `Enrollment_Year`
  throughout as a further test — **the error tracked the rename exactly**
  ("Column Enrollment_Year could not be resolved"), which rules out a
  reserved/special-cased name (`Year`/`Date`/calendar auto-detection) as
  the cause. Three different SQL-level fixes (aliasing, casting,
  renaming) all produced the identical *generic* failure — strong
  evidence the problem isn't the SQL at all, it's this Fact-typed view's
  own Attribute/Measure semantic wrapper not picking up **any** newly
  added column from a SQL text edit, regardless of name or type.
  **Fact-wrapper theory also tested and disproven:** switched Semantic
  Usage to Relational Dataset (which does no Attribute/Measure validation
  at all) and the save still failed with the identical "Column
  Enrollment_Year could not be resolved" error.
  **Root cause found, 2026-09-11, via bisection in a fresh throwaway
  view:** it was never about the object, deployment state, Semantic
  Usage, or the column's name/case — it was one specific expression:
  `CAST("EnrollmentYear" AS INT)`. Bisection sequence: `SELECT *` →
  worked; `SELECT "EnrollmentYear", "EligibleCount"` (no aggregation) →
  worked; `SELECT "EnrollmentYear", SUM("EligibleCount") ... GROUP BY
  "EnrollmentYear"` (aggregation, no `CAST`) → worked; adding the `CAST`
  back into that same aggregation query → failed identically. Since
  `EnrollmentYear`'s own Technical Name popup already showed **Data
  Type: Integer**, the `CAST(... AS INT)` was always redundant.
  **Dropping the cast from only the last branch wasn't enough** — the
  full 8-branch query still failed identically, because that left one
  branch supplying `Enrollment_Year` as a raw `Integer` column while
  every other branch still supplied it via `CAST(... AS INT)`, a mix of
  "cast expression" vs. "raw native column" across the same `UNION ALL`
  column. **Real fix: `CAST(... AS INT)` removed from every branch**,
  replaced with bare `NULL` / bare integer literals (`2027`, `2026`) /
  the raw column — fully consistent representation across all 8
  branches. See the corrected SQL below.

**Status: fully deployed, 2026-09-11/12.**
1. SQL deployed into `DS_EMPLOYER_ENROLLMENT_SUMMARY`. `Enrollment_Year`
   auto-detected as a new Attribute on `AM_EMPLOYER_ENROLLMENT_SUMMARY`
   (no manual step needed there, unlike `Date` earlier). Bound in the SAC
   Builder panel's Dimensions list, in the required order (`Enrollment_
   Status`, `Synod_Region`, `Election_Category`, `Completed_Date`,
   `Enrollment_Year`) and Measures order (`EmployerCount`,
   `EmployeeCount`) — both confirmed correct via screenshot.
2. `main.js` changes done: parses `dimensions_4` (Year); routes rows into
   `byHealthPlan[year]`/`byHsaBucket`/`byEligibleCount[year]`; new "HSA
   Elections" panel; "Year-over-Year Changes" panel repurposed for the
   real health-plan-bucket comparison + eligible-count delta; `Value
   HDHP` → `Value High Deductible` display rename applied; dead
   `_parseYoY()`/`MOCK_YOY`/`yoyComparison` property read all removed,
   `widget.json`'s `yoyComparison` binding formally deprecated (same
   pattern as `dailyCounts`). Verified against mock data in the Browser
   pane — all panels render correctly, no console errors.

**Bug found and fixed 2026-09-12 — live data initially showed zero on
every panel except a garbled Timeline.** Diagnosed via direct comparison:
a native SAC Table bound to the same `AM_EMPLOYER_ENROLLMENT_SUMMARY`
model, same dimensions, showed plenty of real data (`Select Copay`:
2,251; HSA buckets with real counts; `Eligible Count` present; a
`(No Value)` row at 4,968 — almost certainly the plain Status/Synod
rows) — ruling out the query, model, and Builder-panel bindings (both
Dimensions and Measures order were independently re-confirmed correct
too). Root cause found via the browser DevTools console, inspecting the
widget's actual received data directly
(`document.querySelector('com-porticobenefits-aesnapreport')._employer
Status.data`): **SAC represents a blank/unassigned dimension member with
placeholder text — `"(Null)"` or `"(No Value)"`, `id: "@NullMember"` —
not an empty string.** `main.js`'s `_dim()` helper returned that literal
placeholder text as-is, and since it's truthy in JavaScript, every
row-kind branch in `_parseEmployerStatus()` that checks `if (date) {...}`
/ `if (subType) {...}` to distinguish row-kinds misfired — the 4,968
plain Status/Synod rows (whose `Election_Category` is genuinely blank)
were being read as if `Election_Category` held real text, misrouting the
entire dataset. **Fix:** `_dim()` now normalizes `id === "@NullMember"`
or `label === "(Null)"`/`"(No Value)"` back to `""` before returning.
Confirmed as a safe no-op against mock data (which already uses genuine
`""` strings) — re-verified all panels render identically to before in
the Browser pane after the fix. Pushed to GitHub with a recomputed
integrity hash; **not yet re-verified against live SAC data** — that's
the next thing to confirm once the widget definition is refreshed again.

## SAC Custom Widget registration — refresh doesn't work, confirmed 2026-09-12

Whenever `widget.json` or `main.js` changes (new SHA-384 `integrity` hash,
new dimensions, anything), SAC's own **Custom Widgets** registry
(Stories → Custom Widgets tab) needs to pick up the new manifest before
any Story using the widget will see the change. **Confirmed via a direct
test:** checking the widget's row and clicking the circular refresh icon
in that list's toolbar does **not** re-fetch `widget.json` from its
hosted URL — it only reloads the list's own display from SAC's cached
registry metadata. Proved by bumping `widget.json`'s `version` field
(1.0.0 → 1.0.1), pushing, then clicking refresh: the Version column
stayed at 1.0.0.

**The only reliable path found so far: delete the widget entry from this
list and re-add it (re-registering it against the same `widget.json`
URL).** This does correctly pick up the latest manifest/hash, but loses
the widget instance's existing Story-level bindings (Dimensions/Measures
order in the Builder panel), which then need to be reconfigured from
scratch — see "Combined-cube dimension/measure order" note elsewhere in
this doc for the exact required order.

## Queued next — after the download experience is finished

**Blair, 2026-09-12:** once the Table+Export download is working, explore
splitting this single dashboard into two: one **strategic/executive**
version and one **operational** version. Not scoped yet — no decisions
made on what moves where, just flagging it now so it isn't lost.

## Last step, once everything above is built: catalogue it

Per `claude.md`'s reuse-first convention, every new Datasphere object
built for this report needs a Notion Data Product Catalogue entry once
the build settles — don't let these sit uncatalogued the way `geog`/
`ertype` sourcing sat unclear for months elsewhere in this catalogue.
New objects from this effort, not yet catalogued:
- `GLD_AE_Employer_Enrollment`
- `DS_EMPLOYER_ENROLLMENT_SUMMARY`
- `AM_EMPLOYER_ENROLLMENT_SUMMARY`
- `AM_EMPLOYER_ENROLLMENT_DETAIL` (the Analytic Model on
  `GLD_AE_Employer_Enrollment`), once built
- The Table+Export Table widget, once built
- `vEmployerEligibleCount` (Quality (200) CRM space) — see "YoY panel"
  above; found 2026-09-11, not yet catalogued

**Worth checking first, not assuming:** `vEmployerSaves` (this doc) vs.
`vwEmployerSaves` (the name already catalogued 2026-09-03 as part of the
AE_EE family) — confirm whether these are the same object under two
names, or genuinely two different views, before cataloguing anything new
under either name.
