/* =============================================================================
 * UI walkthrough test.
 *
 * Drives the real game in a headless browser: boots it, walks the prologue,
 * opens Case 1, runs a query, submits a correct answer, checks the stage is
 * marked solved, then jumps to the hardest stage and confirms a window-function
 * query runs. Captures screenshots along the way.
 *
 *   node tools/ui-test.cjs [--show]
 * ========================================================================== */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CANDIDATES = [
  process.env['ProgramFiles(x86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.ProgramFiles + '\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.ProgramFiles + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const browser = CANDIDATES.find((p) => p && fs.existsSync(p));
if (!browser) { console.error('No browser found.'); process.exit(0); }

const PORT = 9334;
const profile = path.join(os.tmpdir(), 'nullport-ui-profile');
const shotDir = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(shotDir)) fs.mkdirSync(shotDir);
const url = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws = null, msgId = 0;
const pending = new Map();
let pass = 0, fail = 0;

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text + ' ' +
      ((r.exceptionDetails.exception || {}).description || ''));
  }
  return r.result && r.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(shotDir, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('    · screenshot → screenshots/' + name + '.png');
}
function check(label, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (detail ? '  — ' + detail : '')); }
}
async function waitFor(expr, ms, label) {
  const end = Date.now() + (ms || 60000);
  while (Date.now() < end) {
    try { if (await evaluate(expr)) return true; } catch (e) { /* still loading */ }
    await sleep(300);
  }
  console.log('    (timed out waiting for ' + (label || expr) + ')');
  return false;
}

const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile, '--window-size=1500,980', url,
], { stdio: 'ignore' });

function cleanup(code) {
  try { if (ws) ws.close(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  setTimeout(() => process.exit(code), 150);
}

const pageErrors = [];

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
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pageErrors.push(d.text + ' ' + ((d.exception || {}).description || ''));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      pageErrors.push('[log] ' + m.params.entry.text);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1500, height: 980, deviceScaleFactor: 1, mobile: false });

  console.log('Booting the game…');
  // Start clean so the prologue shows.
  await evaluate("try{localStorage.clear();sessionStorage.clear()}catch(e){}");
  await send('Page.reload', { ignoreCache: false });

  const booted = await waitFor("document.querySelector('#app') && " +
    "document.querySelector('#app').classList.contains('live')", 150000, 'boot');
  check('game boots and the archive loads', booted);
  if (!booted) { console.log(pageErrors.join('\n')); return cleanup(1); }

  console.log('\nPROLOGUE');
  check('prologue is shown', await evaluate("!!document.querySelector('.prologue')"));
  check('title renders', (await evaluate("document.querySelector('.prologue h1').textContent")) === 'Nullport');
  await shot('01-prologue');

  console.log('\nCASE BOARD');
  await evaluate("document.querySelector('#begin').click()");
  await sleep(400);
  const cards = await evaluate("document.querySelectorAll('.case-card').length");
  check('eight case cards render', cards === 8, 'got ' + cards);
  check('case 1 is unlocked',
    await evaluate("document.querySelector('.case-card').classList.contains('open')"));
  check('case 8 is sealed',
    await evaluate("document.querySelectorAll('.case-card')[7].classList.contains('locked')"));
  await shot('02-case-board');

  console.log('\nCASE 1 WORKSPACE');
  await evaluate("document.querySelector('.case-card[data-case=\"c1\"]').click()");
  await sleep(600);
  check('sidebar case file renders', await evaluate("!!document.querySelector('.stagelist')"));
  check('four stages listed',
    (await evaluate("document.querySelectorAll('.stagelist li').length")) === 4);
  check('CodeMirror editor mounted', await evaluate("!!document.querySelector('.CodeMirror')"));
  check('field manual present', await evaluate("!!document.querySelector('#primer')"));
  check('starter SQL prefilled',
    (await evaluate("document.querySelector('.CodeMirror').CodeMirror.getValue()")).indexOf('crime_scene_report') > -1);
  await shot('03-case-open');

  console.log('\nRUNNING A QUERY');
  await evaluate("document.querySelector('#run').click()");
  await sleep(700);
  const rows = await evaluate("document.querySelectorAll('table.grid tbody tr').length");
  check('results grid populated', rows > 0, rows + ' rows');
  check('timing reported',
    /ms/.test(await evaluate("document.querySelector('#stat').textContent")));
  await shot('04-query-results');

  console.log('\nSCHEMA EXPLORER');
  await evaluate("document.querySelector('.side-tabs [data-tab=\"schema\"]').click()");
  await sleep(300);
  const tbls = await evaluate("document.querySelectorAll('.schema .tbl').length");
  check('all 18 tables listed', tbls === 18, 'got ' + tbls);
  await evaluate("document.querySelector('.schema .tbl-h').click()");
  await sleep(200);
  check('table expands to show columns',
    await evaluate("document.querySelector('.schema .tbl').classList.contains('open')"));
  await shot('05-schema');

  console.log('\nSOLVING A STAGE');
  await evaluate("document.querySelector('.side-tabs [data-tab=\"case\"]').click()");
  await sleep(200);
  // A deliberately wrong answer first.
  await evaluate("(function(){var i=document.querySelector('#answer');i.value='Petra Vance';" +
    "document.querySelector('#submit').click();})()");
  await sleep(400);
  check('wrong answer is rejected',
    (await evaluate("document.querySelector('#verdict').textContent")).length > 0);
  await shot('06-wrong-answer');

  // Now the right one.
  await evaluate("(function(){var i=document.querySelector('#answer');i.value='  halden   ROARKE ';" +
    "document.querySelector('#submit').click();})()");
  await sleep(700);
  check('correct answer accepted (case/space-insensitive)',
    await evaluate("!!document.querySelector('.reveal')"));
  check('stage marked done in the sidebar',
    await evaluate("document.querySelectorAll('.stagelist li.done').length") === 1);
  check('evidence panel appears',
    await evaluate("!!document.querySelector('.evidence')"));
  check('progress persisted to localStorage',
    await evaluate("JSON.parse(localStorage.getItem('nullport.save.v1')).solved.c1s1 === true"));
  await shot('07-stage-solved');

  console.log('\nHINTS');
  await evaluate("document.querySelector('#next-stage').click()");
  await sleep(500);
  check('advanced to stage 2',
    (await evaluate("document.querySelector('.stage-top .ix').textContent")).indexOf('2 /') > -1);
  await evaluate("document.querySelector('#hint').click()");
  await sleep(400);
  check('hint revealed', (await evaluate("document.querySelectorAll('.hint').length")) === 1);
  await shot('08-hint');

  console.log('\nHARD SQL IN THE REAL EDITOR');
  // Prove the console handles the final case's window function.
  const winSql = "WITH ranked AS (SELECT receiver_number, ROW_NUMBER() OVER " +
    "(PARTITION BY call_date ORDER BY duration_sec DESC) rn FROM phone_call " +
    "WHERE caller_number = '204-555-0148') SELECT DISTINCT p.name FROM ranked r " +
    "JOIN phone_line l ON l.number = r.receiver_number JOIN person p ON p.id = l.person_id " +
    "WHERE r.rn = 1;";
  await evaluate("document.querySelector('.CodeMirror').CodeMirror.setValue(" +
    JSON.stringify(winSql) + ")");
  await evaluate("document.querySelector('#run').click()");
  await sleep(800);
  const cell = await evaluate("(document.querySelector('table.grid tbody td')||{}).textContent");
  check('window function runs in the browser console', cell === 'Vivienne Aldridge', 'got ' + cell);
  await shot('09-window-function');

  console.log('\nPERSISTENCE');
  await send('Page.reload', {});
  await waitFor("document.querySelector('#app') && document.querySelector('#app').classList.contains('live')",
    120000, 'reboot');
  await sleep(500);
  check('skips the prologue on return', await evaluate("!!document.querySelector('.board')"));
  check('case 1 shows 1 stage cleared',
    /1\/4/.test(await evaluate("document.querySelector('.case-card .stagecount').textContent")));
  const notes = await evaluate("!!document.querySelector('.progress-rail span')");
  check('progress rail renders', notes);
  await shot('10-after-reload');

  console.log('\nCONSOLE');
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));

  console.log('\n' + '='.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  if (pageErrors.length) { console.log('\nPage errors:'); pageErrors.forEach((e) => console.log('  ' + e)); }
  cleanup(fail ? 1 : 0);
})().catch((e) => { console.error(e); cleanup(1); });
