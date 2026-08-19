/* =============================================================================
 * Solution verifier.
 *
 * Runs the canonical query for every stage of the campaign against the freshly
 * generated world and asserts the result is exactly what the case file claims.
 * If this passes, every stage is solvable and unambiguous.
 *
 *   node tools/verify.cjs
 * ========================================================================== */
const { makeDb, all } = require('./dbkit.cjs');

let pass = 0;
let fail = 0;
const failures = [];

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    failures.push(label);
    console.log('  ✗ ' + label + '\n      expected ' + e + '\n      actual   ' + a);
  }
}

makeDb().then(({ db, world }) => {
  const ID = world.ids;
  const S = world.story;
  const col = (sql, c) => all(db, sql).map((r) => r[c]);
  const scalar = (sql) => {
    const r = all(db, sql);
    return r.length ? r[0][Object.keys(r[0])[0]] : null;
  };

  console.log('\nCASE 1 - The Body on Pier 7');
  check('S1 exactly one murder report, Old Quay, 14 Mar',
    scalar(`SELECT COUNT(*) n FROM crime_scene_report
            WHERE type='murder' AND report_date=${S.C1_MURDER} AND district='Old Quay'`), 1);
  check('S1 report names the victim',
    /Halden Roarke/.test(scalar(`SELECT description FROM crime_scene_report
            WHERE type='murder' AND report_date=${S.C1_MURDER} AND district='Old Quay'`)), true);
  check('S1 decoys exist (murder+Old Quay on other dates)',
    scalar(`SELECT COUNT(*) n FROM crime_scene_report WHERE type='murder' AND district='Old Quay'`) > 1, true);
  check('S2 last house on Wexler Row',
    col(`SELECT name FROM person WHERE address_street='Wexler Row'
         ORDER BY address_number DESC LIMIT 1`, 'name'), [S.WITNESS_1]);
  check('S2 no tie on the top address number',
    scalar(`SELECT COUNT(*) n FROM person WHERE address_street='Wexler Row'
            AND address_number=(SELECT MAX(address_number) FROM person WHERE address_street='Wexler Row')`), 1);
  check('S3 the only Odile on Cardamom Lane',
    col(`SELECT name FROM person WHERE name LIKE 'Odile%' AND address_street='Cardamom Lane'`, 'name'),
    [S.WITNESS_2]);
  check('S4 the only Vance couriering for Meridian Freight',
    col(`SELECT name FROM courier_badge WHERE employer='Meridian Freight' AND name LIKE '%Vance%'`, 'name'),
    [S.COURIER]);
  check('S4 other couriers named Vance exist elsewhere (decoy)',
    scalar(`SELECT COUNT(*) n FROM courier_badge WHERE name LIKE '%Vance%'`) >= 1, true);

  console.log('\nCASE 2 - The Last Light on Ashgrove');
  check('S1 exactly one April arson in Lantern Row',
    col(`SELECT report_date FROM crime_scene_report WHERE type='arson' AND district='Lantern Row'
         AND report_date BETWEEN 20240401 AND 20240430`, 'report_date'), [S.C2_ARSON]);
  check('S2 exactly three late entries at the Hall of Records',
    scalar(`SELECT COUNT(*) n FROM keycard_scan WHERE building='Hall of Records'
            AND scan_date=${S.C2_ARSON} AND direction='IN' AND scan_time BETWEEN 2200 AND 2359`), 3);
  check('S2 all three have transcripts to read',
    scalar(`SELECT COUNT(*) n FROM interview WHERE person_id IN (
              SELECT person_id FROM keycard_scan WHERE building='Hall of Records'
              AND scan_date=${S.C2_ARSON} AND direction='IN' AND scan_time BETWEEN 2200 AND 2359)`), 3);
  check('S3 exactly one of the three confesses',
    col(`SELECT p.name FROM person p JOIN interview i ON i.person_id=p.id
         WHERE p.id IN (SELECT person_id FROM keycard_scan WHERE building='Hall of Records'
           AND scan_date=${S.C2_ARSON} AND direction='IN' AND scan_time BETWEEN 2200 AND 2359)
         AND i.transcript LIKE '%burn ONE drawer%'`, 'name'), [S.ARSONIST]);
  check('S3 only the arsonist failed to badge out',
    col(`SELECT p.name FROM person p WHERE p.id IN (
           SELECT person_id FROM keycard_scan WHERE building='Hall of Records'
             AND scan_date=${S.C2_ARSON} AND direction='IN' AND scan_time BETWEEN 2200 AND 2359)
         AND NOT EXISTS (SELECT 1 FROM keycard_scan k2 WHERE k2.person_id=p.id
           AND k2.building='Hall of Records' AND k2.scan_date=${S.C2_ARSON} AND k2.direction='OUT')`,
      'name'), [S.ARSONIST]);

  console.log('\nCASE 3 - Plate 8-?-J');
  check('S1 exactly one hit and run that day',
    scalar(`SELECT COUNT(*) n FROM crime_scene_report WHERE type='hit and run'
            AND report_date=${S.C3_HITRUN}`), 1);
  check('S1 district is Tarrow Flats',
    scalar(`SELECT district FROM crime_scene_report WHERE type='hit and run'
            AND report_date=${S.C3_HITRUN}`), 'Tarrow Flats');
  check('S2 several 8..J plates seen that day (decoys)',
    scalar(`SELECT COUNT(DISTINCT plate_number) n FROM plate_reading
            WHERE read_date=${S.C3_HITRUN} AND district='Tarrow Flats'
            AND plate_number LIKE '8%J%'`) >= 4, true);
  check('S2 exactly one is a grey panel van',
    col(`SELECT DISTINCT r.plate_number FROM plate_reading r
         JOIN drivers_license l ON l.plate_number=r.plate_number
         WHERE r.read_date=${S.C3_HITRUN} AND r.district='Tarrow Flats'
           AND r.plate_number LIKE '8%J%' AND l.car_model='Panel Van' AND l.car_color='grey'`,
      'plate_number'), [S.HITRUN_PLATE]);
  check('S3 the registered keeper',
    col(`SELECT p.name FROM person p JOIN drivers_license l ON l.id=p.license_id
         WHERE l.plate_number='${S.HITRUN_PLATE}'`, 'name'), [S.DRIVER]);

  console.log('\nCASE 4 - Three Nights at the Vault');
  check('S1 exactly one vault burglary report',
    scalar(`SELECT COUNT(*) n FROM crime_scene_report WHERE type='burglary'
            AND report_date=${S.C4_THEFT} AND district='Verdigris Hill'`), 1);
  check('S1 names the stolen item',
    /Ledger 7/.test(scalar(`SELECT description FROM crime_scene_report WHERE type='burglary'
            AND report_date=${S.C4_THEFT} AND district='Verdigris Hill'`)), true);
  check('S2 four people entered in the 01:00-03:00 window',
    scalar(`SELECT COUNT(DISTINCT person_id) n FROM keycard_scan WHERE building='Nullport Vault'
            AND scan_date=${S.C4_THEFT} AND scan_time BETWEEN 100 AND 300 AND direction='IN'`), 4);
  check('S3 exactly one of them no longer worked there',
    col(`SELECT DISTINCT p.name FROM keycard_scan k
         JOIN person p ON p.id=k.person_id
         JOIN employment e ON e.person_id=p.id AND e.company_id=${ID.vaultCompany}
         WHERE k.building='Nullport Vault' AND k.scan_date=${S.C4_THEFT}
           AND k.scan_time BETWEEN 100 AND 300 AND k.direction='IN'
           AND e.end_date IS NOT NULL AND e.end_date < ${S.C4_THEFT}`, 'name'), [S.INSIDER]);
  check('S3 the other three are current staff',
    scalar(`SELECT COUNT(*) n FROM keycard_scan k
            JOIN employment e ON e.person_id=k.person_id AND e.company_id=${ID.vaultCompany}
            WHERE k.building='Nullport Vault' AND k.scan_date=${S.C4_THEFT}
              AND k.scan_time BETWEEN 100 AND 300 AND k.direction='IN'
              AND e.end_date IS NULL`), 3);
  check('S4 who paid her',
    col(`SELECT c.name FROM bank_transfer t
         JOIN bank_account fa ON fa.id=t.from_account
         JOIN bank_account ta ON ta.id=t.to_account
         JOIN person p ON p.id=ta.person_id
         JOIN company c ON c.id=fa.company_id
         WHERE p.name='${S.INSIDER}' AND t.amount >= 40000`, 'name'), ['Meridian Freight']);

  console.log('\nCASE 5 - The Payroll Skim');
  check('S1 May 2024 is the biggest outflow month',
    scalar(`SELECT transfer_date/100 m FROM bank_transfer WHERE from_account=${ID.meridianAccount}
            GROUP BY m ORDER BY SUM(amount) DESC LIMIT 1`), S.C5_MONTH);
  check('S2 exactly two employees took more than 100k in May',
    scalar(`SELECT COUNT(*) n FROM (
              SELECT a.person_id FROM bank_transfer t JOIN bank_account a ON a.id=t.to_account
              WHERE t.from_account=${ID.meridianAccount}
                AND t.transfer_date BETWEEN 20240501 AND 20240531
              GROUP BY a.person_id HAVING SUM(t.amount) > 100000)`), 2);
  check('S2 they are the CFO and the ghost',
    col(`SELECT p.name FROM bank_transfer t JOIN bank_account a ON a.id=t.to_account
         JOIN person p ON p.id=a.person_id
         WHERE t.from_account=${ID.meridianAccount}
           AND t.transfer_date BETWEEN 20240501 AND 20240531
         GROUP BY p.id HAVING SUM(t.amount) > 100000 ORDER BY p.name`, 'name').sort(),
    [S.CFO, S.GHOST].sort());
  check('S3 a single person authorised the payroll run',
    col(`SELECT DISTINCT p.name FROM bank_transfer t JOIN person p ON p.id=t.authorised_by
         WHERE t.from_account=${ID.meridianAccount} AND t.memo LIKE 'PAYROLL 202405%'`, 'name'),
    [S.CFO]);

  console.log('\nCASE 6 - The Ghost on the Manifest');
  check('S1 exactly three current Meridian staff hold no licence',
    scalar(`SELECT COUNT(*) n FROM person p JOIN employment e ON e.person_id=p.id
            WHERE e.company_id=${ID.meridian} AND e.end_date IS NULL AND p.license_id IS NULL`), 3);
  check('S2 only one of them never appears on a door log',
    col(`SELECT p.name FROM person p JOIN employment e ON e.person_id=p.id
         WHERE e.company_id=${ID.meridian} AND e.end_date IS NULL AND p.license_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM keycard_scan k WHERE k.person_id=p.id)`, 'name'), [S.GHOST]);
  check('S2 the ghost has no income record either',
    scalar(`SELECT COUNT(*) n FROM person p LEFT JOIN income i ON i.ssn=p.ssn
            WHERE p.name='${S.GHOST}' AND i.ssn IS NULL`), 1);
  check('S3 the ghost made six sailings',
    scalar(`SELECT COUNT(*) n FROM ferry_manifest WHERE person_id=${ID.people.ghost}`), 6);
  check('S3 exactly one passenger was on every one of them',
    col(`SELECT p.name FROM ferry_manifest f JOIN person p ON p.id=f.person_id
         WHERE (f.sail_date, f.sail_time) IN
               (SELECT sail_date, sail_time FROM ferry_manifest WHERE person_id=${ID.people.ghost})
           AND f.person_id <> ${ID.people.ghost}
         GROUP BY p.id
         HAVING COUNT(DISTINCT f.sail_date) =
                (SELECT COUNT(DISTINCT sail_date) FROM ferry_manifest WHERE person_id=${ID.people.ghost})`,
      'name'), [S.HANDLER]);
  check('S3 near-miss companions exist (partial overlap)',
    scalar(`SELECT COUNT(*) n FROM (
              SELECT f.person_id FROM ferry_manifest f
              WHERE (f.sail_date, f.sail_time) IN
                    (SELECT sail_date, sail_time FROM ferry_manifest WHERE person_id=${ID.people.ghost})
                AND f.person_id <> ${ID.people.ghost}
              GROUP BY f.person_id)`) >= 3, true);

  console.log('\nCASE 7 - Follow the Money');
  const chain = all(db, `
    WITH RECURSIVE hop(acct, depth) AS (
      SELECT ${ID.ivoAccount}, 0
      UNION ALL
      SELECT t.to_account, hop.depth + 1
      FROM bank_transfer t JOIN hop ON t.from_account = hop.acct
      WHERE hop.depth < 40
    )
    SELECT acct, depth FROM hop ORDER BY depth`);
  check('S1 Ivo’s account has exactly one outgoing transfer',
    scalar(`SELECT COUNT(*) n FROM bank_transfer WHERE from_account=${ID.ivoAccount}`), 1);
  check('S1 two hops downstream lands on the second courier',
    col(`SELECT p.name FROM bank_transfer t1
         JOIN bank_transfer t2 ON t2.from_account = t1.to_account
         JOIN bank_account a ON a.id = t2.to_account
         JOIN person p ON p.id = a.person_id
         WHERE t1.from_account = ${ID.ivoAccount}`, 'name'), [S.CHAIN[1]]);
  check('S2 the trail is a single unbranching chain of 7 accounts',
    chain.length, 7);
  check('S2 chain depth (number of hops) is 6', chain[chain.length - 1].depth, 6);
  check('S3 the trail ends at the shell company account',
    chain[chain.length - 1].acct, ID.shellAccount);
  check('S3 that account belongs to the shell company',
    col(`SELECT c.name FROM bank_account a JOIN company c ON c.id=a.company_id
         WHERE a.id=${ID.shellAccount}`, 'name'), [S.SHELL]);
  check('S3 the terminal account never pays out',
    scalar(`SELECT COUNT(*) n FROM bank_transfer WHERE from_account=${ID.shellAccount}`), 0);

  console.log('\nCASE 8 - The Architect');
  const nights = S.C8_NIGHTS.join(',');
  check('S1 exactly one unregistered line called on all five nights',
    col(`SELECT c.caller_number FROM phone_call c
         JOIN phone_line l ON l.number=c.caller_number
         WHERE l.person_id IS NULL AND c.call_date IN (${nights})
         GROUP BY c.caller_number
         HAVING COUNT(DISTINCT c.call_date)=5`, 'caller_number'), [S.BURNER]);
  check('S1 other unregistered lines exist (decoys)',
    scalar(`SELECT COUNT(*) n FROM phone_line WHERE person_id IS NULL`) > 20, true);
  check('S2 every one of its calls used one mast',
    col(`SELECT DISTINCT t.name FROM phone_call c JOIN cell_tower t ON t.id=c.tower_id
         WHERE c.caller_number='${S.BURNER}'`, 'name'), [S.TOWER]);
  check('S3 the longest call each night went to the same number',
    col(`WITH ranked AS (
           SELECT call_date, receiver_number,
                  ROW_NUMBER() OVER (PARTITION BY call_date ORDER BY duration_sec DESC) rn
           FROM phone_call WHERE caller_number='${S.BURNER}')
         SELECT DISTINCT receiver_number FROM ranked WHERE rn=1`, 'receiver_number'),
    [S.ARCHITECT_PHONE]);
  check('S3 that number unmasks the Architect',
    col(`WITH ranked AS (
           SELECT call_date, receiver_number,
                  ROW_NUMBER() OVER (PARTITION BY call_date ORDER BY duration_sec DESC) rn
           FROM phone_call WHERE caller_number='${S.BURNER}')
         SELECT DISTINCT p.name FROM ranked r
         JOIN phone_line l ON l.number=r.receiver_number
         JOIN person p ON p.id=l.person_id WHERE r.rn=1`, 'name'), [S.ARCHITECT]);
  check('S3 there were shorter decoy calls to rule out',
    scalar(`SELECT COUNT(DISTINCT receiver_number) n FROM phone_call
            WHERE caller_number='${S.BURNER}'`) >= 4, true);
  check('epilogue: she chairs all four front companies',
    scalar(`SELECT COUNT(*) n FROM board_member
            WHERE person_id=${ID.people.architect} AND role='chair'`), 4);

  console.log('\nGENERAL INTEGRITY');
  check('no orphan person.license_id',
    scalar(`SELECT COUNT(*) n FROM person p WHERE p.license_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM drivers_license l WHERE l.id=p.license_id)`), 0);
  check('no orphan person.ssn',
    scalar(`SELECT COUNT(*) n FROM person p WHERE p.ssn IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM income i WHERE i.ssn=p.ssn)`), 0);
  check('no orphan employment.person_id',
    scalar(`SELECT COUNT(*) n FROM employment e
            WHERE NOT EXISTS (SELECT 1 FROM person p WHERE p.id=e.person_id)`), 0);
  check('no orphan bank_transfer accounts',
    scalar(`SELECT COUNT(*) n FROM bank_transfer t
            WHERE NOT EXISTS (SELECT 1 FROM bank_account a WHERE a.id=t.from_account)
               OR NOT EXISTS (SELECT 1 FROM bank_account a WHERE a.id=t.to_account)`), 0);
  check('no orphan phone_call numbers',
    scalar(`SELECT COUNT(*) n FROM phone_call c
            WHERE NOT EXISTS (SELECT 1 FROM phone_line l WHERE l.number=c.caller_number)
               OR NOT EXISTS (SELECT 1 FROM phone_line l WHERE l.number=c.receiver_number)`), 0);
  check('every bank_account has exactly one owner',
    scalar(`SELECT COUNT(*) n FROM bank_account
            WHERE (person_id IS NULL AND company_id IS NULL)
               OR (person_id IS NOT NULL AND company_id IS NOT NULL)`), 0);
  check('person names are unique',
    scalar(`SELECT COUNT(*) n FROM (SELECT name FROM person GROUP BY name HAVING COUNT(*)>1)`), 0);
  check('plate numbers are unique',
    scalar(`SELECT COUNT(*) n FROM (SELECT plate_number FROM drivers_license
            GROUP BY plate_number HAVING COUNT(*)>1)`), 0);

  console.log('\n' + '='.repeat(58));
  console.log(pass + ' passed, ' + fail + ' failed');
  if (fail) {
    console.log('\nFAILED:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log('All stages solvable and unambiguous.');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
