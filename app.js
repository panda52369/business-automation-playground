(() => {
  'use strict';
  const api = window.DemoPlayground;
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  let flow = 'quote', preset = 'a', current;
  const titles = { quote: 'Freight qualification', shop: 'Order inventory', audit: 'Freight audit' };
  const qFields = [['company','Company'],['contact_name','Contact name'],['email','Email','email'],['phone','Phone'],['origin_zip','Origin ZIP'],['dest_zip','Destination ZIP'],['weight_lbs','Weight (lb)'],['pallets','Pallets','number'],['ship_date','Ship date','date'],['recurring','Recurring volume','select'],['notes','Notes','textarea']];
  const sFields = [['name','Order name'],['email','Customer email','email'],['currency','Currency'],['financial_status','Financial status']];
  const aFields = [['invoice_number','Invoice number'],['invoice_date','Invoice date','date'],['carrier','Carrier'],['pro_number','PRO number'],['bol_number','BOL number'],['currency','Currency'],['billed_weight','Billed weight (lb)','number'],['total','Invoice total','number']];
  function el(tag, text, className) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; }
  function clear(node) { node.replaceChildren(); }
  function invalidate() { $('errors').hidden = true; clear($('errors')); for (const input of document.querySelectorAll('[aria-invalid]')) { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); } const out=$('result'); if(!out.querySelector('.empty')){ clear(out); const box=el('div',undefined,'empty'); box.append(el('span','↗','empty-icon'),el('h4','Ready when you are.'),el('p','Run a scenario to see the decision and the reasoning behind it.')); out.append(box); } }
  function field(parent, spec, value, prefix = '') {
    const [key,label,type='text'] = spec, wrap=el('div',undefined,'field' + (type==='textarea' ? ' full' : ''));
    const id=prefix+key, lab=el('label',label); lab.htmlFor=id; let control;
    if(type==='select'){ control=el('select'); for(const [v,t] of [['','No'],['yes','Yes']]){const o=el('option',t);o.value=v;control.append(o);} control.value = value && value !== 'no' ? 'yes' : ''; }
    else if(type==='textarea'){ control=el('textarea'); control.value=value ?? ''; }
    else {control=el('input');control.type=type;control.value=value ?? ''; if(type==='number') control.step='any';}
    control.id=id;control.dataset.key=key;wrap.append(lab,control);parent.append(wrap); return control;
  }
  function group(title) { $('fields').append(el('h4',title,'group-title')); const grid=el('div',undefined,'form-grid'); $('fields').append(grid); return grid; }
  function baseline(title, lines) { $('fields').append(el('h4',title,'group-title'));const b=el('div',undefined,'baseline'); const ul=el('ul');lines.forEach(line=>ul.append(el('li',line)));b.append(ul);$('fields').append(b); }
  function rows(kind, items) {
    $('fields').append(el('h4',kind==='shop'?'Order items':'Invoice charges','group-title'));
    const container=el('div');container.id='rows';$('fields').append(container);
    function add(item={}) { if(container.children.length>=20)return; const row=el('div',undefined,'row-card');const head=el('div',undefined,'row-heading');const heading=el('span'); const remove=el('button','Remove','text-button');remove.type='button';remove.addEventListener('click',()=>{const next=row.nextElementSibling || row.previousElementSibling;row.remove();renumber();invalidate();(next?.querySelector('button') || addButton).focus();}); head.append(heading,remove);row.append(head);const grid=el('div',undefined,'form-grid');row.append(grid); const n=Date.now()+'-'+Math.random().toString(36).slice(2); if(kind==='shop'){field(grid,['sku','SKU'],item.sku,'row-'+n);field(grid,['quantity','Quantity','number'],item.quantity,'row-'+n);}else{field(grid,['description','Description'],item.description,'row-'+n);field(grid,['amount','Amount','number'],item.amount,'row-'+n);}row._original=clone(item);container.append(row);renumber(); }
    function renumber(){[...container.children].forEach((r,i)=>{r.querySelector('.row-heading span').textContent=`${kind==='shop'?'Item':'Charge'} ${i+1}`;r.querySelector('button').setAttribute('aria-label',`Remove ${kind==='shop'?'item':'charge'} ${i+1}`);}); addButton.disabled=container.children.length>=20;}
    const addButton=el('button',kind==='shop'?'+ Add item':'+ Add charge','text-button');addButton.type='button';addButton.addEventListener('click',()=>{add();invalidate();container.lastElementChild.querySelector('input').focus();});$('fields').append(addButton);items.forEach(add);renumber();
  }
  function render() {
    clear($('fields')); const input=current.input;
    if(flow==='quote'){const g=group('Contact & shipment');qFields.forEach(f=>field(g,f,input[f[0]]));}
    if(flow==='shop'){const g=group('Order details');sFields.forEach(f=>field(g,f,input.order[f[0]])); rows('shop',input.order.line_items); baseline('Starting inventory',Object.entries(input.seed).map(([sku,v])=>`${sku} · ${v.on_hand} on hand · ${v.reserved} reserved`));}
    if(flow==='audit'){const g=group('Invoice details');aFields.forEach(f=>field(g,f,input.invoice[f[0]]));rows('audit',input.invoice.charges); const q=input.quote,b=input.bol;baseline('Quote & bill of lading baseline',[`Quote ${q.quote_id}: linehaul ${q.quoted_linehaul} ${q.currency}, fuel ${q.fuel_surcharge_pct}%`,`Approved accessorials: ${q.approved_accessorials || 'None'}`,`BOL ${b.bol_number} · PRO ${b.pro_number} · ${b.carrier}`,`Weight ${b.total_weight} lb · ${b.accessorials_requested}`]);}
    $('preset-description').textContent=current.description; invalidate();
  }
  function selectPreset(now) { const choices=api.createFixtures(now)[flow]; current=clone(choices.find(f=>f.id===preset)||choices[0]);preset=current.id;clear($('preset'));for(const f of choices){const o=el('option',f.label);o.value=f.id;$('preset').append(o);}$('preset').value=preset;render(); }
  function value(key){return $(key).value;}
  function numeric(v){return v.trim()==='' ? '' : Number(v);}
  function collect() {
    const input=clone(current.input);
    if(flow==='quote'){for(const [key,,type] of qFields) input[key]=type==='number'?numeric(value(key)):value(key);return input;}
    if(flow==='shop') {for(const [key] of sFields)input.order[key]=value(key);input.order.line_items=[...$('rows').children].map((row,i)=>{const old=row._original;const sku=row.querySelector('[data-key=sku]').value,quantity=numeric(row.querySelector('[data-key=quantity]').value);return {...old,id:old.id ?? 900000+i,variant_id:old.variant_id ?? 900000+i,title:old.title ?? sku,price:old.price ?? '0.00',sku,quantity,fulfillable_quantity:quantity};});return input;}
    for(const [key,,type] of aFields)input.invoice[key]=type==='number'?numeric(value(key)):value(key);input.invoice.charges=[...$('rows').children].map(row=>({...row._original,description:row.querySelector('[data-key=description]').value,amount:numeric(row.querySelector('[data-key=amount]').value)}));return input;
  }
  function errors(messages){
    const box=$('errors');clear(box);box.hidden=false;box.append(el('strong','Please check your inputs'));const list=el('ul');
    const aliases=[[/\borigin zip\b/i,'origin_zip'],[/\bdestination zip\b/i,'dest_zip'],[/\bweight\b/i,'weight_lbs'],[/\bship date\b/i,'ship_date'],[/\bcompany\b/i,'company'],[/\bemail\b/i,'email'],[/\bpallets\b/i,'pallets'],[/\border name\b/i,'name'],[/\bcurrency\b/i,'currency']];
    for(const msg of messages){
      const rowMatch=/^line (\d+) /i.exec(msg);
      const display=rowMatch ? msg.replace(/^line \d+/i,`Item ${Number(rowMatch[1])+1}`) : msg;
      const li=el('li',display);list.append(li);
      const row=rowMatch && $('rows')?.children[Number(rowMatch[1])];
      let match;
      if(row){const key=/\bquantity\b/i.test(msg)?'quantity':/\bsku\b/i.test(msg)?'sku':null;match=key && row.querySelector(`[data-key="${key}"]`);}
      else if(!rowMatch){const alias=aliases.find(([pattern])=>pattern.test(msg));match=alias && $(alias[1]);}
      if(match){match.setAttribute('aria-invalid','true');match.setAttribute('aria-describedby','errors');const link=el('a','Go to field');link.href='#'+match.id;li.append(' ',link);}
    }
    box.append(list);box.focus();
  }
  function metric(container,label,v){if(v===undefined||v===null)return;const d=el('div',undefined,'metric');d.append(el('dt',label),el('dd',String(v)));container.append(d);}
  function listing(container,title,items){if(!items?.length)return;container.append(el('h5',title));const ul=el('ul');items.forEach(x=>ul.append(el('li',String(x))));container.append(ul);}
  function result(r,input) {const out=$('result');clear(out);const hero=el('div',undefined,'result-hero'),m=el('dl',undefined,'metrics');out.append(hero);if(flow==='quote'){const d=r.decision;hero.append(el('p','QUALIFICATION'),el('h4',r.needsReview ? `Needs review - Grade ${d.grade}` : `Grade ${d.grade}`),el('p',r.needsReview ? 'This result requires a person to review the decision. Heuristic confidence reflects the rules and input completeness; it is not a probability or price.' : 'Heuristic confidence reflects the rules and input completeness; it is not a probability or price.'));metric(m,'Score',`${d.score} / 100`);metric(m,'Heuristic confidence',`${Math.round(d.confidence*100)}%`);metric(m,'Mode',r.lead.mode);metric(m,'Urgency',r.lead.urgency);hero.append(m);listing(hero,'Why this result',d.reasons);}
    if(flow==='shop'){const d=r.decision;hero.append(el('p','INVENTORY DECISION'),el('h4',d.action==='held'?'Order held':'Reservation calculated'),el('p','This is a fresh simulation. Nothing is dispatched or sent to a fulfillment provider.'));listing(hero,'Reserved',d.picks?.map(x=>`${x.sku}: ${x.qty} · bin ${x.bin}`));listing(hero,'Backordered',d.backorders?.map(x=>`${x.sku}: ${x.short} short`));listing(hero,'Hold details',d.exception?[d.exception.detail]:[]);listing(hero,'Inventory after this run',Object.entries(r.inventoryAfter).filter(([sku,v])=>v.reserved!==r.inventoryBefore[sku].reserved).map(([sku,v])=>`${sku}: ${v.reserved} reserved of ${v.on_hand} on hand`));}
    if(flow==='audit'){const d=r.decision;hero.append(el('p','AUDIT DECISION'),el('h4',d.review?'Needs review':d.outcome==='APPROVED_TO_PAY'?'No overcharge flagged':String(d.outcome||'Review').replaceAll('_',' ')),el('p',d.review || (d.outcome==='APPROVED_TO_PAY'?'This check looks for overcharges. Lower-than-quoted charges can pass. Payment requires separate authorization. No payment is made.':'The decision compares the invoice against the supplied quote and bill of lading. No payment is made.')));metric(m,'Billed',`${input.invoice.currency || 'Unknown'} ${input.invoice.total ?? '—'}`);metric(m,'Expected',d.expected_total);metric(m,'Variance',d.overcharge);metric(m,'Variance %',d.variance_pct===undefined?undefined:`${d.variance_pct}%`);hero.append(m);listing(hero,'Findings',d.findings);listing(hero,'Evidence requested',d.evidence_requested);}
  }
  $('run').addEventListener('click',()=>{invalidate();const now=new Date(),input=collect();const r=flow==='quote'?api.runQuote(input,now):flow==='shop'?api.runShop(input.order,input.seed,now):api.runAudit(input.invoice,input.quote,input.bol);if(!r.valid){errors(r.errors);return;}result(r,input);});
  $('reset').addEventListener('click',()=>selectPreset(new Date()));$('preset').addEventListener('change',e=>{preset=e.target.value;selectPreset(new Date());});$('fields').addEventListener('input',invalidate);$('fields').addEventListener('change',invalidate);
  document.querySelectorAll('[data-flow]').forEach(button=>button.addEventListener('click',()=>{flow=button.dataset.flow;preset={quote:'a',shop:'normal',audit:'matching'}[flow];document.querySelectorAll('[data-flow]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('workspace-title').textContent=titles[flow];selectPreset(new Date());}));
  selectPreset(new Date());
})();
