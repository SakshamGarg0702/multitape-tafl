'use strict';

/* ─── Constants ─────────────────────────────────────────────── */
const BLANK = '_';
const FINAL_STATES = new Set(['qf', 'qaccept', 'qreject', 'halt']);
const VALID_MOVES = new Set(['R', 'L', 'S']);
const CELL_W = 52;   // px width of each cell + gap
const MIN_VISIBLE = 14;

/* ─── Presets ───────────────────────────────────────────────── */
const PRESETS = {
  copy: {
    input: 'abc',
    rules: [
      { state: 'q0', r1: 'a', r2: '_', ns: 'q0', w1: 'a', w2: 'a', m1: 'R', m2: 'R' },
      { state: 'q0', r1: 'b', r2: '_', ns: 'q0', w1: 'b', w2: 'b', m1: 'R', m2: 'R' },
      { state: 'q0', r1: 'c', r2: '_', ns: 'q0', w1: 'c', w2: 'c', m1: 'R', m2: 'R' },
      { state: 'q0', r1: '0', r2: '_', ns: 'q0', w1: '0', w2: '0', m1: 'R', m2: 'R' },
      { state: 'q0', r1: '1', r2: '_', ns: 'q0', w1: '1', w2: '1', m1: 'R', m2: 'R' },
      { state: 'q0', r1: '_', r2: '_', ns: 'qf',  w1: '_', w2: '_', m1: 'S', m2: 'S' },
    ]
  },
  reverse: {
    input: '1010',
    rules: [
      { state: 'q0', r1: '0', r2: '_', ns: 'q0', w1: '0', w2: '1', m1: 'R', m2: 'R' },
      { state: 'q0', r1: '1', r2: '_', ns: 'q0', w1: '1', w2: '0', m1: 'R', m2: 'R' },
      { state: 'q0', r1: '_', r2: '_', ns: 'qf',  w1: '_', w2: '_', m1: 'S', m2: 'S' },
    ]
  },
  palindrome: {
    input: 'aba',
    rules: [
      { state: 'q0', r1: 'a', r2: '_', ns: 'q0', w1: 'a', w2: 'a', m1: 'R', m2: 'R' },
      { state: 'q0', r1: 'b', r2: '_', ns: 'q0', w1: 'b', w2: 'b', m1: 'R', m2: 'R' },
      { state: 'q0', r1: '_', r2: '_', ns: 'qf',  w1: '_', w2: '_', m1: 'S', m2: 'S' },
    ]
  }
};

/* ─── Machine State ─────────────────────────────────────────── */
let tape1 = [], tape2 = [];
let head1 = 0, head2 = 0;
let currentState = 'q0';
let stepCount = 0;
let running = false;
let timer = null;
let lastRule = null;
let justWritten1 = -1, justWritten2 = -1;

/* ─── Rule Storage ──────────────────────────────────────────── */
let userRules = [];  // array of rule objects
let transitionMap = {};  // keyed by "state,r1,r2"

function ruleKey(state, r1, r2) {
  return `${state},${r1},${r2}`;
}

function rebuildTransitionMap() {
  transitionMap = {};
  userRules.forEach(r => {
    const k = ruleKey(r.state, r.r1, r.r2);
    transitionMap[k] = r;
  });
}

/* ─── Rule Validation ───────────────────────────────────────── */
function validateRule(state, r1, r2, ns, w1, w2, m1, m2) {
  const errors = [];

  if (!state || state.trim() === '')
    errors.push('State cannot be empty.');
  else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(state.trim()))
    errors.push('State must start with a letter and contain only letters, digits, or underscores.');

  if (!ns || ns.trim() === '')
    errors.push('New state cannot be empty.');
  else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(ns.trim()))
    errors.push('New state must start with a letter and contain only letters, digits, or underscores.');

  const symPattern = /^[a-zA-Z0-9_]$/;

  if (r1 === '' || r1 === null || r1 === undefined) errors.push('Read symbol 1 cannot be empty.');
  else if (!symPattern.test(r1)) errors.push(`Read symbol 1 "${r1}" is invalid. Use a single alphanumeric character or _.`);

  if (r2 === '' || r2 === null || r2 === undefined) errors.push('Read symbol 2 cannot be empty.');
  else if (!symPattern.test(r2)) errors.push(`Read symbol 2 "${r2}" is invalid. Use a single alphanumeric character or _.`);

  if (w1 === '' || w1 === null || w1 === undefined) errors.push('Write symbol 1 cannot be empty.');
  else if (!symPattern.test(w1)) errors.push(`Write symbol 1 "${w1}" is invalid.`);

  if (w2 === '' || w2 === null || w2 === undefined) errors.push('Write symbol 2 cannot be empty.');
  else if (!symPattern.test(w2)) errors.push(`Write symbol 2 "${w2}" is invalid.`);

  if (!VALID_MOVES.has(m1)) errors.push(`Move 1 "${m1}" is invalid. Use R, L, or S.`);
  if (!VALID_MOVES.has(m2)) errors.push(`Move 2 "${m2}" is invalid. Use R, L, or S.`);

  return errors;
}

function addRule(rule) {
  const key = ruleKey(rule.state, rule.r1, rule.r2);
  const existingIdx = userRules.findIndex(r => ruleKey(r.state, r.r1, r.r2) === key);
  if (existingIdx >= 0) {
    userRules[existingIdx] = rule;
    return 'updated';
  }
  userRules.push(rule);
  return 'added';
}

function deleteRule(idx) {
  userRules.splice(idx, 1);
  rebuildTransitionMap();
  renderRulesList();
}

function clearAllRules() {
  userRules = [];
  rebuildTransitionMap();
  renderRulesList();
}

/* ─── Tape Helpers ──────────────────────────────────────────── */
function readCell(tape, h) {
  return (h >= 0 && h < tape.length) ? tape[h] : BLANK;
}

function writeCell(tape, h, sym) {
  while (tape.length <= h) tape.push(BLANK);
  tape[h] = sym;
}

function moveHead(h, dir) {
  if (dir === 'R') return h + 1;
  if (dir === 'L') return Math.max(0, h - 1);
  return h;
}

/* ─── Machine Control ───────────────────────────────────────── */
function initMachine() {
  const raw = document.getElementById('input-str').value.trim() || BLANK;
  tape1 = raw.split('');
  tape2 = Array(Math.max(raw.length + 4, 8)).fill(BLANK);
  head1 = 0; head2 = 0;
  currentState = 'q0';
  stepCount = 0;
  justWritten1 = -1;
  justWritten2 = -1;
  lastRule = null;

  stopRun();
  setMsg('Ready — press Step or Run to begin.', 'info');
  renderAll();
  showTransition(null);
}

function step() {
  if (FINAL_STATES.has(currentState)) {
    setMsg(`Machine halted in state "${currentState}".`, 'ok');
    return false;
  }

  if (userRules.length === 0) {
    setMsg('No transition rules defined. Add rules in the panel on the right.', 'warn');
    return false;
  }

  const s1 = readCell(tape1, head1);
  const s2 = readCell(tape2, head2);
  const key = ruleKey(currentState, s1, s2);
  const rule = transitionMap[key];

  if (!rule) {
    setMsg(`No transition for (${currentState}, '${s1}', '${s2}') — machine stuck.`, 'err');
    return false;
  }

  justWritten1 = head1;
  justWritten2 = head2;

  writeCell(tape1, head1, rule.w1);
  writeCell(tape2, head2, rule.w2);
  head1 = moveHead(head1, rule.m1);
  head2 = moveHead(head2, rule.m2);
  currentState = rule.ns;
  stepCount++;
  lastRule = rule;

  showTransition(rule, s1, s2);
  renderAll();

  if (FINAL_STATES.has(currentState)) {
    setMsg(`Done! Machine accepted in state "${currentState}".`, 'ok');
    return false;
  }

  setMsg(
    `Step ${stepCount}: read ('${s1}','${s2}') → wrote ('${rule.w1}','${rule.w2}'), ` +
    `moved (${rule.m1},${rule.m2}), new state: ${rule.ns}`,
    'info'
  );
  return true;
}

function getDelay() {
  const spd = parseInt(document.getElementById('speed').value);
  return Math.max(55, 620 - (spd - 1) * 63);
}

function startRun() {
  if (running) return;
  running = true;
  document.getElementById('btn-run').textContent = 'Pause';
  document.getElementById('btn-run').className = 'btn btn-primary';
  document.getElementById('btn-step').disabled = true;

  const tick = () => {
    if (!step()) {
      stopRun();
    } else {
      timer = setTimeout(tick, getDelay());
    }
  };
  timer = setTimeout(tick, getDelay());
}

function stopRun() {
  clearTimeout(timer);
  timer = null;
  running = false;
  document.getElementById('btn-run').textContent = 'Run';
  document.getElementById('btn-run').className = 'btn btn-success';
  document.getElementById('btn-step').disabled = false;
}

function toggleRun() {
  if (running) stopRun();
  else startRun();
}

/* ─── Rendering ─────────────────────────────────────────────── */
function renderTape(trackEl, vpEl, tape, head, jw) {
  const vis = Math.max(tape.length, head + 5, MIN_VISIBLE);
  let html = '';

  for (let i = 0; i < vis; i++) {
    const sym = i < tape.length ? tape[i] : BLANK;
    let cls = 'cell';
    if (sym === BLANK) cls += ' blank';
    if (i === jw && i !== head) cls += ' written';
    if (i === head) cls += ' active';
    const content = sym === BLANK ? '_' : sym;
    html += `<div class="${cls}">${content}${i === head ? '<div class="head-dot"></div>' : ''}</div>`;
  }

  trackEl.innerHTML = html;

  // Smooth scroll: center active head cell
  const vpW = vpEl.offsetWidth || 640;
  const padLeft = 18;
  const center = Math.floor(vpW / 2) - Math.floor(CELL_W / 2);
  const shift = center - padLeft - head * CELL_W;
  trackEl.style.transform = `translateX(${shift}px)`;
}

function renderAll() {
  renderTape(
    document.getElementById('tt1'),
    document.getElementById('vp1'),
    tape1, head1, justWritten1
  );
  renderTape(
    document.getElementById('tt2'),
    document.getElementById('vp2'),
    tape2, head2, justWritten2
  );

  document.getElementById('disp-state').textContent = currentState;
  document.getElementById('disp-step').textContent  = stepCount;
  document.getElementById('disp-h1').textContent    = head1;
  document.getElementById('disp-h2').textContent    = head2;

  highlightActiveRule(lastRule ? ruleKey(lastRule.state, lastRule.r1, lastRule.r2) : null);
}

function showTransition(rule, s1, s2) {
  const el = document.getElementById('tr-display');
  if (!rule) {
    el.innerHTML = '<span class="tr-none">No transition applied yet</span>';
    return;
  }
  el.innerHTML =
    `<span class="tr-badge in">(${rule.state}, '${s1}', '${s2}')</span>` +
    `<span class="tr-arrow">→</span>` +
    `<span class="tr-badge out">(${rule.ns}, '${rule.w1}', '${rule.w2}', ${rule.m1}, ${rule.m2})</span>`;
}

function setMsg(text, type) {
  const bar = document.getElementById('msg-bar');
  bar.className = `msg-bar ${type}`;
  document.getElementById('msg-text').textContent = text;
}

/* ─── Rules UI ──────────────────────────────────────────────── */
function renderRulesList() {
  const list = document.getElementById('rules-list');

  if (userRules.length === 0) {
    list.innerHTML = '<div class="rules-empty">No rules defined. Add rules below.</div>';
    return;
  }

  list.innerHTML = userRules.map((r, i) => {
    const k = ruleKey(r.state, r.r1, r.r2);
    const isActive = lastRule && ruleKey(lastRule.state, lastRule.r1, lastRule.r2) === k;
    return `<div class="rule-item${isActive ? ' active-rule' : ''}" id="rule-${k.replace(/,/g, '_')}">
      <span class="rule-text">(${r.state},'${r.r1}','${r.r2}') → (${r.ns},'${r.w1}','${r.w2}',${r.m1},${r.m2})</span>
      <button class="rule-delete" onclick="deleteRule(${i})" title="Delete rule">&#x2715;</button>
    </div>`;
  }).join('');
}

function highlightActiveRule(key) {
  document.querySelectorAll('.rule-item').forEach(el => el.classList.remove('active-rule'));
  if (key) {
    const el = document.getElementById('rule-' + key.replace(/,/g, '_'));
    if (el) {
      el.classList.add('active-rule');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

function showFeedback(msg, type) {
  const fb = document.getElementById('rule-feedback');
  fb.textContent = msg;
  fb.className = 'rule-feedback ' + type;
  setTimeout(() => {
    if (fb.textContent === msg) {
      fb.textContent = '';
      fb.className = 'rule-feedback';
    }
  }, 3500);
}

function handleAddRule() {
  const state  = document.getElementById('rf-state').value.trim();
  const r1     = document.getElementById('rf-r1').value.trim();
  const r2     = document.getElementById('rf-r2').value.trim();
  const ns     = document.getElementById('rf-ns').value.trim();
  const w1     = document.getElementById('rf-w1').value.trim();
  const w2     = document.getElementById('rf-w2').value.trim();
  const m1     = document.getElementById('rf-m1').value;
  const m2     = document.getElementById('rf-m2').value;

  const errors = validateRule(state, r1, r2, ns, w1, w2, m1, m2);
  if (errors.length > 0) {
    showFeedback(errors[0], 'err');
    return;
  }

  const result = addRule({ state, r1, r2, ns, w1, w2, m1, m2 });
  rebuildTransitionMap();
  renderRulesList();

  const label = `(${state},'${r1}','${r2}') → (${ns},'${w1}','${w2}',${m1},${m2})`;
  showFeedback(
    result === 'updated' ? `Rule updated: ${label}` : `Rule added: ${label}`,
    'ok'
  );

  // Clear inputs except state/ns for fast batch entry
  document.getElementById('rf-r1').value = '';
  document.getElementById('rf-r2').value = '_';
  document.getElementById('rf-w1').value = '';
  document.getElementById('rf-w2').value = '';
  document.getElementById('rf-r1').focus();
}

function loadPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  userRules = preset.rules.map(r => Object.assign({}, r));
  rebuildTransitionMap();
  renderRulesList();
  document.getElementById('input-str').value = preset.input;
  initMachine();
  setMsg(`Preset "${name}" loaded with ${userRules.length} rules.`, 'info');
}

/* ─── Event Wiring ──────────────────────────────────────────── */
document.getElementById('btn-reset').onclick = initMachine;
document.getElementById('btn-step').onclick  = () => { if (!running) step(); };
document.getElementById('btn-run').onclick   = toggleRun;

document.getElementById('speed').oninput = function () {
  document.getElementById('speed-val').textContent = this.value;
};

document.getElementById('btn-add-rule').onclick = handleAddRule;

document.getElementById('btn-clear-rules').onclick = () => {
  if (userRules.length === 0) return;
  if (confirm('Clear all rules?')) {
    clearAllRules();
    showFeedback('All rules cleared.', 'ok');
  }
};

document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.addEventListener('click', () => loadPreset(btn.dataset.preset));
});

// Allow Enter key in rule fields to submit
['rf-state','rf-r1','rf-r2','rf-ns','rf-w1','rf-w2'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddRule();
  });
});

// Pre-fill r2 default to blank
document.getElementById('rf-r2').value = '_';
document.getElementById('rf-w2').value = '_';

/* ─── Bootstrap ─────────────────────────────────────────────── */
loadPreset('copy');
