/* =============================================================================
 * Campaign verifier — closes the loop between the data and the case files.
 *
 * For every stage, this runs the canonical solution query (tools/solutions.js)
 * against the generated world, hashes whatever comes back, and asserts that
 * hash is one the stage actually accepts. If this passes, a player who solves a
 * stage correctly is guaranteed to be told they are right.
 *
 *   node tools/verify-campaign.cjs
 * ========================================================================== */
const path = require('path');
const { makeDb, all } = require('./dbkit.cjs');
require(path.join(__dirname, '..', 'js', 'answer.js'));
require(path.join(__dirname, '..', 'js', 'cases.js'));
require(path.join(__dirname, 'solutions.js'));

const { CASES } = globalThis.NullportCases;
const A = globalThis.NullportAnswer;
const SOL = globalThis.NullportSolutions;

let pass = 0, fail = 0;
const failures = [];

makeDb().then(({ db }) => {
  const scalar = (sql) => {
    const r = all(db, sql);
    return r.length ? r[0][Object.keys(r[0])[0]] : null;
  };

  let stageCount = 0;
  CASES.forEach((c) => {
    console.log('\nCase ' + c.number + ' — ' + c.title);
    c.stages.forEach((st) => {
      stageCount++;
      if (!SOL.SOLUTIONS[st.id]) {
        fail++; failures.push(st.id + ' has no canonical solution');
        console.log('  ✗ ' + st.id + '  NO SOLUTION DEFINED');
        return;
      }
      let value;
      try { value = SOL.solve(st.id, scalar); }
      catch (e) {
        fail++; failures.push(st.id + ' query threw: ' + e.message);
        console.log('  ✗ ' + st.id + '  query threw: ' + e.message);
        return;
      }
      if (value === null || value === undefined) {
        fail++; failures.push(st.id + ' query returned nothing');
        console.log('  ✗ ' + st.id + '  query returned nothing');
        return;
      }
      const h = A.hash(value);
      if (st.answers.indexOf(h) !== -1) {
        pass++;
        console.log('  ✓ ' + st.id.padEnd(6) + ' "' + value + '"'.padEnd(22) +
          ' [' + st.teaches + ']');
      } else {
        fail++;
        failures.push(st.id + ': db says "' + value + '" (' + h + ') — not in accepted list');
        console.log('  ✗ ' + st.id + '  db says "' + value + '" (hash ' + h +
          ') but stage accepts ' + JSON.stringify(st.answers));
      }
    });
  });

  /* ---- structural sanity on the case files themselves ---- */
  console.log('\nCAMPAIGN STRUCTURE');
  const ids = new Set();
  let fields = 0;
  CASES.forEach((c, i) => {
    ['id', 'number', 'title', 'tier', 'hook', 'opening', 'primer', 'stages', 'epilogue', 'concepts']
      .forEach((k) => {
        if (c[k] === undefined) { fail++; failures.push('case ' + c.id + ' missing ' + k); }
        else fields++;
      });
    if (c.number !== i + 1) { fail++; failures.push('case ' + c.id + ' number out of order'); }
    if (!c.primer.blocks || !c.primer.blocks.length) {
      fail++; failures.push('case ' + c.id + ' has an empty primer');
    }
    c.stages.forEach((st) => {
      if (ids.has(st.id)) { fail++; failures.push('duplicate stage id ' + st.id); }
      ids.add(st.id);
      if (!st.hints || st.hints.length !== 3) {
        fail++; failures.push(st.id + ' should have exactly 3 hints');
      }
      if (!st.answers || !st.answers.length) { fail++; failures.push(st.id + ' has no answers'); }
      ['title', 'prompt', 'ask', 'starter', 'teaches', 'reveal', 'placeholder'].forEach((k) => {
        if (!st[k]) { fail++; failures.push(st.id + ' missing ' + k); }
      });
    });
  });
  console.log('  ' + CASES.length + ' cases · ' + stageCount + ' stages · ' +
    fields + ' structural fields present');
  console.log('  ' + [...new Set(CASES.flatMap((c) => c.concepts))].length +
    ' distinct SQL concepts taught');
  console.log('  ' + CASES.reduce((n, c) => n + c.stages.length * 3, 0) + ' hints written');

  console.log('\n' + '='.repeat(62));
  console.log(pass + ' stages verified, ' + fail + ' problems');
  if (fail) {
    console.log('\nPROBLEMS:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('Every stage returns an answer the game accepts.');
}).catch((e) => { console.error(e); process.exit(1); });
