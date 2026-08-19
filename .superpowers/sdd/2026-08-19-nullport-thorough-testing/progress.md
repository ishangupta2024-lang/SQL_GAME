# SDD ledger — plan: docs/superpowers/plans/2026-08-19-nullport-thorough-testing.md

Spec: none separate. Plan states scope derives from README.md + its own Coverage
Gap Analysis. Rulings made without a separate spec are provisional.

Status: SETUP COMPLETE — no tasks dispatched yet. Halted at usage-limit
checkpoint before Task 0/1 dispatch. Resume at Task 0.

---

## Pre-flight conflict scan

### Cross-task rows (tasks sharing a file or interface)

| A | B | A produces | B consumes | Finding |
|---|---|---|---|---|
| 1 | 2,3,4,5,6,7,8,9 | `harness.cjs {section,check,report}` | same three names | clean |
| 1 | 5,6,7,8 | `cdp.cjs {findBrowser,launch,SHOT_DIR,sleep}` + session methods | `ev,waitFor,click,setValue,setEditor,text,count,exists,key,shot,reload,setViewport,clearStorage,boot,send,close,pageErrors` | clean — all 17 declared in Task 1 Interfaces and all defined in Task 1 Step 2 |
| 1 | 9 | refactored `browser-test/ui-test/playthrough` | `test-all.cjs` SUITES list | clean — filenames unchanged |
| 1 | 9 | `launch(opts.prefer)` | Task 9 adds `process.env.NULLPORT_BROWSER` fallback | clean — additive, same param |
| 4 | 5,6,7 | edits `js/app.js:128-136` | 5 edits `load()` (~65-71), 6 edits handlers (~231,311,387,498), 7 edits `renderBoard`/`renderWorkspace`/`renderNotes` | **FINDING 1** — line numbers drift |
| 2 | 3 | — | both read `globalThis.NullportAnswer` | clean — Task 2 loads `js/answer.js` transitively via its own require |
| 5 | 8 | both delete the IndexedDB `nullport` store | — | clean — sequential execution, distinct CDP ports |
| 2 | 9 | may edit `js/cases.js` prose | playthrough re-run | clean — Task 2 Step 5 re-runs verify-campaign + playthrough |
| — | — | CDP ports | 9333/9334/9335 existing; 9340 (T1 probe), 9341 (T5), 9342 (T6), 9343 (T7), 9344 (T8) | clean — no collisions |

### Per-task self-consistency rows

| Task | Own text agrees with itself? | Finding |
|---|---|---|
| 0 | yes | **FINDING 2** — optional, but every other task depends on it |
| 1 | yes — files created match files later modified | clean |
| 2 | mostly | **FINDING 3** — dead `const A = require(...)` line |
| 3 | yes — CANON map covers 26 stages, asserted in-suite | clean |
| 4 | yes — test written before fix, fails first | clean |
| 5 | yes | clean |
| 6 | mostly | **FINDING 4** — one check asserts nothing |
| 7 | yes — each failing check names the exact remedy | clean |
| 8 | yes — budgets carry observed baselines in comments | clean |
| 9 | yes | clean |

---

## Pre-flight rulings

**FINDING 1 — line-number drift across four tasks editing `js/app.js`.**
Tasks 4, 5, 6, 7 each cite line numbers in `js/app.js`, but Task 4 runs first
and changes line count, so every later citation is stale by the time it is read.
Ruling: line numbers in Tasks 5-7 are advisory only; every implementer dispatch
that touches `js/app.js` must instruct locating the edit site by function name
and surrounding content (`load()`, `renderBoard`, `renderWorkspace`,
`renderNotes`, the `[data-rebuild]` handler), never by line number. Cost if
wrong: an implementer edits the wrong region and the task review catches it —
one fix round.

**FINDING 2 — the plan's commit steps require git; `E:\SQL_GAME` is not a repo.**
Task 0 is marked optional, but Tasks 1-9 each end in `git add`/`git commit`, and
SDD itself is commit-based: `review-package BASE HEAD`, ledger commit ranges,
and the final whole-branch review all need history. Ruling: Task 0 is
**mandatory**, not optional, and runs first. `git init` is local, reversible and
creates nothing outside this directory, so it is not one of the four stop
conditions. Cost if wrong: an unwanted `.git` directory the user deletes with
one command.

**FINDING 3 — dead code mandated by plan text (Task 2).**
Task 2's suite contains `const A = require(path.join(__dirname,'..','js','answer.js')) || globalThis.NullportAnswer;`
which is never used — the checks reference `ANS`. The plan's own Self-Review
already flags it. Ruling: implementer deletes the `A` line; the `ANS` line
stays. Recorded here so the task reviewer does not flag it as an unrequested
deviation from the brief. Cost if wrong: none.

**FINDING 4 — a check that asserts nothing (Task 6).**
`check('the cache was actually cleared and rebuilt', await s.ev('indexedDB.databases ? indexedDB.databases().then(...) : true'))`
resolves truthy on both branches — it can never fail. The review rubric treats a
test that asserts nothing as a defect, and the plan mandates it, so this is mine
to rule on. Ruling: replace with a real assertion — before clicking Rebuild,
stamp a sentinel into the cached record's key space and assert it is gone after
reload; if that proves impractical from the page context, assert instead that
boot took the cold path by timing it (`> 1000ms`, versus a warm boot's ~105ms).
The spec's intent is to verify Rebuild actually rebuilds — Task 4 fixed the bug
that made it not; a check that cannot fail would leave that fix unguarded.
Cost if wrong: the check is flakier on a fast machine and needs its threshold
widened once.

---

## Task ledger

(no tasks dispatched yet)
