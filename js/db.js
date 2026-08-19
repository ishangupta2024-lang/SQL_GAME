/* =============================================================================
 * Database bootstrap.
 *
 * Builds the Nullport world in the browser and loads it into an in-memory
 * SQLite via sql.js (the asm.js build, which needs no separate .wasm fetch and
 * therefore works from a file:// URL).
 *
 * The finished database is cached in IndexedDB so the second visit is instant.
 * IndexedDB is unavailable on some file:// origins — that is handled, we just
 * rebuild each time.
 * ========================================================================== */
(function (root) {
  'use strict';

  const IDB_NAME = 'nullport';
  const IDB_STORE = 'cache';

  function idbOpen() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(IDB_NAME, 1); }
      catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    try {
      const d = await idbOpen();
      return await new Promise((resolve, reject) => {
        const tx = d.transaction(IDB_STORE, 'readonly');
        const r = tx.objectStore(IDB_STORE).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } catch (e) { return undefined; }
  }

  async function idbPut(key, value) {
    try {
      const d = await idbOpen();
      await new Promise((resolve, reject) => {
        const tx = d.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (e) { return false; }
  }

  async function idbDel(key) {
    try {
      const d = await idbOpen();
      await new Promise((resolve) => {
        const tx = d.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = resolve; tx.onerror = resolve;
      });
    } catch (e) { /* nothing to clear */ }
  }

  const nextFrame = () => new Promise((r) => setTimeout(r, 0));

  /**
   * @param {(pct:number, msg:string) => void} onProgress
   * @param {{force?:boolean}} opts
   */
  async function init(onProgress, opts) {
    const W = root.NullportWorld;
    const say = onProgress || function () {};
    const cacheKey = 'db.v' + W.VERSION;

    say(4, 'loading sqlite engine');
    await nextFrame();
    const SQL = await root.initSqlJs();

    if (!(opts && opts.force)) {
      say(14, 'checking local archive');
      const cached = await idbGet(cacheKey);
      if (cached && cached.byteLength) {
        say(80, 'restoring archive');
        await nextFrame();
        try {
          const db = new SQL.Database(new Uint8Array(cached));
          // Cheap smoke test — a corrupt cache must not brick the game.
          db.exec('SELECT COUNT(*) FROM person');
          say(100, 'connected');
          return { db, cached: true };
        } catch (e) {
          await idbDel(cacheKey);
        }
      }
    } else {
      await idbDel(cacheKey);
    }

    say(20, 'generating city records');
    await nextFrame();
    const world = W.build();
    const total = W.totalRows(world);

    say(28, 'creating tables');
    await nextFrame();
    const db = new SQL.Database();
    db.run('PRAGMA journal_mode = OFF;');
    db.run(W.ddl());

    db.run('BEGIN;');
    let done = 0;
    let lastYield = 0;
    for (const chunk of W.sqlChunks(world, 900)) {
      db.run(chunk.sql);
      done += chunk.rows;
      const pct = 28 + Math.round((done / total) * 60);
      if (done - lastYield > 12000) {
        lastYield = done;
        say(pct, 'filing ' + chunk.table.replace(/_/g, ' '));
        await nextFrame();
      }
    }
    db.run('COMMIT;');

    say(90, 'indexing');
    await nextFrame();
    // A handful of indexes so the heavier joins stay snappy in asm.js.
    [
      'CREATE INDEX ix_person_street ON person(address_street)',
      'CREATE INDEX ix_person_name ON person(name)',
      'CREATE INDEX ix_lic_plate ON drivers_license(plate_number)',
      'CREATE INDEX ix_csr ON crime_scene_report(type, report_date)',
      'CREATE INDEX ix_iv_person ON interview(person_id)',
      'CREATE INDEX ix_emp_person ON employment(person_id)',
      'CREATE INDEX ix_emp_co ON employment(company_id)',
      'CREATE INDEX ix_ks ON keycard_scan(building, scan_date)',
      'CREATE INDEX ix_ks_person ON keycard_scan(person_id)',
      'CREATE INDEX ix_pr ON plate_reading(read_date, district)',
      'CREATE INDEX ix_pr_plate ON plate_reading(plate_number)',
      'CREATE INDEX ix_bt_from ON bank_transfer(from_account)',
      'CREATE INDEX ix_bt_to ON bank_transfer(to_account)',
      'CREATE INDEX ix_ba_person ON bank_account(person_id)',
      'CREATE INDEX ix_ba_co ON bank_account(company_id)',
      'CREATE INDEX ix_fm ON ferry_manifest(sail_date, sail_time)',
      'CREATE INDEX ix_fm_person ON ferry_manifest(person_id)',
      'CREATE INDEX ix_pc_caller ON phone_call(caller_number)',
      'CREATE INDEX ix_pc_date ON phone_call(call_date)',
      'CREATE INDEX ix_pl_person ON phone_line(person_id)',
    ].forEach((s) => { try { db.run(s); } catch (e) { /* index is optional */ } });

    say(95, 'sealing archive');
    await nextFrame();
    try { await idbPut(cacheKey, db.export().buffer); } catch (e) { /* fine */ }

    say(100, 'connected');
    return { db, cached: false };
  }

  async function clearCache() {
    await idbDel('db.v' + root.NullportWorld.VERSION);
  }

  root.NullportDB = { init, clearCache };
})(typeof globalThis !== 'undefined' ? globalThis : this);
