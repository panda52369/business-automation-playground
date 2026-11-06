// Derived from committed sample_requests.json, sample_orders.json, inventory_seed.json,
// and freight-audit/tests/unit/audit.test.js. Addresses use reserved .example domains.
(() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const quoteInputs = [{"_case": "A-lead: heavy FTL, business domain, ships in 2 days, recurring", "company": "Great Lakes Steel Supply", "contact_name": "Dana Kowalski", "email": "dana.k@customer.example", "phone": "+1-216-555-0142", "origin_zip": "44115", "dest_zip": "30318", "weight_lbs": "38,000", "pallets": 20, "ship_date": "+2", "recurring": "weekly", "notes": "Flatbed preferred, steel coils, dock at both ends"}, {"_case": "B-lead: mid LTL, business domain, 9 days out", "company": "Brightside Home Goods", "contact_name": "Marcus Lee", "email": "marcus@customer.example", "phone": "+1-713-555-0199", "origin_zip": "77029", "dest_zip": "60632", "weight_lbs": 3200, "pallets": 4, "ship_date": "+9", "notes": "Liftgate at delivery"}, {"_case": "C-lead: parcel-size, free-mail, far out, out-of-network", "company": "Etsy candle shop", "contact_name": "Jo Rivera", "email": "jo.candles@gmail.example", "origin_zip": "97205", "dest_zip": "85004", "weight_lbs": 40, "pallets": 0, "ship_date": "+42"}, {"_case": "Low confidence -> needs review: free-mail but 24k lb, no pallets, no phone", "company": "RJ Trucking Customer", "contact_name": "Rick J", "email": "rickj1988@yahoo.example", "origin_zip": "75201", "dest_zip": "10001", "weight_lbs": 24000, "pallets": 0, "ship_date": "+3"}];
  const seed = {"TP-TENT-2P": {"title": "Ridgeline 2-Person Tent", "bin": "A-01-1", "on_hand": 12, "reserved": 0, "reorder_point": 5, "reorder_qty": 20, "supplier": "Summit Gear Co"}, "TP-BAG-20F": {"title": "Basecamp 20\u00b0F Sleeping Bag", "bin": "A-02-3", "on_hand": 8, "reserved": 0, "reorder_point": 3, "reorder_qty": 12, "supplier": "Summit Gear Co"}, "TP-PAD-INFL": {"title": "AirLite Inflatable Pad", "bin": "A-03-2", "on_hand": 0, "reserved": 0, "reorder_point": 3, "reorder_qty": 15, "supplier": "Northwind Outdoor"}, "TP-STOVE-MINI": {"title": "Pocket Backpacking Stove", "bin": "B-01-2", "on_hand": 6, "reserved": 0, "reorder_point": 4, "reorder_qty": 24, "supplier": "Flamecraft Ltd"}, "TP-HEADLAMP-300": {"title": "Beacon 300lm Headlamp", "bin": "B-03-1", "on_hand": 40, "reserved": 0, "reorder_point": 10, "reorder_qty": 50, "supplier": "Lumen Supply"}, "TP-BOTTLE-1L": {"title": "Trail Bottle 1L (Insulated)", "bin": "C-01-4", "on_hand": 25, "reserved": 0, "reorder_point": 8, "reorder_qty": 40, "supplier": "Northwind Outdoor"}, "TP-SOCK-MERINO-M": {"title": "Merino Hiking Socks (M)", "bin": "C-02-1", "on_hand": 30, "reserved": 0, "reorder_point": 10, "reorder_qty": 60, "supplier": "Woolpath Mills"}};
  const order = {"id": 1001, "admin_graphql_api_id": "gid://shopify/Order/1001", "name": "#1001", "order_number": 1001, "email": "emily@customer.example", "created_at": "2026-11-03T22:04:32+00:00", "currency": "USD", "financial_status": "paid", "fulfillment_status": null, "subtotal_price": "318.98", "total_price": "318.98", "customer": {"id": 8001, "first_name": "Emily", "last_name": "Chen"}, "line_items": [{"id": 100101, "variant_id": 4001, "sku": "TP-TENT-2P", "title": "Ridgeline 2-Person Tent", "quantity": 1, "price": "249.00", "fulfillable_quantity": 1}, {"id": 100102, "variant_id": 4002, "sku": "TP-HEADLAMP-300", "title": "Beacon 300lm Headlamp", "quantity": 2, "price": "34.99", "fulfillable_quantity": 2}], "shipping_lines": [{"title": "Standard Shipping", "price": "0.00"}], "shipping_address": {"name": "Emily Chen", "address1": "412 Maple Ave", "city": "Burlington", "province_code": "VT", "zip": "05401", "country_code": "US"}};
  const auditInput = {"invoice": {"doc_type": "INVOICE", "currency": "USD", "invoice_number": "HFL-1", "invoice_date": "2026-11-03", "pro_number": "PRO-5000", "bol_number": "BOL-100", "carrier": "Harborline Freight Lines", "billed_weight": 1000, "charges": [{"description": "Linehaul", "amount": 1000}, {"description": "Fuel surcharge", "amount": 200}], "total": 1200, "confidence": 1, "issues": []}, "quote": {"quote_id": "Q-1", "bol_number": "BOL-100", "pro_number": "PRO-5000", "carrier": "Harborline Freight Lines", "quoted_linehaul": "1000.00", "fuel_surcharge_pct": "20.0", "approved_accessorials": "", "currency": "USD"}, "bol": {"bol_number": "BOL-100", "pro_number": "PRO-5000", "carrier": "Harborline Freight Lines", "total_weight": 1000, "accessorials_requested": "None. Dock-to-dock."}};
  function createFixtures(now = new Date()) {
    const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
    const quote = quoteInputs.map((raw, n) => {
      const input = clone(raw), offset = Number(input.ship_date);
      input.ship_date = new Date(+day + offset * 86400000).toISOString().slice(0, 10);
      delete input._case;
      return { id: ['a','b','c','review'][n], label: ['A — urgent FTL','B — planned LTL','C — small parcel','Review — low completeness'][n], description: ['Heavy recurring freight on core lanes.','Mid-size LTL shipping in nine days.','Small parcel on an out-of-network lane.','Heavy freight without pallets; inspect rule confidence.'][n], input };
    });
    const shop = ['normal','shortage','unknown'].map((id, n) => {
      const input = { order: clone(order), seed: clone(seed) };
      if (n === 1) input.order.line_items[0].quantity = 20;
      if (n === 2) input.order.line_items[0].sku = 'UNKNOWN-SKU';
      return { id, label: ['Available inventory','Partial shortage','Unknown SKU hold'][n], description: ['Reserve available units only; no dispatch.','Demand exceeds available tent inventory.','Unrecognised SKU holds the entire order.'][n], input };
    });
    const audit = ['matching','overcharge','review'].map((id, n) => {
      const input = clone(auditInput);
      if (n === 1) { input.invoice.charges[0].amount = 1500; input.invoice.total = 1700; }
      if (n === 2) input.invoice.currency = 'UNKNOWN';
      return { id, label: ['Matching invoice','Linehaul overcharge','Currency review'][n], description: ['Compare structured invoice to quote and BOL.','Linehaul exceeds the original quote.','Unrecognised currency requires a person.'][n], input };
    });
    return { quote, shop, audit };
  }
  window.DemoPlayground = { createFixtures, fixtures: createFixtures() };
})();
