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

## Timeline panel — corrected 2026-09-10

**Original assumption was wrong.** The widget's `dailyCounts` binding
(`main.js` header comment: `DS_AE_DAILY_COUNTS`, wrapping `ZVHCM_AE_004Q`,
`Member Count`) is member-level — but **employers go through the election
process too**, and the Timeline panel should track *employer* activity by
day, not members. This is a completely separate mistake from the
election-type one above (same root cause: original spec fields getting
assumed correct without re-checking against what's actually needed).

**Checked `main.js`'s actual code, not just the comment** — `dailyCounts`
is more generic than documented: `_parseDailyCounts()`/`_renderTimeline()`
only read `dimensions_0` (date) and `measures_0` (a plain count) and sum
by day. The "State tag" second dimension in the header comment isn't used
anywhere in the logic. So switching this to employer data needs **zero
widget code changes** — just a new data source with that shape, and an
updated header comment (`Employer Count`, not `Member Count`;
`DS_EMPLOYER_ENROLLMENT_DAILY`, not `DS_AE_DAILY_COUNTS`).

**New cube, once `Completed_Date` lands in Gold (see Gold SQL above):**

```sql
SELECT
    "Completed_Date" AS "Date",
    COUNT(*) AS "EmployerCount"
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "Completed_Date" IS NOT NULL
GROUP BY "Completed_Date"
```

Same Fact + Measure + Create Analytic Model treatment as the other cubes
(`AM_EMPLOYER_ENROLLMENT_DAILY`).

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

**Deferred, not blocking anything now:**
- **Access/sensitivity conversation** — same one flagged for Member
  Enrollment's version, needed here too, since Gold carries
  individual-employer-level data.

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
    a."HSAONETIMESINGLE"   AS "HSA_One_Time_Single",
    a."HSAONETIMEFAMILY"   AS "HSA_One_Time_Family",
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

Then the aggregate cube on top — **combined design, see "Election Type
breakdown" section above for the reasoning** (one cube, not two; a third
`Election_Category` column carries the new breakdown, blank for the
original Status/Synod rows):

```sql
SELECT
    "Synod_Region",
    "Enrollment_Status",
    CAST('' AS NVARCHAR(50)) AS "Election_Category",
    COUNT(*)                AS "EmployerCount",
    SUM("Employee_Count")   AS "EmployeeCount"
FROM "GLD_AE_Employer_Enrollment"
GROUP BY "Synod_Region", "Enrollment_Status"

UNION ALL

SELECT CAST('' AS NVARCHAR(50)), CAST('' AS NVARCHAR(50)), "Health_Plan_Bundle", COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success'
GROUP BY "Health_Plan_Bundle"

UNION ALL

SELECT '', '', 'HSA Single', COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_Single" > 0

UNION ALL

SELECT '', '', 'HSA Family', COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_Family" > 0

UNION ALL

SELECT '', '', 'HSA One Time Single', COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_One_Time_Single" > 0

UNION ALL

SELECT '', '', 'HSA One Time Family', COUNT(*), CAST(NULL AS DECIMAL)
FROM "GLD_AE_Employer_Enrollment"
WHERE "Enrollment_Status" = 'Success' AND "HSA_One_Time_Family" > 0
```

**Status: drafted, not yet deployed** — pinned per Blair 2026-09-10,
expect further rework. When resumed: redeploy this SQL into
`DS_EMPLOYER_ENROLLMENT_SUMMARY`, then add `Election_Category` as a new
Attribute on `AM_EMPLOYER_ENROLLMENT_SUMMARY` (only appears once the
underlying view is actually redeployed with the new column — "Show
Inherited Elements" alone doesn't refresh it), then add it to the SAC
Builder panel's Dimensions list after `Enrollment_Status`/`Synod_Region`.

**Important, confirmed 2026-09-04 via a Datasphere engineer:** SAC's
"Model or Dataset" picker only surfaces Datasphere objects that have an
**Analytic Model** built on top — a plain Relational Dataset view never
shows up there, no matter how its SQL is written. This cube needs
Semantic Usage → Fact, `EmployerCount`/`EmployeeCount` marked as Measures,
and an Analytic Model built on top (`AM_EMPLOYER_ENROLLMENT_SUMMARY`) —
already done for the pre-rework version, needs re-validating once this
SQL redeploys.

**`GLD_AE_Employer_Enrollment` stays Relational Dataset, no measures** —
it's row-level Gold, reserved for the Table+Export detail download (see
"Download experience" above), not for direct SAC dashboard binding.

## Last step, once everything above is built: catalogue it

Per `claude.md`'s reuse-first convention, every new Datasphere object
built for this report needs a Notion Data Product Catalogue entry once
the build settles — don't let these sit uncatalogued the way `geog`/
`ertype` sourcing sat unclear for months elsewhere in this catalogue.
New objects from this effort, not yet catalogued:
- `GLD_AE_Employer_Enrollment`
- `DS_EMPLOYER_ENROLLMENT_SUMMARY`
- `AM_EMPLOYER_ENROLLMENT_SUMMARY`
- The Table+Export Table widget, once built

**Worth checking first, not assuming:** `vEmployerSaves` (this doc) vs.
`vwEmployerSaves` (the name already catalogued 2026-09-03 as part of the
AE_EE family) — confirm whether these are the same object under two
names, or genuinely two different views, before cataloguing anything new
under either name.
