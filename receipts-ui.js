// Receipts and Insights screens: scan / paste / edit receipts, spending
// analytics and next-week predictions.

import { CATEGORIES, guessCategory } from './lib.js';
import { parseReceiptText, normalizeName } from './receipts.js';
import {
  weeklySpend, summary, categorySpend, topItems, priceChanges, predictNextShop, predictionReason, receiptTotal,
} from './insights.js';
import { makeSampleReceipts } from './sample-data.js';
import { money, moneyShort, shortDate, todayStr, DAY_FIRST } from './format.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

/**
 * @param {object} ctx
 *   getState(), save(), toast(msg, undo?), uid(), categoryHistory(),
 *   remember(item), addToList(items) -> number added, showView(name)
 */
export function initReceipts(ctx) {
  const st = () => ctx.getState();
  let editing = null; // { id|null, photoUrl|null }
  let predictionChecks = new Map(); // name -> checked

  // ---------- OCR ----------

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not download the text reader. Check your connection and try again.'));
      document.head.append(s);
    });
  }

  /**
   * Phone photos are often 12 MP; shrink them so reading takes seconds, not
   * minutes. No other changes: Tesseract does its own thresholding, and our
   * own contrast tweaks made it drop the price column in testing.
   */
  async function prepareImage(file, maxSide = 2400) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = maxSide / Math.max(img.naturalWidth, img.naturalHeight);
    if (scale >= 1) return { image: file, url };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return { image: blob || canvas, url };
  }

  function setStatus(text, progress) {
    $('ocrStatus').hidden = !text;
    $('ocrText').textContent = text || '';
    const bar = $('ocrProgress');
    if (progress == null) bar.removeAttribute('value');
    else bar.value = progress;
  }

  async function scan(file) {
    setStatus('Preparing photo…', null);
    let photoUrl = null;
    try {
      const { image, url } = await prepareImage(file);
      photoUrl = url;
      if (!window.Tesseract) {
        setStatus('Downloading the text reader (first time only)…', null);
        await loadScript(TESSERACT_URL);
      }
      const worker = await window.Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') setStatus('Reading receipt…', m.progress);
          else if (/load/i.test(m.status)) setStatus('Loading the text reader…', null);
        },
      });
      await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
      const { data } = await worker.recognize(image);
      await worker.terminate();
      setStatus('');
      const parsed = parse(data.text);
      if (!parsed.items.length) ctx.toast('No items found – add them below or try a sharper, flatter photo');
      openReview(parsed, { photoUrl, rawText: data.text });
    } catch (err) {
      setStatus('');
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      ctx.toast(err?.message?.startsWith('Could not') ? err.message : 'Could not read that photo – try again or paste the text');
      console.error(err);
    }
  }

  function parse(text) {
    return parseReceiptText(text, {
      aliases: st().aliases,
      history: ctx.categoryHistory(),
      dayFirst: DAY_FIRST,
      today: todayStr(),
    });
  }

  // ---------- Review / edit dialog ----------

  function categorySelect(value) {
    const s = el('select', { 'aria-label': 'Category', dataset: { field: 'category' } });
    for (const c of CATEGORIES) s.append(new Option(c, c));
    s.value = CATEGORIES.includes(value) ? value : 'Other';
    return s;
  }

  function itemRow(it = { name: '', qty: 1, unit: '', price: '', category: 'Other' }) {
    const row = el('div', { class: 'r-item', dataset: { raw: it.raw || '', unit: it.unit || '' } },
      el('input', { value: it.name, placeholder: 'Item', 'aria-label': 'Item name', dataset: { field: 'name' } }),
      el('div', { class: 'r-item-row' },
        el('label', { class: 'mini' }, it.unit ? `Qty (${it.unit})` : 'Qty',
          el('input', { type: 'number', min: '0', step: 'any', inputMode: 'decimal', value: it.qty ?? 1, dataset: { field: 'qty' } })),
        el('label', { class: 'mini' }, 'Price',
          el('input', { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', value: typeof it.price === 'number' ? it.price.toFixed(2) : '', dataset: { field: 'price' } })),
        el('label', { class: 'mini grow' }, 'Category', categorySelect(it.category)),
        el('button', { type: 'button', class: 'icon-btn plain', 'aria-label': `Remove ${it.name || 'line'}`, dataset: { action: 'remove' }, textContent: '×' })));
    return row;
  }

  function readRows() {
    return [...$('rItems').querySelectorAll('.r-item')].map((row) => {
      const get = (f) => row.querySelector(`[data-field="${f}"]`).value;
      return {
        name: get('name').trim(),
        raw: row.dataset.raw || '',
        qty: Number(get('qty')) || 1,
        unit: row.dataset.unit || '',
        price: Math.round((Number(get('price')) || 0) * 100) / 100,
        category: get('category'),
      };
    });
  }

  function updateTotals() {
    const sum = readRows().reduce((s, i) => s + i.price, 0);
    $('rSum').textContent = money(sum);
    $('rCount').textContent = readRows().filter((i) => i.name).length;
    const total = Number($('rTotal').value);
    const off = total > 0 && Math.abs(total - sum) > 0.05;
    $('rMismatch').hidden = !off;
    if (off) {
      $('rMismatch').textContent = `Items add up to ${money(sum)} but the receipt total is ${money(total)}. Check for missed or misread lines (the photo can help).`;
    }
  }

  function openReview(receipt, { id = null, photoUrl = null, rawText = '' } = {}) {
    editing = { id, photoUrl };
    $('receiptTitle').textContent = id ? 'Edit receipt' : 'Check receipt';
    $('receiptHint').textContent = id ? '' : 'Fix anything the scan got wrong. Renamed items are remembered for next time.';
    $('rStore').value = receipt.store || '';
    $('rDate').value = receipt.date || todayStr();
    $('rTotal').value = typeof receipt.total === 'number' ? receipt.total.toFixed(2) : '';
    $('rItems').replaceChildren(...receipt.items.map(itemRow));
    $('photoDetails').hidden = !photoUrl;
    $('photoDetails').open = false;
    if (photoUrl) $('receiptPhoto').src = photoUrl;
    $('rRawText').textContent = rawText;
    $('rawDetails').hidden = !rawText;
    $('rDelete').hidden = !id;
    updateTotals();
    $('receiptDialog').showModal();
    $('receiptDialog').scrollTop = 0;
  }

  $('rItems').addEventListener('input', updateTotals);
  $('rTotal').addEventListener('input', updateTotals);
  $('rItems').addEventListener('click', (e) => {
    if (e.target.dataset.action === 'remove') {
      e.target.closest('.r-item').remove();
      updateTotals();
    }
  });
  $('rAddLine').addEventListener('click', () => {
    const row = itemRow();
    $('rItems').append(row);
    row.querySelector('input').focus();
    updateTotals();
  });
  $('rItems').addEventListener('change', (e) => {
    // Re-guess the category when a name is corrected, unless the user picked one.
    if (e.target.dataset.field !== 'name') return;
    const row = e.target.closest('.r-item');
    const sel = row.querySelector('[data-field="category"]');
    if (!sel.dataset.touched) sel.value = guessCategory(e.target.value, ctx.categoryHistory());
  });
  $('rItems').addEventListener('input', (e) => {
    if (e.target.dataset.field === 'category') e.target.dataset.touched = '1';
  });

  $('receiptDialog').addEventListener('close', () => {
    const action = $('receiptDialog').returnValue;
    const { id, photoUrl } = editing || {};
    editing = null;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    const state = st();

    if (action === 'delete' && id) {
      const idx = state.receipts.findIndex((r) => r.id === id);
      const [removed] = state.receipts.splice(idx, 1);
      ctx.save();
      render();
      ctx.toast('Receipt deleted', () => {
        state.receipts.splice(idx, 0, removed);
        ctx.save();
        render();
      });
      return;
    }
    if (action !== 'save') return;

    const items = readRows().filter((i) => i.name && i.price > 0);
    for (const it of items) {
      // Learn: "BNNS ORG" -> "Organic bananas" and the chosen category.
      if (it.raw && normalizeName(it.raw) !== normalizeName(it.name)) state.aliases[normalizeName(it.raw)] = it.name;
      ctx.remember(it);
    }
    const total = Number($('rTotal').value);
    const receipt = {
      id: id || ctx.uid(),
      date: $('rDate').value || todayStr(),
      store: $('rStore').value.trim(),
      total: total > 0 ? Math.round(total * 100) / 100 : null,
      items,
    };
    const existing = state.receipts.findIndex((r) => r.id === receipt.id);
    if (existing >= 0) state.receipts[existing] = receipt;
    else state.receipts.push(receipt);
    state.receipts.sort((a, b) => b.date.localeCompare(a.date));
    ctx.save();
    render();
    ctx.toast(existing >= 0 ? 'Receipt updated' : `Saved receipt · ${items.length} items`);
  });

  // ---------- Receipts screen ----------

  $('receiptFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) scan(file);
  });

  $('pasteReceiptBtn').addEventListener('click', () => {
    $('pasteText').value = '';
    $('pasteDialog').showModal();
  });
  $('pasteDialog').addEventListener('close', () => {
    if ($('pasteDialog').returnValue !== 'read') return;
    const text = $('pasteText').value;
    if (!text.trim()) return;
    openReview(parse(text), { rawText: text });
  });

  $('manualReceiptBtn').addEventListener('click', () => {
    openReview({ store: '', date: todayStr(), total: null, items: [{ name: '', qty: 1, unit: '', price: '', category: 'Other' }] });
  });

  $('receiptList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const r = st().receipts.find((x) => x.id === btn.dataset.id);
    if (r) openReview(structuredClone(r), { id: r.id });
  });

  // Backup / restore: everything lives on this device, so make it easy to keep a copy.
  $('exportBtn').addEventListener('click', async () => {
    const name = `grocery-backup-${todayStr()}.json`;
    const blob = new Blob([JSON.stringify(st(), null, 2)], { type: 'application/json' });
    // On iPhone, downloads from a home-screen app are unreliable; the share
    // sheet lets you "Save to Files" instead.
    const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Grocery backup' });
        ctx.toast('Backup shared');
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    ctx.toast('Backup saved to your downloads');
  });
  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.lists) || !data.lists.length) throw new Error('bad');
      ctx.replaceState(data);
      ctx.toast('Backup restored');
    } catch {
      ctx.toast('That file is not a grocery backup');
    }
  });

  function renderReceiptList() {
    const receipts = st().receipts;
    $('receiptsEmpty').hidden = receipts.length > 0;
    $('receiptList').replaceChildren(...receipts.map((r) => el('li', {},
      el('button', { type: 'button', class: 'receipt-row', dataset: { id: r.id } },
        el('span', { class: 'r-main' },
          el('span', { class: 'r-store' }, r.store || 'Receipt', r.sample ? el('span', { class: 'pill' }, 'Sample') : null),
          el('span', { class: 'r-meta' }, `${shortDate(r.date, true)} · ${r.items.length} item${r.items.length === 1 ? '' : 's'}`)),
        el('span', { class: 'r-total' }, money(receiptTotal(r)))))));
  }

  // ---------- Insights screen ----------

  function weekChart(weeks) {
    const W = 340;
    const H = 170;
    const pad = { l: 40, r: 8, t: 14, b: 24 };
    const max = Math.max(10, ...weeks.map((w) => w.total));
    const step = niceStep(max / 3);
    const top = Math.ceil(max / step) * step;
    const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
    const slot = (W - pad.l - pad.r) / weeks.length;
    const barW = Math.min(26, slot - 8);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Weekly spend for the last ${weeks.length} weeks`);
    const add = (tag, attrs, text) => {
      const n = document.createElementNS(svgNS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      svg.append(n);
      return n;
    };
    for (let v = 0; v <= top + 1e-9; v += step) {
      add('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' });
      add('text', { x: pad.l - 6, y: y(v) + 3.5, class: 'tick', 'text-anchor': 'end' }, moneyShort(v));
    }
    const latest = weeks.length - 1;
    weeks.forEach((w, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const h = Math.max(0, y(0) - y(w.total));
      if (h > 0) {
        const r = Math.min(4, h / 2, barW / 2);
        const x0 = cx - barW / 2;
        const y0 = y(w.total);
        // Rounded top, square base anchored on the axis.
        add('path', {
          d: `M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + barW - r} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} V${y(0)} Z`,
          class: i === latest ? 'bar current' : 'bar',
        });
      }
      if (i % 2 === latest % 2) {
        add('text', { x: cx, y: H - 8, class: 'tick', 'text-anchor': 'middle' }, i === latest ? 'This wk' : shortDate(w.week));
      }
      // Generous hit target for the tooltip.
      const hit = add('rect', { x: pad.l + slot * i, y: pad.t, width: slot, height: H - pad.t - pad.b, class: 'hit', tabindex: '0' });
      hit.dataset.tip = `Week of ${shortDate(w.week)}: ${money(w.total)}${w.trips ? ` · ${w.trips} shop${w.trips > 1 ? 's' : ''}` : ''}`;
      hit.dataset.x = cx;
      hit.dataset.y = y(w.total);
    });
    if (weeks[latest].total > 0) {
      add('text', { x: pad.l + slot * latest + slot / 2, y: y(weeks[latest].total) - 5, class: 'value', 'text-anchor': 'middle' }, moneyShort(weeks[latest].total));
    }
    const wrap = el('div', { class: 'chart-wrap' }, svg, el('div', { class: 'chart-tip', hidden: true }));
    const tip = wrap.lastChild;
    const show = (t) => {
      tip.textContent = t.dataset.tip;
      tip.hidden = false;
      const box = svg.getBoundingClientRect();
      const sx = box.width / W;
      const left = Math.min(Math.max(+t.dataset.x * sx, 70), box.width - 70);
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, +t.dataset.y * sx - 8)}px`;
    };
    svg.addEventListener('pointerover', (e) => { if (e.target.classList.contains('hit')) show(e.target); });
    svg.addEventListener('focusin', (e) => { if (e.target.classList.contains('hit')) show(e.target); });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; });
    svg.addEventListener('focusout', () => { tip.hidden = true; });
    return wrap;
  }

  function niceStep(raw) {
    const p = 10 ** Math.floor(Math.log10(raw));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function categoryBars(rows) {
    const max = Math.max(...rows.map((r) => r.total), 1);
    const sum = rows.reduce((s, r) => s + r.total, 0);
    return el('ul', { class: 'hbars' }, rows.map((r) => el('li', { dataset: { cat: r.category } },
      el('span', { class: 'hb-label' }, r.category),
      el('span', { class: 'hb-track' }, el('span', { class: 'hb-fill', style: `width:${(r.total / max) * 100}%` })),
      el('span', { class: 'hb-value' }, money(r.total), el('small', {}, ` ${Math.round((r.total / sum) * 100)}%`)))));
  }

  function renderInsights() {
    const receipts = st().receipts;
    const today = todayStr();
    const hasData = receipts.length > 0;
    $('insightsEmpty').hidden = hasData;
    $('insightsBody').hidden = !hasData;
    $('sampleNote').hidden = !receipts.some((r) => r.sample);
    if (!hasData) return;

    // Prediction first: it's the thing to act on.
    const preds = predictNextShop(receipts, today, 7);
    const onList = new Set(ctx.currentListNames());
    const list = $('predList');
    list.replaceChildren();
    if (!preds.length) {
      $('predHint').textContent = receipts.length < 2
        ? 'Add at least two receipts so the app can learn how often you buy things.'
        : 'Nothing looks due in the next 7 days.';
    } else {
      $('predHint').textContent = 'Based on how often you usually buy each item.';
    }
    for (const p of preds) {
      const already = onList.has(p.name.toLowerCase());
      if (!predictionChecks.has(p.name)) predictionChecks.set(p.name, p.confidence >= 0.55 && !already);
      const level = p.confidence >= 0.75 ? 'high' : p.confidence >= 0.55 ? 'medium' : 'low';
      const cb = el('input', { type: 'checkbox', checked: predictionChecks.get(p.name), disabled: already, 'aria-label': `Add ${p.name}` });
      cb.addEventListener('change', () => { predictionChecks.set(p.name, cb.checked); updatePredTotal(preds); });
      list.append(el('li', { class: `pred ${already ? 'on-list' : ''}` },
        el('label', { class: 'pred-main' }, cb,
          el('span', { class: 'pred-body' },
            el('span', { class: 'pred-name' }, p.name, el('span', { class: 'pred-qty' }, p.unit ? ` ${p.qty} ${p.unit}` : p.qty > 1 ? ` ×${p.qty}` : '')),
            el('span', { class: 'pred-why' }, already ? 'Already on your list' : predictionReason(p)))),
        el('span', { class: 'pred-side' },
          el('span', { class: 'pred-cost' }, money(p.estCost)),
          el('span', { class: `chip ${level}`, title: `${Math.round(p.confidence * 100)}% confidence` }, level === 'high' ? 'Likely' : level === 'medium' ? 'Probably' : 'Maybe'))));
    }
    $('predAdd').onclick = () => {
      const chosen = preds.filter((p) => predictionChecks.get(p.name) && !onList.has(p.name.toLowerCase()));
      if (!chosen.length) { ctx.toast('Tick the items you want to add'); return; }
      const n = ctx.addToList(chosen.map((p) => ({ name: p.name, qty: p.qty, unit: p.unit, category: p.category, price: p.estCost && p.qty ? +(p.estCost / (p.unit ? 1 : p.qty)).toFixed(2) : null })));
      predictionChecks = new Map();
      ctx.toast(`Added ${n} item${n === 1 ? '' : 's'} to your list`);
      ctx.showView('list');
    };
    updatePredTotal(preds);

    // Headline numbers.
    const s = summary(receipts, today, 28);
    $('tiles').replaceChildren(
      tile('Spent, last 4 weeks', money(s.spent)),
      tile('Average per week', money(s.perWeek)),
      tile('Average per shop', s.trips ? money(s.perTrip) : '–'),
      tile('Shops, last 4 weeks', String(s.trips)));

    $('weekChart').replaceChildren(weekChart(weeklySpend(receipts, today, 8)));

    const cats = categorySpend(receipts, today, 56);
    $('catChart').replaceChildren(cats.length ? categoryBars(cats) : el('p', { class: 'hint' }, 'No itemised receipts in the last 8 weeks.'));

    const top = topItems(receipts, today, 56, 8);
    $('topTable').replaceChildren(
      el('thead', {}, el('tr', {}, el('th', {}, 'Item'), el('th', { class: 'num' }, 'Times'), el('th', { class: 'num' }, 'Spent'))),
      el('tbody', {}, top.map((t) => el('tr', {}, el('td', {}, t.name), el('td', { class: 'num' }, String(t.times)), el('td', { class: 'num' }, money(t.spent))))));

    const changes = priceChanges(receipts).slice(0, 6);
    $('priceCard').hidden = !changes.length;
    $('priceList').replaceChildren(...changes.map((c) => el('li', {},
      el('span', {}, c.name),
      el('span', { class: 'price-move' },
        `${money(c.prev)} → ${money(c.latest)}${c.unit ? `/${c.unit}` : ''} `,
        el('span', { class: `chip ${c.change > 0 ? 'up' : 'down'}` }, `${c.change > 0 ? '▲ +' : '▼ '}${Math.round(c.change * 100)}%`)))));
  }

  function updatePredTotal(preds) {
    const chosen = preds.filter((p) => predictionChecks.get(p.name));
    $('predTotal').textContent = chosen.length ? `${chosen.length} items · ~${money(chosen.reduce((s, p) => s + p.estCost, 0))}` : '';
    $('predAdd').hidden = !preds.length;
    $('predAdd').textContent = chosen.length ? `Add ${chosen.length} to list` : 'Add to list';
  }

  function tile(label, value) {
    return el('div', { class: 'tile' }, el('span', { class: 'tile-label' }, label), el('span', { class: 'tile-value' }, value));
  }

  $('sampleBtn').addEventListener('click', () => {
    st().receipts.push(...makeSampleReceipts(todayStr()));
    st().receipts.sort((a, b) => b.date.localeCompare(a.date));
    ctx.save();
    render();
  });
  $('removeSampleBtn').addEventListener('click', () => {
    st().receipts = st().receipts.filter((r) => !r.sample);
    predictionChecks = new Map();
    ctx.save();
    render();
    ctx.toast('Sample receipts removed');
  });

  function render() {
    renderReceiptList();
    renderInsights();
  }

  return { render, scan };
}
