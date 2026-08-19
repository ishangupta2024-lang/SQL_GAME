/* =============================================================================
 * NULLPORT — world generator
 * -----------------------------------------------------------------------------
 * Deterministic, seeded generation of the entire case-file database.
 *
 * This file is a *classic script* (not an ES module) on purpose: ES modules are
 * blocked by CORS on file:// URLs, and this game must run by double-clicking
 * index.html. It assigns to globalThis, which also makes `require()` work in
 * Node for the verifier in tools/verify.mjs.
 *
 * Everything is generated from a fixed seed, so the browser and the Node
 * verifier build byte-identical worlds. Clues are planted *after* the random
 * fill, and conflicting random rows are mutated out of the way, which is what
 * guarantees each stage has exactly one answer.
 * ========================================================================== */
(function (root) {
  'use strict';

  /* --------------------------------------------------------------------------
   * 1. Deterministic randomness
   * ------------------------------------------------------------------------ */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Rng(seed) {
    const next = mulberry32(seed);
    return {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
      /** Pick a value skewed toward the low end of the range. */
      skew: (lo, hi) => lo + Math.floor(Math.pow(next(), 2) * (hi - lo + 1)),
    };
  }

  /* --------------------------------------------------------------------------
   * 2. Dates — stored as YYYYMMDD integers, times as HHMM integers
   * ------------------------------------------------------------------------ */

  function ymd(y, m, d) {
    return y * 10000 + m * 100 + d;
  }

  function enumerateDates(startYmd, days) {
    const y = Math.floor(startYmd / 10000);
    const m = Math.floor(startYmd / 100) % 100;
    const d = startYmd % 100;
    const out = [];
    const dt = new Date(Date.UTC(y, m - 1, d));
    for (let i = 0; i < days; i++) {
      out.push(
        dt.getUTCFullYear() * 10000 +
          (dt.getUTCMonth() + 1) * 100 +
          dt.getUTCDate()
      );
      dt.setUTCDate(dt.getUTCDate() + 1);
    }
    return out;
  }

  function monthOf(date) {
    return Math.floor(date / 100);
  }

  /* --------------------------------------------------------------------------
   * 3. Vocabulary
   * ------------------------------------------------------------------------ */

  const FIRST = ('Adele Adrian Agnes Alaric Albin Alden Alena Alfie Alina Alistair Alma Alonzo Alva Amos ' +
    'Ansel Anthea Arden Ariadne Armand Arvid Astrid Aubrey Augusta Aurelio Avis Barnaby Beatrix Bede ' +
    'Bellamy Benedict Bernice Bertram Blythe Boris Brigid Bruno Calder Callista Calvin Camilla Carsten ' +
    'Cassian Cecily Cedric Celeste Cillian Clarissa Clement Clio Colm Conrad Cordelia Cormac Cosima ' +
    'Cyprian Dagmar Damaris Darcy Delphine Desmond Dinah Dorian Dorothea Drusilla Duncan Eamon Edmund ' +
    'Edwina Egon Eira Eldon Eleni Elias Elspeth Emeric Emmeline Enid Ennis Ephraim Erasmus Esme Ethelred ' +
    'Eudora Evander Evelyn Ewan Ezra Fabian Farrell Faye Felicity Fenwick Ferdinand Fern Finlay Fiora ' +
    'Fletcher Florian Frances Frida Gareth Genevieve Gideon Gilda Godfrey Gracia Greta Griffin Gunnar ' +
    'Hadley Halcyon Hamish Harriet Hattie Hector Helena Hesper Hollis Honor Horace Hugo Ida Idris Ilse ' +
    'Imelda Inez Ingram Iona Isadora Isolde Ivar Jacinta Jarrah Jasper Jemima Jocasta Jonas Josiah Juno ' +
    'Kasimir Katarina Keeley Kendra Kester Kiran Klara Lachlan Lamont Larkin Laszlo Leocadia Leopold ' +
    'Lettice Linnea Lorcan Lucasta Ludovic Lysander Mabel Magnus Malachy Marguerite Mariel Marlow Mathilde ' +
    'Maud Mercer Merrick Mirabel Montague Morwenna Nadia Nerissa Nikolai Noelle Norbert Octavia Odalys ' +
    'Odile Olwen Ophira Oriel Orson Oswin Ottoline Paloma Pascoe Patience Peregrine Perpetua Phineas ' +
    'Piers Prudence Quenby Quill Rafferty Ramona Raoul Redmond Regan Reuben Rhoda Roald Romilly Rosalind ' +
    'Rowena Rufus Sabine Salvo Saoirse Saskia Seraphina Severin Sibyl Sigrid Silas Solveig Sorrel Stellan ' +
    'Sylvan Tabitha Talbot Tamsin Thaddeus Thea Theodora Thurstan Tobias Ottilie Ulric Ursula Valentin ' +
    'Verity Vesper Viggo Vitus Wendell Wilhelmina Winifred Wolfram Xanthe Yolanda Yorick Zadie Zephyr Zoya'
  ).split(/\s+/);

  const LAST = ('Abernathy Ackroyd Alderton Allbright Amory Ansley Arkwright Ashdown Astley Atwater Bagshaw ' +
    'Baird Balfour Bancroft Barlowe Barrington Bassett Beauchamp Beckwith Bellweather Benning Beresford ' +
    'Bidwell Blackwood Blanchard Bletchley Bolingbroke Bonnard Bracken Bramhall Brandt Brierley Brockhurst ' +
    'Bromwell Buckley Burdock Burnham Cadwallader Calloway Camberwell Carmody Carrick Castellane Chadwick ' +
    'Chalmers Chandler Charnock Chesterton Clackworth Clayborne Coddington Colefax Comstock Copperfield ' +
    'Cotterill Crake Cranleigh Crenshaw Crossley Culpepper Dallimore Danforth Darrow Daventry Delacroix ' +
    'Denholm Devereux Dinsmore Dorrance Dowsett Draycott Dunmore Eastwick Eddington Ellery Elstree ' +
    'Endicott Everly Fairweather Falconer Fanshawe Featherstone Fenwick Fetherby Fitzhardinge Flanagan ' +
    'Fleetwood Follansbee Forsythe Fothergill Framley Gainsford Galbraith Garnett Gaskell Gathercole ' +
    'Gillingham Glasspoole Goodfellow Gracewell Grantham Greaves Grenfell Grimshaw Hadfield Hallowell ' +
    'Hambledon Harcourt Hargreaves Harkness Hartnell Haverford Hawthorne Heathcote Hemsworth Hensley ' +
    'Hepburn Hollingsworth Holbrook Honeycutt Hornsby Huxtable Ilderton Ingleby Ironside Jarrold Jephson ' +
    'Kearsley Keddington Kenward Kerrigan Kingsley Kinsolving Kirkbride Knollys Lachlan Lamplugh Langtry ' +
    'Lascelles Latimer Leathersby Ledbetter Linfield Litchfield Lockhart Loveday Lubbock Ludlow Lymington ' +
    'Maddox Mainwaring Malbourne Marchetti Marlowe Mattingly Melrose Merriweather Middleton Mordaunt ' +
    'Morrissey Mountjoy Nethercott Newbold Nightingale Norrington Oakhurst Ogilvy Orpington Osgood ' +
    'Pemberton Pennyfeather Petherbridge Pickersgill Plumtree Polkinghorne Prescott Quiller Radcliffe ' +
    'Rainsford Ravenscroft Redgrave Rickerby Ridgeway Rookwood Rothwell Rowntree Ruthven Sackville ' +
    'Saltmarsh Sandiford Satterthwaite Scrivener Selborne Shackleton Sheridan Sinclair Skeffington ' +
    'Slaughterbeck Somerville Southgate Stanhope Stapleton Sterndale Stringfellow Swanwick Tarleton ' +
    'Thackeray Thistlewood Throckmorton Tillinghast Trelawney Trentham Underhill Vandeleur Verinder ' +
    'Wadsworth Wainwright Waltham Warburton Wetherby Whitcombe Wickersham Wilberforce Willoughby ' +
    'Winterbourne Woolridge Wyndham Yardley Yelverton Zouche'
  ).split(/\s+/);

  const DISTRICTS = ['Old Quay', 'Ironhaven', 'Saltmere', 'Lantern Row', 'Tarrow Flats',
    'Verdigris Hill', 'The Gantry', 'Pell Harbour'];

  const STREETS = ('Ashgrove Street|Wexler Row|Cardamom Lane|Sable Walk|Gallows Mews|Cordage Street|' +
    'Anchorline Road|Bellrope Lane|Cinder Hill|Doldrum Way|Ebbtide Crescent|Fathom Street|Gaslight Row|' +
    'Harrowgate|Inkwell Lane|Jetty Approach|Kelpwood Avenue|Lamplight Street|Marlinspike Way|Netherfield Road|' +
    'Oakum Lane|Pitchpine Street|Quarrel Row|Ropewalk Terrace|Saltbox Lane|Tallow Street|Undercliff Road|' +
    'Vellum Court|Windlass Street|Yarrow Bank|Bittern Close|Chandlery Row|Drayman Street|Ferrous Lane|' +
    'Grackle Street|Hoist Yard|Iron Bridge Road|Jackdaw Lane|Keelson Street|Limekiln Row|Mudlark Way|' +
    'Nightjar Street|Ossuary Lane|Pilgrim Steps|Rookery Road|Shingle Street|Thimble Alley|Verger Lane'
  ).split('|');

  const EYE = ['brown', 'blue', 'green', 'hazel', 'grey', 'amber'];
  const HAIR = ['black', 'brown', 'blonde', 'red', 'grey', 'auburn', 'white'];
  const GENDER = ['female', 'male', 'non-binary'];
  const CAR_MAKE = ['Voss', 'Bellamy', 'Kestrel', 'Tarn', 'Morrow', 'Halcyon', 'Ridgeback', 'Corvid', 'Palisade'];
  const CAR_MODEL = ['Estate', 'Panel Van', 'Coupe', 'Saloon', 'Runabout', 'Hauler', 'Drifter', 'Lancer', 'Tourer'];
  const CAR_COLOR = ['grey', 'black', 'white', 'blue', 'red', 'green', 'silver', 'brown'];

  const BUILDINGS = ['Hall of Records', 'Nullport Vault', 'Meridian Freight Depot', 'Customs House',
    'Gantry Signal Box', 'Kestrel Bonded Warehouse', 'Harbourmaster Office', 'Alderpoint Chambers'];

  const VESSELS = ['MV Cormorant', 'MV Saltwhistle', 'MV Grey Petrel', 'MV Tidewell', 'MV Bitternhead'];
  const PORTS = ['Nullport', 'Ashcombe', 'Rill Island', 'Cape Mourne', 'Fen Landing'];

  const EVENTS = ['Harbour Lights Festival', 'Nullport Fish Market', 'Ironworks Jazz Night',
    'Saltmere Book Fair', 'Gantry Boxing Club', 'Old Quay Film Society', 'Verdigris Flower Show',
    'Dockers Union Meeting', 'Lantern Row Night Market', 'Pell Harbour Regatta'];

  const BANKS = ['Nullport Vault & Trust', 'Harbour Mutual', 'Fenwick & Sons', 'Coastal Provident'];

  const CRIME_TYPES = ['theft', 'assault', 'arson', 'fraud', 'burglary', 'vandalism',
    'smuggling', 'hit and run', 'murder', 'blackmail'];

  const ROLES = ['loader', 'dispatcher', 'clerk', 'foreman', 'driver', 'accountant', 'security',
    'analyst', 'engineer', 'warehouse hand', 'shift manager', 'auditor', 'crane operator'];

  const CARRIERS = ['Beacon Mobile', 'Tidewave Telecom', 'Nullport Cellular'];

  /* --------------------------------------------------------------------------
   * 4. Story constants — the spine of the campaign
   * ------------------------------------------------------------------------ */

  const STORY = {
    // Key dates
    C1_MURDER: 20240314,
    C2_ARSON: 20240418,
    C3_HITRUN: 20240506,
    C4_THEFT: 20240612,
    C5_MONTH: 202405,
    C8_NIGHTS: [20240313, 20240417, 20240505, 20240611, 20240709],

    // Cast
    VICTIM: 'Halden Roarke',
    WITNESS_1: 'Nolan Fitch',
    WITNESS_2: 'Odile Sarratt',
    COURIER: 'Petra Vance',
    ARSONIST: 'Osric Blayne',
    DRIVER: 'Corvin Ashby',
    INSIDER: 'Delia Marsh',
    CFO: 'Ambrose Teague',
    GHOST: 'Sable Wren',
    HANDLER: 'Ivo Castellan',
    ARCHITECT: 'Vivienne Aldridge',
    // The five accounts the money passes through between Ivo and the shell.
    CHAIN: ['Renna Vosk', 'Tobias Kray', 'Mirelle Danthe', 'Lucian Prem', 'Ottoline Skreen'],

    // Fixed values the player must find
    WEXLER_NUMBER: 4471,
    PETRA_BADGE: 'MF-2287',
    HITRUN_PLATE: '8QRJ41',
    BURNER: '204-555-0148',
    ARCHITECT_PHONE: '204-555-0912',
    TOWER: 'Gantry North',
    SHELL: 'Alderpoint Holdings',
    STOLEN_ITEM: 'Ledger 7',
    CHAIN_LENGTH: 7,
  };

  /* --------------------------------------------------------------------------
   * 5. Table definitions (drive both DDL and the in-game schema explorer)
   * ------------------------------------------------------------------------ */

  const TABLES = [
    {
      name: 'person',
      blurb: 'Every resident on the Nullport register.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['name', 'TEXT'],
        ['license_id', 'INTEGER', 'fk:drivers_license.id'],
        ['address_number', 'INTEGER'],
        ['address_street', 'TEXT'],
        ['district', 'TEXT'],
        ['ssn', 'TEXT', 'fk:income.ssn'],
        ['birth_date', 'INTEGER'],
      ],
    },
    {
      name: 'drivers_license',
      blurb: 'Licence records, with physical description and vehicle.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['age', 'INTEGER'],
        ['height', 'INTEGER'],
        ['eye_color', 'TEXT'],
        ['hair_color', 'TEXT'],
        ['gender', 'TEXT'],
        ['plate_number', 'TEXT'],
        ['car_make', 'TEXT'],
        ['car_model', 'TEXT'],
        ['car_color', 'TEXT'],
        ['issued_date', 'INTEGER'],
      ],
    },
    {
      name: 'income',
      blurb: 'Declared annual income by SSN.',
      columns: [['ssn', 'TEXT', 'pk'], ['annual_income', 'INTEGER'], ['source', 'TEXT']],
    },
    {
      name: 'crime_scene_report',
      blurb: 'Filed reports. Where every case starts.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['report_date', 'INTEGER'],
        ['type', 'TEXT'],
        ['description', 'TEXT'],
        ['district', 'TEXT'],
      ],
    },
    {
      name: 'interview',
      blurb: 'Transcripts. Read them closely — clues hide in the wording.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['person_id', 'INTEGER', 'fk:person.id'],
        ['interview_date', 'INTEGER'],
        ['transcript', 'TEXT'],
      ],
    },
    {
      name: 'company',
      blurb: 'Registered businesses in Nullport.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['name', 'TEXT'],
        ['district', 'TEXT'],
        ['industry', 'TEXT'],
        ['founded_date', 'INTEGER'],
      ],
    },
    {
      name: 'employment',
      blurb: 'Who works where, for how much, and until when.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['person_id', 'INTEGER', 'fk:person.id'],
        ['company_id', 'INTEGER', 'fk:company.id'],
        ['role', 'TEXT'],
        ['start_date', 'INTEGER'],
        ['end_date', 'INTEGER'],
        ['salary', 'INTEGER'],
      ],
    },
    {
      name: 'board_member',
      blurb: 'Company officers and when they were appointed.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['company_id', 'INTEGER', 'fk:company.id'],
        ['person_id', 'INTEGER', 'fk:person.id'],
        ['role', 'TEXT'],
        ['appointed_date', 'INTEGER'],
        ['resigned_date', 'INTEGER'],
      ],
    },
    {
      name: 'courier_badge',
      blurb: 'Licensed couriers. Note it carries the name as well as the id.',
      columns: [
        ['badge_no', 'TEXT', 'pk'],
        ['person_id', 'INTEGER', 'fk:person.id'],
        ['name', 'TEXT'],
        ['employer', 'TEXT'],
        ['status', 'TEXT'],
        ['issued_date', 'INTEGER'],
      ],
    },
    {
      name: 'bank_account',
      blurb: 'Accounts. Held by a person OR a company — never both.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['account_no', 'TEXT'],
        ['person_id', 'INTEGER', 'fk:person.id'],
        ['company_id', 'INTEGER', 'fk:company.id'],
        ['bank', 'TEXT'],
        ['balance', 'INTEGER'],
        ['opened_date', 'INTEGER'],
      ],
    },
    {
      name: 'bank_transfer',
      blurb: 'Money moving between accounts. Follow it.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['from_account', 'INTEGER', 'fk:bank_account.id'],
        ['to_account', 'INTEGER', 'fk:bank_account.id'],
        ['amount', 'INTEGER'],
        ['transfer_date', 'INTEGER'],
        ['memo', 'TEXT'],
        ['authorised_by', 'INTEGER', 'fk:person.id'],
      ],
    },
    {
      name: 'keycard_scan',
      blurb: 'Door logs. direction is IN or OUT.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['person_id', 'INTEGER', 'fk:person.id'],
        ['building', 'TEXT'],
        ['scan_date', 'INTEGER'],
        ['scan_time', 'INTEGER'],
        ['direction', 'TEXT'],
      ],
    },
    {
      name: 'plate_reading',
      blurb: 'Traffic camera captures of number plates.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['plate_number', 'TEXT'],
        ['camera_id', 'INTEGER'],
        ['read_date', 'INTEGER'],
        ['read_time', 'INTEGER'],
        ['district', 'TEXT'],
      ],
    },
    {
      name: 'ferry_manifest',
      blurb: 'Passenger sailings in and out of Nullport.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['person_id', 'INTEGER', 'fk:person.id'],
        ['vessel', 'TEXT'],
        ['sail_date', 'INTEGER'],
        ['sail_time', 'INTEGER'],
        ['origin', 'TEXT'],
        ['destination', 'TEXT'],
      ],
    },
    {
      name: 'event_checkin',
      blurb: 'Social check-ins around the city.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['person_id', 'INTEGER', 'fk:person.id'],
        ['event_name', 'TEXT'],
        ['event_date', 'INTEGER'],
        ['venue', 'TEXT'],
      ],
    },
    {
      name: 'cell_tower',
      blurb: 'Mast locations that carry each call.',
      columns: [['id', 'INTEGER', 'pk'], ['name', 'TEXT'], ['district', 'TEXT']],
    },
    {
      name: 'phone_line',
      blurb: 'Registered numbers. An unregistered line has no person_id.',
      columns: [
        ['number', 'TEXT', 'pk'],
        ['person_id', 'INTEGER', 'fk:person.id'],
        ['carrier', 'TEXT'],
        ['registered_date', 'INTEGER'],
      ],
    },
    {
      name: 'phone_call',
      blurb: 'Call detail records: who rang whom, from which mast.',
      columns: [
        ['id', 'INTEGER', 'pk'],
        ['caller_number', 'TEXT', 'fk:phone_line.number'],
        ['receiver_number', 'TEXT', 'fk:phone_line.number'],
        ['call_date', 'INTEGER'],
        ['call_time', 'INTEGER'],
        ['duration_sec', 'INTEGER'],
        ['tower_id', 'INTEGER', 'fk:cell_tower.id'],
      ],
    },
  ];

  /* --------------------------------------------------------------------------
   * 6. The generator
   * ------------------------------------------------------------------------ */

  const SIZES = {
    people: 6000,
    reports: 1400,
    interviews: 900,
    randomCompanies: 44,
    plateReadings: 16000,
    phoneCalls: 20000,
    eventCheckins: 12000,
    keycardScans: 10000,
    ferryTrips: 7000,
    transfers: 12000,
  };

  function buildWorld(seed) {
    const rng = Rng(seed === undefined ? 0x4e554c4c : seed);
    const T = {
      person: [],
      drivers_license: [],
      income: [],
      crime_scene_report: [],
      interview: [],
      company: [],
      employment: [],
      board_member: [],
      courier_badge: [],
      bank_account: [],
      bank_transfer: [],
      keycard_scan: [],
      plate_reading: [],
      ferry_manifest: [],
      event_checkin: [],
      cell_tower: [],
      phone_line: [],
      phone_call: [],
    };

    const CAL_2023_2024 = enumerateDates(20230101, 731);
    const CAL_2024 = enumerateDates(20240101, 366);

    /* ---- names --------------------------------------------------------- */
    const usedNames = new Set();
    function makeName() {
      for (let attempt = 0; attempt < 400; attempt++) {
        const n = rng.pick(FIRST) + ' ' + rng.pick(LAST);
        if (!usedNames.has(n)) {
          usedNames.add(n);
          return n;
        }
      }
      // Deterministic fallback: guaranteed unique.
      let i = 2;
      let base = rng.pick(FIRST) + ' ' + rng.pick(LAST);
      while (usedNames.has(base + ' ' + i)) i++;
      const n = base + ' ' + i;
      usedNames.add(n);
      return n;
    }
    // Reserve story names so no random resident can collide with them.
    const STORY_NAMES = [STORY.VICTIM, STORY.WITNESS_1, STORY.WITNESS_2, STORY.COURIER,
      STORY.ARSONIST, STORY.DRIVER, STORY.INSIDER, STORY.CFO, STORY.GHOST,
      STORY.HANDLER, STORY.ARCHITECT].concat(STORY.CHAIN);
    STORY_NAMES.forEach((n) => usedNames.add(n));

    /* ---- plates & phone numbers ---------------------------------------- */
    const PLATE_CH = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    const usedPlates = new Set([STORY.HITRUN_PLATE]);
    function makePlate() {
      for (;;) {
        const p =
          rng.int(1, 9) +
          PLATE_CH[rng.int(0, PLATE_CH.length - 1)] +
          PLATE_CH[rng.int(0, PLATE_CH.length - 1)] +
          PLATE_CH[rng.int(0, PLATE_CH.length - 1)] +
          rng.int(0, 9) +
          rng.int(0, 9);
        if (!usedPlates.has(p)) {
          usedPlates.add(p);
          return p;
        }
      }
    }

    const AREA = ['204', '318', '507', '612'];
    const usedNumbers = new Set([STORY.BURNER, STORY.ARCHITECT_PHONE]);
    function makeNumber() {
      for (;;) {
        const n =
          rng.pick(AREA) + '-555-' + String(rng.int(0, 9999)).padStart(4, '0');
        if (!usedNumbers.has(n)) {
          usedNumbers.add(n);
          return n;
        }
      }
    }

    const usedSsn = new Set();
    function makeSsn() {
      for (;;) {
        const s =
          String(rng.int(100, 899)) + '-' + String(rng.int(10, 99)) + '-' +
          String(rng.int(1000, 9999));
        if (!usedSsn.has(s)) {
          usedSsn.add(s);
          return s;
        }
      }
    }

    /* ---- companies ------------------------------------------------------ */
    const FRONTS = [
      { name: 'Meridian Freight', industry: 'haulage', district: 'Ironhaven' },
      { name: 'Alderpoint Holdings', industry: 'investment', district: 'Verdigris Hill' },
      { name: 'Kestrel Bonded Warehousing', industry: 'storage', district: 'Saltmere' },
      { name: 'Tidewell Shipping Agency', industry: 'shipping', district: 'Pell Harbour' },
    ];
    const OTHER_CO = ['Nullport Vault & Trust', 'Halloway Marine Insurance', 'Brackish Brewing',
      'Cormorant Canning', 'Fenwick & Sons', 'Gantry Steelworks', 'Harbour Mutual',
      'Ironhaven Ropeworks', 'Jetty Provisions', 'Kelp & Kettle', 'Lantern Row Printing',
      'Mudlark Salvage', 'Netherfield Glass', 'Oakum Chandlery', 'Pilgrim Ferries',
      'Quarrel Locksmiths', 'Rookery Bakery', 'Saltbox Textiles', 'Tallow Candleworks',
      'Undercliff Quarry', 'Vellum Stationers', 'Windlass Engineering', 'Yarrow Pharmacy',
      'Bittern Optics', 'Chandlery Coffee', 'Drayman Haulage', 'Ferrous Fabrication',
      'Grackle Recording', 'Hoist Yard Cranes', 'Jackdaw Jewellers', 'Keelson Boatyard',
      'Limekiln Cement', 'Mudflat Fisheries', 'Nightjar Security', 'Ossuary Antiques',
      'Pitchpine Timber', 'Ropewalk Cordage', 'Shingle Roofing', 'Thimble Tailors',
      'Verger Funeral Services', 'Anchorline Marine', 'Bellrope Foundry',
      'Cinder Hill Collieries', 'Doldrum Sailmakers'];

    let coId = 0;
    FRONTS.forEach((f) => {
      T.company.push({
        id: ++coId, name: f.name, district: f.district, industry: f.industry,
        founded_date: rng.pick(enumerateDates(20050101, 3000)),
      });
    });
    OTHER_CO.slice(0, SIZES.randomCompanies).forEach((n) => {
      T.company.push({
        id: ++coId, name: n, district: rng.pick(DISTRICTS),
        industry: rng.pick(['haulage', 'retail', 'manufacturing', 'marine', 'finance',
          'hospitality', 'construction', 'services']),
        founded_date: rng.pick(enumerateDates(19900101, 11000)),
      });
    });
    const CO = {};
    T.company.forEach((c) => (CO[c.name] = c.id));

    /* ---- people, licences, income --------------------------------------- */
    let licId = 0;
    const licenseDates = enumerateDates(20140101, 3650);
    const birthDates = enumerateDates(19500101, 20000);

    for (let i = 1; i <= SIZES.people; i++) {
      const hasLicense = rng.chance(0.86);
      let license_id = null;
      if (hasLicense) {
        license_id = ++licId;
        T.drivers_license.push({
          id: license_id,
          age: rng.int(18, 84),
          height: rng.int(58, 79),
          eye_color: rng.pick(EYE),
          hair_color: rng.pick(HAIR),
          gender: rng.pick(GENDER),
          plate_number: makePlate(),
          car_make: rng.pick(CAR_MAKE),
          car_model: rng.pick(CAR_MODEL),
          car_color: rng.pick(CAR_COLOR),
          issued_date: rng.pick(licenseDates),
        });
      }
      const ssn = rng.chance(0.9) ? makeSsn() : null;
      if (ssn) {
        T.income.push({
          ssn,
          annual_income: rng.skew(14000, 260000),
          source: rng.pick(['salary', 'salary', 'salary', 'self-employed', 'pension', 'investments']),
        });
      }
      T.person.push({
        id: i,
        name: makeName(),
        license_id,
        address_number: rng.int(1, 4400),
        address_street: rng.pick(STREETS),
        district: rng.pick(DISTRICTS),
        ssn,
        birth_date: rng.pick(birthDates),
      });
    }
    const byId = new Map(T.person.map((p) => [p.id, p]));
    const licById = new Map(T.drivers_license.map((l) => [l.id, l]));

    /* ---- employment ----------------------------------------------------- */
    let empId = 0;
    const empStart = enumerateDates(20150101, 3200);
    T.person.forEach((p) => {
      if (!rng.chance(0.72)) return;
      const start = rng.pick(empStart);
      const ended = rng.chance(0.18);
      T.employment.push({
        id: ++empId,
        person_id: p.id,
        company_id: rng.int(1, T.company.length),
        role: rng.pick(ROLES),
        start_date: start,
        end_date: ended ? rng.pick(CAL_2023_2024.filter((d) => d > start)) || null : null,
        salary: rng.skew(19000, 190000),
      });
    });

    /* ---- bank accounts --------------------------------------------------- */
    let acctId = 0;
    const acctDates = enumerateDates(20100101, 5100);
    const personAccount = new Map();
    T.person.forEach((p) => {
      if (!rng.chance(0.88)) return;
      const id = ++acctId;
      T.bank_account.push({
        id,
        account_no: 'NP' + String(10000000 + id * 7919 % 89999999),
        person_id: p.id,
        company_id: null,
        bank: rng.pick(BANKS),
        balance: rng.skew(-2000, 400000),
        opened_date: rng.pick(acctDates),
      });
      personAccount.set(p.id, id);
    });
    const companyAccount = new Map();
    T.company.forEach((c) => {
      const id = ++acctId;
      T.bank_account.push({
        id,
        account_no: 'NP' + String(10000000 + id * 7919 % 89999999),
        person_id: null,
        company_id: c.id,
        bank: rng.pick(BANKS),
        balance: rng.skew(50000, 9000000),
        opened_date: rng.pick(acctDates),
      });
      companyAccount.set(c.id, id);
    });

    /* ---- phone lines ----------------------------------------------------- */
    const personNumber = new Map();
    T.person.forEach((p) => {
      if (!rng.chance(0.93)) return;
      const num = makeNumber();
      T.phone_line.push({
        number: num, person_id: p.id, carrier: rng.pick(CARRIERS),
        registered_date: rng.pick(acctDates),
      });
      personNumber.set(p.id, num);
    });
    // A scattering of unregistered burners, so the real one doesn't stand out.
    const burnerPool = [];
    for (let i = 0; i < 60; i++) {
      const num = makeNumber();
      T.phone_line.push({
        number: num, person_id: null, carrier: rng.pick(CARRIERS),
        registered_date: rng.pick(acctDates),
      });
      burnerPool.push(num);
    }

    /* ---- cell towers ------------------------------------------------------ */
    let towerId = 0;
    const towerNames = [];
    DISTRICTS.forEach((d) => {
      ['North', 'South', 'East'].forEach((s) => {
        const short = d.split(' ').pop();
        towerNames.push({ name: short + ' ' + s, district: d });
      });
    });
    towerNames.forEach((t) => {
      T.cell_tower.push({ id: ++towerId, name: t.name, district: t.district });
    });
    const towerByName = new Map(T.cell_tower.map((t) => [t.name, t.id]));

    /* ---- random filler across the log tables ------------------------------ */
    const allNumbers = T.phone_line.map((l) => l.number);
    let callId = 0;
    for (let i = 0; i < SIZES.phoneCalls; i++) {
      const a = rng.pick(allNumbers);
      let b = rng.pick(allNumbers);
      if (a === b) continue;
      T.phone_call.push({
        id: ++callId, caller_number: a, receiver_number: b,
        call_date: rng.pick(CAL_2024), call_time: rng.int(0, 2359),
        duration_sec: rng.skew(8, 2400), tower_id: rng.int(1, T.cell_tower.length),
      });
    }

    let prId = 0;
    const allPlates = T.drivers_license.map((l) => l.plate_number);
    for (let i = 0; i < SIZES.plateReadings; i++) {
      T.plate_reading.push({
        id: ++prId, plate_number: rng.pick(allPlates), camera_id: rng.int(1, 60),
        read_date: rng.pick(CAL_2024), read_time: rng.int(0, 2359),
        district: rng.pick(DISTRICTS),
      });
    }

    let ecId = 0;
    for (let i = 0; i < SIZES.eventCheckins; i++) {
      T.event_checkin.push({
        id: ++ecId, person_id: rng.int(1, SIZES.people), event_name: rng.pick(EVENTS),
        event_date: rng.pick(CAL_2024), venue: rng.pick(DISTRICTS),
      });
    }

    let ksId = 0;
    for (let i = 0; i < SIZES.keycardScans; i++) {
      const inTime = rng.int(600, 2000);
      const pid = rng.int(1, SIZES.people);
      const b = rng.pick(BUILDINGS);
      const d = rng.pick(CAL_2024);
      T.keycard_scan.push({ id: ++ksId, person_id: pid, building: b, scan_date: d, scan_time: inTime, direction: 'IN' });
      if (rng.chance(0.93)) {
        T.keycard_scan.push({
          id: ++ksId, person_id: pid, building: b, scan_date: d,
          scan_time: Math.min(2359, inTime + rng.int(30, 500)), direction: 'OUT',
        });
      }
    }

    let fmId = 0;
    for (let i = 0; i < SIZES.ferryTrips; i++) {
      const o = rng.pick(PORTS);
      let dst = rng.pick(PORTS);
      if (dst === o) dst = PORTS[(PORTS.indexOf(o) + 1) % PORTS.length];
      T.ferry_manifest.push({
        id: ++fmId, person_id: rng.int(1, SIZES.people), vessel: rng.pick(VESSELS),
        sail_date: rng.pick(CAL_2024), sail_time: rng.int(500, 2200),
        origin: o, destination: dst,
      });
    }

    let trId = 0;
    const acctIds = T.bank_account.map((a) => a.id);
    for (let i = 0; i < SIZES.transfers; i++) {
      const from = rng.pick(acctIds);
      let to = rng.pick(acctIds);
      if (from === to) continue;
      T.bank_transfer.push({
        id: ++trId, from_account: from, to_account: to,
        amount: rng.skew(40, 24000), transfer_date: rng.pick(CAL_2024),
        memo: rng.pick(['rent', 'invoice', 'transfer', 'services', 'refund', 'loan repayment',
          'consulting', 'materials', 'settlement']),
        authorised_by: null,
      });
    }

    /* ---- courier badges --------------------------------------------------- */
    let badgeSeq = 1000;
    const courierPeople = rng.shuffle(T.person).slice(0, 340);
    courierPeople.forEach((p) => {
      const employer = rng.chance(0.4) ? 'Meridian Freight' : rng.pick([
        'Drayman Haulage', 'Pilgrim Ferries', 'Tidewell Shipping Agency',
        'Mudlark Salvage', 'Jetty Provisions']);
      T.courier_badge.push({
        badge_no: 'MF-' + ++badgeSeq,
        person_id: p.id,
        name: p.name,
        employer,
        status: rng.pick(['active', 'active', 'active', 'suspended', 'expired']),
        issued_date: rng.pick(CAL_2023_2024),
      });
    });

    /* ---- board members ---------------------------------------------------- */
    let bmId = 0;
    T.company.forEach((c) => {
      const n = rng.int(2, 5);
      for (let i = 0; i < n; i++) {
        T.board_member.push({
          id: ++bmId, company_id: c.id, person_id: rng.int(1, SIZES.people),
          role: rng.pick(['director', 'director', 'secretary', 'treasurer', 'chair']),
          appointed_date: rng.pick(enumerateDates(20180101, 2000)),
          resigned_date: null,
        });
      }
    });

    /* ---- crime reports & interviews ---------------------------------------- */
    let csrId = 0;
    for (let i = 0; i < SIZES.reports; i++) {
      const type = rng.pick(CRIME_TYPES);
      T.crime_scene_report.push({
        id: ++csrId,
        report_date: rng.pick(CAL_2024),
        type,
        description: rng.pick([
          'Report filed. No witnesses. Nothing recovered at the scene.',
          'Attending officer noted forced entry at the rear. Enquiries ongoing.',
          'Complainant unable to give a description. Case pending review.',
          'Statement taken at the scene. No further leads at this time.',
          'Property damage recorded. CCTV requested from the district office.',
          'Suspect fled on foot before units arrived. No arrest made.',
        ]),
        district: rng.pick(DISTRICTS),
      });
    }

    let ivId = 0;
    rng.shuffle(T.person).slice(0, SIZES.interviews).forEach((p) => {
      T.interview.push({
        id: ++ivId, person_id: p.id, interview_date: rng.pick(CAL_2024),
        transcript: rng.pick([
          'I did not see anything. I was inside all evening with the radio on.',
          'There was shouting around midnight but I assumed it was the dockers.',
          'I keep to myself. I could not tell you who lives two doors down.',
          'I gave my statement to the officer at the time. I have nothing to add.',
          'It was raining hard. I could barely see the end of the street.',
          'I remember a van idling but I could not tell you the colour.',
        ]),
      });
    });

    /* ======================================================================
     * CLUE PLANTING
     * Each block: (a) mutate conflicting random rows out of the way,
     *             (b) insert the canonical rows. Uniqueness is asserted by
     *             tools/verify.mjs.
     * ==================================================================== */

    /** Rewrite rows that would otherwise also satisfy a clue query. */
    function scrub(rows, pred, fix) {
      rows.forEach((r) => { if (pred(r)) fix(r); });
    }

    // Helper to mint a story character as a real resident.
    function addPerson(opts) {
      const id = T.person.length + 1;
      let license_id = null;
      if (opts.license) {
        license_id = T.drivers_license.length + 1;
        T.drivers_license.push(Object.assign({
          id: license_id, age: 40, height: 68, eye_color: 'brown', hair_color: 'brown',
          gender: 'female', plate_number: makePlate(), car_make: rng.pick(CAR_MAKE),
          car_model: rng.pick(CAR_MODEL), car_color: rng.pick(CAR_COLOR), issued_date: 20200101,
        }, opts.license));
      }
      let ssn = null;
      if (opts.income !== null) {
        ssn = makeSsn();
        T.income.push({ ssn, annual_income: opts.income || 45000, source: 'salary' });
      }
      const p = {
        id, name: opts.name, license_id,
        address_number: opts.address_number != null ? opts.address_number : rng.int(1, 4000),
        address_street: opts.address_street || rng.pick(STREETS),
        district: opts.district || rng.pick(DISTRICTS),
        ssn,
        birth_date: opts.birth_date || 19800101,
      };
      T.person.push(p);
      byId.set(id, p);
      if (license_id) licById.set(license_id, T.drivers_license[T.drivers_license.length - 1]);
      return p;
    }

    function giveAccount(person, balance) {
      const id = ++acctId;
      T.bank_account.push({
        id, account_no: 'NP' + String(10000000 + id * 7919 % 89999999),
        person_id: person.id, company_id: null, bank: rng.pick(BANKS),
        balance: balance == null ? 5000 : balance, opened_date: 20190101,
      });
      personAccount.set(person.id, id);
      return id;
    }

    function giveNumber(person, num) {
      const n = num || makeNumber();
      T.phone_line.push({ number: n, person_id: person.id, carrier: rng.pick(CARRIERS), registered_date: 20190101 });
      personNumber.set(person.id, n);
      return n;
    }

    function addInterview(person, date, text) {
      T.interview.push({ id: ++ivId, person_id: person.id, interview_date: date, transcript: text });
    }

    /* ---------------- CASE 1 — The Body on Pier 7 ------------------------- */

    // (a) exactly one murder report on that date in Old Quay
    scrub(T.crime_scene_report,
      (r) => r.type === 'murder' && r.report_date === STORY.C1_MURDER && r.district === 'Old Quay',
      (r) => { r.type = 'theft'; });
    // Decoys: same district+type on other dates, and same date+type elsewhere.
    T.crime_scene_report.push(
      { id: ++csrId, report_date: 20240208, type: 'murder', district: 'Old Quay',
        description: 'Unrelated. Victim named as a fisherman, death ruled accidental on appeal.' },
      { id: ++csrId, report_date: 20241102, type: 'murder', district: 'Old Quay',
        description: 'Unrelated. Suspect charged and remanded the same week.' },
      { id: ++csrId, report_date: STORY.C1_MURDER, type: 'murder', district: 'Saltmere',
        description: 'Unrelated. Domestic incident, suspect known to the victim.' }
    );

    const victim = addPerson({ name: STORY.VICTIM, address_street: 'Cordage Street', district: 'Old Quay', income: 31000, license: { hair_color: 'grey', age: 58, gender: 'male' } });

    T.crime_scene_report.push({
      id: ++csrId, report_date: STORY.C1_MURDER, type: 'murder', district: 'Old Quay',
      description:
        'Body recovered beneath Pier 7 shortly after 23:00. Victim identified as ' + STORY.VICTIM +
        ', a dock loader. Two residents telephoned it in. The first lives in the LAST HOUSE on ' +
        '"Wexler Row" — that is, the highest street number on that road. The second is a woman ' +
        'named Odile who lives somewhere on "Cardamom Lane". Take statements from both.',
    });

    // Witness 1 — the last house on Wexler Row.
    scrub(T.person,
      (p) => p.address_street === 'Wexler Row' && p.address_number >= STORY.WEXLER_NUMBER,
      (p) => { p.address_number = rng.int(1, STORY.WEXLER_NUMBER - 40); });
    const w1 = addPerson({
      name: STORY.WITNESS_1, address_street: 'Wexler Row', address_number: STORY.WEXLER_NUMBER,
      district: 'Old Quay', income: 26000,
      license: { hair_color: 'white', age: 71, gender: 'male', eye_color: 'blue' },
    });

    // Witness 2 — the only Odile on Cardamom Lane.
    scrub(T.person,
      (p) => p.address_street === 'Cardamom Lane' && /^Odile\b/.test(p.name),
      (p) => { p.address_street = 'Thimble Alley'; });
    const w2 = addPerson({
      name: STORY.WITNESS_2, address_street: 'Cardamom Lane', address_number: 212,
      district: 'Old Quay', income: 44000,
      license: { hair_color: 'black', age: 34, gender: 'female' },
    });

    // The courier.
    scrub(T.courier_badge,
      (b) => b.employer === 'Meridian Freight' && /Vance/.test(b.name),
      (b) => { b.employer = 'Drayman Haulage'; });
    const petra = addPerson({
      name: STORY.COURIER, address_street: 'Ropewalk Terrace', district: 'Ironhaven', income: 29000,
      license: { hair_color: 'red', age: 31, gender: 'female', eye_color: 'green', car_model: 'Runabout' },
    });
    T.courier_badge.push({
      badge_no: STORY.PETRA_BADGE, person_id: petra.id, name: petra.name,
      employer: 'Meridian Freight', status: 'active', issued_date: 20230904,
    });

    addInterview(w1, 20240315,
      'I heard the shouting and then a splash. A courier came up the steps two at a time — ' +
      'a Meridian Freight jacket, the green one with the reflective shoulder. Red hair, tied back. ' +
      'She was carrying a satchel she did not have going down.');
    addInterview(w2, 20240315,
      'I have seen her on this run before. Her badge was clipped to the strap and I read the ' +
      'surname off it as she passed under the lamp: VANCE. She drives for Meridian Freight.');
    addInterview(petra, 20240402,
      'Fine. I collected a satchel, I did not know what was in it and I did not open it. ' +
      'The instructions came on paper, never a name. I was told the paperwork tying the job ' +
      'together sits in the employment archive at the Hall of Records on Ashgrove Street. ' +
      'If you want it, go quickly. People like these do not leave archives standing.');

    /* ---------------- CASE 2 — The Last Light on Ashgrove ----------------- */

    scrub(T.crime_scene_report,
      (r) => r.type === 'arson' && r.district === 'Lantern Row' &&
             r.report_date >= 20240401 && r.report_date <= 20240430,
      (r) => { r.type = 'vandalism'; });
    T.crime_scene_report.push({
      id: ++csrId, report_date: STORY.C2_ARSON, type: 'arson', district: 'Lantern Row',
      description:
        'Hall of Records, Ashgrove Street. Fire set deliberately in the employment archive; one ' +
        'drawer targeted, the rest smoke-damaged only. The night warden\'s door log is intact. ' +
        'Three keycards were used to enter the building between 22:00 and 23:59 on the night of ' +
        'the fire. Start there.',
    });

    // Only three IN scans in that window on that night at the Hall of Records.
    scrub(T.keycard_scan,
      (s) => s.building === 'Hall of Records' && s.scan_date === STORY.C2_ARSON && s.scan_time >= 2200,
      (s) => { s.scan_time = rng.int(800, 1700); });

    const osric = addPerson({
      name: STORY.ARSONIST, address_street: 'Cinder Hill', district: 'Lantern Row', income: 21000,
      license: { hair_color: 'black', age: 44, gender: 'male' },
    });
    const nightStaff = [
      addPerson({ name: makeName(), address_street: 'Gaslight Row', district: 'Lantern Row', income: 38000, license: {} }),
      addPerson({ name: makeName(), address_street: 'Tallow Street', district: 'Lantern Row', income: 41000, license: {} }),
    ];
    [osric, nightStaff[0], nightStaff[1]].forEach((p, i) => {
      T.keycard_scan.push({
        id: ++ksId, person_id: p.id, building: 'Hall of Records',
        scan_date: STORY.C2_ARSON, scan_time: 2206 + i * 37, direction: 'IN',
      });
    });
    // The two staff badged out; the arsonist did not.
    nightStaff.forEach((p, i) => {
      T.keycard_scan.push({
        id: ++ksId, person_id: p.id, building: 'Hall of Records',
        scan_date: STORY.C2_ARSON, scan_time: 2240 + i * 25, direction: 'OUT',
      });
    });
    // Only one of the three has a prior on record — that is the discriminator.
    scrub(T.interview, (iv) => iv.person_id === osric.id, () => {});
    addInterview(osric, 20240505,
      'I have done fires before, you know that, it is on my sheet from 2019. This one was ' +
      'different. I was paid to burn ONE drawer: the employment file for Meridian Freight. ' +
      'The work order came typed, unsigned but for two initials in the corner — V.A. ' +
      'Whoever she is, she sits on boards. That is all I have.');
    addInterview(nightStaff[0], 20240419, 'I lock up the reading room at ten and I was gone by eleven. I saw nobody.');
    addInterview(nightStaff[1], 20240419, 'I was checking the boiler. I badged out and went home. Nothing unusual.');

    /* ---------------- CASE 3 — Plate 8-?-J -------------------------------- */

    scrub(T.crime_scene_report,
      (r) => r.type === 'hit and run' && r.report_date === STORY.C3_HITRUN,
      (r) => { r.type = 'vandalism'; });
    T.crime_scene_report.push({
      id: ++csrId, report_date: STORY.C3_HITRUN, type: 'hit and run', district: 'Tarrow Flats',
      description:
        'A witness to the Hall of Records fire was struck and killed crossing Ferrous Lane. ' +
        'The vehicle was a GREY PANEL VAN. The camera on Ferrous Lane caught the plate only in ' +
        'part: it BEGINS with the digit 8 and contains the letter J. Cross the plate readings ' +
        'for this district and date against the licence register.',
    });

    // Make sure only one licence matches: plate 8%J%, grey, Panel Van.
    scrub(T.drivers_license,
      (l) => /^8.*J/.test(l.plate_number) && l.car_model === 'Panel Van' && l.car_color === 'grey',
      (l) => { l.car_color = 'blue'; });

    const corvin = addPerson({
      name: STORY.DRIVER, address_street: 'Ferrous Lane', district: 'Tarrow Flats', income: 34000,
      license: { plate_number: STORY.HITRUN_PLATE, car_make: 'Voss', car_model: 'Panel Van',
        car_color: 'grey', hair_color: 'brown', age: 39, gender: 'male', eye_color: 'brown' },
    });
    // Sightings: several 8...J plates that day, only one of them a Panel Van.
    const decoyPlates = [];
    for (let i = 0; i < 5; i++) {
      const l = T.drivers_license.find((x) => /^8/.test(x.plate_number) && x.car_model !== 'Panel Van' && !decoyPlates.includes(x.plate_number));
      if (l) {
        l.plate_number = '8' + PLATE_CH[rng.int(0, 22)] + 'J' + PLATE_CH[rng.int(0, 22)] + rng.int(10, 99);
        decoyPlates.push(l.plate_number);
      }
    }
    scrub(T.plate_reading,
      (r) => r.read_date === STORY.C3_HITRUN && r.district === 'Tarrow Flats' && /^8.*J/.test(r.plate_number),
      (r) => { r.district = 'Saltmere'; });
    decoyPlates.forEach((p, i) => {
      T.plate_reading.push({
        id: ++prId, plate_number: p, camera_id: 17, read_date: STORY.C3_HITRUN,
        read_time: 1900 + i * 11, district: 'Tarrow Flats',
      });
    });
    T.plate_reading.push({
      id: ++prId, plate_number: STORY.HITRUN_PLATE, camera_id: 17,
      read_date: STORY.C3_HITRUN, read_time: 1947, district: 'Tarrow Flats',
    });

    addInterview(corvin, 20240610,
      'I was told where to be and which way he would walk. I did not ask. The order did not come ' +
      'from a person, it came from a room — the fourth floor of the Nullport Vault. That is where ' +
      'they keep the ledgers, and that is where the instructions are written.');

    /* ---------------- CASE 4 — Three Nights at the Vault ------------------ */

    scrub(T.crime_scene_report,
      (r) => r.type === 'burglary' && r.report_date === STORY.C4_THEFT && r.district === 'Verdigris Hill',
      (r) => { r.district = 'Saltmere'; });
    T.crime_scene_report.push({
      id: ++csrId, report_date: STORY.C4_THEFT, type: 'burglary', district: 'Verdigris Hill',
      description:
        'Nullport Vault, fourth floor. Nothing of value taken except a single bound book listed ' +
        'on the inventory as "' + STORY.STOLEN_ITEM + '". Entry was made with a valid keycard ' +
        'between 01:00 and 03:00. Pull every scan on that building in that window and find out ' +
        'which of those cards should no longer have opened anything.',
    });

    scrub(T.keycard_scan,
      (s) => s.building === 'Nullport Vault' && s.scan_date === STORY.C4_THEFT &&
             s.scan_time >= 100 && s.scan_time <= 300,
      (s) => { s.scan_time = rng.int(900, 1800); });

    const delia = addPerson({
      name: STORY.INSIDER, address_street: 'Vellum Court', district: 'Verdigris Hill', income: 52000,
      license: { hair_color: 'auburn', age: 46, gender: 'female' },
    });
    const vaultStaff = [
      addPerson({ name: makeName(), address_street: 'Harrowgate', district: 'Verdigris Hill', income: 61000, license: {} }),
      addPerson({ name: makeName(), address_street: 'Inkwell Lane', district: 'Verdigris Hill', income: 58000, license: {} }),
      addPerson({ name: makeName(), address_street: 'Kelpwood Avenue', district: 'Verdigris Hill', income: 66000, license: {} }),
    ];
    const vaultCo = CO['Nullport Vault & Trust'];
    // Three current employees plus Delia, whose employment ended in April.
    vaultStaff.forEach((p) => {
      T.employment.push({
        id: ++empId, person_id: p.id, company_id: vaultCo, role: 'security',
        start_date: 20210301, end_date: null, salary: 55000,
      });
    });
    T.employment.push({
      id: ++empId, person_id: delia.id, company_id: vaultCo, role: 'shift manager',
      start_date: 20190601, end_date: 20240401, salary: 62000,
    });
    [delia].concat(vaultStaff).forEach((p, i) => {
      T.keycard_scan.push({
        id: ++ksId, person_id: p.id, building: 'Nullport Vault',
        scan_date: STORY.C4_THEFT, scan_time: 108 + i * 41, direction: 'IN',
      });
      T.keycard_scan.push({
        id: ++ksId, person_id: p.id, building: 'Nullport Vault',
        scan_date: STORY.C4_THEFT, scan_time: 150 + i * 44, direction: 'OUT',
      });
    });

    // Delia was paid from the Meridian Freight company account.
    const deliaAcct = giveAccount(delia, 88000);
    const meridianAcct = companyAccount.get(CO['Meridian Freight']);
    T.bank_transfer.push({
      id: ++trId, from_account: meridianAcct, to_account: deliaAcct, amount: 75000,
      transfer_date: 20240605, memo: 'consultancy', authorised_by: null,
    });
    const deliaPayId = trId;
    // Nothing else that large lands in her account.
    scrub(T.bank_transfer,
      (t) => t.to_account === deliaAcct && t.amount >= 40000 && t.id !== deliaPayId,
      (t) => { t.amount = rng.int(200, 3000); });

    addInterview(delia, 20240701,
      'They kept my card live after I left — I assumed it was an oversight and then the money ' +
      'arrived and I understood it was not. Seventy-five thousand, paid straight out of the ' +
      'Meridian Freight house account. Look at what else that account pays out and you will see ' +
      'it is not a haulage firm at all. Look at May.');

    /* ---------------- CASE 5 — The Payroll Skim --------------------------- */

    const ambrose = addPerson({
      name: STORY.CFO, address_street: 'Netherfield Road', district: 'Verdigris Hill', income: 148000,
      license: { hair_color: 'grey', age: 57, gender: 'male' },
    });
    const ambroseAcct = giveAccount(ambrose, 410000);
    T.employment.push({
      id: ++empId, person_id: ambrose.id, company_id: CO['Meridian Freight'],
      role: 'accountant', start_date: 20170201, end_date: null, salary: 141000,
    });

    // The ghost employee: on the payroll, but with no licence, no income, no SSN.
    const sable = addPerson({
      name: STORY.GHOST, address_street: 'Sable Walk', district: 'Ironhaven', income: null,
    });
    const sableAcct = giveAccount(sable, 12000);
    T.employment.push({
      id: ++empId, person_id: sable.id, company_id: CO['Meridian Freight'],
      role: 'analyst', start_date: 20231101, end_date: null, salary: 38000,
    });

    // Normal payroll for the whole of 2024, then a spike in May.
    const meridianStaff = T.employment.filter((e) => e.company_id === CO['Meridian Freight'] && !e.end_date);
    const months2024 = [202401, 202402, 202403, 202404, 202405, 202406, 202407, 202408];
    months2024.forEach((m) => {
      const payDate = m * 100 + 28;
      meridianStaff.forEach((e) => {
        const acct = personAccount.get(e.person_id);
        if (!acct) return;
        T.bank_transfer.push({
          id: ++trId, from_account: meridianAcct, to_account: acct,
          amount: Math.round(e.salary / 12), transfer_date: payDate,
          memo: 'PAYROLL ' + m, authorised_by: ambrose.id,
        });
      });
    });
    // Guarantee no random transfer already pushed a Meridian recipient over the line.
    scrub(T.bank_transfer,
      (t) => t.from_account === meridianAcct && t.amount > 60000 &&
             !/^PAYROLL/.test(t.memo || '') && t.id !== deliaPayId,
      (t) => { t.amount = rng.int(500, 9000); });
    // The skim: two people, May only, far above any salary.
    T.bank_transfer.push(
      { id: ++trId, from_account: meridianAcct, to_account: ambroseAcct, amount: 420000,
        transfer_date: 20240514, memo: 'PAYROLL 202405 adj', authorised_by: ambrose.id },
      { id: ++trId, from_account: meridianAcct, to_account: sableAcct, amount: 388000,
        transfer_date: 20240521, memo: 'PAYROLL 202405 adj', authorised_by: ambrose.id }
    );

    addInterview(ambrose, 20240815,
      'I signed them. Of course I signed them — someone has to. But look at who the second ' +
      'payment went to. ' + STORY.GHOST + ' has drawn a salary from us since November and I have ' +
      'never met her. No licence. No tax record. No face. Find out who has been cashing that ' +
      'name and you will be closer than I ever got.');

    /* ---------------- CASE 6 — The Ghost on the Manifest ------------------ */

    // Exactly three Meridian staff with no licence: Sable plus two mundane ones.
    const noLicenceExtras = [
      addPerson({ name: makeName(), address_street: 'Oakum Lane', district: 'Ironhaven', income: 27000 }),
      addPerson({ name: makeName(), address_street: 'Mudlark Way', district: 'Ironhaven', income: 30000 }),
    ];
    noLicenceExtras.forEach((p) => {
      T.employment.push({
        id: ++empId, person_id: p.id, company_id: CO['Meridian Freight'],
        role: 'warehouse hand', start_date: 20220401, end_date: null, salary: 29000,
      });
    });
    // Any other licence-less Meridian employee gets a licence, so the count is exactly 3.
    T.employment.forEach((e) => {
      if (e.company_id !== CO['Meridian Freight'] || e.end_date) return;
      const p = byId.get(e.person_id);
      if (!p || p.license_id) return;
      if (p.id === sable.id || noLicenceExtras.some((x) => x.id === p.id)) return;
      const id = T.drivers_license.length + 1;
      T.drivers_license.push({
        id, age: rng.int(22, 62), height: rng.int(60, 76), eye_color: rng.pick(EYE),
        hair_color: rng.pick(HAIR), gender: rng.pick(GENDER), plate_number: makePlate(),
        car_make: rng.pick(CAR_MAKE), car_model: rng.pick(CAR_MODEL),
        car_color: rng.pick(CAR_COLOR), issued_date: 20200101,
      });
      p.license_id = id;
    });

    // Of those three, only Sable never appears in a keycard scan.
    scrub(T.keycard_scan, (s) => s.person_id === sable.id, (s) => { s.person_id = petra.id; });
    noLicenceExtras.forEach((p, i) => {
      T.keycard_scan.push({
        id: ++ksId, person_id: p.id, building: 'Meridian Freight Depot',
        scan_date: 20240220 + i, scan_time: 800, direction: 'IN',
      });
      T.keycard_scan.push({
        id: ++ksId, person_id: p.id, building: 'Meridian Freight Depot',
        scan_date: 20240220 + i, scan_time: 1700, direction: 'OUT',
      });
    });

    // Sable sails six times; Ivo Castellan is aboard every single one of them.
    const ivo = addPerson({
      name: STORY.HANDLER, address_street: 'Undercliff Road', district: 'Pell Harbour', income: 96000,
      license: { hair_color: 'black', age: 51, gender: 'male', eye_color: 'grey' },
    });
    const ivoAcct = giveAccount(ivo, 240000);
    scrub(T.ferry_manifest, (f) => f.person_id === sable.id || f.person_id === ivo.id,
      (f) => { f.person_id = rng.int(1, SIZES.people); });

    const sailings = [
      [20240119, 730], [20240216, 730], [20240322, 1130],
      [20240426, 1130], [20240524, 1900], [20240628, 1900],
    ];
    // Companions who share SOME sailings but not all — so only Ivo matches every trip.
    const companions = [
      addPerson({ name: makeName(), address_street: 'Jetty Approach', district: 'Pell Harbour', income: 52000, license: {} }),
      addPerson({ name: makeName(), address_street: 'Shingle Street', district: 'Pell Harbour', income: 47000, license: {} }),
    ];
    companions.forEach((c) => {
      scrub(T.ferry_manifest, (f) => f.person_id === c.id, (f) => { f.person_id = rng.int(1, SIZES.people); });
    });
    sailings.forEach(([d, t], i) => {
      const common = { vessel: 'MV Grey Petrel', sail_date: d, sail_time: t, origin: 'Nullport', destination: 'Rill Island' };
      T.ferry_manifest.push(Object.assign({ id: ++fmId, person_id: sable.id }, common));
      T.ferry_manifest.push(Object.assign({ id: ++fmId, person_id: ivo.id }, common));
      if (i < 4) T.ferry_manifest.push(Object.assign({ id: ++fmId, person_id: companions[0].id }, common));
      if (i > 1 && i < 6) T.ferry_manifest.push(Object.assign({ id: ++fmId, person_id: companions[1].id }, common));
    });
    // No one else was on those exact sailings.
    scrub(T.ferry_manifest,
      (f) => sailings.some(([d, t]) => f.sail_date === d && f.sail_time === t) &&
             ![sable.id, ivo.id, companions[0].id, companions[1].id].includes(f.person_id),
      (f) => { f.sail_time = 1500; });

    addInterview(ivo, 20240902,
      'Sable Wren is a name on a bank mandate, nothing more. I opened her, I signed for her, ' +
      'I rode the boat with her paperwork in my coat six times. And then the money left my hands ' +
      'and went somewhere I was not permitted to follow. It moves account to account, one hop at ' +
      'a time, and it does not stop until it reaches the last one. Follow it to the end.');

    /* ---------------- CASE 7 — Follow the Money --------------------------- */

    const shellCo = CO[STORY.SHELL];
    const shellAcct = companyAccount.get(shellCo);
    // A clean seven-hop chain: Ivo -> h1 -> ... -> Alderpoint Holdings.
    const hopPeople = STORY.CHAIN.map((nm) => addPerson({
      name: nm, address_street: rng.pick(STREETS), district: rng.pick(DISTRICTS),
      income: rng.int(30000, 70000), license: {},
    }));
    const chainAccts = [ivoAcct].concat(hopPeople.map((p) => giveAccount(p, rng.int(2000, 40000)))).concat([shellAcct]);
    // Nothing else may leave a chain account, or the trail would branch.
    scrub(T.bank_transfer,
      (t) => chainAccts.includes(t.from_account),
      (t) => { t.from_account = rng.pick(acctIds); });

    let amt = 900000;
    for (let i = 0; i < chainAccts.length - 1; i++) {
      amt = Math.round(amt * 0.93);
      T.bank_transfer.push({
        id: ++trId, from_account: chainAccts[i], to_account: chainAccts[i + 1],
        amount: amt, transfer_date: 20240701 + i, memo: 'onward settlement', authorised_by: null,
      });
    }
    // And the terminus must be terminal: no outgoing transfer from the shell account at all.
    scrub(T.bank_transfer, (t) => t.from_account === shellAcct, (t) => { t.from_account = rng.pick(acctIds); });

    /* ---------------- CASE 8 — The Architect ------------------------------ */

    const vivienne = addPerson({
      name: STORY.ARCHITECT, address_street: 'Verger Lane', district: 'Verdigris Hill', income: 255000,
      license: { hair_color: 'silver', age: 61, gender: 'female', eye_color: 'blue',
        car_make: 'Halcyon', car_model: 'Saloon' },
    });
    giveAccount(vivienne, 1250000);
    giveNumber(vivienne, STORY.ARCHITECT_PHONE);
    // She chairs all four fronts — corroboration for the epilogue.
    FRONTS.forEach((f, i) => {
      T.board_member.push({
        id: ++bmId, company_id: CO[f.name], person_id: vivienne.id, role: 'chair',
        appointed_date: 20190115 + i * 1000, resigned_date: null,
      });
    });

    // The burner line — registered to nobody.
    T.phone_line.push({
      number: STORY.BURNER, person_id: null, carrier: 'Beacon Mobile', registered_date: 20231201,
    });

    const gantryNorth = towerByName.get('Gantry North');
    const otherTowers = T.cell_tower.map((t) => t.id).filter((id) => id !== gantryNorth);
    // Clear the field: on each of the five nights, no other number should route
    // through Gantry North in the 22:00-23:59 window.
    scrub(T.phone_call,
      (c) => STORY.C8_NIGHTS.includes(c.call_date) && c.tower_id === gantryNorth && c.call_time >= 2200,
      (c) => { c.tower_id = rng.pick(otherTowers); });

    // Each night: the burner makes several calls; the LONGEST always goes to Vivienne.
    const nightDecoys = [petra, osric, corvin, delia, ambrose].map((p) => personNumber.get(p.id) || giveNumber(p));
    STORY.C8_NIGHTS.forEach((night, i) => {
      // Short decoy calls to operatives.
      nightDecoys.forEach((num, j) => {
        if ((i + j) % 2 === 0) {
          T.phone_call.push({
            id: ++callId, caller_number: STORY.BURNER, receiver_number: num,
            call_date: night, call_time: 2205 + j * 9, duration_sec: 40 + j * 25,
            tower_id: gantryNorth,
          });
        }
      });
      // The long one.
      T.phone_call.push({
        id: ++callId, caller_number: STORY.BURNER, receiver_number: STORY.ARCHITECT_PHONE,
        call_date: night, call_time: 2318 + i, duration_sec: 900 + i * 60,
        tower_id: gantryNorth,
      });
      // A second registered number also uses the mast, but not on every night —
      // so HAVING COUNT(DISTINCT night) = 5 isolates the burner alone.
      if (i < 3) {
        T.phone_call.push({
          id: ++callId, caller_number: personNumber.get(companions[0].id) || giveNumber(companions[0]),
          receiver_number: personNumber.get(w1.id) || giveNumber(w1),
          call_date: night, call_time: 2230 + i, duration_sec: 120, tower_id: gantryNorth,
        });
      }
    });

    addInterview(vivienne, 20241001,
      'You have a telephone number and a series of coincidences. I chair four companies in this ' +
      'city and I have never once been asked to explain why. Charge me or open the door.');

    /* ---- final integrity touch-ups --------------------------------------- */
    // Keep person.ssn -> income.ssn honest for everyone we minted late.
    const incomeSsns = new Set(T.income.map((r) => r.ssn));
    T.person.forEach((p) => { if (p.ssn && !incomeSsns.has(p.ssn)) p.ssn = null; });

    return {
      tables: T,
      defs: TABLES,
      story: STORY,
      ids: {
        meridian: CO['Meridian Freight'],
        shellCompany: shellCo,
        shellAccount: shellAcct,
        meridianAccount: meridianAcct,
        ivoAccount: ivoAcct,
        gantryNorth,
        vaultCompany: vaultCo,
        people: {
          victim: victim.id, witness1: w1.id, witness2: w2.id, courier: petra.id,
          arsonist: osric.id, driver: corvin.id, insider: delia.id, cfo: ambrose.id,
          ghost: sable.id, handler: ivo.id, architect: vivienne.id,
        },
      },
    };
  }

  /* --------------------------------------------------------------------------
   * 7. SQL emission
   * ------------------------------------------------------------------------ */

  function sqlLiteral(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    return "'" + String(v).replace(/'/g, "''") + "'";
  }

  function ddl() {
    return TABLES.map((t) => {
      const cols = t.columns.map((c) => {
        let s = '  ' + c[0] + ' ' + c[1];
        if (c[2] === 'pk') s += ' PRIMARY KEY';
        return s;
      }).join(',\n');
      return 'CREATE TABLE ' + t.name + ' (\n' + cols + '\n);';
    }).join('\n');
  }

  /** Yields chunks of SQL so a caller can drive a progress bar. */
  function* sqlChunks(world, rowsPerChunk) {
    const per = rowsPerChunk || 900;
    for (const def of TABLES) {
      const rows = world.tables[def.name];
      if (!rows || !rows.length) continue;
      const colNames = def.columns.map((c) => c[0]);
      for (let i = 0; i < rows.length; i += per) {
        const slice = rows.slice(i, i + per);
        const values = slice.map(
          (r) => '(' + colNames.map((c) => sqlLiteral(r[c])).join(',') + ')'
        ).join(',');
        yield {
          table: def.name,
          sql: 'INSERT INTO ' + def.name + ' (' + colNames.join(',') + ') VALUES ' + values + ';',
          rows: slice.length,
        };
      }
    }
  }

  function totalRows(world) {
    return TABLES.reduce((n, d) => n + (world.tables[d.name] ? world.tables[d.name].length : 0), 0);
  }

  root.NullportWorld = {
    // Bump this whenever generation changes, so cached databases are rebuilt.
    VERSION: 1,
    build: buildWorld,
    TABLES,
    STORY,
    ddl,
    sqlChunks,
    totalRows,
    Rng,
    enumerateDates,
    ymd,
    monthOf,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
