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

**Linked Analysis — done 2026-09-13.** Input Controls (Enrollment_Status,
Synod_Region) didn't filter the Table at first — expected, not a bug:
they're bound to `AM_EMPLOYER_ENROLLMENT_SUMMARY`'s dimensions, and SAC
has no way to know those are "the same" as `AM_EMPLOYER_ENROLLMENT_
DETAIL`'s own same-named dimensions across two unrelated models without
being told explicitly. Fixed via **Tools → Link Dimensions**, mapping
each model's `Enrollment_Status`/`Synod_Region` to the other's. Confirmed
working — the Table now filters along with the dashboard.

**Status: download experience complete.** Gold (Fact + 5 Measures) →
`AM_EMPLOYER_ENROLLMENT_DETAIL` → Table widget (flat grid, fixed
`Enrollment_Status = 'Success'` filter, shrunk footprint + explanatory
Text) → Linked Analysis via Link Dimensions, all working end to end.

## Not in this build — pending, added later

- **"Defaulted"** status — definition not yet confirmed via an exact
  mapping, but **very likely identified 2026-09-14**: see "Status
  vocabulary — likely major correction needed" below. Not part of Gold
  or the aggregate cube above; will be a field addition once the mapping
  is confirmed.
  Note: Member Enrollment's version of this same question turned out to
  hinge on a per-member "chosen for PSP" tag (see `ae-member-enrollment-
  report/BUILD_PLAN_FOR_AHMED.md`) — worth checking whether Employer
  Selection has an equivalent tag-based mechanism before assuming a
  simple date-comparison will do.

## Status vocabulary — likely major correction needed, flagged 2026-09-14

Blair shared a "former report" (screenshots, not yet a catalogued
Datasphere object) showing **5 real statuses**: `Open`, `Completed EL`
(Completed on EmployerLink), `Completed OTP`, `Default`, `Default
Override` — a genuinely different vocabulary from Gold's current
`Success`/`Abandoned`/`Not Started`/`In Progress`/`Needs Follow-up`
(derived from `vEmployerSaves.ResultCode`, values `S`/`A`/`N`/`IP`/
`F`/`E`/`W`/`I` with an `ELSE` catch-all — see the "Total Set Up ≈ Non-
Completed" investigation directly above, which may well be a symptom of
this same root problem).

**Likely resolves two long-open questions at once:**
1. `"Default"` is almost certainly the real definition of the
   `"Defaulted"` status this doc has carried as unanswered since the
   project started.
2. `"Completed EL"`/`"Completed OTP"` is the **exact same terminology**
   already seen on `"2026 Employer Annual Elections"`'s own `STATUS`
   field (`Undetermined`/`Completed EL`/`Completed OTP`) — catalogued
   weeks ago and treated at the time as an unrelated vocabulary
   mismatch (see the YoY panel section above, "Still open — STATUS
   vocabulary mismatch"). Seeing the identical terms again in this
   former report suggests these may **not** be two coincidentally
   similar vocabularies — the correct source for Gold's status might
   never have been `vEmployerSaves.ResultCode` at all, and could belong
   to the same lineage/table as that `STATUS` field instead.

**Blocking questions asked of Blair, 2026-09-14, not yet answered:**
1. What is the actual source of this former report — built from
   `vEmployerSaves`/`ResultCode` too (just a more complete mapping than
   the one currently guessed at), or a different table entirely?
2. What determines `Default` vs. `Default Override` specifically — a
   `ResultCode` value, a date comparison, or something else?

**Not acted on yet — this could mean rebuilding Gold's entire status
derivation**, so no SQL changes made until the mapping is confirmed.
Screenshot reference (former report, not yet in Datasphere): a cross-tab
by health-plan bundle x status (`Open`/`Completed EL`/`Completed OTP`/
`Default`/`Default Override`), totals `Open: 1`, `Completed EL: 4,254`,
`Completed OTP: 6`, `Default: 655`, `Default Override: 1` — likely a
full/closed historical cycle used as a reference for what this vocabulary
looks like at scale, not current live 2027 numbers.

## New requirements from a former report — captured 2026-09-14, not yet built

Blair also shared the following requirements, drawn from a former
report's images/metrics to emulate this year. None of these are built
yet; captured here so nothing is lost. Some may depend on the status-
vocabulary question above being resolved first (particularly anything
scoped to "Completed").

1. **Employer Elections panel** — Elected health plan, Employer Name,
   Address, Count of employees at employer (bonus: count of dependents).
   Richer per-employer detail than the current download table; the
   former report's own detail view showed `STATUS`, `Contribution Set`,
   `Employer` (number), `Name`, `Street`, `Street 2`, `City`, `Region`,
   `Postal Code`, `Country/Region Key`, `No of Employees` — most of
   these already exist in `GLD_AE_Employer_Enrollment` or `vDimEmployer`
   (Street/City/Region/Postal Code/Country would be new fields, not
   currently pulled into Gold).
2. **YoY comparison by Employer, Address, Count of Employees** (bonus:
   Count of Dependents) — genuinely per-employer YoY, distinct from the
   aggregate-bucket YoY already built (health-plan buckets, eligible
   headcount). Not yet scoped how this would fold into the one-model-
   per-widget architecture.
3. **HSA view** — Employer Elections (with YoY comparison again) plus
   HSA elections specifically. Sounds like a dedicated panel/page
   combining #1 and #2's per-employer grain with HSA data, not just the
   existing aggregate HSA bucket counts.
4. **Timeline as a visual grid instead of a bar chart** — independent of
   the status-vocabulary question, and already discussed earlier as an
   idea Blair liked (heatmap-grid style, one cell per day). Worth
   building once the dashboards aren't mid-rework from the status
   change.
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
    a."AttemptedOn"        AS "Last_Attempted_On",
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

**Status: deployed and confirmed live** (Semantic Usage Fact, 5 Measures,
`AM_EMPLOYER_ENROLLMENT_DETAIL` built on top — see "Binding the Table"
above). **`Last_Attempted_On` added 2026-09-13** for the Operational
widget's Stalled-time-buckets metric — not yet redeployed as of this
writing.

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

## Dashboard split — Executive vs. Operational widgets, started 2026-09-13

Blair wants the single AE Snap Report widget split into two: an
**Executive/Strategic** widget ("at a glance" for leadership) and an
**Operational** widget (for teams on the ground). Two separate widget
projects (codebases/repos), not one widget with a mode toggle — cleaner
for permissioning, lower-risk to build. **"Days remaining until AE
window closes" idea dropped** — no known fixed deadline date tracked
anywhere in this data; not worth guessing at.

**Architecture decided:** both widgets bind to the **same** underlying
model (`DS_EMPLOYER_ENROLLMENT_SUMMARY`/`AM_EMPLOYER_ENROLLMENT_SUMMARY`),
extended with 3 new row-kinds needed only by Operational. Executive's
`main.js` just doesn't render the operational-only row-kinds even though
they're present in the bound data. Avoids two aggregate cubes drifting
apart over time.

**Proposed panel split (pending final build):**
- **Executive:** top 5 KPI tiles, Synod/Region completion progress,
  Health Plan mix as % (not raw counts), Year-over-Year Changes,
  Eligible Employees as its own headline (not just a YoY delta line),
  Abandoned-specific callout (separate from the general Non-Completed
  bucket), lowest-performing-region callout. No Timeline, no per-status
  detail, no HSA detail, no download table.
- **Operational:** trimmed top tiles (Total Set Up/Completed/Non-
  Completed), Non-Completed — By Status, **new**: same broken out per
  Synod (richer cross-tab — reuses the *existing* Status/Synod block's
  data, which already groups by both dimensions together; just a new JS
  parse/render, no new SQL), **new**: Multiple Attempts count, **new**:
  Stalled-time buckets (0-7/8-14/15+ days since last attempt), **new**:
  Recently Completed (last 2 days), Of Complete — Election Type, HSA
  Elections, full Timeline, the Table+Export download (the existing
  Table widget just needs to sit on this new page too — no rebuild).

**New SQL needed for Operational's 3 new metrics** — added to Gold
(expose `Last_Attempted_On`, previously only used internally for the
dedup) and 3 new `UNION ALL` blocks in the combined cube (Multiple
Attempts, Stalled buckets, Recently Completed). Full replacement SQL for
both objects given to Blair 2026-09-13 — see updated versions below.
**Flagged, not yet verified:** `DAYS_BETWEEN`/`ADD_DAYS` are real HANA
functions but their exact argument order/behavior hasn't been confirmed
against this Datasphere instance — given how many HANA-specific
surprises this project has hit, test these 3 new blocks (or bisect the
whole cube the same way the `Enrollment_Year` bug was isolated) if the
full redeploy fails. **Status: SQL given, not yet deployed.**

**Not yet started:** scaffolding the two new widget projects themselves
(new folders/repos, `widget.json` + `main.js` for each, reusing the
existing design system/CSS). Comes after the SQL is confirmed working.

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
    2027                      AS "Enrollment_Year",
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

UNION ALL

-- Added 2026-09-13 for the Operational widget — see "Dashboard split" above
SELECT
    CAST('' AS NVARCHAR(50))                   AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                   AS "Enrollment_Status",
    CAST('Multiple Attempts' AS NVARCHAR(50))  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                    AS "Date",
    NULL                                       AS "Enrollment_Year",
    COUNT(*)                                   AS "EmployerCount",
    CAST(NULL AS DECIMAL)                      AS "EmployeeCount"
FROM (
    SELECT "RequestId" FROM "vEmployerSaves" GROUP BY "RequestId" HAVING COUNT(*) > 1
) x2

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))  AS "Synod_Region",
    CAST('' AS NVARCHAR(50))  AS "Enrollment_Status",
    "Bucket"                  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)   AS "Date",
    NULL                      AS "Enrollment_Year",
    COUNT(*)                  AS "EmployerCount",
    CAST(NULL AS DECIMAL)     AS "EmployeeCount"
FROM (
    SELECT
        CASE
            WHEN DAYS_BETWEEN("Last_Attempted_On", CURRENT_DATE) <= 7 THEN 'Stalled 0-7 Days'
            WHEN DAYS_BETWEEN("Last_Attempted_On", CURRENT_DATE) <= 14 THEN 'Stalled 8-14 Days'
            ELSE 'Stalled 15+ Days'
        END AS "Bucket"
    FROM "GLD_AE_Employer_Enrollment"
    WHERE "Enrollment_Status" != 'Success'
) y
GROUP BY "Bucket"

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                    AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                    AS "Enrollment_Status",
    CAST('Recently Completed' AS NVARCHAR(50))  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                     AS "Date",
    NULL                                        AS "Enrollment_Year",
    COUNT(*)                                    AS "EmployerCount",
    CAST(NULL AS DECIMAL)                       AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "Completed_Date" >= ADD_DAYS(CURRENT_DATE, -2)
```

**Status: deployed and confirmed live through the "Eligible Count" block
(9 blocks total) — see "Download experience"/"YoY panel" sections above
for the full verification trail. The 3 new blocks above (Multiple
Attempts, Stalled buckets, Recently Completed) were added 2026-09-13 for
the Operational widget — not yet deployed/verified.** `DAYS_BETWEEN`/
`ADD_DAYS` argument order/behavior unconfirmed against this Datasphere
instance; bisect (same method used for the `Enrollment_Year` bug) if the
redeploy fails.

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

## Operational — employer-size focus, started 2026-09-14

Blair: the Operational dashboard needs to be more employer-focused —
KPIs that show how employers are moving through the process by size
("employers with 3+ eligible employees are still not started"), plus
the ability to select one employer and see their 2026 vs. 2027
elections side by side. Input Control lives **outside** the custom
widget (Blair's own call, 2026-09-14) — same pattern as the existing
Synod/Status Linked Analysis filters, not a new mechanism.

**Eligible Employee Band — confirmed 2026-09-14 by Blair: mutually-
exclusive tiers**, not overlapping "at least" flags. One band per
employer: `Under 3` / `3-9` / `10-19` / `20+`. An employer missing from
`vEmployerEligibleCount` entirely falls into an explicit `Unknown` band
rather than silently disappearing from the count.

**Design choice (mine, flagged for Blair to adjust):** rather than a
literal "3+ eligible employees" cumulative-threshold callout (which
would contradict the tiers decision above), the size-aware KPI is a
**per-band completion-progress panel** — same `_progressRowsHtml` design
already used for Executive's Synod panel (`X of Y completed` + % bar),
just banded by size instead of by region, ordered largest-first (`20+`
→ `10-19` → `3-9` → `Under 3`). This answers "how employers are moving
through the process, by size" directly. A headline callout for the
largest band's outstanding count (mirroring Executive's "needs
attention: lowest region" line) covers the literal "still not started"
framing on top of that.

### New cube SQL — Status × Eligible Band

New `UNION ALL` block for `DS_EMPLOYER_ENROLLMENT_SUMMARY`, following
the same full-aliasing / consistent-expression-shape rules the rest of
this cube already learned the hard way. Bands computed against
`vEmployerEligibleCount`'s 2027 rows (Gold is a 2027-only view, so this
matches it to the same plan year):

```sql
UNION ALL

-- Status x Eligible Employee Band — new 2026-09-14, for Operational's
-- size-aware "still Not Started" KPIs. Employers missing a 2027 row in
-- vEmployerEligibleCount fall into an explicit "Unknown" band rather
-- than disappearing from the count.
SELECT
    CAST('' AS NVARCHAR(50))  AS "Synod_Region",
    z."Enrollment_Status"     AS "Enrollment_Status",
    z."Band"                  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)   AS "Date",
    NULL                      AS "Enrollment_Year",
    COUNT(*)                  AS "EmployerCount",
    CAST(NULL AS DECIMAL)     AS "EmployeeCount"
FROM (
    SELECT
        g."Enrollment_Status" AS "Enrollment_Status",
        COALESCE(
            CASE
                WHEN eb."EligibleCount" >= 20 THEN '20+'
                WHEN eb."EligibleCount" >= 10 THEN '10-19'
                WHEN eb."EligibleCount" >= 3  THEN '3-9'
                WHEN eb."EligibleCount" IS NOT NULL THEN 'Under 3'
                ELSE 'Unknown'
            END, 'Unknown'
        ) AS "Band"
    FROM "GLD_AE_Employer_Enrollment" g
    LEFT JOIN (
        SELECT "EMPRNO", "EligibleCount"
        FROM "vEmployerEligibleCount"
        WHERE "EnrollmentYear" = 2027
    ) eb ON eb."EMPRNO" = g."Employer_Number"
) z
GROUP BY z."Enrollment_Status", z."Band"
```

**Status: written, not yet deployed** — needs to be pasted in as an
11th `UNION ALL` block onto the existing 10-block cube (9 original +
the 1 "Eligible Count" block already counted above; the 3 operational
blocks from 2026-09-13 bring it to 10). No new Attribute should appear
in `AM_EMPLOYER_ENROLLMENT_SUMMARY`'s Model Properties — this block
reuses `Enrollment_Status`/`Election_Category`/`EmployerCount`, all
already-bound columns, so no Builder-panel rebinding needed. Row-kind
is distinguishable in `main.js` because it's the *only* row-kind where
both `Enrollment_Status` and `Election_Category` are populated at the
same time — every other row-kind leaves one or the other blank.

### `main.js` changes (Operational widget only — Executive doesn't get this panel)

1. New `BAND_ORDER = ["20+", "10-19", "3-9", "Under 3", "Unknown"]`
   constant.
2. `_parseEmployerStatus()`: new `if (status && subType && BAND_ORDER.
   includes(subType))` branch (checked before the generic safety net),
   tracking `byBand[band] = { total, completed }` the same shape as
   `bySynod`.
3. Copied `_progressRowsHtml()` and the `.progress-track`/`.progress-
   fill` CSS from the Executive widget verbatim (Operational didn't
   have this helper yet — Operational's own Synod treatment is the
   richer cross-tab, not a progress panel).
4. New section "Not Yet Completed — By Employer Size", placed right
   after the top KPI tiles (high visual priority, per Blair's framing
   that this dashboard needs to be "more employer focused") — a
   progress-row per band, largest-first, plus a callout line for the
   `20+` band's outstanding (non-completed) count if any exist.
5. Mock data extended with a representative spread of Status × Band
   combinations, including one `Unknown` row, so the panel is demoable
   before real data is bound.
6. `widget.json`'s `employerStatus` binding description updated to
   document the new row-kind (same pattern as the other 3 operational
   row-kinds added 2026-09-13).

### Per-employer 2026-vs-2027 drill-down — spec finalized and SQL verified 2026-09-14, not yet built

Blair confirmed the employer-selector **Input Control lives outside
the custom widget** and filters a **native SAC Table** — not
custom-widget code — via the same Linked Analysis mechanism already
used elsewhere on this Story. This mirrors the Table+Export download
decision (native component, sidesteps the confirmed View-mode click-
delivery bug entirely) rather than re-litigating it.

**Single-Table design — confirmed by Blair, 2026-09-14.** One native
Table, one wide employer-grain model, both years' fields as separate
columns on the same row, **default-sorted to double as the
"constructive default state"** (largest `Eligible_Band` first,
non-completed status first) when no employer is selected. Selecting one
employer via the Input Control narrows the same Table to that
employer's single row, showing 2026 and 2027 side by side — no second
widget or view-swapping needed.

**Sort wrinkle found while finalizing this:** SAC Tables sort text
columns alphabetically by default, and `"20+"` doesn't alphabetize
ahead of `"10-19"`/`"3-9"` — a plain sort on `Eligible_Band` would NOT
put the largest band first. **Fix: two integer sort-helper columns**
(`Band_Sort_Order`, `Status_Sort_Order`) added to the view specifically
so the Table's default multi-column sort is numeric and reliable,
instead of depending on fragile custom-sort configuration in the SAC
UI. Hide both columns in the Table's column layout — they exist only to
drive the sort.

**New view needed — `GLD_AE_Employer_Enrollment_YoY`** (name not yet
confirmed), joining Gold (2027) to Matt Christensen's `ZVHCM_AE_1_26Q`
(2026, catalogued as a Near-Duplicate of AE_Employer Election — see
`data-catalogue/products/2026-employer-annual-elections.md`) by
`EMPRNO`/`Employer_Number`:

**Bug found and fixed 2026-09-14:** first version of this SQL included
a `CREATE VIEW "GLD_AE_Employer_Enrollment_YoY" AS` wrapper, breaking
from the bare-`SELECT` pattern every other SQL in this doc follows.
Datasphere's SQL View editor is just the query definition for a view
object that already exists in the Data Builder — it doesn't take DDL.
Failed with `Mismatched <Identifier>, expecting '(', 'select'` plus
downstream "model is empty"/"needs a visible measure" errors (both
just consequences of the parse failure). **Fix: removed the wrapper
line** — corrected version below is the one to paste in.

```sql
SELECT
    g."Employer_Number"          AS "Employer_Number",
    g."Employer_Name"            AS "Employer_Name",
    g."Synod_Region"             AS "Synod_Region",
    g."Employee_Count"           AS "Employee_Count_2027",
    eb."EligibleCount"           AS "Eligible_Count_2027",
    COALESCE(
        CASE
            WHEN eb."EligibleCount" >= 20 THEN '20+'
            WHEN eb."EligibleCount" >= 10 THEN '10-19'
            WHEN eb."EligibleCount" >= 3  THEN '3-9'
            WHEN eb."EligibleCount" IS NOT NULL THEN 'Under 3'
            ELSE 'Unknown'
        END, 'Unknown'
    )                             AS "Eligible_Band",
    -- Sort-helper, not for display — drives the Table's default sort so
    -- "20+" genuinely sorts first (see "Sort wrinkle" note above).
    CASE
        WHEN eb."EligibleCount" >= 20 THEN 1
        WHEN eb."EligibleCount" >= 10 THEN 2
        WHEN eb."EligibleCount" >= 3  THEN 3
        WHEN eb."EligibleCount" IS NOT NULL THEN 4
        ELSE 5
    END                           AS "Band_Sort_Order",
    g."Enrollment_Status"        AS "Status_2027",
    -- Sort-helper, not for display — non-completed statuses first.
    CASE g."Enrollment_Status"
        WHEN 'Not Started'      THEN 1
        WHEN 'In Progress'      THEN 2
        WHEN 'Needs Follow-up'  THEN 3
        WHEN 'Abandoned'        THEN 4
        WHEN 'Success'          THEN 5
        ELSE 6
    END                           AS "Status_Sort_Order",
    g."Contribution_Set"         AS "Contribution_Set_2027",
    g."Health_Plan_Bundle"       AS "Health_Plan_Bundle_2027",
    g."HSA_Single"               AS "HSA_Single_2027",
    g."HSA_Family"               AS "HSA_Family_2027",
    g."HSA_One_Time_Single"      AS "HSA_One_Time_Single_2027",
    g."HSA_One_Time_Family"      AS "HSA_One_Time_Family_2027",
    y26."STATUS"                 AS "Status_2026",
    y26."CONTRIBUTIONSET"        AS "Contribution_Set_2026",
    CAST(y26."HSA_HRA_SINGLE"   AS DECIMAL(18,2)) AS "HSA_Single_2026",
    CAST(y26."HSA_HRA_FAMILY"   AS DECIMAL(18,2)) AS "HSA_Family_2026",
    CAST(y26."HSAONETIMESINGLE" AS DECIMAL(18,2)) AS "HSA_One_Time_Single_2026",
    CAST(y26."HSAONETIMEFAMILY" AS DECIMAL(18,2)) AS "HSA_One_Time_Family_2026",
    CAST(y26."EECOUNT"          AS BIGINT)        AS "Employee_Count_2026",
    y26."ACTDATE"                AS "Action_Date_2026"
FROM "GLD_AE_Employer_Enrollment" g
LEFT JOIN (
    SELECT "EMPRNO", "EligibleCount"
    FROM "vEmployerEligibleCount"
    WHERE "EnrollmentYear" = 2027
) eb ON eb."EMPRNO" = g."Employer_Number"
LEFT JOIN (
    -- Dedup to one row per employer — added 2026-09-14, once PROCDATE/
    -- ACTDATE were found on ZVHCM_AE_1_26Q (see BR-3 in its catalogue
    -- entry). Mirrors the exact pattern Gold already uses to dedupe
    -- vEmployerSaves by RequestId/AttemptedOn — same idea, latest action
    -- wins, applied here by EMPRNO/ACTDATE instead. Without this, the
    -- LEFT JOIN below could fan out if COUNTER's CUBE-like grain really
    -- does mean more than one row per employer (still not independently
    -- confirmed either way — see the Grain note in that catalogue entry).
    SELECT *
    FROM (
        SELECT
            "EMPRNO", "STATUS", "CONTRIBUTIONSET", "HSA_HRA_SINGLE",
            "HSA_HRA_FAMILY", "HSAONETIMESINGLE", "HSAONETIMEFAMILY",
            "EECOUNT", "ACTDATE",
            ROW_NUMBER() OVER (PARTITION BY "EMPRNO" ORDER BY "ACTDATE" DESC) AS "rn"
        FROM "ZVHCM_AE_1_26Q"
    ) ranked
    WHERE "rn" = 1
) y26 ON y26."EMPRNO" = g."Employer_Number"
```

**Status: view saved and deployed, 2026-09-14** (after fixing the
`CREATE VIEW` wrapper and casting the 5 `String(15)` numeric fields on
`ZVHCM_AE_1_26Q` — see the two bug notes above). All 19 mislabeled
Business Names manually renamed per the mapping above — **Attributes
and Measures now display correctly.** `AM_EMPLOYER_ENROLLMENT_YOY`
had already been created before the renaming pass (so it was still
showing the old inherited names); **deleted and recreated after the
rename, now saved and deployed with correct Attribute/Measure names.**
**Not yet done:** registering `sac-ae-drilldown-widget` in SAC, binding
its `employerYoy` feed to this model, and the Input Control — see
"Remaining build steps" below.

**Business Name mislabeling — found and worked around 2026-09-14, NOT
fixable in SQL.** Once `AM_EMPLOYER_ENROLLMENT_YOY`'s Model Properties
were opened, most Attributes/Measures were showing the wrong display
name — not my `AS` aliases, but names inherited from further up the
lineage (Gold's own column, or in several cases `vEmployerSaves`'/
`ZVHCM_AE_1_26Q`'s own raw field name, one or two hops further back
than expected). Confirmed via Technical Name popups that this is
**purely a display/labeling issue — every column is present, correctly
typed, and fully distinct** (e.g. `Contribution_Set_2027` and
`Contribution_Set_2026` are two real, separate columns, just both
mislabeled — one as `CONTRIBUTIONSET`, the other as the SAP-leftover
default `Comment`).

**First fix attempt failed and was reverted:** wrapped every plain
pass-through column in a no-op `COALESCE(col, col)`, on the theory that
Datasphere's Business Name inheritance follows column *syntax* (bare
reference vs. expression) — disproven. It follows *data lineage*
instead: `COALESCE(x, x)` still traces back to the same ultimate source
column, so the mislabeling wasn't fixed, and in a few cases the display
name changed to an *even earlier* ancestor than before. The `Eligible_
Band`/`Band_Sort_Order`/`Status_Sort_Order` columns display correctly
not because they're "expressions" in general, but because their `CASE`
branches return literal constants with no single traceable source
column at all — there's no ancestor to inherit from. Reverted the
`COALESCE` wrapping (harmless but pointless) back to plain columns.

**Actual fix: manually override the Business Name on each affected
column**, via the pencil/edit icon next to "Attributes"/"Measures" in
Model Properties — there is no SQL-level way around this.

| Currently shows as | Rename to |
|---|---|
| `EmployerNumber` | `Employer_Number` |
| `EmployerName` | `Employer_Name` |
| `Enrollment_Status` | `Status_2027` |
| `CONTRIBUTIONSET` | `Contribution_Set_2027` |
| `CUST_BUND_NAME` | `Health_Plan_Bundle_2027` |
| `STATUS` | `Status_2026` |
| `Comment` | `Contribution_Set_2026` |
| `Actdate` | `Action_Date_2026` |
| `numberOfEmployees` | `Employee_Count_2027` |
| `EligibleCount` | `Eligible_Count_2027` |
| `HSA_HRA_SINGLE` (1st) | `HSA_Single_2027` |
| `HSA_HRA_FAMILY` (1st) | `HSA_Family_2027` |
| `HSAONETIMESINGLE` (1st) | `HSA_One_Time_Single_2027` |
| `HSAONETIMEFAMILY` (1st) | `HSA_One_Time_Family_2027` |
| `HSA_HRA_SINGLE` (2nd) | `HSA_Single_2026` |
| `HSA_HRA_FAMILY` (2nd) | `HSA_Family_2026` |
| `HSAONETIMESINGLE` (2nd) | `HSA_One_Time_Single_2026` |
| `HSAONETIMEFAMILY` (2nd) | `HSA_One_Time_Family_2026` |
| `EECOUNT` | `Employee_Count_2026` |

`Synod_Region`, `Eligible_Band`, `Band_Sort_Order`, `Status_Sort_Order`
already display correctly — leave those alone. The four Measures rows
that appear as identical-looking duplicates (`HSA_HRA_SINGLE` etc., one
pair per HSA type) need their Technical Name checked before renaming —
don't rely on list position alone. **Not yet confirmed** whether this
same mislabeling silently exists on Gold's own Model Properties too
(e.g. `Contribution_Set` there might also display as `CONTRIBUTIONSET`)
— never surfaced as a problem before because no prior binding needed to
disambiguate it from a second, identically-sourced column the way this
YoY view does. Worth a quick look if Gold's own dimension bindings ever
seem confusing again.

**Deliberately not attempted here:** reconciling `Status_2026` (Matt's
`Undetermined`/`Completed EL`/`Completed OTP` vocabulary) against
`Status_2027` (`Success`/`Abandoned`/etc.) into one common status — this
is the same open question already flagged to Ahmed above. The view
passes both through as-is, labeled by year, rather than guessing at a
mapping. (`Status_Sort_Order` above only orders the 2027 side, which is
the one with a known, confirmed vocabulary.)

**`ACTDATE` dedup — verified against live data, 2026-09-14.** Two
throwaway-view queries against `ZVHCM_AE_1_26Q` confirmed:
- Clean `YYYYMMDD` 8-digit strings on both `ACTDATE`/`PROCDATE` — plain
  `ORDER BY "ACTDATE" DESC` sorts correctly as a date, no `CAST` needed
  (avoiding the exact class of casting bug that broke the cube earlier
  in this project).
- The object is effectively one-row-per-`EMPRNO` already — only one
  employer (`42234`) out of the whole object has more than one row.
- `"00000000"` is SAP's standard null-date sentinel — `ACTDATE` is
  unset on records that were never actioned (confirmed via `42234`,
  whose two rows are both `STATUS = "Undetermined"`).

**One known, accepted limitation:** when an employer's duplicate rows
are ALL `Undetermined` (`ACTDATE = "00000000"` on every one, `42234`'s
case), the dedup can't distinguish "most recent" among them — there's
no real action to be most recent, so `ROW_NUMBER()` picks one
arbitrarily. Not engineered around, since no other field reliably
breaks the tie either (their shared `PROCDATE` is identical too) and
this currently affects zero employers besides `42234` — see BR-3 in
the `2026-employer-annual-elections.md` catalogue entry for full detail.

### Pivoted from a native Table to a third custom widget — 2026-09-14

Blair's call: a bare native SAC Table dropped next to the Executive/
Operational widgets' glassmorphism styling would look bolted-on. New
plan — a **third custom widget**, `sac-ae-drilldown-widget`
("AE Employer Election Drill-Down"), styled with the exact same design
system, filtered by the same external Input Control via the same
Linked Analysis mechanism already working elsewhere on this Story
(that's a different code path than the confirmed-broken internal
click/change events — an external Input Control re-running the bound
query and pushing fresh data through `onCustomWidgetAfterUpdate` is the
standard, already-proven flow).

**Two render states, chosen purely by row count** — no separate "mode"
property needed:
- **Many rows (no employer selected)** → a "needs attention" list,
  sorted **client-side in JS** (largest `Eligible_Band`, least-complete
  `Status_2027` first) — this is the "constructive default state"
  Blair asked for. Capped at 20 rows with a "+N more" caption. Since
  sorting happens in JS, `Band_Sort_Order`/`Status_Sort_Order` aren't
  actually read by this widget (harmless to leave in the view/model
  regardless — a native Table alternative would have needed them).
- **Exactly one row (one employer selected)** → a clean 2026-vs-2027
  side-by-side comparison card — Status, Contribution Set, Health Plan
  Bundle (2027 only, "—" on 2026), the 4 HSA amounts, Employee Count.
  `Status_2026` and `Status_2027` are shown side by side, unreconciled,
  same as the view itself.

**Built and verified in the Browser pane, 2026-09-14** — both mock
states (multi-row list, single-row card) render correctly against the
real design-system CSS, sort order confirmed correct (20+/Not Started
ahead of 20+/In Progress, etc.), no console errors. `widget.json`,
`icon.svg`, `preview.html` (with a toggle button to swap mock states,
since real Input Control filtering can't be simulated standalone)
all scaffolded, matching the sibling widgets' structure.

**Not yet done:** creating and publishing the GitHub repo, registering
the widget in SAC, and the model/Table-config steps below (still
correct even with the native-Table plan replaced by a widget — the
model and Input Control binding work the same either way, only the
rendering surface changed).

### Remaining build steps

1. Build `AM_EMPLOYER_ENROLLMENT_YOY` — same recipe already proven on
   `AM_EMPLOYER_ENROLLMENT_DETAIL`: set `GLD_AE_Employer_Enrollment_YoY`'s
   Semantic Usage to **Fact**, mark the 11 `_2026`/`_2027` HSA/count
   fields as Measures (confirmed convertible after the `CAST` fix
   above), then build the Analytic Model on top.
2. Register `sac-ae-drilldown-widget` in SAC's Custom Widgets list
   (once published), bind its `employerYoy` feed to
   `AM_EMPLOYER_ENROLLMENT_YOY`, place it in the reserved space next to
   the Operational widget.
3. **Input Control:** bind to `Employer_Name` (or `Employer_Number` if
   names collide — not yet checked), `Tools → Link Dimensions` against
   `AM_EMPLOYER_ENROLLMENT_YOY`, same as done for the Table+Export
   Table earlier. No selection = needs-attention list; one employer
   selected = single row, both years side by side.

**Resolved 2026-09-14:** whether `EMPRNO` is genuinely one-row-per-
employer on `ZVHCM_AE_1_26Q` — **confirmed effectively yes** (only one
employer out of the whole object has >1 row, and it's a genuine
never-finalized-draft case, not a data-quality issue). See "`ACTDATE`
dedup — verified against live data" above and BR-3 in the
`2026-employer-annual-elections.md` catalogue entry.

**Still flagged, unconfirmed:**
- `ZVHCM_AE_1_26Q`'s HSA/`EECOUNT` numeric field types were never
  independently verified (only its catalogue entry's field-name match
  was) — may need `CAST(...)` once this is actually deployed, same as
  `HSA_One_Time_Single/Family` needed in Gold originally.
- `AM_EMPLOYER_ENROLLMENT_YOY` (or whatever this model gets named), the
  native Table, and the Input Control itself are all **not yet built**
  — this whole section is a handoff spec, same caveat as the original
  Datasphere View Spec at the top of this doc. Design is confirmed and
  the SQL is now verified against live data; execution isn't started.

**Not yet started:** cataloguing `GLD_AE_Employer_Enrollment_YoY` and
its Analytic Model once built — add to the "Last step" list above.

## Timeline replaced with a heatmap grid — done 2026-09-14

Picked up while the status-vocabulary question sits with Yong — purely
presentational, no dependency on that answer. Blair liked this idea
earlier ("a visual grid may be helpful instead of bar chart"); built
and verified against mock data on both widgets that still render a
Timeline (Operational and the original AE Snap Report — Executive
never got one, see "Dashboard split" above).

**Design:** one `.grid-cell` div per day (was one SVG `<rect>` bar),
background color on a 5-level intensity scale (0/≤25%/≤50%/≤75%/>75%
of the window's max, same idea as a GitHub contribution graph), count
and date still printed on the cell so no information is lost versus
the bars — just read faster as a grid. Peak day keeps a highlighted
outline (was a green-filled bar). `_renderTimeline()` rewritten to
build this HTML directly rather than SVG; same call site
(`root.getElementById("timelineChart")`), so nothing else in either
widget needed to change. Operational got the change first, then
copied verbatim into the original widget — identical implementation on
both, per the established design-system-reuse pattern.

**Verified in the Browser pane against mock data, both widgets:** 14
cells rendered (matching the 14-day mock window), color levels
matched each day's relative count correctly, peak day correctly
identified the true max (`10/14: 41`) rather than a visually-larger-
looking but non-max bar, no console errors, no regressions to any
other panel. Pushed:
- `sac-ae-operational-widget` v1.0.3
  (`sha384-h583KYHkIDsrj5U8ckOZYeoDZVYrZi2Tcn4UPRljt1so3DAg2nGa/p8QlH+DKafD`)
- `sac-ae-snap-report-widget` v1.0.14
  (`sha384-f2JJ4sgwyLykgOtpyrRmIfiNi9VvmujfMQvuZQySpWCbczK0lGGt/J5l5TizLH1N`)

**Not done:** re-registering the widget definition in SAC's Custom
Widgets list (delete-and-recreate, per the confirmed refresh
limitation above) — needed before either Story actually shows this
change.

## Timeline — YoY comparison (2026 vs 2027), started 2026-09-14

Blair spotted a `900` on today's date in the live Timeline (every other
day was single digits) while looking at real data — flagged as a
likely bug, separate from this work (needs `SELECT * FROM
"GLD_AE_Employer_Enrollment" WHERE CAST("Completed_Date" AS DATE) =
CURRENT_DATE` to investigate; not yet looked into). While discussing
it, the real ask surfaced: show each day of the election window
(10/1–10/14) with **how many completed on that calendar day last year
(2026) next to how many are completing on that day this year (2027)**
— a genuine two-series YoY comparison, not a single-series grid.
**Scoped to the Snap Report widget specifically** (Blair's own
wording, twice) — Operational's Timeline is untouched for now; ask
before propagating this there too.

**New 12th cube block — `DS_EMPLOYER_ENROLLMENT_SUMMARY`.** Groups
`ZVHCM_AE_1_26Q` by `ACTDATE`, same dedup pattern as the YoY view
(`ROW_NUMBER() OVER (PARTITION BY EMPRNO ORDER BY ACTDATE DESC)`),
excluding the `"00000000"` null-date sentinel. Requires changing the
*existing* `Completed_Date`/Timeline block's `Enrollment_Year` from
`NULL` to `2027` (safe — nothing currently reads that column on
Timeline rows) so the two years can be told apart once both populate
`Date`. `TO_DATE("ACTDATE", 'YYYYMMDD')` is **untested against this
Datasphere instance** — test in a throwaway view first; fallback if it
fails: `CAST(SUBSTR("ACTDATE",1,4) || '-' || SUBSTR("ACTDATE",5,2) ||
'-' || SUBSTR("ACTDATE",7,2) AS DATE)`.

```sql
UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))  AS "Synod_Region",
    CAST('' AS NVARCHAR(50))  AS "Enrollment_Status",
    CAST('' AS NVARCHAR(50))  AS "Election_Category",
    CAST(TO_DATE(z."ACTDATE", 'YYYYMMDD') AS TIMESTAMP) AS "Date",
    2026                      AS "Enrollment_Year",
    COUNT(*)                  AS "EmployerCount",
    CAST(NULL AS DECIMAL)     AS "EmployeeCount"
FROM (
    SELECT "ACTDATE"
    FROM (
        SELECT "EMPRNO", "ACTDATE",
            ROW_NUMBER() OVER (PARTITION BY "EMPRNO" ORDER BY "ACTDATE" DESC) AS "rn"
        FROM "ZVHCM_AE_1_26Q"
    ) ranked
    WHERE "rn" = 1 AND "ACTDATE" != '00000000'
) z
GROUP BY TO_DATE(z."ACTDATE", 'YYYYMMDD')
```

**Status: written, not yet deployed.**

**Rendering decision:** Blair wants a **grouped bar chart** (2026 bar +
2027 bar side by side per day), not the heatmap grid — a direct
comparison reads better as two bars than as a single-series intensity
grid. This replaces the heatmap grid *on the Timeline specifically* for
the Snap Report widget only; the heatmap-grid work above stays as-is
everywhere else (Operational's Timeline, and every other panel on both
widgets). Chart needs to align the two years by **calendar month/day
only, year stripped** (2026-10-01 and 2027-10-01 both bucket under
"10/1") since the two years' absolute dates don't match.

**Built and verified in the Browser pane, 2026-09-14.** `main.js`
changes:
- `_parseEmployerStatus()`: `byDate` (single-year) replaced with
  `byDateYear`, keyed by `"MM-DD"` (via new `_monthDayKey()` helper)
  then `"2026"`/`"2027"`. Defaults to `"2027"` if `Enrollment_Year`
  ever arrives blank (safety net for an older, un-redeployed cube).
- Returned `daily` array now `{ mmdd, y2026, y2027 }` per day, sorted
  chronologically (zero-padded `MM-DD` sorts correctly as plain
  strings).
- `_renderTimeline()` rewritten again — HTML/CSS grouped bars (two
  `.tl-bar` divs per day, heights proportional to the shared max across
  both years) instead of the heatmap grid, with a 2-color legend
  (`--info` = 2026, `--accent` = 2027).
- Mock data extended: existing 14 rows tagged `Year = "2027"` (were
  blank), plus 14 new 2026-side mock rows using the prior calendar year
  (`2025-10-xx`, matching the real `ACTDATE` evidence that a given plan
  year's election window falls in the *previous* calendar year's
  October).

Verified: 14 day-groups rendered, values matched mock data exactly
(`10/1: 2026=9, 2027=14`), bar heights proportional, title/legend
correct, no console errors, no regressions to any other panel. Pushed
`sac-ae-snap-report-widget` v1.0.15
(`sha384-OybSYmuunJGkSrK9SnmsKzK/NfJlVUq5dr4jVaQtarqdHhf+M21tzgFqYZB110s+`).

**SQL deployed and confirmed live, 2026-09-14** — both the new 12th
block and the `Enrollment_Year: NULL → 2027` change to the existing
block saved successfully. `TO_DATE("ACTDATE", 'YYYYMMDD')` worked as
written; the `SUBSTR`-based fallback wasn't needed.

**Not done:**
- Re-registering the widget in SAC's Custom Widgets list (needed
  before the Story shows v1.0.15's grouped-bar Timeline, plus this
  cube change).
- A decision on whether Operational's Timeline should get this same
  YoY treatment (not asked yet).

## Two live data-quality issues found, both outstanding — 2026-09-14

Found while investigating the Timeline, not resolved — flagged here
rather than guessed at or silently worked around in SQL. Both likely
point at the same underlying pipeline problem; escalate to Ahmed
Sheikh (confirmed owner of `vEmployerSaves`) once confirmed, possibly
bundled with the existing status-vocabulary question list.

**Issue 1 — 900 "completions" all stamped the exact same second.**
`SELECT * FROM "GLD_AE_Employer_Enrollment" WHERE "Enrollment_Status" =
'Success' AND CAST("Completed_Date" AS DATE) = CURRENT_DATE` returns
900 rows, confirmed via `COUNT(*)`/`COUNT(DISTINCT "Employer_Number")`
both `= 900` (not a Gold-level duplication issue). But cross-checking
`vEmployerSaves` directly: these 900 rows have `CreatedDate` values
spread across several days (e.g. `Sep 10, 2026` in small batches), yet
`SubmittedOn` **and** `AttemptedOn` are identically
`Sep 14, 2026, 18:26:42` — to the second — across every one of them.
No independent group of real employers submits at the literal same
second; this looks like a batch job bulk-marking pre-existing
`Created`-only records as `'S'` with `NOW()`, all at once. Also
suspicious on business-timing grounds alone: today is 2+ weeks before
the 10/1 election window even opens, so 900 genuine completions today
isn't plausible either way. **Not confirmed** whether this reflects a
test/sandbox data-refresh process (expected noise) or a genuine
production bug — depends on whether this Datasphere space points at
real or synthetic data, which isn't visible from here.

**Issue 2 — every KPI tile inflated by roughly 3x versus the source
system, RESOLVED 2026-09-14 — root cause was a widget bug, not a data
problem.** Blair reported `Total Set Up 14,884` / `Completed 1,834` /
`Non-Completed 8,068` on live data, all ~3x too high.

**First theory (Gold-level duplicate `RequestId`s per employer) —
tested and disproven.** `SELECT "Employer_Number", COUNT(*) ... GROUP
BY "Employer_Number" HAVING COUNT(*) > 1` found only **17 employers**
with more than one row (max 7) — nowhere near enough to explain a
uniform 3x inflation across ~14,884 rows.

**Second theory (orphan/synthetic employer numbers with no
`vDimEmployer` match) — also tested and disproven, but revealed the
real answer.** `SELECT CASE WHEN "Employer_Name" IS NULL THEN 'No
Match...' ELSE 'Matched' END, COUNT(*) ... FROM
"GLD_AE_Employer_Enrollment" GROUP BY ...` returned **4,948 matched +
3 unmatched = 4,951 total rows** — meaning **Gold's own row count is
correct** (~4,951, a sane source-system-sized number), not 14,884 at
all. The inflation was never in the data.

**Root cause, found by re-reading this widget's own
`_parseEmployerStatus()`:** this widget was never updated when the
Operational-only row-kinds (Multiple Attempts, Stalled buckets,
Recently Completed, Status × Eligible Band) were added to the
**shared** cube on 2026-09-13/14. Since all three widgets bind to the
same `AM_EMPLOYER_ENROLLMENT_SUMMARY` model, those rows arrive in this
widget's data too — and with no guard to recognize and skip them, they
fell through into the generic "plain status" branch and got counted
*again* into `totalSetUp`/`completed`/`open`, on top of the correct
Status/Synod block. Roughly 3 overlapping "full populations" (the
real Status/Synod block, the Status × Band block covering the same
employers grouped differently, plus whatever the Multiple-Attempts/
Stalled contribution added) explains the ~3x multiplier cleanly.

**Fix, simplified after first pass:** first attempt named each
row-kind explicitly (`Multiple Attempts`, `Recently Completed`,
`Stalled *`, the Status × Band combination). Simplified to a single
blanket `if (subType) return;` right before the generic fallthrough —
this widget doesn't render *any* subType-carrying row-kind, so one
catch-all covers every current one and any future one added for
another widget this one is never told about, matching the defensive
pattern Operational's own parser already uses for the same reason.
Added 9 new mock rows covering all 4 contaminating row-kinds as a
permanent regression test: `totalSetUp` must stay at the 143 baseline
from the existing mock rows even with these present. **Verified in the
Browser pane: `Total Set Up` = 143 (exact baseline), HSA/YoY panels
unaffected, no console errors.** Pushed `sac-ae-snap-report-widget`
v1.0.16
(`sha384-Bux96FRvdWPDbc8WITVxbx6MiFFhIA2r26aLimAUi+k9XozQDahI2QfznthS75Ga`).

**Not an Ahmed/pipeline issue after all** — no escalation needed for
this one.

**CLOSED — confirmed fixed on live data, 2026-09-14.** Widget
re-registered on v1.0.16, Dimensions/Measures rebound
(`Enrollment_Status`/`Synod_Region`/`Election_Category`/`Date`/
`Enrollment_Year`; `EmployerCount`/`EmployeeCount`). Blair confirmed
the Employer Selection tiles now show correct numbers. Issue 1 (the
900 identically-timestamped "completions") remains open separately —
see above.

## Timeline — day-by-day table + cumulative pace tracker, done 2026-09-15

Blair shared a spreadsheet mockup: a day-by-day table (`Count Completed
2027` / `% Completed 2027` / `% Completed 2026`, one row per `AE Day N`)
led by a "Cumulative Tally Tracker" summary — running totals for both
years plus an **On Track / Watch / Act** status comparing this year's
cumulative pace to last year's at the same point. Replaces the grouped
bar chart entirely (same widget, same `#timelineChart` container).

**Design decisions made, not all externally confirmed:**
- **Day-by-day % is per-day, not cumulative** — each day's own count as
  a % of that year's own total population, matching the mockup exactly
  (e.g. Day 5: 2000/40% and Day 3: 200/4% are independent figures
  against a fixed denominator, not running sums). The **cumulative**
  running total only appears in the tracker card above the table.
- **2026's total population** — no existing cube measure for "total
  2026 employers" existed, so this reuses data already available:
  summing `byHealthPlan["2026"]` (the Bucket row-kind, same data the
  YoY panel above already uses) gives the full 2026 population without
  needing new SQL. **2027's total** is `status.totalSetUp`, already
  computed.
- **On Track / Watch / Act thresholds — inferred from Blair's mockup
  examples, not confirmed as an actual business rule:** 40% vs 35% =
  On Track, 40% vs 42% = Watch, 40% vs 50% = Act. Implemented as
  `delta = pct2027 - pct2026`: `delta >= 0` → On Track (green),
  `-5% <= delta < 0%` → Watch (amber), `delta < -5%` → Act (red). Easy
  to retune (`_paceStatus()`) if the real thresholds should differ —
  flag this to Blair if it comes up.

**Built and verified in the Browser pane, 2026-09-15.** Also had to
rescale the mock Timeline data — the old bar-chart-era mock values
(designed only to look varied as bars) summed to far more than the
mock's own total population, so the new cumulative % showed over 100%.
Rescaled both years' daily mock values down to sums that stay under
their respective totals (2027: 101 of 143 = 71%; 2026: 70 of 101 =
70%), landing on a realistic "On Track" demo state. Verified: 14 rows,
correct per-day and cumulative percentages, `On Track` status renders
with the right color, no console errors, no regressions to the KPI
tiles or HSA panel. Pushed `sac-ae-snap-report-widget` v1.0.17
(`sha384-N6FmQiua2md936q//lE50W1ps9l9NapPvlHTsdJ8Ozu9mt7lCjVJ0FkcNf1mfWjS`).

**Not done:** re-registering the widget in SAC to pick up v1.0.17 on
live data, and confirming the day-by-day table and pace status look
right against real numbers — worth double-checking the On Track/Watch/
Act thresholds specifically once real data is behind it, since those
were inferred from a mockup, not confirmed.

## v1.0.17 failed to load in SAC; emergency-rolled-back, then re-deployed clean — 2026-09-15

**v1.0.17 failed to load in SAC** — generic "couldn't load the custom
widget" error, fresh Correlation ID even after hard refresh and
delete-recreate. **Every external check on the file passed cleanly**
(SRI hash match, zero console errors executing it directly in a
browser, correct render, correct CORS/content-type headers) — and
another widget on the same tenant loaded fine at the same time, ruling
out a SAC-wide outage. Root cause not confirmed; most likely a SAC-side
caching issue (possibly compounding the already-known "Custom Widgets
registry doesn't reliably re-fetch a changed manifest" behavior — see
"SAC Custom Widget registration" above), not a defect in the v1.0.17
code itself.

**With a presentation under an hour away, emergency-rolled-back**:
restored the exact v1.0.16 `main.js`/`widget.json` (bar-chart Timeline)
byte-for-byte, republished under a new version number, **v1.0.18**
(same hash as v1.0.16:
`sha384-Bux96FRvdWPDbc8WITVxbx6MiFFhIA2r26aLimAUi+k9XozQDahI2QfznthS75Ga`),
specifically so SAC couldn't confuse the registration with whatever
state v1.0.17 got stuck in. **Confirmed working** — Blair re-registered,
tiles showed correct numbers.

**Re-attempted once time pressure was off**: republished the identical
v1.0.17 content (day-by-day table + cumulative tracker) under yet
another fresh version number, **v1.0.19** (same hash as v1.0.17), after
a full propagation wait and a from-scratch browser verification (fresh
tab, zero console errors, correct render) before Blair touched SAC at
all. **Confirmed working this time** — Blair re-registered, tiles and
the new Timeline both render correctly on live data.

**Current live state:** `sac-ae-snap-report-widget` v1.0.19, day-by-day
table + cumulative pace tracker Timeline, confirmed working on real
data. v1.0.18 (bar-chart fallback) stays available in git history
(commit `92771e2`) in case this ever needs rolling back again.

**Still not done:** confirming the On Track/Watch/Act thresholds look
right against real pace numbers (not yet checked — the mockup-inferred
thresholds were never validated against a real employer population's
actual pace).
