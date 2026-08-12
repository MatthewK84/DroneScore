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

Before you tap it, check **Criteria → Review**. Anything you can still fix at
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
Criteria live.

### Review

Read this before closing the day. It shows exactly what will print.

- **Compliance summary** — counts of Objective / Threshold / Short / No
  benchmark, plus which system the compliance table is reported for.
- **Per-criterion MOP results** — every measure with its value and its
  **basis**. The basis is the part to read. `captured` means measured from
  stage data. `inferred from outcome` means the run predates stage capture and
  the value was back-filled from the outcome column — that is not a measurement
  of that stage and should not be read as one. `mixed: 4 captured, 12 inferred`
  tells you exactly how far along you are.
- **KPP compliance** — defaults to showing only entries needing attention.
  Toggle to see all 72.

### System Profile (admin)

Pick an interceptor, answer what applies. Every control is generated from the
KPP catalog, grouped by framework section: Detect, Track, Identify and
Characterize, Target Quality, Defeat, Automation, C2, Survivability.

Yes/No controls have a third state, **Unanswered**, which is distinct from No.
For the vulnerability entries (KSA 8.3 and its sub-items) and corrosion,
answering *Yes* is the adverse finding — the report scores those inverted.

At the bottom, six narrative fields for the qualitative MOPs of Criteria 4 and
5: co-located system impact, HERO/HERP/HERF, RMF compliance and ATO/ATC status,
contested environment, hazard prevention, collateral damage mitigation. What
you write prints verbatim in report section 8.

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

---

## 9. Reading the report

Eleven sections. Sections 1 through 7 are the original report; 8 through 11 are
the Capability Characterization additions.

| § | Contents |
|---|---|
| 1 | Bottom Line Up Front |
| 2 | Mission overview — date, location, coordinates, sunrise/sunset, scoring window |
| 3 | Environmental conditions from automated observations |
| 4 | Run log, split into Red Air (4a) and Abort (4b) |
| 5 | Performance analysis by interceptor, target, group, and period |
| 6 | Scorer observations, verbatim |
| 7 | Assessment narrative |
| 8 | Capability Characterization — MOP results per criterion, each with n and basis |
| 9 | KPP compliance — measured, Threshold, Objective, verdict, by category |
| 10 | Test matrix coverage — achieved against required data points |
| 11 | Benchmark basis — the reasoning behind every number used |

### Why section 5 and section 8 can show different Pk values

They answer different questions, and the report says so wherever they diverge.

Section 5 divides successes by every attempted run. MOP 3.1.2 in section 8
divides defeats by the runs that actually reached the **engage** stage. A run
that lost track before launch is an attempt under the first definition and not
an engagement under the second.

Where stage data was captured, MOP 3.1.2 is the figure that answers Criterion 3.
On runs logged before stage capture existed, the two agree exactly, so no
historical number has moved.

### Verdict labels in section 9

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

**Something looks wrong on the report:** check the basis column in section 8
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
