(() => {
  // Default REVIEW_MIN_CONFIDENCE in the quote workflow.
  const quoteMinConfidence = 0.5;
  const maxSafeMoney = Number.MAX_SAFE_INTEGER / 100;
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function checked(value) {
    try {
      const json = JSON.stringify(value);
      if (json === undefined || new TextEncoder().encode(json).length > 16384) return { errors: ['Payload must be JSON and at most 16 KiB.'] };
      const input = JSON.parse(json);
      const errors = [];
      function visit(v) {
        if (Array.isArray(v)) {
          if (v.length > 20) errors.push('Collections may contain at most 20 rows.');
          v.forEach(visit);
        } else if (object(v)) {
          if (Object.keys(v).some(k => ['__proto__','constructor','prototype'].includes(k))) errors.push('Reserved object key.');
          Object.values(v).forEach(visit);
        }
      }
      visit(input);
      return { input, errors: [...new Set(errors)] };
    } catch (_) { return { errors: ['Payload must be serializable JSON.'] }; }
  }
  function clock(now) {
    if (!(now instanceof Date) && typeof now !== 'string' && typeof now !== 'number' && now !== undefined) return null;
    const d = now === undefined ? new Date() : new Date(now);
    return Number.isFinite(+d) ? d : null;
  }
  function runQuote(input, now) {
    const c = checked(input), date = clock(now);
    const errors = c.errors.slice();
    if (!object(c.input)) errors.push('Quote input must be an object.');
    if (!date) errors.push('Invalid run date.');
    if (errors.length) return { valid: false, errors, lead: null, decision: null, needsReview: false };
    const result = QUOTE.validate(c.input, date);
    const decision = result.valid ? QUOTE.ruleScore(result.lead) : null;
    const needsReview = decision !== null && Boolean(decision.force_review || decision.confidence < quoteMinConfidence);
    return { ...result, decision, needsReview };
  }
  function runShop(order, seed, now) {
    const c = checked({ order, seed }), date = clock(now);
    const errors = c.errors.slice();
    if (!object(c.input?.order)) errors.push('Order must be an object.');
    if (!object(c.input?.seed)) errors.push('Inventory seed must be an object.');
    else if (Object.keys(c.input.seed).length > 20) errors.push('Inventory may contain at most 20 rows.');
    if (!date) errors.push('Invalid run date.');
    if (!errors.length) {
      const order = c.input.order;
      if (typeof order.name === 'string' && !order.name.trim()) order.name = '';
      errors.push(...SHOPOPS.validateOrder(order), ...SHOPOPS.validateSeed(c.input.seed));
    }
    if (errors.length) return { valid: false, errors, decision: null, inventoryBefore: null, inventoryAfter: null };
    // A fresh run has no earlier delivery, so the planner's decision is the whole outcome. The planner is the same pure code the backend calls.
    const inventory = clone(c.input.seed);
    const inventoryBefore = clone(inventory);
    const plan = SHOPOPS.planFreshRun(inventory, c.input.order, 1);
    if (!plan.held) SHOPOPS.applyReservation(inventory, plan.picks);
    return { valid: true, errors: [], decision: plan.decision, inventoryBefore, inventoryAfter: clone(inventory) };
  }
  function runAudit(invoice, quote, bol) {
    const c = checked({ invoice, quote, bol }), errors = c.errors.slice();
    for (const key of ['invoice','quote','bol']) if (!object(c.input?.[key])) errors.push(key + ' must be an object.');
    // Structural input errors are separate from invoice review decisions.
    if (object(c.input?.invoice) && c.input.invoice.charges !== undefined && (!Array.isArray(c.input.invoice.charges) || c.input.invoice.charges.some(row => !object(row)))) errors.push('Charges must be an array of objects.');
    if (object(c.input?.quote) && c.input.quote.approved_accessorials != null && typeof c.input.quote.approved_accessorials !== 'string') errors.push('Approved accessorials must be text.');
    if (errors.length) return { valid: false, errors, decision: null };
    const { invoice: input, quote: baseline, bol: shipment } = c.input;
    // The workflow checks document identity before invoking the line-item audit.
    const missing = ['invoice_number', 'invoice_date'].filter(key => !String(input[key] ?? '').trim());
    if (missing.length) {
      return { valid: true, errors: [], decision: { review: 'Missing mandatory invoice fields: ' + missing.map(key => key.replaceAll('_', ' ')).join(', ') } };
    }
    // Beyond this range, cents cannot be represented as safe integers.
    const amounts = [input.total, ...(input.charges ?? []).map(charge => charge.amount), baseline.quoted_linehaul];
    if (amounts.some(amount => (typeof amount === 'number' || typeof amount === 'string') && Math.abs(AUDIT.num(amount)) > maxSafeMoney)) {
      return { valid: true, errors: [], decision: { review: 'An invoice or quote amount exceeds the supported monetary range.' } };
    }
    const decision = AUDIT.auditInvoice(input, baseline, shipment, { tolPct: 5 });
    if (!decision.review && [decision.expected_total, decision.overcharge, decision.variance_pct].some(amount => !Number.isFinite(amount))) {
      return { valid: true, errors: [], decision: { review: 'An audit amount or percentage exceeds the supported range.' } };
    }
    return { valid: true, errors: [], decision };
  }
  // Coercion of malformed JSON field types must not escape the synchronous API.
  const guarded = (fn, empty) => (...args) => {
    try { return fn(...args); }
    catch (_) { return { valid: false, errors: ['Malformed field types; use the fixture structure.'], ...empty }; }
  };
  Object.assign(window.DemoPlayground, {
    runQuote: guarded(runQuote, { lead: null, decision: null, needsReview: false }),
    runShop: guarded(runShop, { decision: null, inventoryBefore: null, inventoryAfter: null }),
    runAudit: guarded(runAudit, { decision: null })
  });
})();
