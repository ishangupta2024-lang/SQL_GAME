/* =============================================================================
 * Full playthrough test.
 *
 * Plays the whole game through the real interface in a headless browser: for
 * each of the 26 stages it types the canonical query into the editor, clicks
 * Run, reads the answer out of the results grid exactly as a player would,
 * submits it, and checks the stage unlocks the next one. Ends at the finale.
 *
 *   node tools/playthrough.cjs
 * ========================================================================== */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

require(path.join(__dirname, 'solutions.js'));
require(path.join(__dirname, '..', 'js', 'cases.js'));
const SOL = globalThis.NullportSolutions.SOLUTIONS;
const CASES = globalThis.NullportCases.CASES;

const CANDIDATES = [
  process.env['ProgramFiles(x86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.ProgramFiles + '\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.ProgramFiles + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const browser = CANDIDATES.find((p) => p && fs.existsSync(p));
if (!browser) { console.error('No browser found.'); process.exit(0); }

const PORT = 9335;
const profile = path.join(os.tmpdir(), 'nullport-play-profile');
const shotDir = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir);
const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null, msgId = 0;
const pending = new Map();
const pageErrors = [];
let pass = 0, fail = 0;

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text + ' ' +
      ((r.exceptionDetails.exception || {}).description || ''));
  }
  return r.result && r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(shotDir, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function waitFor(expr, ms) {
  const end = Date.now() + (ms || 30000);
  while (Date.now() < end) {
    try { if (await ev(expr)) return true; } catch (e) {}
    await sleep(250);
  }
  return false;
}
const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile, '--window-size=1500,980', url,
], { stdio: 'ignore' });
function cleanup(c) {
  try { if (ws) ws.close(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  setTimeout(() => process.exit(c), 150);
}

(async function main() {
  let targets = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    try {
      targets = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      if (targets.some((t) => t.type === 'page' && t.webSocketDebuggerUrl)) break;
    } catch (e) {}
  }
  const page = targets && targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) { console.error('Could not attach.'); return cleanup(1); }

  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push(m.params.exceptionDetails.text);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 980, deviceScaleFactor: 1, mobile: false });

  await ev("try{localStorage.clear();sessionStorage.clear()}catch(e){}");
  await send('Page.reload', {});
  if (!await waitFor("document.querySelector('#app')&&document.querySelector('#app').classList.contains('live')", 150000)) {
    console.error('Game never booted.'); return cleanup(1);
  }
  await ev("document.querySelector('#begin').click()");
  await sleep(400);

  console.log('Playing all ' + CASES.length + ' cases through the real interface…\n');
  const t0 = Date.now();

  for (const c of CASES) {
    // Open the case from the board.
    await ev("document.querySelector('.case-card[data-case=\"" + c.id + "\"]').click()");
    const opened = await waitFor("!!document.querySelector('.CodeMirror')", 15000);
    if (!opened) { fail++; console.log('✗ could not open ' + c.id); break; }
    console.log('CASE ' + c.number + ' — ' + c.title);

    for (let i = 0; i < c.stages.length; i++) {
      const st = c.stages[i];
      const sol = SOL[st.id];

      // Type the query and run it, exactly as a player would.
      await ev("document.querySelector('.CodeMirror').CodeMirror.setValue(" +
        JSON.stringify(sol.sql) + ")");
      await ev("document.querySelector('#run').click()");
      const got = await waitFor("!!document.querySelector('table.grid tbody td')", 20000);
      if (!got) {
        fail++; console.log('  ✗ ' + st.id + ' produced no rows');
        const err = await ev("(document.querySelector('.res-error')||{}).textContent||''");
        if (err) console.log('      ' + err);
        continue;
      }

      // Read the answer off the results grid.
      let cell = await ev("document.querySelector('table.grid tbody td').textContent");
      if (sol.extract) {
        const m = String(cell).match(sol.extract);
        cell = m ? m[1] : cell;
      }

      await ev("(function(){var i=document.querySelector('#answer');i.value=" +
        JSON.stringify(String(cell)) + ";document.querySelector('#submit').click();})()");
      await sleep(350);

      const solved = await ev("JSON.parse(localStorage.getItem('nullport.save.v1')).solved['" +
        st.id + "']===true");
      if (solved) {
        pass++;
        console.log('  ✓ ' + st.id.padEnd(6) + ' ' + st.title.padEnd(30) +
          ' answer: "' + cell + '"');
      } else {
        fail++;
        console.log('  ✗ ' + st.id + ' rejected answer "' + cell + '"');
      }

      // Move on.
      if (i < c.stages.length - 1) {
        await ev("(document.querySelector('#next-stage')||{click:function(){}}).click()");
        await waitFor("!!document.querySelector('.CodeMirror')", 10000);
        await sleep(150);
      }
    }

    const closed = await ev("!!document.querySelector('.complete')");
    if (closed) { pass++; console.log('  ✓ CASE CLOSED\n'); }
    else { fail++; console.log('  ✗ case did not close\n'); }

    if (c.number === 1) await shot('11-case-closed');

    // Back to the board for the next file.
    if (c.number < CASES.length) {
      await ev("(document.querySelector('#to-board')||{click:function(){}}).click()");
      await waitFor("!!document.querySelector('.case-grid')", 10000);
      const unlocked = await ev(
        "!document.querySelectorAll('.case-card')[" + c.number + "].classList.contains('locked')");
      if (unlocked) { pass++; } else { fail++; console.log('  ✗ case ' + (c.number + 1) + ' did not unlock'); }
    }
  }

  // Finale.
  await ev("(document.querySelector('#go-finale')||{click:function(){}}).click()");
  const fin = await waitFor("!!document.querySelector('.finale')", 10000);
  if (fin) { pass++; console.log('✓ finale reached'); } else { fail++; console.log('✗ finale not reached'); }
  await shot('12-finale');

  const rank = await ev("document.querySelector('.rankchip .r-name').textContent");
  if (rank === 'Commissioner of the Nullport Bureau') { pass++; console.log('✓ final rank: ' + rank); }
  else { fail++; console.log('✗ unexpected final rank: ' + rank); }

  await ev("document.querySelector('#fin-board').click()");
  await sleep(400);
  const allClosed = await ev("document.querySelectorAll('.case-card.solved').length");
  if (allClosed === CASES.length) { pass++; console.log('✓ all 8 files marked closed'); }
  else { fail++; console.log('✗ only ' + allClosed + ' files closed'); }
  await shot('13-all-closed');

  console.log('\n' + '='.repeat(56));
  console.log(pass + ' passed, ' + fail + ' failed  (' +
    ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  if (pageErrors.length) {
    console.log('\nPage errors:'); pageErrors.forEach((e) => console.log('  ' + e));
  } else console.log('No uncaught page errors.');
  cleanup(fail || pageErrors.length ? 1 : 0);
})().catch((e) => { console.error(e); cleanup(1); });
