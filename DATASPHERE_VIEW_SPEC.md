# Datasphere View Specification — AE Snap Report

**Purpose:** feed the "Traditional Snap Report" SAC custom-widget dashboard
(daily high-level view of Annual Enrollment progress).
**Status:** Draft handoff spec — nothing here is deployed. Written for
whoever has SAP Datasphere Web IDE modeling access (likely Yong Yang, or
Blair Boehm if granted access) to build from.
**Author:** Blair Boehm (via Claude), 2026-08-27.
**Engineer-facing build guide:** https://claude.ai/code/artifact/7b88ebb7-69bf-4904-bae1-b798be51798e
— same content, formatted as a standalone handoff doc (field tables, join
recommendation, build checklist) to send directly to Data Engineering.

This follows the same format as `datasphere_view_spec.md` at the repo root,
scoped specifically to the Snap Report. It does not duplicate work — every
view below wraps an **already-approved SAP HCM CDS view** rather than
reimplementing business logic. See the Data Product Catalogue entries
**AE_Employer Election**, **AE_Member Selections**, **AE_Member Daily Counts**,
and **AE_Member Year over Year** for the full field-level documentation
(business rules, confidence ratings, known gaps) of all four source views —
all four are now catalogued, all four sourced from actual reviewed CDS/AMDP
source code, not inference.

---

## 0. Changes since the first draft, and what to flag for Ahmed

**What changed:** `ZVHCM_AE_004Q` and `ZVHCM_AE_005Q` were flagged "not yet
catalogued" in this doc's first draft — their field names in Section 1 were
placeholders, guessed from a secondhand plain-language description in
`datasphere_view_spec.md`, not verified against actual source. This
revision: both turned out to already be catalogued — independently, by a
separate pass with direct access to the real AMDP/SQLScript source — as
**AE_Member Daily Counts** and **AE_Member Year over Year**. Section 1 is
rewritten with the confirmed fields; it resolves the earlier "two candidate
sources" ambiguity for the timeline, and surfaces two new risks that weren't
visible before (below).

**Flagged for Ahmed** — six items that need a human decision before or
during the build, not just build-order tasks (those are in Section 5):

| # | Issue | Why it matters |
|---|---|---|
| 1 | Daily-counts tile measures **submissions**, not completions | `DS_AE_DAILY_COUNTS` counts requests first reaching the Submit step — confirm that's really what "Total Completed That Day" should show (§1). |
| 2 | Daily-counts INNER JOIN silently drops/inflates rows | A request with no `RequestTag` row is excluded entirely; one with multiple Tag rows is counted more than once (§1). |
| 3 | YoY view likely miscategorizes Dental-Commercial coverage as Health | `typegr`'s CASE only matches `DNTP`, not `DNTC`, for the Dental bucket (§1). |
| 4 | YoY current↔prior join key is coarser than it looks | Matches on `(pernr, erbnr, typegr)` only, not `subty`/`objps` — could pair records ambiguously for someone with more than one coverage record of the same coarse type (§1). |
| 5 | Employer↔member join for the election-type sub-breakdown | Don't join through `ZVHCM_AE_001Q`'s aggregated CUBE output — source the employer side from `ztbl_hcm_process3` pre-aggregation instead (§2). |
| 6 | Synod/Region access — named directly to you in the original ask | "Need access to QA_RetAccts space for Ahmed, Blair" — but `DS_AE_EMPLOYER_STATUS.geog` may already cover this once replicated; worth checking before chasing separate access (§3). |

---

## Why multiple views, not one flat table

The dashboard needs KPIs at genuinely different grains: employer-level
completion status, member-level election detail, date-level daily snapshots,
and year-over-year comparison. Forcing all of that into one Datasphere view
would fan out rows across mismatched grains (e.g. an employer row duplicated
once per date, once per member) and silently inflate counts. Instead:

1. Four **source-aligned views** — thin, near-1:1 replications of the
   existing SAP CDS consumption queries into Datasphere, one per grain.
2. One **consumption layer** (a Datasphere Analytic Model, or equivalent)
   on top, joined only where grains genuinely align (by employer number /
   date), exposing the specific measures each dashboard tile needs.

This mirrors the layered pattern (source-aligned → harmonized/consumption)
already used elsewhere in this repo's `datasphere_view_spec.md`.

---

## 1. Source-aligned views (replicate into Datasphere as-is)

### `DS_AE_EMPLOYER_STATUS`
**Wraps:** `ZVHCM_AE_001Q` (SQL `ZVHCM_AE_001Q`) — catalogued as **AE_Employer
Election**.
**Grain:** one row per combination of election status, current/prior
Contribution Set, employer geography/type/address, HSA/HRA bundle amounts,
employee count (aggregate CUBE — see catalogue entry's Grain note).
**Fields needed for the dashboard:** `status`, `emprno`, `geog` (Synod/Region
— `RegionSynodName`), `ertype` (employer type), `eecount` (employee
headcount), `counter` (employer count), `hsa` flag.
**Feeds:** Employer Selection totals/%/defaulted, Synod/Region breakdown.
**Known constraint (from the catalogue entry):** plan-year effective dates
are hardcoded literals in the CDS view (BR-5) — confirm the annual
redeployment process before relying on this for next year's cycle.

### `DS_AE_MEMBER_SELECTIONS`
**Wraps:** `ZVHCM_AE_003Q` — catalogued as **AE_Member Selections**.
**Grain:** one row per member per enrollment request/event.
**Fields needed:** `member`, `employer` (for the employer-level join),
`PlanElected`, `HsaElection`/`HsaElectionAmt`, `HraElection`,
`FsaHealthElection` etc., `completed`, `currentstep`.
**Feeds:** Health / HSA One Time / HSA Family election sub-breakdown.

### `DS_AE_DAILY_COUNTS`
**Wraps:** `ZVHCM_AE_004Q` — catalogued as **AE_Member Daily Counts**.
**Grain:** one row per (submission date, Tag) — a `COUNT` of distinct
enrollment requests whose *earliest* step-log row with `CurrentStep =
'Submit'` falls on that date, grouped by Tag. This counts **submissions**,
not elections completed — check that's the right semantic for "Total
Completed That Day" before wiring it in.
**Confirmed fields:** `datef` (date, YYYYMMDD), `tag` (RequestTag value —
business meaning still Unknown catalogue-wide), `counter` (submission
count).
**Confirmed source:** `ZTBL_HCM_AE_MEMCOUNT` AMDP, sourced from
`PORTICO.BENEFITEVENTS_EnrollmentDataLog` (first-Submit timestamp per
request) INNER JOINed to `PORTICO.BENEFITEVENTS_RequestTag` — resolves this
doc's earlier "two candidate sources" ambiguity in favor of this one.
**Known risk (BR-2 on the catalogue entry):** the join to `RequestTag` is an
**INNER join, not LEFT** — a request that reached Submit but has zero Tag
rows is silently excluded from the whole cube, and a request with more than
one Tag row is counted once per Tag (inflating the total). Not confirmed how
often either happens with real data — worth asking Yong Yang before trusting
the totals at face value.
**Feeds:** the timeline bar chart, filtered to the Employer Selection window
(10/1–10/14 per the screenshot).

### `DS_AE_YOY_COMPARISON`
**Wraps:** `ZVHCM_AE_005Q` — catalogued as **AE_Member Year over Year**.
**Grain:** one row per `(pernr, erbnr, typegr)` combination present at
`KeyDate` (current), LEFT OUTER JOINed to the same combination at
`KeyDate2` (prior) — one row per current-period dependent-coverage record,
optionally paired with its prior-period counterpart. `typegr` is a coarse
3-way bucket (VSN / DNT / HLT), not a literal Health/Dental/Vision field.
**Confirmed fields:** `pernr`/`erbnr` (member/dependent), `favor`/`fanam`
(name), `subty`/`type`/`bopti`/`depcv`/`bplan` (current coverage detail),
`prsubty`/`prtype`/`prbopti`/`prdepcv`/`prbplan` (same, prior year — null if
no match at KeyDate2), `counter` (always ~1, not a real aggregate).
**No literal changed-flag field exists** — "changed" has to be computed
downstream as `bplan <> prbplan` (or similar) over these paired columns; the
YoY breakdown tile can't just read a boolean off the source.
**Known risks (from the catalogue entry):**
- **BR-1 — likely bug:** `typegr`'s CASE only matches `type = 'DNTP'` for
  the Dental bucket, not `DNTC` — a Dental-Commercial coverage record falls
  through to `HLT` instead. If the widget ever breaks the YoY tile out by
  benefit type, Dental counts are probably undercounted (and Health
  overcounted) until this is fixed at the source.
- **BR-10 — join-key ambiguity:** the current-vs-prior join keys on
  `(pernr, erbnr, typegr)` only, not the finer `subty`/`objps` — a
  member/dependent with more than one coverage record sharing the same
  coarse `typegr` at `KeyDate` could match ambiguously against `KeyDate2`.
  Not confirmed whether this occurs with real data.
**Feeds:** "Of complete above, having YoY comparisons."

---

## 2. Consumption layer — `DS_AE_SNAP_REPORT` (Analytic Model)

Built on the four source-aligned views above, exposing the measures each
dashboard tile binds to:

| Dashboard tile | Measure(s) | Source | Grain of the join |
|---|---|---|---|
| Total employers set up to go through selection | `COUNT(DISTINCT emprno)` | `DS_AE_EMPLOYER_STATUS` | employer |
| Total completed today / % complete | `COUNT` where `status` in (Completed EL, Completed OTP) / total | `DS_AE_EMPLOYER_STATUS` | employer |
| Of complete — Health / HSA One Time / HSA Family | `COUNT` of members with the matching election flag, for employers whose status = Completed | `DS_AE_MEMBER_SELECTIONS` joined to `DS_AE_EMPLOYER_STATUS` on `employer = emprno` | employer → member (see open item below) |
| Total non-completed | `COUNT` where `status` = Open | `DS_AE_EMPLOYER_STATUS` | employer |
| Total defaulted (running tally) | `COUNT` where `status` in (Default, Default Override) | `DS_AE_EMPLOYER_STATUS` | employer |
| Timeline by day | `counter` by `date`, `tag` (submission counts — see BR-2 risk) | `DS_AE_DAILY_COUNTS` | date |
| YoY comparisons | computed `bplan <> prbplan` (etc.) counts by `typegr` | `DS_AE_YOY_COMPARISON` | member |
| Synod/Region breakdown | `COUNT` grouped by `geog` | `DS_AE_EMPLOYER_STATUS` | employer |

**Open design question:** the employer→member join for the "of complete"
sub-breakdown assumes every member in `DS_AE_MEMBER_SELECTIONS.employer`
maps cleanly to one row in `DS_AE_EMPLOYER_STATUS.emprno`. Given
`DS_AE_EMPLOYER_STATUS` is itself an aggregate CUBE (not one row per
employer — see its Grain note above), this join needs to happen against a
de-aggregated employer list, not the CUBE output directly. Worth confirming
the right join key with Yong Yang before building.

---

## 3. Explicitly open items (not resolved here)

These were flagged in red on the original requirements screenshot. Do not
guess at them — confirm with the people named.

1. **Membership/eligibility counts on church YoY** — screenshot says
   "Either Venkata's datasphere view or Matt's 39" (Matt Christensen's
   CDS-view catalogue effort — see `project_matt_christensen_cds_views`
   memory). Needs a decision on which source to use before this tile can be
   built.
2. **Synod/Region access** — screenshot says "Go from ODS! Need access to
   QA_RetAccts space for Ahmed, Blair." Note: `DS_AE_EMPLOYER_STATUS.geog`
   already sources Synod/Region from `PORTICO.ODSPRIME_Employer` inside the
   existing `ztbl_hcm_process3` AMDP (confirmed in the AE_Employer Election
   catalogue entry) — once that CDS view is replicated into Datasphere, this
   requirement may already be satisfied without the separate ODS/QA_RetAccts
   access. Worth raising with Ahmed before pursuing that access path
   separately, in case it's redundant.

---

## 4. Refresh / real-time

The screenshot calls real-time "ideal," not required. Recommended v1:
Datasphere replication on a scheduled interval (e.g. hourly during the AE
window) feeding a SAC model with the Story's own auto-refresh enabled. True
push-based real-time is a stretch goal, not part of this spec.

---

## 5. Next steps to make this real

1. Confirm the two open items above with the named owners.
2. ~~Catalogue `ZVHCM_AE_004Q` and `ZVHCM_AE_005Q`~~ — **done** (AE_Member
   Daily Counts, AE_Member Year over Year). Confirm the two new risks above
   (BR-2's INNER JOIN exclusion, BR-1's DNTC bug) with Yong Yang while
   you're at it.
3. Build the four source-aligned views in Datasphere (replication or virtual
   access, per whatever connection Datasphere already has to this HANA
   system).
4. Build `DS_AE_SNAP_REPORT` on top, resolving the employer→member join
   question above.
5. Build a SAC model on `DS_AE_SNAP_REPORT` and bind it to the widget (see
   `README.md` in this folder).
