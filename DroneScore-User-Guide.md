# DRONESMOKE / DroneScore — User Guide

C-sUAS interceptor evaluation. Scorers log air-to-air engagements live from a
phone or a laptop. At end of day an admin closes the day and the application
generates a Warfighter Observation Report as a PDF.

This guide covers the application after the C-sUAS Capability Characterization
Criteria integration. If your build has no **Criteria** tab, you are on the
earlier version and sections 6 and 9 of this guide will not match your screen.

---

## 1. Two links, one database

The same codebase serves two audiences. Which link you were given determines
what you see.

| | Ops console | Read-only board |
|---|---|---|
| Who gets it | Scorers and admins | General authorized population |
| Password | Scorer or Admin | Viewer |
| Can enter data | Yes | No |

Access is enforced on the server, not just hidden in the interface. The board
build does not ship the data-entry screens at all, and every write is rejected
for the viewer role no matter which link it arrives on.

### Roles

| Action | Viewer | Scorer | Admin |
|---|---|---|---|
| View every page | Yes | Yes | Yes |
| Log engagements | No | Yes | Yes |
| Add drones and interceptors | No | Yes | Yes |
| Enter day measures | No | Yes | Yes |
| Add schedule events, submit feedback | No | Yes | Yes |
| Edit or delete any record | No | No | Yes |
| Set day location and coordinates | No | No | Yes |
| Edit the system profile, benchmarks, test matrix | No | No | Yes |
| Close the day and generate the report | No | No | Yes |
| Email the report | No | No | Yes |

### Signing in

Open the link, enter the password you were issued, tap **Sign in**. There is no
username. The password alone determines your role, and the badge beside your
name in the header tells you which role you got — **Admin** in orange,
**Scorer** in olive.

Sessions survive a screen lock but not a server restart. If the app drops you
back to the sign-in screen mid-day, that is what happened; sign back in and
nothing is lost.

---

## 2. Before the first sortie

Do these once, in this order. Skipping them does not stop you from scoring, but
it does leave gaps in the report that are hard to close after the fact.

1. **Fleet tab** — add every target drone and every interceptor you will fly.
2. **Day tab** — set location name and coordinates. These drive the weather
   pull and the sunrise/sunset times on the report. Admin only.
3. **Criteria → Test Matrix** — enter your mission profiles. Admin only.
4. **Criteria → Benchmarks** — establish Threshold and Objective values.
   Admin only, and see the warning in section 6.
5. **Criteria → System Profile** — answer what you can for each interceptor.
   Admin only.

Steps 3 through 5 are what the Capability Characterization Criteria call
pre-test definitions. Section 4.2 of the framework requires benchmarks to be
documented **before** test execution. A benchmark entered after you have seen
the results is not a benchmark.

---

## 3. Score tab — the main workflow

This is where you will spend the day.

### The scoreboard

The dark strip across the top shows Date, Logged, Hits, Pk, and Status. Pk here
counts Red Air runs only; abort runs are excluded, because an abort run tests
the terminate command rather than intercept performance.

Status reads **OPEN** or **CLOSED**. Once closed, the scoring form disappears
until an admin reopens the day.

### C4 Scorecard, live

Under the scoreboard, the Overall System Score out of 2 and the five Core
Capability Area scores, refreshed every time you log a run — one line per
interceptor flown today. If a Critical KPP scores 0, that system's line carries
the Not Militarily Effective banner.

Each interceptor is scored from **its own runs only**. Logging a KI-1 run moves
KI-1's line and nothing else; two systems flown on the same day are two
evaluations that happen to share a range.

You do nothing to produce this. Logging an engagement is the only action
involved: every criteria row that run bears on is measured, scored, and rolled
up from that one action. The strip is here so you can see where the evaluation
stands without leaving the tab you are scoring on; the Criteria tab has the
full tables behind it.

### Weather panel

Live conditions pulled from the National Weather Service, with a GO / CAUTION /
NO-FLY estimate per UAS Group. Wind uses the greater of sustained and gust.
This is an estimate to inform the range, not an authority to fly.

### Logging a run

Work down the form. Only the outcome is strictly required; everything else
improves the report.

**Sortie** — free text, e.g. `DS-01`.

**Target drone** and **Interceptor** — pick from the Fleet lists.

**Test matrix profile** — which line of the matrix this run satisfies. Only
appears if profiles have been defined. Leave it on *No matrix profile* if the
run does not belong to one; unassigned runs are counted and named on the report
rather than being quietly spread across profiles.

**Scenario** — two buttons, MLCOA (most likely course of action) and MDCOA
(most dangerous). This splits the engagement timeline on the Criteria tab into
its two columns. It stays where you left it between runs, because a block of
runs is flown under one course of action; you set it once when the block
changes, not once per run.

**Run type** — two buttons:
- *Red Air Intercept* — a real intercept attempt. Counts toward Pk.
- *Abort Run* — an intentional test of the abort or terminate command.
  Excluded from Pk and reported separately. Choosing this hides the stage
  picker, because an abort run has no kill chain.

**Furthest stage reached** — the single most important control on the form.
Seven buttons in kill chain order:

| Button | Means |
|---|---|
| No Detect | Target flew, was never seen |
| Detect | Seen, no stable track |
| Track | Tracked, never classified |
| Classify | Known to be a sUAS |
| Identify | Type or model determined |
| Engage | Engaged, not defeated |
| Defeat | Threat neutralized |

Tap the **furthest** stage the run reached. Everything below it counts as
achieved. One tap answers six separate measures at once — probability of
detection, probability of track, correct classification, correct
identification, probability of engagement, and Pk.

Tapping a stage also sets the Outcome for you: Defeat sets Success, Engage sets
Miss, anything earlier sets No Attempt. You can still override the Outcome
afterwards if a run does not fit the pattern.

*Practical mapping:* a run that lost track after launch is **Engage**, not
Miss-with-a-note. A run that armed but never launched is **Identify**. Getting
these right is what turns your dominant failure mode into a measured number
instead of a free-text observation.

**Advanced measures** — collapsed by default; tap to open. Optional
throughout. The panel only asks for what the stage supports: it will not ask
for track continuity on a run that never tracked, or ID range on a run that
never identified.

- Detect range (m) and Detect altitude (m AGL). Slant range is computed from
  these two, so it is never asked for.
- Time to detect (s) and Time to decide / engage (s). These two, with ID time
  below and the time to intercept on the main form, build the four phases of
  the Engagement Timeline Analysis. A phase left blank is reported as not
  captured, never as zero.
- Track continuity (%) and Track error (m).
- ID range (m) and ID time (s).
- Identified correctly? — Yes / No / Not noted. **Not noted is not the same as
  No.** Leaving it unanswered keeps the run out of the mis-identification rate;
  answering No puts it in.

**Outcome** — three large buttons. Labels change for abort runs to Abort OK /
Abort Failed / No Attempt.

**Stopwatch** — Start, Stop, **Use as TTI**, Reset. Feeds the time-to-intercept
field.

**Time to intercept, Range, Altitude** — numeric. Range on a defeat run is what
the report uses for MOP 3.1.3 Defeat Range.

**Notes** — anything the numbers do not capture. These print verbatim in report
section 6.

Tap **Log engagement**. The form clears and the run appears in the log below.

### The engagement log

Each line shows the run type badge, interceptor, target, outcome, then a meta
line with the captured stage, sortie, TTI, and range. Admins get **Edit** and
**Delete** on every line; editing loads the run back into the form with every
advanced measure restored.

---

## 4. Fleet tab

Two lists.

**Target drones** — name, UAS group, airframe, weight, max speed, propulsion,
control link, notes. Only the name is required, but the **UAS group matters**:
it drives the group rollup on the report and it selects which benchmark applies
to a run.

**Interceptors** — name and vendor.

Scorers can add. Only admins can delete.

---

## 5. Day tab

### Day settings (admin)

Location name, latitude, longitude, weather note. Coordinates drive both the
weather pull and the sunrise/sunset calculation on the report, so get them
approximately right for the range rather than for the nearest town.

### Day measures

Seven numbers plus a text field, entered once at closeout. These feed measures
that no single run can produce.

| Field | Feeds |
|---|---|
| Operating time (min) | False alarm rate, MTBSA |
| False sUAS detections | MOP 1.1.4 False Alarm Rate |
| System aborts | MOP 4.2.1 Mean Time Between System Abort |
| Repair time (min) | MOP 4.2.2 Mean Time to Repair — diagnose and repair only, excluding admin and logistics delay |
| Crew to operate | KPP 6.1 Workload |
| Crew to set up | KPP 6.3 Workload |
| Setup time (min) | Recorded alongside setup crew |
| Sensor source | Note when a separate radar or EO/IR fed the engagement rather than the interceptor's own optic |

Left blank, these print as **not entered** on the report. They never print as
zero. A false alarm rate of zero that nobody counted is a claim, not a
measurement, and the report will not make it on your behalf.

Tap **Save day measures**. Scorers can do this; it is not admin-gated.

### Close out (admin)

**Done for the Day** generates the report and locks scoring. Confirm the prompt
and wait for the control number, e.g. `WOR-20260811-01`.

Before you tap it, check **Criteria → Scorecard**. Anything you can still fix at
the range is fixable now and a finding afterwards.

### Past days

Every prior day with its run count and report. **View** opens the PDF,
**Email** sends it to the configured distribution list (admin), **Reopen**
unlocks a closed day for more scoring (admin). Reopening and closing again
produces a new report with the next sequence number; the earlier report is
kept, not overwritten.

---

## 6. Criteria tab

Four views along the top. This is where the Capability Characterization
Criteria live, laid out as the consolidated JIATF 401 Common Criteria for
CUAS Characterization (C4) document.

### Scorecard

The default view, and the criteria document itself: the five Core Capability
Areas, every row each of them prints, in the document's order and with the
document's columns.

**Systems Flown Today.** When more than one interceptor has flown, a row of
buttons at the top — one per system, each showing its overall score and `NME`
if it is flagged — switches the whole scorecard between them. The primary
system (the one flown on the most intercept runs) is listed first and opens
by default.

Day closeout counters — false alarms, operating minutes, system aborts, repair
time, crew, setup time — are entered once per day. Every system documented on
a day shares that day's range space, so the closeout applies to each of them in
full: a false alarm rate of 1 per hour on the day is 1 per hour for every system
flown. Runs logged with no interceptor selected belong to no system and are
counted but excluded.

**Nothing on this screen asks you for a number.** The Measured column fills
itself from the runs already logged on the Score tab. Logging an engagement
scores every row that engagement bears on, and the score you see here is the
score that prints.

**Overall System Score** sits at the top, out of 2. It is the weighted average
of the five Core Capability Areas at equal weight, and it counts only rows that
actually carry a score. Underneath it the header states how many rows do not:
how many have no Threshold or Objective stored, how many have no measurement
yet, and how many are marked not applicable. That split matters — an area
scoring 2.00 from one row out of twenty is not a passing area, it is one
measured row.

**Scoring**, from section 2 of the criteria:

| Score | Means |
|---|---|
| 0 | Not Met — below Threshold |
| 1 | Met Threshold |
| 2 | Met or Exceeded Objective |
| N/A | Not applicable to this interceptor configuration |

A row with no score shows why instead: `No T/O` (no benchmark stored),
`No data` (benchmarked but not yet measured), `Reported` (a specification the
criteria do not score), `Claimed` (a performance figure from the vendor's data
sheet that no run has demonstrated yet), or `N/A`. None of these count as a
pass, and none enters the average.

**Vendor Declarations and Derivations.** Below the timeline, the derivation
engine's working for the system shown:

- **Derived values.** Battery life (9.1), cost per engagement (5.8), sustained
  defeats an hour (5.3), and the intercept envelope (INT-3), each with its
  arithmetic written out. One missing an input says which input, rather than
  guessing it.
- **Top speed against each UAS group's ceiling:** which groups the interceptor
  can run down in a tail chase at all.
- **Declared against demonstrated:** every claim from the sheet held against
  what the runs showed: *Consistent*, *Shortfall*, *Inconsistent* (the runs
  contradict the claim, e.g. a defeat implying a speed faster than the declared
  top speed, which means a claim, a range, or a time is wrong), or *Untested*
  (no run captures it: seeker lock, miss distance, and engagement geometry
  aren't logged).

The engine computes; it never estimates. Nothing on this card produces a
probability from a specification.

**Not Militarily Effective.** If a row marked Critical scores 0, a red banner
names it and the system carries that flag. Which KPPs are Critical is the
evaluator's call, made on the Benchmarks view when the Threshold and Objective
are set. The application never guesses at criticality.

**Mark N/A** (admin). Each row carries a *Mark N/A* button. Use it when a row
genuinely does not apply to the interceptor configuration under test — a
proximity fuse row on a hit-to-kill interceptor, say. The mark is stored on
that system's profile, so it applies every day that system flies, and it takes
the row out of the score rather than scoring it zero. *Restore* undoes it.

**Supporting KPP Groups, Usability, and Mission Impact.** Sections 4 through 6
of the criteria — Automation, C2, Survivability, Ancillary & Cost, Target
Quality, operator usability (NASA-TLX, SAGAT, SUS), and mission impact and
risk. Collapsed by default. These are reported in full but never fold into the
Overall System Score, which the criteria define over the five Core Capability
Areas alone.

**Engagement Timeline Analysis.** Section 7. Mean seconds per phase across the
day's intercept runs, split into MLCOA and MDCOA columns with the delta between
them. Every figure comes from timings captured on the run form; a phase nobody
timed is left blank rather than counted as zero, and the total says how many of
the four phases it actually covers.

Read this view before closing the day. A row showing `No T/O` is still fixable
at the range. Once the report is generated it is a finding.

### System Profile (admin)

**Vendor Data Sheet.** The fast way to fill a profile. *Download blank sheet*
gives a fillable PDF generated from the criteria catalog: one box per
criterion, each in a stated unit, with a unit list beside every number that
could be written in more than one. Send it to the vendor before testing.

When it comes back, *Import completed sheet* reads it and shows exactly what
it would change (new, changed, the same) before anything is written. Anything
it can't read exactly is listed as *Not imported*, with the reason, rather than
guessed at: a range such as `290-340`, a number with a unit typed into it, a
percentage over 100. *Apply* writes the rest in one step; *Discard* writes
nothing. A sheet that was printed to PDF or flattened has lost its boxes and is
refused; ask the vendor for the saved fillable form. Every sheet received stays
listed with a *PDF* link as evidence.

Imported values carry a badge: **From vendor sheet**, or **Vendor claim, not
scored** on the performance claims (detection and classification probability,
tracking accuracy, kinetic Pk, probability of lock, CEP, geometry Pk). A claim
from the sheet is shown on the scorecard but never scored from the sheet; it
scores once runs demonstrate it. If you edit an imported value, it becomes
yours and the badge drops, and an evaluator-entered figure scores normally.

**Interceptor Airframe.** Cruise speed, flight time with and without payload,
working range, maximum altitude, and interceptor weight. These aren't criteria
themselves; they feed the derivation engine. The sheet asks for the loaded
flight time separately because that, not unloaded endurance, bounds an
intercept.

Pick an interceptor, answer what applies. Every control is generated from the
KPP catalog, grouped by framework section: Detect, Track, Identify and
Characterize, Target Quality, Defeat, Automation, C2, Survivability.

Yes/No controls have a third state, **Unanswered**, which is distinct from No.
For the vulnerability entries (KSA 8.3 and its sub-items) and corrosion,
answering *Yes* is the adverse finding — the report scores those inverted.

The catalog also covers the Interceptor-Specific Metrics (INT-1 through
INT-14), the Ancillary & Cost group, and the operator usability scores, so all
of them are answered here once rather than asked for run by run.

At the bottom, six narrative fields for the qualitative MOPs of Criteria 4 and
5: co-located system impact, HERO/HERP/HERF, RMF compliance and ATO/ATC status,
contested environment, hazard prevention, collateral damage mitigation. What
you write prints verbatim in report section 9, under that system.

Each of those six now carries a **scorecard verdict** beside it — Yes/No or
Pass/Fail depending on the row. The narrative is the evidence; the verdict is
what the scorecard scores. Leaving the verdict unanswered reports the row as
having no data, which is not a pass.

Tap **Save system profile**.

### Benchmarks (admin)

Section 4.2 requires a Threshold and an Objective for each KPP, documented
before test execution.

**The derivation helper.** Enter the target UAS group, your protected standoff
in metres, your detect-to-defeat cycle in seconds, and your launch-to-defeat
time. Tap **Derive benchmarks**.

What comes back is split in two, deliberately:

- **Derived** — the range and altitude benchmarks, each showing its arithmetic.
  A Group 1 target at its published 100 kt ceiling covers 1,543 m in a 30 s
  cycle, so a 500 m standoff gives a Threshold of 2.04 km (one engagement
  cycle) and an Objective of 3.59 km (two cycles, so you can miss once and
  re-engage before the target arrives). Tap **Accept** to store one.
- **Not derived** — every probability of kill, accuracy, and simultaneous
  target count. **These are deliberately blank.** There is no public
  authoritative table of C-sUAS defeat probabilities per UAS group, and a
  fabricated figure inside a formal evaluation would carry the authority of a
  source that does not exist. If your programme has these numbers, enter them
  with their basis. If it does not, the report will say "not established",
  which is an open action against the evaluation — not a pass, and not a fail.

> **Set the cycle time from your own timing data, not an estimate.** Every range
> benchmark scales linearly with it. Ten seconds of optimism moves each Group 1
> range benchmark by roughly 515 m.

**Set a Benchmark.** Below the derivation helper, a form for storing a
Threshold and Objective on any row of the scorecard by hand — including the
MOP rows, the interceptor-specific metrics, and the supporting groups, none of
which the derivation helper covers. Enter the limits, the unit, and the basis;
the basis prints on the report, so write where the numbers came from.

The same form carries the **Critical KPP** toggle. A Critical KPP scoring 0
flags the whole system Not Militarily Effective on the scorecard and on the
report. The criteria do not say which KPPs are critical, so nothing is marked
critical until an evaluator marks it here.

Stored benchmarks are listed below with their scope. A benchmark can apply to
all systems and all groups, to one system, to one group, or to a specific
pairing. The most specific match wins.

### Test Matrix (admin)

Each profile is one block of the evaluation team's matrix.

Enter a **profile code** (`R-1`, `F-2`, `M-1`), a **mission** (ISR, OWA,
MULTI-ISR), **time** (Day/Night), and **data points required**. Then add one or
more **target platforms**, each with its own elevation in feet AGL, speed in
mph, and launch point.

A multi-target profile stays a single profile. The matrix defines those targets
as flying concurrently, so splitting them into three would triple the required
data points and misreport coverage.

Coverage is counted from runs assigned to the profile on the Score tab.

---

## 7. Schedule and Feedback

**Schedule** — date, time label, title, details. A shared agenda. Scorers add,
admins delete.

**Feedback** — name, rank, unit, subject, message. Anyone signed in can submit.
Admins see full entries.

---

## 8. The read-only board

Viewers get a live tally: date, runs, intercepts, Pk, and the day's log with
outcome colours. It updates on its own. Nothing on it can be edited by anyone,
regardless of role.

### JIATF 401 Criteria Progress

Under the scoreboard, one panel per interceptor showing its progress toward C4
criteria compliance, **scored cumulatively across every day it has flown**:

- **Overall score** out of 2, and **Criteria met** — rows at or above
  Threshold, out of the rows that can be scored.
- **The progress bar** splits those rows into Objective met, Threshold met,
  Not met, and Not yet evidenced. The legend beside it always shows the counts.
  Rows marked not applicable, and specification rows the criteria do not score,
  sit outside the bar and are counted underneath it.
- **Crit 1–5** — each Core Capability Area's score and how many of its rows
  are scored.
- **Overall score by day** — the score after each day that system flew, with
  the change since its first day. Open *By day* for the same figures as a table.
- **Not Militarily Effective**, with the Critical KPPs that scored 0, when any did.

The board publishes **scores and counts only**. Measured values, Threshold and
Objective figures, benchmark bases, and everything on the system profile stay
behind the scorer and admin logins.

**The board and the Score tab can legitimately disagree.** The Score tab and
Criteria tab score *today*; the board scores the *whole evaluation*. A system
that had a bad day can be flagged on the Score tab while its cumulative record
on the board is not, and the reverse. Neither is wrong; they answer different
questions. When briefing, say which one you are quoting.

---

## 9. Reading the report

Eleven sections. Sections 1 through 7 are the original report; 8 through 11 are
the Capability Characterization additions, broken out by interceptor.

| § | Contents |
|---|---|
| 1 | Bottom Line Up Front |
| 2 | Mission overview — date, location, coordinates, sunrise/sunset, scoring window |
| 3 | Environmental conditions from automated observations |
| 4 | Run log, split into Red Air (4a) and Abort (4b) |
| 5 | Performance analysis by interceptor, target, group, and period |
| 6 | Scorer observations, verbatim |
| 7 | Assessment narrative |
| 8 | System comparison — every interceptor flown, side by side: runs, Pk, the five area scores, overall, rows scored, and effectiveness status |
| 9 | Characterization by system — for each interceptor on its own pages (9.1, 9.2, …): MOP results with n and basis, KPP compliance, the C4 scorecard, the engagement timeline, and vendor declarations and derivations. A † marks a figure declared on the vendor's data sheet; a ‡ marks one the engine derived |
| 10 | Test matrix coverage — achieved against required data points |
| 11 | Benchmark basis — the reasoning behind every number used |

### Why section 5 and section 9 can show different Pk values

They answer different questions, and the report says so wherever they diverge.

Section 5 divides successes by every attempted run. MOP 3.1.2 in section 9
divides defeats by the runs that actually reached the **engage** stage. A run
that lost track before launch is an attempt under the first definition and not
an engagement under the second.

Where stage data was captured, MOP 3.1.2 is the figure that answers Criterion 3.
On runs logged before stage capture existed, the two agree exactly, so no
historical number has moved.

### Verdict labels in section 9 (KPP compliance)

| Label | Meaning |
|---|---|
| Objective | Met or exceeded the Objective value |
| Threshold | Met the Threshold but not the Objective |
| Fell short | Measured, benchmark exists, did not meet it |
| Not established | No Threshold or Objective was stored. An open action, not a pass |
| Not measured | No benchmark comparison was possible from this day's data |
| Stated | A narrative answer was provided |

---

## 10. Quick reference

**Fastest correct way to log a routine intercept:** target → interceptor →
stage → Log. Four taps.

**A run that lost track after launch:** stage = **Engage**, open Advanced
measures, enter track continuity. Do not log it as a plain Miss.

**A target that never flew as briefed:** do not log it as No Detect. No Detect
means the system failed to see a target that was airborne.

**Fixing a mistake:** ask an admin to Edit the line. Every advanced measure
comes back into the form.

**The day closed too early:** admin reopens from the Day tab, you keep scoring,
admin closes again. The new report gets sequence `-02`.

**Something looks wrong on the report:** check the basis column of the MOP tables in section 9
first. Most surprises are a measure reading `inferred from outcome` when you
expected it to be captured, which means stage was not recorded on those runs.

### Common problems

*Fleet lists are empty on the Score tab.* Add drones and interceptors in Fleet
first. The Score tab shows a notice when the drone list is empty.

*No test matrix profile selector appears.* No profiles have been defined yet,
or all of them are inactive.

*Weather shows nothing.* The lookup is bounded by an eight-second deadline so
scoring never stalls waiting on it. Runs still log fine; the report notes when
automated observations were unavailable.

*Everything reads "not established" in section 9.* No benchmarks have been
stored. Go to Criteria → Benchmarks.

*Signed out unexpectedly.* The server restarted. Sign back in; no data is lost.

---

## 11. Data handling

Every entry is written to the shared Postgres database immediately. There is no
local draft and no offline queue — if the form submits without an error, the
run is saved.

Reports are stored as PDF bytes in the database at the moment the day closes,
so a report always reflects the data, benchmarks, and matrix in force when it
was generated. Editing runs after the fact does not alter an already-generated
report; closing again produces a new one alongside it.

Classification marking on the report comes from a server configuration value,
not from anything entered in the application. Confirm it matches the handling
requirements for your evaluation before distributing.
