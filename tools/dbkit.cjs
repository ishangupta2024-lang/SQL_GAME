/* Shared Node helper: build the world and load it into an in-memory SQLite DB. */
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'vendor', 'sql-asm.js'));
require(path.join(__dirname, '..', 'js', 'world.js'));

const W = globalThis.NullportWorld;

async function makeDb(seed) {
  const SQL = await initSqlJs();
  const world = W.build(seed);
  const db = new SQL.Database();
  db.run('PRAGMA journal_mode=OFF;');
  db.run(W.ddl());
  db.run('BEGIN;');
  for (const chunk of W.sqlChunks(world, 900)) db.run(chunk.sql);
  db.run('COMMIT;');
  return { db, world, W };
}

function all(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((row) => Object.fromEntries(row.map((v, i) => [columns[i], v])));
}

function one(db, sql) {
  const r = all(db, sql);
  return r.length ? r[0] : null;
}

module.exports = { makeDb, all, one, W };
