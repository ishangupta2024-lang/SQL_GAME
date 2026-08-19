/* =============================================================================
 * Runs every suite in order and reports one verdict.
 *   node tools/test-all.cjs
 * ========================================================================== */
const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['World data — clue uniqueness & integrity', 'verify.cjs'],
  ['Campaign — every stage answerable', 'verify-campaign.cjs'],
  ['Browser — engine, world and queries on file://', 'browser-test.cjs'],
  ['Browser — interface walkthrough', 'ui-test.cjs'],
  ['Browser — full 26-stage playthrough', 'playthrough.cjs'],
];

let failed = 0;
const results = [];

for (const [label, file] of SUITES) {
  process.stdout.write('\n' + '─'.repeat(64) + '\n' + label + '\n' + '─'.repeat(64) + '\n');
  const r = spawnSync(process.execPath, [path.join(__dirname, file)],
    { stdio: 'inherit', timeout: 480000 });
  const ok = r.status === 0;
  if (!ok) failed++;
  results.push([ok, label]);
}

console.log('\n' + '═'.repeat(64));
results.forEach(([ok, label]) => console.log((ok ? '  PASS  ' : '  FAIL  ') + label));
console.log('═'.repeat(64));
console.log(failed ? failed + ' suite(s) failed.' : 'All suites passed.');
process.exit(failed ? 1 : 0);
