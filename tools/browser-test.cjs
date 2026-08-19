/* =============================================================================
 * Headless browser test driver.
 *
 * Launches Edge/Chrome headless, opens tools/smoke.html from a file:// URL
 * (the same way a player will open the game), and polls the page over the
 * DevTools protocol until the smoke test reports a result.
 *
 *   node tools/browser-test.cjs
 * ========================================================================== */
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

const browser = CANDIDATES.find((p) => p && fs.existsSync(p));
if (!browser) {
  console.error('No Chrome or Edge found — skipping the browser test.');
  process.exit(0);
}

const PORT = 9333;
const profile = path.join(os.tmpdir(), 'nullport-test-profile');
const target = process.argv[2] ||
  'file:///' + path.join(__dirname, 'smoke.html').replace(/\\/g, '/');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  target,
], { stdio: 'ignore' });

let ws = null;
let msgId = 0;
const pending = new Map();

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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result && r.result.value;
}

function cleanup(code) {
  try { if (ws) ws.close(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
  setTimeout(() => process.exit(code), 120);
}

(async function main() {
  // Wait for the DevTools endpoint to come up.
  let targets = null;
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      targets = await res.json();
      if (targets.some((t) => t.type === 'page' && t.webSocketDebuggerUrl)) break;
    } catch (e) { /* not up yet */ }
  }
  const page = targets && targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) { console.error('Could not attach to the browser.'); return cleanup(1); }

  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map((a) => a.value).join(' ');
      if (txt) console.log('  [console] ' + txt);
    } else if (m.method === 'Runtime.exceptionThrown') {
      console.log('  [page error] ' + m.params.exceptionDetails.text +
        ' ' + (m.params.exceptionDetails.exception || {}).description);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  await send('Runtime.enable');
  await send('Page.enable');

  console.log('Browser: ' + path.basename(browser));
  console.log('Opening ' + target + '\n');

  let text = '';
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await sleep(700);
    try {
      text = await evaluate("(document.getElementById('out')||{}).textContent||''");
    } catch (e) { continue; }
    if (/RESULT=/.test(text)) break;
  }

  console.log(text || '(no output — the page never reported)');
  const ok = /RESULT=PASS/.test(text);
  console.log('\n' + '='.repeat(50));
  console.log(ok ? 'BROWSER TEST PASSED' : 'BROWSER TEST FAILED');
  cleanup(ok ? 0 : 1);
})().catch((e) => { console.error(e); cleanup(1); });
