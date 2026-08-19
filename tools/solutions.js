/* =============================================================================
 * Canonical solution for every stage — the single source of truth used by both
 * the Node verifier and the browser smoke test.
 *
 * Each entry is self-contained SQL returning ONE scalar: exactly the value the
 * player is asked to type. No hard-coded row ids, so it stays valid if the
 * generator's numbering shifts.
 *
 * `extract` (optional) pulls the answer out of a free-text description, the way
 * a player reads it off the report.
 * ========================================================================== */
(function (root) {
  'use strict';

  // Named sub-selects, so the queries read like something a player would write.
  const MERIDIAN = "(SELECT id FROM bank_account WHERE company_id = " +
                   "(SELECT id FROM company WHERE name = 'Meridian Freight'))";
  const VAULT_CO = "(SELECT id FROM company WHERE name = 'Nullport Vault & Trust')";
  const MERIDIAN_CO = "(SELECT id FROM company WHERE name = 'Meridian Freight')";
  const GHOST = "(SELECT id FROM person WHERE name = 'Sable Wren')";
  const IVO_ACCT = "(SELECT id FROM bank_account WHERE person_id = " +
                   "(SELECT id FROM person WHERE name = 'Ivo Castellan'))";
  const NIGHTS = '20240313, 20240417, 20240505, 20240611, 20240709';
  const BURNER = "'204-555-0148'";

  const SOLUTIONS = {

    /* ---- Case 1 ---- */
    c1s1: {
      sql: `SELECT description FROM crime_scene_report
            WHERE type = 'murder' AND report_date = 20240314 AND district = 'Old Quay'`,
      extract: /Victim identified as ([^,]+),/,
    },
    c1s2: {
      sql: `SELECT name FROM person WHERE address_street = 'Wexler Row'
            ORDER BY address_number DESC LIMIT 1`,
    },
    c1s3: {
      sql: `SELECT name FROM person
            WHERE name LIKE 'Odile%' AND address_street = 'Cardamom Lane'`,
    },
    c1s4: {
      sql: `SELECT name FROM courier_badge
            WHERE employer = 'Meridian Freight' AND name LIKE '%Vance%'`,
    },

    /* ---- Case 2 ---- */
    c2s1: {
      sql: `SELECT report_date FROM crime_scene_report
            WHERE type = 'arson' AND district = 'Lantern Row'
              AND report_date BETWEEN 20240401 AND 20240430`,
    },
    c2s2: {
      sql: `SELECT COUNT(*) FROM keycard_scan
            WHERE building = 'Hall of Records' AND scan_date = 20240418
              AND direction = 'IN' AND scan_time BETWEEN 2200 AND 2359`,
    },
    c2s3: {
      sql: `SELECT p.name FROM person p JOIN interview i ON i.person_id = p.id
            WHERE p.id IN (SELECT person_id FROM keycard_scan
                           WHERE building = 'Hall of Records' AND scan_date = 20240418
                             AND direction = 'IN' AND scan_time BETWEEN 2200 AND 2359)
              AND i.transcript LIKE '%burn ONE drawer%'`,
    },

    /* ---- Case 3 ---- */
    c3s1: {
      sql: `SELECT district FROM crime_scene_report
            WHERE type = 'hit and run' AND report_date = 20240506`,
    },
    c3s2: {
      sql: `SELECT DISTINCT r.plate_number FROM plate_reading r
            JOIN drivers_license l ON l.plate_number = r.plate_number
            WHERE r.read_date = 20240506 AND r.district = 'Tarrow Flats'
              AND r.plate_number LIKE '8%J%'
              AND l.car_model = 'Panel Van' AND l.car_color = 'grey'`,
    },
    c3s3: {
      sql: `SELECT p.name FROM person p JOIN drivers_license l ON l.id = p.license_id
            WHERE l.plate_number = '8QRJ41'`,
    },

    /* ---- Case 4 ---- */
    c4s1: {
      sql: `SELECT description FROM crime_scene_report
            WHERE type = 'burglary' AND report_date = 20240612 AND district = 'Verdigris Hill'`,
      extract: /inventory as "([^"]+)"/,
    },
    c4s2: {
      sql: `SELECT COUNT(DISTINCT person_id) FROM keycard_scan
            WHERE building = 'Nullport Vault' AND scan_date = 20240612
              AND scan_time BETWEEN 100 AND 300 AND direction = 'IN'`,
    },
    c4s3: {
      sql: `SELECT DISTINCT p.name FROM keycard_scan k
            JOIN person p ON p.id = k.person_id
            JOIN employment e ON e.person_id = p.id AND e.company_id = ${VAULT_CO}
            WHERE k.building = 'Nullport Vault' AND k.scan_date = 20240612
              AND k.scan_time BETWEEN 100 AND 300 AND k.direction = 'IN'
              AND e.end_date IS NOT NULL AND e.end_date < 20240612`,
    },
    c4s4: {
      sql: `SELECT c.name FROM bank_transfer t
            JOIN bank_account fa ON fa.id = t.from_account
            JOIN bank_account ta ON ta.id = t.to_account
            JOIN person p ON p.id = ta.person_id
            JOIN company c ON c.id = fa.company_id
            WHERE p.name = 'Delia Marsh' AND t.amount >= 40000`,
    },

    /* ---- Case 5 ---- */
    c5s1: {
      sql: `SELECT transfer_date / 100 AS month FROM bank_transfer
            WHERE from_account = ${MERIDIAN}
            GROUP BY month ORDER BY SUM(amount) DESC LIMIT 1`,
    },
    c5s2: {
      sql: `SELECT COUNT(*) FROM (
              SELECT a.person_id FROM bank_transfer t
              JOIN bank_account a ON a.id = t.to_account
              WHERE t.from_account = ${MERIDIAN}
                AND t.transfer_date BETWEEN 20240501 AND 20240531
              GROUP BY a.person_id HAVING SUM(t.amount) > 100000)`,
    },
    c5s3: {
      sql: `SELECT DISTINCT p.name FROM bank_transfer t
            JOIN person p ON p.id = t.authorised_by
            WHERE t.memo LIKE 'PAYROLL 202405%'`,
    },

    /* ---- Case 6 ---- */
    c6s1: {
      sql: `SELECT COUNT(*) FROM person p JOIN employment e ON e.person_id = p.id
            WHERE e.company_id = ${MERIDIAN_CO}
              AND e.end_date IS NULL AND p.license_id IS NULL`,
    },
    c6s2: {
      sql: `SELECT p.name FROM person p JOIN employment e ON e.person_id = p.id
            WHERE e.company_id = ${MERIDIAN_CO}
              AND e.end_date IS NULL AND p.license_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM keycard_scan k WHERE k.person_id = p.id)`,
    },
    c6s3: {
      sql: `SELECT p.name FROM ferry_manifest f JOIN person p ON p.id = f.person_id
            WHERE (f.sail_date, f.sail_time) IN
                  (SELECT sail_date, sail_time FROM ferry_manifest WHERE person_id = ${GHOST})
              AND f.person_id <> ${GHOST}
            GROUP BY p.id
            HAVING COUNT(*) = (SELECT COUNT(*) FROM ferry_manifest WHERE person_id = ${GHOST})`,
    },

    /* ---- Case 7 ---- */
    c7s1: {
      sql: `SELECT p.name FROM bank_transfer t1
            JOIN bank_transfer t2 ON t2.from_account = t1.to_account
            JOIN bank_account a ON a.id = t2.to_account
            JOIN person p ON p.id = a.person_id
            WHERE t1.from_account = ${IVO_ACCT}`,
    },
    c7s2: {
      sql: `WITH RECURSIVE hop(acct, depth) AS (
              SELECT ${IVO_ACCT}, 0
              UNION ALL
              SELECT t.to_account, hop.depth + 1 FROM bank_transfer t
              JOIN hop ON t.from_account = hop.acct WHERE hop.depth < 40)
            SELECT COUNT(*) FROM hop`,
    },
    c7s3: {
      sql: `WITH RECURSIVE hop(acct, depth) AS (
              SELECT ${IVO_ACCT}, 0
              UNION ALL
              SELECT t.to_account, hop.depth + 1 FROM bank_transfer t
              JOIN hop ON t.from_account = hop.acct WHERE hop.depth < 40)
            SELECT c.name FROM hop
            JOIN bank_account a ON a.id = hop.acct
            JOIN company c ON c.id = a.company_id
            ORDER BY hop.depth DESC LIMIT 1`,
    },

    /* ---- Case 8 ---- */
    c8s1: {
      sql: `SELECT c.caller_number FROM phone_call c
            JOIN phone_line l ON l.number = c.caller_number
            WHERE l.person_id IS NULL AND c.call_date IN (${NIGHTS})
            GROUP BY c.caller_number HAVING COUNT(DISTINCT c.call_date) = 5`,
    },
    c8s2: {
      sql: `SELECT DISTINCT t.name FROM phone_call c
            JOIN cell_tower t ON t.id = c.tower_id
            WHERE c.caller_number = ${BURNER}`,
    },
    c8s3: {
      sql: `WITH ranked AS (
              SELECT receiver_number,
                     ROW_NUMBER() OVER (PARTITION BY call_date ORDER BY duration_sec DESC) rn
              FROM phone_call WHERE caller_number = ${BURNER})
            SELECT DISTINCT p.name FROM ranked r
            JOIN phone_line l ON l.number = r.receiver_number
            JOIN person p ON p.id = l.person_id WHERE r.rn = 1`,
    },
  };

  /** Run one stage's canonical query with a `scalar(sql)` function. */
  function solve(stageId, scalar) {
    const s = SOLUTIONS[stageId];
    if (!s) return null;
    const raw = scalar(s.sql);
    if (raw === null || raw === undefined) return null;
    if (s.extract) {
      const m = String(raw).match(s.extract);
      return m ? m[1] : null;
    }
    return raw;
  }

  root.NullportSolutions = { SOLUTIONS, solve };
})(typeof globalThis !== 'undefined' ? globalThis : this);
