/*
 * M2_LOG
 * Copyright (c) 2026 OA Hsiao
 * SPDX-License-Identifier: MIT
 *
 * This source code is licensed under the MIT License found in the
 * LICENSE file in the root directory of this source tree.
 */
// M2 LOG - renderer logic (talks to the main process via window.m2log)
const $ = (sel) => document.querySelector(sel);

const state = {
  lastExportPath: null,
};

/* ---------- Settings ---------- */
const ABBREV_KEY = 'm2log_abbrev_len';
const ABBREV_DEFAULT = 30;
const ABBREV_MIN = 1;
const ABBREV_MAX = 40;
function clampLen(n) {
  n = parseInt(n, 10);
  if (Number.isNaN(n)) return ABBREV_DEFAULT;
  return Math.min(ABBREV_MAX, Math.max(ABBREV_MIN, n));
}
let abbrevLen = clampLen(localStorage.getItem(ABBREV_KEY));

/* ---------- LOG type (file name) length ---------- */
const TYPELEN_KEY = 'm2log_type_len';
const TYPELEN_DEFAULT = 60;
const TYPELEN_MIN = 1;
const TYPELEN_MAX = 100;
function clampTypeLen(n) {
  n = parseInt(n, 10);
  if (Number.isNaN(n)) return TYPELEN_DEFAULT;
  return Math.min(TYPELEN_MAX, Math.max(TYPELEN_MIN, n));
}
let typeLen = clampTypeLen(localStorage.getItem(TYPELEN_KEY));

/* ---------- Dynamic LOG entries ---------- */
const LOGS_KEY = 'm2log_logs';
const LOG_COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#22d3ee', '#facc15'];
let logs = [];
let activeLogId = null;

function uid() {
  return 'l' + Math.random().toString(36).slice(2, 9);
}

const formFields = [
  'experimentName',
  'date',
  'tester',
  'testCase',
  'notes',
  'outputBase',
];

const CUSTOM_KEY = 'm2log_custom';

/* ---------- Experiments (each tab = one full experiment) ---------- */
const FORM_KEY = 'm2log_form';
const EXP_KEY = 'm2log_experiments';
const EXP_ACTIVE_KEY = 'm2log_active_exp';
let experiments = [];
let activeExpId = null;

/* ---------- i18n ---------- */
const LANG_KEY = 'm2log_lang';
let I18N = {};
let currentLang = localStorage.getItem(LANG_KEY) || 'zh';

function t(key, fallback) {
  if (I18N && I18N[key] != null) return I18N[key];
  return fallback != null ? fallback : key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'), el.textContent);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });
  // Dynamic widgets
  if (Array.isArray(experiments) && experiments.length) renderExpTabs();
  if (Array.isArray(logs) && logs.length) renderLogs();
  updateCounter();
  document.querySelectorAll('#customFields .custom-row').forEach((row) => {
    row.querySelector('.cf-label').setAttribute('placeholder', t('custom.label.ph'));
    row.querySelector('.cf-value').setAttribute('placeholder', t('custom.value.ph'));
    row.querySelector('.btn-grab').setAttribute('title', t('custom.grab.title'));
    row.querySelector('.btn-remove').setAttribute('title', t('custom.remove.title'));
  });
  // LOG analysis view: re-render dynamic widgets so their generated labels follow
  // the language switch (level/mark chips, highlight-type select, find counter).
  if (anaNav && anaNav.markers && anaNav.markers.length) anaRenderLevels(anaNav.markers);
  if (typeof anaPopulateHl === 'function') anaPopulateHl();
  if (typeof anaFindUpdateCount === 'function') anaFindUpdateCount();
}

async function loadLang(lang) {
  try {
    const data = await window.m2log.loadI18n(lang);
    if (!data || typeof data !== 'object') throw new Error('i18n load failed');
    I18N = data;
    currentLang = lang;
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    const label = document.getElementById('langLabel');
    if (label) label.textContent = lang === 'zh' ? 'EN' : '中';
    applyI18n();
  } catch (e) {
    /* keep existing text on failure */
  }
}

/* ---------- Top-level feature tabs ---------- */
const featureTabs = document.querySelectorAll('.feature-tab');
featureTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    featureTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    document.querySelectorAll('.feature-view').forEach((v) => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    if (view === 'analysis') {
      anaEnsureInit();
      window.dispatchEvent(new Event('resize'));
    }
  });
});

/* ---------- Splitter (drag to resize left/right) ---------- */
const splitter = document.getElementById('splitter');
const layout = document.querySelector('.layout');
const LEFT_KEY = 'm2log_left_width';
const MIN_LEFT = 260;
const MIN_RIGHT = 360;

function applyLeftWidth(px) {
  // Keep at least MIN_RIGHT on the right and MIN_LEFT on the left.
  const max = Math.max(MIN_LEFT, layout.clientWidth - MIN_RIGHT - 8);
  const clamped = Math.min(Math.max(px, MIN_LEFT), max);
  layout.style.setProperty('--left-width', clamped + 'px');
  return clamped;
}

if (splitter && layout) {
  const saved = parseInt(localStorage.getItem(LEFT_KEY), 10);
  if (!Number.isNaN(saved)) applyLeftWidth(saved);

  let dragging = false;
  const onMove = (e) => {
    if (!dragging) return;
    const rect = layout.getBoundingClientRect();
    applyLeftWidth(e.clientX - rect.left);
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('dragging');
    document.body.classList.remove('col-resizing');
    const w = parseInt(getComputedStyle(layout).getPropertyValue('--left-width'), 10);
    if (!Number.isNaN(w)) localStorage.setItem(LEFT_KEY, String(w));
  };

  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    splitter.classList.add('dragging');
    document.body.classList.add('col-resizing');
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  // Re-clamp width when the window resizes.
  window.addEventListener('resize', () => {
    const cur = parseInt(getComputedStyle(layout).getPropertyValue('--left-width'), 10);
    if (!Number.isNaN(cur)) applyLeftWidth(cur);
  });
}

/* ---------- Analysis splitter (drag to resize file tree / viewer) ---------- */
(function () {
  const anaSplitter = document.getElementById('anaSplitter');
  const anaBody = document.querySelector('.analysis-body');
  if (!anaSplitter || !anaBody) return;
  const ANA_LEFT_KEY = 'm2log_ana_left_width';
  const ANA_MIN_LEFT = 200;
  const ANA_MIN_RIGHT = 320;

  function applyAnaLeftWidth(px) {
    const bw = anaBody.clientWidth;
    let clamped;
    if (bw <= 0) {
      // View not visible yet: only enforce the minimum; re-clamp once shown.
      clamped = Math.max(px, ANA_MIN_LEFT);
    } else {
      const max = Math.max(ANA_MIN_LEFT, bw - ANA_MIN_RIGHT - 8);
      clamped = Math.min(Math.max(px, ANA_MIN_LEFT), max);
    }
    anaBody.style.setProperty('--ana-left-width', clamped + 'px');
    return clamped;
  }

  const saved = parseInt(localStorage.getItem(ANA_LEFT_KEY), 10);
  if (!Number.isNaN(saved)) applyAnaLeftWidth(saved);

  let dragging = false;
  anaSplitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    anaSplitter.classList.add('dragging');
    document.body.classList.add('col-resizing');
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = anaBody.getBoundingClientRect();
    applyAnaLeftWidth(e.clientX - rect.left);
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    anaSplitter.classList.remove('dragging');
    document.body.classList.remove('col-resizing');
    const w = parseInt(getComputedStyle(anaBody).getPropertyValue('--ana-left-width'), 10);
    if (!Number.isNaN(w)) localStorage.setItem(ANA_LEFT_KEY, String(w));
  });
  window.addEventListener('resize', () => {
    const cur = parseInt(getComputedStyle(anaBody).getPropertyValue('--ana-left-width'), 10);
    if (!Number.isNaN(cur)) applyAnaLeftWidth(cur);
  });
})();

/* ---------- Log entries (dynamic tabs / panes) ---------- */
function defaultLogs() {
  return [
    { id: uid(), type: 'UEFI', content: '' },
    { id: uid(), type: 'SAM', content: '' },
  ];
}

function saveLogs() {
  persistExperiments();
}

function setActive(id) {
  activeLogId = id;
  document.querySelectorAll('#logTabs .tab[data-id]').forEach((tab) => tab.classList.toggle('active', tab.dataset.id === id));
  document.querySelectorAll('#logBody .log-pane[data-id]').forEach((p) => p.classList.toggle('active', p.dataset.id === id));
  const pane = document.querySelector(`#logBody .log-pane[data-id="${id}"]`);
  if (pane) {
    const ta = pane.querySelector('.log-input');
    if (ta) ta.focus();
  }
  updateCounter();
}

function addLog() {
  const log = { id: uid(), type: `LOG${logs.length + 1}`, content: '' };
  logs.push(log);
  activeLogId = log.id;
  saveLogs();
  renderLogs();
  const pane = document.querySelector(`#logBody .log-pane[data-id="${log.id}"]`);
  if (pane) pane.querySelector('.log-type').focus();
}

function removeLog(id) {
  if (logs.length <= 1) {
    toast(t('toast.minLog', 'Keep at least one LOG'), 'error');
    return;
  }
  const idx = logs.findIndex((l) => l.id === id);
  logs = logs.filter((l) => l.id !== id);
  if (activeLogId === id) activeLogId = logs[Math.max(0, idx - 1)].id;
  saveLogs();
  renderLogs();
}

function renderLogs() {
  const tabsEl = $('#logTabs');
  const bodyEl = $('#logBody');
  if (!tabsEl || !bodyEl) return;
  tabsEl.innerHTML = '';
  bodyEl.innerHTML = '';

  logs.forEach((log, idx) => {
    // Tab
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab' + (log.id === activeLogId ? ' active' : '');
    tab.dataset.id = log.id;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = LOG_COLORS[idx % LOG_COLORS.length];
    dot.style.boxShadow = `0 0 8px ${LOG_COLORS[idx % LOG_COLORS.length]}`;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.textContent = log.type || 'LOG';
    tab.append(dot, nameSpan);
    tab.addEventListener('click', () => setActive(log.id));
    tabsEl.appendChild(tab);

    // Pane
    const pane = document.createElement('div');
    pane.className = 'log-pane' + (log.id === activeLogId ? ' active' : '');
    pane.dataset.id = log.id;

    const bar = document.createElement('div');
    bar.className = 'log-pane-bar';
    const typeInput = document.createElement('input');
    typeInput.type = 'text';
    typeInput.className = 'log-type';
    typeInput.value = log.type;
    typeInput.placeholder = t('log.type.ph');
    typeInput.addEventListener('input', () => {
      log.type = typeInput.value;
      nameSpan.textContent = log.type || 'LOG';
      saveLogs();
    });
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'btn-remove log-remove';
    rm.title = t('log.remove.title');
    rm.textContent = '\u00d7';
    rm.addEventListener('click', () => removeLog(log.id));
    bar.append(typeInput, rm);

    const ta = document.createElement('textarea');
    ta.className = 'log-input';
    ta.spellcheck = false;
    ta.placeholder = t('log.content.ph');
    ta.value = log.content;
    ta.addEventListener('input', () => {
      log.content = ta.value;
      updateCounterSoon();
      saveLogs();
    });

    pane.append(bar, ta);
    bodyEl.appendChild(pane);
  });

  // "+" add button
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'tab tab-add';
  addBtn.title = t('log.add.title');
  addBtn.textContent = '+';
  addBtn.addEventListener('click', addLog);
  tabsEl.appendChild(addBtn);

  updateCounter();
}

/* ---------- Counter ---------- */
function countText(text) {
  const chars = text.length;
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  return { chars, lines };
}

function updateCounter() {
  const log = logs.find((l) => l.id === activeLogId);
  const { chars, lines } = countText(log ? log.content : '');
  $('#counter').textContent = t('counter.tpl', '{lines} 行 · {chars} 字元')
    .replace('{lines}', lines)
    .replace('{chars}', chars);
}

// Debounced variant for the high-frequency textarea `input` event: counting a
// very large pasted LOG re-splits the whole string, so coalesce rapid keystrokes
// into one update instead of recomputing on every character.
let counterTimer = 0;
function updateCounterSoon() {
  if (counterTimer) clearTimeout(counterTimer);
  counterTimer = setTimeout(() => {
    counterTimer = 0;
    updateCounter();
  }, 150);
}

/* ---------- Form persistence ---------- */
function readFormFromDom() {
  const data = {};
  formFields.forEach((f) => (data[f] = $(`#${f}`).value));
  return data;
}

function writeFormToDom(form) {
  formFields.forEach((f) => {
    $(`#${f}`).value = form && form[f] != null ? form[f] : '';
  });
}

function saveForm() {
  persistExperiments();
}

formFields.forEach((f) => $(`#${f}`).addEventListener('input', saveForm));

/* ---------- Helpers ---------- */
function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ---------- Experiment name -> folder preview ---------- */
function isValidName(name) {
  const s = String(name || '').trim();
  if (!s) return false;
  // Reject Windows-illegal path characters and control chars.
  if (/[<>:"/\\|?*\u0000-\u001F]/.test(s)) return false;
  // Require at least one letter or digit (Unicode-aware; includes CJK).
  return /[\p{L}\p{N}]/u.test(s);
}

// Same folder abbreviation rule as the main process (utils.js).
function abbreviate(name, max = abbrevLen) {
  // Spaces / punctuation -> underscore; KEEP Unicode letters/digits (incl. CJK).
  let s = String(name || '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  if (!s) return 'EXPERIMENT';
  // No padding: keep short names short; cap long names, trimming a trailing underscore.
  if (s.length > max) s = s.slice(0, max).replace(/_+$/g, '');
  return s;
}

function updateFolderPreview() {
  const name = $('#experimentName').value;
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  const abbr = name.trim() ? abbreviate(name) : 'ABBREVIATE';
  $('#folderPreview').textContent = `${date}_${time}_${abbr}`;
}

/* ---------- Custom fields ---------- */
function getCustomFields() {
  return Array.from(document.querySelectorAll('#customFields .custom-row')).map((row) => ({
    label: row.querySelector('.cf-label').value,
    value: row.querySelector('.cf-value').value,
  }));
}

function saveCustomFields() {
  persistExperiments();
}

function addCustomRow(label = '', value = '') {
  const row = document.createElement('div');
  row.className = 'custom-row';
  row.innerHTML = `
    <input class="cf-label" type="text" placeholder="${t('custom.label.ph')}" autocomplete="off" />
    <input class="cf-value" type="text" placeholder="${t('custom.value.ph')}" autocomplete="off" />
    <button type="button" class="btn-grab" title="${t('custom.grab.title')}">
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </button>
    <button type="button" class="btn-remove" title="${t('custom.remove.title')}">&times;</button>
  `;
  row.querySelector('.cf-label').value = label;
  row.querySelector('.cf-value').value = value;
  row.querySelectorAll('input').forEach((i) => i.addEventListener('input', saveCustomFields));
  row.querySelector('.btn-grab').addEventListener('click', () => grabLatestDownload(row));
  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    saveCustomFields();
  });
  $('#customFields').appendChild(row);
}

/** Fill a custom-field value with the name of the most recently downloaded file. */
async function grabLatestDownload(row) {
  try {
    const r = await window.m2log.latestDownload();
    if (r && r.ok && r.name) {
      row.querySelector('.cf-value').value = r.name;
      saveCustomFields();
      toast(t('toast.grabOk') + r.name, 'success');
    } else {
      toast(t('toast.grabFail') + ((r && r.error) || ''), 'error');
    }
  } catch (e) {
    toast(t('toast.grabFail') + e.message, 'error');
  }
}

function writeCustomToDom(custom) {
  $('#customFields').innerHTML = '';
  if (!custom || !custom.length) {
    addCustomRow();
  } else {
    custom.forEach((f) => addCustomRow(f.label, f.value));
  }
}

/* ---------- Experiment tabs (multiple experiments open at once) ---------- */
function serializeExp(exp) {
  return {
    form: { ...(exp.form || {}) },
    custom: (exp.custom || []).map((c) => ({ label: c.label, value: c.value })),
    logs: (exp.logs || []).map((l) => ({ type: l.type, content: l.content })),
  };
}

function blankForm() {
  const form = {};
  formFields.forEach((f) => (form[f] = ''));
  form.date = todayStr();
  return form;
}

function getActiveExp() {
  return experiments.find((e) => e.id === activeExpId) || null;
}

/** Snapshot the live DOM (fields + custom + logs) into the active experiment. */
function captureActiveExp() {
  const exp = getActiveExp();
  if (!exp) return;
  exp.form = readFormFromDom();
  exp.custom = getCustomFields();
  exp.logs = logs.map((l) => ({ type: l.type, content: l.content }));
}

function persistExperiments() {
  captureActiveExp();
  try {
    localStorage.setItem(EXP_KEY, JSON.stringify(experiments.map(serializeExp)));
    const idx = experiments.findIndex((e) => e.id === activeExpId);
    localStorage.setItem(EXP_ACTIVE_KEY, String(idx < 0 ? 0 : idx));
  } catch (e) {
    /* ignore */
  }
  renderExpTabs();
}

/** Load an experiment's data into the DOM (fields + custom + logs). */
function restoreExpToDom(exp) {
  if (!exp) return;
  writeFormToDom(exp.form);
  writeCustomToDom(exp.custom);
  if (Array.isArray(exp.logs) && exp.logs.length) {
    logs = exp.logs.map((l) => ({ id: uid(), type: String(l.type || ''), content: String(l.content || '') }));
  } else {
    logs = defaultLogs();
  }
  activeLogId = logs[0].id;
  renderLogs();
  updateFolderPreview();
}

function renderExpTabs() {
  const wrap = $('#expTabs');
  if (!wrap) return;
  wrap.innerHTML = '';
  experiments.forEach((exp, idx) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'exp-tab' + (exp.id === activeExpId ? ' active' : '');
    tab.dataset.id = exp.id;

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = LOG_COLORS[idx % LOG_COLORS.length];
    dot.style.boxShadow = `0 0 8px ${LOG_COLORS[idx % LOG_COLORS.length]}`;

    const name = document.createElement('span');
    name.className = 'exp-tab-name';
    const label = exp && exp.form ? String(exp.form.experimentName || '').trim() : '';
    if (label) {
      name.textContent = label;
    } else {
      name.textContent = `${t('exp.tab.untitled', '實驗')} ${idx + 1}`;
      name.classList.add('untitled');
    }

    tab.append(dot, name);

    if (experiments.length > 1) {
      const close = document.createElement('span');
      close.className = 'exp-tab-close';
      close.textContent = '\u00d7';
      close.title = t('exp.close.title', '關閉此實驗');
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        removeExperiment(exp.id);
      });
      tab.appendChild(close);
    }

    tab.addEventListener('click', () => switchExperiment(exp.id));
    wrap.appendChild(tab);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'exp-tab-add';
  add.textContent = '+';
  add.title = t('exp.add.title', '新增實驗');
  add.addEventListener('click', addExperiment);
  wrap.appendChild(add);
}

function switchExperiment(id) {
  if (id === activeExpId) return;
  captureActiveExp();
  const exp = experiments.find((e) => e.id === id);
  if (!exp) return;
  activeExpId = id;
  restoreExpToDom(exp);
  persistExperiments();
  $('#experimentName').focus();
}

/** Add a new experiment tab, inheriting the current setup but with a blank name. */
function addExperiment() {
  captureActiveExp();
  const cur = getActiveExp();
  const exp = {
    id: uid(),
    form: cur ? { ...cur.form, experimentName: '' } : blankForm(),
    custom: cur ? cur.custom.map((c) => ({ label: c.label, value: c.value })) : [],
    logs: defaultLogs().map((l) => ({ type: l.type, content: l.content })),
  };
  experiments.push(exp);
  activeExpId = exp.id;
  restoreExpToDom(exp);
  persistExperiments();
  $('#experimentName').focus();
}

function removeExperiment(id) {
  if (experiments.length <= 1) {
    toast(t('toast.minExp', '至少保留一個實驗'), 'error');
    return;
  }
  const exp = experiments.find((e) => e.id === id);
  if (!exp) return;
  const hasData =
    (exp.form && String(exp.form.experimentName || '').trim()) ||
    (Array.isArray(exp.logs) && exp.logs.some((l) => String(l.content || '').trim()));
  if (hasData && !window.confirm(t('exp.closeConfirm', '關閉此實驗？尚未輸出的內容將會遺失。'))) {
    return;
  }
  const idx = experiments.findIndex((e) => e.id === id);
  const wasActive = id === activeExpId;
  experiments = experiments.filter((e) => e.id !== id);
  if (wasActive) {
    const next = experiments[Math.max(0, idx - 1)];
    activeExpId = next.id;
    restoreExpToDom(next);
  }
  persistExperiments();
}

/** Pull legacy single-experiment storage (form/custom/logs) into one experiment. */
function migrateLegacyExperiment() {
  let form = blankForm();
  try {
    const f = JSON.parse(localStorage.getItem(FORM_KEY) || 'null');
    if (f && typeof f === 'object') form = { ...form, ...f };
  } catch (e) {
    /* ignore */
  }
  let custom = [];
  try {
    const c = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null');
    if (Array.isArray(c)) custom = c.map((x) => ({ label: String(x.label || ''), value: String(x.value || '') }));
  } catch (e) {
    /* ignore */
  }
  let lg = [];
  try {
    const l = JSON.parse(localStorage.getItem(LOGS_KEY) || 'null');
    if (Array.isArray(l) && l.length) lg = l.map((x) => ({ type: String(x.type || ''), content: String(x.content || '') }));
  } catch (e) {
    /* ignore */
  }
  if (!lg.length) lg = defaultLogs().map((l) => ({ type: l.type, content: l.content }));
  if (!form.date) form.date = todayStr();
  return { id: uid(), form, custom, logs: lg };
}

function loadExperiments() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(EXP_KEY) || 'null');
  } catch (e) {
    saved = null;
  }
  if (Array.isArray(saved) && saved.length) {
    experiments = saved.map((e) => ({
      id: uid(),
      form: e.form && typeof e.form === 'object' ? { ...blankForm(), ...e.form } : blankForm(),
      custom: Array.isArray(e.custom)
        ? e.custom.map((c) => ({ label: String(c.label || ''), value: String(c.value || '') }))
        : [],
      logs:
        Array.isArray(e.logs) && e.logs.length
          ? e.logs.map((l) => ({ type: String(l.type || ''), content: String(l.content || '') }))
          : defaultLogs().map((l) => ({ type: l.type, content: l.content })),
    }));
  } else {
    experiments = [migrateLegacyExperiment()];
  }
  let activeIdx = parseInt(localStorage.getItem(EXP_ACTIVE_KEY), 10);
  if (Number.isNaN(activeIdx) || activeIdx < 0 || activeIdx >= experiments.length) activeIdx = 0;
  activeExpId = experiments[activeIdx].id;
}

/* ---------- Toast ---------- */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

/* ---------- Export ---------- */
async function doExport() {
  const payload = {};
  formFields.forEach((f) => (payload[f] = $(`#${f}`).value));
  payload.customFields = getCustomFields();
  payload.logs = logs.map((l) => ({ type: l.type, content: l.content }));
  payload.abbrevLen = abbrevLen;
  payload.typeLen = typeLen;

  if (!payload.experimentName.trim()) {
    toast(t('toast.needName'), 'error');
    $('#experimentName').focus();
    return;
  }
  if (!isValidName(payload.experimentName)) {
    toast(t('toast.nameEnglish'), 'error');
    $('#experimentName').focus();
    return;
  }
  if (!logs.some((l) => (l.content || '').trim())) {
    toast(t('toast.needLog'), 'error');
    return;
  }

  const btn = $('#btnExport');
  btn.disabled = true;
  btn.classList.add('loading');

  try {
    const data = await window.m2log.exportLog(payload);
    if (!data || !data.ok) throw new Error((data && data.error) || 'Export failed');

    state.lastExportPath = data.targetDir;
    showResult(data);
    toast(t('toast.exportOk'), 'success');
  } catch (err) {
    toast(t('toast.exportFail') + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

/* ---------- Export only the active LOG (with the experiment header) ---------- */
async function doExportSingle() {
  const log = logs.find((l) => l.id === activeLogId);
  if (!log) return;

  const payload = {};
  formFields.forEach((f) => (payload[f] = $(`#${f}`).value));
  payload.customFields = getCustomFields();
  payload.log = { type: log.type, content: log.content };
  payload.abbrevLen = abbrevLen;
  payload.typeLen = typeLen;

  if (!payload.experimentName.trim()) {
    toast(t('toast.needName'), 'error');
    $('#experimentName').focus();
    return;
  }
  if (!isValidName(payload.experimentName)) {
    toast(t('toast.nameEnglish'), 'error');
    $('#experimentName').focus();
    return;
  }
  if (!(log.content || '').trim()) {
    toast(t('toast.needLog'), 'error');
    return;
  }

  const btn = $('#btnExportSingle');
  btn.disabled = true;
  btn.classList.add('loading');
  try {
    const data = await window.m2log.exportSingleLog(payload);
    if (!data || !data.ok) throw new Error((data && data.error) || 'Export failed');
    state.lastExportPath = data.targetDir;
    showResult(data);
    toast(t('toast.exportSingleOk', '已輸出此 LOG'), 'success');
  } catch (err) {
    toast(t('toast.exportFail') + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

function showResult(data) {
  const panel = $('#result');
  panel.classList.remove('hidden');
  const files = data.files.map((f) => `<li>${escapeHtml(f)}</li>`).join('');
  panel.innerHTML = `
    <div class="result-head">
      <span class="result-title">${t('result.title')}</span>
      <button class="btn btn-ghost btn-sm" id="btnOpenResult">${t('result.openFolder')}</button>
    </div>
    <div class="result-path">${escapeHtml(data.targetDir)}</div>
    <ul class="result-files">${files}</ul>
  `;
  $('#btnOpenResult').addEventListener('click', () => openFolder(data.targetDir));
}

/* ---------- Open folder ---------- */
async function openFolder(p) {
  try {
    const data = await window.m2log.openFolder(p || state.lastExportPath);
    if (!data || !data.ok) throw new Error((data && data.error) || 'Open failed');
    toast(t('toast.explorerOk'), 'info');
  } catch (err) {
    toast(t('toast.openFail') + err.message, 'error');
  }
}

/* ---------- Pick output folder (native dialog) ---------- */
async function pickOutputBase() {
  try {
    const r = await window.m2log.pickFolder();
    if (r && r.ok && r.path) {
      $('#outputBase').value = r.path;
      saveForm();
    }
  } catch (e) {
    /* ignore */
  }
}

/* ---------- Open the Output Root folder (falls back to LOG_OUTPUT) ---------- */
async function openOutputBase() {
  const base = $('#outputBase').value.trim();
  try {
    const data = await window.m2log.openFolder(base);
    if (!data || !data.ok) throw new Error((data && data.error) || 'Open failed');
    toast(t('toast.explorerOk'), 'info');
  } catch (err) {
    toast(t('toast.openFail') + err.message, 'error');
  }
}

/* ---------- Reset fields to defaults ---------- */
function resetFields() {
  formFields.forEach((f) => {
    $(`#${f}`).value = '';
  });
  $('#date').value = todayStr();
  saveForm();
  $('#customFields').innerHTML = '';
  addCustomRow();
  saveCustomFields();
  updateFolderPreview();
  toast(t('toast.resetOk'), 'info');
  $('#experimentName').focus();
}

/* ---------- Next experiment (keep field settings, reset name + LOGs to default) ---------- */
function nextExperiment() {
  $('#experimentName').value = '';
  saveForm();
  updateFolderPreview();
  logs = defaultLogs();
  activeLogId = logs[0].id;
  saveLogs();
  renderLogs();
  toast(t('toast.nextOk'), 'info');
  $('#experimentName').focus();
}

/* ---------- Copy experiment fields as text to the clipboard ---------- */
async function copySummary() {
  const lines = [];
  // Single-line values stay inline ("Label: value"). Multi-line values
  // (e.g. Notes) put the label on its own line, then the content below.
  const formatField = (label, value) => {
    const v = String(value == null ? '' : value);
    return /[\r\n]/.test(v) ? `${label}:\n${v}` : `${label}: ${v}`;
  };
  const add = (label, value) => {
    const v = String(value == null ? '' : value).trim();
    if (v) lines.push(formatField(label, v));
  };
  // Notes: prefix each non-empty line with "- " so they read as a bullet list.
  const bulletizeNotes = (value) =>
    String(value == null ? '' : value)
      .split(/\r?\n/)
      .map((line) => (line.trim() ? `- ${line.trim()}` : line))
      .join('\n');
  add(t('field.expName', '實驗名稱'), $('#experimentName').value);
  add(t('field.date', '日期'), $('#date').value);
  add(t('field.tester', '測試人員'), $('#tester').value);
  add(t('field.testCase', '測試項目'), $('#testCase').value);
  add(t('field.notes', '備註'), bulletizeNotes($('#notes').value));
  getCustomFields().forEach((f) => {
    const label = String(f.label || '').trim();
    const value = String(f.value || '').trim();
    if (label || value) lines.push(formatField(label || '-', value));
  });
  add(t('field.outputBase', '輸出根目錄'), $('#outputBase').value);

  // Use CRLF so line breaks survive when pasting into Windows apps
  // (Notepad, Outlook, some input fields treat a bare \n as no break).
  const text = lines.join('\n').replace(/\r?\n/g, '\r\n');
  if (!text) {
    toast(t('toast.summaryEmpty', '沒有可複製的欄位'), 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(t('toast.summaryOk', '已複製實驗摘要到剪貼簿'), 'success');
  } catch (e) {
    toast(t('toast.copyFail') + e.message, 'error');
  }
}

/* ---------- Wire up ---------- */
$('#btnExport').addEventListener('click', doExport);
$('#btnExportSingle').addEventListener('click', doExportSingle);
$('#btnOpenExplorer').addEventListener('click', () => openFolder(state.lastExportPath));
$('#btnBrowseBase').addEventListener('click', pickOutputBase);
$('#btnOpenBase').addEventListener('click', openOutputBase);
$('#btnResetFields').addEventListener('click', resetFields);
$('#btnNextExp').addEventListener('click', nextExperiment);
$('#btnCopySummary').addEventListener('click', copySummary);
$('#btnAddField').addEventListener('click', () => {
  addCustomRow();
  saveCustomFields();
});
$('#experimentName').addEventListener('input', updateFolderPreview);
$('#btnRefreshTime').addEventListener('click', () => {
  $('#date').value = todayStr();
  saveForm();
  updateFolderPreview();
});
$('#btnLang').addEventListener('click', () => {
  loadLang(currentLang === 'zh' ? 'en' : 'zh');
});
const creditEl = $('#appCredit');
if (creditEl) {
  creditEl.addEventListener('click', (e) => {
    e.preventDefault();
    window.m2log.openExternal('https://github.com/oahsiao');
  });
}
$('#btnClearLogs').addEventListener('click', () => {
  const log = logs.find((l) => l.id === activeLogId);
  if (!log) return;
  log.content = '';
  const ta = document.querySelector(`#logBody .log-pane[data-id="${log.id}"] .log-input`);
  if (ta) ta.value = '';
  updateCounter();
  saveLogs();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    doExport();
  }
});

/* ---------- LOG Analysis ---------- */
const ANA_FOLDER_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const ANA_FILE_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
const ANA_FONT_KEY = 'm2log_ana_font';
const ANA_ROOT_KEY = 'm2log_ana_root';
const ANA_FILE_KEY = 'm2log_ana_file';
const ANA_FOLD_KEY = 'm2log_ana_fold';
function clampAnaFont(n) {
  return Number.isFinite(n) ? Math.min(24, Math.max(9, n)) : 12.5;
}
const ana = {
  root: '',
  // Highlight-profile selection: 'auto' (default) guesses the best profile from
  // the LOG file name; a concrete type pins that profile; 'none' turns it off.
  // 'auto' re-detects per file (like editor language detection); a manual dropdown
  // pick overrides only the currently open file.
  hl: 'auto',
  text: null,
  name: '',
  path: '',
  truncated: false,
  lines: null,
  font: clampAnaFont(parseFloat(localStorage.getItem(ANA_FONT_KEY))),
  // Fold (collapse) the runs of lines that carry no highlight, leaving only the
  // highlighted lines visible. Default off; persisted (set to '1' to enable).
  fold: localStorage.getItem(ANA_FOLD_KEY) === '1',
};
// Which collapsed runs are currently expanded, keyed by the run's first line
// index. Reset whenever a file is (re)rendered.
const anaFold = { open: new Set() };
// The expanded run currently under the viewport (start/end line indices) that
// the floating edge-jump buttons target; {-1, -1} when none is in view.
const anaFoldEdge = { start: -1, end: -1 };
const anaNav = { markers: [], targets: [], pos: -1, line: -1, levels: {} };
// Bookmarks: `lines` points at the active file's set; `store` keeps one set per
// file path so bookmarks survive switching files and coming back (per session).
const anaBm = { lines: new Set(), current: -1, path: '', store: new Map() };
// In-viewer search (Ctrl+F): matches hold {line,start,end} char offsets per line;
// highlighting uses the CSS Custom Highlight API so it layers over level spans.
const anaFind = { q: '', matches: [], pos: -1 };
const anaFindSupported =
  typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';
// Manual highlights (right-click → Highlight): per file, like bookmarks. Each
// term {text, level} compiles into a render rule (colours text + adds a nav chip).
const anaMark = { terms: [], path: '', store: new Map(), seq: 0 };
let anaReady = false;

// Cache the current file split into lines so search / re-highlight don't re-split
// the (potentially multi-MB) text on every keystroke. Invalidated (set to null)
// whenever ana.text changes.
function anaGetLines() {
  if (ana.lines == null) ana.lines = ana.text == null ? [] : String(ana.text).split(/\r\n|\r|\n/);
  return ana.lines;
}

function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

async function anaEnsureInit() {
  if (anaReady) return;
  anaReady = true;
  anaApplyViewPrefs();
  await anaPopulateHl();
  const saved = localStorage.getItem(ANA_ROOT_KEY);
  if (saved) {
    ana.root = saved;
  } else {
    const r = await window.m2log.logRoot();
    ana.root = r && r.ok && r.path ? r.path : '';
  }
  await anaRenderTree();
  // Best-effort: restore the last opened file's content.
  const savedFile = localStorage.getItem(ANA_FILE_KEY);
  if (savedFile) {
    anaOpenTab({ name: savedFile.split(/[\\/]/).pop(), path: savedFile }, null);
  }
}

// Switch the top-level UI to the LOG Analysis tab (used when a path is handed
// in from outside, e.g. the Explorer right-click menu).
function anaActivateTab() {
  document.querySelectorAll('.feature-tab').forEach((tb) => {
    tb.classList.toggle('active', tb.dataset.view === 'analysis');
  });
  document.querySelectorAll('.feature-view').forEach((v) => v.classList.remove('active'));
  const view = document.getElementById('view-analysis');
  if (view) view.classList.add('active');
  window.dispatchEvent(new Event('resize'));
}

// Open a file or folder handed in from outside the app (Explorer right-click
// "Analyze with M2 LOG"): switch to LOG Analysis, point the tree at the path
// (the file's parent folder when a file), and open the file in the viewer.
async function anaOpenExternalPath(target) {
  if (!target || !target.path) return;
  anaActivateTab();
  await anaEnsureInit();
  const p = String(target.path);
  const root = target.isDir ? p : p.replace(/[\\/][^\\/]*$/, '') || p;
  ana.root = root;
  try {
    localStorage.setItem(ANA_ROOT_KEY, ana.root);
  } catch (e) {
    /* ignore */
  }
  await anaRenderTree();
  if (!target.isDir) {
    anaOpenTab({ name: p.split(/[\\/]/).pop(), path: p }, anaFindRowByPath(p));
  }
}

// Apply persisted viewer preferences (word-wrap + font size) and reflect the
// wrap state on its toolbar toggle.
function anaApplyViewPrefs() {
  const el = document.getElementById('anaViewContent');
  if (el) {
    // Virtualized rendering requires a fixed line height, so the viewer is
    // always nowrap (long lines scroll horizontally).
    el.classList.add('nowrap');
    el.style.fontSize = ana.font + 'px';
  }
  const editEl = document.getElementById('anaEditArea');
  if (editEl) editEl.style.fontSize = ana.font + 'px';
  const fb = document.getElementById('btnAnaFold');
  if (fb) fb.classList.toggle('on', ana.fold);
}

function anaSetFont(px) {
  ana.font = clampAnaFont(px);
  localStorage.setItem(ANA_FONT_KEY, String(ana.font));
  anaApplyViewPrefs();
  anaVirtRefresh(); // font size changed -> line height changed -> re-measure + re-render
}

async function anaRenderTree() {
  const treeEl = $('#anaTree');
  if (!treeEl) return;
  $('#anaPath').textContent = ana.root || '';
  treeEl.innerHTML = `<div class="ana-hint">${t('ana.loading')}</div>`;
  const res = await window.m2log.listDir(ana.root);
  treeEl.innerHTML = '';
  if (!res || !res.ok) {
    treeEl.innerHTML = `<div class="ana-empty">${escapeHtml((res && res.error) || t('ana.loadFail'))}</div>`;
    $('#anaCount').textContent = '';
    return;
  }
  if (!res.entries.length) {
    treeEl.innerHTML = `<div class="ana-empty">${t('ana.noFiles')}</div>`;
  } else {
    treeEl.appendChild(anaBuildLevel(res.entries, 0));
  }
  treeEl.dataset.total = String(res.entries.length);
  $('#anaCount').textContent = String(res.entries.length);
  if (anaFilterValue()) anaApplyFilter();
}

/* ---------- File-tree filter (Type to filter) ---------- */
let anaFilterTimer = null;
let anaFilterActiveEl = null;

function anaFilterValue() {
  const inp = document.getElementById('anaFilterInput');
  return (inp ? inp.value : '').trim().toLowerCase();
}

// Recursively load every directory node so the filter can match nested files.
async function anaLoadAllNodes(container) {
  const nodes = Array.from(container.children).filter((c) => c.classList && c.classList.contains('ana-node'));
  await Promise.all(
    nodes.map(async (node) => {
      if (typeof node._anaLoad === 'function') await node._anaLoad();
      if (node._anaChildren) await anaLoadAllNodes(node._anaChildren);
    })
  );
}

// Toggle row visibility for a query; returns true if anything inside matched so
// matching ancestor folders stay visible (and are auto-expanded). `stats.n`
// accumulates the number of matched entries for the result counter.
function anaFilterContainer(container, q, stats) {
  let any = false;
  Array.from(container.children).forEach((child) => {
    if (!child.classList || child.classList.contains('ana-filter-empty')) return;
    if (child.classList.contains('ana-node')) {
      const row = child.firstElementChild;
      const kids = child._anaChildren;
      const selfMatch = !!row && (row.dataset.name || '').includes(q);
      const childMatch = kids ? anaFilterContainer(kids, q, stats) : false;
      const visible = selfMatch || childMatch;
      child.classList.toggle('ana-hidden', !visible);
      if (childMatch && kids && row) {
        kids.hidden = false;
        row.classList.add('open');
      }
      if (row) anaSetNameHtml(row, selfMatch ? q : '');
      if (selfMatch && stats) stats.n += 1;
      if (visible) any = true;
    } else if (child.classList.contains('ana-row')) {
      const match = (child.dataset.name || '').includes(q);
      child.classList.toggle('ana-hidden', !match);
      anaSetNameHtml(child, match ? q : '');
      if (match) {
        any = true;
        if (stats) stats.n += 1;
      }
    } else {
      // hints / empty placeholders – hide while filtering
      child.classList.add('ana-hidden');
    }
  });
  return any;
}

// Show/clear the "no matches" placeholder inside the file tree.
function anaFilterSetEmpty(show) {
  const treeEl = document.getElementById('anaTree');
  if (!treeEl) return;
  let empty = treeEl.querySelector('.ana-filter-empty');
  if (show) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'ana-empty ana-filter-empty';
      treeEl.appendChild(empty);
    }
    empty.textContent = t('ana.filter.none', '無相符項目');
  } else if (empty) {
    empty.remove();
  }
}

async function anaApplyFilter() {
  const treeEl = document.getElementById('anaTree');
  if (!treeEl) return;
  const q = anaFilterValue();
  const clearBtn = document.getElementById('anaFilterClear');
  if (clearBtn) clearBtn.hidden = !q;
  const countEl = document.getElementById('anaCount');
  if (!q) {
    treeEl.querySelectorAll('.ana-hidden').forEach((el) => el.classList.remove('ana-hidden'));
    treeEl.querySelectorAll('.ana-name').forEach((n) => {
      n.textContent = n.textContent;
    });
    anaFilterSetActive(null);
    anaFilterSetEmpty(false);
    if (countEl && treeEl.dataset.total != null) countEl.textContent = treeEl.dataset.total;
    return;
  }
  // Load the whole tree once so nested files are searchable, then filter.
  await anaLoadAllNodes(treeEl);
  if (anaFilterValue() !== q) return; // query changed while loading
  anaFilterSetEmpty(false); // drop any stale placeholder before recounting
  const stats = { n: 0 };
  anaFilterContainer(treeEl, q, stats);
  if (countEl) countEl.textContent = `${stats.n}/${treeEl.dataset.total || '?'}`;
  anaFilterSetEmpty(stats.n === 0);
}

// Highlight the matched substring within a tree row's name (or restore plain
// text when q is empty / no match). textContent always yields the raw name even
// after a previous highlight, so re-highlighting stays clean.
function anaSetNameHtml(row, q) {
  const nameEl = row && row.querySelector('.ana-name');
  if (!nameEl) return;
  const raw = nameEl.textContent;
  if (!q) {
    nameEl.textContent = raw;
    return;
  }
  const at = raw.toLowerCase().indexOf(q);
  if (at < 0) {
    nameEl.textContent = raw;
    return;
  }
  nameEl.innerHTML =
    escapeHtml(raw.slice(0, at)) +
    '<mark class="ana-fmark">' +
    escapeHtml(raw.slice(at, at + q.length)) +
    '</mark>' +
    escapeHtml(raw.slice(at + q.length));
}

// Currently visible file rows, in document order, for filter keyboard nav.
function anaVisibleFileRows() {
  const treeEl = document.getElementById('anaTree');
  if (!treeEl) return [];
  return Array.from(treeEl.querySelectorAll('.ana-row.is-file')).filter((r) => r.offsetParent !== null);
}

function anaFilterSetActive(el) {
  if (anaFilterActiveEl && anaFilterActiveEl !== el) anaFilterActiveEl.classList.remove('kbd-active');
  anaFilterActiveEl = el || null;
  if (anaFilterActiveEl) {
    anaFilterActiveEl.classList.add('kbd-active');
    anaFilterActiveEl.scrollIntoView({ block: 'nearest' });
  }
}

function anaFilterMove(dir) {
  const rows = anaVisibleFileRows();
  if (!rows.length) return;
  let idx = anaFilterActiveEl ? rows.indexOf(anaFilterActiveEl) : -1;
  idx = idx < 0 ? (dir > 0 ? 0 : rows.length - 1) : idx + dir;
  if (idx < 0) idx = rows.length - 1;
  if (idx >= rows.length) idx = 0;
  anaFilterSetActive(rows[idx]);
}

function anaFilterOpenActive() {
  if (anaFilterActiveEl) anaFilterActiveEl.click();
}

function anaSort(entries) {
  const dirs = entries.filter((e) => e.isDir).sort((a, b) => b.name.localeCompare(a.name));
  const files = entries.filter((e) => !e.isDir).sort((a, b) => a.name.localeCompare(b.name));
  return dirs.concat(files);
}

function anaBuildLevel(entries, depth) {
  const frag = document.createDocumentFragment();
  anaSort(entries).forEach((entry) => frag.appendChild(anaBuildNode(entry, depth)));
  return frag;
}

function anaBuildNode(entry, depth) {
  const row = document.createElement('div');
  row.className = 'ana-row ' + (entry.isDir ? 'is-dir' : 'is-file');
  row.style.paddingLeft = 8 + depth * 16 + 'px';
  const caret = document.createElement('span');
  caret.className = 'ana-caret';
  caret.textContent = entry.isDir ? '\u25B8' : '';
  const ic = document.createElement('span');
  ic.className = 'ana-ic';
  ic.innerHTML = entry.isDir ? ANA_FOLDER_SVG : ANA_FILE_SVG;
  const name = document.createElement('span');
  name.className = 'ana-name';
  name.textContent = entry.name;
  row.append(caret, ic, name);
  row.dataset.name = entry.name.toLowerCase();

  if (!entry.isDir) {
    row.dataset.path = entry.path;
    row.addEventListener('click', () => anaOpenTab(entry, row));
    return row;
  }

  const wrap = document.createElement('div');
  wrap.className = 'ana-node';
  const children = document.createElement('div');
  children.className = 'ana-children';
  children.hidden = true;
  let loadPromise = null;
  // Load this directory's children once. A shared in-flight promise lets the
  // file filter drive loading concurrently with a user click.
  function load() {
    if (!loadPromise) {
      loadPromise = (async () => {
        const res = await window.m2log.listDir(entry.path);
        children.innerHTML = '';
        if (res && res.ok && res.entries.length) {
          children.appendChild(anaBuildLevel(res.entries, depth + 1));
        } else if (res && res.ok) {
          children.innerHTML = `<div class="ana-hint" style="padding-left:${8 + (depth + 1) * 16}px">${t('ana.noFiles')}</div>`;
        } else {
          children.innerHTML = `<div class="ana-empty">${escapeHtml((res && res.error) || t('ana.loadFail'))}</div>`;
        }
      })();
    }
    return loadPromise;
  }
  async function setOpen(open) {
    if (open) {
      await load();
      children.hidden = false;
      row.classList.add('open');
    } else {
      children.hidden = true;
      row.classList.remove('open');
    }
  }
  // Expose to the file-tree filter for programmatic loading/expansion.
  wrap._anaLoad = load;
  wrap._anaChildren = children;
  row.addEventListener('click', () => setOpen(children.hidden));
  wrap.append(row, children);
  return wrap;
}

/* ---------- Viewer tabs (open multiple LOG files) ---------- */
// Each tab is one opened file {path, name}. Tabs reuse anaViewFile to render;
// per-file bookmarks/marks already survive because their stores are keyed by path.
const anaTabs = [];
let anaActiveTab = '';
let anaTabCtxPath = '';

function anaFindRowByPath(path) {
  const tree = document.getElementById('anaTree');
  if (!tree) return null;
  const sel = window.CSS && CSS.escape ? CSS.escape(path) : path;
  return tree.querySelector(`.ana-row.is-file[data-path="${sel}"]`);
}

function anaRenderTabs() {
  const host = document.getElementById('anaTabs');
  if (!host) return;
  host.classList.toggle('empty', anaTabs.length === 0);
  host.innerHTML = '';
  anaTabs.forEach((tb) => {
    const el = document.createElement('div');
    el.className = 'ana-tab' + (tb.path === anaActiveTab ? ' active' : '');
    el.dataset.path = tb.path;
    el.title = tb.path;
    const name = document.createElement('span');
    name.className = 'ana-tab-name';
    name.textContent = tb.name;
    const close = document.createElement('span');
    close.className = 'ana-tab-close';
    close.textContent = '\u00d7';
    close.title = t('ana.tab.close', '關閉');
    el.append(name, close);
    host.appendChild(el);
  });
}

// Open a file in a tab (creating it if needed) and make it active.
function anaOpenTab(entry, row) {
  if (!anaTabs.some((tb) => tb.path === entry.path)) {
    anaTabs.push({ path: entry.path, name: entry.name });
  }
  anaActiveTab = entry.path;
  anaRenderTabs();
  anaViewFile(entry, row || anaFindRowByPath(entry.path));
}

// Switch the viewer to an already-open tab.
function anaActivateTab(path) {
  if (path === anaActiveTab) return;
  const tb = anaTabs.find((x) => x.path === path);
  if (!tb) return;
  anaActiveTab = path;
  anaRenderTabs();
  anaViewFile({ name: tb.name, path: tb.path }, anaFindRowByPath(path));
}

function anaCloseTab(path) {
  const idx = anaTabs.findIndex((tb) => tb.path === path);
  if (idx < 0) return;
  const wasActive = anaActiveTab === path;
  anaTabs.splice(idx, 1);
  if (wasActive) {
    if (anaTabs.length) {
      const next = anaTabs[Math.min(idx, anaTabs.length - 1)];
      anaActiveTab = next.path;
      anaRenderTabs();
      anaViewFile({ name: next.name, path: next.path }, anaFindRowByPath(next.path));
    } else {
      anaActiveTab = '';
      anaRenderTabs();
      anaClearViewer();
    }
  } else {
    anaRenderTabs();
  }
}

function anaCloseOtherTabs(path) {
  const keep = anaTabs.find((tb) => tb.path === path);
  if (!keep) return;
  anaTabs.length = 0;
  anaTabs.push(keep);
  if (anaActiveTab !== path) {
    anaActiveTab = path;
    anaRenderTabs();
    anaViewFile({ name: keep.name, path: keep.path }, anaFindRowByPath(path));
  } else {
    anaRenderTabs();
  }
}

async function anaCopyTabPath(path) {
  try {
    await navigator.clipboard.writeText(path);
    toast(t('ana.tab.copied', '已複製路徑'), 'success');
  } catch (e) {
    toast(t('ana.tab.copyFail', '複製失敗'), 'error');
  }
}

// Reset the viewer to an empty state (used when the last tab is closed).
function anaClearViewer() {
  anaExitEdit();
  ana.text = null;
  ana.lines = null;
  ana.name = '';
  ana.path = '';
  ana.truncated = false;
  anaSetEditEnabled(false);
  const content = document.getElementById('anaViewContent');
  if (content) content.textContent = '';
  const nameEl = document.getElementById('anaViewName');
  if (nameEl) nameEl.textContent = t('ana.viewer', '檢視');
  const metaEl = document.getElementById('anaViewMeta');
  if (metaEl) metaEl.textContent = '';
  const lvHost = document.getElementById('anaLevels');
  if (lvHost) lvHost.innerHTML = '';
  const ruler = document.getElementById('anaRuler');
  if (ruler) ruler.hidden = true;
  anaNav.markers = [];
  anaNav.line = -1;
  anaNavRebuild();
  anaFindClose();
  document.querySelectorAll('#anaTree .ana-row.selected').forEach((r) => r.classList.remove('selected'));
  try {
    localStorage.removeItem(ANA_FILE_KEY);
  } catch (e) {
    /* ignore */
  }
}

/* ---------- In-place editor (Edit / Save) ---------- */
// While editing, a plain <textarea> overlays the virtualized viewer. Saving
// writes UTF-8 back to the same path and re-renders the viewer with the new
// content. Truncated (very large) files are not editable — see anaViewFile.
let anaEditing = false;

// Enable/disable the Edit button and reflect why via its tooltip.
function anaSetEditEnabled(on) {
  const btn = document.getElementById('btnAnaEdit');
  if (!btn) return;
  btn.disabled = !on;
  btn.title = on
    ? t('ana.edit.title', '編輯此 LOG 檔案')
    : ana.truncated
    ? t('ana.edit.truncated', '檔案過大（已截斷），無法編輯')
    : t('ana.edit.title', '編輯此 LOG 檔案');
}

// Show/hide the edit vs view controls for the current mode.
function anaSetEditButtons(editing) {
  const edit = document.getElementById('btnAnaEdit');
  const save = document.getElementById('btnAnaSave');
  const cancel = document.getElementById('btnAnaCancel');
  if (edit) edit.hidden = editing;
  if (save) save.hidden = !editing;
  if (cancel) cancel.hidden = !editing;
}

function anaEnterEdit() {
  if (anaEditing) return;
  if (ana.text == null) {
    toast(t('ana.edit.noLog', '請先開啟一個 LOG 再編輯'), 'error');
    return;
  }
  if (ana.truncated) {
    toast(t('ana.edit.truncated', '檔案過大（已截斷），無法編輯'), 'error');
    return;
  }
  const ta = document.getElementById('anaEditArea');
  const scroll = document.getElementById('anaScroll');
  if (!ta) return;
  anaEditing = true;
  ta.value = ana.text;
  ta.style.fontSize = ana.font + 'px';
  ta.hidden = false;
  if (scroll) scroll.hidden = true;
  anaSetEditButtons(true);
  ta.focus();
  ta.setSelectionRange(0, 0);
  ta.scrollTop = 0;
}

// Leave edit mode without saving (also used before opening another file).
function anaExitEdit() {
  if (!anaEditing) return;
  anaEditing = false;
  const ta = document.getElementById('anaEditArea');
  const scroll = document.getElementById('anaScroll');
  if (ta) {
    ta.hidden = true;
    ta.value = '';
  }
  if (scroll) scroll.hidden = false;
  anaSetEditButtons(false);
}

async function anaSaveEdit() {
  if (!anaEditing) return;
  const ta = document.getElementById('anaEditArea');
  const path = ana.path || anaActiveTab;
  if (!ta || !path) return;
  const newText = ta.value;
  const save = document.getElementById('btnAnaSave');
  if (save) save.disabled = true;
  try {
    const res = await window.m2log.writeText({ path, content: newText });
    if (!res || !res.ok) throw new Error((res && res.error) || 'Save failed');
    ana.text = newText;
    ana.lines = null;
    anaExitEdit();
    anaInvalidateRulesCache();
    const rules = await anaResolveRules(ana.name);
    anaRenderContent(newText, rules);
    const metaEl = document.getElementById('anaViewMeta');
    if (metaEl) metaEl.textContent = formatBytes(res.size);
    const sc = document.getElementById('anaScroll');
    if (sc) sc.focus({ preventScroll: true });
    toast(t('toast.saveOk', '已儲存變更'), 'success');
  } catch (e) {
    toast(t('toast.saveFail', '儲存失敗：') + e.message, 'error');
  } finally {
    if (save) save.disabled = false;
  }
}

// Tab strip interactions: click to activate, click ✕ / middle-click to close,
// right-click for the close / copy-path menu.
(() => {
  const host = document.getElementById('anaTabs');
  if (!host) return;
  host.addEventListener('click', (e) => {
    const tabEl = e.target.closest('.ana-tab');
    if (!tabEl) return;
    const path = tabEl.dataset.path;
    if (e.target.closest('.ana-tab-close')) {
      anaCloseTab(path);
      return;
    }
    anaActivateTab(path);
  });
  host.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const tabEl = e.target.closest('.ana-tab');
    if (!tabEl) return;
    e.preventDefault();
    anaCloseTab(tabEl.dataset.path);
  });
  host.addEventListener('contextmenu', (e) => {
    const tabEl = e.target.closest('.ana-tab');
    if (!tabEl) return;
    e.preventDefault();
    anaTabCtxPath = tabEl.dataset.path;
    const items = [
      { act: 'tabclose', label: t('ana.tab.close', '關閉') },
      { act: 'tabcopy', label: t('ana.tab.copyPath', '複製檔案路徑') },
    ];
    if (anaTabs.length > 1) {
      items.push({ sep: true });
      items.push({ act: 'tabcloseothers', label: t('ana.tab.closeOthers', '關閉其他') });
    }
    anaCtxShow(e.clientX, e.clientY, items);
  });
})();

async function anaViewFile(entry, row) {
  anaExitEdit();
  document.querySelectorAll('#anaTree .ana-row.selected').forEach((r) => r.classList.remove('selected'));
  if (row) row.classList.add('selected');
  $('#anaViewName').textContent = entry.name;
  $('#anaViewMeta').textContent = '';
  const content = $('#anaViewContent');
  const ruler = document.getElementById('anaRuler');
  if (ruler) ruler.hidden = true;
  anaNav.markers = [];
  anaNav.line = -1;
  anaNavRebuild();
  anaFindClose();
  const lvHost = document.getElementById('anaLevels');
  if (lvHost) lvHost.innerHTML = '';
  // Restore (or start) the bookmark set saved for this file path so bookmarks
  // are remembered when switching away and back.
  anaBm.path = entry.path;
  let bmSet = anaBm.store.get(entry.path);
  if (!bmSet) {
    bmSet = new Set();
    anaBm.store.set(entry.path, bmSet);
  }
  anaBm.lines = bmSet;
  anaBm.current = -1;
  anaBmUpdateCounter();
  // Restore manual highlights saved for this file (per-file, like bookmarks).
  anaMark.path = entry.path;
  let mkArr = anaMark.store.get(entry.path);
  if (!mkArr) {
    mkArr = [];
    anaMark.store.set(entry.path, mkArr);
  }
  anaMark.terms = mkArr;
  ana.name = entry.name;
  ana.path = entry.path;
  // Auto-detect the highlight profile per file (like editor language detection):
  // reset to 'auto' so each opened file is judged by its own name.
  ana.hl = 'auto';
  ana.truncated = false;
  ana.text = null;
  ana.lines = null;
  anaSetEditEnabled(false);
  content.textContent = t('ana.loading');
  const res = await window.m2log.readText(entry.path);
  if (!res || !res.ok) {
    content.textContent = res && res.binary ? t('ana.binary') : (res && res.error) || t('ana.readFail');
    return;
  }
  let text = res.content;
  if (res.truncated) text += `\n\n... [${t('ana.truncated')}]`;
  ana.text = text;
  ana.truncated = !!res.truncated;
  ana.lines = null;
  // A truncated (very large) file cannot be edited safely: saving would write
  // back the on-screen truncation marker and lose the rest of the file.
  anaSetEditEnabled(!res.truncated);
  try {
    localStorage.setItem(ANA_FILE_KEY, entry.path);
  } catch (e) {
    /* ignore */
  }
  anaInvalidateRulesCache();
  const rules = await anaResolveRules(entry.name);
  anaReflectHl(entry.name);
  anaRenderContent(text, rules);
  const sc = document.getElementById('anaScroll');
  if (sc) sc.focus({ preventScroll: true });
  $('#anaViewMeta').textContent = formatBytes(res.size) + (res.truncated ? ' · ' + t('ana.truncated') : '');
}

/* ---------- Highlight rules (per LOG type, loaded from /highlight) ---------- */
const anaRulesCache = {};

// Drop cached compiled rules so edits to the highlight JSON take effect the next
// time a file is opened, without needing to restart the app.
function anaInvalidateRulesCache() {
  Object.keys(anaRulesCache).forEach((k) => delete anaRulesCache[k]);
}

function anaCompileRules(ruleList) {
  const compiled = [];
  (ruleList || []).forEach((r) => {
    if (!r || !r.pattern) return;
    const level = String(r.level || 'info').replace(/[^a-z]/gi, '').toLowerCase() || 'info';
    let flags = 'g';
    if (String(r.flags == null ? 'i' : r.flags).includes('i')) flags += 'i';
    try {
      compiled.push({ re: new RegExp(r.pattern, flags), level });
    } catch (e) {
      /* skip invalid pattern */
    }
  });
  return { compiled };
}

// Available highlight profiles (from /highlight), cached from listHighlights().
let anaHlTypes = [];

async function anaEnsureHlTypes() {
  if (anaHlTypes.length) return anaHlTypes;
  try {
    const r = await window.m2log.listHighlights();
    if (r && r.ok && Array.isArray(r.types)) anaHlTypes = r.types.slice();
  } catch (e) {
    /* ignore */
  }
  return anaHlTypes;
}

// Guess the best-fitting highlight profile from the LOG file name. Each profile
// name is tokenized (e.g. INTEL_UEFI -> intel, uefi) and scored by how many of
// its tokens appear in the compacted file name. Most hits wins, then highest
// coverage ratio, then longest match. Returns '' when nothing matches.
function anaGuessType(filename) {
  const fnorm = String(filename || '')
    .toLowerCase()
    .replace(/\.[^.]*$/, '')
    .replace(/[^a-z0-9]+/g, '');
  if (!fnorm) return '';
  let best = '';
  let bestHits = 0;
  let bestRatio = 0;
  let bestLen = 0;
  anaHlTypes.forEach((ty) => {
    const tokens = String(ty)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (!tokens.length) return;
    let hits = 0;
    let matchLen = 0;
    tokens.forEach((tok) => {
      if (fnorm.includes(tok)) {
        hits += 1;
        matchLen += tok.length;
      }
    });
    if (!hits) return;
    const ratio = hits / tokens.length;
    if (
      hits > bestHits ||
      (hits === bestHits && ratio > bestRatio) ||
      (hits === bestHits && ratio === bestRatio && matchLen > bestLen)
    ) {
      best = ty;
      bestHits = hits;
      bestRatio = ratio;
      bestLen = matchLen;
    }
  });
  return best;
}

async function anaGetRulesByType(type) {
  const base = String(type || '').toUpperCase();
  if (!base) return { compiled: [] };
  if (Object.prototype.hasOwnProperty.call(anaRulesCache, base)) return anaRulesCache[base];
  let compiled = { compiled: [] };
  try {
    const res = await window.m2log.loadHighlight(base);
    if (res && res.ok && Array.isArray(res.rules)) compiled = anaCompileRules(res.rules);
  } catch (e) {
    /* ignore */
  }
  anaRulesCache[base] = compiled;
  return compiled;
}

/** Resolve which highlight ruleset to use, honoring the manual override. */
async function anaResolveRules(filename) {
  if (ana.hl === 'none') return { compiled: [] };
  if (ana.hl && ana.hl !== 'auto') return anaGetRulesByType(ana.hl);
  // Auto: guess the best-fitting profile from the file name.
  await anaEnsureHlTypes();
  const guess = anaGuessType(filename);
  return guess ? anaGetRulesByType(guess) : { compiled: [] };
}

/** Show the effective profile in the dropdown (the guessed one when in auto). */
function anaReflectHl(filename) {
  const sel = $('#anaHlSelect');
  if (!sel) return;
  const val = ana.hl === 'auto' ? anaGuessType(filename) : ana.hl;
  sel.value = val || 'none';
}

/** Fill the highlight-type selector: Auto + available types + Off. */
async function anaPopulateHl() {
  const sel = $('#anaHlSelect');
  if (!sel) return;
  let types = [];
  try {
    const r = await window.m2log.listHighlights();
    if (r && r.ok && Array.isArray(r.types)) types = r.types;
  } catch (e) {
    /* ignore */
  }
  anaHlTypes = types.slice();
  // No "Auto" entry: the profile is auto-guessed from the LOG name (see
  // anaResolveRules). The dropdown shows the guessed profile and lets the user
  // override the current file, or turn highlighting Off.
  const opts = [
    ...types.map((ty) => ({ v: ty, label: ty })),
    { v: 'none', label: t('ana.hl.none', '關閉'), i18n: 'ana.hl.none' },
  ];
  sel.innerHTML = '';
  opts.forEach((o) => {
    const el = document.createElement('option');
    el.value = o.v;
    el.textContent = o.label;
    if (o.i18n) el.setAttribute('data-i18n', o.i18n);
    sel.appendChild(el);
  });
  sel.value = ana.hl === 'auto' ? anaGuessType(ana.name || '') || 'none' : ana.hl;
}

const ANA_RANK = { info: 1, hwinfo: 1, fru: 1, socsn: 1, nvram: 1, gpio: 1, perf: 1, intr: 1.5, warn: 2, error: 3 };

function anaHighlightLine(line, rules) {
  // Match against the RAW text (not HTML-escaped) so patterns can use real
  // characters like ->, <, > and &. Each emitted segment is escaped on output,
  // so the rendered HTML stays safe.
  const raw = String(line);
  const compiled = rules && rules.compiled;
  if (!compiled || !compiled.length) return { html: escapeHtml(raw), level: '', tint: '' };
  const intervals = [];
  compiled.forEach((c) => {
    c.re.lastIndex = 0;
    let m;
    while ((m = c.re.exec(raw)) !== null) {
      if (m[0] === '') {
        c.re.lastIndex += 1;
        continue;
      }
      intervals.push({ s: m.index, e: m.index + m[0].length, level: c.level, r: ANA_RANK[c.level] || 1 });
    }
  });
  if (!intervals.length) return { html: escapeHtml(raw), level: '', tint: '' };
  intervals.sort((a, b) => a.s - b.s || b.r - a.r);
  let out = '';
  let pos = 0;
  let maxRank = 0; // highest level among all matches -> marker (chips / ruler / nav)
  let maxLevel = '';
  let tintRank = 0; // highest level among *enabled* matches -> inline colour + line tint
  let tintLevel = '';
  intervals.forEach((iv) => {
    if (iv.s < pos) return;
    if (iv.s > pos) out += escapeHtml(raw.slice(pos, iv.s));
    const enabled = anaNav.levels[iv.level] !== false;
    const seg = escapeHtml(raw.slice(iv.s, iv.e));
    if (enabled) out += `<span class="hl-${iv.level}">${seg}</span>`;
    else out += seg;
    pos = iv.e;
    if (iv.r > maxRank) {
      maxRank = iv.r;
      maxLevel = iv.level;
    }
    if (enabled && iv.r > tintRank) {
      tintRank = iv.r;
      tintLevel = iv.level;
    }
  });
  out += escapeHtml(raw.slice(pos));
  return { html: out, level: maxLevel, tint: tintLevel };
}

// ---- Virtualized rendering ------------------------------------------------
// Only the lines near the viewport are ever in the DOM. A huge log (80k+ lines)
// otherwise creates ~250k nodes: slow to open AND laggy to scroll/select (the
// browser must lay out everything a selection spans). Lines are fixed-height
// (nowrap; long lines scroll horizontally), so the total scroll height is
// total*lineH and the visible window is derived from scrollTop. Two spacer divs
// hold the off-screen height above and below the rendered window.
// Folding adds a "row" layer on top of the raw lines: the viewer virtualizes
// over `rows` (each row is either a real line or a collapsed-run placeholder),
// not over the lines directly. `lineRow[i]` is the row that renders line i (-1
// when it is hidden inside a collapsed run); `lineDisplayRow[i]` is the row that
// visually represents line i on screen (its own row, or the fold placeholder of
// its run) and is used for ruler/scroll positioning. `hlSet` holds the indices
// of highlighted (never-folded) lines.
const anaVirt = {
  lines: null,
  rules: null,
  total: 0,
  lineH: 19,
  start: -1,
  end: -1,
  scheduled: false,
  rows: null,
  runs: null,
  rowCount: 0,
  lineRow: null,
  lineDisplayRow: null,
  hlSet: null,
};

// Build the row model from the current lines + highlight markers + fold state.
// When folding is off (or there are no lines) every line is its own row. When
// on, consecutive non-highlighted lines collapse into a single fold row; runs
// listed in anaFold.open also emit their line rows after the fold header.
function anaBuildRows() {
  const total = anaVirt.total;
  const rows = [];
  const runs = [];
  const lineRow = total ? new Int32Array(total).fill(-1) : new Int32Array(0);
  const dispRow = total ? new Int32Array(total) : new Int32Array(0);
  const hl = anaVirt.hlSet;
  if (!ana.fold || !hl || !total) {
    for (let i = 0; i < total; i += 1) {
      lineRow[i] = rows.length;
      dispRow[i] = rows.length;
      rows.push({ line: i });
    }
  } else {
    let i = 0;
    while (i < total) {
      if (hl.has(i)) {
        lineRow[i] = rows.length;
        dispRow[i] = rows.length;
        rows.push({ line: i });
        i += 1;
      } else {
        const a = i;
        while (i < total && !hl.has(i)) i += 1;
        const count = i - a;
        runs.push({ start: a, end: i - 1 });
        const open = anaFold.open.has(a);
        if (open) {
          // Expanded: a collapse bar above and below the revealed lines so the
          // run can be re-folded from either end.
          rows.push({ fold: true, start: a, count, open: true });
          for (let j = a; j < i; j += 1) {
            lineRow[j] = rows.length;
            dispRow[j] = rows.length;
            rows.push({ line: j });
          }
          rows.push({ fold: true, start: a, count, open: true, foot: true });
        } else {
          const foldRowIdx = rows.length;
          rows.push({ fold: true, start: a, count, open: false });
          for (let j = a; j < i; j += 1) {
            dispRow[j] = foldRowIdx; // collapsed: represented by the fold bar
          }
        }
      }
    }
  }
  anaVirt.rows = rows;
  anaVirt.rowCount = rows.length;
  anaVirt.runs = runs;
  anaVirt.lineRow = lineRow;
  anaVirt.lineDisplayRow = dispRow;
}

// Expand the collapsed run that contains `idx` (if any) so the line becomes
// visible. Returns true when a rebuild happened.
function anaFoldOpenForLine(idx) {
  if (!ana.fold || !anaVirt.hlSet || idx == null || idx < 0 || idx >= anaVirt.total) return false;
  if (anaVirt.hlSet.has(idx)) return false; // highlighted lines are never folded
  if (anaVirt.lineRow && anaVirt.lineRow[idx] >= 0) return false; // already visible
  let a = idx;
  while (a > 0 && !anaVirt.hlSet.has(a - 1)) a -= 1;
  anaFold.open.add(a);
  anaBuildRows();
  return true;
}

// Rebuild rows + DOM after a fold change, keeping `anchorLine` in view.
function anaFoldApply(anchorLine) {
  anaBuildRows();
  anaVirt.start = -1;
  anaVirt.end = -1;
  const scroller = document.getElementById('anaScroll');
  const lineH = anaVirt.lineH || 19;
  if (scroller && anchorLine != null && anchorLine >= 0 && anaVirt.lineDisplayRow) {
    const dr = anaVirt.lineDisplayRow[anchorLine];
    if (dr >= 0) {
      scroller.scrollTop = Math.max(0, dr * lineH - scroller.clientHeight / 2 + lineH / 2);
    }
  }
  anaVirtRender();
  anaBuildRuler(anaNav.markers, anaVirt.total);
  anaUpdateRuler();
  anaUpdateFoldEdges();
}

// Line index -> its non-highlighted run {start, end} (binary search over the
// run table cached by anaBuildRows), or null when the line is highlighted.
function anaRunAtLine(idx) {
  const runs = anaVirt.runs;
  if (!runs || !runs.length || idx == null || idx < 0) return null;
  let lo = 0;
  let hi = runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = runs[mid];
    if (idx < r.start) hi = mid - 1;
    else if (idx > r.end) lo = mid + 1;
    else return r;
  }
  return null;
}

// The expanded (currently open) run that contains line `idx`, or null.
function anaOpenRunAt(idx) {
  if (!ana.fold) return null;
  const r = anaRunAtLine(idx);
  return r && anaFold.open.has(r.start) ? r : null;
}

// The expanded run filling the viewport now: prefer the line at the vertical
// centre (where the buttons sit), fall back to the first visible line.
function anaCurrentOpenRun() {
  if (!ana.fold || !anaVirt.rows || !anaVirt.rowCount) return null;
  const scroller = document.getElementById('anaScroll');
  if (!scroller) return null;
  const lineH = anaVirt.lineH || 19;
  const rows = anaVirt.rows;
  const lineAtPx = (px) => {
    const r = Math.max(0, Math.min(rows.length - 1, Math.floor(px / lineH)));
    const row = rows[r];
    return row.fold ? row.start : row.line;
  };
  const mid = lineAtPx(scroller.scrollTop + scroller.clientHeight / 2);
  return anaOpenRunAt(mid) || anaOpenRunAt(anaFirstVisibleLine());
}

// Show the floating top/bottom edge-jump buttons while an expanded run is in
// view and an edge is off-screen; disable the button whose edge is already
// visible. Remembers the target run for the click handlers.
function anaUpdateFoldEdges() {
  const box = document.getElementById('anaFoldEdges');
  if (!box) return;
  const topBtn = document.getElementById('btnAnaFoldTop');
  const bottomBtn = document.getElementById('btnAnaFoldBottom');
  const run = anaCurrentOpenRun();
  let upUseful = false;
  let downUseful = false;
  if (run) {
    const scroller = document.getElementById('anaScroll');
    const lineH = anaVirt.lineH || 19;
    const lr = anaVirt.lineRow;
    const topRow = lr && run.start < lr.length ? lr[run.start] : -1;
    const botRow = lr && run.end < lr.length ? lr[run.end] : -1;
    const firstVis = Math.floor(scroller.scrollTop / lineH);
    const lastVis = Math.ceil((scroller.scrollTop + scroller.clientHeight) / lineH);
    upUseful = topRow >= 0 && topRow < firstVis;
    downUseful = botRow >= 0 && botRow > lastVis;
  }
  const show = upUseful || downUseful;
  anaFoldEdge.start = show ? run.start : -1;
  anaFoldEdge.end = show ? run.end : -1;
  if (topBtn) topBtn.disabled = !upUseful;
  if (bottomBtn) bottomBtn.disabled = !downUseful;
  box.classList.toggle('show', show);
}

// Breathe the lines of a just-expanded run (a gentle accent pulse) so the user
// can see which section opened. Best-effort: only the lines currently in the
// rendered window animate; off-screen lines are ignored.
function anaFoldFlashRun(start) {
  if (start == null || start < 0 || !anaVirt.hlSet) return;
  let end = start;
  while (end < anaVirt.total && !anaVirt.hlSet.has(end)) end += 1;
  for (let i = start; i < end; i += 1) {
    const el = anaLineEl(i);
    if (!el) continue;
    el.classList.remove('foldflash');
    void el.offsetWidth; // restart the animation if the class lingered
    el.classList.add('foldflash');
  }
  window.setTimeout(() => {
    for (let i = start; i < end; i += 1) {
      const el = anaLineEl(i);
      if (el) el.classList.remove('foldflash');
    }
  }, 1100);
}

// Breathe the collapsed fold bar of a just-folded run, so it's clear where the
// hidden lines went.
function anaFoldFlashBar(start) {
  const el = document.getElementById('anaViewContent');
  if (!el) return;
  const bar = el.querySelector('.ana-foldrow[data-fold="' + start + '"]');
  if (!bar) return;
  bar.classList.remove('foldflash');
  void bar.offsetWidth; // restart the animation if the class lingered
  bar.classList.add('foldflash');
  window.setTimeout(() => bar.classList.remove('foldflash'), 1100);
}

// Toolbar toggle: fold/unfold the non-highlighted runs.
function anaToggleFold() {
  ana.fold = !ana.fold;
  localStorage.setItem(ANA_FOLD_KEY, ana.fold ? '1' : '0');
  const btn = document.getElementById('btnAnaFold');
  if (btn) btn.classList.toggle('on', ana.fold);
  if (ana.fold) anaFold.open.clear();
  if (anaVirt.lines) anaFoldApply(anaFirstVisibleLine());
}

// Measure one rendered line's height (depends on the current font size).
function anaMeasureLineH(el) {
  const probe = document.createElement('div');
  probe.className = 'ana-line';
  probe.style.visibility = 'hidden';
  probe.innerHTML = '<span class="ana-ln">1</span><span class="ana-lc">M</span>';
  el.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  el.removeChild(probe);
  return h || 19;
}

// The DOM element for line `idx`, or null if it is outside the rendered window
// or hidden inside a collapsed fold. Children layout: [topSpacer, ...windowRows,
// bottomSpacer]; line `idx` lives at row `lineRow[idx]`.
function anaLineEl(idx) {
  if (idx == null || idx < 0) return null;
  const r = anaVirt.lineRow && idx < anaVirt.lineRow.length ? anaVirt.lineRow[idx] : idx;
  if (r < 0 || r < anaVirt.start || r >= anaVirt.end) return null;
  const el = document.getElementById('anaViewContent');
  return el ? el.children[1 + (r - anaVirt.start)] || null : null;
}

// Render the window of rows visible at the current scroll position.
function anaVirtRender() {
  anaVirt.scheduled = false;
  const el = document.getElementById('anaViewContent');
  const scroller = document.getElementById('anaScroll');
  if (!el || !scroller || !anaVirt.lines || !anaVirt.rows) return;
  const lineH = anaVirt.lineH || 19;
  const total = anaVirt.rowCount;
  const buffer = 40;
  const firstVis = Math.floor(scroller.scrollTop / lineH);
  const lastVis = Math.ceil((scroller.scrollTop + scroller.clientHeight) / lineH);
  // Keep the current window if it still covers the viewport with margin to
  // spare. Avoids rebuilding the DOM on every small scroll (which would also
  // clobber an in-progress text selection).
  if (
    anaVirt.start >= 0 &&
    anaVirt.start <= Math.max(0, firstVis - 8) &&
    anaVirt.end >= Math.min(total, lastVis + 8)
  ) {
    return;
  }
  let start = firstVis - buffer;
  if (start < 0) start = 0;
  let end = lastVis + buffer;
  if (end > total) end = total;
  if (start === anaVirt.start && end === anaVirt.end) return;
  anaVirt.start = start;
  anaVirt.end = end;

  const rows = anaVirt.rows;
  const lines = anaVirt.lines;
  const rules = anaVirt.rules;
  const cur = anaBm.current;
  const bm = anaBm.lines;
  let html = '<div class="ana-vpad" style="height:' + start * lineH + 'px"></div>';
  for (let r = start; r < end; r += 1) {
    const row = rows[r];
    if (row.fold) {
      const title = row.open
        ? t('ana.fold', '收折')
        : t('ana.fold.lines', '{n} hidden lines').replace('{n}', row.count);
      const label = row.open ? escapeHtml(t('ana.fold', '收折')) : String(row.count);
      const cls = 'ana-foldrow' + (row.open ? ' open' : '') + (row.foot ? ' foot' : '');
      // When expanded, the top bar gets a "jump to the bottom of this section"
      // arrow and the bottom bar a "jump to the top" arrow.
      let jump = '';
      if (row.open) {
        const arrow = row.foot
          ? '<polyline points="18 15 12 9 6 15"/>'
          : '<polyline points="6 9 12 15 18 9"/>';
        const jt = row.foot
          ? t('ana.fold.toTop', '跳到此段最上緣')
          : t('ana.fold.toBottom', '跳到此段最下緣');
        jump =
          '<button class="ana-fold-jump" type="button" data-jump="' + (row.foot ? 'up' : 'down') + '" title="' + jt + '">' +
          '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + arrow + '</svg></button>';
      }
      html +=
        '<div class="' + cls + '" data-fold="' + row.start + '" data-count="' + row.count + '" style="height:' + lineH + 'px" title="' + title + '">' +
        '<span class="ana-fold-bar"><span class="ana-fold-ic"></span>' +
        '<span class="ana-fold-n">' + label + '</span></span>' + jump + '</div>';
      continue;
    }
    const i = row.line;
    const res = anaHighlightLine(lines[i], rules);
    const lvl = res.tint ? ' lvl-' + res.tint : '';
    const b = bm.has(i) ? ' bookmarked' : '';
    const c = i === cur ? ' current' : '';
    html +=
      '<div class="ana-line' + lvl + b + c + '" data-i="' + i + '">' +
      '<span class="ana-ln">' + (i + 1) + '</span><span class="ana-lc">' + res.html + '</span></div>';
  }
  html += '<div class="ana-vpad" style="height:' + (total - end) * lineH + 'px"></div>';
  el.innerHTML = html;

  // Re-apply find highlights for the matches now in view.
  if (anaFind.q && anaFind.matches.length) anaFindApplyHighlights();
}

// Re-measure line height and re-render the window (e.g. after a font-size change).
function anaVirtRefresh() {
  const el = document.getElementById('anaViewContent');
  if (!el || !anaVirt.lines) return;
  anaVirt.lineH = anaMeasureLineH(el) || anaVirt.lineH || 19;
  anaVirt.start = -1;
  anaVirt.end = -1;
  anaVirtRender();
}

function anaRenderContent(text, rules) {
  const el = $('#anaViewContent');
  if (!el) return;
  // Merge per-file manual highlights into the active rules so they colour text
  // and contribute nav chips alongside the built-in levels.
  const baseCompiled = rules && rules.compiled ? rules.compiled : [];
  const compiled = { compiled: baseCompiled.concat(anaMarkCompiled()) };
  const lines = text === ana.text ? anaGetLines() : String(text).split(/\r\n|\r|\n/);
  const total = lines.length;

  // Scan every line once (cheap: ~45ms for 82k) to collect error/warn markers
  // for the overview ruler and level navigation. The line HTML is built lazily,
  // only for the visible window, by anaVirtRender.
  const markers = [];
  for (let i = 0; i < total; i += 1) {
    const res = anaHighlightLine(lines[i], compiled);
    if (res.level) markers.push({ i, level: res.level });
  }

  anaVirt.lines = lines;
  anaVirt.rules = compiled;
  anaVirt.total = total;
  anaVirt.start = -1;
  anaVirt.end = -1;
  // Highlighted lines never fold; collapse all non-highlighted runs by default.
  // Only currently-enabled levels count as "highlighted", so toggling a level
  // off folds its lines too.
  anaVirt.hlSet = new Set(
    markers.filter((m) => anaNav.levels[m.level] !== false).map((m) => m.i)
  );
  anaFold.open.clear();

  el.classList.add('nowrap'); // virtualization needs a fixed line height
  el.innerHTML = '';
  anaVirt.lineH = anaMeasureLineH(el) || 19;
  const scroller = document.getElementById('anaScroll');
  if (scroller) scroller.scrollTop = 0;

  anaNav.markers = markers;
  anaBuildRows();
  anaVirtRender();

  anaBuildRuler(markers, total);
  anaBmUpdateCounter();
  anaRenderLevels(markers);
  anaNavRebuild();
  // Rebuild search highlights (e.g. after a highlight-type change) without moving.
  if (anaFind.q) anaFindRun(anaFind.q, { keepPos: true, noScroll: true });
  anaUpdateFoldEdges();
}


// Build the right-edge overview ruler: one colored tick per error/warn line.
function anaBuildRuler(markers, total) {
  const ticks = document.getElementById('anaRulerTicks');
  if (ticks) {
    let html = '';
    // Position ticks by their on-screen row (so they line up with the scrollbar
    // even when folding changes how many rows precede a line).
    const rc = anaVirt.rowCount || total;
    const dispRow = anaVirt.lineDisplayRow;
    const fracOf = (i) => {
      if (!rc) return 0;
      const r = dispRow && i < dispRow.length ? dispRow[i] : i;
      return ((r >= 0 ? r : i) / rc) * 100;
    };
    if (total > 0) {
      (markers || []).forEach((m) => {
        // Hide ticks for deselected levels so the minimap matches the content.
        if (anaNav.levels[m.level] === false) return;
        const top = fracOf(m.i);
        const c = anaColorForLevel(m.level);
        html += `<div class="ana-ruler-tick" style="top:${top.toFixed(3)}%;background:${c}" data-line="${m.i}" title="${t('ana.line')} ${m.i + 1}"></div>`;
      });
      anaBm.lines.forEach((i) => {
        const top = fracOf(i);
        html += `<div class="ana-ruler-tick bm" style="top:${top.toFixed(3)}%" data-line="${i}" title="${t('ana.bookmark', '書籤')} ${i + 1}"></div>`;
      });
    }
    ticks.innerHTML = html;
  }
  anaUpdateRuler();
}

// Show/position the minimap and the current-viewport indicator box.
function anaUpdateRuler() {
  const ruler = document.getElementById('anaRuler');
  const view = document.getElementById('anaRulerView');
  const scroller = document.getElementById('anaScroll');
  if (!ruler || !view || !scroller) return;
  const sh = scroller.scrollHeight;
  const ch = scroller.clientHeight;
  const overflow = sh > ch + 1;
  const hasTicks = !!ruler.querySelector('.ana-ruler-tick');
  if (!overflow && !hasTicks) {
    ruler.hidden = true;
    return;
  }
  ruler.hidden = false;
  if (overflow) {
    view.style.display = 'block';
    view.style.top = ((scroller.scrollTop / sh) * 100).toFixed(3) + '%';
    view.style.height = Math.min(100, (ch / sh) * 100).toFixed(3) + '%';
  } else {
    view.style.display = 'none';
  }
}

// Scroll the viewer so the given line index is centered, with a brief flash.
function anaScrollToLine(idx, opts) {
  const scroller = document.getElementById('anaScroll');
  if (!scroller || idx == null || idx < 0) return;
  // If the target sits inside a collapsed fold, expand it first so it has a row.
  if (anaFoldOpenForLine(idx)) {
    anaBuildRuler(anaNav.markers, anaVirt.total);
  }
  const lineH = anaVirt.lineH || 19;
  const r = anaVirt.lineDisplayRow && idx < anaVirt.lineDisplayRow.length ? anaVirt.lineDisplayRow[idx] : idx;
  const rowIdx = r >= 0 ? r : idx;
  scroller.scrollTop = Math.max(0, rowIdx * lineH - scroller.clientHeight / 2 + lineH / 2);
  anaVirtRender(); // render the window at the new position so the row exists
  anaUpdateRuler();
  anaUpdateFoldEdges();
  if (opts && opts.noFlash) return;
  const row = anaLineEl(idx);
  if (!row) return;
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
  window.setTimeout(() => {
    const r = anaLineEl(idx);
    if (r) r.classList.remove('flash');
  }, 1300);
}

// Rebuild navigation targets from current markers, filtered by active levels.
function anaNavRebuild() {
  anaNav.targets = anaNav.markers
    .filter((m) => anaNav.levels[m.level] !== false)
    .map((m) => m.i)
    .sort((a, b) => a - b);
  anaNav.pos = -1;
  anaNavUpdateCounter();
}

function anaNavUpdateCounter() {
  const total = anaNav.targets.length;
  const cur = anaNav.pos >= 0 ? anaNav.pos + 1 : 0;
  const el = document.getElementById('anaNavCount');
  if (el) el.textContent = total ? `${cur}/${total}` : '0';
  const prev = document.getElementById('btnAnaPrev');
  const next = document.getElementById('btnAnaNext');
  if (prev) prev.disabled = total === 0;
  if (next) next.disabled = total === 0;
}

// Jump to the next (dir=1) or previous (dir=-1) matching line, anchored on the
// selected/clicked line (falls back to the first visible line); wraps around.
// Each jump moves the current line so repeated presses keep stepping in `dir`.
function anaNavGo(dir) {
  const targets = anaNav.targets;
  if (!targets.length) return;
  const ref = anaRefLine();
  let target = null;
  if (dir > 0) {
    for (let k = 0; k < targets.length; k += 1) {
      if (targets[k] > ref) {
        target = targets[k];
        break;
      }
    }
    if (target == null) target = targets[0];
  } else {
    for (let k = targets.length - 1; k >= 0; k -= 1) {
      if (targets[k] < ref) {
        target = targets[k];
        break;
      }
    }
    if (target == null) target = targets[targets.length - 1];
  }
  anaNav.line = target;
  const p = targets.indexOf(target);
  if (p >= 0) anaNav.pos = p;
  anaSetCurrentLine(target);
  anaScrollToLine(target);
  anaNavUpdateCounter();
}

/* ---------- Highlight levels (dynamic, expandable nav chips) ---------- */
// Known level colors; unknown levels (e.g. BOOTMODE) get a palette color.
const ANA_LEVEL_COLORS = { error: '#ff6b81', warn: '#fbbf24', info: '#60a5fa' };
// Palette for custom levels. Deliberately avoids the hue bands of the three
// reserved colours — error (red/pink ~350°), warn (amber ~45°) and info
// (blue ~215°) — so a custom chip never looks like error/warn/info. Ordered to
// maximise hue distance between neighbours; only repeats after 10 levels.
const ANA_LEVEL_PALETTE = [
  '#34d399', // emerald   ~157°
  '#a78bfa', // violet    ~255°
  '#22d3ee', // cyan      ~187°
  '#e879f9', // fuchsia   ~291°
  '#a3e635', // lime      ~ 82°
  '#c084fc', // purple    ~270°
  '#4ade80', // green     ~142°
  '#2dd4bf', // teal      ~172°
  '#d8b4fe', // lavender  ~270°
  '#5eead4', // aqua      ~166°
];
const ANA_BUILTIN_LEVELS = new Set(['error', 'warn', 'info']);
const anaLevelColorMap = {};
let anaLevelPaletteIdx = 0;

function anaColorForLevel(level) {
  if (ANA_LEVEL_COLORS[level]) return ANA_LEVEL_COLORS[level];
  if (!anaLevelColorMap[level]) {
    anaLevelColorMap[level] = ANA_LEVEL_PALETTE[anaLevelPaletteIdx % ANA_LEVEL_PALETTE.length];
    anaLevelPaletteIdx += 1;
  }
  return anaLevelColorMap[level];
}

function anaRankOf(level) {
  return ANA_RANK[level] || 0;
}

function anaLevelLabel(level) {
  if (level === 'error') return t('ana.error', '錯誤');
  if (level === 'warn') return t('ana.warning', '警告');
  if (level === 'info') return t('ana.info', '資訊');
  if (level === 'version') return t('ana.version', '版號');
  if (level === 'boot') return t('ana.boot', '開機點');
  if (level === 'bootmode') return t('ana.bootmode', '開機模式');
  if (level === 'capsule') return t('ana.capsule', 'Capsule');
  if (level === 'screennotif') return t('ana.screennotif', '螢幕通知');
  if (level === 'runtimemode') return t('ana.runtimemode', 'UEFI Runtime Mode');
  if (level === 'membucket') return t('ana.membucket', '記憶體配置');
  if (level === 'pwrseq') return t('ana.pwrseq', '電源序列');
  if (level === 'socss') return t('ana.socss', 'SoC子系統');
  if (level === 'debugssh') return t('ana.debugssh', 'DebugSSH');
  if (level === 'kbdhid') return t('ana.kbdhid', 'Keyboard HID');
  if (level === 'intr') return t('ana.intr', '中斷');
  if (level === 'uefissh') return t('ana.uefissh', 'UEFI_SSH');
  if (level === 'pd') return t('ana.pd', 'PD');
  if (level === 'hwinfo') return t('ana.hwinfo', '硬體資訊');
  if (level === 'fru') return t('ana.fru', 'FRU');
  if (level === 'socsn') return t('ana.socsn2', 'SOC SN');
  if (level === 'nvram') return t('ana.nvram', 'NVRAM');
  if (level === 'gpio') return t('ana.gpio', 'GPIO');
  if (level === 'perf') return t('ana.perf', 'UEFI Perf');
  if (anaIsMarkLevel(level)) return anaMarkLabel(level);
  return String(level || '').toUpperCase();
}

/* ---------- Manual highlights (right-click → Highlight), per file ---------- */
function anaIsMarkLevel(lv) {
  return anaMark.terms.some((tm) => tm.level === lv);
}

function anaMarkLabel(lv) {
  const tm = anaMark.terms.find((t2) => t2.level === lv);
  if (!tm) return String(lv || '').toUpperCase();
  return tm.text.length > 22 ? tm.text.slice(0, 21) + '…' : tm.text;
}

// Compile each manual term into a render rule. Terms are matched against the
// raw line text (output is escaped per-segment), so build the regex from the
// raw term.
function anaMarkCompiled() {
  const out = [];
  anaMark.terms.forEach((tm) => {
    if (!tm.text) return;
    try {
      out.push({ re: new RegExp(escapeRegExp(tm.text), 'gi'), level: tm.level });
    } catch (e) {
      /* ignore */
    }
  });
  return out;
}

async function anaRerender() {
  if (ana.text == null) return;
  const rules = await anaResolveRules(ana.name);
  anaRenderContent(ana.text, rules);
}

function anaMarkAdd(text) {
  const term = String(text || '').trim();
  if (!term) return;
  if (/[\r\n]/.test(term)) {
    toast(t('ana.mark.multiline', '只能標記單行文字'), 'info');
    return;
  }
  if (anaMark.terms.some((tm) => tm.text.toLowerCase() === term.toLowerCase())) {
    toast(t('ana.mark.dup', '已標記此文字'), 'info');
    return;
  }
  anaMark.terms.push({ text: term, level: 'mark' + anaMark.seq });
  anaMark.seq += 1;
  anaRerender();
  toast(`${t('ana.mark.added', '已加入標記')} · ${term}`, 'success');
}

function anaMarkRemove(level) {
  const i = anaMark.terms.findIndex((tm) => tm.level === level);
  if (i < 0) return;
  anaMark.terms.splice(i, 1);
  delete anaNav.levels[level];
  anaRerender();
}

function anaMarkClear() {
  if (!anaMark.terms.length) return;
  anaMark.terms.forEach((tm) => delete anaNav.levels[tm.level]);
  anaMark.terms.length = 0;
  anaRerender();
}

// Inject color CSS for non-builtin levels + a faint whole-line tint per level.
function anaApplyLevelStyles(levels) {
  let css = '';
  levels.forEach((lv) => {
    const c = anaColorForLevel(lv);
    if (!ANA_BUILTIN_LEVELS.has(lv)) css += `.hl-${lv}{color:${c};font-weight:600;}`;
    if (lv !== 'error' && lv !== 'warn') {
      css += `.ana-line.lvl-${lv}{background:color-mix(in srgb, ${c} 12%, transparent);}`;
    }
  });
  let styleEl = document.getElementById('anaLevelStyles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'anaLevelStyles';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

// Render one chip per level present. Main area = select (toggle into combined
// count + up/down); trailing arrow = jump to that level individually.
function anaRenderLevels(markers) {
  const host = document.getElementById('anaLevels');
  const counts = {};
  (markers || []).forEach((m) => {
    counts[m.level] = (counts[m.level] || 0) + 1;
  });
  const levels = Object.keys(counts).sort((a, b) => anaRankOf(b) - anaRankOf(a) || a.localeCompare(b));
  levels.forEach((lv) => {
    if (anaNav.levels[lv] === undefined) anaNav.levels[lv] = true;
  });
  anaApplyLevelStyles(levels);
  if (!host) return;
  host.innerHTML = levels
    .map((lv) => {
      const c = anaColorForLevel(lv);
      const sel = anaNav.levels[lv] !== false;
      const name = escapeHtml(anaLevelLabel(lv));
      const isMark = anaIsMarkLevel(lv);
      return (
        `<div class="ana-level${sel ? ' sel' : ''}${isMark ? ' ana-level-mark' : ''}" data-level="${lv}" style="--lc:${c}">` +
        `<button class="ana-level-main" type="button" data-i18n-title="ana.level.toggle" title="${t('ana.level.toggle', '選取：是否納入計數與上下導覽')}">` +
        '<span class="ana-level-dot"></span>' +
        `<span class="ana-level-name">${name}</span>` +
        `<span class="ana-level-count">${counts[lv]}</span>` +
        '</button>' +
        `<button class="ana-level-jump" type="button" data-i18n-title="ana.level.jump" title="${t('ana.level.jump', '跳到下一個（Shift+點擊：上一個）')}">` +
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
        '</button>' +
        (isMark
          ? `<button class="ana-level-remove" type="button" data-i18n-title="ana.mark.remove" title="${t('ana.mark.remove', '移除標記')}">` +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>'
          : '') +
        '</div>'
      );
    })
    .join('');
}

// Select: toggle whether a level is highlighted in the log + counts toward the
// combined count and up/down navigation. Deselecting also hides that level's
// inline colour and line tint in the content (chip count + minimap ticks stay).
function anaLevelToggle(level) {
  const selected = anaNav.levels[level] !== false;
  anaNav.levels[level] = !selected;
  const chip = document.querySelector(`#anaLevels .ana-level[data-level="${level}"]`);
  if (chip) chip.classList.toggle('sel', !selected);
  anaNavRebuild();
  // Re-render so the inline highlight follows the toggle, keeping scroll position.
  const scroller = document.getElementById('anaScroll');
  const top = scroller ? scroller.scrollTop : 0;
  anaRerender().then(() => {
    if (scroller) scroller.scrollTop = top;
  });
}

// Press: jump to the next (dir=1) or previous (dir=-1) line of this level alone.
function anaLevelGo(level, dir) {
  const targets = anaNav.markers
    .filter((m) => m.level === level)
    .map((m) => m.i)
    .sort((a, b) => a - b);
  if (!targets.length) return;
  const ref = anaRefLine();
  let target = null;
  if (dir > 0) {
    for (let k = 0; k < targets.length; k += 1) {
      if (targets[k] > ref) {
        target = targets[k];
        break;
      }
    }
    if (target == null) target = targets[0];
  } else {
    for (let k = targets.length - 1; k >= 0; k -= 1) {
      if (targets[k] < ref) {
        target = targets[k];
        break;
      }
    }
    if (target == null) target = targets[targets.length - 1];
  }
  anaNav.line = target;
  const p = anaNav.targets.indexOf(target);
  if (p >= 0) anaNav.pos = p;
  anaSetCurrentLine(target);
  anaScrollToLine(target);
  anaNavUpdateCounter();
}

/* ---------- Bookmarks (Ctrl+F2 toggle · F2 next · Shift+F2 prev) ---------- */
// Index of the first line currently visible at the top of the viewport.
function anaFirstVisibleLine() {
  const scroller = document.getElementById('anaScroll');
  if (!scroller || !anaVirt.total) return 0;
  const lineH = anaVirt.lineH || 19;
  const rowIdx = Math.floor(scroller.scrollTop / lineH);
  const rows = anaVirt.rows;
  if (rows && rows.length) {
    const clamped = Math.max(0, Math.min(rows.length - 1, rowIdx));
    // Walk forward to the first row that maps to a real line (skip fold headers).
    for (let r = clamped; r < rows.length; r += 1) {
      if (rows[r].fold) {
        if (typeof rows[r].start === 'number') return rows[r].start;
      } else {
        return rows[r].line;
      }
    }
    return rows[clamped].fold ? rows[clamped].start : rows[clamped].line;
  }
  return Math.max(0, Math.min(anaVirt.total - 1, rowIdx));
}

// Mark a line as the "current" one (reference for adding/navigating bookmarks).
function anaSetCurrentLine(idx) {
  const prevEl = anaLineEl(anaBm.current);
  if (prevEl) prevEl.classList.remove('current');
  anaBm.current = idx != null && idx >= 0 ? idx : -1;
  const row = anaLineEl(anaBm.current);
  if (row) row.classList.add('current');
}

// Line used when no explicit current line: the clicked line or the first visible.
function anaRefLine() {
  if (anaBm.current >= 0) return anaBm.current;
  return anaFirstVisibleLine();
}

function anaBmUpdateCounter() {
  const el = document.getElementById('anaBmCount');
  if (el) el.textContent = String(anaBm.lines.size);
}

// Toggle a bookmark on the given line and refresh the gutter, ruler and counter.
function anaBmToggle(idx) {
  if (idx == null || idx < 0 || idx >= anaVirt.total) return;
  let added;
  if (anaBm.lines.has(idx)) {
    anaBm.lines.delete(idx);
    added = false;
  } else {
    anaBm.lines.add(idx);
    added = true;
  }
  const row = anaLineEl(idx);
  if (row) row.classList.toggle('bookmarked', added);
  anaBuildRuler(anaNav.markers, anaVirt.total);
  anaBmUpdateCounter();
  const label = added ? t('ana.bm.added', '已加入書籤') : t('ana.bm.removed', '已移除書籤');
  toast(`${label} · ${t('ana.line', '行')} ${idx + 1}`, added ? 'success' : 'info');
}

// Jump to the next (dir=1) or previous (dir=-1) bookmark relative to the current
// line; wraps around. Falls back to the first visible line as the reference.
function anaBmGo(dir) {
  const sorted = Array.from(anaBm.lines).sort((a, b) => a - b);
  if (!sorted.length) {
    toast(t('ana.bm.none', '尚無書籤'), 'info');
    return;
  }
  const ref = anaBm.current >= 0 ? anaBm.current : anaFirstVisibleLine();
  let target = null;
  if (dir > 0) {
    for (let k = 0; k < sorted.length; k += 1) {
      if (sorted[k] > ref) {
        target = sorted[k];
        break;
      }
    }
    if (target == null) target = sorted[0];
  } else {
    for (let k = sorted.length - 1; k >= 0; k -= 1) {
      if (sorted[k] < ref) {
        target = sorted[k];
        break;
      }
    }
    if (target == null) target = sorted[sorted.length - 1];
  }
  anaSetCurrentLine(target);
  anaScrollToLine(target);
}

$('#btnAnaBrowse').addEventListener('click', async () => {
  // Open the picker positioned at the current analysis directory as the base.
  const r = await window.m2log.pickFolder(ana.root);
  if (r && r.ok && r.path) {
    ana.root = r.path;
    localStorage.setItem(ANA_ROOT_KEY, ana.root);
    await anaRenderTree();
  }
});
$('#btnAnaReset').addEventListener('click', async () => {
  // Switch to the Output Root configured in the LOG_OUTPUT view. When that field
  // is empty, fall back to the default LOG_OUTPUT directory.
  const base = (($('#outputBase') && $('#outputBase').value) || '').trim();
  if (base) {
    ana.root = base;
  } else {
    const r = await window.m2log.logRoot();
    if (r && r.ok && r.path) ana.root = r.path;
  }
  localStorage.setItem(ANA_ROOT_KEY, ana.root);
  await anaRenderTree();
});
$('#btnAnaRefresh').addEventListener('click', anaRenderTree);
$('#btnAnaOpen').addEventListener('click', () => {
  if (ana.root) window.m2log.openFolder(ana.root);
});
(() => {
  const inp = document.getElementById('anaFilterInput');
  if (inp) {
    inp.addEventListener('input', () => {
      clearTimeout(anaFilterTimer);
      anaFilterTimer = setTimeout(() => {
        anaFilterSetActive(null);
        anaApplyFilter();
      }, 120);
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        inp.value = '';
        anaApplyFilter();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        anaFilterMove(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        anaFilterOpenActive();
      }
    });
  }
  const clearBtn = document.getElementById('anaFilterClear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (inp) {
        inp.value = '';
        inp.focus();
      }
      anaApplyFilter();
    });
  }
  // Viewer font zoom controls.
  const zin = document.getElementById('btnAnaZoomIn');
  if (zin) zin.addEventListener('click', () => anaSetFont(ana.font + 1));
  const zout = document.getElementById('btnAnaZoomOut');
  if (zout) zout.addEventListener('click', () => anaSetFont(ana.font - 1));
  const fold = document.getElementById('btnAnaFold');
  if (fold) fold.addEventListener('click', anaToggleFold);
  // In-place editor controls.
  const bEdit = document.getElementById('btnAnaEdit');
  if (bEdit) bEdit.addEventListener('click', anaEnterEdit);
  const bSave = document.getElementById('btnAnaSave');
  if (bSave) bSave.addEventListener('click', anaSaveEdit);
  const bCancel = document.getElementById('btnAnaCancel');
  if (bCancel) bCancel.addEventListener('click', anaExitEdit);
  const editArea = document.getElementById('anaEditArea');
  if (editArea) {
    editArea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        anaSaveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        anaExitEdit();
      }
    });
  }
})();
// Ctrl +/-/0 zooms the viewer font while the analysis view is active.
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const av = document.getElementById('view-analysis');
  if (!av || !av.classList.contains('active')) return;
  if (e.key === '=' || e.key === '+') {
    e.preventDefault();
    anaSetFont(ana.font + 1);
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault();
    anaSetFont(ana.font - 1);
  } else if (e.key === '0') {
    e.preventDefault();
    anaSetFont(12.5);
  }
});
// Alt+F opens the current log directory while the analysis view is active.
document.addEventListener('keydown', (e) => {
  if (!e.altKey || (e.key !== 'f' && e.key !== 'F')) return;
  const av = document.getElementById('view-analysis');
  if (!av || !av.classList.contains('active')) return;
  e.preventDefault();
  if (ana.root) window.m2log.openFolder(ana.root);
});
$('#anaHlSelect').addEventListener('change', async (e) => {
  // Manual override for the current file only (auto re-detects on the next open).
  ana.hl = e.target.value || 'auto';
  if (ana.text == null) return;
  const rules = await anaResolveRules(ana.name);
  anaRenderContent(ana.text, rules);
});
$('#btnAnaCopy').addEventListener('click', async () => {
  // Virtualized: only the visible window is in the DOM, so copy from the full
  // lines array rather than the rendered cells.
  const text = (anaGetLines() || []).join('\n');
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast(t('toast.copyOk'), 'success');
  } catch (e) {
    toast(t('toast.copyFail') + e.message, 'error');
  }
});
$('#btnAnaAI').addEventListener('click', async () => {
  if (ana.text == null) {
    toast(t('toast.aiNoLog', '請先開啟一個 LOG，再開始 AI 對話'), 'error');
    return;
  }
  const btn = $('#btnAnaAI');
  btn.disabled = true;
  toast(t('toast.aiOpening', '正在開啟 VS Code AI 對話…'), 'info');
  try {
    const res = await window.m2log.openInVSCodeChat({ name: ana.name, text: ana.text, dir: ana.root });
    if (res && res.ok) {
      toast(t('toast.aiOk', '已在 VS Code AI 對話帶入此 LOG'), 'success');
    } else if (res && res.error === 'INTEGRITY_MISMATCH') {
      toast(
        t(
          'toast.aiAdminMismatch',
          'VS Code 以系統管理員執行，但 M2_LOG 不是。請用 M2_LOG_Admin.cmd 以系統管理員身分啟動 M2_LOG，AI 才能連上 VS Code。'
        ),
        'error'
      );
    } else if (res && res.error === 'VSCODE_NOT_FOUND') {
      toast(t('toast.aiNoVSCode', '找不到 VS Code，請先安裝並確認 code 已加入 PATH。'), 'error');
    } else if (res && res.error === 'NO_LOG') {
      toast(t('toast.aiNoLog', '請先開啟一個 LOG，再開始 AI 對話'), 'error');
    } else {
      toast(t('toast.aiFail', '開啟 VS Code 失敗：') + ((res && res.error) || ''), 'error');
    }
  } catch (e) {
    toast(t('toast.aiFail', '開啟 VS Code 失敗：') + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
});
// Minimap interaction: grab the viewport thumb to drag up/down (scrollbar-style),
// or press/drag anywhere on the track to scrub. A real drag suppresses the tick click.
let anaRulerDragged = false;
$('#anaRuler').addEventListener('click', (e) => {
  if (anaRulerDragged) {
    anaRulerDragged = false;
    return;
  }
  const tick = e.target.closest('.ana-ruler-tick');
  if (!tick) return;
  const idx = parseInt(tick.getAttribute('data-line'), 10);
  if (Number.isNaN(idx)) return;
  anaScrollToLine(idx);
  anaSetCurrentLine(idx);
  const p = anaNav.targets.indexOf(idx);
  if (p >= 0) {
    anaNav.pos = p;
    anaNavUpdateCounter();
  }
});
$('#anaRuler').addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const ruler = document.getElementById('anaRuler');
  const scroller = document.getElementById('anaScroll');
  const view = document.getElementById('anaRulerView');
  if (!ruler || !scroller) return;
  e.preventDefault();
  anaRulerDragged = false;
  const rect = ruler.getBoundingClientRect();
  const onThumb = !!e.target.closest('.ana-ruler-view');
  const onTick = !!e.target.closest('.ana-ruler-tick');
  const startY = e.clientY;
  const grabOffset = onThumb ? e.clientY - view.getBoundingClientRect().top : 0;
  const maxScroll = () => scroller.scrollHeight - scroller.clientHeight;
  // Drag the thumb 1:1 with the cursor, preserving where it was grabbed.
  const dragThumb = (clientY) => {
    const ratio = (clientY - grabOffset - rect.top) / rect.height;
    scroller.scrollTop = Math.max(0, Math.min(maxScroll(), ratio * scroller.scrollHeight));
  };
  // Center the viewport on the cursor (click / scrub on the track).
  const scrub = (clientY) => {
    const ratio = (clientY - rect.top) / rect.height;
    scroller.scrollTop = Math.max(0, Math.min(maxScroll(), ratio * scroller.scrollHeight - scroller.clientHeight / 2));
  };
  if (!onThumb && !onTick) scrub(e.clientY);
  const onMove = (ev) => {
    if (Math.abs(ev.clientY - startY) > 3) anaRulerDragged = true;
    if (onThumb) dragThumb(ev.clientY);
    else scrub(ev.clientY);
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.classList.remove('ana-ruler-dragging');
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.body.classList.add('ana-ruler-dragging');
});
// Coalesce the high-frequency scroll/resize minimap refresh into one update per
// animation frame so dragging the scrollbar on a large log stays smooth.
let anaRulerRaf = 0;
function anaUpdateRulerThrottled() {
  if (anaRulerRaf) return;
  anaRulerRaf = requestAnimationFrame(() => {
    anaRulerRaf = 0;
    anaVirtRender();
    anaUpdateRuler();
    anaUpdateFoldEdges();
  });
}
if (document.getElementById('anaScroll')) {
  document.getElementById('anaScroll').addEventListener('scroll', anaUpdateRulerThrottled, { passive: true });
}
window.addEventListener('resize', anaUpdateRulerThrottled);
// Floating edge-jump buttons: hop to the top / bottom edge of the expanded run
// currently in view (its fold bars may be scrolled off-screen).
if (document.getElementById('btnAnaFoldTop')) {
  document.getElementById('btnAnaFoldTop').addEventListener('click', () => {
    if (anaFoldEdge.start < 0) return;
    anaScrollToLine(anaFoldEdge.start);
    anaSetCurrentLine(anaFoldEdge.start);
  });
}
if (document.getElementById('btnAnaFoldBottom')) {
  document.getElementById('btnAnaFoldBottom').addEventListener('click', () => {
    if (anaFoldEdge.end < 0) return;
    anaScrollToLine(anaFoldEdge.end);
    anaSetCurrentLine(anaFoldEdge.end);
  });
}
$('#btnAnaPrev').addEventListener('click', () => anaNavGo(-1));
$('#btnAnaNext').addEventListener('click', () => anaNavGo(1));
$('#chipBm').addEventListener('click', () => anaBmGo(1));
if (document.getElementById('anaLevels')) {
  document.getElementById('anaLevels').addEventListener('click', (e) => {
    const chip = e.target.closest('.ana-level');
    if (!chip) return;
    const level = chip.getAttribute('data-level');
    if (!level) return;
    if (e.target.closest('.ana-level-remove')) anaMarkRemove(level);
    else if (e.target.closest('.ana-level-jump')) anaLevelGo(level, e.shiftKey ? -1 : 1);
    else anaLevelToggle(level);
  });
}
if (document.getElementById('anaViewContent')) {
  document.getElementById('anaViewContent').addEventListener('click', (e) => {
    // Toggle a collapsed run when its fold box is clicked.
    const foldRow = e.target.closest('.ana-foldrow');
    if (foldRow) {
      const start = parseInt(foldRow.dataset.fold, 10);
      if (!Number.isNaN(start)) {
        // The jump arrow on an expanded bar navigates within the run instead of
        // collapsing it: down → bottom edge, up → top edge.
        const jumpBtn = e.target.closest('.ana-fold-jump');
        if (jumpBtn) {
          const count = parseInt(foldRow.dataset.count, 10) || 1;
          const target = jumpBtn.dataset.jump === 'up' ? start : start + count - 1;
          anaScrollToLine(target);
          anaSetCurrentLine(target);
          return;
        }
        const wasOpen = anaFold.open.has(start);
        if (wasOpen) anaFold.open.delete(start);
        else anaFold.open.add(start);
        anaFoldApply(start);
        // Flash the affected area: the revealed lines when expanding, or the new
        // fold bar when collapsing.
        if (wasOpen) anaFoldFlashBar(start);
        else anaFoldFlashRun(start);
      }
      return;
    }
    // Keep keyboard focus on the scroller (which survives the virtualized
    // window rebuilds) so PgUp/PgDn/Home/End keep working. Skip when the user
    // just made a text selection so we don't disturb it.
    const sc = document.getElementById('anaScroll');
    if (sc && window.getSelection && window.getSelection().isCollapsed) {
      sc.focus({ preventScroll: true });
    }
    const line = e.target.closest('.ana-line');
    if (!line) return;
    const idx = parseInt(line.dataset.i, 10);
    if (!Number.isNaN(idx)) anaSetCurrentLine(idx);
  });
}

/* ---------- Manual-highlight context menu (right-click) ---------- */
let anaCtxSel = '';
let anaCtxLevel = '';

function anaCtxHide() {
  const m = document.getElementById('anaCtx');
  if (m) m.hidden = true;
}

function anaCtxShow(x, y, items) {
  const m = document.getElementById('anaCtx');
  if (!m) return;
  m.innerHTML = items
    .map((it) => {
      if (it.sep) return '<div class="ana-ctx-sep"></div>';
      const dot = it.color ? `<span class="ana-ctx-dot" style="color:${it.color}"></span>` : '';
      return `<div class="ana-ctx-item${it.danger ? ' danger' : ''}" data-act="${it.act}">${dot}<span>${escapeHtml(it.label)}</span></div>`;
    })
    .join('');
  m.hidden = false;
  const rect = m.getBoundingClientRect();
  let left = x;
  let top = y;
  if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
  if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
  m.style.left = Math.max(8, left) + 'px';
  m.style.top = Math.max(8, top) + 'px';
}

if (document.getElementById('anaViewContent')) {
  document.getElementById('anaViewContent').addEventListener('contextmenu', (e) => {
    if (ana.text == null) return;
    const sel = (window.getSelection ? String(window.getSelection()) : '').trim();
    const selMark = sel ? anaMark.terms.find((tm) => tm.text.toLowerCase() === sel.toLowerCase()) : null;
    const items = [];
    if (sel && !selMark) {
      const short = sel.length > 24 ? sel.slice(0, 23) + '…' : sel;
      items.push({ act: 'add', label: `${t('ana.mark.add', '標記')}「${short}」` });
    }
    if (selMark) {
      items.push({ act: 'rm', color: anaColorForLevel(selMark.level), label: `${t('ana.mark.removeSel', '移除標記')}「${sel}」` });
    }
    if (anaMark.terms.length) {
      if (items.length) items.push({ sep: true });
      items.push({ act: 'clear', danger: true, label: t('ana.mark.clear', '清除所有標記') });
    }
    if (!items.length) return;
    e.preventDefault();
    anaCtxSel = sel;
    anaCtxLevel = selMark ? selMark.level : '';
    anaCtxShow(e.clientX, e.clientY, items);
  });
}

if (document.getElementById('anaCtx')) {
  document.getElementById('anaCtx').addEventListener('click', (e) => {
    const item = e.target.closest('.ana-ctx-item');
    if (!item) return;
    const act = item.getAttribute('data-act');
    anaCtxHide();
    if (act === 'add') anaMarkAdd(anaCtxSel);
    else if (act === 'rm') anaMarkRemove(anaCtxLevel);
    else if (act === 'clear') anaMarkClear();
    else if (act === 'tabclose') anaCloseTab(anaTabCtxPath);
    else if (act === 'tabcopy') anaCopyTabPath(anaTabCtxPath);
    else if (act === 'tabcloseothers') anaCloseOtherTabs(anaTabCtxPath);
  });
}
document.addEventListener('mousedown', (e) => {
  const m = document.getElementById('anaCtx');
  if (m && !m.hidden && !e.target.closest('#anaCtx')) anaCtxHide();
});
document.addEventListener('scroll', anaCtxHide, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') anaCtxHide();
});
window.addEventListener('blur', anaCtxHide);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'F1' && e.key !== 'F2' && e.key !== 'F3') return;
  const av = document.getElementById('view-analysis');
  if (!av || !av.classList.contains('active')) return;
  if (e.key === 'F3') {
    // Search: jump between matches (next / Shift = previous)
    e.preventDefault();
    anaFindGo(e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key === 'F1') {
    // Error / warning markers: jump between highlighted lines
    e.preventDefault();
    anaNavGo(e.shiftKey ? -1 : 1);
    return;
  }
  // F2 family: bookmarks
  if (ana.text == null) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const idx = anaRefLine();
    if (idx >= 0) {
      anaSetCurrentLine(idx);
      anaBmToggle(idx);
    }
  } else {
    anaBmGo(e.shiftKey ? -1 : 1);
  }
});

/* ---------- In-viewer search (Ctrl+F) ---------- */
let anaFindDebounce = 0;

function anaFindOpen() {
  const box = document.getElementById('anaFind');
  const input = document.getElementById('anaFindInput');
  if (!box || !input) return;
  box.hidden = false;
  input.focus();
  input.select();
}

function anaFindClose() {
  const box = document.getElementById('anaFind');
  if (box) box.hidden = true;
  anaFind.q = '';
  anaFind.matches = [];
  anaFind.pos = -1;
  anaFindClearHighlights();
  anaFindUpdateCount();
}

function anaFindClearHighlights() {
  if (!anaFindSupported) return;
  try {
    CSS.highlights.delete('ana-find');
    CSS.highlights.delete('ana-find-current');
  } catch (e) {
    /* ignore */
  }
}

function anaFindUpdateCount() {
  const el = document.getElementById('anaFindCount');
  const total = anaFind.matches.length;
  if (el) {
    if (!anaFind.q) {
      el.textContent = '0/0';
      el.classList.remove('empty');
    } else if (!total) {
      el.textContent = t('ana.find.none', '無結果');
      el.classList.add('empty');
    } else {
      el.textContent = `${anaFind.pos + 1}/${total}`;
      el.classList.remove('empty');
    }
  }
  const prev = document.getElementById('btnAnaFindPrev');
  const next = document.getElementById('btnAnaFindNext');
  if (prev) prev.disabled = total === 0;
  if (next) next.disabled = total === 0;
}

// Find all case-insensitive matches of `query` across the current file's lines.
function anaFindCompute(query) {
  const matches = [];
  if (!query || ana.text == null) return matches;
  const needle = query.toLowerCase();
  const nlen = needle.length;
  const lines = anaGetLines();
  const CAP = 5000;
  for (let i = 0; i < lines.length; i += 1) {
    const hay = lines[i].toLowerCase();
    let at = hay.indexOf(needle);
    while (at !== -1) {
      matches.push({ line: i, start: at, end: at + nlen });
      if (matches.length >= CAP) return matches;
      at = hay.indexOf(needle, at + nlen);
    }
  }
  return matches;
}

// Map a [start,end) character span within a line to a DOM Range across its text
// nodes (lines may be split into several nodes by level-highlight spans).
function anaFindRange(lineEl, start, end) {
  const lc = lineEl && lineEl.querySelector('.ana-lc');
  if (!lc) return null;
  const walker = document.createTreeWalker(lc, NodeFilter.SHOW_TEXT, null);
  let offset = 0;
  let startNode = null;
  let startOff = 0;
  let endNode = null;
  let endOff = 0;
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue.length;
    if (startNode === null && start < offset + len) {
      startNode = node;
      startOff = start - offset;
    }
    if (startNode !== null && end <= offset + len) {
      endNode = node;
      endOff = end - offset;
      break;
    }
    offset += len;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(endNode, endOff);
    return range;
  } catch (e) {
    return null;
  }
}

function anaFindApplyHighlights() {
  if (!anaFindSupported) return;
  const all = new Highlight();
  const cur = new Highlight();
  for (let i = 0; i < anaFind.matches.length; i += 1) {
    const m = anaFind.matches[i];
    const lineEl = anaLineEl(m.line);
    if (!lineEl) continue;
    const range = anaFindRange(lineEl, m.start, m.end);
    if (!range) continue;
    if (i === anaFind.pos) cur.add(range);
    else all.add(range);
  }
  CSS.highlights.set('ana-find', all);
  CSS.highlights.set('ana-find-current', cur);
}

function anaFindReveal() {
  const m = anaFind.matches[anaFind.pos];
  if (!m) return;
  anaScrollToLine(m.line, { noFlash: true });
  anaSetCurrentLine(m.line);
}

// Run a search. opts.keepPos preserves the active index across a re-render;
// opts.noScroll suppresses jumping the viewport.
function anaFindRun(query, opts) {
  opts = opts || {};
  anaFind.q = query || '';
  anaFind.matches = anaFindCompute(anaFind.q);
  if (!anaFind.matches.length) {
    anaFind.pos = -1;
    anaFindClearHighlights();
    anaFindUpdateCount();
    return;
  }
  if (opts.keepPos && anaFind.pos >= 0) {
    anaFind.pos = Math.min(anaFind.pos, anaFind.matches.length - 1);
  } else {
    const ref = anaRefLine();
    let pos = anaFind.matches.findIndex((m) => m.line >= ref);
    if (pos < 0) pos = 0;
    anaFind.pos = pos;
  }
  anaFindApplyHighlights();
  anaFindUpdateCount();
  if (!opts.noScroll) anaFindReveal();
}

function anaFindGo(dir) {
  const total = anaFind.matches.length;
  if (!total) return;
  anaFind.pos = (anaFind.pos + dir + total) % total;
  anaFindApplyHighlights();
  anaFindUpdateCount();
  anaFindReveal();
}

(function wireAnaFind() {
  const input = document.getElementById('anaFindInput');
  const prev = document.getElementById('btnAnaFindPrev');
  const next = document.getElementById('btnAnaFindNext');
  const close = document.getElementById('btnAnaFindClose');
  if (input) {
    input.addEventListener('input', () => {
      window.clearTimeout(anaFindDebounce);
      const q = input.value;
      anaFindDebounce = window.setTimeout(() => anaFindRun(q), 110);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.clearTimeout(anaFindDebounce);
        if (anaFind.q !== input.value) anaFindRun(input.value);
        else anaFindGo(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        anaFindClose();
      }
    });
  }
  if (prev) prev.addEventListener('click', () => anaFindGo(-1));
  if (next) next.addEventListener('click', () => anaFindGo(1));
  if (close) close.addEventListener('click', anaFindClose);
})();

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
    const av = document.getElementById('view-analysis');
    if (!av || !av.classList.contains('active')) return;
    e.preventDefault();
    anaFindOpen();
  } else if (e.key === 'Escape') {
    const box = document.getElementById('anaFind');
    if (box && !box.hidden) {
      e.preventDefault();
      anaFindClose();
    }
  }
});

/* ---------- Settings modal ---------- */
function openSettings() {
  $('#setAbbrevLen').value = abbrevLen;
  $('#setTypeLen').value = typeLen;
  populateThemeSelect();
  updateSettingsPreview();
  $('#settingsModal').classList.remove('hidden');
}
function closeSettings() {
  $('#settingsModal').classList.add('hidden');
}
function updateSettingsPreview() {
  const len = clampLen($('#setAbbrevLen').value);
  const name = $('#experimentName').value.trim() || 'Boot Stress Memory Test';
  $('#setPreview').textContent = abbreviate(name, len);
}
$('#btnSettings').addEventListener('click', openSettings);
$('#btnSettingsClose').addEventListener('click', closeSettings);
$('#settingsModal').addEventListener('click', (e) => {
  if (e.target === $('#settingsModal')) closeSettings();
});
$('#setAbbrevLen').addEventListener('input', () => {
  abbrevLen = clampLen($('#setAbbrevLen').value);
  localStorage.setItem(ABBREV_KEY, String(abbrevLen));
  updateSettingsPreview();
  updateFolderPreview();
});
$('#setTypeLen').addEventListener('input', () => {
  typeLen = clampTypeLen($('#setTypeLen').value);
  localStorage.setItem(TYPELEN_KEY, String(typeLen));
});

/* ---------- Theme selector (powered by themes.js) ---------- */
function populateThemeSelect() {
  const sel = $('#setTheme');
  if (!sel || !window.M2Themes) return;
  if (!sel.options.length) {
    window.M2Themes.list().forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  }
  sel.value = window.M2Themes.current();
}
const setThemeEl = $('#setTheme');
if (setThemeEl) {
  setThemeEl.addEventListener('change', () => {
    if (window.M2Themes) window.M2Themes.apply(setThemeEl.value);
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});

/* ---------- Update (check / download / install) ---------- */
let updateInfo = null;
let updateBusy = false;

function openUpdateModal() {
  $('#updateModal').classList.remove('hidden');
}
function closeUpdateModal() {
  if (updateBusy) return; // don't cancel a download in progress
  $('#updateModal').classList.add('hidden');
}

function setUpdateStatus(text, kind) {
  const el = $('#updateStatus');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'update-status' + (kind ? ' ' + kind : '');
}

function renderUpdateAvailable(info) {
  updateInfo = info;
  const detail = `${t('update.current')}: <b>v${escapeHtml(info.currentVersion)}</b> · ${t('update.latest')}: <b>v${escapeHtml(info.latestVersion)}</b>`;
  const note = info.asset ? '' : `<br><span class="update-warn">${t('update.noAsset')}</span>`;
  $('#updateMessage').innerHTML = `${t('update.availableMsg')}<br><span class="update-vers">${detail}</span>${note}`;
  const notes = $('#updateNotes');
  if (info.notes && info.notes.trim()) {
    notes.textContent = info.notes.trim();
    notes.hidden = false;
  } else {
    notes.hidden = true;
  }
  $('#updateProgress').classList.add('hidden');
  $('#updateBarFill').style.width = '0%';
  const nowBtn = $('#btnUpdateNow');
  nowBtn.disabled = !info.asset;
  nowBtn.classList.remove('loading');
  $('#btnUpdateLater').disabled = false;
  openUpdateModal();
}

async function checkForUpdateUI(manual) {
  if (manual) setUpdateStatus(t('update.checking'));
  try {
    const r = await window.m2log.checkUpdate();
    if (!r || !r.ok) throw new Error((r && r.error) || 'failed');
    if (r.updateAvailable) {
      if (manual) setUpdateStatus('');
      renderUpdateAvailable(r);
    } else if (manual) {
      setUpdateStatus(t('update.upToDate'), 'ok');
    }
  } catch (err) {
    if (manual) setUpdateStatus(t('update.failed') + err.message, 'err');
  }
}

async function startUpdateDownload() {
  if (!updateInfo || !updateInfo.asset || updateBusy) return;
  updateBusy = true;
  const nowBtn = $('#btnUpdateNow');
  const laterBtn = $('#btnUpdateLater');
  const prog = $('#updateProgress');
  const fill = $('#updateBarFill');
  const txt = $('#updateProgressText');
  nowBtn.disabled = true;
  nowBtn.classList.add('loading');
  laterBtn.disabled = true;
  prog.classList.remove('hidden');
  fill.style.width = '0%';
  txt.textContent = t('update.downloading');

  const off = window.m2log.onUpdateProgress((d) => {
    const pct = d && typeof d.pct === 'number' ? d.pct : 0;
    fill.style.width = pct + '%';
    txt.textContent = pct + '%';
  });

  try {
    const r = await window.m2log.downloadUpdate(updateInfo.asset);
    if (typeof off === 'function') off();
    if (!r || !r.ok) throw new Error((r && r.error) || 'download failed');
    fill.style.width = '100%';
    txt.textContent = t('update.installing');
    const ir = await window.m2log.installUpdate(r.filePath);
    if (!ir || !ir.ok) throw new Error((ir && ir.error) || 'install failed');
    // The installer is launching; this app will quit momentarily.
  } catch (err) {
    if (typeof off === 'function') off();
    updateBusy = false;
    nowBtn.disabled = false;
    nowBtn.classList.remove('loading');
    laterBtn.disabled = false;
    prog.classList.add('hidden');
    toast(t('update.downloadFailed') + err.message, 'error');
  }
}

$('#btnCheckUpdate').addEventListener('click', () => checkForUpdateUI(true));
$('#btnUpdateNow').addEventListener('click', startUpdateDownload);
$('#btnUpdateLater').addEventListener('click', closeUpdateModal);
$('#btnUpdateClose').addEventListener('click', closeUpdateModal);
$('#updateModal').addEventListener('click', (e) => {
  if (e.target === $('#updateModal')) closeUpdateModal();
});

/* ---------- Init ---------- */
loadExperiments();
restoreExpToDom(getActiveExp());
renderExpTabs();
if (!$('#date').value) $('#date').value = todayStr();
updateFolderPreview();
loadLang(currentLang);

// Show the app version next to the title (e.g. "v1.0.0").
(async () => {
  try {
    const v = await window.m2log.appVersion();
    if (!v) return;
    const el = document.getElementById('appVersion');
    if (el) el.textContent = 'v' + v;
    // Also reflect the version in the window/taskbar title.
    document.title = 'M2 LOG v' + v;
  } catch (e) {
    /* version is non-essential; ignore failures */
  }
})();

// Silent update check on startup (installed builds only, at most once per day).
// Only prompts when a newer release is available; failures are ignored.
(async () => {
  try {
    const KEY = 'm2log_update_lastcheck';
    const DAY = 24 * 60 * 60 * 1000;
    const last = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - last < DAY) return;
    const r = await window.m2log.checkUpdate();
    localStorage.setItem(KEY, String(Date.now()));
    if (r && r.ok && r.updateAvailable && r.isPackaged) renderUpdateAvailable(r);
  } catch (e) {
    /* update check is best-effort; ignore failures */
  }
})();

// Explorer right-click "Analyze with M2 LOG": open the file/folder passed on the
// command line, and honour later right-clicks forwarded from a second instance.
(async () => {
  try {
    if (!window.m2log || !window.m2log.getInitialTarget) return;
    const target = await window.m2log.getInitialTarget();
    if (target && target.path) anaOpenExternalPath(target);
  } catch (e) {
    /* no CLI target; normal launch */
  }
})();
if (window.m2log && typeof window.m2log.onOpenTarget === 'function') {
  window.m2log.onOpenTarget((target) => {
    if (target && target.path) anaOpenExternalPath(target);
  });
}
