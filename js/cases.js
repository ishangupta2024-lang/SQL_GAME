/* =============================================================================
 * NULLPORT — the campaign.
 *
 * Eight cases, twenty-six stages. Every stage gates the next: you cannot open
 * Case 4 until Case 3 is closed. Answers are stored as hashes (see answer.js).
 *
 * Difficulty ladder, one rung per case:
 *   1 SELECT / WHERE / AND / ORDER BY / LIMIT / LIKE
 *   2 BETWEEN / COUNT / DISTINCT / IN
 *   3 JOIN (two tables, then three)
 *   4 multi-table JOIN, LEFT JOIN, NULL logic, date comparison
 *   5 GROUP BY / HAVING / SUM / aggregate ordering
 *   6 subqueries, NOT EXISTS, correlated counting
 *   7 self-join, then WITH RECURSIVE
 *   8 CTEs + window functions (ROW_NUMBER OVER PARTITION BY)
 * ========================================================================== */
(function (root) {
  'use strict';

  const PROLOGUE = {
    title: 'Nullport',
    lines: [
      'Nullport keeps two sets of books. There is the city you can walk through — the ' +
      'cranes, the ferry horn at six, the rain coming sideways off the water — and there is ' +
      'the city written down.',
      'You have been given a terminal and read access to everything the Bureau holds. ' +
      'Door logs. Ferry manifests. Bank transfers. Every call that crossed a mast in the ' +
      'last year. It is all there, and there is far too much of it for anyone to read.',
      'That is the job. Not reading. <em>Asking</em>.',
      'Eight files are open on your desk. They were filed as eight separate crimes. ' +
      'They are not eight separate crimes.',
    ],
    signoff: '— M. Hollow, Deputy Commissioner',
  };

  const RANKS = [
    'Cadet', 'Constable', 'Detective, Third Grade', 'Detective, Second Grade',
    'Detective, First Grade', 'Inspector', 'Chief Inspector', 'Superintendent',
    'Commissioner of the Nullport Bureau',
  ];

  /* ------------------------------------------------------------------------ */

  const CASES = [

  /* ============================== CASE 1 ================================= */
  {
    id: 'c1',
    number: 1,
    title: 'The Body on Pier 7',
    tier: 'Rookie',
    concepts: ['SELECT', 'FROM', 'WHERE', 'AND', 'ORDER BY', 'LIMIT', 'LIKE'],
    hook: 'A dock loader goes into the water. Two people saw it happen. Neither is named in the file.',
    opening: [
      'The tide brought him back at a quarter past eleven. Halden Roarke, forty years on the ' +
      'cranes, face down under Pier 7 with his wage packet still in his coat — so not a robbery.',
      'The attending officer filed a report the same night. It is somewhere in a table of ' +
      'fourteen hundred reports, and nobody wrote down its number. You know three things: it ' +
      'was a <strong>murder</strong>, it happened on <strong>14 March 2024</strong>, and it ' +
      'happened in <strong>Old Quay</strong>.',
      'Find the report. Everything else follows from it.',
    ],
    primer: {
      heading: 'Asking a database a question',
      blocks: [
        { t: 'p', v: 'A query has two compulsory parts and one you will use constantly:' },
        { t: 'code', v: 'SELECT  which columns you want\nFROM    which table they live in\nWHERE   which rows qualify' },
        { t: 'p', v: '<code>SELECT *</code> means <em>every column</em>. Start there when you are exploring — you cannot spot a clue in a column you did not ask for.' },
        { t: 'code', v: "SELECT * FROM crime_scene_report\nWHERE district = 'Old Quay';" },
        { t: 'p', v: 'Chain conditions with <code>AND</code> to narrow the net. Every condition must hold for a row to come back.' },
        { t: 'code', v: "SELECT * FROM person\nWHERE address_street = 'Cordage Street'\n  AND district = 'Old Quay';" },
        { t: 'note', v: 'Text goes in single quotes and <strong>is</strong> case-sensitive: <code>\'Old Quay\'</code> matches, <code>\'old quay\'</code> does not. Keywords like SELECT are not case-sensitive — we shout them out of habit, so they stand out from the data.' },
        { t: 'p', v: 'Dates in this database are plain integers shaped <code>YYYYMMDD</code>. The fourteenth of March 2024 is <code>20240314</code>. That makes them easy to compare with <code>=</code>, <code>&lt;</code> and <code>&gt;</code>.' },
      ],
    },
    stages: [
      {
        id: 'c1s1',
        title: 'The Report',
        teaches: 'WHERE … AND …',
        prompt: 'Pull the murder report filed on 14 March 2024 in Old Quay. There are other murders in Old Quay and other reports from that day — you need all three conditions at once to land on the right one.',
        ask: 'Who was the victim?',
        placeholder: 'full name',
        starter: "SELECT *\nFROM crime_scene_report\nWHERE district = 'Old Quay';",
        hints: [
          'The table is <code>crime_scene_report</code>. Look at its columns first — <code>SELECT * FROM crime_scene_report LIMIT 5;</code> — and notice it has <code>report_date</code>, <code>type</code> and <code>district</code>.',
          'You need three conditions joined by <code>AND</code>: the type is <code>\'murder\'</code>, the district is <code>\'Old Quay\'</code>, and <code>report_date</code> equals the integer <code>20240314</code>. Drop any one of them and you will get several rows back.',
          "<code>SELECT * FROM crime_scene_report WHERE type = 'murder' AND report_date = 20240314 AND district = 'Old Quay';</code> — then read the <code>description</code> column in full.",
        ],
        answers: ['cl7qdby4u8'],
        reveal: 'The description is short and it is a set of instructions: two residents called it in. The first lives in the <strong>last house on Wexler Row</strong>. The second is a woman named <strong>Odile</strong>, somewhere on <strong>Cardamom Lane</strong>. Neither is named. Find them.',
      },
      {
        id: 'c1s2',
        title: 'The Last House',
        teaches: 'ORDER BY … DESC, LIMIT',
        prompt: '"The last house on Wexler Row" means the highest street number on that road. There are thousands of residents; you cannot scroll for it. Sort the street by number, largest first, and take the top row.',
        ask: 'Name the first witness.',
        placeholder: 'full name',
        starter: "SELECT *\nFROM person\nWHERE address_street = 'Wexler Row';",
        hints: [
          '<code>ORDER BY</code> sorts your results by a column. Add <code>DESC</code> after it to go largest-first instead of smallest-first.',
          'Filter to Wexler Row with <code>WHERE</code>, sort by <code>address_number DESC</code>, then use <code>LIMIT 1</code> to keep only the top row.',
          "<code>SELECT * FROM person WHERE address_street = 'Wexler Row' ORDER BY address_number DESC LIMIT 1;</code>",
        ],
        answers: ['h2i55x0s6o'],
        reveal: 'Nolan Fitch, seventy-one, four decades in the same house at the dead end of Wexler Row. His statement is already on file — you will want it in a moment.',
      },
      {
        id: 'c1s3',
        title: 'A Woman Named Odile',
        teaches: "LIKE with the % wildcard",
        prompt: 'You have a first name and a street, and nothing else. <code>=</code> will not help you here — you need to match the <em>beginning</em> of a name and let the rest be anything.',
        ask: 'Name the second witness.',
        placeholder: 'full name',
        starter: "SELECT *\nFROM person\nWHERE address_street = 'Cardamom Lane';",
        hints: [
          'The <code>%</code> wildcard stands for "anything, or nothing". <code>\'Odile%\'</code> matches Odile followed by any surname. Wildcards need <code>LIKE</code>, never <code>=</code>.',
          "Combine it with the street: <code>WHERE name LIKE 'Odile%' AND address_street = 'Cardamom Lane'</code>.",
          "<code>SELECT * FROM person WHERE name LIKE 'Odile%' AND address_street = 'Cardamom Lane';</code>",
        ],
        answers: ['1ylsircf37d'],
        reveal: 'Odile Sarratt, thirty-four. Now read what both of them told the Bureau — the <code>interview</code> table is keyed by <code>person_id</code>, and you have both ids from the queries you just ran.',
      },
      {
        id: 'c1s4',
        title: 'The Courier',
        teaches: 'Using an id from one query in the next',
        prompt: 'Read both transcripts. <code>SELECT * FROM interview WHERE person_id = …</code> for each witness. Between them they give you a surname, an employer, and one more table to look in.',
        ask: 'Name the courier who ran from the pier.',
        placeholder: 'full name',
        starter: 'SELECT * FROM interview\nWHERE person_id = 0;   -- put a real id here',
        hints: [
          'Both witnesses describe a courier. One read a surname off the badge; the other names the employer. The <code>courier_badge</code> table carries the badge holder\'s <code>name</code> right next to the <code>employer</code> — no join required.',
          "Search it with a wildcard on both sides of the surname, since you only know part of the name: <code>name LIKE '%Vance%'</code>, plus <code>employer = 'Meridian Freight'</code>.",
          "<code>SELECT * FROM courier_badge WHERE employer = 'Meridian Freight' AND name LIKE '%Vance%';</code>",
        ],
        answers: ['1j981ecpj5k'],
        reveal: 'Petra Vance, badge MF-2287, active. She was picked up in Ironhaven the following week and she talked — but only about paper.',
      },
    ],
    epilogue: [
      '<em>Vance, interview room 2:</em> "I collected a satchel. I did not open it. The instructions ' +
      'come typed, never signed. If you want the thread that ties the job together it is in the ' +
      'employment archive at the Hall of Records on Ashgrove Street."',
      'The Hall of Records burned down five weeks later.',
    ],
  },

  /* ============================== CASE 2 ================================= */
  {
    id: 'c2',
    number: 2,
    title: 'The Last Light on Ashgrove',
    tier: 'Rookie',
    concepts: ['BETWEEN', 'COUNT', 'DISTINCT', 'IN', 'subquery basics'],
    hook: 'Somebody burned one drawer of an archive and left the rest of the building standing.',
    opening: [
      'Arson is usually greed or spite, and either way it takes the whole building. This one took ' +
      'a single drawer of the employment archive and stopped. Whoever set it knew exactly what ' +
      'they had come for.',
      'You do not have the date. You know it was <strong>April 2024</strong> and it was in ' +
      '<strong>Lantern Row</strong>. The night warden\'s door log survived the fire.',
    ],
    primer: {
      heading: 'Ranges, counting, and matching a list',
      blocks: [
        { t: 'p', v: 'When you know a range rather than a value, <code>BETWEEN</code> is cleaner than two comparisons. It is inclusive at both ends.' },
        { t: 'code', v: 'WHERE report_date BETWEEN 20240401 AND 20240430' },
        { t: 'p', v: '<code>COUNT(*)</code> tells you how many rows matched, without listing them. It is the fastest way to know whether you have narrowed far enough.' },
        { t: 'code', v: "SELECT COUNT(*) FROM keycard_scan WHERE building = 'Customs House';" },
        { t: 'p', v: '<code>DISTINCT</code> collapses duplicates — the quickest way to learn what values a column actually contains when nobody handed you documentation.' },
        { t: 'code', v: 'SELECT DISTINCT type FROM crime_scene_report;' },
        { t: 'p', v: 'And <code>IN</code> matches against a list, which saves stringing <code>OR</code> together:' },
        { t: 'code', v: 'SELECT * FROM person WHERE id IN (412, 3390, 5106);' },
        { t: 'note', v: 'Times are integers too, shaped <code>HHMM</code>. Ten in the evening is <code>2200</code>; one minute to midnight is <code>2359</code>.' },
      ],
    },
    stages: [
      {
        id: 'c2s1',
        title: 'Finding the Night',
        teaches: 'BETWEEN',
        prompt: 'Find the arson report filed in Lantern Row at some point in April 2024. You do not know the day, so match the whole month as a range.',
        ask: 'What date was the fire? (as YYYYMMDD)',
        placeholder: 'e.g. 20240101',
        starter: "SELECT *\nFROM crime_scene_report\nWHERE type = 'arson';",
        hints: [
          'April 2024 as integers runs from <code>20240401</code> to <code>20240430</code>.',
          'Three conditions: the type is <code>\'arson\'</code>, the district is <code>\'Lantern Row\'</code>, and <code>report_date BETWEEN 20240401 AND 20240430</code>.',
          "<code>SELECT * FROM crime_scene_report WHERE type = 'arson' AND district = 'Lantern Row' AND report_date BETWEEN 20240401 AND 20240430;</code>",
        ],
        answers: ['1v35y51qfqw', 'vrzm9be6eu', '13sfoc1zppi', '1umwc4eew0o'],
        reveal: 'The eighteenth. The report points you straight at the door log: keycards used to enter the building between 22:00 and 23:59 that night.',
      },
      {
        id: 'c2s2',
        title: 'The Door Log',
        teaches: 'COUNT(*) with a time range',
        prompt: 'Count the entries — <code>direction = \'IN\'</code> — at the Hall of Records on the night of the fire, between 22:00 and 23:59.',
        ask: 'How many people entered in that window?',
        placeholder: 'a number',
        starter: "SELECT *\nFROM keycard_scan\nWHERE building = 'Hall of Records';",
        hints: [
          'Four conditions: the building, the <code>scan_date</code>, <code>direction = \'IN\'</code>, and the time range.',
          '22:00 to 23:59 as integers is <code>scan_time BETWEEN 2200 AND 2359</code>. Wrap the whole thing in <code>SELECT COUNT(*)</code>.',
          "<code>SELECT COUNT(*) FROM keycard_scan WHERE building = 'Hall of Records' AND scan_date = 20240418 AND direction = 'IN' AND scan_time BETWEEN 2200 AND 2359;</code>",
        ],
        answers: ['7c0gf6t1ug', '19u4lgwzd02'],
        reveal: 'Three cards. Swap <code>COUNT(*)</code> back to <code>*</code> and write down the three <code>person_id</code> values — you will need them.',
      },
      {
        id: 'c2s3',
        title: 'Three Names',
        teaches: 'IN with a list of ids',
        prompt: 'Turn those three ids into three people, then read what all three said. One of them is telling you something the other two are not.',
        ask: 'Who set the fire?',
        placeholder: 'full name',
        starter: 'SELECT * FROM person\nWHERE id IN (0, 0, 0);   -- your three ids',
        hints: [
          'Two queries. <code>SELECT * FROM person WHERE id IN (…)</code> gives you the names; <code>SELECT * FROM interview WHERE person_id IN (…)</code> gives you the transcripts.',
          'Read all three transcripts to the end. Two are unremarkable night-shift statements. The third is a confession, and it names what was burned and who ordered it.',
          "<code>SELECT p.name, i.transcript FROM person p JOIN interview i ON i.person_id = p.id WHERE p.id IN (…your three ids…);</code> — or just run the two simple queries separately.",
        ],
        answers: ['au9fgov9hv'],
        reveal: 'Osric Blayne. Paid to burn one drawer: the employment file for <strong>Meridian Freight</strong> — the same firm Petra Vance couriers for. The work order was unsigned but for two initials in the corner: <strong>V.A.</strong>',
      },
    ],
    epilogue: [
      'Two cases, one haulage company. That is a coincidence. A third would not be.',
      'You get a third eighteen days later, when a witness to the fire is killed crossing Ferrous Lane.',
    ],
  },

  /* ============================== CASE 3 ================================= */
  {
    id: 'c3',
    number: 3,
    title: 'Plate 8-?-J',
    tier: 'Intermediate',
    concepts: ['JOIN', 'ON', 'table aliases', 'joining three tables'],
    hook: 'A partial plate, a grey van, and sixteen thousand camera readings.',
    opening: [
      'Ferrous Lane, half past seven in the evening, hard rain. The van did not stop. The victim ' +
      'had given a statement about the Hall of Records fire nine days earlier.',
      'The camera caught the plate badly: it <strong>begins with 8</strong> and it ' +
      '<strong>contains a J</strong>. That is all. But a plate on a camera is only a string of ' +
      'characters — to turn it into a person you have to walk it through two more tables.',
    ],
    primer: {
      heading: 'JOIN — using two tables at once',
      blocks: [
        { t: 'p', v: 'Everything so far lived in one table. Real questions cross tables: the cameras record a <em>plate</em>, the licence register knows what <em>car</em> that plate is, and the person register knows who <em>holds</em> that licence.' },
        { t: 'p', v: '<code>JOIN</code> stitches two tables together on a column they share. <code>ON</code> says which column.' },
        { t: 'code', v: 'SELECT person.name, drivers_license.car_make\nFROM person\nJOIN drivers_license\n  ON drivers_license.id = person.license_id;' },
        { t: 'p', v: 'Give tables short aliases so you are not typing the full name every time. <code>FROM person p</code> means "call it p from now on".' },
        { t: 'code', v: 'SELECT p.name, l.car_make, l.car_color\nFROM person p\nJOIN drivers_license l ON l.id = p.license_id\nWHERE l.car_color = \'grey\';' },
        { t: 'note', v: 'Look at the schema panel on the left. A gold key is a primary key; an arrow is a foreign key pointing at another table. Those arrows are your join conditions — <code>person.license_id</code> points at <code>drivers_license.id</code>.' },
        { t: 'p', v: 'You can chain as many joins as you like. Three tables is just two joins.' },
      ],
    },
    stages: [
      {
        id: 'c3s1',
        title: 'The Report',
        teaches: 'revision — WHERE',
        prompt: 'Find the hit and run report from 6 May 2024. There is only one that day.',
        ask: 'Which district was it in?',
        placeholder: 'district name',
        starter: "SELECT *\nFROM crime_scene_report\nWHERE type = 'hit and run';",
        hints: [
          'Two conditions: the type and the <code>report_date</code>.',
          'The type value is written exactly <code>\'hit and run\'</code> — lowercase, spaces, no hyphens.',
          "<code>SELECT * FROM crime_scene_report WHERE type = 'hit and run' AND report_date = 20240506;</code>",
        ],
        answers: ['1ssocsct64o'],
        reveal: 'Tarrow Flats. The report adds one detail the camera could not: the vehicle was a <strong>grey panel van</strong>.',
      },
      {
        id: 'c3s2',
        title: 'Matching the Plate',
        teaches: 'JOIN two tables',
        prompt: 'Several plates beginning with 8 and containing a J passed that camera that day. Only one of them belongs to a grey panel van. The readings are in <code>plate_reading</code>; the vehicle description is in <code>drivers_license</code>. Join them on the plate.',
        ask: 'What is the full plate number?',
        placeholder: 'e.g. 4XYZ99',
        starter: "SELECT *\nFROM plate_reading\nWHERE read_date = 20240506\n  AND district = 'Tarrow Flats';",
        hints: [
          "A plate that starts with 8 and contains a J is <code>plate_number LIKE '8%J%'</code>. Try that on <code>plate_reading</code> alone first and see how many candidates you get.",
          'Now join: <code>FROM plate_reading r JOIN drivers_license l ON l.plate_number = r.plate_number</code>, then filter on <code>l.car_model</code> and <code>l.car_color</code>.',
          "<code>SELECT DISTINCT r.plate_number FROM plate_reading r JOIN drivers_license l ON l.plate_number = r.plate_number WHERE r.read_date = 20240506 AND r.district = 'Tarrow Flats' AND r.plate_number LIKE '8%J%' AND l.car_model = 'Panel Van' AND l.car_color = 'grey';</code>",
        ],
        answers: ['286bofmo7v9'],
        reveal: 'One plate. Now turn it into a name.',
      },
      {
        id: 'c3s3',
        title: 'The Keeper',
        teaches: 'JOIN in the other direction',
        prompt: 'A licence does not name its holder — the <code>person</code> table does, through <code>person.license_id</code>. Join back the other way.',
        ask: 'Who was driving?',
        placeholder: 'full name',
        starter: "SELECT *\nFROM drivers_license\nWHERE plate_number = '';",
        hints: [
          'The link is <code>person.license_id = drivers_license.id</code>.',
          'You can do it in one query from the plate: join <code>person</code> to <code>drivers_license</code> and filter on <code>plate_number</code>.',
          "<code>SELECT p.name FROM person p JOIN drivers_license l ON l.id = p.license_id WHERE l.plate_number = '8QRJ41';</code>",
        ],
        answers: ['5l2pof1yhl'],
        reveal: 'Corvin Ashby, of Ferrous Lane — he killed a man ninety metres from his own front door.',
      },
    ],
    epilogue: [
      '<em>Ashby, on the record:</em> "I was told where to be and which way he would walk. The order ' +
      'did not come from a person. It came from a room — the fourth floor of the Nullport Vault."',
      'Five weeks later, somebody went into that room and took exactly one book off the shelf.',
    ],
  },

  /* ============================== CASE 4 ================================= */
  {
    id: 'c4',
    number: 4,
    title: 'Three Nights at the Vault',
    tier: 'Intermediate',
    concepts: ['multi-table JOIN', 'LEFT JOIN', 'IS NULL', 'COUNT(DISTINCT …)'],
    hook: 'Four keycards opened a door at two in the morning. One of them should not have worked.',
    opening: [
      'The Nullport Vault holds bearer bonds, deeds and eleven tonnes of other people\'s ' +
      'certainty. The thief walked past all of it and took a bound book listed on the inventory ' +
      'as <strong>Ledger 7</strong>.',
      'No forced entry. A valid card, used between one and three in the morning on ' +
      '<strong>12 June 2024</strong>. Four cards opened that door in that window. Three of them ' +
      'belonged to people who worked there.',
    ],
    primer: {
      heading: 'Joins that are allowed to fail',
      blocks: [
        { t: 'p', v: 'A plain <code>JOIN</code> only keeps rows that match on both sides. If a person has no employment record, an inner join to <code>employment</code> silently drops them — and in an investigation, the person who is <em>missing</em> from a table is often the answer.' },
        { t: 'p', v: '<code>LEFT JOIN</code> keeps every row from the left table and fills the right side with <code>NULL</code> when there is no match.' },
        { t: 'code', v: 'SELECT p.name, e.role\nFROM person p\nLEFT JOIN employment e ON e.person_id = p.id\nWHERE e.id IS NULL;      -- people with no job on file' },
        { t: 'note', v: '<code>NULL</code> means "no value". It is not zero and not an empty string, and <code>= NULL</code> never matches anything. Always test it with <code>IS NULL</code> or <code>IS NOT NULL</code>.' },
        { t: 'p', v: '<code>COUNT(DISTINCT column)</code> counts unique values rather than rows — useful when one person appears several times in a log.' },
        { t: 'code', v: 'SELECT COUNT(DISTINCT person_id) FROM keycard_scan;' },
      ],
    },
    stages: [
      {
        id: 'c4s1',
        title: 'The Inventory',
        teaches: 'revision',
        prompt: 'Find the burglary report for the Nullport Vault: 12 June 2024, Verdigris Hill.',
        ask: 'What was taken?',
        placeholder: 'the item name',
        starter: "SELECT *\nFROM crime_scene_report\nWHERE report_date = 20240612;",
        hints: [
          'Filter on <code>type</code>, <code>report_date</code> and <code>district</code>.',
          "The type is <code>'burglary'</code> and the district is <code>'Verdigris Hill'</code>.",
          "<code>SELECT * FROM crime_scene_report WHERE type = 'burglary' AND report_date = 20240612 AND district = 'Verdigris Hill';</code>",
        ],
        answers: ['1scl4qw41r1'],
        reveal: 'Ledger 7 — and the report tells you where to look: every scan on that building between 01:00 and 03:00.',
      },
      {
        id: 'c4s2',
        title: 'The Window',
        teaches: 'COUNT(DISTINCT …)',
        prompt: 'Count how many <em>different people</em> badged into the Nullport Vault between 01:00 and 03:00 that night.',
        ask: 'How many people?',
        placeholder: 'a number',
        starter: "SELECT *\nFROM keycard_scan\nWHERE building = 'Nullport Vault'\n  AND scan_date = 20240612;",
        hints: [
          'The window as integers is <code>scan_time BETWEEN 100 AND 300</code>. Do not forget <code>direction = \'IN\'</code>.',
          'Each person may have more than one scan, so count unique <code>person_id</code> values, not rows.',
          "<code>SELECT COUNT(DISTINCT person_id) FROM keycard_scan WHERE building = 'Nullport Vault' AND scan_date = 20240612 AND scan_time BETWEEN 100 AND 300 AND direction = 'IN';</code>",
        ],
        answers: ['27frmvemj82', '29tzwjbso1k'],
        reveal: 'Four. Now find out which of the four had no business holding a working card.',
      },
      {
        id: 'c4s3',
        title: 'The Card That Should Not Have Worked',
        teaches: 'three-table JOIN + date comparison',
        prompt: 'Join those four scans to <code>person</code>, and then to <code>employment</code> at the Vault. Three are current staff — their <code>end_date</code> is <code>NULL</code>. One left the company before the theft.',
        ask: 'Whose card opened the door?',
        placeholder: 'full name',
        starter: "SELECT k.person_id, p.name\nFROM keycard_scan k\nJOIN person p ON p.id = k.person_id\nWHERE k.building = 'Nullport Vault'\n  AND k.scan_date = 20240612\n  AND k.scan_time BETWEEN 100 AND 300\n  AND k.direction = 'IN';",
        hints: [
          'The employer is the company called <code>Nullport Vault &amp; Trust</code>. Find its <code>id</code> in the <code>company</code> table first.',
          'Add <code>JOIN employment e ON e.person_id = p.id</code> and look at <code>e.end_date</code> for each of the four. A current employee has <code>NULL</code> there.',
          "Add to the query in the box: <code>JOIN employment e ON e.person_id = p.id AND e.company_id = (SELECT id FROM company WHERE name = 'Nullport Vault &amp; Trust')</code> and then <code>AND e.end_date IS NOT NULL</code>.",
        ],
        answers: ['jmu962avg9'],
        reveal: 'Delia Marsh, shift manager, employment terminated on 1 April. Her card stayed live for ten more weeks. That is not an oversight — somebody kept it alive.',
      },
      {
        id: 'c4s4',
        title: 'Who Paid Her',
        teaches: 'joining a table to itself twice',
        prompt: 'A large payment landed in her account a week before the theft. Trace it: <code>bank_transfer</code> references <code>bank_account</code> <em>twice</em> — once for the sender and once for the receiver — so you must join that table in twice, under two different aliases.',
        ask: 'Which company paid her?',
        placeholder: 'company name',
        starter: "SELECT *\nFROM bank_account\nWHERE person_id = 0;   -- Delia's person id",
        hints: [
          'Find her account id first: <code>SELECT * FROM bank_account WHERE person_id = …</code>. Then look for transfers where <code>to_account</code> is that id and the <code>amount</code> is large.',
          'To name the sender you need the sending account\'s owner: join <code>bank_account</code> again as a second alias on <code>t.from_account</code>, then join <code>company</code> to <em>its</em> <code>company_id</code>.',
          "<code>SELECT c.name, t.amount FROM bank_transfer t JOIN bank_account ta ON ta.id = t.to_account JOIN bank_account fa ON fa.id = t.from_account JOIN person p ON p.id = ta.person_id JOIN company c ON c.id = fa.company_id WHERE p.name = 'Delia Marsh' AND t.amount &gt;= 40000;</code>",
        ],
        answers: ['5viomgjgzo'],
        reveal: 'Seventy-five thousand, straight out of the Meridian Freight house account, memo line "consultancy".',
      },
    ],
    epilogue: [
      '<em>Marsh:</em> "Look at what else that account pays out and you will see it is not a haulage ' +
      'firm at all. Look at May."',
      'So you look at May.',
    ],
  },

  /* ============================== CASE 5 ================================= */
  {
    id: 'c5',
    number: 5,
    title: 'The Payroll Skim',
    tier: 'Advanced',
    concepts: ['GROUP BY', 'SUM', 'HAVING', 'ordering by an aggregate'],
    hook: 'A haulage firm with ninety staff moved more money in one month than in the previous four.',
    opening: [
      'Meridian Freight has appeared in three cases now: it employs the courier, it lost the ' +
      'archive drawer, and it paid the woman who opened the vault. Its house account is the ' +
      'centre of gravity.',
      'You are no longer looking for a row. You are looking for a <em>pattern</em> — and that ' +
      'means you have to stop asking "which rows" and start asking "how much, grouped by what".',
    ],
    primer: {
      heading: 'Aggregation — asking about groups',
      blocks: [
        { t: 'p', v: '<code>GROUP BY</code> folds many rows into one row per group, and the aggregate functions describe each group: <code>SUM</code>, <code>COUNT</code>, <code>AVG</code>, <code>MIN</code>, <code>MAX</code>.' },
        { t: 'code', v: 'SELECT district, COUNT(*) AS reports\nFROM crime_scene_report\nGROUP BY district\nORDER BY reports DESC;' },
        { t: 'p', v: 'Anything in <code>SELECT</code> that is not inside an aggregate should be in <code>GROUP BY</code>. Read it as: "one row per district, and for each, the count".' },
        { t: 'p', v: '<code>WHERE</code> filters rows <em>before</em> grouping. <code>HAVING</code> filters groups <em>after</em>. This is the distinction the whole case turns on.' },
        { t: 'code', v: 'SELECT person_id, SUM(amount) AS total\nFROM bank_transfer\nWHERE transfer_date BETWEEN 20240101 AND 20240131   -- rows first\nGROUP BY person_id\nHAVING total > 50000;                               -- then groups' },
        { t: 'note', v: 'Dates are <code>YYYYMMDD</code> integers, so integer division by 100 gives you the month: <code>transfer_date / 100</code> turns <code>20240514</code> into <code>202405</code>. That is a perfectly good thing to <code>GROUP BY</code>.' },
      ],
    },
    stages: [
      {
        id: 'c5s1',
        title: 'The Fat Month',
        teaches: 'GROUP BY + SUM + ORDER BY an aggregate',
        prompt: 'Take every transfer <em>out of</em> the Meridian Freight house account, group it by month, and find the month with the largest total.',
        ask: 'Which month? (as YYYYMM)',
        placeholder: 'e.g. 202401',
        starter: "-- First find the account:\nSELECT * FROM bank_account\nWHERE company_id = (SELECT id FROM company WHERE name = 'Meridian Freight');",
        hints: [
          'A company account has a <code>company_id</code> and a <code>NULL</code> <code>person_id</code>. Get its <code>id</code>, then filter <code>bank_transfer</code> on <code>from_account</code>.',
          'Group by <code>transfer_date / 100</code> and select <code>SUM(amount)</code> alongside it. Sort descending and take the top row.',
          "<code>SELECT transfer_date / 100 AS month, SUM(amount) AS total FROM bank_transfer WHERE from_account = (SELECT id FROM bank_account WHERE company_id = (SELECT id FROM company WHERE name = 'Meridian Freight')) GROUP BY month ORDER BY total DESC LIMIT 1;</code>",
        ],
        answers: ['v6vxxbt76w', '1nk7ulm346a', 'qb7bwn6m7h'],
        reveal: 'May 2024 — roughly three times any other month. The excess did not go to ninety people. It went to two.',
      },
      {
        id: 'c5s2',
        title: 'Two Names Too Many',
        teaches: 'HAVING',
        prompt: 'In May, group Meridian\'s outgoing payments by recipient and total them. Normal salary payments are a few thousand. Keep only the groups above 100,000.',
        ask: 'How many recipients cleared 100,000 that month?',
        placeholder: 'a number',
        starter: "SELECT *\nFROM bank_transfer\nWHERE transfer_date BETWEEN 20240501 AND 20240531;",
        hints: [
          'Join <code>bank_transfer</code> to <code>bank_account</code> on <code>to_account</code> so you can group by the recipient.',
          'Group by the recipient\'s <code>person_id</code>, then filter the groups with <code>HAVING SUM(t.amount) &gt; 100000</code>.',
          "<code>SELECT a.person_id, SUM(t.amount) AS total FROM bank_transfer t JOIN bank_account a ON a.id = t.to_account WHERE t.from_account = …meridian… AND t.transfer_date BETWEEN 20240501 AND 20240531 GROUP BY a.person_id HAVING total &gt; 100000;</code>",
        ],
        answers: ['191k26b1v5n', '1alrkdnglkl'],
        reveal: 'Two. Join those <code>person_id</code>s to <code>person</code> and read the names — one of them you can look up in a dozen other tables. The other you cannot.',
      },
      {
        id: 'c5s3',
        title: 'The Signature',
        teaches: 'aggregating a joined column',
        prompt: 'Every payroll transfer carries an <code>authorised_by</code> column pointing at a <code>person</code>. Find who signed off the May run.',
        ask: 'Who authorised the payments?',
        placeholder: 'full name',
        starter: "SELECT DISTINCT authorised_by\nFROM bank_transfer\nWHERE memo LIKE 'PAYROLL 202405%';",
        hints: [
          '<code>authorised_by</code> holds a <code>person.id</code>. Join it to <code>person</code> to get a name.',
          "Filter with <code>memo LIKE 'PAYROLL 202405%'</code> and use <code>DISTINCT</code> — there is only one signatory.",
          "<code>SELECT DISTINCT p.name FROM bank_transfer t JOIN person p ON p.id = t.authorised_by WHERE t.memo LIKE 'PAYROLL 202405%';</code>",
        ],
        answers: ['h0dk5mftdf'],
        reveal: 'Ambrose Teague, chief accountant. He signed everything — including a 388,000 payment to an employee he swears he has never met.',
      },
    ],
    epilogue: [
      '<em>Teague:</em> "Sable Wren has drawn a salary since November. No licence. No tax record. ' +
      'No face. Find out who has been cashing that name."',
    ],
  },

  /* ============================== CASE 6 ================================= */
  {
    id: 'c6',
    number: 6,
    title: 'The Ghost on the Manifest',
    tier: 'Advanced',
    concepts: ['subqueries', 'NOT EXISTS', 'correlated subqueries', 'IN with a SELECT'],
    hook: 'An employee who has never opened a door, never held a licence, and never paid tax.',
    opening: [
      'A person is not one row. A real person leaves a trail across a dozen tables: a licence, ' +
      'an income record, door logs, calls, a seat on a ferry. An invented person leaves exactly ' +
      'as much trail as somebody bothered to invent.',
      'So stop looking for what is there. Start looking for what is <em>missing</em>.',
    ],
    primer: {
      heading: 'Asking about absence',
      blocks: [
        { t: 'p', v: 'A subquery is a query inside a query. Used with <code>IN</code>, it replaces a hand-typed list of ids with a live one:' },
        { t: 'code', v: "SELECT * FROM person\nWHERE id IN (SELECT person_id FROM employment WHERE company_id = 3);" },
        { t: 'p', v: 'The powerful form is <code>NOT EXISTS</code>, which asks "is there <em>no</em> matching row over there?". The inner query refers back to the outer one — that back-reference is what makes it <em>correlated</em>.' },
        { t: 'code', v: 'SELECT p.name\nFROM person p\nWHERE NOT EXISTS (\n  SELECT 1 FROM keycard_scan k WHERE k.person_id = p.id\n);' },
        { t: 'note', v: 'Read <code>SELECT 1</code> as "I do not care what comes back, only whether anything does".' },
        { t: 'p', v: 'A subquery can also produce a single number to compare against — including inside <code>HAVING</code>:' },
        { t: 'code', v: 'HAVING COUNT(*) = (SELECT COUNT(*) FROM ferry_manifest WHERE person_id = 4102)' },
      ],
    },
    stages: [
      {
        id: 'c6s1',
        title: 'No Licence',
        teaches: 'JOIN + IS NULL',
        prompt: 'Nearly everybody in Nullport drives. Count the people currently employed by Meridian Freight — <code>end_date IS NULL</code> — who hold no driving licence at all.',
        ask: 'How many?',
        placeholder: 'a number',
        starter: "SELECT p.name, p.license_id\nFROM person p\nJOIN employment e ON e.person_id = p.id\nWHERE e.company_id = (SELECT id FROM company WHERE name = 'Meridian Freight');",
        hints: [
          'A person with no licence has <code>license_id IS NULL</code> — remember that <code>= NULL</code> will not work.',
          'Add both conditions: <code>e.end_date IS NULL</code> for current staff and <code>p.license_id IS NULL</code> for no licence.',
          "Add to the box: <code>AND e.end_date IS NULL AND p.license_id IS NULL</code>, then wrap it in <code>COUNT(*)</code>.",
        ],
        answers: ['7c0gf6t1ug', '19u4lgwzd02'],
        reveal: 'Three. Two of them are warehouse hands who simply never learned to drive. The third is something else.',
      },
      {
        id: 'c6s2',
        title: 'Never Opened a Door',
        teaches: 'NOT EXISTS',
        prompt: 'Of those three, two clock in and out of the depot like anybody else. One has never appeared on a door log in their life. Find the one with no keycard scan.',
        ask: 'Name the ghost.',
        placeholder: 'full name',
        starter: "SELECT p.name\nFROM person p\nJOIN employment e ON e.person_id = p.id\nWHERE e.company_id = (SELECT id FROM company WHERE name = 'Meridian Freight')\n  AND e.end_date IS NULL\n  AND p.license_id IS NULL;",
        hints: [
          'Add a <code>NOT EXISTS</code> clause checking <code>keycard_scan</code> for that person.',
          'The inner query must reference the outer alias: <code>WHERE k.person_id = p.id</code>. That is the correlation.',
          "Add to the box: <code>AND NOT EXISTS (SELECT 1 FROM keycard_scan k WHERE k.person_id = p.id)</code>",
        ],
        answers: ['28he3g5tfmy'],
        reveal: 'Sable Wren. No licence, no income record, no door log — and yet six sailings out of Nullport aboard the <em>MV Grey Petrel</em>. Somebody carried that name onto a boat.',
      },
      {
        id: 'c6s3',
        title: 'The Passenger Beside Her',
        teaches: 'correlated subquery in HAVING',
        prompt: 'Sable Wren sailed six times. Other passengers shared some of those crossings; exactly one shared <em>every single one</em>. Find the passenger whose count of shared sailings equals Sable\'s total.',
        ask: 'Who travelled with her every time?',
        placeholder: 'full name',
        starter: "SELECT * FROM ferry_manifest\nWHERE person_id = 0;   -- Sable's person id",
        hints: [
          'First get her sailings as a set: <code>SELECT sail_date, sail_time FROM ferry_manifest WHERE person_id = …</code>. Then find everyone else on those same sailings.',
          'SQLite lets you match a pair of columns against a subquery: <code>WHERE (f.sail_date, f.sail_time) IN (SELECT sail_date, sail_time FROM …)</code>. Group the results by person and count.',
          "<code>SELECT p.name, COUNT(*) c FROM ferry_manifest f JOIN person p ON p.id = f.person_id WHERE (f.sail_date, f.sail_time) IN (SELECT sail_date, sail_time FROM ferry_manifest WHERE person_id = …sable…) AND f.person_id &lt;&gt; …sable… GROUP BY p.id HAVING c = 6;</code>",
        ],
        answers: ['2c7peyssju2'],
        reveal: 'Ivo Castellan. Six for six. He did not travel <em>with</em> Sable Wren — he travelled <em>as</em> her, with her paperwork in his coat.',
      },
    ],
    epilogue: [
      '<em>Castellan:</em> "Sable Wren is a name on a bank mandate. The money left my hands and went ' +
      'somewhere I was not permitted to follow. It moves one account at a time, and it does not ' +
      'stop until it reaches the last one."',
    ],
  },

  /* ============================== CASE 7 ================================= */
  {
    id: 'c7',
    number: 7,
    title: 'Follow the Money',
    tier: 'Expert',
    concepts: ['self-join', 'WITH', 'WITH RECURSIVE', 'termination conditions'],
    hook: 'Nine hundred thousand leaves one account and arrives somewhere else entirely, one hop at a time.',
    opening: [
      'Laundering is a relay. Each account holds the money for a day, takes its cut, and passes ' +
      'it on. No single transfer looks like anything. The <em>chain</em> is the crime.',
      'You know where it starts: Ivo Castellan\'s account. You do not know how long it is, and ' +
      'you cannot write a join for a length you do not know.',
    ],
    primer: {
      heading: 'Queries that call themselves',
      blocks: [
        { t: 'p', v: 'To walk one hop, join a table to itself — two aliases, the second starting where the first finished:' },
        { t: 'code', v: 'SELECT t2.to_account\nFROM bank_transfer t1\nJOIN bank_transfer t2 ON t2.from_account = t1.to_account\nWHERE t1.from_account = 91;' },
        { t: 'p', v: 'Two hops means three aliases. Ten hops means eleven, and you still have to know it was ten. Instead, name a query with <code>WITH</code> and let it refer to itself.' },
        { t: 'code', v: 'WITH RECURSIVE hop(acct, depth) AS (\n  SELECT 91, 0                    -- the anchor: where we start\n  UNION ALL\n  SELECT t.to_account, hop.depth + 1   -- the step: one hop onward\n  FROM bank_transfer t\n  JOIN hop ON t.from_account = hop.acct\n  WHERE hop.depth < 40                 -- the brake\n)\nSELECT * FROM hop ORDER BY depth;' },
        { t: 'p', v: 'Three parts, always: an <strong>anchor</strong> row to begin with, a <strong>step</strong> that produces the next row from the last, and a <strong>brake</strong> so a loop in the data cannot run forever.' },
        { t: 'note', v: 'The chain ends naturally when an account has no outgoing transfer — the step finds nothing and the recursion stops.' },
      ],
    },
    stages: [
      {
        id: 'c7s1',
        title: 'Two Hops',
        teaches: 'self-join',
        prompt: 'Before the recursion, do it by hand. Ivo\'s account makes exactly one outgoing transfer. That account makes exactly one of its own. Join <code>bank_transfer</code> to itself and name the person two hops downstream.',
        ask: 'Who holds the account two hops from Ivo?',
        placeholder: 'full name',
        starter: "-- Ivo's account first:\nSELECT * FROM bank_account\nWHERE person_id = (SELECT id FROM person WHERE name = 'Ivo Castellan');",
        hints: [
          'One hop: <code>SELECT to_account FROM bank_transfer WHERE from_account = …ivo…</code>. Two hops: feed that result in as the next <code>from_account</code>.',
          'As a single query: <code>FROM bank_transfer t1 JOIN bank_transfer t2 ON t2.from_account = t1.to_account WHERE t1.from_account = …ivo…</code>.',
          "<code>SELECT p.name FROM bank_transfer t1 JOIN bank_transfer t2 ON t2.from_account = t1.to_account JOIN bank_account a ON a.id = t2.to_account JOIN person p ON p.id = a.person_id WHERE t1.from_account = …ivo's account id…;</code>",
        ],
        answers: ['26wmwfvy9a2'],
        reveal: 'Tobias Kray — a name with no connection to anything else in this investigation, which is precisely the point. He is a hop, not a person of interest.',
      },
      {
        id: 'c7s2',
        title: 'The Whole Chain',
        teaches: 'WITH RECURSIVE',
        prompt: 'Now walk it to the end. Write a recursive query that starts at Ivo\'s account and follows <code>from_account → to_account</code> until it runs out of road.',
        ask: 'How many accounts does the money pass through in total, counting Ivo\'s and the last one?',
        placeholder: 'a number',
        starter: "WITH RECURSIVE hop(acct, depth) AS (\n  SELECT 0, 0        -- put Ivo's account id here\n  UNION ALL\n  SELECT t.to_account, hop.depth + 1\n  FROM bank_transfer t\n  JOIN hop ON t.from_account = hop.acct\n  WHERE hop.depth < 40\n)\nSELECT * FROM hop ORDER BY depth;",
        hints: [
          'The starter query is already the right shape — you only need to put Ivo\'s real account id into the anchor row.',
          'Run it and count the rows it returns. Each row is one account along the chain.',
          'Wrap it: <code>SELECT COUNT(*) FROM hop;</code> after the CTE. Include the starting account and the final one.',
        ],
        answers: ['1j1msmgbsu3', '1k6ignyqytn'],
        reveal: 'Seven accounts, six hops, each one shaving seven per cent off the top. The last account never pays anything out to anyone.',
      },
      {
        id: 'c7s3',
        title: 'The End of the Road',
        teaches: 'reading the terminal row',
        prompt: 'The final account in that chain is not held by a person. Find out what it belongs to.',
        ask: 'Name the holder of the final account.',
        placeholder: 'name',
        starter: "SELECT * FROM bank_account\nWHERE id = 0;   -- the last account id from your chain",
        hints: [
          'A company account has <code>person_id IS NULL</code> and a <code>company_id</code>.',
          'Join <code>bank_account</code> to <code>company</code> on <code>company_id</code>.',
          "<code>SELECT c.name FROM bank_account a JOIN company c ON c.id = a.company_id WHERE a.id = …the last account…;</code>",
        ],
        answers: ['26zl2eg0m4p'],
        reveal: 'Alderpoint Holdings. An investment company in Verdigris Hill with no employees, no premises, and a balance that only ever goes up.',
      },
    ],
    epilogue: [
      'Four companies keep turning up: Meridian Freight, Kestrel Bonded Warehousing, Tidewell ' +
      'Shipping, and now Alderpoint Holdings. Shells feeding shells.',
      'Companies do not hire arsonists. Somebody makes the calls.',
    ],
  },

  /* ============================== CASE 8 ================================= */
  {
    id: 'c8',
    number: 8,
    title: 'The Architect',
    tier: 'Expert',
    concepts: ['CTEs', 'window functions', 'ROW_NUMBER() OVER (PARTITION BY …)', 'GROUP BY … HAVING COUNT(DISTINCT …)'],
    hook: 'The night before every one of these crimes, one telephone made one long call.',
    opening: [
      'Here is what you have. A courier, an arsonist, a driver, an insider, an accountant, a ' +
      'ghost, a handler, and four companies that exist only on paper. Eight people who have ' +
      'never all been in a room together, taking orders from someone none of them can name.',
      'But orders travel. Every call that crossed a Nullport mast last year is in this database — ' +
      'who rang, who answered, for how long, and from which tower.',
      'Five nights matter, each the eve of a crime: <strong>13 March</strong>, ' +
      '<strong>17 April</strong>, <strong>5 May</strong>, <strong>11 June</strong> and ' +
      '<strong>9 July 2024</strong>.',
    ],
    primer: {
      heading: 'Window functions — ranking within groups',
      blocks: [
        { t: 'p', v: 'An aggregate collapses a group into one row. A <strong>window function</strong> leaves every row where it is and adds a column describing its position within its group. That is the difference, and it is the whole reason this final case needs one.' },
        { t: 'code', v: 'SELECT call_date, receiver_number, duration_sec,\n       ROW_NUMBER() OVER (\n         PARTITION BY call_date        -- restart the numbering per night\n         ORDER BY duration_sec DESC    -- longest call gets 1\n       ) AS rn\nFROM phone_call;' },
        { t: 'p', v: '<code>PARTITION BY</code> is "group by, but without collapsing". <code>ORDER BY</code> inside <code>OVER</code> decides what rank 1 means.' },
        { t: 'p', v: 'You cannot filter on a window function in <code>WHERE</code> — it is computed too late. Put the windowed query in a <code>WITH</code> block and filter outside it:' },
        { t: 'code', v: 'WITH ranked AS (\n  SELECT …, ROW_NUMBER() OVER (PARTITION BY … ORDER BY …) AS rn\n  FROM …\n)\nSELECT * FROM ranked WHERE rn = 1;' },
        { t: 'note', v: 'Also useful here: <code>COUNT(DISTINCT column)</code> inside <code>HAVING</code>, to keep only the groups that appear on <em>all five</em> nights rather than merely some of them.' },
      ],
    },
    stages: [
      {
        id: 'c8s1',
        title: 'The Line That Isn\'t There',
        teaches: 'HAVING COUNT(DISTINCT …) + IS NULL',
        prompt: 'A registered line belongs to somebody: <code>phone_line.person_id</code> points at a person. An unregistered one has <code>NULL</code> there. Find the unregistered number that placed calls on <em>all five</em> of those nights — not four, all five.',
        ask: 'What is the number?',
        placeholder: 'e.g. 204-555-0000',
        starter: "SELECT * FROM phone_call\nWHERE call_date IN (20240313, 20240417, 20240505, 20240611, 20240709);",
        hints: [
          'Join <code>phone_call</code> to <code>phone_line</code> on the caller\'s number, and keep only lines where <code>person_id IS NULL</code>.',
          'Group by <code>caller_number</code>, then use <code>HAVING COUNT(DISTINCT call_date) = 5</code> so a number that only shows up on some nights is discarded.',
          "<code>SELECT c.caller_number FROM phone_call c JOIN phone_line l ON l.number = c.caller_number WHERE l.person_id IS NULL AND c.call_date IN (20240313, 20240417, 20240505, 20240611, 20240709) GROUP BY c.caller_number HAVING COUNT(DISTINCT c.call_date) = 5;</code>",
        ],
        answers: ['sa2ee1e6zs', '80k5dxiqf3'],
        reveal: 'A burner, registered to nobody, activated in December and used on precisely five nights of the year.',
      },
      {
        id: 'c8s2',
        title: 'One Mast',
        teaches: 'DISTINCT across a join',
        prompt: 'Every call that number ever made went through a single cell tower. Whoever held it never left one small part of the city.',
        ask: 'Name the tower.',
        placeholder: 'tower name',
        starter: "SELECT * FROM phone_call\nWHERE caller_number = '';",
        hints: [
          '<code>phone_call.tower_id</code> points at <code>cell_tower.id</code>.',
          'Join the two and select <code>DISTINCT</code> on the tower name to see how many masts are involved.',
          "<code>SELECT DISTINCT t.name, t.district FROM phone_call c JOIN cell_tower t ON t.id = c.tower_id WHERE c.caller_number = '204-555-0148';</code>",
        ],
        answers: ['1j3395k1yxe'],
        reveal: 'Gantry North — one mast, every call. Now look at who was on the other end. Several numbers, but the pattern is in the <em>lengths</em>.',
      },
      {
        id: 'c8s3',
        title: 'The Longest Call',
        teaches: 'ROW_NUMBER() OVER (PARTITION BY …)',
        prompt: 'On each of the five nights the burner made several calls. The short ones went to the people you have already arrested. The <em>longest</em> call of the night went, every single time, to the same number. Rank the calls within each night, keep the top one, and find out who owns that line.',
        ask: 'Name the Architect.',
        placeholder: 'full name',
        starter: "WITH ranked AS (\n  SELECT call_date, receiver_number, duration_sec,\n         ROW_NUMBER() OVER (PARTITION BY call_date ORDER BY duration_sec DESC) AS rn\n  FROM phone_call\n  WHERE caller_number = ''   -- the burner\n)\nSELECT * FROM ranked;",
        hints: [
          'Fill the burner number into the starter query and run it. Look at the <code>rn</code> column: within each night it restarts at 1 for the longest call.',
          'Filter to <code>WHERE rn = 1</code> outside the CTE. You will get five rows and they all share one <code>receiver_number</code>.',
          "Then unmask it: <code>SELECT DISTINCT p.name FROM ranked r JOIN phone_line l ON l.number = r.receiver_number JOIN person p ON p.id = l.person_id WHERE r.rn = 1;</code>",
        ],
        answers: ['22vrwvcli31'],
        reveal: 'Vivienne Aldridge. Sixty-one. Verger Lane, Verdigris Hill. Chair of the Port Authority — and, if you check <code>board_member</code>, chair of all four front companies at once.',
      },
    ],
    epilogue: [
      'Eight files. One hand.',
      'She said one thing at the arrest, and it was not a denial: <em>"You have a telephone number ' +
      'and a series of coincidences."</em>',
      'She was right about the number. She was wrong about the coincidences — you can prove every ' +
      'link, and you can show your working, because you wrote the queries yourself.',
      '<strong>Case closed, Commissioner.</strong>',
    ],
  },

  ];

  root.NullportCases = { CASES, PROLOGUE, RANKS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
