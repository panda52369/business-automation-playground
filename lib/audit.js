const AUDIT = (() => {
  const money = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const num = s => { if (s == null || s === '') return null; const v = Number(String(s).replace(/[$,\s]/g, '')); return Number.isFinite(v) ? v : null; };

  const normCarrier = c => String(c || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(inc|llc|ltd|co|corp|company|the)\b/g, ' ').replace(/\s+/g, ' ').trim();

  const normId = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const ACC = [['DETENTION',/detention/i],['LIFTGATE',/lift\s*gate/i],['RESIDENTIAL',/residential/i],['LIMITED_ACCESS',/limited access/i],['INSIDE',/inside deliv/i],['REWEIGH',/reweigh|inspection/i],['REDELIVERY',/redeliver/i]];

  const EVID = {
    LINEHAUL: (c,q) => `Linehaul: a corrected invoice at the quoted ${money(Number(q.quoted_linehaul))} (rate confirmation ${q.quote_id}), or a signed rate amendment dated before pickup.`,
    FUEL: (c,q) => `Fuel: the fuel-surcharge table and DOE diesel index week you applied; our quote fixes ${q.fuel_surcharge_pct}% of the quoted linehaul.`,
    WEIGHT: (c,q,b) => `Weight: the certified reweigh / inspection certificate for ${c} (scale location, date, scale certificate number) supporting the billed weight vs ${Number(b.total_weight).toLocaleString()} lb on BOL ${b.bol_number}.`,
    DETENTION: () => 'Detention: the consignee-signed delivery receipt with in/out timestamps, the appointment time, and the detention notice sent before free time expired.',
    LIFTGATE: (c,q,b) => `Liftgate: the delivery receipt signed by the consignee showing liftgate use; BOL ${b.bol_number} requested "${b.accessorials_requested}".`,
    RESIDENTIAL: () => 'Residential delivery: proof the delivery address is classified residential (consignee is a business; BOL shows no residential request).',
    LIMITED_ACCESS: () => 'Limited access: documentation of the limited-access classification for the delivery site.',
    INSIDE: () => 'Inside delivery: the signed delivery receipt noting inside delivery was requested and performed.',
    REWEIGH: (c,q,b) => `Reweigh/inspection fee: the inspection certificate and scale ticket; no reweigh was authorized on BOL ${b.bol_number}.`,
    REDELIVERY: () => 'Redelivery: the failed-first-attempt record (date, time, reason) signed or noted by the consignee.',
    OTHER: (c) => `"${c}": the tariff item or rate confirmation that authorizes this charge.` };

  const accCode = d => (ACC.find(([, re]) => re.test(d)) || ['OTHER'])[0];

  const kindOf = d => /line\s*haul/i.test(d) ? 'LINEHAUL' : /fuel/i.test(d) ? 'FUEL' : accCode(d);

  const ACC_WORD = { DETENTION: /detention/i, LIFTGATE: /lift\s*gate/i, RESIDENTIAL: /residential/i, LIMITED_ACCESS: /limited access/i, INSIDE: /inside deliv/i, REWEIGH: /reweigh/i, REDELIVERY: /redeliver/i };

  const onBol = (kind, txt) => { const re = ACC_WORD[kind]; if (!re || !txt) return false;
    return String(txt).split(/[.;,]/).some(seg => re.test(seg) && !/\b(no|not|none|without|n\/a)\b/i.test(seg)); };

  function auditInvoice(x, q, b, cfg = {}) {
    const TOL = cfg.tolPct ?? 5;
    if (normId(q.pro_number) !== normId(x.pro_number) || normId(q.bol_number) !== normId(x.bol_number))
      return { review: `shipment identity mismatch: invoice PRO ${x.pro_number} / BOL ${x.bol_number} vs quote ${q.quote_id} PRO ${q.pro_number} / BOL ${q.bol_number}` };
    if (normId(b.pro_number) !== normId(x.pro_number)) return { review: `BOL ${b.bol_number} carries PRO ${b.pro_number}, invoice says ${x.pro_number}` };
    if (normCarrier(x.carrier) !== normCarrier(q.carrier) || normCarrier(b.carrier) !== normCarrier(q.carrier))
      return { review: `carrier mismatch: invoice "${x.carrier}", quote "${q.carrier}", BOL "${b.carrier}"` };
    if (!Array.isArray(x.charges) || !x.charges.length || x.charges.some(c => !Number.isFinite(c.amount) || c.amount < 0)) return { review: 'charge lines missing, negative or malformed (credits/adjustments need a human)' };
    if (!Number.isFinite(x.total)) return { review: 'invoice total unreadable' };
    if (!(x.total > 0)) return { review: `invoice total ${money(x.total)} is zero or negative; a person must decide` };
    const lineSum = +x.charges.reduce((t, c) => t + c.amount, 0).toFixed(2);
    if (Math.abs(lineSum - x.total) > 0.01) return { review: `invoice total ${money(x.total)} != sum of charge lines ${money(lineSum)}` };
    if (x.currency == null || String(x.currency).trim() === '') return { review: 'currency missing from the extract; a reviewer must set currency=... before this can be audited' };
    if (String(x.currency || '').toUpperCase() === 'UNKNOWN') return { review: `currency not recognised ("${String(x.currency_text || '?').slice(0, 40)}"); a reviewer must set currency=... before this can be audited` };
    const cur = String(x.currency).trim().toUpperCase(), qcur = String(q.currency || 'USD').trim().toUpperCase() || 'USD';
    if (cur !== qcur) return { review: `invoice currency ${cur} differs from quote currency ${qcur}; no FX conversion in this demo` };
    const ql = num(q.quoted_linehaul), fuelPct = num(q.fuel_surcharge_pct);
    if (!(ql > 0) || !(fuelPct >= 0)) return { review: `quote ${q.quote_id} has no usable linehaul/fuel baseline (zero or missing)` };
    const approved = Object.fromEntries((q.approved_accessorials || '').split(';').filter(Boolean).map(s => { const [k, v] = s.split(':'); return [k, num(v)]; }));
    const findings = [], ev = [], lines = [], seen = {};
    const askEv = (k, c) => { const t = (EVID[k] || EVID.OTHER)(c, q, b); if (!ev.includes(t)) ev.push(t); };
    let hardFlag = false, lineFlag = false, needsReview = null;
    for (const c of x.charges) {
      const kind = kindOf(c.description); seen[kind] = (seen[kind] || 0) + 1;
      let exp;
      if (seen[kind] > 1) { exp = 0; hardFlag = true; askEv(kind, c.description); findings.push(`Repeated charge: "${c.description}" ${money(c.amount)} is billed ${kind} line #${seen[kind]}; expected once`); }
      else if (kind === 'LINEHAUL') exp = ql;
      else if (kind === 'FUEL') exp = +(ql * fuelPct / 100).toFixed(2);
      else if (kind in approved) { exp = approved[kind]; if (c.amount > exp) { hardFlag = true; askEv(kind, c.description); findings.push(`Accessorial "${c.description}" billed ${money(c.amount)} vs approved ${money(exp)}`); } }
      else if (onBol(kind, b.accessorials_requested)) { exp = 0; needsReview = `"${c.description}" ${money(c.amount)} was requested on BOL ${b.bol_number} but has no quoted price; a person must approve the rate`; }
      else { exp = 0; hardFlag = true; askEv(kind, c.description); findings.push(`Accessorial not quoted or requested on BOL: "${c.description}" ${money(c.amount)}`); }
      const v = +(c.amount - exp).toFixed(2);
      if (seen[kind] === 1 && kind === 'LINEHAUL' && v > 0) { askEv('LINEHAUL'); findings.push(`Linehaul billed ${money(c.amount)} vs quoted ${money(ql)} (quote ${q.quote_id}), +${money(v)}`); }
      if (seen[kind] === 1 && kind === 'FUEL' && v > 0.01) { askEv('FUEL'); findings.push(`Fuel billed ${money(c.amount)} vs ${fuelPct}% of quoted linehaul ${money(exp)}, +${money(v)}`); }
      const overLine = seen[kind] === 1 && exp > 0 && v > +(exp * TOL / 100).toFixed(2);
      if (overLine) { lineFlag = true; askEv(kind, c.description); findings.push(`Line over the ${TOL}% per-line tolerance: "${c.description}" ${money(c.amount)} vs expected ${money(exp)} (+${(100 * v / exp).toFixed(1)}%)`); }
      lines.push({ ...c, kind, expected: exp, variance: v, over_tolerance: overLine });
    }
    if (!seen.LINEHAUL) return { review: 'no linehaul line on the invoice; cannot build the expected total' };
    if (needsReview && !hardFlag) return { review: needsReview };
    const expected = +lines.reduce((s, l) => s + l.expected, 0).toFixed(2);
    if (!(expected > 0)) return { review: 'zero expected baseline' };
    let weightFlag = false;
    if (x.billed_weight && b.total_weight && Math.abs(x.billed_weight - b.total_weight) / b.total_weight > 0.05) { weightFlag = true; askEv('WEIGHT', x.pro_number); findings.push(`Billed weight ${x.billed_weight.toLocaleString()} lb vs BOL ${b.total_weight.toLocaleString()} lb (${(100 * (x.billed_weight / b.total_weight - 1)).toFixed(1)}%)`); }
    const over = +(x.total - expected).toFixed(2), pct = +(100 * over / expected).toFixed(2);
    const flagged = pct > TOL || (lineFlag && over > 0) || (hardFlag && over > 0) || (weightFlag && over > 0);
    if (!flagged && (weightFlag || hardFlag || lineFlag)) return { review: 'finding without a positive variance: ' + findings.join('; ') };
    return { expected_total: expected, overcharge: over, variance_pct: pct, lines, findings, evidence_requested: ev,
      outcome: flagged ? 'DISPUTE' : 'APPROVED_TO_PAY', disputed_amount: flagged ? over : 0, approved_amount: flagged ? expected : x.total };
  }
  return { num, auditInvoice };
})();
