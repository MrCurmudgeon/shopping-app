import {
  CATEGORIES, guessCategory, parseItemInput, formatQty, itemTotal, listToText, groupByCategory,
} from './lib.js';

const STORAGE_KEY = 'grocery-app-v1';
const $ = (id) => document.getElementById(id);

// ---------- State ----------

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function defaultState() {
  const id = uid();
  return {
    currentListId: id,
    lists: [{ id, name: 'Groceries', items: [] }],
    history: {}, // lowercased name -> { name, category, count }
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.lists) && s.lists.length) return s;
    }
  } catch { /* ignore, fall back to defaults */ }
  return defaultState();
}

let state = load();
const ui = { filter: '', hideChecked: false, editingId: null };

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Could not save – storage unavailable');
  }
}

function currentList() {
  return state.lists.find((l) => l.id === state.currentListId) || state.lists[0];
}

function categoryHistory() {
  const map = {};
  for (const [k, v] of Object.entries(state.history)) map[k] = v.category;
  return map;
}

function remember(item) {
  const key = item.name.toLowerCase();
  const prev = state.history[key];
  state.history[key] = { name: item.name, category: item.category, count: (prev?.count || 0) + 1 };
}

// ---------- Rendering ----------

function fillCategorySelect(select, selected) {
  select.innerHTML = '';
  if (select.id === 'itemCategory') {
    select.append(new Option('Auto category', ''));
  }
  for (const c of CATEGORIES) select.append(new Option(c, c));
  select.value = selected ?? '';
}

function renderListPicker() {
  const sel = $('listSelect');
  sel.innerHTML = '';
  for (const l of state.lists) {
    const left = l.items.filter((i) => !i.checked).length;
    sel.append(new Option(`${l.name}${left ? ` (${left})` : ''}`, l.id));
  }
  sel.value = currentList().id;
}

function renderSuggestions() {
  const dl = $('suggestions');
  const onList = new Set(currentList().items.map((i) => i.name.toLowerCase()));
  const entries = Object.values(state.history)
    .filter((h) => !onList.has(h.name.toLowerCase()))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
  dl.innerHTML = '';
  for (const h of entries) dl.append(new Option(h.name));
}

function renderSummary(list) {
  const total = list.items.length;
  const done = list.items.filter((i) => i.checked).length;
  const cost = list.items.reduce((sum, i) => sum + itemTotal(i), 0);
  const parts = [total ? `${done} of ${total} in cart` : 'No items yet'];
  if (cost > 0) parts.push(`est. ${cost.toFixed(2)}`);
  $('summary').textContent = parts.join(' · ');
  $('progressBar').style.width = total ? `${(done / total) * 100}%` : '0';
}

function renderItems(list) {
  const container = $('listContainer');
  container.innerHTML = '';
  const q = ui.filter.trim().toLowerCase();
  const visible = list.items.filter((i) =>
    (!ui.hideChecked || !i.checked) && (!q || i.name.toLowerCase().includes(q) || (i.note || '').toLowerCase().includes(q)));

  $('emptyState').hidden = list.items.length !== 0;
  $('emptyState').textContent = 'Your list is empty. Add something above.';
  if (list.items.length && !visible.length) {
    $('emptyState').hidden = false;
    $('emptyState').textContent = 'No items match.';
  }

  for (const [cat, items] of groupByCategory(visible)) {
    const section = document.createElement('div');
    section.className = 'category';
    const h = document.createElement('h3');
    h.textContent = `${cat} · ${items.filter((i) => i.checked).length}/${items.length}`;
    const ul = document.createElement('ul');
    for (const it of items) ul.append(renderItem(it));
    section.append(h, ul);
    container.append(section);
  }
}

function renderItem(it) {
  const li = document.createElement('li');
  li.className = `item${it.checked ? ' checked' : ''}`;
  li.dataset.id = it.id;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = it.checked;
  cb.setAttribute('aria-label', `Got ${it.name}`);
  cb.dataset.action = 'toggle';

  const body = document.createElement('div');
  body.className = 'body';
  body.dataset.action = 'edit';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = it.name;
  body.append(name);
  const metaParts = [];
  if (it.unit) metaParts.push(formatQty(it));
  if (it.price) metaParts.push(`${itemTotal(it).toFixed(2)}`);
  if (it.note) metaParts.push(it.note);
  if (metaParts.length) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = metaParts.join(' · ');
    body.append(meta);
  }

  li.append(cb, body);

  if (!it.unit) {
    const qc = document.createElement('div');
    qc.className = 'qty-controls';
    const minus = document.createElement('button');
    minus.textContent = '−';
    minus.dataset.action = 'dec';
    minus.setAttribute('aria-label', `Decrease ${it.name}`);
    const n = document.createElement('span');
    n.textContent = it.qty;
    const plus = document.createElement('button');
    plus.textContent = '+';
    plus.dataset.action = 'inc';
    plus.setAttribute('aria-label', `Increase ${it.name}`);
    qc.append(minus, n, plus);
    li.append(qc);
  }
  return li;
}

function render() {
  const list = currentList();
  renderListPicker();
  renderSuggestions();
  renderSummary(list);
  renderItems(list);
}

// ---------- Actions ----------

let lastDeleted = null;

function addItem(text, category) {
  const parsed = parseItemInput(text);
  if (!parsed.name) return;
  const list = currentList();
  const existing = list.items.find((i) => i.name.toLowerCase() === parsed.name.toLowerCase() && !i.checked);
  if (existing && !existing.unit && !parsed.unit) {
    existing.qty += parsed.qty;
    toast(`${existing.name} → ×${existing.qty}`);
  } else {
    const hist = state.history[parsed.name.toLowerCase()];
    const item = {
      id: uid(),
      name: hist?.name || parsed.name,
      qty: parsed.qty,
      unit: parsed.unit,
      category: category || guessCategory(parsed.name, categoryHistory()),
      note: '',
      price: null,
      checked: false,
      createdAt: Date.now(),
    };
    list.items.push(item);
    remember(item);
  }
  save();
  render();
}

function findItem(id) {
  return currentList().items.find((i) => i.id === id);
}

function deleteItem(id) {
  const list = currentList();
  const idx = list.items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const [item] = list.items.splice(idx, 1);
  lastDeleted = { listId: list.id, items: [item] };
  save();
  render();
  toast(`Removed ${item.name}`, undo);
}

function undo() {
  if (!lastDeleted) return;
  const list = state.lists.find((l) => l.id === lastDeleted.listId);
  if (list) list.items.push(...lastDeleted.items);
  lastDeleted = null;
  save();
  render();
}

// ---------- Toast ----------

let toastTimer;
function toast(message, onUndo) {
  const el = $('toast');
  el.innerHTML = '';
  el.append(document.createTextNode(message));
  if (onUndo) {
    const b = document.createElement('button');
    b.textContent = 'Undo';
    b.addEventListener('click', () => { onUndo(); el.hidden = true; });
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, onUndo ? 5000 : 2000);
}

// ---------- Events ----------

$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('itemName');
  addItem(input.value, $('itemCategory').value);
  input.value = '';
  input.focus();
});

$('listContainer').addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const li = target.closest('.item');
  const item = findItem(li.dataset.id);
  if (!item) return;
  switch (target.dataset.action) {
    case 'toggle':
      item.checked = target.checked;
      break;
    case 'inc':
      item.qty += 1;
      break;
    case 'dec':
      if (item.qty <= 1) { deleteItem(item.id); return; }
      item.qty -= 1;
      break;
    case 'edit':
      openEdit(item);
      return;
    default:
      return;
  }
  save();
  render();
});

$('searchInput').addEventListener('input', (e) => { ui.filter = e.target.value; render(); });
$('hideChecked').addEventListener('change', (e) => { ui.hideChecked = e.target.checked; render(); });

$('clearCheckedBtn').addEventListener('click', () => {
  const list = currentList();
  const checked = list.items.filter((i) => i.checked);
  if (!checked.length) { toast('Nothing checked yet'); return; }
  list.items = list.items.filter((i) => !i.checked);
  lastDeleted = { listId: list.id, items: checked };
  save();
  render();
  toast(`Cleared ${checked.length} item${checked.length > 1 ? 's' : ''}`, undo);
});

$('shareBtn').addEventListener('click', async () => {
  const text = listToText(currentList());
  if (navigator.share) {
    try {
      await navigator.share({ title: currentList().name, text });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // user closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('List copied to clipboard');
  } catch {
    toast('Copying is blocked here – select the items manually');
  }
});

// Lists
$('listSelect').addEventListener('change', (e) => {
  state.currentListId = e.target.value;
  save();
  render();
});

// Name dialog, used for both "new list" and "rename list".
let nameMode = 'new';
function openNameDialog(mode) {
  nameMode = mode;
  $('nameTitle').textContent = mode === 'new' ? 'New list' : 'Rename list';
  $('nameInput').value = mode === 'new' ? '' : currentList().name;
  $('nameInput').placeholder = 'e.g. Weekly shop, BBQ party';
  $('nameDialog').showModal();
  $('nameInput').select();
}

$('nameDialog').addEventListener('close', () => {
  const name = $('nameInput').value.trim();
  if ($('nameDialog').returnValue !== 'save' || !name) return;
  if (nameMode === 'new') {
    const id = uid();
    state.lists.push({ id, name, items: [] });
    state.currentListId = id;
  } else {
    currentList().name = name;
  }
  save();
  render();
});

$('newListBtn').addEventListener('click', () => openNameDialog('new'));

$('listMenuBtn').addEventListener('click', () => $('listDialog').showModal());

$('listDialog').addEventListener('close', () => {
  const list = currentList();
  switch ($('listDialog').returnValue) {
    case 'rename':
      openNameDialog('rename');
      return;
    case 'uncheck':
      list.items.forEach((i) => { i.checked = false; });
      break;
    case 'delete': {
      const index = state.lists.indexOf(list);
      state.lists = state.lists.filter((l) => l.id !== list.id);
      if (!state.lists.length) state = { ...defaultState(), history: state.history };
      state.currentListId = state.lists[0].id;
      save();
      render();
      toast(`Deleted "${list.name}"`, () => {
        state.lists.splice(Math.min(index, state.lists.length), 0, list);
        state.currentListId = list.id;
        save();
        render();
      });
      return;
    }
    default:
      return;
  }
  save();
  render();
});

// Edit dialog
function openEdit(item) {
  ui.editingId = item.id;
  $('editName').value = item.name;
  $('editQty').value = item.qty;
  $('editUnit').value = item.unit || '';
  $('editPrice').value = item.price ?? '';
  $('editNote').value = item.note || '';
  fillCategorySelect($('editCategory'), item.category);
  $('editDialog').showModal();
}

$('editDialog').addEventListener('close', () => {
  const item = findItem(ui.editingId);
  const action = $('editDialog').returnValue;
  ui.editingId = null;
  if (!item) return;
  if (action === 'delete') { deleteItem(item.id); return; }
  if (action !== 'save') return;
  item.name = $('editName').value.trim() || item.name;
  item.qty = Math.max(1, Number($('editQty').value) || 1);
  item.unit = $('editUnit').value.trim();
  const price = parseFloat($('editPrice').value);
  item.price = Number.isFinite(price) && price > 0 ? price : null;
  item.note = $('editNote').value.trim();
  item.category = $('editCategory').value;
  remember(item);
  save();
  render();
});

// Sync between tabs
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { state = load(); render(); }
});

// ---------- Boot ----------

fillCategorySelect($('itemCategory'), '');
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
