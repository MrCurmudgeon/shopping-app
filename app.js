import {
  CATEGORIES, guessCategory, parseItemInput, formatQty, itemTotal, listToText, groupByCategory, copyItems,
} from './lib.js';
import { predictNextShop, planningWeekStart } from './insights.js';
import { initReceipts } from './receipts-ui.js';
import { money, shortDate, todayStr } from './format.js';

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
    receipts: [], // { id, date, store, total, items: [{ name, raw, qty, unit, price, category }] }
    aliases: {}, // normalized receipt name -> the name you corrected it to
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.lists) && s.lists.length) return withDefaults(s);
    }
  } catch { /* ignore, fall back to defaults */ }
  return defaultState();
}

function withDefaults(s) {
  s.history ||= {};
  s.receipts ||= [];
  s.aliases ||= {};
  if (!s.lists.some((l) => l.id === s.currentListId)) s.currentListId = s.lists[0].id;
  return s;
}

let state = load();
let receiptsUI = null;
const ui = { filter: '', hideChecked: false, editingId: null, justToggled: null };

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

function templates() {
  return state.lists.filter((l) => l.template);
}

function renderListPicker() {
  const sel = $('listSelect');
  sel.innerHTML = '';
  const lists = state.lists.filter((l) => !l.template);
  const tpls = templates();
  const groupOrSelf = (label) => {
    if (!tpls.length) return sel;
    const g = document.createElement('optgroup');
    g.label = label;
    sel.append(g);
    return g;
  };
  const listParent = groupOrSelf('Lists');
  for (const l of lists) {
    const left = l.items.filter((i) => !i.checked).length;
    listParent.append(new Option(`${l.name}${left ? ` (${left})` : ''}`, l.id));
  }
  if (tpls.length) {
    const tplParent = groupOrSelf('Templates');
    for (const t of tpls) tplParent.append(new Option(`${t.name} · template`, t.id));
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

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Up late?' : h < 12 ? 'Good morning!' : h < 18 ? 'Good afternoon!' : 'Good evening!';
}

const RING_C = 2 * Math.PI * 24;

function renderRing(done, total) {
  const ring = $('progressWrap');
  const frac = total ? done / total : 0;
  $('ringFill').setAttribute('stroke-dashoffset', String(RING_C * (1 - frac)));
  $('ringText').textContent = total ? `${done}/${total}` : '–';
  ring.classList.toggle('done', total > 0 && done === total);
  ring.setAttribute('aria-label', total ? `${done} of ${total} items in the cart` : 'No items yet');
}

function renderSummary(list) {
  $('greeting').textContent = greeting();
  $('progressWrap').hidden = !!list.template;
  if (list.template) {
    $('summary').textContent = `Template · ${list.items.length} item${list.items.length === 1 ? '' : 's'}`;
    return;
  }
  const total = list.items.length;
  const done = list.items.filter((i) => i.checked).length;
  const cost = list.items.reduce((sum, i) => sum + itemTotal(i), 0);
  const left = total - done;
  const parts = [!total ? 'Nothing on the list yet'
    : left === 0 ? 'All done – nice shop!'
      : `${left} thing${left === 1 ? '' : 's'} to grab`];
  if (cost > 0 && left > 0) parts.push(`about ${money(cost)}`);
  $('summary').textContent = parts.join(' · ');
  renderRing(done, total);
}

function renderTemplateBits(list) {
  const isTpl = !!list.template;
  $('view-list').classList.toggle('is-template', isTpl);
  $('templateBanner').hidden = !isTpl;
  $('listFooter').hidden = isTpl;
  $('hideCheckedLabel').hidden = isTpl;
  // Offer the next week once this one is done (or empty).
  const tpl = templateFor(list);
  const done = list.items.length === 0 || list.items.every((i) => i.checked);
  $('newWeekBtn').hidden = isTpl || !tpl || !done;
  if (tpl) $('newWeekBtn').textContent = `Start next week from "${tpl.name}"`;
}

/** The template a list came from, or the first template. */
function templateFor(list) {
  const tpls = templates();
  return tpls.find((t) => t.id === list.fromTemplate) || tpls[0] || null;
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
    section.dataset.cat = cat;
    const h = document.createElement('h3');
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = list.template ? String(items.length) : `${items.filter((i) => i.checked).length}/${items.length}`;
    h.append(cat, count);
    const ul = document.createElement('ul');
    for (const it of items) ul.append(renderItem(it));
    section.append(h, ul);
    container.append(section);
  }
}

function renderItem(it) {
  const li = document.createElement('li');
  li.className = `item${it.checked ? ' checked' : ''}${ui.justToggled === it.id ? ' pop' : ''}`;
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
  if (it.price) metaParts.push(money(itemTotal(it)));
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
  renderTemplateBits(list);
  renderItems(list);
  ui.justToggled = null;
  receiptsUI?.render();
}

// ---------- Views (tabs) ----------

const VIEWS = { list: '', receipts: 'Receipts', insights: 'Insights' };

function showView(name, { push = true } = {}) {
  if (!(name in VIEWS)) name = 'list';
  for (const v of Object.keys(VIEWS)) $(`view-${v}`).hidden = v !== name;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.view === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const isList = name === 'list';
  $('listHeader').hidden = !isList;
  $('listButtons').hidden = !isList;
  $('viewTitle').hidden = isList;
  $('viewTitle').textContent = VIEWS[name];
  const hash = isList ? '' : `#${name}`;
  if (push && location.hash !== hash) history.pushState(null, '', hash || location.pathname + location.search);
  window.scrollTo(0, 0);
}

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-view]');
  if (!a) return;
  e.preventDefault();
  showView(a.dataset.view);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b) showView(b.dataset.goto);
});
window.addEventListener('popstate', () => showView(location.hash.slice(1), { push: false }));

// Labels styled as buttons (file pickers) should work from the keyboard too.
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('label.button[for]')) {
    e.preventDefault();
    $(e.target.htmlFor).click();
  }
});

// Enter inside a dialog's text field means "save", never the first button (which may be Delete).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  const form = e.target.closest('dialog form');
  if (!form) return;
  e.preventDefault();
  const primary = form.querySelector('button.primary');
  if (primary && form.reportValidity()) form.requestSubmit(primary);
});

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

// ---------- Celebration ----------

const CONFETTI_COLOURS = ['--c-produce', '--c-dairy', '--c-snacks', '--c-drinks', '--c-care', '--c-bakery', '--accent'];

function celebrate() {
  const ring = $('progressWrap');
  ring.classList.remove('cheer');
  void ring.offsetWidth; // restart the animation
  ring.classList.add('cheer');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const css = getComputedStyle(document.documentElement);
  const colours = CONFETTI_COLOURS.map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.append(canvas);
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  const pieces = Array.from({ length: 110 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80,
    y: innerHeight * 0.25,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 9 - 3,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    colour: colours[Math.floor(Math.random() * colours.length)],
  }));
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    c.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pieces) {
      p.vy += 0.28;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      c.save();
      c.globalAlpha = Math.max(0, 1 - t / 1800);
      c.translate(p.x, p.y);
      c.rotate(p.r);
      c.fillStyle = p.colour;
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.restore();
    }
    if (t < 1800) requestAnimationFrame(frame);
    else canvas.remove();
  })(start);
  toast('All done – nice shop!');
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
    case 'toggle': {
      item.checked = target.checked;
      ui.justToggled = item.id;
      const list = currentList();
      if (item.checked && list.items.length > 1 && list.items.every((i) => i.checked)) {
        save();
        render();
        celebrate();
        return;
      }
      break;
    }
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

// ---------- New list / rename / template dialog ----------

let nameMode = 'new'; // 'new' | 'rename' | 'template' | 'duplicate'
let nameTouched = false;

function weekName() {
  return `Week of ${shortDate(planningWeekStart(todayStr()))}`;
}

/** Items Insights expects you to need that aren't already in `items`. */
function predictedExtras(items) {
  const have = new Set(items.map((i) => i.name.toLowerCase()));
  return predictNextShop(state.receipts || [], todayStr(), 7)
    .filter((p) => p.confidence >= 0.55 && !have.has(p.name.toLowerCase()))
    .map((p) => ({
      name: p.name,
      qty: p.qty,
      unit: p.unit,
      category: p.category,
      price: p.estCost ? +(p.estCost / (p.unit ? 1 : p.qty)).toFixed(2) : null,
      createdAt: Number.MAX_SAFE_INTEGER, // after the template's own items
    }));
}

function defaultNameFor(source) {
  if (source.startsWith('tpl:')) return weekName();
  if (source.startsWith('copy:')) {
    const l = state.lists.find((x) => x.id === source.slice(5));
    return l ? `${l.name} (copy)` : 'New list';
  }
  return '';
}

function updateNameDialog() {
  const source = $('sourceSelect').value;
  if (!nameTouched) $('nameInput').value = defaultNameFor(source);
  const tpl = source.startsWith('tpl:') ? state.lists.find((l) => l.id === source.slice(4)) : null;
  const extras = tpl ? predictedExtras(tpl.items) : [];
  $('predictField').hidden = !extras.length;
  $('predictCount').textContent = extras.length ? `(${extras.length}: ${extras.slice(0, 3).map((e) => e.name).join(', ')}${extras.length > 3 ? '…' : ''})` : '';
}

function openNameDialog(mode, { source } = {}) {
  nameMode = mode;
  nameTouched = false;
  const list = currentList();
  $('sourceField').hidden = mode !== 'new';
  $('predictField').hidden = true;
  $('nameHint').hidden = mode !== 'template';
  $('nameInput').placeholder = mode === 'template' ? 'e.g. Weekly staples' : 'e.g. Weekly shop, BBQ party';

  if (mode === 'new') {
    $('nameTitle').textContent = 'New list';
    const sel = $('sourceSelect');
    sel.innerHTML = '';
    sel.append(new Option('Blank list', ''));
    for (const t of templates()) sel.append(new Option(`Template: ${t.name}`, `tpl:${t.id}`));
    for (const l of state.lists.filter((x) => !x.template && x.items.length)) {
      sel.append(new Option(`Copy of ${l.name}`, `copy:${l.id}`));
    }
    sel.value = source ?? (templates()[0] ? `tpl:${templates()[0].id}` : '');
    updateNameDialog();
  } else if (mode === 'duplicate') {
    $('nameTitle').textContent = list.template ? 'Duplicate template' : 'Duplicate list';
    $('nameInput').value = `${list.name} (copy)`;
  } else if (mode === 'rename') {
    $('nameTitle').textContent = list.template ? 'Rename template' : 'Rename list';
    $('nameInput').value = list.name;
  } else {
    $('nameTitle').textContent = 'Save as template';
    $('nameInput').value = templates().length ? `${list.name} template` : 'Weekly staples';
    $('nameHint').textContent = `Saves the ${list.items.length} items on "${list.name}" (unticked) as a template. Remove any one-off items from it afterwards.`;
  }
  $('nameDialog').showModal();
  $('nameInput').select();
}

$('sourceSelect').addEventListener('change', updateNameDialog);
$('nameInput').addEventListener('input', () => { nameTouched = true; });

function addList(list, select = true) {
  state.lists.push(list);
  if (select) state.currentListId = list.id;
  return list;
}

$('nameDialog').addEventListener('close', () => {
  const name = $('nameInput').value.trim();
  if ($('nameDialog').returnValue !== 'save' || !name) return;
  const list = currentList();

  if (nameMode === 'rename') {
    list.name = name;
  } else if (nameMode === 'duplicate') {
    // A copy of a template is a template; a copy of a list is a list from the same template.
    addList({
      id: uid(),
      name,
      items: copyItems(list.items, uid),
      ...(list.template ? { template: true } : list.fromTemplate ? { fromTemplate: list.fromTemplate } : {}),
    });
    save();
    render();
    toast(`Created "${name}"`);
    return;
  } else if (nameMode === 'template') {
    addList({ id: uid(), name, template: true, items: copyItems(list.items, uid) }, false);
    list.fromTemplate = state.lists[state.lists.length - 1].id;
    save();
    render();
    toast(`Saved template "${name}"`);
    return;
  } else {
    const source = $('sourceSelect').value;
    let items = [];
    let fromTemplate;
    let extrasAdded = 0;
    if (source.startsWith('tpl:') || source.startsWith('copy:')) {
      const src = state.lists.find((l) => l.id === source.slice(source.indexOf(':') + 1));
      if (src) {
        let pool = src.items;
        if (src.template) {
          fromTemplate = src.id;
          if (!$('predictField').hidden && $('predictCheck').checked) {
            const extras = predictedExtras(src.items);
            extrasAdded = extras.length;
            pool = [...pool, ...extras];
          }
        } else {
          fromTemplate = src.fromTemplate;
        }
        items = copyItems(pool, uid);
      }
    }
    addList({ id: uid(), name, items, ...(fromTemplate ? { fromTemplate } : {}) });
    save();
    render();
    showView('list');
    if (items.length) toast(`Created "${name}" with ${items.length} items${extrasAdded ? ` (${extrasAdded} from Insights)` : ''}`);
    return;
  }
  save();
  render();
});

function startNewWeek(templateId) {
  openNameDialog('new', { source: `tpl:${templateId}` });
}

$('useTemplateBtn').addEventListener('click', () => startNewWeek(currentList().id));
$('newWeekBtn').addEventListener('click', () => {
  const tpl = templateFor(currentList());
  if (tpl) startNewWeek(tpl.id);
});

$('newListBtn').addEventListener('click', () => openNameDialog('new'));

$('listMenuBtn').addEventListener('click', () => {
  const list = currentList();
  const isTpl = !!list.template;
  const tpl = templateFor(list);
  $('listDialogTitle').textContent = isTpl ? `Template: ${list.name}` : list.name;
  $('optNewWeek').hidden = !isTpl;
  $('optSaveTemplate').hidden = isTpl;
  $('optUpdateTemplate').hidden = isTpl || !tpl;
  if (tpl) $('optUpdateTemplate').textContent = `Update "${tpl.name}" from this list`;
  $('optUncheck').hidden = isTpl;
  $('optDelete').textContent = isTpl ? 'Delete template' : 'Delete list';
  $('listDialog').showModal();
});

$('listDialog').addEventListener('close', () => {
  const list = currentList();
  switch ($('listDialog').returnValue) {
    case 'rename':
      openNameDialog('rename');
      return;
    case 'saveTemplate':
      openNameDialog('template');
      return;
    case 'newWeek':
      startNewWeek(list.id);
      return;
    case 'duplicate':
      openNameDialog('duplicate');
      return;
    case 'updateTemplate': {
      const tpl = templateFor(list);
      if (!tpl) return;
      const before = tpl.items;
      tpl.items = copyItems(list.items, uid);
      list.fromTemplate = tpl.id;
      save();
      render();
      toast(`Updated "${tpl.name}" · ${tpl.items.length} items`, () => {
        tpl.items = before;
        save();
        render();
      });
      return;
    }
    case 'uncheck':
      list.items.forEach((i) => { i.checked = false; });
      break;
    case 'delete': {
      const index = state.lists.indexOf(list);
      state.lists = state.lists.filter((l) => l.id !== list.id);
      if (!state.lists.length) {
        const fresh = defaultState();
        state.lists = fresh.lists;
      }
      state.currentListId = (state.lists.find((l) => !l.template) || state.lists[0]).id;
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
  item.qty = Math.max(0.01, Number($('editQty').value) || 1);
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

/** Add predicted items to the current list, merging with what is already there. */
function addToList(items) {
  const list = currentList();
  let added = 0;
  for (const it of items) {
    const existing = list.items.find((i) => i.name.toLowerCase() === it.name.toLowerCase() && !i.checked);
    if (existing) continue;
    list.items.push({
      id: uid(),
      name: it.name,
      qty: it.qty || 1,
      unit: it.unit || '',
      category: it.category || guessCategory(it.name, categoryHistory()),
      note: '',
      price: it.price || null,
      checked: false,
      createdAt: Date.now(),
    });
    added += 1;
  }
  save();
  render();
  return added;
}

receiptsUI = initReceipts({
  getState: () => state,
  replaceState: (s) => { state = withDefaults(s); save(); render(); },
  save,
  toast,
  uid,
  categoryHistory,
  remember,
  addToList,
  showView,
  currentListNames: () => currentList().items.filter((i) => !i.checked).map((i) => i.name.toLowerCase()),
});

fillCategorySelect($('itemCategory'), '');
render();
showView(location.hash.slice(1), { push: false });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  // When an updated app version takes over, reload once so you see it straight away.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      // Home-screen apps can stay open for days; check for updates when brought back to the front.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}
