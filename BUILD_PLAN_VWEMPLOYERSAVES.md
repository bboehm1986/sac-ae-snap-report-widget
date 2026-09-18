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

Screenshot reference (former report, not yet in Datasphere): a cross-tab
by health-plan bundle x status (`Open`/`Completed EL`/`Completed OTP`/
`Default`/`Default Override`), totals `Open: 1`, `Completed EL: 4,254`,
`Completed OTP: 6`, `Default: 655`, `Default Override: 1` — likely a
full/closed historical cycle used as a reference for what this vocabulary
looks like at scale, not current live 2027 numbers.

**Blocking questions answered — 2026-09-17.** Blair confirmed both:
the source is neither `ResultCode` nor a different HCM CDS view — it's
derived from **`ProcessedBy` and `SubmittedOn` on `BRZ_vwEmployerSaves`**
(a Bronze-layer view, not `vEmployerSaves` itself — presumably the
un-deduplicated raw layer feeding into it, since the `Default Override`
rule below needs to see multiple submission events per employer over
time, not just the single latest attempt Gold's own `ROW_NUMBER()`
dedup collapses down to). Exact derivation logic:

| Status | Rule |
|---|---|
| `Open` | Not complete — no submission yet. |
| `Completed EL` (Employer­Link) | A submission exists; `ProcessedBy` does **not** contain `@porticobenefits.org` — the employer's own contact submitted it directly (self-service). |
| `Completed OTP` | A submission exists; `ProcessedBy` **does** contain `@porticobenefits.org` — Portico staff processed it (this "OTP" is unrelated to the HSA "One Time" fields elsewhere in this project — a naming coincidence, not the same concept). |
| `Default` | `ProcessedBy` is `NULL` — nobody processed it, it defaulted automatically. |
| `Default Override` | `ProcessedBy` was `NULL` (defaulted), **then** a later `SubmittedOn` row exists whose `ProcessedBy` does contain `@porticobenefits.org` — Portico staff went back and manually overrode a default after the fact. |

**Not yet resolved — open before any SQL gets written:**
1. Does this session have visibility into `BRZ_vwEmployerSaves` (same
   Datasphere space as `vEmployerSaves`, or a different one)? What's
   its exact grain and column list — does it carry `EmployerNumber`/
   `RequestId`/`ProcessedBy`/`SubmittedOn`/`ResultCode`, and is it
   genuinely un-deduplicated (multiple rows per employer, one per
   submission event)?
2. `Default Override`'s rule needs a **sequential/temporal** comparison
   per employer (was there a `NULL`-`ProcessedBy` event, then a later
   one with a Portico address) — this is a materially different query
   shape than everything else in Gold so far (which all collapse to one
   row per employer via `ROW_NUMBER()`). Needs its own window-function
   logic (e.g. `LAG`/`LEAD` or a self-join ordered by `SubmittedOn`),
   not a simple `CASE` on the latest row alone.
3. **Product decision, not a technical one:** should this become a
   **new, additional column** (e.g. `Employer_Status_Detail`) sitting
   alongside the existing `Enrollment_Status` — lower risk, since
   `Enrollment_Status` is already deeply embedded across every widget,
   the aggregate cube, and the Drill-Down widget — or should it
   **replace** `Enrollment_Status` everywhere? Recommend the additive
   approach unless there's a specific reason the `ResultCode`-derived
   version is actually wrong/misleading today.

**Resolved — 2026-09-17, decided by Blair: additive new column
`Election_Status`, not a replacement.** Confirmed all four detail
statuses only ever apply when `ResultCode = 'S'` — `Enrollment_Status`
stays completely untouched, so nothing downstream (widgets, the
aggregate cube, Drill-Down) needs to change. Final derivation, added to
`GLD_AE_Employer_Enrollment`'s SQL in the "Merge... into Gold" section
below:

```sql
CASE
    WHEN COALESCE(a."ResultCode", '') != 'S' THEN 'Open'
    WHEN a."ProcessedBy" IS NULL THEN 'Default'
    WHEN UPPER(a."ProcessedBy") LIKE '%@PORTICOBENEFITS.ORG%'
         AND defaulted."First_Default_Submitted_On" IS NOT NULL
         AND defaulted."First_Default_Submitted_On" < a."SubmittedOn"
    THEN 'Default Override'
    WHEN UPPER(a."ProcessedBy") LIKE '%@PORTICOBENEFITS.ORG%' THEN 'Completed OTP'
    ELSE 'Completed EL'
END AS "Election_Status"
```

`defaulted` is a new join (`vEmployerSaves` grouped by `EmployerNumber`,
`MIN("SubmittedOn")` where `ResultCode = 'S' AND ProcessedBy IS NULL`),
scoped by `EmployerNumber` rather than `RequestId` — confirmed
equivalent in practice, since an employer's re-save attempts share one
`RequestId` (verified below), but written against `EmployerNumber` as
the more literal match to "did this employer ever default, at any
point." Case-insensitive domain match (`UPPER(...)  LIKE`) used
defensively in case `ProcessedBy` casing varies.

**Verified against a known example — EmployerNumber 11903, confirmed by
Blair to be Default Override.** Raw `vEmployerSaves` history (both rows
share `RequestId` 7502):

| ResultCode | ProcessedBy | SubmittedOn | AttemptedOn |
|---|---|---|---|
| S | NULL | 2026-09-16 15:51:05 | 2026-09-16 15:51:05 |
| S | BC-BWatson@porticobenefits.org | 2026-09-16 16:06:25 | 2026-09-16 16:06:25 |

Gold's existing dedup (`ROW_NUMBER() OVER (PARTITION BY "RequestId"
ORDER BY "AttemptedOn" DESC)`) already picks the second row as `a`; the
`defaulted` join finds `15:51:05` as the first NULL-`ProcessedBy`
Success event; `15:51:05 < 16:06:25` → `Default Override`. Matches
expected result exactly.

**Status: deployed and confirmed live — 2026-09-17.** Verified in
`AM_EMPLOYER_ENROLLMENT_DETAIL`'s own preview: all 5 values present
with real aggregated counts, no errors. (One false alarm along the
way: the Story briefly threw "Please contact your administrator" on
this model — turned out to just be an undeployed pending change, not a
data or reference problem; redeploying fixed it, no Story-side rebind
needed this time.)

**Discovery — 2026-09-17: "Completed" and "Defaulted" were never
mutually exclusive.** Once live in the Snap Report widget, the numbers
revealed that `Completed EL + Completed OTP + Default + Default
Override` summed exactly to the old "Completed" tile's total — every
`Default`/`Default Override` employer had been silently counted inside
"Completed" the entire life of this project, while "Defaulted
(running)" always showed 0 (it was driven by `DEFAULTED_STATUSES = []`,
a placeholder with no real value to check against, documented since
project start). **Blair's call: Option A** — redefine the tiles to be
mutually exclusive using `Election_Status`: "Completed" now means
`Completed EL + Completed OTP` only (actively completed by someone);
"Defaulted (running)" now means `Default + Default Override` (closed
automatically, not by action) — finally giving that tile real data
after being a dead placeholder since the project's earliest days.
Shipped in `sac-ae-snap-report-widget` v1.0.25; the dead
`DEFAULTED_STATUSES`/aggregate `completed`/`defaulted`/`pctComplete`
variables were removed from `main.js` (the Synod/Region panel's own
per-region completion rate is untouched — it's a deliberately coarser
"done vs. not done" concept, still keyed on `Enrollment_Status =
Success`, not affected by this redefinition).

**Not yet built — the Contribution Set x Election_Status crosstab**
(matching the legacy report's own summary strip: `Open`/`Completed EL`/
`Completed OTP`/`Default`/`Default Override` as columns, Contribution
Set as rows, employer counts as cells) — this was the whole reason
`Election_Status` was worth sourcing in the first place. **Blair's
call, 2026-09-17: when built, it goes on the Operational widget**, not
the Employer Detail page (where it was originally sketched) — holding
off on building it for now.

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
    a."EmployerNumber" || ' - ' || COALESCE(de."EMPRNAME", '(Unknown Employer)') AS "Employer_Display_Name",
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
            WHEN DAYS_BETWEEN("Last_Attempted_On", CURRENT_DATE) <= 3 THEN 'Stalled 0-3 Days'
            WHEN DAYS_BETWEEN("Last_Attempted_On", CURRENT_DATE) <= 7 THEN 'Stalled 4-7 Days'
            ELSE 'Stalled 8+ Days'
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

## Timeline fixed to the real 10/1-10/14 AE window — 2026-09-15

Blair asked why the Timeline table wasn't fixed to Annual Enrollment's
actual window (10/1 through 10/14, confirmed) — good catch: it had
been purely data-driven (whatever dates showed up in `daily`, in
whatever order), which meant a day with zero completions would
silently vanish from the table instead of showing `0`, and any stray
out-of-window date — like the still-unresolved Issue 1 anomaly
(900 identically-timestamped "completions" from a batch job, dated
weeks before the real window) — would have silently stretched the
table instead of being excluded.

**Fix:** `_parseEmployerStatus()` now tracks raw dates keyed by plan-
year tag then full `"YYYY-MM-DD"` (`rawDatesByYear`, was `byDateYear`
keyed straight by `"MM-DD"`). New `_fixedWindowCounts()` builds a
dense, zero-filled `10/1`-`10/14` map per plan year: `_anchorYear()`
picks whichever real calendar year occurs most often among that year's
actual dated rows (not hardcoded — this project's own convention
already established a given plan year's Oct window can fall in any
real calendar year), then the 14-day window is built against that
year specifically, with anything outside it dropped. New static
`AE_WINDOW_MONTH`/`AE_WINDOW_START_DAY`/`AE_WINDOW_LENGTH_DAYS` on the
class make the window itself a named, easy-to-find constant rather
than a buried literal.

**Verified in the Browser pane, 2026-09-15** — two checks:
1. Existing mock data still produces the identical result as before
   (101/71%/70%/On Track, 14 rows) — the fix is a no-op for
   well-behaved data.
2. **Stress test**, injected via `onCustomWidgetAfterUpdate` with a
   synthetic dataset: 13 real Oct days plus one deliberately-skipped
   day (`10/07`) plus one stray `9/14` row carrying `900` (mimicking
   Issue 1 exactly). Result: table stayed exactly 14 rows, `AE Day 7`
   correctly showed `0` instead of disappearing, and the `900`-count
   anomaly was fully excluded from every total (`Count Completed 2027`
   summed to `39`, i.e. 13 real days × 3 — not `939`).

Pushed `sac-ae-snap-report-widget` v1.0.20
(`sha384-qwMPtbj3ITRDgQlunFWOcoK3VXTFxcIeB3rE9SBYk6EI0InHkZRxd9L8EFHC4jgq`).

**Not yet done:** re-registering the widget in SAC to pick up v1.0.20
on live data. Worth specifically checking whether the still-open Issue
1 anomaly (dated outside the 10/1-10/14 window) is now correctly
excluded from the live Timeline, as one more confirmation this fix
works against the real data it was built to guard against.

## Header cleanup: real "As of" date, dropped redundant tile — 2026-09-16

Two small fixes, per Blair, looking at live data:
1. **"As of" was showing the literal word `"Live"`** — whatever the
   Story's `asOfLabel` property happened to be manually set to, not an
   actual date. Now computed by the widget itself from the viewer's own
   clock (`new Date().toLocaleDateString(...)`, no arguments — this is
   safe, unlike the date-*string*-parsing risk documented elsewhere in
   this file for Timeline labels, which is a different operation
   entirely) — always shows the real current date, e.g. "As of:
   September 15, 2026". The `asOfLabel` property is no longer read;
   still declared in `widget.json` for manifest compatibility, same
   deprecation pattern as `dailyCounts`/`yoyComparison`.
2. **Removed the "% Complete" tile** — redundant with `Completed`'s own
   "X% of total" subtext. Employer Selection is now 4 tiles (Total Set
   Up, Completed, Non-Completed, Defaulted (running)), not 5.

Verified in the Browser pane: `asof` element shows today's real date,
tiles row down to 4, no console errors. Pushed
`sac-ae-snap-report-widget` v1.0.21
(`sha384-3W6VXr/qgn058epFQeeKetXJfmpVOTLb5ZWcr8+Bungeidlu6JJLbyxC6NniNVj4`).

**Not yet done:** re-registering the widget in SAC to pick up v1.0.21.

**v1.0.21 failed to load in SAC, 2026-09-16** — identical symptom to
the v1.0.17 incident above: generic "couldn't load the custom widget"
error, fresh Correlation ID. Same diagnostic re-run, same result: hash
match, correct CORS/content-type headers, zero console errors
executing it fresh in a browser. **This is now the second confirmed
occurrence of this SAC-side flakiness** — worth treating as a known,
recurring quirk of this widget's registration process going forward
(not necessarily a one-off), rather than re-investigating from
scratch each time. Same proven fix applied: identical content
republished under a fresh version number, **v1.0.22** (same hash as
v1.0.21:
`sha384-3W6VXr/qgn058epFQeeKetXJfmpVOTLb5ZWcr8+Bungeidlu6JJLbyxC6NniNVj4`).

## Stalled Time buckets rescaled to fit the real 14-day window — 2026-09-16

Blair, looking at the live Operational dashboard: the original
`0-7 / 8-14 / 15+` scheme barely differentiates anything inside the
real ~14-day AE window (10/1-10/14, confirmed) — `15+` is nearly
unreachable within a window that short, so almost everything not yet
completed piles into `0-7`. **Rescaled to `0-3 / 4-7 / 8+` Days**
(confirmed by Blair) — the existing "Stalled buckets" cube block
(`DS_EMPLOYER_ENROLLMENT_SUMMARY`, block 10) updated in place, same
`DAYS_BETWEEN("Last_Attempted_On", CURRENT_DATE)` logic, just new
threshold values and bucket labels. `sac-ae-operational-widget/main.js`
updated to match — `STALLED_BUCKET_ORDER` and the mock rows both
renamed from `Stalled 0-7/8-14/15+ Days` to `Stalled 0-3/4-7/8+ Days`.
Display rendering (`.replace("Stalled ", "")`) needed no change — it
already works off whatever label the bucket carries.

**Status: main.js changes made, cube SQL written, not yet deployed.**

## Operational's Timeline ported to the same redesign — 2026-09-16

Blair: apply the same Timeline redesign Snap Report just got (day-by-
day table + Cumulative Tally Tracker) to Operational too. Confirmed
`sac-ae-operational-widget` should get the identical treatment, not
just a heatmap-grid touch-up — see the three-question check-in this
same day (window length confirmed still 14 days; Timeline treatment
confirmed full port; Stalled buckets confirmed `0-3/4-7/8+`).

**This also fixed a real latent bug.** Operational's Timeline
previously had *no year separation at all* — it never read
`Enrollment_Year` on Timeline rows, just bucketed every date string it
saw into one flat series. Once the shared cube grew a 2026-tagged
Timeline block for Snap Report's YoY comparison, Operational would
have started silently mixing both plan years' dates into what looked
like one continuous series (28 entries instead of 14, no indication
two different years were blended together) — this was never actually
exercised against live 2026 data before now, so it hadn't surfaced yet.

**Ported verbatim from `sac-ae-snap-report-widget`:** the fixed
`AE_WINDOW_MONTH`/`START_DAY`/`LENGTH_DAYS` constants,
`_anchorYear()`/`_fixedWindowCounts()`, `_paceStatus()`, and the full
`_renderTimeline()` rewrite. Parser reworked the same way — `byDate`
(no year key at all, worse than Snap Report's pre-fix `byDateYear`)
replaced with `rawDatesByYear`.

**One bug found and fixed during this port, specific to this
widget:** `_parseEmployerStatus()`'s returned object only ever exposed
`byElectionType: byHealthPlan["2027"] || {}` — the raw `byHealthPlan`
object itself was never returned, since this widget never needed it
directly before (Election Type panel only ever wanted the 2027 slice).
The new Timeline code's 2026 total-population denominator needs the
raw object. Fixed by adding `byHealthPlan` alongside `byElectionType`
in the return. First browser check threw `Cannot read properties of
undefined (reading '2026')` at this exact spot before the fix — caught
immediately by console-checking, not left for live data to surface.

Mock data extended to match: 4 new 2026-side health-plan-bucket rows
(`35/29/28/9`, mirroring Snap Report's mock exactly) and the Timeline
mock rows rescaled and split into matching 2027/2026 series (same
values as Snap Report's mock, since this widget's base Status/Synod
mock rows already summed to the identical 143 total).

**Verified in the Browser pane, including a stale-console false alarm
worth noting:** a genuinely fresh tab confirmed zero console errors and
correct data (`101` / `71%` / `70%` / `On Track`, 14 rows, Election
Type panel still correctly isolated to 2027 only) — an *earlier* tab
kept showing the pre-fix error message on every reload even after the
fix landed, which turned out to be stale console history carried over
within that tab rather than a live recurrence; a fresh tab settled it.
Pushed `sac-ae-operational-widget` v1.0.4
(`sha384-YNCVb4/t2HEzwayWKLR4F0/0MMtBunQI5ZQ76sIACy3PB86yAJMZCmUt74c8xFg1`).

**Not yet done:** deploying the rescaled Stalled Time bucket SQL (see
section above — same cube redeploy covers both changes), and
re-registering `sac-ae-operational-widget` in SAC to pick up v1.0.4.

## Operational's "As of" fixed too, with date AND time — 2026-09-16

Same fix as Snap Report's (see "Header cleanup" above), ported to
`sac-ae-operational-widget` — "As of" was showing the literal word
`"Live"` instead of an actual timestamp. **Difference from Snap
Report's version: shows date *and* time here**, not date-only — per
Blair, since this is the working-team/operational dashboard, checked
throughout the day rather than once. `new Date().toLocaleString(...)`,
computed by the widget itself; `asOfLabel` property no longer read.

Verified in the Browser pane (fresh tab): `As of: September 15, 2026
at 2:28 PM`, no console errors. Pushed `sac-ae-operational-widget`
v1.0.5
(`sha384-VE0+Ooa6jIwh7V4TvYaQLJPoe2P28XfyCZLxlr9fCVuTIKnG42U00BLHqvc3Gwjc`).

**Not yet done:** re-registering the widget in SAC to pick up v1.0.5
(can be done in the same delete-recreate pass as v1.0.4, if that
hasn't happened yet).

## New Gold column: `Employer_Display_Name` — 2026-09-16

Blair: build a concatenated `Employer_Number - Employer_Name` column
in Gold — intended (per the Input Controls conversation this same day)
to eventually disambiguate same-named employers in the Drill-Down
widget's Input Control, though **scoped to Gold only for now** — not
wiring it into `GLD_AE_Employer_Enrollment_YoY` or the Input Control
itself yet, per Blair.

```sql
a."EmployerNumber" || ' - ' || COALESCE(de."EMPRNAME", '(Unknown Employer)') AS "Employer_Display_Name"
```

Added right after `Employer_Name` in `GLD_AE_Employer_Enrollment`'s
SELECT list — full updated Gold SQL is in the "Gold SQL" section above,
this is a live edit to that same authoritative block, not a separate
copy. `COALESCE`-guards the `vDimEmployer` side only (`Employer_Number`
can't be null — it's the partition/join key); the ~3 employers with no
`vDimEmployer` match (see "Business Name mislabeling" investigation
elsewhere in this doc) get `"12345 - (Unknown Employer)"` instead of a
null concatenation.

**Status: deployed and confirmed — 2026-09-15** ("I deployed the gld
data set").

**Not yet done (deliberately deferred, per Blair):**
- Adding a matching `Employer_Display_Name` column to
  `GLD_AE_Employer_Enrollment_YoY` (that view selects specific columns
  from Gold, not `SELECT *`, so this new column won't reach it
  automatically).
- Rebuilding/refreshing `AM_EMPLOYER_ENROLLMENT_YOY` to expose it —
  same caution as every other Analytic Model change on this project:
  check whether it needs a delete-and-recreate to pick up a new source
  column, same as happened when it was first built after the Business
  Name rename.
- Repointing the Drill-Down widget's planned Input Control at this
  field instead of plain `Employer_Name`.
- Watching for the same Business-Name-inheritance quirk this project
  already hit once (`Comment`/`CONTRIBUTIONSET`) — `Employer_Display_
  Name` is a genuinely computed `||` expression (not a bare passthrough
  of a single source column), so per that same investigation's
  findings it should get a fresh Business Name matching this alias
  automatically, the same way `Eligible_Band` did — but verify once
  deployed rather than assume.

## Merge `GLD_AE_Employer_Enrollment_YoY` into Gold — 2026-09-15

Blair: eliminate `GLD_AE_Employer_Enrollment_YoY` as a standalone view
by folding its 2026-side columns and derived fields directly into
`GLD_AE_Employer_Enrollment` (confirmed: "Yes, merge it into Gold").
Same grain (one row per employer), so this is a straight column
addition, not a reshape — unlike the aggregate summary cube, which
cannot absorb this data (grain/column-list mismatch, discussed in
chat).

Full replacement for `GLD_AE_Employer_Enrollment` (supersedes the "Gold
SQL" section above — includes `Employer_Display_Name`, already live,
plus the new 2026-side and Eligible Band columns):

```sql
SELECT
    a."EmployerNumber"     AS "Employer_Number",
    de."EMPRNAME"          AS "Employer_Name",
    a."EmployerNumber" || ' - ' || COALESCE(de."EMPRNAME", '(Unknown Employer)') AS "Employer_Display_Name",
    de."RegionSynodName"   AS "Synod_Region",
    COALESCE(de."AddressLine1", '')      AS "Address_Line_1",
    COALESCE(de."AddressLine2", '')      AS "Address_Line_2",
    COALESCE(de."AddressLine3", '')      AS "Address_Line_3",
    COALESCE(de."City", '')              AS "City",
    COALESCE(de."StateProvinceCode", '') AS "State_Province",
    COALESCE(de."PostalCode", '')        AS "Postal_Code",
    COALESCE(de."CountryName", '')       AS "Country",
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
    CASE
        WHEN COALESCE(a."ResultCode", '') != 'S' THEN 'Open'
        WHEN a."ProcessedBy" IS NULL THEN 'Default'
        WHEN UPPER(a."ProcessedBy") LIKE '%@PORTICOBENEFITS.ORG%'
             AND defaulted."First_Default_Submitted_On" IS NOT NULL
             AND defaulted."First_Default_Submitted_On" < a."SubmittedOn"
        THEN 'Default Override'
        WHEN UPPER(a."ProcessedBy") LIKE '%@PORTICOBENEFITS.ORG%' THEN 'Completed OTP'
        ELSE 'Completed EL'
    END                     AS "Election_Status",
    a."CONTRIBUTIONSET"    AS "Contribution_Set",
    a."CUST_BUND_NAME"     AS "Health_Plan_Bundle",
    a."HSA_HRA_SINGLE"     AS "HSA_Single",
    a."HSA_HRA_FAMILY"     AS "HSA_Family",
    CASE WHEN a."HSAONETIMESINGLE" IS NULL OR TRIM(a."HSAONETIMESINGLE") IN ('', '-') THEN NULL ELSE CAST(a."HSAONETIMESINGLE" AS DECIMAL(18,2)) END AS "HSA_One_Time_Single",
    CASE WHEN a."HSAONETIMEFAMILY" IS NULL OR TRIM(a."HSAONETIMEFAMILY") IN ('', '-') THEN NULL ELSE CAST(a."HSAONETIMEFAMILY" AS DECIMAL(18,2)) END AS "HSA_One_Time_Family",
    a."numberOfEmployees"  AS "Employee_Count",
    a."AttemptedOn"        AS "Last_Attempted_On",
    CASE WHEN a."ResultCode" = 'S' THEN a."SubmittedOn" END AS "Completed_Date",
    CASE WHEN a."ResultCode" = 'A' THEN a."SubmittedOn" END AS "Abandoned_Date",
    eb."EligibleCount"      AS "Eligible_Count_2027",
    COALESCE(
        CASE
            WHEN eb."EligibleCount" >= 20 THEN '20+'
            WHEN eb."EligibleCount" >= 10 THEN '10-19'
            WHEN eb."EligibleCount" >= 3  THEN '3-9'
            WHEN eb."EligibleCount" IS NOT NULL THEN 'Under 3'
            ELSE 'Unknown'
        END, 'Unknown'
    )                        AS "Eligible_Band",
    CASE
        WHEN eb."EligibleCount" >= 20 THEN 1
        WHEN eb."EligibleCount" >= 10 THEN 2
        WHEN eb."EligibleCount" >= 3  THEN 3
        WHEN eb."EligibleCount" IS NOT NULL THEN 4
        ELSE 5
    END                      AS "Band_Sort_Order",
    CASE a."ResultCode"
        WHEN 'N'  THEN 1
        WHEN 'IP' THEN 2
        WHEN 'F'  THEN 3
        WHEN 'E'  THEN 3
        WHEN 'W'  THEN 3
        WHEN 'I'  THEN 3
        WHEN 'A'  THEN 4
        WHEN 'S'  THEN 5
        ELSE 3
    END                      AS "Status_Sort_Order",
    y26."STATUS"             AS "Status_2026",
    y26."CONTRIBUTIONSET"    AS "Contribution_Set_2026",
    CASE WHEN y26."HSA_HRA_SINGLE" IS NULL OR TRIM(y26."HSA_HRA_SINGLE") IN ('', '-') THEN NULL ELSE CAST(y26."HSA_HRA_SINGLE" AS DECIMAL(18,2)) END AS "HSA_Single_2026",
    CASE WHEN y26."HSA_HRA_FAMILY" IS NULL OR TRIM(y26."HSA_HRA_FAMILY") IN ('', '-') THEN NULL ELSE CAST(y26."HSA_HRA_FAMILY" AS DECIMAL(18,2)) END AS "HSA_Family_2026",
    CASE WHEN y26."HSAONETIMESINGLE" IS NULL OR TRIM(y26."HSAONETIMESINGLE") IN ('', '-') THEN NULL ELSE CAST(y26."HSAONETIMESINGLE" AS DECIMAL(18,2)) END AS "HSA_One_Time_Single_2026",
    CASE WHEN y26."HSAONETIMEFAMILY" IS NULL OR TRIM(y26."HSAONETIMEFAMILY") IN ('', '-') THEN NULL ELSE CAST(y26."HSAONETIMEFAMILY" AS DECIMAL(18,2)) END AS "HSA_One_Time_Family_2026",
    CASE WHEN y26."EECOUNT" IS NULL OR TRIM(y26."EECOUNT") IN ('', '-') THEN NULL ELSE CAST(y26."EECOUNT" AS BIGINT) END AS "Employee_Count_2026",
    y26."ACTDATE"            AS "Action_Date_2026"
FROM (
    SELECT
        "EmployerNumber", "RequestId", "ResultCode", "AttemptedOn",
        "CONTRIBUTIONSET", "CUST_BUND_NAME", "HSA_HRA_SINGLE", "HSA_HRA_FAMILY",
        "HSAONETIMESINGLE", "HSAONETIMEFAMILY", "numberOfEmployees", "SubmittedOn",
        "ProcessedBy",
        ROW_NUMBER() OVER (PARTITION BY "RequestId" ORDER BY "AttemptedOn" DESC) AS "rn"
    FROM "vEmployerSaves"
) a
LEFT JOIN "vDimEmployer" de
    ON de."EMPRNO" = a."EmployerNumber"
LEFT JOIN (
    SELECT "EMPRNO", "EligibleCount"
    FROM "vEmployerEligibleCount"
    WHERE "EnrollmentYear" = 2027
) eb ON eb."EMPRNO" = a."EmployerNumber"
LEFT JOIN (
    SELECT "EmployerNumber", MIN("SubmittedOn") AS "First_Default_Submitted_On"
    FROM "vEmployerSaves"
    WHERE "ResultCode" = 'S' AND "ProcessedBy" IS NULL
    GROUP BY "EmployerNumber"
) defaulted ON defaulted."EmployerNumber" = a."EmployerNumber"
LEFT JOIN (
    SELECT *
    FROM (
        SELECT "EMPRNO", "STATUS", "CONTRIBUTIONSET", "HSA_HRA_SINGLE",
            "HSA_HRA_FAMILY", "HSAONETIMESINGLE", "HSAONETIMEFAMILY",
            "EECOUNT", "ACTDATE",
            ROW_NUMBER() OVER (PARTITION BY "EMPRNO" ORDER BY "ACTDATE" DESC) AS "rn"
        FROM "ZVHCM_AE_1_26Q"
    ) ranked
    WHERE "rn" = 1
) y26 ON y26."EMPRNO" = a."EmployerNumber"
WHERE a."rn" = 1
```

Design note: unsuffixed columns (`Enrollment_Status`, `Contribution_Set`,
`Health_Plan_Bundle`, `HSA_Single`, etc.) intentionally NOT duplicated as
`_2027`-suffixed copies since they already unambiguously mean "current
cycle" — only genuinely new 2026-side and Eligible Band columns were
added. `Status_Sort_Order`'s `ELSE -> 3` (not `6` as in the original
standalone YoY view) is a deliberate correction since the original
`ELSE -> 6` branch was dead/unreachable code.

**Status: deployed and confirmed live — 2026-09-17**, then extended
same day with `Address_Line_1/2/3`, `City`, `State_Province`,
`Postal_Code`, `Country` (all from `vDimEmployer`'s newly-added address
columns, joined via the existing `de` alias — no new join needed) for
the Employer Detail roster/download build. See "Debugging saga" section
immediately below for what actually broke between the first deploy
attempt and the working version before this address addition — the SQL
above already reflects both the bug fix (guarded `CASE`/`TRIM`/`IN`
instead of plain `CAST`) and the address columns.
**Status of the address addition: deployed, then patched again same
day** — the address columns initially passed `NULL` straight through
from `vDimEmployer` for employers with no address on file, which
silently dropped those employers' entire row from the Employer Detail
roster Table (a native Cross-Tab/Grid table can suppress a whole fact
row if any Row-axis Attribute is NULL for it — found by noticing one
specific employer, 00001, was invisible in the Table despite showing
correctly in the Drill-Down widget on the same page; removing the
address fields from Rows made it reappear, confirming the cause). Fixed
by wrapping every address column in `COALESCE(..., '')` so a missing
address is an empty string, never NULL — the SQL above already reflects
this. **Confirmed working end to end — 2026-09-17**: no Analytic Model
rebuild was needed for this particular fix, since it changed only
column *values*, not the column list or types (the delete-and-recreate
quirk documented elsewhere in this file is specifically about schema
changes — new columns or Attribute/Measure reclassification — not
value-level edits to an existing column).

**Employer Detail roster Table — done, 2026-09-17.** Native Grid/Cross-
Tab Table on the Employer Detail page, bound to `AM_EMPLOYER_
ENROLLMENT_DETAIL`: Rows = `Employer_Display_Name`, address fields,
`Synod_Region`, `Enrollment_Status`, `Contribution_Set`; Columns ->
Measures = `Employee_Count`, `Eligible_Count_2027`. No fixed filter
(unlike the original Table+Export, which is deliberately locked to
`Enrollment_Status = 'Success'` for a leadership-only download — this
page is meant to browse every employer). Filters via the page's
existing `Employer_Display_Name` Input Control plus new `Synod_Region`
and `Enrollment_Status` Input Controls, all against the same data
source instance (no Link Dimensions needed). CSV export via SAC's
native right-click -> Export -- no custom code needed.

**After deployment — all done:**
- Deleted `GLD_AE_Employer_Enrollment_YoY` and the old
  `AM_EMPLOYER_ENROLLMENT_YOY` (both removed 2026-09-16).
- Re-pointed the Drill-Down widget (`sac-ae-drilldown-widget` v1.0.1) at
  `AM_EMPLOYER_ENROLLMENT_DETAIL` instead — field renames:
  `Status_2027`->`Enrollment_Status`,
  `Contribution_Set_2027`->`Contribution_Set`,
  `Health_Plan_Bundle_2027`->`Health_Plan_Bundle`,
  `HSA_Single_2027`->`HSA_Single`, etc. `_2026`-suffixed and
  `Eligible_Band`/`Band_Sort_Order`/`Status_Sort_Order` fields kept
  their names as-is.
- Widget's Input Control keys on `Employer_Display_Name`, not
  `Employer_Name` — Blair's own call 2026-09-16 (it includes the
  employer number, disambiguating same-named employers). No widget code
  change needed for this; it's a positional binding, the widget doesn't
  care what string lands in dimension slot 1.

## Debugging saga: why the Drill-Down widget showed zero rows — 2026-09-16/17

Long chain of red herrings before finding the real cause, worth keeping
so the next person doesn't repeat the same detours:

1. **`AM_EMPLOYER_ENROLLMENT_DETAIL` didn't pick up new Gold columns
   after the merge** — known quirk, already documented elsewhere in
   this file (delete-and-recreate needed, not just a refresh). Took two
   rounds: first for the new Attributes, then again because the new
   `_2026` numeric columns came through as Attributes instead of
   Measures (had to be flagged as Measures manually on the Gold view
   itself, not in the Analytic Model — Semantic Usage/Measure
   classification lives on the Fact source, the Analytic Model just
   inherits it).
2. **Business Name inheritance** — passthrough columns (even
   CAST-wrapped ones, correcting an earlier assumption that only bare
   passthroughs were affected) inherit their *source* column's business
   name in the Analytic Model, not the Gold alias. `Status_2026` showed
   as `STATUS`, `HSA_Single_2026` as `HSA_HRA_SINGLE`, etc. — cosmetic,
   fixed by manually relabeling, but confusing since some `_2026`
   fields share a business name with their `_2027` counterpart (both
   source from a column called `HSA_HRA_SINGLE`, just in different
   tables).
3. **Drill Limitation (500 rows/60 columns default)** — real, and worth
   fixing (Gold has 915+ employer rows, growing toward 5,000), but
   turned out NOT to be the cause of the zero-row problem. Set to
   Unlimited behavior on any data source instance touching this model.
4. **Stale/orphaned data source reference** — after `AM_EMPLOYER_
   ENROLLMENT_DETAIL` was deleted and recreated multiple times, the
   Story's bound data source instance failed with "Failed to open the
   model" when opened in Data Analyzer — a real, confirmed dead
   reference. Fixed by having SAC sign the user out (unrelated,
   coincidental) and rebuilding the page's widget/bindings from
   scratch, which got a genuinely fresh reference.
5. **The actual root cause**, only found after all of the above: a
   plain SQL runtime error, `invalid number: SQL Error` (HANA exception
   70000339) — every numeric `CAST` in the merged Gold SQL was failing
   for at least one row, which fails the *entire* query (HANA's `CAST`
   throws on bad input rather than returning NULL), so every consumer
   got zero rows back, not just the widget. Root cause: `ZVHCM_AE_1_26Q`
   uses a **literal `-` (hyphen) placeholder** in numeric fields for
   employers with `STATUS = 'Open'` (found by previewing the raw source
   table directly and sorting by each numeric column). Fixed by
   replacing every `CAST(x AS ...)` with
   `CASE WHEN x IS NULL OR TRIM(x) IN ('', '-') THEN NULL ELSE CAST(x AS ...) END`.
6. **`TRY_CAST` and `REGEXP_LIKE` are NOT supported by Datasphere's SQL
   View parser**, even though both are valid HANA SQL — this parser
   validates against a narrower grammar than full HANA. Attempting
   either produced a misleading, seemingly-unrelated syntax error
   ("incorrect syntax near 'THEN'") at a line/column position that did
   not correspond to the actual problem and did not change no matter
   how the surrounding code was edited/retyped — a strong tell that a
   persistent identical error position across genuinely different edits
   means the error is about something structural (an unsupported
   function), not a typo in the visible code. Stick to `CASE`/`IS
   NULL`/`TRIM`/`IN`/`CAST` for this kind of defensive numeric
   conversion in a Datasphere SQL View.

**Possible connection worth checking, not yet confirmed:** the legacy
operational report Blair shared 2026-09-16 has a Status crosstab with
columns `Open` / `Completed EL` / `Completed OTP` / `Default` / `Default
Override` — this is suspiciously close to `Status_2026`'s own vocabulary
above (`STATUS` from `ZVHCM_AE_1_26Q`, e.g. "Completed EL" / "Completed
OTP" already appear in the Drill-Down widget's mock data). If the legacy
report is reading that same underlying HCM status field rather than our
`vEmployerSaves`-derived `Enrollment_Status`, that would answer the
still-open Ahmed/Yong status-vocabulary question directly — worth
confirming before building the Employer Detail page's crosstab strip.

## Reversal: 2026 day-by-day Timeline data is not usable — 2026-09-16

**Blair: `ACTDATE` cannot support genuine day-by-day association for
2026 data.** This retracts the "Timeline — YoY comparison" section
above — the 12th cube block (`ACTDATE`-grouped 2026 Timeline) and the
grouped-bar/day-by-day-table rendering built on top of it. Both
widgets' Timeline sections need to drop the per-day 2026 series
entirely.

**A second, related bug this surfaced, caught before shipping it:**
the Cumulative Tally Tracker's `% Completed 2026` stat was *also*
unsound, for a reason beyond just "no day-by-day" — its numerator
(`cum2026`, summed only from the subset of 2026 rows with a parseable
`ACTDATE`) was being divided by a denominator from a completely
different, date-independent source (the Health Plan Bundle block's
`CONTRIBUTIONSET`-derived total). Given `ACTDATE` is now known to be
unreliable/sparse, that numerator was very likely a severe undercount
— meaning the stat could have been silently making 2026 look far
worse than it actually was. **Decided: remove `% Completed 2026` and
the On Track/Watch/Act status from the tracker entirely** rather than
patch it with a still-unconfirmed substitute — a genuine "2026 total
population" figure (distinct from "2026 completed count") isn't
pinned down without revisiting the still-open status-vocabulary
question with Ahmed/Yong. **Kept:** `Count Completed 2027` / `%
Completed 2027` — both still fully sound (2027's own total, from
`status.totalSetUp`, is unrelated to any of this).

**Scope of the fix, both `sac-ae-snap-report-widget` and
`sac-ae-operational-widget`:**
- Cube: remove the 12th block (`ACTDATE`-based 2026 Timeline) from
  `DS_EMPLOYER_ENROLLMENT_SUMMARY` entirely — full corrected SQL below.
  The existing `Completed_Date`/Timeline block stays tagged
  `Enrollment_Year = 2027` (harmless to leave as-is, no need to revert
  to `NULL`).
- `main.js` (both widgets): parser simplified back to single-series
  date tracking (`rawDates`, not `rawDatesByYear`) — the fixed,
  zero-filled 10/1-10/14 window logic (`_fixedWindowCounts`/
  `_anchorYear`) stays, since that part was never dependent on 2026
  data and is still correct/useful on its own. `daily` is now
  `{ mmdd, count }` per day instead of `{ mmdd, y2026, y2027 }`.
  Defensive guard added: a date row tagged any year other than `2027`
  is skipped outright, in case a not-yet-redeployed cube still emits
  the old 2026 block somewhere mid-rollout.
- Day-by-day table: `Day | Count Completed 2027 | % Completed 2027` —
  `% Completed 2026` column removed.
- Cumulative Tracker: `Count Completed 2027` / `% Completed 2027` only
  — `% Completed 2026` and the status pill removed. `_paceStatus()`
  and the `.cum-status*` CSS removed as dead code.
- Mock data: the `2025-10-xx`/`"2026"`-tagged Timeline rows removed
  from both widgets' mocks (no longer representative of anything the
  real cube will send).

**Corrected cube SQL — 11 blocks, `DS_EMPLOYER_ENROLLMENT_SUMMARY`:**

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
WHERE "Election_Status" IN ('Completed EL', 'Completed OTP') AND "Completed_Date" IS NOT NULL
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
            WHEN "AttemptCount" - 1 = 1 THEN 'Needed 1 Attempt'
            WHEN "AttemptCount" - 1 = 2 THEN 'Needed 2 Attempts'
            WHEN "AttemptCount" - 1 >= 3 THEN 'Needed 3+ Attempts'
        END AS "Bucket"
    FROM (
        SELECT "RequestId", COUNT(*) AS "AttemptCount"
        FROM "vEmployerSaves"
        GROUP BY "RequestId"
        HAVING COUNT(*) > 1
    ) counted
) x2
GROUP BY "Bucket"

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
            WHEN DAYS_BETWEEN("Last_Attempted_On", CURRENT_DATE) <= 3 THEN 'Stalled 0-3 Days'
            WHEN DAYS_BETWEEN("Last_Attempted_On", CURRENT_DATE) <= 7 THEN 'Stalled 4-7 Days'
            ELSE 'Stalled 8+ Days'
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

UNION ALL

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

UNION ALL

SELECT
    "Synod_Region"             AS "Synod_Region",
    CAST('' AS NVARCHAR(50))  AS "Enrollment_Status",
    "Election_Status"         AS "Election_Category",
    CAST(NULL AS TIMESTAMP)   AS "Date",
    NULL                      AS "Enrollment_Year",
    COUNT(*)                  AS "EmployerCount",
    CAST(NULL AS DECIMAL)     AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
GROUP BY "Synod_Region", "Election_Status"

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                AS "Enrollment_Status",
    CAST('HSA Annual YoY' AS NVARCHAR(50))  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                 AS "Date",
    2027                                     AS "Enrollment_Year",
    COUNT(*)                                AS "EmployerCount",
    SUM(COALESCE("HSA_Single", 0) + COALESCE("HSA_Family", 0)) AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND (COALESCE("HSA_Single", 0) > 0 OR COALESCE("HSA_Family", 0) > 0)

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                AS "Enrollment_Status",
    CAST('HSA Annual YoY' AS NVARCHAR(50))  AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                 AS "Date",
    2026                                     AS "Enrollment_Year",
    COUNT(*)                                AS "EmployerCount",
    SUM(COALESCE("HSA_Single_2026", 0) + COALESCE("HSA_Family_2026", 0)) AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE (COALESCE("HSA_Single_2026", 0) > 0 OR COALESCE("HSA_Family_2026", 0) > 0)

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                   AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                   AS "Enrollment_Status",
    CAST('HSA One-Time YoY' AS NVARCHAR(50))   AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                    AS "Date",
    2027                                        AS "Enrollment_Year",
    COUNT(*)                                   AS "EmployerCount",
    SUM(COALESCE("HSA_One_Time_Single", 0) + COALESCE("HSA_One_Time_Family", 0)) AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND (COALESCE("HSA_One_Time_Single", 0) > 0 OR COALESCE("HSA_One_Time_Family", 0) > 0)

UNION ALL

SELECT
    CAST('' AS NVARCHAR(50))                   AS "Synod_Region",
    CAST('' AS NVARCHAR(50))                   AS "Enrollment_Status",
    CAST('HSA One-Time YoY' AS NVARCHAR(50))   AS "Election_Category",
    CAST(NULL AS TIMESTAMP)                    AS "Date",
    2026                                        AS "Enrollment_Year",
    COUNT(*)                                   AS "EmployerCount",
    SUM(COALESCE("HSA_One_Time_Single_2026", 0) + COALESCE("HSA_One_Time_Family_2026", 0)) AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE (COALESCE("HSA_One_Time_Single_2026", 0) > 0 OR COALESCE("HSA_One_Time_Family_2026", 0) > 0)
```

**Status: deployed and confirmed — 2026-09-15.** This removed the 12th
(dead) 2026 Timeline block from the previously-deployed 12-block cube.
`DS_EMPLOYER_ENROLLMENT_SUMMARY` is now an 11-block cube; block 8's
`Enrollment_Year = 2027` tag was left in place (harmless).

**Extended again — 2026-09-18, per Blair, 2 changes:**
1. The `Election_Status` block now also groups by `Synod_Region`
   (previously blank) — feeds both the simple aggregate "By Election
   Status" panel (sums across regions in JS, unaffected by the extra
   rows) and a new "By Election Status & Synod" crosstab on the
   Operational widget.
2. Four new blocks added for the **HSA year-over-year tile**: total
   dollar amount and employer count, split Annual vs. One-Time, each
   compared 2026 vs. 2027. Follows the same `EmployerCount`/
   `EmployeeCount`-repurposing pattern as the existing "Eligible Count"
   block (`EmployeeCount` here carries `SUM($)` instead of its usual
   headcount meaning). `COALESCE(..., 0)` guards every addition
   defensively, in case either side of a `+` is NULL for a given row
   (arithmetic NULL propagation would otherwise silently drop that
   row's real value from the sum, not just exclude it) — same class of
   bug as the `'-'` placeholder issue found earlier this project, just
   preempted this time instead of debugged after the fact. The 2026
   side has no `Enrollment_Status = 'Success'` filter, matching the
   precedent already set by the existing 2026 health-plan-bucket block
   (block 3), which doesn't filter by status either.

**Also new this same day — the "Multiple Attempts" block replaced with
3 buckets** (see the Operational-specific section below for the exact
SQL and the widget-side changes).

**Block 12 added back — 2026-09-17, this time for `Election_Status`**,
not the retired 2026 Timeline data. Same multiplexing pattern as the
Health Plan Bundle / HSA / Stalled-time blocks: `Election_Category`
carries the `Election_Status` value (`Open`/`Completed EL`/`Completed
OTP`/`Default`/`Default Override`), every other dimension blank/NULL.
No new discriminator column needed — the widget distinguishes this
row-kind from the others sharing `Election_Category` by matching
against this closed 5-value vocabulary, same approach already used for
the `"HSA "`-prefix and `"Eligible Count"` row-kinds. Feeds Snap
Report's repurposed "By Election Status" panel (was "Non-Completed —
By Status", scoped to `Enrollment_Status`'s `Open`-bucket values only —
replaced because `Election_Status` only differentiates within
`Enrollment_Status = Success`, so the old "non-completed" scope
wouldn't have shown anything useful from this field). Also intended
later for the Contribution Set x Election_Status crosstab, once that
gets built (Blair's call: on the Operational widget, not Employer
Detail — see the "Merge... into Gold" section above).

**Status: written, not yet deployed.**

## Timeline redesign: line + bar charts, Completions-only — 2026-09-18

Blair, 3-part request: (1) drop "(running)" from the "Defaulted" tile
label on Snap Report (Operational has no such tile, not affected); (2)
replace the Timeline section's day-by-day table with a cumulative line
chart plus a daily-volume bar chart, scoped to genuine completions only
(`Completed EL` + `Completed OTP`, excluding `Default`/`Default
Override`) — clone to both `sac-ae-snap-report-widget` and
`sac-ae-operational-widget`; (3) change the "2026 Annual Enrollment"
eyebrow to "2027 Annual Enrollment" on both widgets.

**Layout decisions confirmed with Blair:** the day-by-day table is
fully replaced (not kept alongside the charts); the "Count Completed
2027 / % Completed 2027" summary numbers stay, with the new line chart
added below them inside the same Cumulative Tally Tracker panel.

**Data source:** block 8 of `DS_EMPLOYER_ENROLLMENT_SUMMARY` (Timeline)
updated above to filter on `Election_Status IN ('Completed EL',
'Completed OTP')` instead of `Enrollment_Status = 'Success'` — no
widget-side filtering needed, the cube already excludes defaults.
Same value-only change class as the earlier `'-'` placeholder fix — no
Analytic Model rebuild expected, same column list.

**Charts are hand-rolled inline SVG**, no charting library — same
dependency-free constraint as everywhere else in this project (CSP-
strict widget iframes). `_svgLineChart`/`_svgBarChart` read the same
`daily` array the old table used, so nothing about the data-parsing
layer changed, only the render layer.

**Status: deployed and confirmed — 2026-09-18.** Snap Report v1.0.26,
Operational v1.0.8 (as of the last change in this section below).

## Second Operational batch, same day — Election_Status/attempts/HSA YoY

Same day, second round, all on Operational unless noted:
- "Not Yet Completed — By Employer Size" → "Completed — By Employer
  Size" (the panel always showed % *completed*, the title said the
  opposite).
- "Non-Completed — By Status" and its Synod crosstab both switched from
  `Enrollment_Status` to `Election_Status`, now covering **all**
  employers instead of scoping to non-completed only — same reasoning
  as Snap Report's identical panel from earlier the same day.
- The single "Needed >1 Attempt" stat replaced with 3 buckets (1 / 2 /
  3+ extra attempts) — new cube block, `vEmployerSaves` grouped by
  `RequestId`, `COUNT(*) - 1` bucketed.
- New **HSA Year-over-Year panel** (Operational) / new rows on the
  existing YoY panel (Snap Report): total $ elected and employer count,
  Annual and One-Time split, 2026 vs. 2027 — 4 new cube blocks, same
  `EmployerCount`/`EmployeeCount`-repurposing pattern as "Eligible
  Count" (`EmployeeCount` carries `SUM($)` here, not a headcount).
- `Election_Status`'s cube block (added earlier the same day) extended
  to also group by `Synod_Region`, needed for the new crosstab.

**Status: deployed and confirmed — 2026-09-18.** Snap Report v1.0.27,
Operational v1.0.8. Cube (`DS_EMPLOYER_ENROLLMENT_SUMMARY`) is now 17
blocks — full SQL handed to Blair to paste in; no Analytic Model
rebuild needed (same value-only change class as before, column list
unchanged).

## Third batch, same day — Drill-Down widget + one Operational rename

Drill-Down widget (`sac-ae-drilldown-widget`), all per Blair:
- Dropped the "Needs attention, by size..." caption above the
  needs-attention list.
- Status (both the list's status column and the comparison card's
  Status row, 2027 side) now reads `Election_Status` instead of
  `Enrollment_Status` — added as a new dimension (`dimensions_12`) to
  this widget's binding, current-cycle only like address.
  `Enrollment_Status` (`dimensions_3`) stays bound, now purely to drive
  the needs-attention sort order (`STATUS_PRIORITY`) — display and sort
  key intentionally decoupled here.
- The `Eligible_Band` pill/text (card and list) replaced with a raw
  **Member Count** — `Employee_Count`, already bound, no new data
  needed. The sort itself still prioritizes by `Eligible_Band` size
  under the hood even though the band is no longer displayed.
- `Contribution Set` row moved to the bottom of the comparison card,
  relabeled "Contribution Set (Configuration)".

Operational: "Stalled Time" panel retitled "Started not Completed" (no
data/logic change, label only).

**Status: deployed and confirmed — 2026-09-18.** Drill-Down v1.0.4,
Operational v1.0.8.

## Cube validation fix + HSA YoY average, same day

The 17-block cube SQL above initially failed Datasphere validation:
`invalid column name: 'x2_1.Bucket'...` — a HANA query-planner quirk
where `COUNT(*)` inside a `CASE` combined with `GROUP BY`/`HAVING` in
the same `SELECT`, under an outer `GROUP BY` on that derived column,
loses track of the column after HANA internally splits the derived
table. Fixed by adding a nesting level in the attempt-bucket block:
materialize `"AttemptCount"` via a plain `GROUP BY`/`HAVING` subquery
first, then apply the `CASE` bucketing to the already-materialized
column with no aggregate at that level. Re-deployed clean; confirmed
via `AM_EMPLOYER_ENROLLMENT_SUMMARY`'s own preview showing real
`HSA Annual YoY`/`HSA One-Time YoY` $ and `Needed 1/2/3+ Attempts`
rows.

Once live, Blair asked to try the HSA YoY "$ Elected" line as an
**average per employer** instead of a sum — no cube change needed,
since the cube block's `EmployerCount`/`EmployeeCount` slots already
carry both the count and the sum in the same row; the widgets now
divide client-side (`amount / count`, guarded against zero) and the
row label reads "Avg $ Elected" to make the change explicit. Applies
to both the Snap Report YoY panel and the Operational HSA YoY panel
(same pattern, both widgets).

**Status: deployed and confirmed — 2026-09-18.** Snap Report v1.0.28,
Operational v1.0.9. No cube or data-binding change for the average
switch — main.js only.

## Timeline: combined chart, same day

Blair asked to combine the Timeline's two stacked charts (cumulative
line, daily-volume bars) into one chart instead of showing them one
above the other. `_svgLineChart`/`_svgBarChart` replaced with a single
`_svgComboChart(daily)`: bars (daily count) render on a left-axis
scale, the line (cumulative) overlays on an independent right-axis
scale — a shared scale would flatten the bars, since cumulative totals
run far higher than any single day's count. Added a small legend
(swatch + label for each series) and axis-max labels on both sides so
the two scales are legible. Same clone-both-widgets pattern as every
other Timeline change. Verified visually in both widgets' local
`preview.html` (mock data) before deploy.

**Status: deployed and confirmed — 2026-09-18.** Snap Report v1.0.29,
Operational v1.0.10.

## Snap Report: split HSA YoY into its own panel, same day

Snap Report's "Year-over-Year Changes" panel had the HSA YoY rows
appended onto the end of the health-plan/eligible-headcount rows in
one long list. Blair asked to split HSA out into its own panel next to
it, matching the Operational widget's layout (which already had HSA
YoY as a separate panel from the start). New `hsaYoyBreakdown` div +
panel added to the Breakdowns grid, label text and row shape copied
verbatim from Operational's version (`${label} — Avg $ Elected` /
`${label} — Employers`). No data/binding change — same `byHsaYoy`
accumulator, just rendered into a second panel instead of appended to
the first. Verified visually in local `preview.html` before deploy.

**Status: deployed and confirmed — 2026-09-18.** Snap Report v1.0.30.
