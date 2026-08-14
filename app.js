import { evaluateExpression } from './calculator.js';
import { ResultStore, calculateGroup } from './results.js';
import { formatNumber, UndoManager } from './session.js';

const $ = (id) => document.getElementById(id);
const store = new ResultStore();
const undoManager = new UndoManager(80);
let expression = '';
let currentValue = 0;
let currentLabel = null;
let groupState = null;
let history = [];
let historyNavigationSuppressed = false;
let muted = false;
let detailsHidden = false;
let audioContext = null;

const text = {
  hide: '\u0625\u062e\u0641\u0627\u0621 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644',
  show: '\u0625\u0638\u0647\u0627\u0631 \u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644',
  invalid: '\u062a\u0639\u0630\u0631 \u062a\u0646\u0641\u064a\u0630 \u0627\u0644\u0639\u0645\u0644\u064a\u0629',
  pasteInvalid: '\u0627\u0644\u062d\u0627\u0641\u0638\u0629 \u0644\u0627 \u062a\u062d\u062a\u0648\u064a \u0631\u0642\u0645\u0627 \u0635\u0627\u0644\u062d\u0627',
  copied: '\u062a\u0645 \u0646\u0633\u062e \u0627\u0644\u0646\u0627\u062a\u062c',
  needTwo: '\u062d\u062f\u062f \u0646\u062a\u064a\u062c\u062a\u064a\u0646 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644',
  noResult: '\u0644\u0627 \u064a\u0648\u062c\u062f \u0646\u0627\u062a\u062c \u0644\u0646\u0633\u062e\u0647'
};

function snapshot() {
  return {
    store: store.snapshot(), expression, currentValue, currentLabel,
    groupState: groupState ? { ...groupState } : null,
    history: history.map((item) => ({ ...item })),
    historyNavigationSuppressed
  };
}

function restore(state) {
  store.restore(state.store);
  expression = state.expression;
  currentValue = state.currentValue;
  currentLabel = state.currentLabel;
  groupState = state.groupState;
  history = state.history.map((item) => ({ ...item }));
  historyNavigationSuppressed = state.historyNavigationSuppressed ?? false;
  renderAll();
}

function checkpoint() { undoManager.checkpoint(snapshot()); }

function showError(message = '') { $('errorMessage').textContent = message; }

function resolveResult(label) { return store.get(label)?.value; }

function displayExpression(value) {
  return value.replaceAll('*', '\u00d7').replaceAll('/', '\u00f7').replaceAll('-', '\u2212');
}

function renderDisplay() {
  $('expressionDisplay').textContent = expression ? displayExpression(expression) : '0';
  $('answerDisplay').textContent = formatNumber(currentValue, $('decimalMode').value);
  $('currentLabel').textContent = currentLabel || '--';
}

function renderResults() {
  const list = $('resultsList');
  list.innerHTML = '';
  const items = store.list();
  $('resultsCount').textContent = String(items.length);
  for (const item of items) {
    const card = document.createElement('div');
    card.className = `result-card${item.pinned ? ' pinned' : ''}${expression.includes(item.label) ? ' used' : ''}`;
    card.innerHTML = `
      <input class="result-select" type="checkbox" aria-label="select ${item.label}" ${item.selected ? 'checked' : ''}>
      <div class="result-main" role="button" tabindex="0">
        <span class="result-label">${item.label}</span>
        <strong>${formatNumber(item.value, $('decimalMode').value)}</strong>
        <small>${displayExpression(item.expression)}</small>
      </div>
      <div class="result-tools">
        <button type="button" data-tool="pin" title="pin">${item.pinned ? '\uD83D\uDCCC' : '\u25CB'}</button>
        <button type="button" data-tool="copy" title="copy">\u2398</button>
        <button type="button" data-tool="delete" title="delete">\u00d7</button>
      </div>`;
    card.querySelector('.result-select').addEventListener('change', () => {
      checkpoint(); store.toggleSelect(item.label); groupState = null; renderAll();
    });
    const use = () => appendToken(item.label, 'number');
    card.querySelector('.result-main').addEventListener('click', use);
    card.querySelector('.result-main').addEventListener('keydown', (event) => { if (event.key === 'Enter') use(); });
    card.querySelector('[data-tool="pin"]').addEventListener('click', () => { checkpoint(); store.togglePin(item.label); renderAll(); });
    card.querySelector('[data-tool="copy"]').addEventListener('click', () => copyValue(item.value));
    card.querySelector('[data-tool="delete"]').addEventListener('click', () => { checkpoint(); store.remove(item.label); groupState = null; renderAll(); });
    list.appendChild(card);
  }
}

function renderPinned() {
  const box = $('pinnedStrip');
  box.innerHTML = '';
  for (const item of store.list().filter((row) => row.pinned)) {
    const button = document.createElement('button');
    button.className = 'chip';
    button.textContent = `${item.label} = ${formatNumber(item.value, $('decimalMode').value)}`;
    button.addEventListener('click', () => appendToken(item.label, 'number'));
    box.appendChild(button);
  }
}

function renderGroup() {
  const selected = store.getSelected();
  $('selectedCount').textContent = String(selected.length);
  const chips = $('selectedChips');
  chips.innerHTML = '';
  for (const item of selected) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = item.label;
    chips.appendChild(chip);
  }
  const total = selected.reduce((sum, item) => sum + item.value, 0);
  $('groupTotal').textContent = formatNumber(total, $('decimalMode').value);
  const groupResult = $('groupResult');
  if (groupState) {
    groupResult.hidden = false;
    $('groupExpression').textContent = displayExpression(groupState.expression);
    $('groupValue').textContent = formatNumber(groupState.value, $('decimalMode').value);
  } else {
    groupResult.hidden = true;
  }
}

function renderHistory() {
  const list = $('historyList');
  list.innerHTML = '';
  $('historyCount').textContent = String(history.length);
  for (const item of history) {
    const row = document.createElement('div');
    row.className = 'history-item';
    row.innerHTML = `<span>${item.label}: ${displayExpression(item.expression)}</span><strong>${formatNumber(item.value, $('decimalMode').value)}</strong>`;
    list.appendChild(row);
  }
  $('historyNav').hidden = historyNavigationSuppressed || history.length < 2;
}

function renderAll() { renderDisplay(); renderResults(); renderPinned(); renderGroup(); renderHistory(); }

function tone(kind) {
  const enabled = kind === 'number' ? $('soundNumbers').checked : kind === 'operator' ? $('soundOperators').checked : $('soundEquals').checked;
  if (muted || !enabled) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ||= new AudioContextClass();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const freq = kind === 'number' ? 390 : kind === 'operator' ? 520 : 690;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.035, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.055);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + 0.06);
}

function appendToken(token, soundKind = null) {
  checkpoint();
  if (!expression && currentLabel) historyNavigationSuppressed = true;
  expression += token;
  currentLabel = null;
  groupState = null;
  showError('');
  if (soundKind) tone(soundKind);
  renderAll();
}

function clearExpression() {
  if (!expression) return;
  checkpoint(); expression = ''; currentLabel = null; groupState = null; showError(''); renderAll();
}

function backspace() {
  if (!expression) return;
  checkpoint(); expression = expression.slice(0, -1); currentLabel = null; groupState = null; showError(''); renderAll();
}

function calculate() {
  if (!expression.trim()) return;
  try {
    checkpoint();
    const source = expression;
    const value = evaluateExpression(source, resolveResult);
    const item = store.add(value, source);
    history.push({ label: item.label, expression: source, value });
    currentValue = value;
    currentLabel = item.label;
    expression = '';
    historyNavigationSuppressed = false;
    groupState = null;
    showError(''); tone('equals'); renderAll();
    requestAnimationFrame(() => { $('historyList').scrollTop = $('historyList').scrollHeight; });
  } catch (error) {
    undoManager.undo(snapshot());
    showError(error.message.includes('zero') ? '\u0644\u0627 \u064a\u0645\u0643\u0646 \u0627\u0644\u0642\u0633\u0645\u0629 \u0639\u0644\u0649 \u0635\u0641\u0631' : text.invalid);
  }
}

function doGroup(operation) {
  try {
    const selected = store.getSelected();
    if (selected.length < 2) throw new Error('two');
    groupState = calculateGroup(selected, operation);
    showError('');
    renderGroup();
  } catch (error) {
    groupState = null;
    showError(error.message.includes('zero') ? '\u0644\u0627 \u064a\u0645\u0643\u0646 \u0627\u0644\u0642\u0633\u0645\u0629 \u0639\u0644\u0649 \u0635\u0641\u0631' : text.needTwo);
    renderGroup();
  }
}

function useGroupResult() {
  if (!groupState) return;
  checkpoint();
  const item = store.add(groupState.value, groupState.expression);
  history.push({ label: item.label, expression: groupState.expression, value: groupState.value });
  currentValue = groupState.value; currentLabel = item.label; groupState = null; historyNavigationSuppressed = false; store.clearSelection(); showError(''); renderAll();
}

async function copyValue(value = currentLabel ? currentValue : null) {
  if (value === null || value === undefined) { showError(text.noResult); return; }
  try { await navigator.clipboard.writeText(String(value)); showError(text.copied); }
  catch { showError(text.invalid); }
}

async function pasteNumber() {
  try {
    const raw = (await navigator.clipboard.readText()).trim().replaceAll(',', '');
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) throw new Error('invalid');
    appendToken(raw, 'number');
  } catch { showError(text.pasteInvalid); }
}

function undo() {
  const state = undoManager.undo(snapshot());
  if (state) restore(state);
}
function redo() {
  const state = undoManager.redo(snapshot());
  if (state) restore(state);
}

$('keypad').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.token !== undefined) {
    const token = button.dataset.token;
    appendToken(token, /\d|\.|\(|\)/.test(token) ? 'number' : 'operator');
    return;
  }
  const action = button.dataset.action;
  if (action === 'clear') clearExpression();
  else if (action === 'backspace') backspace();
  else if (action === 'equals') calculate();
  else if (action === 'paste') pasteNumber();
  else if (action === 'undo') undo();
  else if (action === 'redo') redo();
});

$('selectAll').addEventListener('click', () => { if (!store.list().length) return; checkpoint(); store.selectAll(); groupState = null; renderAll(); });
$('clearSelection').addEventListener('click', () => { checkpoint(); store.clearSelection(); groupState = null; renderAll(); });
document.querySelectorAll('[data-group-op]').forEach((button) => button.addEventListener('click', () => doGroup(button.dataset.groupOp)));
$('useGroupResult').addEventListener('click', useGroupResult);
$('copyResult').addEventListener('click', () => copyValue());
$('pasteValue').addEventListener('click', pasteNumber);
$('newOperation').addEventListener('click', () => { checkpoint(); expression = ''; currentLabel = null; groupState = null; historyNavigationSuppressed = true; store.clearSelection(); showError(''); renderAll(); });
$('clearHistory').addEventListener('click', () => { if (!history.length) return; checkpoint(); history = []; renderHistory(); });
$('historyUp').addEventListener('click', () => $('historyList').scrollBy({ top: -150, behavior: 'smooth' }));
$('historyDown').addEventListener('click', () => $('historyList').scrollBy({ top: 150, behavior: 'smooth' }));
$('detailsToggle').addEventListener('click', () => { detailsHidden = !detailsHidden; $('appShell').classList.toggle('details-hidden', detailsHidden); $('detailsToggle').textContent = detailsHidden ? text.show : text.hide; });
$('muteToggle').addEventListener('click', () => { muted = !muted; $('muteToggle').textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'; });
$('decimalMode').addEventListener('change', renderAll);

document.addEventListener('keydown', (event) => {
  const key = event.key;
  const lower = key.toLowerCase();
  if (event.ctrlKey && lower === 'c') { event.preventDefault(); copyValue(); return; }
  if (event.ctrlKey && lower === 'v') { event.preventDefault(); pasteNumber(); return; }
  if (event.ctrlKey && lower === 'z') { event.preventDefault(); undo(); return; }
  if (event.ctrlKey && lower === 'y') { event.preventDefault(); redo(); return; }
  if (key === 'Enter' || key === '=') { event.preventDefault(); calculate(); return; }
  if (key === 'Backspace') { event.preventDefault(); backspace(); return; }
  if (key === 'Escape') { event.preventDefault(); clearExpression(); return; }
  if (/^[0-9.]$/.test(key)) { event.preventDefault(); appendToken(key, 'number'); return; }
  if (/^[+\-*/%()]$/.test(key)) { event.preventDefault(); appendToken(key, /[+\-*/%]/.test(key) ? 'operator' : 'number'); }
});

renderAll();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
