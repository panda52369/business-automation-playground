const QUOTE = (() => {
  const FREEMAIL = ['gmail.com','gmail.example','yahoo.com','yahoo.example','hotmail.com','outlook.com','aol.com','icloud.com','proton.me','protonmail.com','mail.com','gmx.com'];

  const CORE = ['0','1','2','3','4','6','7'];

  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return (d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) ? d : null;   
  }

  function parseWeight(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    const s = String(v ?? '').trim().replace(/\s*(lbs?|pounds)\.?$/i, '');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) || /^\d+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
    return NaN;
  }

  function validate(b, now = new Date()) {
    const errs = [];
    const str = v => (v === undefined || v === null) ? '' : String(v).trim();
    const zip = (v, label) => { const s = str(v); const m = /^(\d{5})(-\d{4})?$/.exec(s); if (!m) { errs.push(`invalid ${label} ZIP`); return s.slice(0, 10); } return m[1]; };
    const l = { company: str(b.company).slice(0, 200), contact_name: str(b.contact_name || b.name).slice(0, 120), email: str(b.email).toLowerCase().slice(0, 254), phone: str(b.phone).slice(0, 40),
      origin_zip: zip(b.origin_zip, 'origin'), dest_zip: zip(b.dest_zip, 'destination'), weight_lbs: parseWeight(b.weight_lbs),
      ship_date: str(b.ship_date), notes: str(b.notes).slice(0, 2000), recurring: ['yes','true','weekly','monthly'].includes(str(b.recurring).toLowerCase()) };
    const p = b.pallets === undefined || b.pallets === null || b.pallets === '' ? 0 : (typeof b.pallets === 'number' ? b.pallets : (/^\d+$/.test(str(b.pallets)) ? Number(str(b.pallets)) : NaN));
    if (!(Number.isInteger(p) && p >= 0 && p <= 60)) errs.push('pallets must be a whole number 0-60'); l.pallets = Number.isInteger(p) && p >= 0 ? p : 0;
    if (!l.company) errs.push('company missing');
    if (str(b.email).length > 254) errs.push('email longer than 254 characters');
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(l.email) || /[\r\n<>,;"]/.test(l.email)) errs.push('invalid email');
    if (/[\r\n]/.test(String(b.contact_name || b.name || '') + String(b.company || ''))) errs.push('line breaks in name/company');
    if (!(l.weight_lbs > 0 && l.weight_lbs < 200000)) errs.push('weight missing/out of range');
    const today = new Date(now); today.setUTCHours(0, 0, 0, 0);
    const sd = parseDate(l.ship_date);
    if (!sd) errs.push('invalid ship date (YYYY-MM-DD, real calendar date)'); else if (sd < today) errs.push('ship date in the past'); else if (sd - today > 366 * 864e5) errs.push('ship date more than a year out');
    l.days_to_ship = sd ? Math.round((sd - today) / 864e5) : null;
    l.lane = l.origin_zip.slice(0, 3) + 'xx->' + l.dest_zip.slice(0, 3) + 'xx';
    l.mode = (l.weight_lbs >= 15000 || l.pallets >= 12) ? 'FTL' : (l.weight_lbs < 150 && l.pallets === 0) ? 'Parcel' : 'LTL';
    l.urgency = l.days_to_ship === null ? 'unknown' : l.days_to_ship <= 3 ? 'high' : l.days_to_ship <= 14 ? 'medium' : 'low';
    return { lead: l, errors: errs, valid: errs.length === 0 };
  }

  function ruleScore(l) {
    let s = 0; const r = []; const w = l.weight_lbs;
    if (w >= 10000) { s += 30; r.push('heavy load >=10k lb (+30)'); } else if (w >= 2000) { s += 20; r.push('LTL-size 2k-10k lb (+20)'); } else if (w >= 150) { s += 10; r.push('small LTL (+10)'); } else { s += 2; r.push('parcel-size (+2)'); }
    const oc = CORE.includes(l.origin_zip[0]), dc = CORE.includes(l.dest_zip[0]);
    if (oc && dc) { s += 20; r.push('both ends in core lanes (+20)'); } else if (oc || dc) { s += 10; r.push('one end in core lanes (+10)'); } else r.push('out-of-network lane (+0)');
    const days = l.days_to_ship;
    if (days <= 3) { s += 20; r.push('ships within 3 days (+20)'); } else if (days <= 14) { s += 12; r.push('ships within 2 weeks (+12)'); } else { s += 4; r.push('ships 2+ weeks out (+4)'); }
    const dom = l.email.split('@')[1];
    if (FREEMAIL.includes(dom)) { s -= 10; r.push('free-mail domain (-10)'); } else { s += 15; r.push('business domain ' + dom + ' (+15)'); }
    if (l.pallets > 0) { s += 5; r.push('pallet count given (+5)'); }
    if (l.recurring) { s += 10; r.push('recurring volume (+10)'); }
    const raw = s; s = Math.max(0, Math.min(100, s)); if (raw !== s) r.push('raw score ' + raw + ' clamped to ' + s);
    const grade = gradeOf(s);
    const present = [!!l.phone, !!l.notes, l.pallets > 0, !!l.contact_name, !FREEMAIL.includes(dom)].filter(Boolean).length;
    const margin = Math.min(1, Math.min(Math.abs(raw - 75), Math.abs(raw - 45)) / 20);
    let conflicts = 0;
    if (FREEMAIL.includes(dom) && w >= 10000) { conflicts++; r.push('conflict: free-mail + heavy freight'); }
    if (l.pallets === 0 && w >= 2000) { conflicts++; r.push('conflict: heavy but no pallets'); }
    let conf = Math.max(0.05, Math.min(0.95, 0.3 + 0.35 * present / 5 + 0.3 * margin - 0.25 * conflicts));
    r.push(`confidence = 0.30 + 0.35*completeness(${present}/5) + 0.30*margin(${margin.toFixed(2)}) - 0.25*conflicts(${conflicts})`);
    return { score: s, raw_score: raw, grade, confidence: Math.round(conf * 100) / 100, reasons: r, scored_by: 'rules' };
  }

  function gradeOf(score) { return score >= 75 ? 'A' : score >= 45 ? 'B' : 'C'; }
  return { validate, ruleScore };
})();
