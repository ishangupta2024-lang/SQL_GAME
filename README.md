# Nullport — a SQL murder mystery

A browser game that teaches SQL from `SELECT` to window functions by making you
solve an eight-case conspiracy in a rain-soaked port city.

**Open `index.html` in a browser.** That's it. No server, no install, no
internet connection, no build step.

---

## What it is

Knight Lab's [SQL Murder Mystery](https://mystery.knightlab.com/) is one puzzle
with one answer. This is a **campaign**: eight connected cases, twenty-six gated
stages, one shared world database of ~122,000 rows across 18 tables.

Each case is a self-contained crime that teaches one rung of SQL, and each ends
by pointing at the next. Solve all eight and the conspiracy underneath them
resolves.

| # | Case | Tier | What it teaches |
|---|------|------|-----------------|
| 1 | The Body on Pier 7 | Rookie | `SELECT` · `WHERE` · `AND` · `ORDER BY` · `LIMIT` · `LIKE` |
| 2 | The Last Light on Ashgrove | Rookie | `BETWEEN` · `COUNT` · `DISTINCT` · `IN` |
| 3 | Plate 8‑?‑J | Intermediate | `JOIN` · `ON` · table aliases · three-table joins |
| 4 | Three Nights at the Vault | Intermediate | multi-table joins · `LEFT JOIN` · `IS NULL` · `COUNT(DISTINCT …)` |
| 5 | The Payroll Skim | Advanced | `GROUP BY` · `SUM` · `HAVING` · ordering by an aggregate |
| 6 | The Ghost on the Manifest | Advanced | subqueries · `NOT EXISTS` · correlated subqueries |
| 7 | Follow the Money | Expert | self-joins · `WITH` · `WITH RECURSIVE` |
| 8 | The Architect | Expert | CTEs · `ROW_NUMBER() OVER (PARTITION BY …)` |

Cases unlock in order; stages within a case unlock in order. Nothing is
reachable before you have been taught what it needs.

## What's in it

- **A field manual per case** — a short primer teaching exactly the concept the
  next stages need, with runnable examples. No prior SQL required.
- **A real SQL console** — CodeMirror editor, full SQLite 3.49 underneath. Any
  query you like, not a fill-in-the-blank.
- **Schema explorer** — all 18 tables, primary and foreign keys marked. Click a
  column to drop it in the editor; `peek` runs a sample query.
- **Three-tier hints per stage** — a nudge, then an approach, then very nearly
  the query. 78 hints written.
- **Detective's notebook + query history**, persisted.
- **Progress and rank**, persisted in `localStorage`. Cadet → Commissioner.
- **Evidence board** — every clue you uncover stays readable in the sidebar.

Answers are stored as hashes, so poking at the source doesn't spoil the plot.
Answer matching is case- and whitespace-insensitive, and accepts sensible
variants (`202405`, `2024-05`, `May 2024`).

## Layout

```
index.html            the game
css/style.css         interface
js/world.js           seeded world generator — 18 tables, all clues planted
js/cases.js           the campaign: 8 cases, 26 stages, primers, hints
js/answer.js          answer normalisation + hashing
js/db.js              sql.js bootstrap + IndexedDB cache
js/app.js             views, SQL console, progress
vendor/               sql.js (asm build) + CodeMirror 5, vendored offline
tools/                test suites (see below)
screenshots/          captured by the browser tests
```

**The database is generated, not shipped.** `js/world.js` builds the whole city
from a fixed seed every time, so the same world appears for everyone without a
4 MB binary in the repo. First load takes ~3 seconds behind a loading screen;
the result is cached in IndexedDB, so later loads take ~100 ms.

The asm.js build of sql.js is used deliberately — the WASM build needs to
`fetch()` its `.wasm` file, which a `file://` page cannot do.

## Tests

Requires Node 20+ (uses the built-in `fetch` and `WebSocket`). The browser
suites drive headless Edge or Chrome over the DevTools protocol and skip
cleanly if neither is installed.

```sh
node tools/test-all.cjs          # everything
```

Individually:

```sh
node tools/verify.cjs            # 56 checks: every clue resolves to exactly one
                                 # answer; no orphan foreign keys; decoys present
node tools/verify-campaign.cjs   # runs each stage's canonical query, hashes the
                                 # result, asserts the game accepts it
node tools/browser-test.cjs      # world + all 26 solutions inside a real browser
node tools/ui-test.cjs           # boots the UI, runs a query, solves a stage,
                                 # takes a hint, reloads, checks persistence
node tools/playthrough.cjs       # plays all 26 stages through the actual
                                 # interface and reaches the finale
```

The interesting one is `verify.cjs`. Clues are planted *after* the random data
is generated, and any random row that would also satisfy a clue query is mutated
out of the way. `verify.cjs` is what proves that worked — that "the last house on
Wexler Row" has exactly one answer, that four people entered the vault, that the
laundering chain has no branches.

Current status: **56 + 26 + 53 + 27 + 44 checks, all passing.** Cold build 3.1 s,
cached load 105 ms, every stage query under 50 ms.

## Adding your own case

1. Plant the data in `js/world.js`, inside the clue-planting section. Use
   `scrub(rows, predicate, fix)` to mutate away anything that would make your
   clue ambiguous, then push your canonical rows.
2. Add a check to `tools/verify.cjs` asserting your clue resolves uniquely.
3. Add the canonical solution SQL to `tools/solutions.js`.
4. Get the answer hash: `node -e "require('./js/answer.js'); console.log(NullportAnswer.hash('Your Answer'))"`
5. Write the case in `js/cases.js` — briefing, primer, stages, hints, epilogue.
6. `node tools/test-all.cjs`.

Bump `VERSION` in `js/world.js` whenever generation changes, so cached
databases are rebuilt rather than served stale.

## Credits

Inspired by Knight Lab's [SQL Murder Mystery](https://mystery.knightlab.com/)
(Joon Park & Cathy He), itself inspired by
[veltman/clmystery](https://github.com/veltman/clmystery). The city, the cases,
the data model and the code here are original.

Built on [sql.js](https://github.com/sql-js/sql.js) (MIT) and
[CodeMirror 5](https://codemirror.net/5/) (MIT), both vendored in `vendor/`.
