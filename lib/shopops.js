const SHOPOPS = (() => {
  const has = (obj, k) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, k);

  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  const isPosInt = n => Number.isSafeInteger(n) && n > 0;

  const isNonNegInt = n => Number.isSafeInteger(n) && n >= 0;

  const MAX_QTY = 10000, MAX_LINES = 250;

  const MINOR = { JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, HUF: 2, TWD: 2, UGX: 0, XAF: 0, XOF: 0, PYG: 0, KWD: 3, BHD: 3, JOD: 3, OMR: 3, TND: 3 };

  const minorUnits = cur => MINOR[String(cur || '').toUpperCase()] ?? 2;

  function toCents(v, cur) {
    const e = minorUnits(cur), m = /^(\d{1,12})(?:\.(\d+))?$/.exec(String(v ?? '')); if (!m) return null;
    let f = m[2] || ''; if (f.length > e) { if (!/^0*$/.test(f.slice(e))) return null; f = f.slice(0, e); }
    return Number(m[1]) * 10 ** e + Number(f.padEnd(e, '0') || '0');
  }

  function validateSeed(inv) {
    const e = [];
    if (!inv || typeof inv !== 'object' || Array.isArray(inv) || !Object.keys(inv).length) return ['seed must be a non-empty object of SKUs'];
    for (const [sku, v] of Object.entries(inv)) {
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(sku) || BAD_KEYS.has(sku)) e.push(`bad sku "${sku}"`);
      if (!v || typeof v !== 'object') { e.push(`${sku}: not an object`); continue; }
      for (const k of ['on_hand', 'reserved', 'reorder_point', 'reorder_qty']) if (!isNonNegInt(v[k]) || v[k] > 1e9) e.push(`${sku}.${k} must be a non-negative integer`);
      if (isNonNegInt(v.on_hand) && isNonNegInt(v.reserved) && v.reserved > v.on_hand) e.push(`${sku}: reserved > on_hand`);
      for (const k of ['title', 'bin', 'supplier']) if (!v[k] || !noCtl(v[k])) e.push(`${sku}.${k} missing/invalid`);
    }
    return e;
  }

  const noCtl = v => typeof v === 'string' && !/[\r\n\0]/.test(v);

  const str = (v, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && noCtl(v);

  function validateOrder(b) {
    const e = [];
    if (!b || typeof b !== 'object' || Array.isArray(b)) return ['body not a JSON object'];
    if (!isPosInt(b.id)) e.push('missing/invalid order id');
    if (!noCtl(b.name || '') || !b.name) e.push('missing/invalid order name');
    if (!noCtl(b.email || '') || !/^[^@\s<>",]+@[^@\s<>",]+\.[A-Za-z]{2,}$/.test(b.email || '')) e.push('missing/invalid customer email');
    if (toCents(b.total_price, b.currency) === null) e.push('invalid total_price');
    if (!/^[A-Z]{3}$/.test(String(b.currency ?? ''))) e.push('invalid currency');
    if (Number.isNaN(Date.parse(b.created_at))) e.push('invalid created_at');
    if (!Array.isArray(b.line_items) || !b.line_items.length) e.push('no line_items');
    else if (b.line_items.length > MAX_LINES) e.push(`more than ${MAX_LINES} line_items`);
    else {
      const seen = new Set();
      b.line_items.forEach((l, i) => {
        if (!l || typeof l !== 'object') { e.push(`line ${i} is not an object`); return; }
        if (!isPosInt(l.id)) e.push(`line ${i} invalid id`); else if (seen.has(l.id)) e.push(`line ${i} duplicate line id ${l.id}`); else seen.add(l.id);
        if (!str(l.sku, 64)) e.push(`line ${i} missing sku`); else if (BAD_KEYS.has(l.sku)) e.push(`line ${i} invalid sku (reserved name)`);
        if (!isPosInt(l.quantity) || l.quantity > MAX_QTY) e.push(`line ${i} quantity must be a positive integer (1-${MAX_QTY})`);
      });
    }
    const a = b.shipping_address;
    if (!a || typeof a !== 'object' || !['name', 'address1', 'city', 'province_code', 'zip'].every(k => str(a[k], 120)) || (a.address2 != null && a.address2 !== '' && !str(a.address2, 120)))
      e.push('missing/invalid shipping address (name, address1, city, province_code, zip required)');
    return e;
  }

  function planFreshRun(inventory, o, attempt) {
    const unknown = [...new Set(o.line_items.filter(l => BAD_KEYS.has(l.sku) || !has(inventory, l.sku)).map(l => l.sku))];
    if (unknown.length) return { held: true, unknown, decision: { action: 'held', http: 200, result: 'held_exception_unknown_sku', order_id: o.id, unknown_skus: unknown, threepl: 'not pushed', exception: { type: 'UNKNOWN_SKU_BLOCKED', order_id: o.id, detail: `unknown ${unknown.join(', ')}; order held, NOT pushed to 3PL, excluded from revenue` } } };
    
    const work = new Map(), picks = [], backorders = [];
    for (const l of o.line_items) {
      const inv = inventory[l.sku];
      if (!work.has(l.sku)) work.set(l.sku, inv.on_hand - inv.reserved);
      const take = Math.max(0, Math.min(work.get(l.sku), l.quantity)); work.set(l.sku, work.get(l.sku) - take);
      if (take > 0) picks.push({ line_id: l.id, sku: l.sku, title: inv.title, bin: inv.bin, qty: take });
      if (take < l.quantity) backorders.push({ line_id: l.id, sku: l.sku, short: l.quantity - take });
    }
    return { held: false, picks, backorders, decision: { action: 'process', order_id: o.id, attempt, picks, backorders } };
  }

  function applyReservation(inventory, picks) { for (const p of picks) inventory[p.sku].reserved += p.qty; }
  return { validateOrder, validateSeed, planFreshRun, applyReservation };
})();
