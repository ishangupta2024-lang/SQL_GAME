/* =============================================================================
 * NULLPORT — application shell.
 * View routing, progress, the SQL console, and answer checking.
 * ========================================================================== */
(function () {
  'use strict';

  const CASES = globalThis.NullportCases.CASES;
  const PROLOGUE = globalThis.NullportCases.PROLOGUE;
  const RANKS = globalThis.NullportCases.RANKS;
  const ANSWER = globalThis.NullportAnswer;
  const WORLD = globalThis.NullportWorld;

  const SAVE_KEY = 'nullport.save.v1';
  const MAX_ROWS = 500;

  let DB = null;          // sql.js Database
  let cm = null;          // CodeMirror instance, when a case is open
  let state = null;       // persisted progress
  let sideTab = 'case';   // case | schema | notes
  let activeStageIx = {}; // caseId -> index (session only)
  let lastRun = null;     // {ms, rows}
  let completionState = null; // active autocomplete widget
  let erdSvgCache = { detailed: '', compact: '' };
  let erdView = null;
  let erdCompactMode = false;
  let erdDrag = null;
  let erdHandlersBound = false;
  let erdOverlay = null;

  const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON',
    'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS',
    'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'COUNT',
    'SUM', 'AVG', 'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'UNION', 'ALL', 'WITH', 'INSERT', 'UPDATE', 'DELETE'
  ];

  const SCHEMA_INFO = (function buildSchemaInfo() {
    const tables = {};
    const tableNames = [];
    WORLD.TABLES.forEach((table) => {
      const columns = table.columns.map((col) => col[0]);
      tables[table.name] = {
        name: table.name,
        columns: columns,
        columnsLower: columns.map((col) => col.toLowerCase()),
      };
      tableNames.push(table.name);
    });
    return { tables, tableNames };
  })();

  /* ------------------------------------------------------------------ utils */

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = ''; }, 2600);
  }

  function confirmDialog(title, body, okLabel) {
    return new Promise((resolve) => {
      const veil = document.createElement('div');
      veil.className = 'veil';
      veil.innerHTML =
        '<div class="dialog"><h3>' + esc(title) + '</h3><p>' + body + '</p>' +
        '<div class="acts"><button class="btn" data-no>Cancel</button>' +
        '<button class="btn primary" data-yes>' + esc(okLabel || 'Confirm') + '</button></div></div>';
      document.body.appendChild(veil);
      const close = (v) => { veil.remove(); resolve(v); };
      $('[data-no]', veil).onclick = () => close(false);
      $('[data-yes]', veil).onclick = () => close(true);
      veil.onclick = (e) => { if (e.target === veil) close(false); };
    });
  }

  /* ------------------------------------------------------------------- save */

  function blankSave() {
    return { solved: {}, hints: {}, wrong: {}, answers: {}, notes: '', history: [], prologueSeen: false };
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return blankSave();
      return Object.assign(blankSave(), JSON.parse(raw));
    } catch (e) { return blankSave(); }
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  /* ------------------------------------------------------------- progress */

  const caseSolved = (c) => c.stages.every((s) => state.solved[s.id]);
  const solvedCount = () => CASES.filter(caseSolved).length;
  const caseUnlocked = (c) => c.number === 1 || caseSolved(CASES[c.number - 2]);
  const totalStages = () => CASES.reduce((n, c) => n + c.stages.length, 0);
  const solvedStages = () => CASES.reduce((n, c) => n + c.stages.filter((s) => state.solved[s.id]).length, 0);
  const hintsUsed = () => Object.keys(state.hints).reduce((n, k) => n + state.hints[k], 0);

  function firstUnsolvedIx(c) {
    const i = c.stages.findIndex((s) => !state.solved[s.id]);
    return i === -1 ? c.stages.length - 1 : i;
  }

  function stageUnlocked(c, ix) {
    return ix === 0 || !!state.solved[c.stages[ix - 1].id];
  }

  /* ------------------------------------------------------------------ topbar */

  function renderTop() {
    const rank = RANKS[Math.min(solvedCount(), RANKS.length - 1)];
    $('#topbar').innerHTML =
      '<div class="mark" id="home">Nullport<small>Bureau Records Terminal</small></div>' +
      '<div class="crumb" id="crumb"></div>' +
      '<div class="spacer"></div>' +
      '<div class="rankchip"><span class="r-label">Rank</span>' +
      '<span class="r-name">' + esc(rank) + '</span></div>' +
      '<button class="btn ghost small" id="menu-btn">Menu</button>';
    $('#home').onclick = () => go('board');
    $('#menu-btn').onclick = openMenu;
  }

  function setCrumb(html) { const c = $('#crumb'); if (c) c.innerHTML = html || ''; }

  async function openMenu() {
    const veil = document.createElement('div');
    veil.className = 'veil';
    veil.innerHTML =
      '<div class="dialog"><h3>Terminal</h3>' +
      '<p>Solved <b>' + solvedStages() + '</b> of <b>' + totalStages() + '</b> stages across <b>' +
      solvedCount() + '</b> of ' + CASES.length + ' cases. Hints taken: <b>' + hintsUsed() + '</b>.<br><br>' +
      'The database lives entirely in your browser. Nothing is uploaded anywhere.</p>' +
      '<div class="acts" style="flex-wrap:wrap">' +
      '<button class="btn" data-rebuild>Rebuild database</button>' +
      '<button class="btn" data-reset>Reset progress</button>' +
      '<button class="btn primary" data-close>Close</button></div></div>';
    document.body.appendChild(veil);
    const close = () => veil.remove();
    $('[data-close]', veil).onclick = close;
    veil.onclick = (e) => { if (e.target === veil) close(); };
    $('[data-rebuild]', veil).onclick = async () => {
      close();
      if (await confirmDialog('Rebuild database?',
        'Regenerates every table from scratch. Your case progress and notes are kept.',
        'Rebuild')) {
        await WORLD && globalThis.NullportDB.clearCache();
        location.reload();
      }
    };
    $('[data-reset]', veil).onclick = async () => {
      close();
      if (await confirmDialog('Reset all progress?',
        'Every case is locked again and your notes are erased. This cannot be undone.',
        'Erase everything')) {
        state = blankSave(); save(); activeStageIx = {}; go('board');
        toast('Progress erased.', 'bad');
      }
    };
  }

  /* -------------------------------------------------------------- routing */

  function go(where, arg) {
    destroyEditor();
    const v = $('#view');
    v.scrollTop = 0;
    if (where === 'prologue') renderPrologue(v);
    else if (where === 'case') renderCase(v, arg);
    else if (where === 'finale') renderFinale(v);
    else renderBoard(v);
    renderTop();
    if (where === 'case') {
      const c = CASES.find((x) => x.id === arg);
      setCrumb('Case ' + c.number + ' &nbsp;·&nbsp; <b>' + esc(c.title) + '</b>');
    }
  }

  function destroyEditor() {
    closeAutocomplete();
    erdDrag = null;
    closeErdFullscreen(true);
    erdView = null;
    if (cm) { try { cm.toTextArea(); } catch (e) {} cm = null; }
  }

  function erdName(name) {
    return String(name || '').replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
  }

  function getErdRelationships() {
    const relationships = [];
    WORLD.TABLES.forEach((table) => {
      table.columns.forEach((col) => {
        const kind = col[2] || '';
        if (kind.indexOf('fk:') !== 0) return;
        const targetTable = kind.slice(3).split('.')[0];
        relationships.push({
          sourceTable: targetTable,
          targetTable: table.name,
          column: col[0],
        });
      });
    });
    return relationships;
  }

  function buildErdDefinition(compact) {
    const lines = ['erDiagram'];

    WORLD.TABLES.forEach((table) => {
      lines.push('  ' + erdName(table.name) + ' {');
      table.columns.forEach((col) => {
        const kind = col[2] || '';
        const isPk = kind === 'pk';
        const isFk = kind.indexOf('fk:') === 0;
        if (compact && !isPk && !isFk) return;
        const tags = [];
        if (isPk) tags.push('PK');
        if (isFk) tags.push('FK');
        lines.push('    ' + col[1] + ' ' + col[0] + (tags.length ? ' ' + tags.join(', ') : ''));
      });
      lines.push('  }');
    });

    getErdRelationships().forEach((rel) => {
      lines.push('  ' + erdName(rel.sourceTable) + ' ||--o{ ' + erdName(rel.targetTable) + ' : ' + rel.column);
    });

    return lines.join('\n');
  }

  function ensureErdRenderer() {
    if (!globalThis.mermaid || ensureErdRenderer._ready) return !!globalThis.mermaid;
    globalThis.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      themeVariables: {
        background: '#f3ecdf',
        mainBkg: '#efe4d1',
        primaryColor: '#efe4d1',
        primaryBorderColor: '#8a6a2c',
        primaryTextColor: '#241d14',
        lineColor: '#8a6a2c',
        tertiaryColor: '#f8f2e7',
        secondaryColor: '#e5d5ba',
        secondaryBorderColor: '#9a7a3a',
        tertiaryTextColor: '#342b1f',
        edgeLabelBackground: '#fbf7ef',
        fontFamily: 'Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif',
      },
      er: {
        layoutDirection: 'LR',
        useMaxWidth: false,
        diagramPadding: 8,
        minEntityWidth: 140,
        minEntityHeight: 44,
        entityPadding: 8,
        nodeSpacing: 60,
        rankSpacing: 60,
        fontSize: 13,
      },
      flowchart: { useMaxWidth: false },
    });
    ensureErdRenderer._ready = true;
    return true;
  }

  function getErdCacheKey() {
    return erdCompactMode ? 'compact' : 'detailed';
  }

  function getErdPanel() {
    return $('#erd-panel-shell');
  }

  function isErdFullscreen() {
    return !!(erdOverlay && erdOverlay.parentNode);
  }

  function getErdNodeEl(svg, tableName) {
    return svg.querySelector('[id^="entity-' + CSS.escape(erdName(tableName)) + '-"]');
  }

  function setErdStatus(text) {
    const box = $('#erd-status');
    if (box) box.textContent = text || '';
  }

  function clearErdHighlight() {
    if (!erdView || !erdView.svg) return;
    $$('.is-source, .is-target, .is-active, .is-faded', erdView.svg).forEach((el) => {
      el.classList.remove('is-source', 'is-target', 'is-active', 'is-faded');
    });
    setErdStatus(erdCompactMode
      ? 'Compact view · keys and joins only'
      : 'Detailed view · all fields and datatypes');
  }

  function applyErdViewBox() {
    if (!erdView || !erdView.svg) return;
    const vb = erdView.viewBox;
    erdView.svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].join(' '));
  }

  function setErdViewBox(next) {
    if (!erdView) return;
    erdView.viewBox = next;
    applyErdViewBox();
  }

  function fitErdToBox(box, paddingFactor) {
    if (!erdView || !box) return;
    const pad = Math.max(18, ((paddingFactor || 0.12) * Math.max(box.width, box.height)));
    setErdViewBox({
      x: box.x - pad,
      y: box.y - pad,
      w: box.width + pad * 2,
      h: box.height + pad * 2,
    });
  }

  function fitErd() {
    if (!erdView) return;
    fitErdToBox(erdView.baseBox, 0.04);
  }

  function zoomErd(factor) {
    if (!erdView) return;
    const current = erdView.viewBox;
    const nextW = Math.max(erdView.baseBox.width * 0.28, Math.min(erdView.baseBox.width * 2.4, current.w * factor));
    const nextH = Math.max(erdView.baseBox.height * 0.28, Math.min(erdView.baseBox.height * 2.4, current.h * factor));
    setErdViewBox({
      x: current.x + (current.w - nextW) / 2,
      y: current.y + (current.h - nextH) / 2,
      w: nextW,
      h: nextH,
    });
  }

  function bindErdControls() {
    if ($('#erd-zoom-in')) $('#erd-zoom-in').onclick = () => zoomErd(0.82);
    if ($('#erd-zoom-out')) $('#erd-zoom-out').onclick = () => zoomErd(1.22);
    if ($('#erd-fit')) $('#erd-fit').onclick = fitErd;
    if ($('#erd-reset')) $('#erd-reset').onclick = () => {
      clearErdHighlight();
      fitErd();
    };
    if ($('#erd-mode')) {
      $('#erd-mode').textContent = erdCompactMode ? 'Show details' : 'Compact';
      $('#erd-mode').onclick = () => {
        erdCompactMode = !erdCompactMode;
        erdView = null;
        renderErd(true);
      };
    }
    if ($('#erd-expand')) {
      $('#erd-expand').textContent = isErdFullscreen() ? 'Collapse' : 'Expand';
      $('#erd-expand').onclick = () => {
        if (isErdFullscreen()) closeErdFullscreen();
        else openErdFullscreen();
      };
    }
  }

  function ensureErdOverlay() {
    if (erdOverlay) return erdOverlay;
    erdOverlay = document.createElement('div');
    erdOverlay.className = 'erd-overlay';
    erdOverlay.innerHTML =
      '<div class="erd-overlay__dialog">' +
      '<div class="erd-overlay__top">' +
      '<div class="erd-overlay__title">Entity Map</div>' +
      '<button class="btn ghost small" id="erd-close">Exit</button>' +
      '</div>' +
      '<div class="erd-overlay__body" id="erd-overlay-body"></div>' +
      '</div>';
    return erdOverlay;
  }

  function openErdFullscreen() {
    const panel = getErdPanel();
    if (!panel || isErdFullscreen()) return;
    const overlay = ensureErdOverlay();
    document.body.appendChild(overlay);
    $('#erd-overlay-body', overlay).appendChild(panel);
    panel.classList.add('is-fullscreen');
    $('#erd-close', overlay).onclick = () => closeErdFullscreen();
    overlay.onclick = (e) => { if (e.target === overlay) closeErdFullscreen(); };
    bindErdControls();
    if (getErdPanel()) setupErdViewport($('#erd-diagram'));
  }

  function closeErdFullscreen(silent) {
    const panel = getErdPanel();
    const home = $('#erd-panel-home');
    if (!isErdFullscreen()) return;
    if (panel && home) {
      home.appendChild(panel);
      panel.classList.remove('is-fullscreen');
    }
    if (erdOverlay && erdOverlay.parentNode) erdOverlay.parentNode.removeChild(erdOverlay);
    if (!silent) bindErdControls();
    if (getErdPanel()) setupErdViewport($('#erd-diagram'));
  }

  function normalizeErdMarkers(svg) {
    $$('marker', svg).forEach((marker) => {
      marker.setAttribute('markerUnits', 'strokeWidth');
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '10');
      marker.setAttribute('refY', '7');
      marker.setAttribute('orient', 'auto');
      marker.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      marker.style.overflow = 'visible';
      $$('circle, path, line, polyline', marker).forEach((shape) => {
        shape.classList.add('erd-marker-shape');
        shape.setAttribute('vector-effect', 'non-scaling-stroke');
        shape.setAttribute('stroke-linecap', 'round');
        shape.setAttribute('stroke-linejoin', 'round');
      });
    });
  }

  function focusErdRelation(sourceEl, targetEl) {
    if (!sourceEl || !targetEl || !erdView) return;
    const a = sourceEl.getBBox();
    const b = targetEl.getBBox();
    const box = {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
      height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y),
    };
    fitErdToBox(box, 0.18);
  }

  function wireErdInteraction(svg) {
    const frame = $('#erd-stage');
    if (!frame) return;

    const relationships = getErdRelationships();
    const edges = $$('.relationshipLine', svg);
    edges.forEach((edge, index) => {
      const rel = relationships[index];
      if (!rel) return;
      edge.classList.add('is-clickable');
      edge.dataset.sourceTable = rel.sourceTable;
      edge.dataset.targetTable = rel.targetTable;
      edge.dataset.column = rel.column;
      edge.onclick = () => {
        clearErdHighlight();
        const sourceEl = getErdNodeEl(svg, rel.sourceTable);
        const targetEl = getErdNodeEl(svg, rel.targetTable);
        if (!sourceEl || !targetEl) return;
        edge.classList.add('is-active');
        sourceEl.classList.add('is-source');
        targetEl.classList.add('is-target');

        $$('.node', svg).forEach((node) => {
          if (node !== sourceEl && node !== targetEl) node.classList.add('is-faded');
        });
        edges.forEach((line) => {
          if (line !== edge) line.classList.add('is-faded');
        });

        setErdStatus(rel.targetTable + '.' + rel.column + ' points to ' + rel.sourceTable);
        focusErdRelation(sourceEl, targetEl);
      };
    });

    frame.onmousedown = (e) => {
      if (!erdView || e.target.closest('.relationshipLine')) return;
      erdDrag = { x: e.clientX, y: e.clientY };
      frame.classList.add('is-dragging');
    };
    frame.onwheel = (e) => {
      e.preventDefault();
      zoomErd(e.deltaY < 0 ? 0.9 : 1.1);
    };

    if (!erdHandlersBound) {
      window.addEventListener('mousemove', (e) => {
        const activeFrame = $('#erd-stage');
        if (!erdDrag || !erdView || !activeFrame) return;
        const dx = e.clientX - erdDrag.x;
        const dy = e.clientY - erdDrag.y;
        erdDrag = { x: e.clientX, y: e.clientY };
        const vb = erdView.viewBox;
        const scaleX = vb.w / Math.max(1, activeFrame.clientWidth);
        const scaleY = vb.h / Math.max(1, activeFrame.clientHeight);
        setErdViewBox({
          x: vb.x - dx * scaleX,
          y: vb.y - dy * scaleY,
          w: vb.w,
          h: vb.h,
        });
      });
      window.addEventListener('mouseup', () => {
        erdDrag = null;
        const activeFrame = $('#erd-stage');
        if (activeFrame) activeFrame.classList.remove('is-dragging');
      });
      erdHandlersBound = true;
    }
  }

  function setupErdViewport(mount) {
    const svg = $('svg', mount);
    const root = svg && $('g', svg);
    if (!svg || !root || !root.getBBox) return;
    normalizeErdMarkers(svg);
    const box = root.getBBox();
    erdView = {
      svg: svg,
      baseBox: {
        x: box.x,
        y: box.y,
        width: Math.max(1, box.width),
        height: Math.max(1, box.height),
      },
      viewBox: null,
    };
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    fitErd();
    clearErdHighlight();
    wireErdInteraction(svg);
    bindErdControls();
  }

  function renderErd(force) {
    const mount = $('#erd-diagram');
    if (!mount) return;
    bindErdControls();

    const cacheKey = getErdCacheKey();
    if (!force && erdSvgCache[cacheKey]) {
      mount.innerHTML = erdSvgCache[cacheKey];
      setupErdViewport(mount);
      return;
    }

    if (!ensureErdRenderer()) {
      mount.innerHTML = '<div class="erd-empty">ER diagram library failed to load.</div>';
      return;
    }

    mount.innerHTML = '<div class="erd-empty">Drawing entity map…</div>';
    const renderId = 'nullport-erd-' + Date.now();

    globalThis.mermaid.render(renderId, buildErdDefinition(erdCompactMode)).then((result) => {
      if (!$('#erd-diagram')) return;
      erdSvgCache[cacheKey] = result.svg;
      mount.innerHTML = result.svg;
      if (result.bindFunctions) result.bindFunctions(mount);
      setupErdViewport(mount);
    }).catch((err) => {
      mount.innerHTML = '<div class="erd-empty">Could not render the ER diagram.</div>';
      console.error(err);
    });
  }

  /* ------------------------------------------------------------- prologue */

  function renderPrologue(v) {
    v.className = 'scroller';
    v.innerHTML =
      '<div class="prologue">' +
      '<h1>' + esc(PROLOGUE.title) + '</h1>' +
      '<div class="kicker">Bureau Records Terminal · Restricted Access</div>' +
      PROLOGUE.lines.map((l) => '<p>' + l + '</p>').join('') +
      '<div class="signoff">' + esc(PROLOGUE.signoff) + '</div>' +
      '<div class="actions">' +
      '<button class="btn primary" id="begin">Open the first file</button>' +
      '<span style="font-family:var(--mono);font-size:11.5px;color:var(--text-faint)">' +
      '8 cases · 26 stages · no prior SQL needed</span>' +
      '</div></div>';
    $('#begin').onclick = () => {
      state.prologueSeen = true; save(); go('board');
    };
  }

  /* ---------------------------------------------------------------- board */

  function renderBoard(v) {
    v.className = 'scroller';
    const done = solvedStages();
    const pct = Math.round((done / totalStages()) * 100);

    const cards = CASES.map((c) => {
      const solved = caseSolved(c);
      const unlocked = caseUnlocked(c);
      const mine = c.stages.filter((s) => state.solved[s.id]).length;
      const cls = solved ? 'solved' : (unlocked ? 'open' : 'locked');
      const stamp = solved ? '<div class="stamp">Closed</div>'
        : (!unlocked ? '<div class="stamp">Sealed</div>' : '');
      return '<div class="case-card ' + cls + '" data-case="' + c.id + '">' + stamp +
        '<div class="cno">Case File ' + String(c.number).padStart(2, '0') + '</div>' +
        '<h3>' + esc(c.title) + '</h3>' +
        '<p>' + (unlocked ? c.hook : 'Close the previous case to unseal this file.') + '</p>' +
        '<div class="concept-chips">' +
        (unlocked ? c.concepts.slice(0, 4).map((x) => '<span class="chip">' + esc(x) + '</span>').join('') : '') +
        '</div>' +
        '<div class="meta"><span class="tier ' + c.tier + '">' + c.tier + '</span>' +
        '<span class="stagecount">' + mine + '/' + c.stages.length + ' stages</span></div>' +
        '</div>';
    }).join('');

    const allDone = solvedCount() === CASES.length;

    v.innerHTML =
      '<div class="board">' +
      '<div class="board-head">' +
      '<div><h2>Open Files</h2>' +
      '<div class="sub">' + done + ' / ' + totalStages() + ' stages cleared · ' +
      hintsUsed() + ' hints taken</div></div>' +
      '<div class="spacer"></div>' +
      (allDone ? '<button class="btn primary" id="see-finale">View final report</button>' : '') +
      '<button class="btn ghost" id="reread">Re-read the briefing</button>' +
      '</div>' +
      '<div class="progress-rail"><span style="width:' + pct + '%"></span></div>' +
      '<div class="case-grid">' + cards + '</div>' +
      '</div>';

    $$('.case-card', v).forEach((card) => {
      card.onclick = () => {
        const c = CASES.find((x) => x.id === card.dataset.case);
        if (!caseUnlocked(c)) { toast('That file is still sealed.', 'bad'); return; }
        go('case', c.id);
      };
    });
    $('#reread').onclick = () => go('prologue');
    if ($('#see-finale')) $('#see-finale').onclick = () => go('finale');
  }

  /* ----------------------------------------------------------------- case */

  function renderCase(v, caseId) {
    const c = CASES.find((x) => x.id === caseId);
    if (activeStageIx[caseId] === undefined) activeStageIx[caseId] = firstUnsolvedIx(c);

    v.className = '';
    v.innerHTML =
      '<div class="caseview">' +
      '<aside class="sidebar">' +
      '<div class="side-tabs">' +
      '<button data-tab="case">Case</button>' +
      '<button data-tab="schema">Schema</button>' +
      '<button data-tab="notes">Notes</button>' +
      '</div>' +
      '<div class="side-body" id="side-body"></div>' +
      '</aside>' +
      '<section class="workspace"><div class="ws-scroll"><div class="ws-inner" id="ws"></div></div></section>' +
      '</div>';

    $$('.side-tabs button', v).forEach((b) => {
      b.onclick = () => { sideTab = b.dataset.tab; paintTabs(v); renderSideBody(c); };
    });
    paintTabs(v);
    renderSideBody(c);
    renderWorkspace(c);
  }

  function paintTabs(v) {
    $$('.side-tabs button', v).forEach((b) => {
      b.className = b.dataset.tab === sideTab ? 'on' : '';
    });
  }

  /* --------------------------------------------------- sidebar: case file */

  function renderSideBody(c) {
    const box = $('#side-body');
    if (!box) return;
    if (sideTab === 'schema') return renderSchema(box);
    if (sideTab === 'notes') return renderNotes(box);

    const stages = c.stages.map((s, i) => {
      const done = !!state.solved[s.id];
      const locked = !stageUnlocked(c, i);
      const cur = i === activeStageIx[c.id];
      return '<li class="' + (done ? 'done ' : '') + (locked ? 'locked ' : '') +
        (cur ? 'current' : '') + '" data-ix="' + i + '">' +
        '<span class="st-dot">' + (done ? '✓' : (locked ? '·' : (i + 1))) + '</span>' +
        '<span class="st-txt"><b>' + esc(s.title) + '</b><span>' + esc(s.teaches) + '</span></span>' +
        '</li>';
    }).join('');

    const evidence = c.stages.filter((s) => state.solved[s.id]).map((s) =>
      '<div class="ev-item"><b>' + esc(s.title) + '.</b> ' + s.reveal + '</div>').join('');

    box.innerHTML =
      '<div class="sf">' +
      '<div class="sf-title">' + esc(c.title) + '</div>' +
      '<div class="sf-sub">Case ' + String(c.number).padStart(2, '0') + ' · ' + c.tier + '</div>' +
      '<div class="paper" style="margin-bottom:18px">' +
      '<h4>Briefing</h4>' + c.opening.map((p) => '<p>' + p + '</p>').join('') +
      '</div>' +
      '<ul class="stagelist">' + stages + '</ul>' +
      (evidence ? '<div class="evidence"><h5>Evidence secured</h5>' + evidence + '</div>' : '') +
      '<div style="margin-top:20px"><button class="btn ghost small" id="back-board">← All case files</button></div>' +
      '</div>';

    $$('.stagelist li', box).forEach((li) => {
      li.onclick = () => {
        const ix = +li.dataset.ix;
        if (!stageUnlocked(c, ix)) { toast('Solve the previous stage first.', 'bad'); return; }
        activeStageIx[c.id] = ix;
        renderSideBody(c); renderWorkspace(c);
      };
    });
    $('#back-board').onclick = () => go('board');
  }

  /* ----------------------------------------------------- schema */

  function renderSchema(box) {
    const tables = WORLD.TABLES.map((t) => {
      const cols = t.columns.map((col) => {
        const kind = col[2] || '';
        const key = kind === 'pk' ? '<span class="c-k">PK</span>' : '';
        const fk = kind.indexOf('fk:') === 0
          ? '<span class="c-f">→ ' + esc(kind.slice(3)) + '</span>' : '';
        return '<div class="col" data-col="' + esc(col[0]) + '">' +
          '<span class="c-n">' + esc(col[0]) + '</span>' +
          '<span class="c-t">' + esc(col[1]) + '</span>' + key + fk + '</div>';
      }).join('');
      return '<div class="tbl" data-t="' + esc(t.name) + '">' +
        '<div class="tbl-h"><span class="caret">▶</span>' +
        '<span class="nm">' + esc(t.name) + '</span>' +
        '<span class="peek" data-peek="' + esc(t.name) + '">peek</span></div>' +
        '<div class="tbl-b"><div class="tbl-blurb">' + esc(t.blurb) + '</div>' + cols + '</div>' +
        '</div>';
    }).join('');

    box.innerHTML =
      '<div class="schema">' +
      '<div class="schema-hint">' +
      '<div class="schema-topline">' +
      '<span>Click a table to see its columns. <b>peek</b> runs a sample query; ' +
      'clicking a column name drops it into the editor. Arrows show which column points at which table — ' +
      'those are your <code>JOIN</code> conditions.</span>' +
      '</div>' +
      '</div>' + tables + '</div>';

    $$('.tbl', box).forEach((tb) => {
      $('.tbl-h', tb).onclick = (e) => {
        if (e.target.dataset.peek) {
          const t = e.target.dataset.peek;
          setEditor('SELECT *\nFROM ' + t + '\nLIMIT 10;');
          runQuery();
          return;
        }
        tb.classList.toggle('open');
      };
      $$('.col', tb).forEach((cl) => {
        cl.onclick = () => insertAtCursor(cl.dataset.col);
      });
    });

    $$('.erd-col', box).forEach((cl) => {
      cl.onclick = () => insertAtCursor(cl.dataset.col);
    });
  }

  /* ------------------------------------------------------ sidebar: notes */

  function renderNotes(box) {
    const hist = (state.history || []).slice(0, 20).map((q, i) =>
      '<div class="hist-item" data-h="' + i + '" title="' + esc(q) + '">' +
      esc(q.replace(/\s+/g, ' ').slice(0, 90)) + '</div>').join('') ||
      '<div class="schema-hint">Queries you run will collect here.</div>';

    box.innerHTML =
      '<div class="notes">' +
      '<div class="lbl">Detective\'s notebook</div>' +
      '<textarea id="notepad" placeholder="Suspect ids, account numbers, anything you will need two cases from now…">' +
      esc(state.notes || '') + '</textarea>' +
      '<div class="hist"><div class="lbl">Recent queries</div>' + hist + '</div>' +
      '</div>';

    const pad = $('#notepad');
    let t = null;
    pad.oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => { state.notes = pad.value; save(); }, 350);
    };
    $$('.hist-item', box).forEach((h) => {
      h.onclick = () => { setEditor(state.history[+h.dataset.h]); toast('Query restored to the editor.'); };
    });
  }

  /* ------------------------------------------------------------ workspace */

  function renderWorkspace(c) {
    destroyEditor();
    const ws = $('#ws');
    if (!ws) return;
    const ix = activeStageIx[c.id];
    const s = c.stages[ix];
    const done = !!state.solved[s.id];
    const shown = state.hints[s.id] || 0;
    const allDone = caseSolved(c);

    const primer =
      '<div class="fold' + (done || ix > 0 ? '' : ' open') + '" id="primer">' +
      '<div class="fold-h"><span class="caret">▶</span>Field manual' +
      '<span class="tag">' + esc(c.primer.heading) + '</span></div>' +
      '<div class="fold-b primer"><h5>' + esc(c.primer.heading) + '</h5>' +
      c.primer.blocks.map((b) => {
        if (b.t === 'code') return '<pre>' + esc(b.v) + '</pre>';
        if (b.t === 'note') return '<div class="note">' + b.v + '</div>';
        return '<p>' + b.v + '</p>';
      }).join('') + '</div></div>';

    const erd =
      '<div class="fold" id="erd-fold">' +
      '<div class="fold-h"><span class="caret">▶</span>Entity map' +
      '<span class="tag">PK · FK · data types</span></div>' +
      '<div class="fold-b">' +
      '<div id="erd-panel-home"><div class="erd-panel" id="erd-panel-shell">' +
      '<div class="erd-copy">A cleaner relationship map of the whole city database. Click any join line to trace where it goes, use the controls to zoom or fit, and drag the canvas to inspect a cluster up close.</div>' +
      '<div class="erd-toolbar">' +
      '<div class="erd-legend">' +
      '<span><b>PK</b> primary key</span>' +
      '<span><b>FK</b> foreign key</span>' +
      '<span id="erd-status">Detailed view · all fields and datatypes</span>' +
      '</div>' +
      '<div class="erd-actions">' +
      '<button class="btn ghost small" id="erd-zoom-out">Zoom out</button>' +
      '<button class="btn ghost small" id="erd-zoom-in">Zoom in</button>' +
      '<button class="btn ghost small" id="erd-fit">Fit</button>' +
      '<button class="btn ghost small" id="erd-reset">Clear focus</button>' +
      '<button class="btn ghost small" id="erd-mode">Compact</button>' +
      '<button class="btn ghost small" id="erd-expand">Expand</button>' +
      '</div>' +
      '</div>' +
      '<div class="erd-frame" id="erd-stage"><div id="erd-diagram"></div></div>' +
      '</div></div>' +
      '</div>' +
      '</div>' +
      '</div>';

    const hintHtml = [];
    for (let i = 0; i < shown; i++) {
      hintHtml.push('<div class="hint"><b>Hint ' + (i + 1) + ' of 3</b>' + s.hints[i] + '</div>');
    }

    const stageCard =
      '<div class="stage-card">' +
      '<div class="stage-top"><span class="ix">Stage ' + (ix + 1) + ' / ' + c.stages.length + '</span>' +
      '<h3>' + esc(s.title) + '</h3>' +
      '<span class="teach">' + esc(s.teaches) + '</span></div>' +
      '<div class="stage-body">' +
      (done ? '<div class="solved-banner">Stage cleared<span class="spacer"></span>' +
        ((state.hints[s.id] || 0) ? (state.hints[s.id] + ' hint' + (state.hints[s.id] > 1 ? 's' : '') + ' used') : 'unaided') +
        '</div>' : '') +
      '<p class="prompt">' + s.prompt + '</p>' +

      '<div class="ed-wrap"><div class="ed-bar"><span class="lbl">SQL console</span>' +
      '<span class="spacer"></span>' +
      '<span class="kbd">Ctrl + Enter to run</span></div>' +
      '<textarea id="editor"></textarea></div>' +

      '<div class="run-row">' +
      '<button class="btn primary" id="run">Run query</button>' +
      '<button class="btn ghost small" id="reset-q">Reset</button>' +
      '<span class="spacer"></span><span class="stat" id="stat"></span></div>' +

      '<div id="results"></div>' +

      '<div class="answer" id="answerbox">' +
      '<div class="q"><span class="mark">▸</span>' + esc(s.ask) + '</div>' +
      '<div class="answer-row">' +
      '<input id="answer" autocomplete="off" spellcheck="false" placeholder="' +
      esc(s.placeholder || 'your answer') + '"' +
      (done ? ' disabled value="' + esc((state.answers || {})[s.id] || '') + '"' : '') + '>' +
      '<button class="btn primary" id="submit"' + (done ? ' disabled' : '') + '>' +
      (done ? 'Confirmed' : 'Submit') + '</button>' +
      '</div><div class="verdict" id="verdict">' +
      (done ? '<span class="yes">✓ Confirmed against the record.</span>' : '') + '</div></div>' +

      (done ? '' :
        '<div class="hints"><div class="hint-bar"><span class="lbl">Stuck?</span>' +
        (shown < 3
          ? '<button class="btn ghost small" id="hint">Take a hint (' + (3 - shown) + ' left)</button>'
          : '<span class="lbl" style="color:var(--text-faint)">All three hints revealed</span>') +
        '</div>' + hintHtml.join('') + '</div>') +

      '</div></div>';

    const revealHtml = done
      ? '<div class="reveal"><div class="paper"><h4>Case notes — ' + esc(s.title) + '</h4><p>' +
        s.reveal + '</p></div>' +
        (ix < c.stages.length - 1
          ? '<div style="margin-top:14px"><button class="btn primary" id="next-stage">Next stage →</button></div>'
          : '') +
        '</div>'
      : '';

    const completeHtml = (allDone && ix === c.stages.length - 1)
      ? '<div class="complete"><div class="bigstamp">Case Closed</div>' +
        '<div class="ep">' + c.epilogue.map((p) => '<p>' + p + '</p>').join('') + '</div>' +
        '<div class="acts">' +
        (c.number < CASES.length
          ? (caseUnlocked(CASES[c.number]) ?
            '<button class="btn primary" id="next-case">Open Case ' + (c.number + 1) + ' →</button>' : '')
          : '<button class="btn primary" id="go-finale">Final report →</button>') +
        '<button class="btn" id="to-board">All case files</button></div></div>'
      : '';

    ws.innerHTML = primer + erd + stageCard + revealHtml + completeHtml;

    /* ---- wire up ---- */
    $('#primer').querySelector('.fold-h').onclick = () => $('#primer').classList.toggle('open');
    $('#erd-fold').querySelector('.fold-h').onclick = () => {
      $('#erd-fold').classList.toggle('open');
      if ($('#erd-fold').classList.contains('open')) renderErd();
    };

    cm = CodeMirror.fromTextArea($('#editor'), {
      mode: 'text/x-sql',
      lineNumbers: true,
      lineWrapping: true,
      matchBrackets: true,
      indentUnit: 2,
      extraKeys: {
        'Ctrl-Enter': runQuery,
        'Cmd-Enter': runQuery,
        'Shift-Enter': runQuery,
        'Ctrl-/': handleToggleSqlComment,
        'Cmd-/': handleToggleSqlComment,
        Tab: handleTabKey,
      },
    });
    cm.on('inputRead', handleEditorInputRead);
    cm.on('cursorActivity', handleCursorActivity);
    cm.on('blur', handleEditorBlur);
    cm.on('keydown', (editor, e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        e.stopPropagation();
        handleToggleSqlComment(editor);
        return;
      }
      if (!completionState || completionState.editor !== editor) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveAutocompleteSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveAutocompleteSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        acceptAutocomplete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAutocomplete();
      }
    });
    cm.setValue(sessionStorage.getItem('q.' + s.id) || s.starter || '');
    cm.on('change', () => {
      try { sessionStorage.setItem('q.' + s.id, cm.getValue()); } catch (e) {}
    });
    setTimeout(() => cm.refresh(), 30);

    $('#run').onclick = runQuery;
    $('#reset-q').onclick = () => { setEditor(s.starter || ''); toast('Editor reset.'); };

    const submit = () => checkAnswer(c, s);
    $('#submit').onclick = submit;
    $('#answer').onkeydown = (e) => { if (e.key === 'Enter') submit(); };

    if ($('#hint')) {
      $('#hint').onclick = () => {
        state.hints[s.id] = (state.hints[s.id] || 0) + 1;
        save(); renderWorkspace(c);
      };
    }
    if ($('#next-stage')) {
      $('#next-stage').onclick = () => {
        activeStageIx[c.id] = Math.min(ix + 1, c.stages.length - 1);
        renderSideBody(c); renderWorkspace(c);
        $('.ws-scroll').scrollTop = 0;
      };
    }
    if ($('#next-case')) $('#next-case').onclick = () => go('case', CASES[c.number].id);
    if ($('#to-board')) $('#to-board').onclick = () => go('board');
    if ($('#go-finale')) $('#go-finale').onclick = () => go('finale');

    if (!done) setTimeout(() => { try { cm.focus(); } catch (e) {} }, 60);
  }

  /* --------------------------------------------------------- SQL console */

  function setEditor(text) {
    if (!cm) return;
    cm.setValue(text);
    cm.focus();
    cm.setCursor(cm.lineCount(), 0);
  }

  function insertAtCursor(text) {
    if (!cm) return;
    cm.replaceSelection(text);
    cm.focus();
  }

  function toggleSqlComment() {
    const editor = this && this.getDoc ? this : cm;
    if (!editor) return;

    const selections = editor.listSelections();
    editor.operation(() => {
      selections.forEach((sel) => {
        const from = sel.from();
        const to = sel.to();
        const startLine = Math.min(from.line, to.line);
        const endLine = Math.max(from.line, to.line);
        const lines = [];

        for (let i = startLine; i <= endLine; i++) {
          lines.push({ line: i, text: editor.getLine(i) || '' });
        }

        const allCommented = lines.every(({ text }) => text.trimStart().indexOf('--') === 0);

        lines.forEach(({ line, text }) => {
          const indent = text.match(/^\s*/)[0];
          const body = text.slice(indent.length);
          const replacement = allCommented
            ? indent + body.replace(/^--\s?/, '')
            : indent + '-- ' + body;
          editor.replaceRange(replacement, { line, ch: 0 }, { line, ch: text.length });
        });
      });
    });
  }

  function handleToggleSqlComment(editor) {
    toggleSqlComment.call(editor || cm);
  }

  function handleTabKey(editor) {
    if (completionState && completionState.editor === editor) {
      acceptAutocomplete();
      return;
    }
    editor.execCommand('defaultTab');
  }

  function handleEditorInputRead(editor, change) {
    if (!change || change.origin === 'setValue' || change.origin === 'complete') return;
    const typed = (change.text || []).join('');
    if (!typed) {
      closeAutocomplete();
      return;
    }
    if (!/[A-Za-z0-9_.]/.test(typed)) {
      closeAutocomplete();
      return;
    }
    updateAutocomplete(editor);
  }

  function handleCursorActivity(editor) {
    if (completionState && completionState.editor === editor) updateAutocomplete(editor, true);
  }

  function handleEditorBlur() {
    setTimeout(closeAutocomplete, 120);
  }

  function getAliasMap(sql) {
    const aliases = {};
    const re = /\b(?:FROM|JOIN)\s+([A-Za-z_][\w]*)\s+(?:AS\s+)?([A-Za-z_][\w]*)/gi;
    let match;
    while ((match = re.exec(sql))) {
      aliases[match[2].toLowerCase()] = match[1];
    }
    return aliases;
  }

  function getAutocompleteContext(editor) {
    const cursor = editor.getCursor();
    const token = editor.getTokenAt(cursor);
    const tokenType = token && token.type ? token.type : '';
    if (tokenType.indexOf('comment') !== -1 || tokenType.indexOf('string') !== -1) return null;

    const line = editor.getLine(cursor.line);
    const before = line.slice(0, cursor.ch);
    const qualified = before.match(/([A-Za-z_][\w]*)\.([A-Za-z_]*)$/);
    if (qualified) {
      return {
        from: { line: cursor.line, ch: before.length - qualified[2].length },
        to: cursor,
        prefix: qualified[2],
        qualifier: qualified[1],
      };
    }

    const plain = before.match(/([A-Za-z_][\w]*)$/);
    if (!plain) return null;
    return {
      from: { line: cursor.line, ch: before.length - plain[1].length },
      to: cursor,
      prefix: plain[1],
      qualifier: null,
    };
  }

  function collectAutocompleteItems(editor, ctx) {
    const prefixLower = ctx.prefix.toLowerCase();
    const aliasMap = getAliasMap(editor.getValue());
    const items = [];
    const seen = {};

    function pushItem(text, type, boost) {
      const key = text.toLowerCase() + '|' + type;
      if (seen[key]) return;
      if (prefixLower && text.toLowerCase().indexOf(prefixLower) !== 0) return;
      seen[key] = true;
      items.push({ text, type, score: boost || 0 });
    }

    if (ctx.qualifier) {
      const sourceName = aliasMap[ctx.qualifier.toLowerCase()] || ctx.qualifier;
      const table = SCHEMA_INFO.tables[sourceName];
      if (!table) return [];
      table.columns.forEach((column) => pushItem(column, 'column', 30));
      return items.sort(sortAutocompleteItems);
    }

    SCHEMA_INFO.tableNames.forEach((tableName) => pushItem(tableName, 'table', 20));
    Object.keys(aliasMap).forEach((alias) => pushItem(alias, 'alias', 18));
    WORLD.TABLES.forEach((table) => {
      table.columns.forEach((col) => pushItem(col[0], 'column', 12));
    });
    SQL_KEYWORDS.forEach((keyword) => pushItem(keyword, 'keyword', 6));

    return items.sort(sortAutocompleteItems);
  }

  function sortAutocompleteItems(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (a.text.length !== b.text.length) return a.text.length - b.text.length;
    return a.text.localeCompare(b.text);
  }

  function updateAutocomplete(editor, keepSelection) {
    const ctx = getAutocompleteContext(editor);
    if (!ctx || (!ctx.prefix && !ctx.qualifier)) {
      closeAutocomplete();
      return;
    }

    const items = collectAutocompleteItems(editor, ctx).slice(0, 9);
    if (!items.length) {
      closeAutocomplete();
      return;
    }

    const existingIndex = keepSelection && completionState && completionState.editor === editor
      ? completionState.selectedIndex
      : 0;

    if (!completionState || completionState.editor !== editor) {
      openAutocomplete(editor, ctx, items, existingIndex);
      return;
    }

    completionState.context = ctx;
    completionState.items = items;
    completionState.selectedIndex = Math.min(existingIndex, items.length - 1);
    positionAutocomplete(editor);
    renderAutocomplete();
  }

  function openAutocomplete(editor, ctx, items, selectedIndex) {
    closeAutocomplete();
    const menu = document.createElement('div');
    menu.className = 'sql-complete';
    menu.onmousedown = (e) => e.preventDefault();
    document.body.appendChild(menu);
    completionState = {
      editor: editor,
      context: ctx,
      items: items,
      selectedIndex: Math.max(0, selectedIndex || 0),
      menu: menu,
    };
    positionAutocomplete(editor);
    renderAutocomplete();
  }

  function positionAutocomplete(editor) {
    if (!completionState || completionState.editor !== editor) return;
    const coords = editor.cursorCoords(completionState.context.to, 'page');
    completionState.menu.style.left = coords.left + 'px';
    completionState.menu.style.top = (coords.bottom + 6) + 'px';
  }

  function renderAutocomplete() {
    if (!completionState) return;
    completionState.menu.innerHTML = completionState.items.map((item, index) =>
      '<button class="sql-complete__item' + (index === completionState.selectedIndex ? ' is-selected' : '') +
      '" data-ix="' + index + '">' +
      '<span class="sql-complete__text">' + esc(item.text) + '</span>' +
      '<span class="sql-complete__type">' + esc(item.type) + '</span>' +
      '</button>'
    ).join('');
    $$('.sql-complete__item', completionState.menu).forEach((button) => {
      button.onclick = () => {
        completionState.selectedIndex = +button.dataset.ix;
        acceptAutocomplete();
      };
    });
  }

  function moveAutocompleteSelection(step) {
    if (!completionState) return;
    const total = completionState.items.length;
    completionState.selectedIndex = (completionState.selectedIndex + step + total) % total;
    renderAutocomplete();
  }

  function acceptAutocomplete() {
    if (!completionState) return;
    const item = completionState.items[completionState.selectedIndex];
    const editor = completionState.editor;
    editor.replaceRange(item.text, completionState.context.from, completionState.context.to, 'complete');
    closeAutocomplete();
  }

  function closeAutocomplete() {
    if (!completionState) return;
    if (completionState.menu && completionState.menu.parentNode) {
      completionState.menu.parentNode.removeChild(completionState.menu);
    }
    completionState = null;
  }

  function runQuery() {
    if (!cm || !DB) return;
    const selectedSql = cm.somethingSelected() ? cm.getSelection() : '';
    const sql = (selectedSql || cm.getValue()).trim();
    const out = $('#results');
    const stat = $('#stat');
    if (!sql) { out.innerHTML = '<div class="res-empty">Nothing to run.</div>'; return; }

    let res, ms;
    const t0 = performance.now();
    try {
      res = DB.exec(sql);
      ms = performance.now() - t0;
    } catch (e) {
      out.innerHTML = '<div class="results"><div class="res-head">Error</div>' +
        '<div class="res-error">' + esc(e.message) + '</div></div>';
      if (stat) stat.textContent = '';
      return;
    }

    // Remember it (dedupe against the immediately previous entry).
    state.history = state.history || [];
    if (state.history[0] !== sql) {
      state.history.unshift(sql);
      state.history = state.history.slice(0, 25);
      save();
    }

    if (!res.length) {
      out.innerHTML = '<div class="results"><div class="res-head">Result</div>' +
        '<div class="res-empty">Statement executed. No rows returned.</div></div>';
      if (stat) stat.textContent = ms.toFixed(0) + ' ms' + (selectedSql.trim() ? ' · selection' : '');
      return;
    }

    const set = res[res.length - 1];
    const shown = set.values.slice(0, MAX_ROWS);
    const head = set.columns.map((c) => '<th>' + esc(c) + '</th>').join('');
    const body = shown.map((row) =>
      '<tr>' + row.map((cell) => {
        if (cell === null) return '<td class="null">NULL</td>';
        if (typeof cell === 'number') return '<td class="num">' + esc(cell) + '</td>';
        return '<td>' + esc(cell) + '</td>';
      }).join('') + '</tr>').join('');

    const truncated = set.values.length > MAX_ROWS
      ? ' · showing first ' + MAX_ROWS : '';

    out.innerHTML =
      '<div class="results"><div class="res-head">' +
      set.values.length + ' row' + (set.values.length === 1 ? '' : 's') +
      ' · ' + set.columns.length + ' column' + (set.columns.length === 1 ? '' : 's') +
      truncated +
      (res.length > 1 ? ' · ' + res.length + ' statements, showing the last' : '') +
      '</div><div class="res-scroll"><table class="grid"><thead><tr>' + head +
      '</tr></thead><tbody>' + body + '</tbody></table></div></div>';

    lastRun = { ms, rows: set.values.length };
    if (stat) stat.textContent = ms.toFixed(0) + ' ms · ' + set.values.length + ' rows' +
      (selectedSql.trim() ? ' · selection' : '');
  }

  /* -------------------------------------------------------- answer check */

  function checkAnswer(c, s) {
    const input = $('#answer');
    const box = $('#answerbox');
    const verdict = $('#verdict');
    const val = (input.value || '').trim();
    if (!val) { input.focus(); return; }

    if (ANSWER.matches(val, s.answers)) {
      state.solved[s.id] = true;
      state.answers = state.answers || {};
      state.answers[s.id] = val;
      save();
      const last = c.stages.every((x) => state.solved[x.id]);
      toast(last ? 'Case closed.' : 'Correct — stage cleared.', 'good');
      renderTop();
      renderSideBody(c);
      renderWorkspace(c);
      const r = document.querySelector('.reveal') || document.querySelector('.complete');
      if (r) r.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    state.wrong[s.id] = (state.wrong[s.id] || 0) + 1;
    save();
    box.classList.add('wrong');
    setTimeout(() => box.classList.remove('wrong'), 400);
    const n = state.wrong[s.id];
    verdict.className = 'verdict no';
    verdict.textContent = n >= 4
      ? 'Still not it. Take a hint — nobody is counting against you.'
      : (n >= 2 ? 'That is not the answer. Re-read the prompt and check your filters.'
                : 'That is not the answer.');
    input.select();
  }

  /* --------------------------------------------------------------- finale */

  function renderFinale(v) {
    v.className = 'scroller';
    const hints = hintsUsed();
    const wrong = Object.keys(state.wrong).reduce((n, k) => n + state.wrong[k], 0);
    const grade = hints === 0 ? 'Immaculate' : hints <= 5 ? 'Exemplary'
      : hints <= 12 ? 'Commendable' : hints <= 20 ? 'Sound' : 'Dogged';

    v.innerHTML =
      '<div class="finale">' +
      '<h2>Case Closed</h2>' +
      '<div class="sub">Nullport Bureau · Final Report</div>' +
      '<div class="scorecard">' +
      '<div class="sc"><b>' + CASES.length + '</b><span>Cases closed</span></div>' +
      '<div class="sc"><b>' + totalStages() + '</b><span>Stages cleared</span></div>' +
      '<div class="sc"><b>' + hints + '</b><span>Hints taken</span></div>' +
      '<div class="sc"><b>' + wrong + '</b><span>Wrong turns</span></div>' +
      '</div>' +
      '<p>Vivienne Aldridge chaired four companies that existed only to move other people\'s ' +
      'money, and for eleven months nobody in this building could see it — not because the ' +
      'evidence was hidden, but because it was spread across eighteen tables and a hundred and ' +
      'twenty thousand rows, and nobody had asked the right questions.</p>' +
      '<p>You asked them. You went from <code>SELECT … WHERE</code> to a recursive walk down a ' +
      'laundering chain and a window function that ranked five nights of telephone calls. That is ' +
      'not a small distance.</p>' +
      '<p><strong>Bureau assessment: ' + grade + '.</strong></p>' +
      '<div class="actions" style="justify-content:center;display:flex;gap:11px;margin-top:30px;flex-wrap:wrap">' +
      '<button class="btn" id="fin-board">Back to the case board</button>' +
      '<button class="btn ghost" id="fin-free">Free-query the archive</button>' +
      '</div></div>';

    $('#fin-board').onclick = () => go('board');
    $('#fin-free').onclick = () => go('case', CASES[CASES.length - 1].id);
  }

  /* ------------------------------------------------------------------ boot */

  async function boot() {
    state = load();
    const bar = $('#boot-bar span');
    const log = $('#boot-log');

    try {
      const r = await globalThis.NullportDB.init((pct, msg) => {
        bar.style.right = (100 - pct) + '%';
        log.textContent = msg;
      });
      DB = r.db;
    } catch (e) {
      log.textContent = '';
      $('#boot').innerHTML =
        '<div class="boot-mark">Nullport</div>' +
        '<div class="boot-err"><strong>The archive would not open.</strong><br><br>' +
        esc(e && e.message ? e.message : String(e)) +
        '<br><br>If you opened this file directly, try a different browser, or serve the folder ' +
        'over HTTP:<br><code>python -m http.server 8000</code></div>';
      return;
    }

    $('#boot').classList.add('done');
    setTimeout(() => { const b = $('#boot'); if (b) b.remove(); }, 600);
    $('#app').classList.add('live');

    go(state.prologueSeen ? 'board' : 'prologue');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
