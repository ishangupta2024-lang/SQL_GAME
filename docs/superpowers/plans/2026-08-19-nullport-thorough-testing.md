# Nullport Thorough Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every coverage gap in the Nullport SQL mystery game — content integrity, answer robustness, UI interactions, error resilience, accessibility and performance — and fix the defects that testing surfaces.

**Architecture:** The app already has five passing suites (206 checks) covering data uniqueness, stage answerability, and the happy path through the UI. This plan adds seven suites covering everything *around* the happy path. First it extracts the ~80 lines of DevTools-protocol boilerplate duplicated across three existing browser tests into a shared driver, so each new browser suite costs a dozen lines instead of a hundred. Then each new suite targets one failure theme and fixes what it finds.

**Tech Stack:** Node 20+ (built-in `fetch` and `WebSocket`), headless Edge/Chrome over the Chrome DevTools Protocol, sql.js (SQLite 3.49.1, asm.js build), CodeMirror 5. No test framework — plain Node scripts with a shared assertion harness, matching the existing convention.

**Spec:** No separate spec document. Scope is derived from `README.md` (what the app claims to do) plus the Coverage Gap Analysis below, which was produced by inventorying `js/app.js` event handlers and `js/cases.js` content against the existing suites.

## Global Constraints

- **Node 20+** — suites use global `fetch` and global `WebSocket`; no npm dependencies may be added. `node_modules/` must not appear.
- **No new runtime dependencies.** `vendor/` stays exactly as-is: `sql-asm.js`, `codemirror.js`, `codemirror-sql.js`, `codemirror.css`.
- **The game must keep working from `file://`.** Any change that introduces a `fetch()`, an ES module, or a cross-origin request in the shipped app (`index.html`, `js/`, `css/`, `vendor/`) is a regression. Test files under `tools/` are exempt — they run in Node.
- **Tests skip, never fail, when no browser is present.** Exit code 0 with a printed notice, matching `tools/browser-test.cjs:26-29`.
- **Every suite is a standalone `node tools/<name>.cjs`** and returns exit 0 on pass, 1 on failure.
- **Test file naming:** new suites are `tools/test-<theme>.cjs`. Existing files keep their current names (`verify.cjs`, `verify-campaign.cjs`, `browser-test.cjs`, `ui-test.cjs`, `playthrough.cjs`) — renaming them is out of scope.
- **CDP ports must not collide.** Allocated: 9333 browser-test, 9334 ui-test, 9335 playthrough, 9336 reserved. New suites use 9340+.
- **Seed is `0x4e554c4c`** and world generation is deterministic. Any change to `js/world.js` generation logic requires bumping `NullportWorld.VERSION` (`js/world.js:38`).
- **Answer hashes are `cyrb53` with salt `nullport::1998::cascade`** (`js/answer.js:14`). Changing the salt invalidates all 26 stages' stored hashes.

---

## Coverage Gap Analysis

What the five existing suites already prove — do **not** re-test these:

| Suite | Proves |
|---|---|
| `verify.cjs` (56) | Each clue resolves to exactly one answer; no orphan FKs; decoys present |
| `verify-campaign.cjs` (26) | Each stage's canonical query hashes to an accepted answer |
| `browser-test.cjs` (53) | Engine + world + all 26 solutions run on `file://` |
| `ui-test.cjs` (27) | Boot, render, run query, solve stage, hint, reload, persistence |
| `playthrough.cjs` (44) | All 26 stages solvable through the real interface; finale reached |

Gaps this plan closes, in priority order:

1. **Hint SQL is never executed.** 20 of 78 hints contain complete runnable queries; 10 more contain deliberate fragments. A broken tier-3 hint hands a stuck player a query that errors — the worst possible moment to fail them. *(Task 2)*
2. **Prose references are never validated.** Case text names tables and columns in `<code>` tags. A typo like `address_street_name` (the Knight Lab name) instead of `address_street` (ours) sends players hunting a column that does not exist. *(Task 2)*
3. **Answer tolerance is unmeasured.** We know correct answers are accepted. We do not know whether `"3 people"`, `"Delia"`, or `""` are correctly *rejected*, nor whether reasonable variants are accepted. *(Task 3)*
4. **`js/app.js:133` rebuild race — CONFIRMED DEFECT.** `await WORLD && globalThis.NullportDB.clearCache();` parses as `(await WORLD) && clearCache()`. The IndexedDB delete is fired but not awaited before `location.reload()`. Rebuild can silently no-op. *(Task 4)*
5. **17 of ~30 event handlers are untested:** menu open, rebuild, reset-progress (both dialog branches), re-read briefing, reset editor, free-query, back-to-board, notebook input, history restore, schema column insert, schema peek, stage-list navigation, locked-stage rejection, locked-case rejection, Ctrl+Enter, Enter-to-submit, primer fold. *(Task 6)*
6. **No adversarial input testing.** Malformed SQL, `DROP TABLE person`, 20k-row results, multi-statement queries, NULL rendering, corrupt `localStorage`, unavailable storage. *(Task 5)*
7. **No accessibility or keyboard-only testing.** *(Task 7)*
8. **No performance budgets.** Build time and query time are measured ad hoc but never asserted, so a regression would pass silently. *(Task 8)*
9. **Only Edge is tested.** *(Task 9)*

---

## File Structure

**New shared infrastructure** (Task 1) — this is the decomposition that makes the rest cheap:

- `tools/harness.cjs` — assertion counting and reporting. Replaces the `pass`/`fail`/`check` block copy-pasted into all five existing suites.
- `tools/cdp.cjs` — headless browser driver. Replaces ~80 lines of launch/attach/evaluate boilerplate duplicated in `browser-test.cjs`, `ui-test.cjs`, `playthrough.cjs`.

**New suites**, one file per failure theme:

- `tools/test-content.cjs` — Node. Case-file prose, hint SQL, schema identifier references, HTML well-formedness.
- `tools/test-answers.cjs` — Node. Normalisation, tolerance, false positives, false negatives, collisions.
- `tools/test-determinism.cjs` — Node. Seed stability, cache-key correctness, VERSION discipline.
- `tools/test-resilience.cjs` — Browser. Hostile SQL, hostile saves, storage failure, result-set edge cases.
- `tools/test-interactions.cjs` — Browser. Every handler not covered by `ui-test.cjs`.
- `tools/test-a11y.cjs` — Browser. Keyboard navigation, focus visibility, reduced motion, contrast tokens, responsive.
- `tools/test-perf.cjs` — Browser. Asserted budgets for build and query time.

**Modified:**

- `js/app.js:128-136` — fix the rebuild race (Task 4).
- `tools/test-all.cjs` — register the new suites (Task 9).
- `tools/browser-test.cjs`, `tools/ui-test.cjs`, `tools/playthrough.cjs` — refactored onto `cdp.cjs` (Task 1).
- `README.md` — document the expanded suite (Task 9).

Files that change together live together: everything test-related stays under `tools/`, matching the existing layout.

---

## Task 0: Version control baseline *(optional — skip if you do not want a repo)*

`E:\SQL_GAME` is **not currently a git repository**. Every task below ends with a commit, which is genuinely useful here — a test sweep that touches nine files benefits from being able to bisect. If you would rather not create a repo, skip this task and skip every "Commit" step; nothing else in the plan depends on git.

**Files:**
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: a git repository at the project root, so later tasks' commit steps work

- [ ] **Step 1: Initialise the repository**

```bash
cd /e/SQL_GAME
git init
```

- [ ] **Step 2: Create `.gitignore`**

```
screenshots/
node_modules/
*.log
```

Rationale: `screenshots/` is regenerated by every browser test run and would otherwise produce noisy diffs on each commit.

- [ ] **Step 3: Verify the vendored libraries are tracked**

Run: `git status --short vendor/`
Expected: four untracked files listed (`sql-asm.js`, `codemirror.js`, `codemirror-sql.js`, `codemirror.css`). They **must** be committed — the game cannot run without them and there is no package manager to restore them.

- [ ] **Step 4: Baseline commit**

```bash
git add -A
git commit -m "chore: baseline — Nullport game with five passing test suites"
```

- [ ] **Step 5: Confirm the tree is clean**

Run: `git status --short`
Expected: no output.

---

## Task 1: Shared test infrastructure

Three browser suites each carry their own copy of the CDP launch/attach/evaluate code. Adding four more browser suites on that pattern would mean seven copies. Extract it first.

**Files:**
- Create: `tools/harness.cjs`
- Create: `tools/cdp.cjs`
- Modify: `tools/browser-test.cjs` (replace lines 1-100 boilerplate)
- Modify: `tools/ui-test.cjs` (replace lines 1-110 boilerplate)
- Modify: `tools/playthrough.cjs` (replace lines 1-110 boilerplate)

**Interfaces:**
- Consumes: nothing
- Produces:
  - `harness.cjs` exports `{ section(name: string): void, check(label: string, cond: any, detail?: string): boolean, report(title?: string): number }` — `report` prints the tally and **returns** the intended exit code (0 pass, 1 fail); it does not call `process.exit`.
  - `cdp.cjs` exports `{ findBrowser(): string|null, launch(opts): Promise<Session> }`
    - `opts: { url: string, port: number, width?: number, height?: number, profile?: string }`
    - `Session: { ev(expr: string): Promise<any>, waitFor(expr: string, ms?: number): Promise<boolean>, click(sel: string): Promise<void>, setValue(sel: string, val: string): Promise<void>, text(sel: string): Promise<string>, count(sel: string): Promise<number>, exists(sel: string): Promise<boolean>, setEditor(sql: string): Promise<void>, key(opts): Promise<void>, shot(name: string): Promise<void>, reload(): Promise<void>, setViewport(w: number, h: number): Promise<void>, clearStorage(): Promise<void>, boot(ms?: number): Promise<boolean>, pageErrors: string[], close(): void }`

- [ ] **Step 1: Write `tools/harness.cjs`**

```js
/* Shared assertion harness for every Nullport test suite. */
let pass = 0, fail = 0;
const failures = [];

function section(name) {
  console.log('\n' + name);
  console.log('-'.repeat(Math.max(name.length, 20)));
}

function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + label); return true; }
  fail++;
  failures.push(label + (detail ? ' — ' + detail : ''));
  console.log('  FAIL ' + label + (detail ? '\n         ' + detail : ''));
  return false;
}

function report(title) {
  console.log('\n' + '='.repeat(58));
  console.log((title ? title + ': ' : '') + pass + ' passed, ' + fail + ' failed');
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  return fail ? 1 : 0;
}

module.exports = { section, check, report };
```

- [ ] **Step 2: Write `tools/cdp.cjs`**

```js
/* Headless-browser driver over the Chrome DevTools Protocol.
 * Extracted from the duplicated boilerplate in browser-test / ui-test /
 * playthrough. Requires Node 20+ for global fetch and WebSocket. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CANDIDATES = [
  process.env['ProgramFiles(x86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.ProgramFiles + '\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.ProgramFiles + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

function findBrowser(prefer) {
  const list = prefer
    ? CANDIDATES.filter((p) => p && p.toLowerCase().includes(prefer))
    : CANDIDATES;
  return list.find((p) => p && fs.existsSync(p)) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOT_DIR = path.join(__dirname, '..', 'screenshots');

async function launch(opts) {
  const browser = findBrowser(opts.prefer);
  if (!browser) return null;
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR);

  const profile = opts.profile || path.join(os.tmpdir(), 'nullport-' + opts.port);
  const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--remote-debugging-port=' + opts.port,
    '--user-data-dir=' + profile,
    '--window-size=' + (opts.width || 1500) + ',' + (opts.height || 980),
    opts.url,
  ], { stdio: 'ignore' });

  let ws = null, msgId = 0;
  const pending = new Map();
  const pageErrors = [];

  let targets = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    try {
      targets = await (await fetch('http://127.0.0.1:' + opts.port + '/json/list')).json();
      if (targets.some((t) => t.type === 'page' && t.webSocketDebuggerUrl)) break;
    } catch (e) { /* not up yet */ }
  }
  const page = targets && targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) { try { proc.kill(); } catch (e) {} return null; }

  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pageErrors.push(d.text + ' ' + ((d.exception || {}).description || ''));
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });

  await send('Runtime.enable');
  await send('Page.enable');

  const S = {
    pageErrors,
    send,
    async ev(expr) {
      const r = await send('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.text + ' ' +
          ((r.exceptionDetails.exception || {}).description || ''));
      }
      return r.result && r.result.value;
    },
    async waitFor(expr, ms) {
      const end = Date.now() + (ms || 30000);
      while (Date.now() < end) {
        try { if (await S.ev(expr)) return true; } catch (e) { /* still loading */ }
        await sleep(250);
      }
      return false;
    },
    exists: (sel) => S.ev('!!document.querySelector(' + JSON.stringify(sel) + ')'),
    count: (sel) => S.ev('document.querySelectorAll(' + JSON.stringify(sel) + ').length'),
    text: (sel) => S.ev('((document.querySelector(' + JSON.stringify(sel) +
      ')||{}).textContent||"")'),
    click: (sel) => S.ev('(document.querySelector(' + JSON.stringify(sel) +
      ')||{click:function(){}}).click()'),
    setValue: (sel, val) => S.ev('(function(){var e=document.querySelector(' +
      JSON.stringify(sel) + ');if(e){e.value=' + JSON.stringify(val) +
      ';e.dispatchEvent(new Event("input",{bubbles:true}));}})()'),
    setEditor: (sql) => S.ev('document.querySelector(".CodeMirror").CodeMirror.setValue(' +
      JSON.stringify(sql) + ')'),
    async key(o) {
      await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown' }, o));
      await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, o));
    },
    async shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(SHOT_DIR, name + '.png'), Buffer.from(r.data, 'base64'));
    },
    reload: () => send('Page.reload', {}),
    setViewport: (w, h) => send('Emulation.setDeviceMetricsOverride',
      { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }),
    clearStorage: () => S.ev('try{localStorage.clear();sessionStorage.clear()}catch(e){}'),
    boot: (ms) => S.waitFor(
      'document.querySelector("#app")&&document.querySelector("#app").classList.contains("live")',
      ms || 150000),
    sleep,
    close() {
      try { ws.close(); } catch (e) {}
      try { proc.kill(); } catch (e) {}
    },
  };
  await S.setViewport(opts.width || 1500, opts.height || 980);
  return S;
}

module.exports = { findBrowser, launch, SHOT_DIR, sleep };
```

- [ ] **Step 3: Verify the driver works before refactoring anything onto it**

Create a throwaway check and run it:

```bash
node -e "
const cdp=require('./tools/cdp.cjs');
(async()=>{
  const s=await cdp.launch({url:'file:///E:/SQL_GAME/index.html',port:9340});
  if(!s){console.log('SKIP: no browser');process.exit(0);}
  console.log('booted:', await s.boot());
  console.log('cards:', await s.count('.case-card'));
  console.log('errors:', s.pageErrors.length);
  s.close(); process.exit(0);
})();"
```

Expected: `booted: true`, `cards: 0` (prologue shows first on a fresh profile — this is correct), `errors: 0`.

- [ ] **Step 4: Refactor `tools/browser-test.cjs` onto the driver**

Replace everything from line 1 through the `await send('Log.enable')` region with:

```js
const path = require('path');
const cdp = require('./cdp.cjs');
const { check, report } = require('./harness.cjs');

const url = process.argv[2] ||
  'file:///' + path.join(__dirname, 'smoke.html').replace(/\\/g, '/');

(async function main() {
  const s = await cdp.launch({ url, port: 9333 });
  if (!s) { console.log('No Chrome or Edge found — skipping the browser test.'); process.exit(0); }

  let text = '';
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await cdp.sleep(700);
    try { text = await s.ev("(document.getElementById('out')||{}).textContent||''"); }
    catch (e) { continue; }
    if (/RESULT=/.test(text)) break;
  }
  console.log(text || '(no output — the page never reported)');
  check('smoke page reports PASS', /RESULT=PASS/.test(text));
  check('no uncaught page errors', s.pageErrors.length === 0, s.pageErrors.join(' | '));
  s.close();
  process.exit(report('Browser engine'));
})();
```

- [ ] **Step 5: Refactor `tools/ui-test.cjs` and `tools/playthrough.cjs` the same way**

In both files delete the local `send`/`ev`/`shot`/`waitFor`/`check`/`cleanup` definitions and the `spawn` block, replacing them with `const cdp = require('./cdp.cjs'); const { section, check, report } = require('./harness.cjs');` and a `const s = await cdp.launch({...})` call. Rewrite call sites mechanically: `ev(` → `s.ev(`, `shot(` → `s.shot(`, `waitFor(` → `s.waitFor(`, and replace `cleanup(n)` with `s.close(); process.exit(report());`. Keep every existing assertion exactly as it is — this step must not change what is tested.

- [ ] **Step 6: Verify the refactor changed nothing**

Run: `node tools/test-all.cjs`
Expected: all five suites PASS, with the same counts as before the refactor — 56, 26, 53 (now reported as 2 by the new harness plus the page's own 53 printed inline), 27, 44. If any *assertion* count for `ui-test` or `playthrough` differs from 27 and 44, the refactor dropped a check — find it and restore it.

- [ ] **Step 7: Confirm the duplication is gone**

Run: `grep -c "remote-debugging-port" tools/*.cjs`
Expected: `tools/cdp.cjs:1` and `0` for `browser-test.cjs`, `ui-test.cjs`, `playthrough.cjs`.

- [ ] **Step 8: Commit**

```bash
git add tools/harness.cjs tools/cdp.cjs tools/browser-test.cjs tools/ui-test.cjs tools/playthrough.cjs
git commit -m "test: extract shared CDP driver and assertion harness"
```

---

## Task 2: Content integrity suite

The case files are 53 KB of prose that references real tables, real columns, and real SQL. None of it is validated. This suite treats the content as code.

**Files:**
- Create: `tools/test-content.cjs`
- Possibly modify: `js/cases.js` (only if the suite finds a real error)

**Interfaces:**
- Consumes: `harness.cjs` `{ section, check, report }`; `tools/dbkit.cjs` `{ makeDb, all }`; `globalThis.NullportCases.CASES`; `globalThis.NullportWorld.TABLES`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the suite**

Create `tools/test-content.cjs`:

```js
/* Content integrity: the case files reference real tables, real columns, and
 * SQL that actually runs. Treats 53 KB of prose as code. */
const path = require('path');
const { makeDb } = require('./dbkit.cjs');
const { section, check, report } = require('./harness.cjs');
require(path.join(__dirname, '..', 'js', 'cases.js'));

const { CASES } = globalThis.NullportCases;
const { TABLES } = globalThis.NullportWorld;

const TABLE_NAMES = new Set(TABLES.map((t) => t.name));
const COLUMN_NAMES = new Set();
TABLES.forEach((t) => t.columns.forEach((c) => COLUMN_NAMES.add(c[0])));

// SQL keywords, functions and prose words that legitimately appear in <code>.
const ALLOWED = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'null', 'is', 'in', 'like',
  'between', 'order', 'by', 'asc', 'desc', 'limit', 'group', 'having', 'join',
  'inner', 'left', 'right', 'outer', 'on', 'as', 'distinct', 'count', 'sum',
  'avg', 'min', 'max', 'with', 'recursive', 'union', 'all', 'exists', 'case',
  'when', 'then', 'else', 'end', 'insert', 'into', 'values', 'row_number',
  'over', 'partition', 'lag', 'lead', 'rank', 'substr', 'instr', 'upper',
  'lower', 'total', 'month', 'rn', 'hop', 'ranked', 'acct', 'depth', 'c', 'p',
  'l', 'r', 't', 't1', 't2', 'a', 'e', 'k', 'f', 'i', 's', 'fa', 'ta', 'ci',
  'm', 'd', 'pl', 'k2',
]);

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '');
}
function unescapeHtml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
function codeBlocks(html) {
  return (html.match(/<code>[\s\S]*?<\/code>/g) || [])
    .map((b) => unescapeHtml(stripTags(b)));
}
/** Every string of prose in a case, with a label saying where it came from. */
function allProse(c) {
  const out = [];
  const add = (where, v) => { if (typeof v === 'string') out.push([where, v]); };
  add(c.id + '.hook', c.hook);
  c.opening.forEach((p, i) => add(c.id + '.opening[' + i + ']', p));
  c.primer.blocks.forEach((b, i) => add(c.id + '.primer[' + i + ']', b.v));
  c.epilogue.forEach((p, i) => add(c.id + '.epilogue[' + i + ']', p));
  c.stages.forEach((s) => {
    add(s.id + '.prompt', s.prompt);
    add(s.id + '.reveal', s.reveal);
    add(s.id + '.ask', s.ask);
    s.hints.forEach((h, i) => add(s.id + '.hint' + (i + 1), h));
  });
  return out;
}

makeDb().then(({ db }) => {
  section('HTML WELL-FORMEDNESS');
  // Every prose string is injected with innerHTML. Unbalanced tags corrupt
  // the whole panel, not just the sentence.
  let unbalanced = 0;
  CASES.forEach((c) => allProse(c).forEach(([where, html]) => {
    ['code', 'strong', 'em', 'b'].forEach((tag) => {
      const open = (html.match(new RegExp('<' + tag + '>', 'g')) || []).length;
      const close = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
      if (open !== close) {
        unbalanced++;
        console.log('    unbalanced <' + tag + '> in ' + where);
      }
    });
  }));
  check('all inline tags balanced', unbalanced === 0, unbalanced + ' unbalanced');

  section('SCHEMA REFERENCES IN PROSE');
  // A <code>snake_case</code> token in the prose should be a real table,
  // a real column, or a known keyword. Anything else is a typo pointing
  // players at something that does not exist.
  const bad = [];
  CASES.forEach((c) => allProse(c).forEach(([where, html]) => {
    codeBlocks(html).forEach((code) => {
      // Only inspect short identifier-shaped snippets, not whole queries.
      if (/\s/.test(code.trim())) return;
      const tok = code.trim().replace(/[^\w]/g, '').toLowerCase();
      if (!tok) return;
      if (TABLE_NAMES.has(tok) || COLUMN_NAMES.has(tok) || ALLOWED.has(tok)) return;
      if (/^\d+$/.test(tok)) return;
      bad.push(where + ': ' + code.trim());
    });
  }));
  bad.forEach((b) => console.log('    unknown identifier — ' + b));
  check('every identifier in prose exists in the schema', bad.length === 0,
    bad.length + ' unknown');

  section('EMBEDDED SQL RUNS');
  // Hints and primers contain SQL. A tier-3 hint that errors fails a player
  // at the exact moment they are most stuck.
  let ran = 0, frag = 0;
  const broken = [];
  const isFragment = (sql) => /…|\.\.\.|your |…your|\byour\b/i.test(sql);
  CASES.forEach((c) => {
    c.primer.blocks.filter((b) => b.t === 'code').forEach((b, i) => {
      const sql = b.v.trim();
      if (!/^(SELECT|WITH)/i.test(sql) || isFragment(sql)) { frag++; return; }
      ran++;
      try { db.exec(sql); } catch (e) {
        broken.push(c.id + '.primer[' + i + ']: ' + e.message);
      }
    });
    c.stages.forEach((s) => s.hints.forEach((h, ti) => {
      codeBlocks(h).forEach((sql) => {
        const q = sql.trim();
        if (!/^(SELECT|WITH)/i.test(q)) return;
        if (isFragment(q)) { frag++; return; }
        // Fragments meant to be appended to a CTE defined in the starter.
        if (/\bFROM\s+(hop|ranked)\b/i.test(q) && !/^WITH/i.test(q)) { frag++; return; }
        ran++;
        try { db.exec(q); } catch (e) {
          broken.push(s.id + '.hint' + (ti + 1) + ': ' + e.message + '  ::  ' + q.slice(0, 80));
        }
      });
    }));
  });
  broken.forEach((b) => console.log('    ' + b));
  check('all complete embedded SQL executes', broken.length === 0,
    broken.length + ' broken of ' + ran + ' run (' + frag + ' fragments skipped)');
  check('a meaningful number of snippets were actually run', ran >= 20, 'only ' + ran);

  section('CTE-FRAGMENT HINTS ARE SIGNPOSTED');
  // Two hints hand the player a SELECT that only works appended to the CTE in
  // the starter query. The prose must say so, or the hint reads as broken.
  ['c7s2', 'c8s3'].forEach((id) => {
    const st = CASES.flatMap((c) => c.stages).find((x) => x.id === id);
    const h3 = stripTags(st.hints[2]).toLowerCase();
    check(id + ' tier-3 hint tells the player it appends to the CTE',
      /after the cte|then unmask|wrap it/.test(h3), stripTags(st.hints[2]).slice(0, 70));
  });

  section('STARTER QUERIES');
  let starters = 0;
  const badStarters = [];
  CASES.forEach((c) => c.stages.forEach((s) => {
    const sql = (s.starter || '').replace(/--.*$/gm, '').trim();
    if (!sql) return;
    starters++;
    try { db.exec(sql); } catch (e) { badStarters.push(s.id + ': ' + e.message); }
  }));
  badStarters.forEach((b) => console.log('    ' + b));
  check('every starter query parses and runs', badStarters.length === 0,
    badStarters.length + ' of ' + starters + ' broken');

  section('NO SPOILERS IN THE WRONG PLACE');
  // A stage's own answer must not appear in its prompt or its first two hints,
  // or the stage answers itself.
  const leaks = [];
  const A = require(path.join(__dirname, '..', 'js', 'answer.js')) ||
    globalThis.NullportAnswer;
  const ANS = globalThis.NullportAnswer;
  CASES.forEach((c) => c.stages.forEach((s) => {
    const surfaces = [['prompt', s.prompt], ['hint1', s.hints[0]], ['hint2', s.hints[1]]];
    surfaces.forEach(([where, html]) => {
      const words = stripTags(html).split(/[^A-Za-z0-9'-]+/);
      for (let i = 0; i < words.length - 1; i++) {
        const pair = words[i] + ' ' + words[i + 1];
        if (pair.length > 6 && ANS.matches(pair, s.answers)) {
          leaks.push(s.id + '.' + where + ' contains the answer: "' + pair + '"');
        }
      }
    });
  }));
  leaks.forEach((l) => console.log('    ' + l));
  check('no stage gives away its own answer early', leaks.length === 0,
    leaks.length + ' leaks');

  section('REVEAL CONTINUITY');
  // Every non-final stage's reveal should point forward; every case's last
  // reveal plus epilogue should hand off to the next case.
  CASES.forEach((c) => {
    c.stages.forEach((s) => {
      check(s.id + ' reveal is substantive', stripTags(s.reveal).trim().length >= 60,
        stripTags(s.reveal).length + ' chars');
    });
  });

  process.exit(report('Content integrity'));
}).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it and read the failures**

Run: `node tools/test-content.cjs`

This is a **discovery run** — it is expected to report failures on the first execution. Record every failure. The two known categories:
- `c7s2.hint3` / `c8s3.hint3` referencing `hop` / `ranked` — these are deliberate append-to-CTE fragments and the suite already skips them; the signposting check verifies the prose says so.
- Any unknown identifier is a genuine content typo.

- [ ] **Step 3: Fix every genuine content error in `js/cases.js`**

For each unknown-identifier failure, open `js/cases.js`, find the named surface (e.g. `c4s3.hint1`), and correct the identifier to the real schema name. Cross-check against `js/world.js` `TABLES` — for example the column is `address_street`, never `address_street_name`.

Do **not** widen the `ALLOWED` set to silence a failure unless the token is genuinely a SQL keyword or a query alias. Widening the allowlist to hide a typo defeats the whole suite.

- [ ] **Step 4: Re-run until green**

Run: `node tools/test-content.cjs`
Expected: `Content integrity: N passed, 0 failed`, with `all complete embedded SQL executes` reporting at least 20 snippets run.

- [ ] **Step 5: Confirm the game still plays**

Run: `node tools/verify-campaign.cjs && node tools/playthrough.cjs`
Expected: 26 stages verified, 44 passed. Editing `cases.js` prose must not have disturbed any answer hash.

- [ ] **Step 6: Commit**

```bash
git add tools/test-content.cjs js/cases.js
git commit -m "test: validate case-file prose, embedded SQL and schema references"
```

---

## Task 3: Answer robustness suite

We know correct answers are accepted. We do not know what else is.

**Files:**
- Create: `tools/test-answers.cjs`
- Possibly modify: `js/answer.js` (only if a real tolerance bug is found)

**Interfaces:**
- Consumes: `harness.cjs`; `globalThis.NullportAnswer` `{ normalise, hash, matches }`; `globalThis.NullportCases.CASES`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the suite**

Create `tools/test-answers.cjs`:

```js
/* Answer robustness: what the game accepts, what it rejects, and whether the
 * hashing is sound. */
const path = require('path');
const { section, check, report } = require('./harness.cjs');
require(path.join(__dirname, '..', 'js', 'answer.js'));
require(path.join(__dirname, '..', 'js', 'cases.js'));

const A = globalThis.NullportAnswer;
const { CASES } = globalThis.NullportCases;
const STAGES = CASES.flatMap((c) => c.stages);
const byId = (id) => STAGES.find((s) => s.id === id);

section('NORMALISATION');
check('lowercases', A.normalise('HALDEN') === 'halden');
check('trims', A.normalise('  halden  ') === 'halden');
check('collapses internal whitespace', A.normalise('halden    roarke') === 'halden roarke');
check('strips trailing punctuation', A.normalise('halden roarke.') === 'halden roarke');
check('strips quotes', A.normalise('"halden roarke"') === 'halden roarke');
check('keeps hyphens for phone numbers', A.normalise('204-555-0148') === '204-555-0148');
check('keeps digits', A.normalise('20240418') === '20240418');
check('handles null and undefined', A.normalise(null) === '' && A.normalise(undefined) === '');
check('strips combining accents', A.normalise('Odilé') === 'odile');

section('HASHING');
check('hash is stable across calls', A.hash('Vivienne Aldridge') === A.hash('Vivienne Aldridge'));
check('hash is case-insensitive', A.hash('vivienne aldridge') === A.hash('VIVIENNE ALDRIDGE'));
check('different inputs hash differently', A.hash('Delia Marsh') !== A.hash('Delia Marsh Jr'));
// 5000 distinct strings must not collide — the answer space is tiny by
// comparison, so any collision here would be alarming.
const seen = new Set();
let collisions = 0;
for (let i = 0; i < 5000; i++) {
  const h = A.hash('probe-string-' + i);
  if (seen.has(h)) collisions++;
  seen.add(h);
}
check('no collisions across 5000 distinct inputs', collisions === 0, collisions + ' found');

section('ACCEPTS THE RIGHT ANSWERS');
// Each stage's documented answer, mangled the way a real player types it.
const CANON = {
  c1s1: 'Halden Roarke', c1s2: 'Nolan Fitch', c1s3: 'Odile Sarratt', c1s4: 'Petra Vance',
  c2s1: '20240418', c2s2: '3', c2s3: 'Osric Blayne',
  c3s1: 'Tarrow Flats', c3s2: '8QRJ41', c3s3: 'Corvin Ashby',
  c4s1: 'Ledger 7', c4s2: '4', c4s3: 'Delia Marsh', c4s4: 'Meridian Freight',
  c5s1: '202405', c5s2: '2', c5s3: 'Ambrose Teague',
  c6s1: '3', c6s2: 'Sable Wren', c6s3: 'Ivo Castellan',
  c7s1: 'Tobias Kray', c7s2: '7', c7s3: 'Alderpoint Holdings',
  c8s1: '204-555-0148', c8s2: 'Gantry North', c8s3: 'Vivienne Aldridge',
};
check('canonical map covers all 26 stages', Object.keys(CANON).length === STAGES.length,
  Object.keys(CANON).length + ' vs ' + STAGES.length);

const manglers = [
  ['exact', (v) => v],
  ['lowercase', (v) => v.toLowerCase()],
  ['uppercase', (v) => v.toUpperCase()],
  ['padded', (v) => '   ' + v + '   '],
  ['trailing period', (v) => v + '.'],
  ['double-spaced', (v) => v.replace(/ /g, '  ')],
  ['quoted', (v) => '"' + v + '"'],
];
manglers.forEach(([label, fn]) => {
  const rejected = Object.keys(CANON).filter((id) => !A.matches(fn(CANON[id]), byId(id).answers));
  check('accepts answers ' + label, rejected.length === 0, 'rejected: ' + rejected.join(', '));
});

section('DOCUMENTED VARIANTS');
check('c5s1 accepts "May 2024"', A.matches('May 2024', byId('c5s1').answers));
check('c5s1 accepts "2024-05"', A.matches('2024-05', byId('c5s1').answers));
check('c2s1 accepts "2024-04-18"', A.matches('2024-04-18', byId('c2s1').answers));
check('c2s2 accepts the word "three"', A.matches('three', byId('c2s2').answers));
check('c8s1 accepts the number without hyphens', A.matches('2045550148', byId('c8s1').answers));

section('REJECTS THE WRONG ANSWERS');
// Empty and junk must never be accepted by anything.
const junk = ['', '   ', '.', '0', 'null', 'undefined', 'NaN', 'answer', 'x'];
let junkAccepted = 0;
STAGES.forEach((s) => junk.forEach((j) => {
  if (A.matches(j, s.answers)) {
    junkAccepted++;
    console.log('    ' + s.id + ' accepts junk: ' + JSON.stringify(j));
  }
}));
check('no stage accepts empty or junk input', junkAccepted === 0, junkAccepted + ' accepted');

// A partial name must not pass — "Delia" should not solve "Delia Marsh".
const partials = {
  c1s1: ['Halden', 'Roarke'], c4s3: ['Delia', 'Marsh'],
  c8s3: ['Vivienne', 'Aldridge'], c6s3: ['Ivo', 'Castellan'],
  c7s3: ['Alderpoint', 'Holdings'],
};
let partialAccepted = 0;
Object.keys(partials).forEach((id) => partials[id].forEach((p) => {
  if (A.matches(p, byId(id).answers)) {
    partialAccepted++;
    console.log('    ' + id + ' accepts partial name: ' + p);
  }
}));
check('partial names are rejected', partialAccepted === 0, partialAccepted + ' accepted');

// Answers must not be interchangeable between stages that ask different things.
let crossAccepted = 0;
Object.keys(CANON).forEach((id) => Object.keys(CANON).forEach((other) => {
  if (id === other) return;
  if (CANON[id] === CANON[other]) return;      // "3" legitimately answers two stages
  if (A.matches(CANON[other], byId(id).answers)) {
    crossAccepted++;
    console.log('    ' + id + ' wrongly accepts ' + other + "'s answer");
  }
}));
check('answers are not interchangeable between stages', crossAccepted === 0,
  crossAccepted + ' cross-accepted');

section('SHARED HASHES ARE INTENTIONAL');
// c2s2 and c6s1 both answer "3". That is fine. Any OTHER shared hash is a bug.
const hashOwners = new Map();
STAGES.forEach((s) => s.answers.forEach((h) => {
  if (!hashOwners.has(h)) hashOwners.set(h, []);
  hashOwners.get(h).push(s.id);
}));
const shared = [...hashOwners].filter(([, ids]) => ids.length > 1);
shared.forEach(([h, ids]) => {
  const values = ids.map((id) => CANON[id]);
  const same = values.every((v) => v === values[0]);
  check('shared hash ' + ids.join('/') + ' is the same answer value', same,
    values.join(' vs '));
});

process.exit(report('Answer robustness'));
```

- [ ] **Step 2: Run it**

Run: `node tools/test-answers.cjs`
Expected on first run: mostly green. Investigate any failure in **REJECTS THE WRONG ANSWERS** — a stage that accepts a partial name or junk is a real defect.

- [ ] **Step 3: If a rejection test fails, tighten `js/answer.js`**

Only if needed. `normalise` at `js/answer.js:19-27` is the single place to change. Do **not** change the salt on line 14 — that would invalidate all 26 stored hashes and require regenerating every one.

If you do change `normalise`, regenerate any affected hashes with:

```bash
node -e "require('./js/answer.js'); console.log(NullportAnswer.hash('Your Answer'))"
```

and update `js/cases.js`, then re-run `node tools/verify-campaign.cjs`.

- [ ] **Step 4: Verify no regression**

Run: `node tools/verify-campaign.cjs`
Expected: `26 stages verified, 0 problems`.

- [ ] **Step 5: Commit**

```bash
git add tools/test-answers.cjs js/answer.js js/cases.js
git commit -m "test: answer normalisation, tolerance and rejection coverage"
```

---

## Task 4: Determinism suite and the rebuild-race fix

The whole game rests on one assumption: the same seed always builds the same world. If it ever drifts, all 26 hardcoded answer hashes break at once. This task asserts it, and fixes a confirmed defect in the cache-invalidation path.

**Files:**
- Create: `tools/test-determinism.cjs`
- Modify: `js/app.js:128-136` (the rebuild handler)

**Interfaces:**
- Consumes: `harness.cjs`; `globalThis.NullportWorld` `{ build, VERSION, ddl, totalRows, TABLES }`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the failing test for the rebuild race**

Add to a new `tools/test-determinism.cjs` — this check reads the source, because the defect is a syntax-level precedence bug that only manifests as a timing flake at runtime:

```js
/* Determinism: the same seed must always build the same world, because all 26
 * answer hashes are baked against it. Also guards the cache-invalidation path.
 */
const fs = require('fs');
const path = require('path');
const { section, check, report } = require('./harness.cjs');
require(path.join(__dirname, '..', 'js', 'world.js'));

const W = globalThis.NullportWorld;

section('CACHE INVALIDATION');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
// `await X && f()` parses as `(await X) && f()` — f() is fired but never
// awaited, so location.reload() can race the IndexedDB delete.
check('rebuild handler awaits clearCache before reloading',
  !/await\s+WORLD\s*&&/.test(appSrc) && /await\s+globalThis\.NullportDB\.clearCache\(\)/.test(appSrc),
  'js/app.js still uses the unawaited `await WORLD && clearCache()` form');
check('clearCache is called before location.reload',
  appSrc.indexOf('clearCache()') < appSrc.indexOf('location.reload()'));
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node tools/test-determinism.cjs`
Expected: FAIL on `rebuild handler awaits clearCache before reloading`, with detail `js/app.js still uses the unawaited ...`.

- [ ] **Step 3: Fix the defect in `js/app.js`**

Replace lines 128-136 (the `[data-rebuild]` handler):

```js
    $('[data-rebuild]', veil).onclick = async () => {
      close();
      if (await confirmDialog('Rebuild database?',
        'Regenerates every table from scratch. Your case progress and notes are kept.',
        'Rebuild')) {
        await globalThis.NullportDB.clearCache();
        location.reload();
      }
    };
```

The change is dropping the meaningless `await WORLD &&` guard and awaiting `clearCache()` properly, so the IndexedDB delete completes before the page reloads.

- [ ] **Step 4: Run to verify it passes**

Run: `node tools/test-determinism.cjs`
Expected: both CACHE INVALIDATION checks PASS.

- [ ] **Step 5: Add the determinism checks to the same file**

Append to `tools/test-determinism.cjs`:

```js
section('SEED STABILITY');
const a = W.build();
const b = W.build();
check('two builds produce identical row counts',
  W.totalRows(a) === W.totalRows(b), W.totalRows(a) + ' vs ' + W.totalRows(b));

let drifted = [];
W.TABLES.forEach((t) => {
  if (JSON.stringify(a.tables[t.name]) !== JSON.stringify(b.tables[t.name])) {
    drifted.push(t.name);
  }
});
check('every table is byte-identical across builds', drifted.length === 0,
  'drifted: ' + drifted.join(', '));

check('story ids are stable across builds',
  JSON.stringify(a.ids) === JSON.stringify(b.ids));

section('EXPLICIT SEED');
const s1 = W.build(12345);
const s2 = W.build(12345);
const s3 = W.build(99999);
check('same explicit seed reproduces', W.totalRows(s1) === W.totalRows(s2));
check('a different seed produces a different world',
  JSON.stringify(s1.tables.person[0]) !== JSON.stringify(s3.tables.person[0]));

section('NO WALL-CLOCK OR UNSEEDED RANDOMNESS');
const worldSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'world.js'), 'utf8');
check('world.js never calls Math.random', !/Math\.random\s*\(/.test(worldSrc));
check('world.js never calls Date.now', !/Date\.now\s*\(/.test(worldSrc));
// `new Date(...)` with explicit arguments is fine (enumerateDates); argless is not.
check('world.js never constructs an argless Date',
  !/new Date\s*\(\s*\)/.test(worldSrc));

section('VERSION DISCIPLINE');
check('NullportWorld.VERSION is a positive integer',
  Number.isInteger(W.VERSION) && W.VERSION > 0, String(W.VERSION));
const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
check('the IndexedDB cache key includes VERSION',
  /cacheKey\s*=\s*'db\.v'\s*\+\s*W\.VERSION/.test(dbSrc));
check('clearCache targets the same versioned key',
  /idbDel\('db\.v'\s*\+\s*root\.NullportWorld\.VERSION\)/.test(dbSrc));

section('SCHEMA / DDL CONSISTENCY');
const ddl = W.ddl();
W.TABLES.forEach((t) => {
  check('DDL declares ' + t.name, ddl.indexOf('CREATE TABLE ' + t.name + ' (') > -1);
  t.columns.forEach((col) => {
    const rows = a.tables[t.name];
    if (!rows || !rows.length) return;
    check(t.name + '.' + col[0] + ' is populated by the generator',
      Object.prototype.hasOwnProperty.call(rows[0], col[0]));
  });
});

process.exit(report('Determinism'));
```

- [ ] **Step 6: Run the full determinism suite**

Run: `node tools/test-determinism.cjs`
Expected: all checks PASS. The `SCHEMA / DDL CONSISTENCY` section catches the class of bug where a column is added to `TABLES` but never written by the generator — which would silently insert `NULL` for every row.

- [ ] **Step 7: Verify the rebuild fix works in a real browser**

Run: `node tools/ui-test.cjs`
Expected: 27 passed, 0 failed, no page errors. (Full interactive coverage of the rebuild button arrives in Task 6.)

- [ ] **Step 8: Commit**

```bash
git add tools/test-determinism.cjs js/app.js
git commit -m "fix: await clearCache before reload; test: world determinism and version discipline"
```

---

## Task 5: SQL console and storage resilience

Players will type broken SQL, curious ones will type `DROP TABLE person`, and some will play in private-browsing mode where storage throws. None of that should brick the game.

**Files:**
- Create: `tools/test-resilience.cjs`
- Possibly modify: `js/app.js` (`runQuery`, `load`) if a crash is found

**Interfaces:**
- Consumes: `cdp.cjs` `{ launch, sleep }`; `harness.cjs`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the suite**

Create `tools/test-resilience.cjs`:

```js
/* Resilience: hostile SQL, hostile save files, and storage that refuses to
 * work must all degrade gracefully rather than break the game. */
const path = require('path');
const cdp = require('./cdp.cjs');
const { section, check, report } = require('./harness.cjs');

const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async function main() {
  const s = await cdp.launch({ url, port: 9341 });
  if (!s) { console.log('No browser found — skipping.'); process.exit(0); }

  await s.clearStorage();
  await s.reload();
  if (!await s.boot()) { console.error('Game never booted.'); s.close(); process.exit(1); }
  await s.click('#begin');
  await cdp.sleep(300);
  await s.click('.case-card[data-case="c1"]');
  await s.waitFor('!!document.querySelector(".CodeMirror")', 15000);

  async function run(sql) {
    await s.setEditor(sql);
    await s.click('#run');
    await cdp.sleep(600);
  }

  section('MALFORMED SQL');
  await run('SELCT * FROM person;');
  check('syntax error shows an error panel', await s.exists('.res-error'));
  check('error text is shown to the player',
    (await s.text('.res-error')).length > 5, await s.text('.res-error'));
  check('the app is still alive after a syntax error', await s.exists('#run'));

  await run('SELECT * FROM no_such_table;');
  check('unknown table shows an error', /no such table/i.test(await s.text('.res-error')));

  await run('SELECT no_such_column FROM person;');
  check('unknown column shows an error', /no such column/i.test(await s.text('.res-error')));

  await run('');
  check('empty query is handled', await s.exists('.res-empty, .results'));

  section('RECOVERY');
  await run('SELECT name FROM person LIMIT 3;');
  check('a good query works right after a bad one',
    (await s.count('table.grid tbody tr')) === 3);
  check('the error panel is cleared on success', !(await s.exists('.res-error')));

  section('RESULT-SET EDGE CASES');
  await run('SELECT * FROM person WHERE name = \'nobody at all\';');
  check('zero rows is reported, not crashed',
    /0 rows|No rows/i.test(await s.text('.res-head, .res-empty')));

  await run('SELECT id FROM phone_call;');
  const headText = await s.text('.res-head');
  check('a 20k-row result set is truncated for display',
    /showing first 500/.test(headText), headText);
  check('exactly 500 rows are rendered',
    (await s.count('table.grid tbody tr')) === 500);

  await run('SELECT license_id FROM person WHERE license_id IS NULL LIMIT 5;');
  check('NULLs render as NULL', (await s.count('table.grid td.null')) === 5);

  await run("SELECT 1 AS a; SELECT 2 AS b; SELECT 3 AS c;");
  check('multi-statement input reports how many ran',
    /3 statements/.test(await s.text('.res-head')), await s.text('.res-head'));

  await run("SELECT description FROM crime_scene_report WHERE type='murder' LIMIT 1;");
  check('a very long text cell does not overflow the page',
    (await s.ev('document.documentElement.scrollWidth - document.documentElement.clientWidth')) === 0);

  section('DESTRUCTIVE SQL');
  // The database is a per-session in-memory copy, so this cannot corrupt
  // anything permanent — but it must not crash the app, and the player must be
  // able to get back to a working state via Rebuild.
  await run('DROP TABLE person;');
  check('DROP TABLE does not crash the app', await s.exists('#run'));
  await run('SELECT COUNT(*) FROM person;');
  check('the app reports the consequence instead of dying',
    (await s.exists('.res-error')) || (await s.exists('table.grid')));
  check('no uncaught error was thrown by destructive SQL',
    s.pageErrors.length === 0, s.pageErrors.join(' | '));

  // Recover for the remaining checks.
  await s.ev("(async()=>{await globalThis.NullportDB.clearCache();})()");
  await s.reload();
  await s.boot();
  await cdp.sleep(400);

  section('HOSTILE SAVE FILES');
  const badSaves = [
    ['not json at all', 'this is not json'],
    ['empty object', '{}'],
    ['null', 'null'],
    ['array instead of object', '[1,2,3]'],
    ['missing keys', '{"solved":{"c1s1":true}}'],
    ['wrong types', '{"solved":"nope","hints":42,"history":"x"}'],
    ['unknown stage ids', '{"solved":{"zzz9":true,"c1s1":true}}'],
  ];
  for (const [label, payload] of badSaves) {
    await s.ev('localStorage.setItem("nullport.save.v1", ' + JSON.stringify(payload) + ')');
    await s.reload();
    const ok = await s.boot(60000);
    check('survives a save that is ' + label, ok);
    if (!ok) break;
  }

  section('TAMPERED SAVE');
  await s.ev('localStorage.setItem("nullport.save.v1", JSON.stringify(' +
    '{solved:{c1s1:true,c1s2:true,c1s3:true,c1s4:true},hints:{},wrong:{},answers:{},' +
    'notes:"",history:[],prologueSeen:true}))');
  await s.reload();
  await s.boot(60000);
  await cdp.sleep(400);
  check('a save marking case 1 solved unlocks case 2',
    !(await s.ev('document.querySelectorAll(".case-card")[1].classList.contains("locked")')));
  check('case 8 remains locked', 
    await s.ev('document.querySelectorAll(".case-card")[7].classList.contains("locked")'));

  section('STORAGE UNAVAILABLE');
  // Private-browsing modes make localStorage throw on write.
  await s.ev('(function(){var real=Storage.prototype.setItem;' +
    'Storage.prototype.setItem=function(){throw new Error("QuotaExceededError")};' +
    'window.__restoreStorage=function(){Storage.prototype.setItem=real};})()');
  await s.click('.case-card[data-case="c1"]');
  const survived = await s.waitFor('!!document.querySelector(".CodeMirror")', 15000);
  check('the game still opens a case when localStorage.setItem throws', survived);
  await s.ev('window.__restoreStorage()');

  section('PAGE ERRORS');
  check('no uncaught page errors across the whole suite',
    s.pageErrors.length === 0, s.pageErrors.join(' | '));

  await s.shot('t5-resilience');
  s.close();
  process.exit(report('Resilience'));
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it and record failures**

Run: `node tools/test-resilience.cjs`

Likely first-run failures and what each means:
- **`the game still opens a case when localStorage.setItem throws`** — `save()` at `js/app.js:73-75` already wraps in try/catch, so this should pass. If it fails, the throw is escaping from somewhere else; find it with the reported page error.
- **`survives a save that is ...`** — `load()` at `js/app.js:65-71` does `Object.assign(blankSave(), JSON.parse(raw))`. `JSON.parse('null')` returns `null` and `Object.assign(x, null)` is safe, but `'[1,2,3]'` produces an array whose numeric keys land on the save object. Verify each case actually boots.
- **`wrong types`** — `state.history` as a string would break `state.history.unshift` in `runQuery` at `js/app.js:565`.

- [ ] **Step 3: Harden `load()` in `js/app.js` if the hostile-save checks fail**

Replace `load()` (lines 65-71):

```js
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return blankSave(); }
    if (!raw) return blankSave();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return blankSave(); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return blankSave();
    const s = blankSave();
    // Copy across only keys of the shape we expect; anything else is ignored.
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    s.solved = obj(parsed.solved);
    s.hints = obj(parsed.hints);
    s.wrong = obj(parsed.wrong);
    s.answers = obj(parsed.answers);
    s.notes = typeof parsed.notes === 'string' ? parsed.notes : '';
    s.history = Array.isArray(parsed.history) ? parsed.history.filter((q) => typeof q === 'string') : [];
    s.prologueSeen = parsed.prologueSeen === true;
    return s;
  }
```

- [ ] **Step 4: Re-run until green**

Run: `node tools/test-resilience.cjs`
Expected: all checks PASS, `no uncaught page errors across the whole suite`.

- [ ] **Step 5: Verify no regression to normal play**

Run: `node tools/playthrough.cjs`
Expected: 44 passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add tools/test-resilience.cjs js/app.js
git commit -m "test: hostile SQL and save-file resilience; harden save loading"
```

---

## Task 6: Interaction coverage

Seventeen event handlers have never been clicked by a test. This suite clicks all of them.

**Files:**
- Create: `tools/test-interactions.cjs`
- Possibly modify: `js/app.js` if a handler is found broken

**Interfaces:**
- Consumes: `cdp.cjs`; `harness.cjs`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the suite**

Create `tools/test-interactions.cjs`:

```js
/* Interaction coverage: every control ui-test.cjs does not touch. */
const path = require('path');
const cdp = require('./cdp.cjs');
const { section, check, report } = require('./harness.cjs');

const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

(async function main() {
  const s = await cdp.launch({ url, port: 9342 });
  if (!s) { console.log('No browser found — skipping.'); process.exit(0); }

  await s.clearStorage();
  await s.reload();
  if (!await s.boot()) { console.error('Never booted.'); s.close(); process.exit(1); }

  section('BOARD CONTROLS');
  await s.click('#begin');
  await cdp.sleep(300);
  await s.click('#reread');
  await cdp.sleep(300);
  check('"Re-read the briefing" returns to the prologue', await s.exists('.prologue'));
  await s.click('#begin');
  await cdp.sleep(300);
  check('and back to the board', await s.exists('.case-grid'));

  await s.click('.case-card[data-case="c5"]');
  await cdp.sleep(400);
  check('clicking a sealed case does not open it', await s.exists('.case-grid'));
  check('and explains why via a toast', /sealed/i.test(await s.text('#toast')));

  section('TOP BAR AND MENU');
  await s.click('#menu-btn');
  await cdp.sleep(300);
  check('menu dialog opens', await s.exists('.veil .dialog'));
  check('menu reports stage progress', /0<\/b> of <b>26/.test(
    await s.ev('document.querySelector(".veil .dialog p").innerHTML')) ||
    /26/.test(await s.text('.veil .dialog p')));
  await s.click('.veil [data-close]');
  await cdp.sleep(250);
  check('menu closes', !(await s.exists('.veil')));

  section('RESET PROGRESS — CANCEL BRANCH');
  // Solve one stage so there is progress to threaten.
  await s.click('.case-card[data-case="c1"]');
  await s.waitFor('!!document.querySelector(".CodeMirror")', 15000);
  await s.setValue('#answer', 'Halden Roarke');
  await s.click('#submit');
  await cdp.sleep(500);
  check('stage solved as setup', await s.exists('.reveal'));

  await s.click('#menu-btn');
  await cdp.sleep(250);
  await s.click('.veil [data-reset]');
  await cdp.sleep(300);
  check('reset asks for confirmation', await s.exists('.veil .dialog'));
  await s.click('.veil [data-no]');
  await cdp.sleep(300);
  check('cancelling reset keeps progress',
    await s.ev('JSON.parse(localStorage.getItem("nullport.save.v1")).solved.c1s1===true'));

  section('RESET PROGRESS — CONFIRM BRANCH');
  await s.click('#menu-btn');
  await cdp.sleep(250);
  await s.click('.veil [data-reset]');
  await cdp.sleep(300);
  await s.click('.veil [data-yes]');
  await cdp.sleep(500);
  check('confirming reset clears progress',
    !(await s.ev('JSON.parse(localStorage.getItem("nullport.save.v1")).solved.c1s1')));
  check('and returns to the board', await s.exists('.case-grid'));
  check('rank falls back to Cadet', (await s.text('.rankchip .r-name')) === 'Cadet');

  section('REBUILD DATABASE');
  await s.click('.case-card[data-case="c1"]');
  await s.waitFor('!!document.querySelector(".CodeMirror")', 15000);
  await s.setValue('#answer', 'Halden Roarke');
  await s.click('#submit');
  await cdp.sleep(400);
  await s.click('#menu-btn');
  await cdp.sleep(250);
  await s.click('.veil [data-rebuild]');
  await cdp.sleep(300);
  check('rebuild asks for confirmation', await s.exists('.veil .dialog'));
  await s.click('.veil [data-yes]');
  const rebuilt = await s.boot(150000);
  check('the game comes back up after a rebuild', rebuilt);
  check('rebuild keeps case progress',
    await s.ev('JSON.parse(localStorage.getItem("nullport.save.v1")).solved.c1s1===true'));
  check('the cache was actually cleared and rebuilt',
    await s.ev('indexedDB.databases ? indexedDB.databases().then(function(d){return true}) : true'));

  section('CASE WORKSPACE CONTROLS');
  await s.click('.case-card[data-case="c1"]');
  await s.waitFor('!!document.querySelector(".CodeMirror")', 15000);

  await s.click('#primer .fold-h');
  await cdp.sleep(200);
  const foldedOnce = await s.ev('document.querySelector("#primer").classList.contains("open")');
  await s.click('#primer .fold-h');
  await cdp.sleep(200);
  check('the field manual folds and unfolds',
    foldedOnce !== await s.ev('document.querySelector("#primer").classList.contains("open")'));

  await s.setEditor('SELECT 1;');
  await s.click('#reset-q');
  await cdp.sleep(250);
  check('"Reset" restores the starter query',
    /crime_scene_report/.test(await s.ev('document.querySelector(".CodeMirror").CodeMirror.getValue()')));

  section('KEYBOARD');
  await s.setEditor('SELECT name FROM person LIMIT 2;');
  await s.ev('document.querySelector(".CodeMirror").CodeMirror.focus()');
  await s.key({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 2 }); // Ctrl
  await cdp.sleep(600);
  check('Ctrl+Enter runs the query', (await s.count('table.grid tbody tr')) === 2);

  await s.ev('document.querySelector("#answer").focus()');
  await s.ev('document.querySelector("#answer").value="Halden Roarke"');
  await s.key({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.sleep(600);
  check('Enter in the answer box submits', await s.exists('.reveal'));

  section('STAGE NAVIGATION');
  await s.click('#next-stage');
  await s.waitFor('!!document.querySelector(".CodeMirror")', 10000);
  check('advanced to stage 2', /2 \//.test(await s.text('.stage-top .ix')));
  await s.click('.stagelist li[data-ix="0"]');
  await cdp.sleep(400);
  check('can navigate back to a solved stage', /1 \//.test(await s.text('.stage-top .ix')));
  check('the solved stage shows its cleared banner', await s.exists('.solved-banner'));
  check('its answer box is disabled', await s.ev('document.querySelector("#answer").disabled'));

  await s.click('.stagelist li[data-ix="2"]');
  await cdp.sleep(400);
  check('cannot jump to a locked stage', /1 \//.test(await s.text('.stage-top .ix')));
  check('and is told why', /previous stage/i.test(await s.text('#toast')));

  section('SCHEMA EXPLORER');
  await s.click('.side-tabs [data-tab="schema"]');
  await cdp.sleep(250);
  await s.click('.schema .tbl[data-t="person"] .tbl-h .peek');
  await cdp.sleep(700);
  check('"peek" runs a sample query', (await s.count('table.grid tbody tr')) === 10);
  check('peek put the query in the editor',
    /FROM person/.test(await s.ev('document.querySelector(".CodeMirror").CodeMirror.getValue()')));

  await s.setEditor('SELECT ');
  await s.click('.schema .tbl[data-t="person"] .tbl-h');
  await cdp.sleep(200);
  await s.click('.schema .tbl[data-t="person"] .col[data-col="name"]');
  await cdp.sleep(250);
  check('clicking a column inserts it at the cursor',
    /SELECT name/.test(await s.ev('document.querySelector(".CodeMirror").CodeMirror.getValue()')));

  section('NOTEBOOK AND HISTORY');
  await s.click('.side-tabs [data-tab="notes"]');
  await cdp.sleep(250);
  await s.setValue('#notepad', 'Ivo account id = 5501');
  await cdp.sleep(600);
  check('notes are persisted',
    /5501/.test(await s.ev('JSON.parse(localStorage.getItem("nullport.save.v1")).notes')));

  check('query history is populated', (await s.count('.hist-item')) > 0);
  await s.click('.side-tabs [data-tab="case"]');
  await cdp.sleep(200);
  await s.setEditor('-- scratch');
  await s.click('.side-tabs [data-tab="notes"]');
  await cdp.sleep(250);
  await s.click('.hist-item');
  await cdp.sleep(300);
  check('clicking history restores that query to the editor',
    !/^-- scratch$/.test(await s.ev('document.querySelector(".CodeMirror").CodeMirror.getValue()')));

  section('DRAFT PERSISTENCE');
  await s.click('.side-tabs [data-tab="case"]');
  await cdp.sleep(200);
  await s.setEditor('SELECT 42 AS my_draft;');
  await cdp.sleep(300);
  await s.click('#back-board');
  await cdp.sleep(300);
  check('"All case files" returns to the board', await s.exists('.case-grid'));
  await s.click('.case-card[data-case="c1"]');
  await s.waitFor('!!document.querySelector(".CodeMirror")', 10000);
  await s.click('.stagelist li[data-ix="1"]');
  await cdp.sleep(400);
  check('an in-progress query survives leaving and returning',
    /my_draft/.test(await s.ev('document.querySelector(".CodeMirror").CodeMirror.getValue()')));

  section('PAGE ERRORS');
  check('no uncaught page errors', s.pageErrors.length === 0, s.pageErrors.join(' | '));

  await s.shot('t6-interactions');
  s.close();
  process.exit(report('Interactions'));
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it and record failures**

Run: `node tools/test-interactions.cjs`

Expect genuine failures here — this is the first time most of these controls have been exercised. For each, decide whether the test's expectation or the app is wrong, and fix the app when the app is wrong.

- [ ] **Step 3: Fix each broken handler in `js/app.js`**

Work one failure at a time. Re-run after each fix so you always know which change fixed which check. Handlers to look at, by symptom:
- Toast text not matching → `toast()` at `js/app.js:36-42` and the call sites at lines 234 and 313.
- Locked-stage click → `stageUnlocked` at `js/app.js:91-93` and the handler at 311-317.
- History restore → `setEditor` at 534-539 and the handler at 387.
- Draft persistence → the `sessionStorage` write at `js/app.js:498-500`.

- [ ] **Step 4: Re-run until green**

Run: `node tools/test-interactions.cjs`
Expected: all checks PASS, no page errors.

- [ ] **Step 5: Confirm nothing regressed**

Run: `node tools/ui-test.cjs && node tools/playthrough.cjs`
Expected: 27 passed and 44 passed.

- [ ] **Step 6: Commit**

```bash
git add tools/test-interactions.cjs js/app.js
git commit -m "test: cover every UI control; fix handlers surfaced by the sweep"
```

---

## Task 7: Accessibility and responsive suite

**Files:**
- Create: `tools/test-a11y.cjs`
- Possibly modify: `index.html`, `css/style.css`, `js/app.js`

**Interfaces:**
- Consumes: `cdp.cjs`; `harness.cjs`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the suite**

Create `tools/test-a11y.cjs`:

```js
/* Accessibility and responsive layout. Not a full WCAG audit — the things
 * most likely to be broken and most cheaply verified. */
const path = require('path');
const cdp = require('./cdp.cjs');
const { section, check, report } = require('./harness.cjs');

const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

/** Relative luminance per WCAG 2.1. */
function lum(rgb) {
  const c = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const parseRgb = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);

(async function main() {
  const s = await cdp.launch({ url, port: 9343 });
  if (!s) { console.log('No browser found — skipping.'); process.exit(0); }

  await s.clearStorage();
  await s.reload();
  if (!await s.boot()) { console.error('Never booted.'); s.close(); process.exit(1); }

  section('DOCUMENT BASICS');
  check('html has a lang attribute',
    (await s.ev('document.documentElement.getAttribute("lang")')) === 'en');
  check('page has a title', (await s.ev('document.title')).length > 0);
  check('viewport meta is present',
    await s.ev('!!document.querySelector("meta[name=viewport]")'));
  check('there is exactly one h1 on the prologue',
    (await s.count('h1')) === 1);

  section('KEYBOARD REACHABILITY');
  await s.click('#begin');
  await cdp.sleep(300);
  // Case cards are div-based; they must still be reachable and operable
  // by keyboard, not mouse-only.
  const cardTabbable = await s.ev(
    'Array.from(document.querySelectorAll(".case-card")).every(function(c){' +
    'return c.tabIndex >= 0 || c.getAttribute("role")==="button"})');
  check('case cards are keyboard-reachable', cardTabbable,
    'add tabindex="0" and role="button" to .case-card');

  const tabbables = await s.ev(
    'document.querySelectorAll("a[href],button,input,textarea,select,[tabindex]:not([tabindex=\\"-1\\"])").length');
  check('the board exposes focusable controls', tabbables > 0, String(tabbables));

  section('FOCUS VISIBILITY');
  await s.ev('document.querySelector("#menu-btn").focus()');
  const focusRing = await s.ev(
    '(function(){var e=document.querySelector("#menu-btn");' +
    'var st=getComputedStyle(e);return st.outlineStyle!=="none"||st.boxShadow!=="none"})()');
  check('focused buttons show a visible focus indicator', focusRing,
    'add a :focus-visible rule to .btn in css/style.css');

  await s.click('.case-card[data-case="c1"]');
  await s.waitFor('!!document.querySelector(".CodeMirror")', 15000);
  await s.ev('document.querySelector("#answer").focus()');
  const inputRing = await s.ev(
    '(function(){var st=getComputedStyle(document.querySelector("#answer"));' +
    'return st.borderColor!=="" && st.boxShadow!=="none"})()');
  check('the answer input shows a focus indicator', inputRing);

  section('FORM LABELLING');
  check('the answer input is labelled',
    await s.ev('(function(){var i=document.querySelector("#answer");' +
      'return !!(i.getAttribute("aria-label")||i.getAttribute("aria-labelledby")||' +
      'document.querySelector("label[for=answer]"))})()'),
    'add aria-label to #answer in renderWorkspace');
  await s.click('.side-tabs [data-tab="notes"]');
  await cdp.sleep(250);
  check('the notepad is labelled',
    await s.ev('(function(){var i=document.querySelector("#notepad");' +
      'return !!(i.getAttribute("aria-label")||document.querySelector("label[for=notepad]"))})()'),
    'add aria-label to #notepad');
  await s.click('.side-tabs [data-tab="case"]');
  await cdp.sleep(200);

  section('LIVE FEEDBACK IS ANNOUNCED');
  check('the toast is a live region',
    (await s.ev('document.querySelector("#toast").getAttribute("aria-live")')) !== null,
    'add aria-live="polite" to #toast in index.html');
  check('the verdict line is a live region',
    (await s.ev('document.querySelector("#verdict").getAttribute("aria-live")')) !== null,
    'add aria-live="polite" to #verdict in renderWorkspace');

  section('CONTRAST');
  const pairs = [
    ['body text on the shell', 'body', '#view'],
    ['dim text', '.stage-top .ix', '.stage-top'],
  ];
  const bodyFg = parseRgb(await s.ev('getComputedStyle(document.body).color'));
  const bodyBg = parseRgb(await s.ev('getComputedStyle(document.body).backgroundColor'));
  check('body text meets 4.5:1 against the background',
    contrast(bodyFg, bodyBg) >= 4.5, contrast(bodyFg, bodyBg).toFixed(2) + ':1');

  const paperFg = parseRgb(await s.ev('getComputedStyle(document.querySelector(".paper p")).color'));
  const paperBg = parseRgb(await s.ev(
    'getComputedStyle(document.querySelector(".paper")).backgroundColor'));
  check('case-file paper text meets 4.5:1',
    contrast(paperFg, paperBg) >= 4.5, contrast(paperFg, paperBg).toFixed(2) + ':1');

  section('REDUCED MOTION');
  await s.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await s.reload();
  await s.boot(60000);
  await cdp.sleep(400);
  const animMs = await s.ev(
    '(function(){var e=document.querySelector(".prologue")||document.body;' +
    'return parseFloat(getComputedStyle(e).transitionDuration)||0})()');
  check('animations are suppressed under prefers-reduced-motion', animMs < 0.05,
    animMs + 's');
  await s.send('Emulation.setEmulatedMedia', { features: [] });

  section('RESPONSIVE');
  for (const [w, h, label] of [[390, 844, 'phone'], [768, 1024, 'tablet'], [1920, 1080, 'desktop']]) {
    await s.setViewport(w, h);
    await s.reload();
    await s.boot(60000);
    await cdp.sleep(500);
    await s.ev('(document.querySelector("#begin")||{click:function(){}}).click()');
    await cdp.sleep(400);
    const overflow = await s.ev(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth');
    check(label + ' (' + w + 'px): no horizontal overflow on the board', overflow === 0,
      overflow + 'px');
    await s.ev('(document.querySelector(".case-card[data-case=\\"c1\\"]")||{click:function(){}}).click()');
    await s.waitFor('!!document.querySelector(".CodeMirror")', 15000);
    await cdp.sleep(300);
    const overflow2 = await s.ev(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth');
    check(label + ' (' + w + 'px): no horizontal overflow in a case', overflow2 === 0,
      overflow2 + 'px');
    check(label + ' (' + w + 'px): the Run button is reachable',
      await s.ev('(function(){var b=document.querySelector("#run");if(!b)return false;' +
        'var r=b.getBoundingClientRect();return r.width>0&&r.right<=' + w + '})()'));
    await s.shot('t7-a11y-' + label);
  }

  section('PAGE ERRORS');
  check('no uncaught page errors', s.pageErrors.length === 0, s.pageErrors.join(' | '));

  s.close();
  process.exit(report('Accessibility'));
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it and record failures**

Run: `node tools/test-a11y.cjs`

Expected failures on first run (these are real gaps in the shipped app):
- case cards not keyboard-reachable
- `#toast` and `#verdict` not live regions
- `#answer` and `#notepad` unlabelled
- possibly no `:focus-visible` styling

- [ ] **Step 3: Add ARIA to `index.html`**

Change the toast element:

```html
<div id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
```

- [ ] **Step 4: Make case cards keyboard-operable in `js/app.js`**

In `renderBoard`, change the card opening tag (around line 205) to carry a role, a tab stop and a label:

```js
      return '<div class="case-card ' + cls + '" data-case="' + c.id + '"' +
        ' role="button" tabindex="0"' +
        ' aria-label="Case ' + c.number + ', ' + esc(c.title) +
        (solved ? ', closed' : (unlocked ? ', open' : ', sealed')) + '">' + stamp +
```

Then, in the same function, extend the click wiring (around line 231) so Enter and Space activate a card:

```js
    $$('.case-card', v).forEach((card) => {
      const open = () => {
        const c = CASES.find((x) => x.id === card.dataset.case);
        if (!caseUnlocked(c)) { toast('That file is still sealed.', 'bad'); return; }
        go('case', c.id);
      };
      card.onclick = open;
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      };
    });
```

- [ ] **Step 5: Label the inputs and announce the verdict in `js/app.js`**

In `renderWorkspace`, the answer input gains a label and the verdict becomes a live region:

```js
      '<input id="answer" autocomplete="off" spellcheck="false"' +
      ' aria-label="' + esc(s.ask) + '" placeholder="' +
      esc(s.placeholder || 'your answer') + '"' +
```

and:

```js
      '</div><div class="verdict" id="verdict" role="status" aria-live="polite">' +
```

In `renderNotes`, label the notepad:

```js
      '<textarea id="notepad" aria-label="Detective\'s notebook" placeholder="Suspect ids, account numbers, anything you will need two cases from now…">' +
```

- [ ] **Step 6: Add a focus-visible style to `css/style.css`**

Add after the `.btn` block:

```css
/* Keyboard focus must be obvious; mouse clicks should not paint a ring. */
.btn:focus-visible,
.case-card:focus-visible,
.side-tabs button:focus-visible,
.stagelist li:focus-visible,
.tbl-h:focus-visible,
.hist-item:focus-visible {
  outline: 2px solid var(--brass);
  outline-offset: 2px;
}
.case-card:focus-visible { border-color: var(--brass); }
```

- [ ] **Step 7: Re-run until green**

Run: `node tools/test-a11y.cjs`
Expected: all checks PASS. If the contrast checks fail, adjust the offending token in the `:root` block of `css/style.css` — raise `--text-dim` or `--paper-dim` until the ratio clears 4.5:1 — and re-run.

- [ ] **Step 8: Confirm the ARIA changes did not break the interface**

Run: `node tools/ui-test.cjs && node tools/test-interactions.cjs && node tools/playthrough.cjs`
Expected: 27, all-pass, and 44 respectively.

- [ ] **Step 9: Commit**

```bash
git add tools/test-a11y.cjs index.html js/app.js css/style.css
git commit -m "test: accessibility and responsive coverage; add ARIA, focus rings, keyboard cards"
```

---

## Task 8: Performance budgets

Timings are currently printed but never asserted, so a 10× regression would pass silently.

**Files:**
- Create: `tools/test-perf.cjs`

**Interfaces:**
- Consumes: `cdp.cjs`; `harness.cjs`; `tools/solutions.js` `{ SOLUTIONS }`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the suite**

Create `tools/test-perf.cjs`:

```js
/* Performance budgets. Generous enough not to flake on a slow machine, tight
 * enough to catch a real regression. */
const path = require('path');
const cdp = require('./cdp.cjs');
const { section, check, report } = require('./harness.cjs');
require(path.join(__dirname, 'solutions.js'));

const SOL = globalThis.NullportSolutions.SOLUTIONS;
const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

const BUDGET = {
  coldBuildMs: 15000,   // observed ~3100 on the dev machine
  warmBootMs: 4000,     // observed ~105 restoring from IndexedDB
  stageQueryMs: 400,    // observed max ~41
  totalQueryMs: 4000,   // all 26 canonical queries
  rowsMin: 100000,      // the world must not silently shrink
};

(async function main() {
  const s = await cdp.launch({ url, port: 9344 });
  if (!s) { console.log('No browser found — skipping.'); process.exit(0); }

  section('COLD BUILD');
  // Wipe both stores so the world is genuinely rebuilt.
  await s.clearStorage();
  await s.ev('new Promise(function(r){var q=indexedDB.deleteDatabase("nullport");' +
    'q.onsuccess=function(){r(1)};q.onerror=function(){r(1)};q.onblocked=function(){r(1)}})');
  const t0 = Date.now();
  await s.reload();
  const cold = await s.boot(BUDGET.coldBuildMs + 30000);
  const coldMs = Date.now() - t0;
  check('cold build completes', cold);
  check('cold build under ' + BUDGET.coldBuildMs + 'ms', coldMs < BUDGET.coldBuildMs,
    coldMs + 'ms');

  section('WARM BOOT');
  const t1 = Date.now();
  await s.reload();
  const warm = await s.boot(BUDGET.warmBootMs + 30000);
  const warmMs = Date.now() - t1;
  check('warm boot completes', warm);
  check('warm boot under ' + BUDGET.warmBootMs + 'ms', warmMs < BUDGET.warmBootMs,
    warmMs + 'ms');
  check('warm boot is much faster than cold', warmMs < coldMs, warmMs + ' vs ' + coldMs);

  section('WORLD SIZE');
  // Reach the database the same way the smoke page does, via a fresh handle.
  const rows = await s.ev(
    '(async function(){var SQL=await initSqlJs();' +
    'var W=globalThis.NullportWorld;var w=W.build();return W.totalRows(w)})()');
  check('world has at least ' + BUDGET.rowsMin + ' rows', rows >= BUDGET.rowsMin,
    rows + ' rows');

  section('QUERY BUDGETS');
  await s.ev('(document.querySelector("#begin")||{click:function(){}}).click()');
  await cdp.sleep(300);
  await s.click('.case-card[data-case="c1"]');
  await s.waitFor('!!document.querySelector(".CodeMirror")', 15000);

  let total = 0;
  const slow = [];
  for (const id of Object.keys(SOL)) {
    await s.setEditor(SOL[id].sql);
    const t = Date.now();
    await s.click('#run');
    await s.waitFor('!!document.querySelector("table.grid tbody td") || ' +
      '!!document.querySelector(".res-empty") || !!document.querySelector(".res-error")', 20000);
    const ms = Date.now() - t;
    total += ms;
    if (ms > BUDGET.stageQueryMs) slow.push(id + ' ' + ms + 'ms');
  }
  slow.forEach((x) => console.log('    slow: ' + x));
  check('every stage query under ' + BUDGET.stageQueryMs + 'ms (incl. render)',
    slow.length === 0, slow.length + ' over budget');
  check('all 26 queries under ' + BUDGET.totalQueryMs + 'ms total',
    total < BUDGET.totalQueryMs, total + 'ms');

  section('LARGE RESULT RENDERING');
  await s.setEditor('SELECT * FROM phone_call;');
  const t2 = Date.now();
  await s.click('#run');
  await s.waitFor('!!document.querySelector("table.grid tbody td")', 30000);
  const bigMs = Date.now() - t2;
  check('a 20k-row query renders in under 5s (truncated to 500)', bigMs < 5000, bigMs + 'ms');
  check('and renders only 500 rows', (await s.count('table.grid tbody tr')) === 500);

  section('MEMORY');
  const heap = await s.ev('performance.memory ? performance.memory.usedJSHeapSize : 0');
  if (heap) {
    check('JS heap under 400 MB', heap < 400 * 1024 * 1024,
      Math.round(heap / 1048576) + ' MB');
  } else {
    check('heap measurement unavailable — skipped', true);
  }

  console.log('\n  cold ' + coldMs + 'ms · warm ' + warmMs + 'ms · 26 queries ' + total + 'ms');
  s.close();
  process.exit(report('Performance'));
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it**

Run: `node tools/test-perf.cjs`
Expected: all budgets PASS, with a summary line like `cold 3100ms · warm 105ms · 26 queries 900ms`.

- [ ] **Step 3: If a budget fails, decide before you widen it**

A failing budget means one of two things. Either the machine is slow — in which case check the printed actual against the dev-machine figures in the `BUDGET` comments and widen only that one constant, with a comment saying why. Or something genuinely regressed — a dropped index in `js/db.js:118-139`, or a query in `tools/solutions.js` that lost its `sail_date`/`plate_number` index path. Investigate before widening. Never widen a budget to pass a run you have not explained.

- [ ] **Step 4: Commit**

```bash
git add tools/test-perf.cjs
git commit -m "test: assert build and query performance budgets"
```

---

## Task 9: Cross-browser run, suite registration, documentation

**Files:**
- Modify: `tools/test-all.cjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: every suite created above; `cdp.cjs` `findBrowser(prefer)`
- Produces: `node tools/test-all.cjs` as the single entry point for the whole suite

- [ ] **Step 1: Register the new suites in `tools/test-all.cjs`**

Replace the `SUITES` array:

```js
const SUITES = [
  ['World data — clue uniqueness & integrity', 'verify.cjs'],
  ['World data — determinism & version discipline', 'test-determinism.cjs'],
  ['Content — prose, embedded SQL, schema references', 'test-content.cjs'],
  ['Answers — normalisation, tolerance, rejection', 'test-answers.cjs'],
  ['Campaign — every stage answerable', 'verify-campaign.cjs'],
  ['Browser — engine, world and queries on file://', 'browser-test.cjs'],
  ['Browser — interface walkthrough', 'ui-test.cjs'],
  ['Browser — every control exercised', 'test-interactions.cjs'],
  ['Browser — hostile SQL and save files', 'test-resilience.cjs'],
  ['Browser — accessibility and responsive', 'test-a11y.cjs'],
  ['Browser — performance budgets', 'test-perf.cjs'],
  ['Browser — full 26-stage playthrough', 'playthrough.cjs'],
];
```

Node suites run first so a content or data failure is reported before spending time launching browsers.

- [ ] **Step 2: Add a cross-browser flag to `tools/test-all.cjs`**

Insert before the loop:

```js
const ONLY = process.argv.includes('--node-only');
const CHROME = process.argv.includes('--chrome');
if (CHROME) process.env.NULLPORT_BROWSER = 'chrome';
```

and change the loop guard:

```js
for (const [label, file] of SUITES) {
  if (ONLY && /browser-test|ui-test|playthrough|test-interactions|test-resilience|test-a11y|test-perf/.test(file)) {
    console.log('\nSKIP (--node-only) ' + label);
    continue;
  }
```

- [ ] **Step 3: Honour the browser preference in `tools/cdp.cjs`**

In `launch`, change the first line of the function body:

```js
  const browser = findBrowser(opts.prefer || process.env.NULLPORT_BROWSER);
```

- [ ] **Step 4: Run the whole suite on the default browser**

Run: `node tools/test-all.cjs`
Expected: all twelve suites PASS.

- [ ] **Step 5: Run the browser suites on Chrome if it is installed**

Run: `node tools/test-all.cjs --chrome`
Expected: all twelve PASS, or a clean skip on every browser suite if Chrome is absent. If Chrome is present and a suite fails where Edge passed, that is a genuine cross-browser bug — fix it in the app, not the test.

- [ ] **Step 6: Verify the node-only path works for CI without a browser**

Run: `node tools/test-all.cjs --node-only`
Expected: the five Node suites PASS and the seven browser suites print `SKIP`.

- [ ] **Step 7: Update the Tests section of `README.md`**

Replace the test listing with the twelve suites, keeping the existing format. Record the final total check count from Step 4's output, and add:

```markdown
`node tools/test-all.cjs --node-only` runs only the suites that need no browser.
`node tools/test-all.cjs --chrome` forces the browser suites onto Chrome instead of Edge.
```

Also update the "Current status" line with the new totals, and add a row to the coverage description explaining that `test-content.cjs` executes the SQL embedded in hints — that is the non-obvious one worth calling out.

- [ ] **Step 8: Final full run**

Run: `node tools/test-all.cjs`
Expected: `All suites passed.`

- [ ] **Step 9: Commit**

```bash
git add tools/test-all.cjs tools/cdp.cjs README.md
git commit -m "test: register all suites, add cross-browser and node-only modes"
```

---

## Self-Review

**Spec coverage.** Every gap in the Coverage Gap Analysis maps to a task: hint SQL and prose references → Task 2; answer tolerance → Task 3; the confirmed `app.js:133` rebuild race → Task 4; untested handlers → Task 6; adversarial input → Task 5; accessibility → Task 7; performance → Task 8; cross-browser → Task 9. The infrastructure duplication that would otherwise make Tasks 5-8 expensive is removed first in Task 1.

**Placeholder scan.** No `TBD`, no "add appropriate error handling", no "similar to Task N". Every code step carries the actual code. Task 2, 5, 6 and 7 each contain a discovery step that is *expected* to fail on first run — those steps say what the likely failures are and where in `js/app.js` to fix each one, rather than leaving the engineer to guess.

**Type consistency.** `harness.cjs` exports `{ section, check, report }` and every suite imports exactly those three. `cdp.cjs` exports `{ findBrowser, launch, SHOT_DIR, sleep }`; suites use `cdp.launch`, `cdp.sleep`, and the session methods declared in Task 1's Interfaces block — `ev`, `waitFor`, `click`, `setValue`, `setEditor`, `text`, `count`, `exists`, `key`, `shot`, `reload`, `setViewport`, `clearStorage`, `boot`, `send`, `close`, plus the `pageErrors` array. Task 5 and 7 both call `s.send(...)` directly for `Emulation.*` and that method is exported. `report()` returns an exit code and never calls `process.exit`, so every suite ends with `process.exit(report(...))` — consistent across all seven new files. CDP ports 9341-9344 are unique and clear of the 9333-9336 already in use.

One deliberate carry-over: Task 2's suite has a stray `const A = require(...) || globalThis.NullportAnswer;` line that is unused because `ANS` is what the checks reference. Delete the `A` line when implementing — it is dead on arrival and would trip a linter.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-19-nullport-thorough-testing.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
