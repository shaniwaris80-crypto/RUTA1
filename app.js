/* FACTURA AW v1.8 PRO FIREBASE
   Cliente limpio + informe interno privado.
   Modo blanco por defecto, panel lateral desplegable, cuadrículas estables y sugerencias no bloqueantes.
*/
(() => {
  'use strict';

  const APP_KEY = 'factura_aw_v14_pro_state'; // se mantiene para conservar datos al actualizar
  const DRAFT_KEY = 'factura_aw_v14_pro_drafts';

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const uid = (p='id') => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
  const todayISO = () => new Date().toISOString().slice(0,10);
  const nowStamp = () => new Date().toLocaleString('es-ES');

  function toNumber(value) {
    if (value === null || value === undefined) return 0;
    let s = String(value).trim();
    if (!s) return 0;
    s = s.replace(/\s/g, '').replace(/€/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  function round2(n){ return Math.round((toNumber(n) + Number.EPSILON) * 100) / 100; }
  function fmtMoney(n){ return `${round2(n).toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})} €`; }
  function fmtNum(n, max=3){
    const val = toNumber(n);
    return val.toLocaleString('es-ES',{minimumFractionDigits:0, maximumFractionDigits:max});
  }
  function esc(s){ return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
  function normalize(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim(); }


  const DEFAULT_CODE_MAP = {
    'MACHO MADURO':'MM','MACHO VERDE':'MV','GUINEO':'GU','ÑAME':'NM','YUCA':'YU','YAUTIA':'YT','MALANGA':'ML',
    'LIMA':'LM','LIMON SEGUNDA':'LS','LIMON EXTRA':'LX','AGUACATE PRIMERA':'AP','AVOCADO':'AV','OKRA':'OK',
    'JENGIBRE':'JG','CILANTRO':'CL','PEREJIL':'PR','AJO PRIMERA':'AJ','GUINDILLA':'GD','BONIATO':'BO','AUYAMA':'AU',
    'PAPAYA':'PA','BANANA':'BN','MANGO':'MG','HABANERO':'HB','ALOE VERA':'AL','TOMATE DANIELA':'TD',
    'NARANJA ZUMO':'NZ','PATATA 10KG':'PT','CEBOLLA ROJA':'CR','CEBOLLA CHINA':'CC','ENELDO':'EN'
  };
  function autoCodeFromName(name){
    const clean = normalize(name).replace(/[^a-z0-9\s]/g,' ').trim().toUpperCase();
    if(!clean) return 'PRD';
    const words = clean.split(/\s+/).filter(Boolean);
    let code = words.length === 1 ? words[0].slice(0,3) : words.map(w=>w[0]).join('').slice(0,4);
    return code.replace(/Ñ/g,'N') || 'PRD';
  }
  function uniqueProductCode(base, ignoreId=''){
    let code = String(base || 'PRD').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8) || 'PRD';
    const root = code;
    let n = 2;
    while(state?.products?.some(p => p.id !== ignoreId && normalize(p.code) === normalize(code))) code = `${root}${n++}`.slice(0,8);
    return code;
  }
  function ensureProductCodes(){
    const used = new Set();
    (state.products||[]).forEach(p=>{
      let wanted = String(p.code || DEFAULT_CODE_MAP[p.name] || autoCodeFromName(p.name)).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
      if(!wanted) wanted = 'PRD';
      let code = wanted, n = 2;
      while(used.has(code)) code = `${wanted}${n++}`.slice(0,8);
      p.code = code;
      used.add(code);
    });
  }
  function productCodeFor(productOrLine){
    if(!productOrLine) return '';
    const p = productOrLine.code ? productOrLine : (productOrLine.productId ? state.products.find(x=>x.id===productOrLine.productId) : findProductByName(productOrLine.productName || productOrLine.name));
    return (p?.code || '').toUpperCase();
  }

  const PRODUCT_SEED = [
    ['MACHO MADURO','maduro, platano maduro, plátano macho maduro, macho maduro primera, maduro primera','caja_kg','kg',22,1.50,1.70,4,'Plátanos López',15],
    ['MACHO VERDE','verde, platano verde, plátano macho verde','caja_kg','kg',22,1.05,1.25,4,'Plátanos López',15],
    ['GUINEO','banana verde, guineo verde','caja_kg','kg',18,1.20,1.45,4,'',15],
    ['ÑAME','name, yam','caja_kg','kg',20,1.99,2.35,4,'',15],
    ['YUCA','yuka, cassava','kg','kg',0,1.40,1.95,4,'',15],
    ['YAUTIA','malanga, yautía','kg','kg',0,3.25,3.70,4,'Eurobanan',15],
    ['MALANGA','yautia, yautía','kg','kg',0,3.25,3.70,4,'Eurobanan',15],
    ['LIMA','lima verde','caja_fija','caja',0,10.00,12.00,4,'',15],
    ['LIMON SEGUNDA','limón segunda','kg','kg',0,0.80,1.39,4,'',15],
    ['LIMON EXTRA','limón extra, limon primera','caja_kg','kg',15,0.90,1.30,4,'',15],
    ['AGUACATE PRIMERA','aguacate, aguacate premium','caja_fija','caja',0,18.00,19.50,4,'Eurobanan',15],
    ['AVOCADO','aguacate tropical, avocado caja','caja_fija','caja',0,20.40,25.00,4,'Eurobanan',15],
    ['OKRA','ocra','caja_fija','caja',0,27.00,29.00,4,'Eurobanan',10],
    ['JENGIBRE','ginger','kg','kg',0,2.50,2.70,10,'',12],
    ['CILANTRO','cilantro manojo, coriander','manojo','manojo',0,0.40,0.60,10,'',20],
    ['PEREJIL','perejil manojo','manojo','manojo',0,0.45,0.70,10,'',20],
    ['AJO PRIMERA','ajo','kg','kg',0,4.00,4.00,4,'',10],
    ['GUINDILLA','gundeya, guindilla verde','kg','kg',0,4.50,5.80,10,'',15],
    ['BONIATO','batata, batata naranja','kg','kg',0,2.08,2.35,4,'',15],
    ['AUYAMA','calabaza, auyama','kg','kg',0,2.20,2.40,4,'',15],
    ['PAPAYA','papaya caja','caja_fija','caja',0,14.50,18.50,4,'Eurobanan',15],
    ['BANANA','banana caja, banana verde','caja_kg','kg',19,1.00,1.25,4,'',15],
    ['MANGO','mango caja, mango avion, mango palmer','caja_fija','caja',0,10.80,12.00,4,'',15],
    ['HABANERO','habanero caja, aji habanero','caja_fija','caja',0,0,0,10,'',15],
    ['ALOE VERA','aloe, aloe piezas','caja_fija','caja',0,15.00,17.50,10,'',15],
    ['TOMATE DANIELA','daniela','kg','kg',0,1.50,2.20,4,'',15],
    ['NARANJA ZUMO','naranja','kg','kg',0,0.75,0.99,4,'',15],
    ['PATATA 10KG','patata','kg','kg',0,0.60,0.70,4,'',15],
    ['CEBOLLA ROJA','cebolla morada','kg','kg',0,1.00,1.20,4,'',15],
    ['CEBOLLA CHINA','cebolla fina','ud','ud',0,0.75,0.95,10,'',15],
    ['ENELDO','dill','manojo','manojo',0,0.75,0.95,10,'',15]
  ].map(([name,aliases,mode,unit,kgBox,buyPrice,sellPrice,vat,supplier,minMargin]) => ({
    id: uid('prod'), name, aliases, mode, unit, kgBox, buyPrice, sellPrice, vat, supplier, minMargin, active:true, createdAt: nowStamp()
  }));

  const CLIENT_SEED = [
    {name:'Adnan Asif', nif:'X7128589S', address:'C/ Padre Flórez 3, Burgos', phone:'', email:'', type:'externo', vatMode:'normal', transportMode:'none', transportValue:0, commissionType:'percent_total', commissionValue:15, paymentMethod:'efectivo', notes:''},
    {name:'ABBAS', nif:'', address:'', phone:'', email:'', type:'externo', vatMode:'normal', transportMode:'percent', transportValue:10, commissionType:'none', commissionValue:0, paymentMethod:'efectivo', notes:''},
    {name:'NADEEM', nif:'', address:'', phone:'', email:'', type:'externo', vatMode:'normal', transportMode:'percent', transportValue:10, commissionType:'none', commissionValue:0, paymentMethod:'efectivo', notes:''},
    {name:'BIBIANA ARBOLEDA', nif:'49540238D', address:'ARANDA DE DUERO', phone:'947107393', email:'', type:'externo', vatMode:'normal', transportMode:'percent', transportValue:10, commissionType:'none', commissionValue:0, paymentMethod:'efectivo', notes:''},
    {name:'JOSE PATXI ALIMENTACION', nif:'', address:'', phone:'', email:'', type:'externo', vatMode:'normal', transportMode:'percent', transportValue:10, commissionType:'none', commissionValue:0, paymentMethod:'efectivo', notes:''},
    {name:'ROMINA-PREMIER', nif:'', address:'', phone:'', email:'', type:'externo', vatMode:'normal', transportMode:'percent', transportValue:10, commissionType:'none', commissionValue:0, paymentMethod:'efectivo', notes:''},
    {name:'MUSTAFA', nif:'', address:'', phone:'', email:'', type:'externo', vatMode:'normal', transportMode:'percent', transportValue:10, commissionType:'none', commissionValue:0, paymentMethod:'efectivo', notes:''},
    {name:'MALAK', nif:'', address:'', phone:'', email:'', type:'externo', vatMode:'normal', transportMode:'percent', transportValue:10, commissionType:'none', commissionValue:0, paymentMethod:'efectivo', notes:''},
    {name:'DOMINGO', nif:'11139465', address:'Plaza Santiago 2', phone:'641866237', email:'', type:'externo', vatMode:'normal', transportMode:'percent', transportValue:10, commissionType:'none', commissionValue:0, paymentMethod:'efectivo', notes:''},
    {name:'COLOMBIANO', nif:'', address:'', phone:'', email:'', type:'externo', vatMode:'normal', transportMode:'percent', transportValue:10, commissionType:'none', commissionValue:0, paymentMethod:'efectivo', notes:''}
  ].map(c => ({id:uid('cli'), ...c, createdAt:nowStamp()}));

  const SUPPLIER_SEED = ['Plátanos López','Eurobanan','Fruta Viva','ESMO','Montenegro','José Antonio'].map(name => ({id:uid('sup'), name, phone:'', notes:''}));
  const SHOPS_SEED = ['San Pablo','San Lesmes','Santiago'].map(name => ({id:uid('shop'), name, address:'', active:true}));

  const DEFAULT_STATE = () => ({
    version:'1.9.0-pedidos-full',
    settings:{
      theme:'light', pin:'1234', cloudEnabled:false, lineDefaults:8, defaultTargetMargin:18, roundRecommendedTo:0.05, stockCostMode:'avg',
      invoiceNoMode:'daily', companyName:'Mohammad Arslan Waris', companyNif:'X6389988J', companyAddress:'Calle San Pablo 17, 09003 Burgos', companyPhone:'631 667 893', companyEmail:'shaniwaris80@gmail.com'
    },
    activeRouteId:'',
    routes:[{id:'route_'+todayISO(), date:todayISO(), name:'Ruta de hoy', status:'abierta', createdAt:nowStamp(), closedAt:''}],
    products: PRODUCT_SEED,
    clients: CLIENT_SEED,
    suppliers: SUPPLIER_SEED,
    shops: SHOPS_SEED,
    invoices:[], purchases:[], orders:[], transfers:[], expenses:[], payments:[], wastes:[], returns:[], priceRules:[], changes:[]
  });

  const navItems = [
    ['dashboard','⌂','Inicio','Panel general'],
    ['route','▣','Ruta de hoy','Cierre, alertas y resumen'],
    ['invoices','▤','Facturas','Crear, editar y reabrir'],
    ['orders','☑','Pedidos','Pedido → compra/factura'],
    ['purchases','▦','Compras','Facturas proveedor'],
    ['stock','▧','Stock','Sobrante, tiendas y valor €'],
    ['wastes','⚠','Mermas','Pérdidas y ajustes'],
    ['products','◎','Productos','Precios, IVA y cajas'],
    ['clients','◉','Clientes','Datos y precios especiales'],
    ['suppliers','◇','Proveedores','Compras y costes'],
    ['shops','▥','Tiendas propias','San Pablo, San Lesmes, Santiago'],
    ['expenses','−','Gastos','Furgoneta, gasolina y otros'],
    ['payments','€','Cobros','Pendientes y pagos'],
    ['internal','●','Informe interno','Privado con PIN'],
    ['reports','◌','Reportes','PDF, Excel y backup'],
    ['settings','⚙','Ajustes','Seguridad, cloud y diseño']
  ];

  let state = loadState();
  ensureProductCodes();
  if (!state.activeRouteId) state.activeRouteId = state.routes[0]?.id || '';
  let currentPage = 'dashboard';
  let firebaseReady = false;
  let dbRef = null;
  let cloudUnsubscribed = false;
  let autosaveTimer = null;

  const drafts = loadDrafts();
  let invoiceDraft = drafts.invoice || newInvoiceDraft();
  let orderDraft = drafts.order || newOrderDraft();
  let purchaseDraft = drafts.purchase || newPurchaseDraft();
  let transferDraft = drafts.transfer || newTransferDraft();

  function loadState(){
    try {
      const raw = localStorage.getItem(APP_KEY);
      if (!raw) return DEFAULT_STATE();
      const parsed = JSON.parse(raw);
      const def = DEFAULT_STATE();
      return {...def, ...parsed, settings:{...def.settings, ...(parsed.settings||{})}, products: parsed.products?.length ? parsed.products : def.products, clients: parsed.clients?.length ? parsed.clients : def.clients, suppliers: parsed.suppliers?.length ? parsed.suppliers : def.suppliers, shops: parsed.shops?.length ? parsed.shops : def.shops};
    } catch(e){ console.error(e); return DEFAULT_STATE(); }
  }
  function saveState(reason='guardado'){
    localStorage.setItem(APP_KEY, JSON.stringify(state));
    saveDrafts();
    $('#saveStatus').textContent = state.settings.cloudEnabled ? 'Cloud + local' : 'Local';
    if (state.settings.cloudEnabled && firebaseReady && dbRef && !cloudUnsubscribed) {
      dbRef.set(state).then(()=> setSaveStatus('Cloud sincronizado')).catch(err => toast('Error cloud: '+err.message));
    } else {
      setSaveStatus(reason);
    }
  }
  function loadDrafts(){ try { return JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}'); } catch { return {}; } }
  function saveDrafts(){ localStorage.setItem(DRAFT_KEY, JSON.stringify({invoice:invoiceDraft, order:orderDraft, purchase:purchaseDraft, transfer:transferDraft})); }
  function setSaveStatus(text){ const el=$('#saveStatus'); if(!el) return; el.textContent=text; clearTimeout(autosaveTimer); autosaveTimer=setTimeout(()=>{el.textContent = state.settings.cloudEnabled?'Cloud + local':'Local';},1500); }
  function logChange(text, meta={}){ state.changes.unshift({id:uid('chg'), at:nowStamp(), text, meta}); state.changes = state.changes.slice(0,500); }
  function route(){ return state.routes.find(r => r.id === state.activeRouteId) || state.routes[0]; }

  function newInvoiceDraft(){
    const id = uid('draftinv');
    return {id, editingId:'', editingOriginalStatus:'', no: nextInvoiceNo(), date: todayISO(), clientId:'', clientName:'', status:'borrador', priceIncludesVat:false, transportMode:'none', transportValue:0, discount:0, paid:0, paymentMethod:'efectivo', notes:'', lines:emptyLines(state?.settings?.lineDefaults || 8)};
  }
  function newOrderDraft(){
    return {id:uid('draftord'), date:todayISO(), raw:'', clientName:'', tag:'', status:'borrador', notes:'', lines:[]};
  }
  function newPurchaseDraft(){
    return {id:uid('draftpur'), date:todayISO(), supplierId:'', supplierName:'', invoiceNo:'', updateCosts:true, notes:'', lines:emptyLines(state?.settings?.lineDefaults || 8, 'purchase')};
  }
  function newTransferDraft(){
    return {id:uid('drafttrf'), date:todayISO(), shopId:'', shopName:'', notes:'', lines:emptyLines(state?.settings?.lineDefaults || 8, 'transfer')};
  }
  function emptyLines(n=8, type='invoice'){
    return Array.from({length:n}, () => ({id:uid('line'), productId:'', productName:'', mode:'kg', qty:'', kgBox:'', bruto:'', tara:'', neto:'', price:'', buyPrice:'', vat:'4', discount:'', note:'', type}));
  }
  function nextInvoiceNo(){
    const d = new Date();
    const y = d.getFullYear();
    const date = d.toISOString().slice(0,10).replace(/-/g,'');
    const same = state?.invoices?.filter(i => String(i.no||'').includes(date) || String(i.no||'').includes(String(y)))?.length || 0;
    if (state?.settings?.invoiceNoMode === 'year') return `FA-${y}-${String(same+1).padStart(6,'0')}`;
    return `FA-${date}-${String(same+1).padStart(3,'0')}`;
  }

  function findProductByName(name){
    const n = normalize(name);
    if (!n) return null;
    return state.products.find(p => normalize(p.code) === n || normalize(p.name) === n || String(p.aliases||'').split(',').some(a => normalize(a) === n)) || null;
  }
  function productSuggestions(q, limit=8){
    const n = normalize(q);
    const active = state.products.filter(p => p.active !== false);
    if (!n) return active.slice(0,limit);
    const scored = active.map(p => {
      const hay = `${p.code||''} ${p.name} ${p.aliases||''} ${p.supplier||''}`;
      const nn = normalize(hay);
      let score = 0;
      if (normalize(p.code).startsWith(n)) score += 160;
      if (normalize(p.name).startsWith(n)) score += 100;
      if (nn.includes(n)) score += 50;
      n.split(/\s+/).forEach(part => { if (nn.includes(part)) score += 10; });
      return {p, score};
    }).filter(x => x.score>0).sort((a,b)=>b.score-a.score || a.p.name.localeCompare(b.p.name));
    return scored.slice(0,limit).map(x=>x.p);
  }
  function getClient(id){ return state.clients.find(c => c.id === id); }
  function getSupplier(id){ return state.suppliers.find(s => s.id === id); }
  function getShop(id){ return state.shops.find(s => s.id === id); }
  function getPriceRule(clientId, productId){ return state.priceRules.find(r => r.clientId===clientId && r.productId===productId); }

  function roundToStep(n, step){
    step = toNumber(step) || 0.05;
    return round2(Math.ceil(toNumber(n) / step) * step);
  }
  function recommendedPriceForProduct(product){
    if(!product) return 0;
    const cost = toNumber(product.buyPrice);
    const margin = Math.min(90, Math.max(0, toNumber(product.minMargin || state.settings.defaultTargetMargin || 18)));
    if(!cost) return toNumber(product.sellPrice || 0);
    const rec = cost / (1 - margin/100);
    return roundToStep(rec, state.settings.roundRecommendedTo || 0.05);
  }
  function priceHintData(line){
    const p = line?.productId ? state.products.find(x=>x.id===line.productId) : findProductByName(line?.productName);
    if(!p) return {recommended:0,min:0,client:0,buy:toNumber(line?.buyPrice), margin:0};
    const rule = invoiceDraft?.clientId ? getPriceRule(invoiceDraft.clientId, p.id) : null;
    const recommended = recommendedPriceForProduct(p);
    return {product:p, recommended, min:toNumber(rule?.minPrice || 0), client:toNumber(rule?.price || 0), buy:toNumber(p.buyPrice || line?.buyPrice), margin:toNumber(p.minMargin || state.settings.defaultTargetMargin || 18)};
  }
  function priceHintHtml(line){
    const h = priceHintData(line);
    if(!h.product) return '<small class="priceHint">Producto manual · puedes seguir escribiendo</small>';
    const parts = [];
    if(h.buy) parts.push(`Compra ${fmtMoney(h.buy).replace(' €','')}`);
    if(h.recommended) parts.push(`Recomendado ${fmtMoney(h.recommended).replace(' €','')}`);
    if(h.min) parts.push(`Mín. cliente ${fmtMoney(h.min).replace(' €','')}`);
    if(h.client) parts.push(`Cliente ${fmtMoney(h.client).replace(' €','')}`);
    return `<small class="priceHint">${esc(parts.join(' · ') || 'Precio configurable')}</small>`;
  }


  function applyProductToLine(line, product, context='invoice'){
    line.productId = product.id;
    line.productName = product.name;
    line.mode = product.mode || 'kg';
    line.kgBox = product.kgBox ? String(product.kgBox).replace('.', ',') : '';
    line.vat = String(product.vat ?? 4);
    line.buyPrice = product.buyPrice ? String(product.buyPrice).replace('.', ',') : '';
    if (context === 'purchase') line.price = product.buyPrice ? String(product.buyPrice).replace('.', ',') : '';
    else {
      const rule = invoiceDraft?.clientId ? getPriceRule(invoiceDraft.clientId, product.id) : null;
      const recommended = recommendedPriceForProduct(product);
      let price = rule?.price ?? product.sellPrice ?? recommended ?? '';
      if (rule?.minPrice && toNumber(price) < toNumber(rule.minPrice)) price = rule.minPrice;
      line.price = String(price ?? '').replace('.', ',');
    }
  }
  function lineCalc(line, priceIncludesVat=false){
    const mode = line.mode || 'kg';
    const qty = toNumber(line.qty);
    const kgBox = toNumber(line.kgBox);
    const bruto = toNumber(line.bruto);
    const tara = toNumber(line.tara);
    const price = toNumber(line.price);
    const vat = toNumber(line.vat);
    const discount = toNumber(line.discount);
    let neto = 0;
    if (mode === 'kg') neto = Math.max(0, bruto - tara || toNumber(line.neto) || qty);
    if (mode === 'caja_kg') neto = qty * kgBox;
    if (mode === 'caja_fija') neto = qty * (kgBox || 0);
    if (mode === 'ud' || mode === 'manojo') neto = qty;
    let base = 0;
    if (mode === 'caja_fija') base = qty * price;
    else base = neto * price;
    base = Math.max(0, base - discount);
    let tax = 0, total = 0, baseNoVat = base;
    if (priceIncludesVat) {
      total = base;
      baseNoVat = vat > 0 ? total / (1 + vat/100) : total;
      tax = total - baseNoVat;
    } else {
      tax = baseNoVat * vat/100;
      total = baseNoVat + tax;
    }
    const buyPrice = toNumber(line.buyPrice);
    const cost = mode === 'caja_fija' ? qty * buyPrice : neto * buyPrice;
    const profit = baseNoVat - cost;
    const margin = baseNoVat ? profit / baseNoVat * 100 : 0;
    return {neto:round2(neto), base:round2(baseNoVat), tax:round2(tax), total:round2(total), cost:round2(cost), profit:round2(profit), margin:round2(margin), vat};
  }
  function activeLines(lines){ return (lines||[]).filter(l => String(l.productName||'').trim() || toNumber(l.qty) || toNumber(l.bruto) || toNumber(l.price)); }
  function invoiceTotals(inv){
    const lines = activeLines(inv.lines);
    const lineCalcs = lines.map(l => ({line:l, calc:lineCalc(l, inv.priceIncludesVat)}));
    const subtotal = round2(lineCalcs.reduce((s,x)=>s+x.calc.base,0));
    const discount = toNumber(inv.discount);
    const subtotalAfterDiscount = Math.max(0, subtotal - discount);
    let transportBase = 0;
    if (inv.transportMode === 'percent') transportBase = subtotalAfterDiscount * toNumber(inv.transportValue)/100;
    if (inv.transportMode === 'manual') transportBase = toNumber(inv.transportValue);
    const transportVat = transportBase ? inferTransportVat(lines) : 0;
    const vatGroups = {};
    lineCalcs.forEach(x => {
      const key = String(x.calc.vat || 0);
      if (!vatGroups[key]) vatGroups[key] = {vat:toNumber(key), base:0, tax:0};
      vatGroups[key].base += x.calc.base;
      vatGroups[key].tax += x.calc.tax;
    });
    if (transportBase) {
      const key = String(transportVat || 0);
      if (!vatGroups[key]) vatGroups[key] = {vat:toNumber(key), base:0, tax:0};
      vatGroups[key].base += transportBase;
      vatGroups[key].tax += transportBase * transportVat/100;
    }
    Object.values(vatGroups).forEach(g => { g.base=round2(g.base); g.tax=round2(g.tax); });
    const taxTotal = round2(Object.values(vatGroups).reduce((s,g)=>s+g.tax,0));
    const total = round2(subtotalAfterDiscount + transportBase + taxTotal);
    const paid = toNumber(inv.paid);
    const pending = round2(Math.max(0, total - paid));
    const cost = round2(lineCalcs.reduce((s,x)=>s+x.calc.cost,0));
    const profitLines = round2(lineCalcs.reduce((s,x)=>s+x.calc.profit,0));
    const commission = clientCommission(inv, total, subtotalAfterDiscount, profitLines);
    const profit = round2(profitLines + transportBase + commission);
    return {lines, lineCalcs, subtotal, discount, subtotalAfterDiscount, transportBase:round2(transportBase), transportVat, vatGroups:Object.values(vatGroups).filter(g=>round2(g.base)!==0 || round2(g.tax)!==0).sort((a,b)=>a.vat-b.vat), taxTotal, total, paid, pending, cost, profitLines, commission, profit};
  }
  function usedVatLabelFromTotals(t){
    const used = (t?.vatGroups || []).map(g => fmtNum(g.vat,2)+'%').filter(Boolean);
    return used.length ? used.join(' / ') : 'Sin IVA';
  }

  function inferTransportVat(lines){
    const used = activeLines(lines).map(l => toNumber(l.vat)).filter(v => v > 0);
    if (!used.length) return 21;
    const counts = used.reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{});
    return Number(Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]);
  }
  function clientCommission(inv, total, base, profit){
    const c = getClient(inv.clientId);
    if (!c || c.commissionType === 'none') return 0;
    const val = toNumber(c.commissionValue);
    if (c.commissionType === 'percent_total') return round2(total * val/100);
    if (c.commissionType === 'percent_base') return round2(base * val/100);
    if (c.commissionType === 'percent_profit') return round2(profit * val/100);
    if (c.commissionType === 'manual') return val;
    return 0;
  }
  function purchaseTotals(pur){
    const lines = activeLines(pur.lines);
    const calcs = lines.map(l => ({line:l, calc:lineCalc(l, false)}));
    const subtotal = round2(calcs.reduce((s,x)=>s+x.calc.base,0));
    const vatGroups = {};
    calcs.forEach(x => { const key=String(x.calc.vat||0); if(!vatGroups[key])vatGroups[key]={vat:toNumber(key),base:0,tax:0}; vatGroups[key].base += x.calc.base; vatGroups[key].tax += x.calc.tax; });
    Object.values(vatGroups).forEach(g => { g.base=round2(g.base); g.tax=round2(g.tax); });
    const taxTotal = round2(Object.values(vatGroups).reduce((s,g)=>s+g.tax,0));
    return {lines, calcs, subtotal, vatGroups:Object.values(vatGroups).filter(g=>g.base||g.tax).sort((a,b)=>a.vat-b.vat), taxTotal, total:round2(subtotal+taxTotal)};
  }
  function transferTotals(tr){
    const lines = activeLines(tr.lines);
    const calcs = lines.map(l => ({line:l, calc:lineCalc(l, false)}));
    const value = round2(calcs.reduce((s,x)=>s+x.calc.base,0));
    const cost = round2(calcs.reduce((s,x)=>s+x.calc.cost,0));
    return {lines, calcs, value, cost, profit:round2(value-cost)};
  }

  function toast(message){
    const root = $('#toastRoot');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    root.appendChild(el);
    setTimeout(()=> el.remove(), 3200);
  }
  function confirmModal(title, html, onOk, okText='Aceptar'){
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modalBackdrop"><div class="modal"><div class="modalHead"><h3>${esc(title)}</h3><button class="iconBtn" data-modal-close>×</button></div><div>${html}</div><div class="toolbar right" style="margin-top:16px"><button class="ghostBtn" data-modal-close>Cancelar</button><button class="primaryBtn" data-modal-ok>${esc(okText)}</button></div></div></div>`;
    const close = () => root.innerHTML='';
    $$('[data-modal-close]', root).forEach(b => b.onclick = close);
    $('[data-modal-ok]', root).onclick = () => { close(); onOk?.(); };
  }
  function promptPin(onOk){
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modalBackdrop"><div class="modal"><div class="modalHead"><h3>Área interna privada</h3><button class="iconBtn" data-modal-close>×</button></div><p class="muted">Introduce el PIN para ver beneficios, costes, márgenes y pérdidas.</p><div class="field"><label>PIN</label><input id="pinInput" type="password" inputmode="numeric" placeholder="PIN" /></div><div class="toolbar right" style="margin-top:16px"><button class="ghostBtn" data-modal-close>Cancelar</button><button class="primaryBtn" id="pinOk">Entrar</button></div></div></div>`;
    const close=()=>root.innerHTML='';
    $$('[data-modal-close]',root).forEach(b=>b.onclick=close);
    $('#pinOk').onclick=()=>{ if($('#pinInput').value === String(state.settings.pin||'1234')){ close(); onOk?.(); } else toast('PIN incorrecto'); };
    $('#pinInput').focus();
  }

  function init(){
    document.documentElement.dataset.theme = state.settings.theme || 'light';
    renderNav();
    bindShell();
    renderPage('dashboard');
    initFirebaseIfNeeded(false);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  }
  function renderNav(){
    $('#nav').innerHTML = navItems.map(([id,icon,label]) => `<button class="navBtn ${id===currentPage?'active':''}" data-page="${id}"><span class="navIcon">${icon}</span><span class="navLabel">${label}</span></button>`).join('');
    $$('.navBtn').forEach(b => b.onclick = () => renderPage(b.dataset.page));
  }
  function bindShell(){
    $('#menuBtn').onclick = () => {
      const shell = $('#appShell');
      if (innerWidth > 1100) shell.classList.toggle('sidebarCollapsed');
      else { shell.classList.add('sidebarOpen'); $('#sidebarScrim').hidden = false; }
    };
    $('#sidebarScrim').onclick = () => { $('#appShell').classList.remove('sidebarOpen'); $('#sidebarScrim').hidden=true; };
    $('#themeToggle').onclick = () => {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = state.settings.theme;
      $('#themeToggle').textContent = state.settings.theme === 'dark' ? 'Modo blanco' : 'Modo negro';
      saveState('Tema guardado');
    };
    $('#themeToggle').textContent = state.settings.theme === 'dark' ? 'Modo blanco' : 'Modo negro';
    $('#syncBtn').onclick = () => renderPage('settings');
  }
  function renderPage(page){
    currentPage = page;
    const item = navItems.find(x => x[0]===page) || navItems[0];
    $('#pageTitle').textContent = item[2];
    $('#pageSubtitle').textContent = item[3];
    renderNav();
    if (innerWidth <= 1100) { $('#appShell').classList.remove('sidebarOpen'); $('#sidebarScrim').hidden=true; }
    const renderers = {dashboard:renderDashboard, route:renderRoute, invoices:renderInvoices, orders:renderOrders, purchases:renderPurchases, stock:renderStock, wastes:renderWastes, products:renderProducts, clients:renderClients, suppliers:renderSuppliers, shops:renderShops, expenses:renderExpenses, payments:renderPayments, internal:renderInternalGate, reports:renderReports, settings:renderSettings};
    (renderers[page] || renderDashboard)();
  }

  function routeFiltered(list){ const r = route(); return list.filter(x => !x.routeId || x.routeId === r?.id); }
  function dashboardMetrics(){
    const invs = routeFiltered(state.invoices);
    const purs = routeFiltered(state.purchases);
    const trs = routeFiltered(state.transfers);
    const exps = routeFiltered(state.expenses);
    const sales = round2(invs.reduce((s,i)=>s+invoiceTotals(i).total,0));
    const salesBase = round2(invs.reduce((s,i)=>s+invoiceTotals(i).subtotalAfterDiscount+invoiceTotals(i).transportBase,0));
    const purchases = round2(purs.reduce((s,p)=>s+purchaseTotals(p).total,0));
    const purchasesBase = round2(purs.reduce((s,p)=>s+purchaseTotals(p).subtotal,0));
    const shopValue = round2(trs.reduce((s,t)=>s+transferTotals(t).value,0));
    const shopProfit = round2(trs.reduce((s,t)=>s+transferTotals(t).profit,0));
    const expenses = round2(exps.reduce((s,e)=>s+toNumber(e.amount),0));
    const commissions = round2(invs.reduce((s,i)=>s+invoiceTotals(i).commission,0));
    const transport = round2(invs.reduce((s,i)=>s+invoiceTotals(i).transportBase,0));
    const internalProfit = round2(invs.reduce((s,i)=>s+invoiceTotals(i).profit,0) + shopProfit - expenses);
    const cashProfit = round2(sales - purchases - expenses);
    return {sales, salesBase, purchases, purchasesBase, shopValue, shopProfit, expenses, commissions, transport, internalProfit, cashProfit, invoices:invs.length, purchasesCount:purs.length};
  }

  function renderDashboard(){
    const m = dashboardMetrics();
    $('#view').innerHTML = `
      <div class="grid cols4">
        <div class="kpi"><span>Ventas clientes</span><strong>${fmtMoney(m.sales)}</strong><small>${m.invoices} facturas</small></div>
        <div class="kpi"><span>Compras proveedor</span><strong>${fmtMoney(m.purchases)}</strong><small>${m.purchasesCount} compras</small></div>
        <div class="kpi"><span>Transporte cobrado</span><strong>${fmtMoney(m.transport)}</strong><small>Base sin IVA</small></div>
        <div class="kpi ${m.internalProfit>=0?'good':'bad'}"><span>Beneficio interno</span><strong>${fmtMoney(m.internalProfit)}</strong><small>Privado</small></div>
      </div>
      <div class="grid cols2" style="margin-top:16px">
        <div class="card">
          <div class="cardTitle"><div><h2>Acciones rápidas</h2><p>Modo ruta rápido y profesional.</p></div></div>
          <div class="toolbar">
            <button class="primaryBtn" data-go="invoices">+ Nueva factura</button>
            <button class="primaryBtn" data-go="orders">+ Pedido</button>
            <button class="primaryBtn" data-go="purchases">+ Nueva compra</button>
            <button class="ghostBtn" data-go="shops">+ Tienda propia</button>
            <button class="ghostBtn" data-go="expenses">+ Gasto</button>
            <button class="ghostBtn" data-go="route">Cerrar ruta</button>
          </div>
          <div class="sep"></div>
          <div class="alertList">${buildAlerts().slice(0,6).map(a=>`<div class="alertItem ${a.type}"><strong>${esc(a.title)}</strong><br><span class="muted">${esc(a.text)}</span></div>`).join('') || '<div class="empty">Sin alertas importantes.</div>'}</div>
        </div>
        <div class="card">
          <div class="cardTitle"><div><h2>Resumen de ruta</h2><p>${esc(route()?.name || '')} · ${esc(route()?.date || '')}</p></div><button class="ghostBtn small" data-go="route">Ver ruta</button></div>
          ${summaryBlock([
            ['Ventas clientes', m.sales], ['Compras proveedor', -m.purchases], ['Tiendas propias margen', m.shopProfit], ['Comisiones internas', m.commissions], ['Gastos ruta', -m.expenses]
          ], 'Beneficio interno', m.internalProfit)}
        </div>
      </div>
      <div class="grid cols2" style="margin-top:16px">
        <div class="card"><div class="cardTitle"><h3>Últimas facturas</h3></div>${invoiceListTable(state.invoices.slice(0,6))}</div>
        <div class="card"><div class="cardTitle"><h3>Últimos cambios</h3></div>${changesTable()}</div>
      </div>`;
    $$('[data-go]').forEach(b=>b.onclick=()=>renderPage(b.dataset.go));
  }
  function summaryBlock(lines, totalLabel, totalValue){
    return `<div class="totalPanel"><div class="summaryBox">${lines.map(([label,value])=>`<div class="summaryLine"><span>${esc(label)}</span><strong class="${value<0?'lossText':''}">${fmtMoney(value)}</strong></div>`).join('')}</div><div class="totalBox"><span>${esc(totalLabel)}</span><strong>${fmtMoney(totalValue)}</strong><small>Solo informe interno</small></div></div>`;
  }
  function changesTable(){
    const rows = state.changes.slice(0,8);
    if(!rows.length) return '<div class="empty">Todavía no hay historial.</div>';
    return `<div class="tableWrap"><table class="compact"><thead><tr><th>Fecha</th><th>Cambio</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.at)}</td><td>${esc(r.text)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function buildAlerts(){
    const alerts=[];
    state.invoices.forEach(inv => invoiceTotals(inv).lineCalcs.forEach(x => {
      const product = x.line.productName || 'Producto';
      if (x.calc.cost && x.calc.profit < 0) alerts.push({type:'bad', title:'Venta bajo coste', text:`${inv.clientName||'Factura'} · ${product} · ${fmtMoney(x.calc.profit)}`});
      const p = findProductByName(product);
      if (p && toNumber(x.line.vat) !== toNumber(p.vat)) alerts.push({type:'warn', title:'IVA distinto al habitual', text:`${product}: usado ${x.line.vat}% · habitual ${p.vat}%`});
      if (!toNumber(x.line.buyPrice)) alerts.push({type:'warn', title:'Producto sin coste', text:`${product} no tiene precio de compra interno.`});
    }));
    state.purchases.forEach(p => purchaseTotals(p).calcs.forEach(x => {
      const prod = findProductByName(x.line.productName);
      if (prod && toNumber(x.line.price) > toNumber(prod.buyPrice)*1.25 && toNumber(prod.buyPrice)>0) alerts.push({type:'warn', title:'Compra más cara', text:`${x.line.productName}: ${fmtMoney(toNumber(x.line.price))} vs último ${fmtMoney(prod.buyPrice)}`});
    }));
    return alerts;
  }

  function renderInvoices(){
    $('#view').innerHTML = `
      <div class="card">
        <div class="cardTitle">
          <div><h2>${invoiceDraft.editingId ? 'Editar factura' : 'Nueva factura'}</h2><p>${invoiceDraft.editingId ? 'Modifica la factura, guarda cambios o cancela la edición.' : 'Crear, revisar y emitir facturas profesionales.'}</p></div>
          <div class="toolbar"><button class="ghostBtn small" id="repeatInvoiceBtn">Repetir última</button><button class="ghostBtn small" id="clearInvoiceBtn">Nueva limpia</button></div>
        </div>
        <div class="row">
          <div class="field col3"><label>Cliente</label><select id="invClient"><option value="">Seleccionar cliente</option>${state.clients.map(c=>`<option value="${c.id}" ${invoiceDraft.clientId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field col3"><label>Cliente manual</label><input id="invClientName" value="${esc(invoiceDraft.clientName||'')}" placeholder="Nombre cliente" /></div>
          <div class="field col2"><label>Fecha</label><input id="invDate" type="date" value="${esc(invoiceDraft.date)}" /></div>
          <div class="field col2"><label>Nº factura</label><input id="invNo" value="${esc(invoiceDraft.no)}" /></div>
          <div class="field col2"><label>Estado</label><select id="invStatus"><option value="borrador">Borrador</option><option value="reabierta">Reabierta</option><option value="emitida">Emitida</option><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="cobrada">Cobrada</option><option value="anulada">Anulada</option></select></div>
          <div class="field col2"><label>Transporte</label><select id="invTransportMode"><option value="none">Sin transporte</option><option value="percent">%</option><option value="manual">Manual</option></select></div>
          <div class="field col1"><label>Valor</label><input id="invTransportValue" class="decimalInput" inputmode="decimal" value="${esc(invoiceDraft.transportValue)}" /></div>
          <div class="field col2"><label>Precios</label><select id="invPriceVat"><option value="false">Sin IVA</option><option value="true">IVA incluido</option></select></div>
        </div>
        <div id="clientHints" style="margin-top:12px"></div>
        <div class="sep"></div>
        <div class="toolbar">
          <button class="ghostBtn small" id="addInvLine">+ Línea</button>
          <button class="ghostBtn small" id="addInv5">+ 5 líneas</button>
          <button class="ghostBtn small" id="pasteInvList">Pegar lista</button>
          <button class="ghostBtn small" id="applyRecommendedBtn">Precios recomendados</button>
          <button class="ghostBtn small" id="applyClientMinimumsBtn">Mínimos cliente</button>
          ${invoiceDraft.editingId ? '<button class="primaryBtn small" id="saveInvChanges">Guardar cambios</button><button class="ghostBtn small" id="saveInvReopened">Guardar reabierta</button><button class="ghostBtn small" id="cancelInvEdit">Cancelar edición</button>' : '<button class="ghostBtn small" id="saveInvDraft">Guardar borrador</button><button class="primaryBtn small" id="emitInvBtn">Emitir factura</button>'}
          <button class="ghostBtn small" id="pdfInvBtn">PDF</button>
        </div>
        <div class="chips" id="frequentProducts" style="margin-bottom:12px"></div>
        <div class="tableWrap"><table class="lineTable" id="invoiceLineTable"><thead>${lineHead()}</thead><tbody></tbody></table></div>
        <div style="margin-top:16px" id="invoiceSummary"></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="cardTitle"><div><h2>Facturas guardadas</h2><p>Borradores, emitidas, pendientes y cobradas.</p></div></div>
        ${invoiceListTable(state.invoices)}
      </div>`;
    $('#invStatus').value = invoiceDraft.status || 'borrador';
    $('#invTransportMode').value = invoiceDraft.transportMode || 'none';
    $('#invPriceVat').value = String(!!invoiceDraft.priceIncludesVat);
    renderLineRows('invoiceLineTable', invoiceDraft.lines, 'invoice');
    bindInvoiceForm();
    updateClientHints();
    updateFrequentProducts();
    updateInvoiceSummary();
  }
  function lineHead(){
    return `<tr><th>#</th><th>Código</th><th>Producto</th><th>Modo</th><th class="num">Cant.</th><th class="num">Kg/caja</th><th class="num">Bruto</th><th class="num">Tara</th><th class="num">Neto</th><th class="num">Precio</th><th>IVA</th><th class="num">Importe</th><th></th></tr>`;
  }
  function renderLineRows(tableId, lines, context){
    const tbody = $(`#${tableId} tbody`);
    tbody.innerHTML = lines.map((line, idx) => lineRowHtml(line, idx, context)).join('');
    if (!tbody.dataset.boundContext) {
      bindLineTable(tbody, lines, context);
      tbody.dataset.boundContext = context;
    }
  }
  function lineRowHtml(line, idx, context){
    const c = lineCalc(line, context==='invoice' ? invoiceDraft.priceIncludesVat : false);
    return `<tr data-line-id="${line.id}" class="${c.cost && c.profit < 0 ? 'lossRow':''}">
      <td data-label="#"><span class="lineIndex">${idx+1}</span></td>
      <td data-label="Código"><b class="mono">${esc(productCodeFor(line)||'—')}</b></td>
      <td data-label="Producto" class="productCell"><div class="suggestHost"><input data-field="productName" value="${esc(line.productName)}" placeholder="Escribir producto..." autocomplete="off" /><div class="suggestList hidden"></div></div>${context==='invoice'?priceHintHtml(line):''}</td>
      <td data-label="Modo" class="modeCell"><select data-field="mode">${modeOptions(line.mode)}</select></td>
      <td data-label="Cant."><input class="decimalInput" inputmode="decimal" data-field="qty" value="${esc(line.qty)}" placeholder="0" /></td>
      <td data-label="Kg/caja"><input class="decimalInput" inputmode="decimal" data-field="kgBox" value="${esc(line.kgBox)}" placeholder="0" /></td>
      <td data-label="Bruto"><input class="decimalInput" inputmode="decimal" data-field="bruto" value="${esc(line.bruto)}" placeholder="0" /></td>
      <td data-label="Tara"><input class="decimalInput" inputmode="decimal" data-field="tara" value="${esc(line.tara)}" placeholder="0" /></td>
      <td data-label="Neto" class="calcCell" data-calc="neto">${fmtNum(c.neto)}${unitSuffix(line)}</td>
      <td data-label="Precio" class="moneyCell"><div class="priceBox"><button class="stepBtn" data-step-price="-0.10">−</button><input class="decimalInput" inputmode="decimal" data-field="price" value="${esc(line.price)}" placeholder="0,00" /><button class="stepBtn" data-step-price="0.10">+</button></div></td>
      <td data-label="IVA" class="vatCell"><select data-field="vat">${vatOptions(line.vat)}</select></td>
      <td data-label="Importe" class="calcCell" data-calc="importe">${fmtMoney(c.base)}</td>
      <td data-label="Acción"><button class="ghostBtn tiny" data-line-menu>⋯</button><button class="dangerBtn tiny" data-delete-line>×</button></td>
    </tr>`;
  }
  function modeOptions(v){ return [['kg','Kg'],['caja_kg','Caja x kg'],['caja_fija','Caja fija'],['ud','Ud'],['manojo','Manojo']].map(([id,l])=>`<option value="${id}" ${v===id?'selected':''}>${l}</option>`).join(''); }
  function vatOptions(v){ return ['0','4','10','21'].map(x=>`<option value="${x}" ${String(v)===x?'selected':''}>${x}%</option>`).join('') + `<option value="" ${v===''?'selected':''}>Manual</option>`; }
  function unitSuffix(line){ if(line.mode==='caja_fija') return line.kgBox?' kg':''; if(line.mode==='ud') return ' ud'; if(line.mode==='manojo') return ' man.'; return ' kg'; }
  function bindLineTable(tbody, lines, context){
    tbody.addEventListener('input', e => {
      const input = e.target.closest('[data-field]');
      if(!input) return;
      const tr = e.target.closest('tr');
      const line = lines.find(l => l.id === tr.dataset.lineId);
      const field = input.dataset.field;
      line[field] = input.value;
      if (field === 'productName') showSuggestions(input, line, context);
      updateLineCalc(tr, line, context);
      if (context === 'invoice') updateInvoiceSummary(false);
      if (context === 'purchase') updatePurchaseSummary(false);
      if (context === 'transfer') updateTransferSummary(false);
      scheduleDraftSave();
    });
    tbody.addEventListener('change', e => {
      const input = e.target.closest('[data-field]');
      if(!input) return;
      const tr = e.target.closest('tr');
      const line = lines.find(l => l.id === tr.dataset.lineId);
      line[input.dataset.field] = input.value;
      if (input.dataset.field === 'productName') {
        const exact = findProductByName(input.value);
        if (exact) { applyProductToLine(line, exact, context); paintLineInputs(tr, line); }
      }
      updateLineCalc(tr, line, context);
      if (context === 'invoice') updateInvoiceSummary();
      if (context === 'purchase') updatePurchaseSummary();
      if (context === 'transfer') updateTransferSummary();
      scheduleDraftSave();
    });
    tbody.addEventListener('blur', e => {
      const input = e.target.closest('.decimalInput');
      if (!input || input.value === '') return;
      input.value = String(input.value).replace('.', ',');
      const tr = input.closest('tr'); const line = lines.find(l => l.id===tr.dataset.lineId); if(line) line[input.dataset.field]=input.value;
      scheduleDraftSave();
    }, true);
    tbody.addEventListener('click', e => {
      const tr = e.target.closest('tr'); if (!tr) return;
      const line = lines.find(l => l.id === tr.dataset.lineId);
      if (e.target.closest('[data-step-price]')) {
        const delta = toNumber(e.target.closest('[data-step-price]').dataset.stepPrice);
        const current = toNumber(line.price);
        line.price = round2(current + delta).toString().replace('.', ',');
        tr.querySelector('[data-field="price"]').value = line.price;
        updateLineCalc(tr,line,context);
        if (context === 'invoice') updateInvoiceSummary(); if(context==='purchase') updatePurchaseSummary(); if(context==='transfer') updateTransferSummary();
        scheduleDraftSave();
      }
      if (e.target.closest('[data-delete-line]')) {
        Object.assign(line, {productId:'', productName:'', mode:'kg', qty:'', kgBox:'', bruto:'', tara:'', neto:'', price:'', buyPrice:'', vat:'4', discount:'', note:''});
        paintLineInputs(tr, line);
        updateLineCalc(tr,line,context);
        if (context === 'invoice') updateInvoiceSummary(); if(context==='purchase') updatePurchaseSummary(); if(context==='transfer') updateTransferSummary();
        scheduleDraftSave();
      }
      if (e.target.closest('[data-line-menu]')) openLineMenu(line, context, tr);
    });
    document.addEventListener('click', (ev) => { if (!ev.target.closest('.suggestHost')) $$('.suggestList').forEach(x=>x.classList.add('hidden')); }, {once:true});
  }
  function updateLineCalc(tr,line,context){
    const c = lineCalc(line, context==='invoice'?invoiceDraft.priceIncludesVat:false);
    const netoEl = tr.querySelector('[data-calc="neto"]');
    const impEl = tr.querySelector('[data-calc="importe"]');
    if(netoEl) netoEl.textContent = `${fmtNum(c.neto)}${unitSuffix(line)}`;
    if(impEl) impEl.textContent = fmtMoney(c.base);
    tr.classList.toggle('lossRow', !!(c.cost && c.profit < 0 && context==='invoice'));
    const hint = tr.querySelector('.priceHint'); if(hint && context==='invoice') hint.outerHTML = priceHintHtml(line);
  }
  function paintLineInputs(tr, line){
    if(!tr || !line) return;
    const set = (field, value) => { const el = tr.querySelector(`[data-field="${field}"]`); if(el) el.value = value ?? ''; };
    set('productName', line.productName || '');
    set('mode', line.mode || 'kg');
    set('qty', line.qty || '');
    set('kgBox', line.kgBox || '');
    set('bruto', line.bruto || '');
    set('tara', line.tara || '');
    set('price', line.price || '');
    set('vat', line.vat || '4');
  }
  function showSuggestions(input, line, context){
    const host = input.closest('.suggestHost'); const box = $('.suggestList',host);
    const sug = productSuggestions(input.value, 8);
    if(!input.value.trim() || !sug.length){ box.innerHTML = input.value.trim()?'<div class="suggestEmpty">Producto nuevo/manual. Puedes seguir escribiendo.</div>':''; box.classList.toggle('hidden', !input.value.trim()); return; }
    box.innerHTML = sug.map(p=>`<div class="suggestItem" data-product-id="${p.id}"><b><span class="mono">${esc(p.code||'')}</span> · ${esc(p.name)}</b><span>${esc(p.mode)} · IVA ${p.vat}% · V ${fmtMoney(p.sellPrice||0)}</span></div>`).join('') + `<div class="suggestEmpty">Puedes ignorar sugerencias y escribir completo.</div>`;
    box.classList.remove('hidden');
    $$('.suggestItem', box).forEach(item => item.onmousedown = (ev) => {
      ev.preventDefault();
      const p = state.products.find(x=>x.id===item.dataset.productId);
      applyProductToLine(line, p, context);
      const tr = input.closest('tr');
      paintLineInputs(tr, line);
      box.classList.add('hidden');
      updateLineCalc(tr,line,context);
      if (context==='invoice') updateInvoiceSummary(); if(context==='purchase') updatePurchaseSummary(); if(context==='transfer') updateTransferSummary();
      scheduleDraftSave();
    });
  }
  function openLineMenu(line, context, tr){
    const p = findProductByName(line.productName);
    const html = `<div class="grid cols2">
      <button class="ghostBtn" id="duplicateLine">Duplicar línea</button>
      <button class="ghostBtn" id="savePriceProduct">Guardar precio producto</button>
      <button class="ghostBtn" id="savePriceClient">Guardar precio cliente</button>
      <button class="ghostBtn" id="saveMinClient">Guardar mínimo cliente</button>
      <button class="ghostBtn" id="useRecommended">Usar recomendado</button>
      <button class="ghostBtn" id="makeProduct">Crear/actualizar producto</button>
    </div>
    <div class="sep"></div>
    <p class="muted">Producto detectado: <b>${esc(p?.name || 'nuevo/manual')}</b>.</p>`;
    confirmModal('Opciones de línea', html, null, 'Cerrar');
    setTimeout(()=>{
      $('#duplicateLine')?.addEventListener('click',()=>{ duplicateLine(line,context); $('#modalRoot').innerHTML=''; });
      $('#savePriceProduct')?.addEventListener('click',()=>{ savePriceToProduct(line,context); $('#modalRoot').innerHTML=''; });
      $('#savePriceClient')?.addEventListener('click',()=>{ savePriceToClient(line); $('#modalRoot').innerHTML=''; });
      $('#saveMinClient')?.addEventListener('click',()=>{ saveMinPriceToClient(line); $('#modalRoot').innerHTML=''; });
      $('#useRecommended')?.addEventListener('click',()=>{ useRecommendedOnLine(line, context); $('#modalRoot').innerHTML=''; });
      $('#makeProduct')?.addEventListener('click',()=>{ createOrUpdateProductFromLine(line); $('#modalRoot').innerHTML=''; });
    },0);
  }
  function duplicateLine(line,context){
    const lines = context==='invoice'?invoiceDraft.lines:context==='purchase'?purchaseDraft.lines:transferDraft.lines;
    const idx = lines.indexOf(line);
    lines.splice(idx+1,0,{...line,id:uid('line')});
    if(context==='invoice') renderInvoices(); if(context==='purchase') renderPurchases(); if(context==='transfer') renderShops();
    toast('Línea duplicada'); scheduleDraftSave();
  }
  function savePriceToProduct(line,context){
    let p = findProductByName(line.productName);
    if(!p) p = createOrUpdateProductFromLine(line, false);
    if(context==='purchase') p.buyPrice = toNumber(line.price); else p.sellPrice = toNumber(line.price);
    p.vat = toNumber(line.vat); p.mode = line.mode; p.kgBox = toNumber(line.kgBox)||p.kgBox;
    logChange(`Precio actualizado en producto ${p.name}`); saveState('Precio guardado'); toast('Precio guardado en producto');
  }
  function savePriceToClient(line){
    const p = findProductByName(line.productName); if(!p || !invoiceDraft.clientId){ toast('Selecciona cliente y producto existente'); return; }
    const existing = getPriceRule(invoiceDraft.clientId,p.id);
    if(existing) existing.price = toNumber(line.price); else state.priceRules.push({id:uid('rule'), clientId:invoiceDraft.clientId, productId:p.id, price:toNumber(line.price), updatedAt:nowStamp()});
    logChange(`Precio especial guardado para ${invoiceDraft.clientName || 'cliente'} · ${p.name}`); saveState('Precio cliente'); toast('Precio especial guardado');
  }

  function saveMinPriceToClient(line){
    const p = findProductByName(line.productName);
    if(!p || !invoiceDraft.clientId){ toast('Selecciona cliente y producto existente'); return; }
    let existing = getPriceRule(invoiceDraft.clientId,p.id);
    if(existing){ existing.minPrice = toNumber(line.price); existing.updatedAt = nowStamp(); }
    else state.priceRules.push({id:uid('rule'), clientId:invoiceDraft.clientId, productId:p.id, price:0, minPrice:toNumber(line.price), updatedAt:nowStamp()});
    logChange(`Precio mínimo guardado para ${invoiceDraft.clientName || 'cliente'} · ${p.name}`);
    saveState('Mínimo cliente'); toast('Precio mínimo del cliente guardado');
  }
  function useRecommendedOnLine(line, context='invoice'){
    const p = findProductByName(line.productName);
    if(!p){ toast('Producto no encontrado'); return; }
    const rec = recommendedPriceForProduct(p);
    if(!rec){ toast('Falta precio de compra para recomendar'); return; }
    line.price = String(rec).replace('.', ',');
    if(context==='invoice') renderInvoices(); else if(context==='purchase') renderPurchases(); else renderPage(currentPage);
    toast('Precio recomendado aplicado');
  }
  function applyRecommendedPrices(onlyIfEmpty=false){
    let changed=0;
    invoiceDraft.lines.forEach(line=>{
      const p = findProductByName(line.productName);
      if(!p) return;
      const rec = recommendedPriceForProduct(p);
      if(!rec) return;
      if(!onlyIfEmpty || !toNumber(line.price)) { line.price = String(rec).replace('.', ','); changed++; }
    });
    renderInvoices(); toast(`${changed} precios recomendados aplicados`);
  }
  function applyClientMinimums(){
    if(!invoiceDraft.clientId){ toast('Selecciona cliente'); return; }
    let changed=0;
    invoiceDraft.lines.forEach(line=>{
      const p = findProductByName(line.productName);
      if(!p) return;
      const rule = getPriceRule(invoiceDraft.clientId, p.id);
      const min = toNumber(rule?.minPrice || 0);
      if(min && toNumber(line.price) < min){ line.price = String(min).replace('.', ','); changed++; }
    });
    renderInvoices(); toast(changed ? `${changed} líneas subidas al mínimo del cliente` : 'No había precios por debajo del mínimo');
  }

  function createOrUpdateProductFromLine(line, notify=true){
    let p = findProductByName(line.productName);
    if(!p){ p = {id:uid('prod'), name:String(line.productName||'PRODUCTO NUEVO').toUpperCase(), aliases:'', mode:line.mode||'kg', unit:line.mode==='manojo'?'manojo':line.mode==='ud'?'ud':line.mode==='caja_fija'?'caja':'kg', kgBox:toNumber(line.kgBox), buyPrice:toNumber(line.buyPrice), sellPrice:toNumber(line.price), vat:toNumber(line.vat)||4, supplier:'', minMargin:15, code: uniqueProductCode(DEFAULT_CODE_MAP[String(line.productName||'').toUpperCase()] || autoCodeFromName(line.productName)), active:true, createdAt:nowStamp()}; state.products.push(p); }
    else { p.mode=line.mode; p.kgBox=toNumber(line.kgBox)||p.kgBox; p.vat=toNumber(line.vat)||p.vat; if(line.buyPrice)p.buyPrice=toNumber(line.buyPrice); if(line.price)p.sellPrice=toNumber(line.price); }
    logChange(`Producto creado/actualizado: ${p.name}`); saveState('Producto guardado'); if(notify) toast('Producto guardado'); return p;
  }

  function scheduleDraftSave(){ clearTimeout(autosaveTimer); autosaveTimer = setTimeout(()=>{ saveDrafts(); setSaveStatus('Borrador guardado'); },500); }
  function bindInvoiceForm(){
    $('#invClient').onchange = e => {
      const c = getClient(e.target.value); invoiceDraft.clientId = c?.id || ''; invoiceDraft.clientName = c?.name || '';
      if($('#invClientName')) $('#invClientName').value = invoiceDraft.clientName;
      if(c){ invoiceDraft.transportMode=c.transportMode||'none'; invoiceDraft.transportValue=c.transportValue||0; $('#invTransportMode').value=invoiceDraft.transportMode; $('#invTransportValue').value=invoiceDraft.transportValue; }
      updateClientHints(); updateFrequentProducts(); updateInvoiceSummary(); scheduleDraftSave();
    };
    $('#invClientName').oninput = e => { invoiceDraft.clientName = e.target.value; scheduleDraftSave(); };
    $('#invDate').onchange = e => { invoiceDraft.date=e.target.value; scheduleDraftSave(); };
    $('#invNo').oninput = e => { invoiceDraft.no=e.target.value; scheduleDraftSave(); };
    $('#invStatus').onchange = e => { invoiceDraft.status=e.target.value; scheduleDraftSave(); };
    $('#invTransportMode').onchange = e => { invoiceDraft.transportMode=e.target.value; updateInvoiceSummary(); scheduleDraftSave(); };
    $('#invTransportValue').oninput = e => { invoiceDraft.transportValue=e.target.value; updateInvoiceSummary(false); scheduleDraftSave(); };
    $('#invPriceVat').onchange = e => { invoiceDraft.priceIncludesVat = e.target.value === 'true'; updateInvoiceSummary(); scheduleDraftSave(); };
    $('#addInvLine').onclick = () => { invoiceDraft.lines.push(...emptyLines(1)); renderInvoices(); };
    $('#addInv5').onclick = () => { invoiceDraft.lines.push(...emptyLines(5)); renderInvoices(); };
    $('#clearInvoiceBtn').onclick = () => confirmModal('Nueva factura limpia','<p>Se borrará el borrador actual de factura.</p>',()=>{ invoiceDraft=newInvoiceDraft(); saveDrafts(); renderInvoices(); },'Limpiar');
    $('#saveInvDraft') && ($('#saveInvDraft').onclick = () => { saveDrafts(); toast('Borrador guardado'); });
    $('#emitInvBtn') && ($('#emitInvBtn').onclick = () => preEmitInvoice());
    $('#saveInvChanges') && ($('#saveInvChanges').onclick = () => preUpdateInvoice('emitida'));
    $('#saveInvReopened') && ($('#saveInvReopened').onclick = () => updateExistingInvoice('reabierta'));
    $('#cancelInvEdit') && ($('#cancelInvEdit').onclick = () => cancelInvoiceEdit());
    $('#pdfInvBtn').onclick = () => exportInvoicePDF(invoiceDraft, false);
    $('#pasteInvList').onclick = () => pasteLinesModal('invoice');
    $('#applyRecommendedBtn').onclick = () => applyRecommendedPrices(false);
    $('#applyClientMinimumsBtn').onclick = () => applyClientMinimums();
    $('#repeatInvoiceBtn').onclick = () => repeatLastInvoice();
  }
  function updateClientHints(){
    const c = getClient(invoiceDraft.clientId);
    $('#clientHints').innerHTML = c ? `<div class="chips"><span class="badge">Cliente: ${esc(c.name)}</span><span class="badge">Transporte: ${c.transportMode==='percent'?c.transportValue+'%':c.transportMode==='manual'?fmtMoney(c.transportValue):'No'}</span><span class="badge">Comisión interna: ${c.commissionType==='none'?'No':c.commissionValue+'%'}</span><span class="badge">Pago: ${esc(c.paymentMethod||'')}</span></div>` : '<span class="muted">Selecciona cliente para cargar transporte, productos frecuentes y precios especiales.</span>';
  }
  function updateFrequentProducts(){
    const root = $('#frequentProducts');
    if(!root) return;
    const c = getClient(invoiceDraft.clientId);
    let names = [];
    if(c){
      state.invoices.filter(i=>i.clientId===c.id).slice(-5).forEach(i=> activeLines(i.lines).forEach(l=>names.push(l.productName)));
    }
    if(!names.length) names = ['MACHO MADURO','MACHO VERDE','LIMA','OKRA','CILANTRO','JENGIBRE','AVOCADO','YUCA'];
    names = [...new Set(names.filter(Boolean))].slice(0,12);
    root.innerHTML = names.map(n=>`<button class="chip" data-add-product="${esc(n)}">${esc(n)}</button>`).join('');
    $$('[data-add-product]',root).forEach(b=>b.onclick=()=>{
      const line = invoiceDraft.lines.find(l=>!l.productName) || (invoiceDraft.lines.push(...emptyLines(1)), invoiceDraft.lines[invoiceDraft.lines.length-1]);
      line.productName = b.dataset.addProduct;
      const p = findProductByName(line.productName); if(p) applyProductToLine(line,p,'invoice');
      renderInvoices();
    });
  }
  function updateInvoiceSummary(full=true){
    const t = invoiceTotals(invoiceDraft);
    const root = $('#invoiceSummary'); if(!root) return;
    const vatLabel = usedVatLabelFromTotals(t);
    root.innerHTML = `<div class="totalPanel"><div class="summaryBox">
      <div class="summaryLine"><span>IVA aplicado</span><strong>${esc(vatLabel)}</strong></div>
      <div class="summaryLine"><span>Subtotal productos</span><strong>${fmtMoney(t.subtotal)}</strong></div>
      ${t.discount?`<div class="summaryLine"><span>Descuento</span><strong>-${fmtMoney(t.discount)}</strong></div>`:''}
      ${t.transportBase?`<div class="summaryLine"><span>Transporte</span><strong>${fmtMoney(t.transportBase)}</strong></div>`:''}
      <div class="summaryLine"><span>Base imponible</span><strong>${fmtMoney(t.subtotalAfterDiscount + t.transportBase)}</strong></div>
      <div class="summaryLine"><span>IVA total</span><strong>${fmtMoney(t.taxTotal)}</strong></div>
      <div class="summaryLine"><span>Cobrado</span><strong>${fmtMoney(t.paid)}</strong></div>
      <div class="summaryLine"><span>Pendiente</span><strong>${fmtMoney(t.pending)}</strong></div>
    </div><div class="totalBox totalBoxStrong"><span>Total factura</span><strong>${fmtMoney(t.total)}</strong><small>${t.lines.length} líneas · IVA aplicado: ${esc(vatLabel)}</small></div></div>`;
  }
  function preEmitInvoice(){
    const t = invoiceTotals(invoiceDraft);
    if(!invoiceDraft.clientName && !invoiceDraft.clientId){ toast('Selecciona cliente'); return; }
    if(!t.lines.length){ toast('Añade productos'); return; }
    const alerts = [];
    t.lineCalcs.forEach(x=>{ if(x.calc.cost && x.calc.profit<0) alerts.push(`Venta bajo coste: ${x.line.productName} (${fmtMoney(x.calc.profit)})`); if(!toNumber(x.line.vat) && x.line.vat !== '0') alerts.push(`Falta IVA: ${x.line.productName}`); });
    confirmModal('Revisar antes de emitir', `<div class="summaryBox"><div class="summaryLine"><span>Cliente</span><strong>${esc(invoiceDraft.clientName)}</strong></div><div class="summaryLine"><span>Total</span><strong>${fmtMoney(t.total)}</strong></div><div class="summaryLine"><span>Líneas</span><strong>${t.lines.length}</strong></div><div class="summaryLine"><span>IVA usado</span><strong>${t.vatGroups.map(g=>g.vat+'%').join(', ')}</strong></div></div>${alerts.length?'<div class="sep"></div><div class="alertList">'+alerts.map(a=>`<div class="alertItem warn">${esc(a)}</div>`).join('')+'</div>':''}`, () => emitInvoice(), 'Emitir');
  }
  function emitInvoice(){
    const inv = structuredClone(invoiceDraft);
    inv.id = uid('inv'); inv.routeId = route()?.id; inv.status='emitida'; inv.createdAt=nowStamp();
    state.invoices.unshift(inv);
    logChange(`Factura emitida ${inv.no} · ${inv.clientName} · ${fmtMoney(invoiceTotals(inv).total)}`);
    invoiceDraft = newInvoiceDraft(); saveState('Factura emitida'); renderInvoices(); toast('Factura emitida');
  }
  function preUpdateInvoice(finalStatus='emitida'){
    const t = invoiceTotals(invoiceDraft);
    if(!invoiceDraft.editingId){ toast('No hay factura en edición'); return; }
    if(!invoiceDraft.clientName && !invoiceDraft.clientId){ toast('Selecciona cliente'); return; }
    if(!t.lines.length){ toast('Añade productos'); return; }
    confirmModal('Guardar cambios', `<div class="summaryBox"><div class="summaryLine"><span>Factura</span><strong>${esc(invoiceDraft.no)}</strong></div><div class="summaryLine"><span>Cliente</span><strong>${esc(invoiceDraft.clientName)}</strong></div><div class="summaryLine"><span>Total</span><strong>${fmtMoney(t.total)}</strong></div><div class="summaryLine"><span>Estado final</span><strong>${esc(finalStatus)}</strong></div></div>`, () => updateExistingInvoice(finalStatus), 'Guardar');
  }
  function updateExistingInvoice(finalStatus='emitida'){
    const idx = state.invoices.findIndex(i=>i.id===invoiceDraft.editingId);
    if(idx<0){ toast('Factura original no encontrada'); return; }
    const old = state.invoices[idx];
    const inv = structuredClone(invoiceDraft);
    inv.id = old.id;
    inv.routeId = old.routeId || route()?.id;
    inv.createdAt = old.createdAt || nowStamp();
    inv.updatedAt = nowStamp();
    inv.status = finalStatus || inv.status || old.status || 'emitida';
    inv.editingId = '';
    inv.editingOriginalStatus = '';
    state.invoices[idx] = inv;
    logChange(`Factura modificada ${inv.no} · ${inv.clientName} · ${fmtMoney(invoiceTotals(inv).total)} · estado ${inv.status}`);
    invoiceDraft = newInvoiceDraft();
    saveState('Factura modificada');
    renderInvoices();
    toast('Factura modificada');
  }
  function editInvoice(id, force=false){
    const inv = state.invoices.find(i=>i.id===id);
    if(!inv) return;
    const load = () => {
      invoiceDraft = structuredClone(inv);
      invoiceDraft.editingId = inv.id;
      invoiceDraft.editingOriginalStatus = inv.status || '';
      if(!['borrador','reabierta'].includes(inv.status)) invoiceDraft.status = 'reabierta';
      invoiceDraft.lines = (invoiceDraft.lines||[]).map(l=>({...l,id:l.id||uid('line')}));
      while(invoiceDraft.lines.length < (state.settings.lineDefaults||8)) invoiceDraft.lines.push(...emptyLines(1));
      saveDrafts();
      renderPage('invoices');
      setTimeout(()=>document.querySelector('#invoiceLineTable input')?.focus(),50);
      toast('Factura abierta para editar');
    };
    if(force || ['borrador','reabierta'].includes(inv.status)) load();
    else confirmModal('Reabrir factura', `<p>La factura <b>${esc(inv.no)}</b> se abrirá para modificarla. Después podrás guardar cambios y volver a dejarla emitida.</p>`, load, 'Reabrir');
  }
  function cancelInvoiceEdit(){
    invoiceDraft = newInvoiceDraft();
    saveDrafts();
    renderInvoices();
    toast('Edición cancelada');
  }
  function voidInvoice(id){
    const inv = state.invoices.find(i=>i.id===id); if(!inv)return;
    confirmModal('Anular factura', `<p>¿Anular la factura <b>${esc(inv.no)}</b> de ${esc(inv.clientName)}?</p>`, ()=>{ inv.status='anulada'; inv.updatedAt=nowStamp(); logChange(`Factura anulada ${inv.no} · ${inv.clientName}`); saveState('Factura anulada'); renderInvoices(); toast('Factura anulada'); }, 'Anular');
  }
  function repeatLastInvoice(){
    const cId = invoiceDraft.clientId;
    const last = state.invoices.find(i => !cId || i.clientId===cId);
    if(!last){ toast('No hay factura anterior'); return; }
    invoiceDraft = structuredClone(last); invoiceDraft.id=uid('draftinv'); invoiceDraft.no=nextInvoiceNo(); invoiceDraft.date=todayISO(); invoiceDraft.status='borrador'; invoiceDraft.lines = invoiceDraft.lines.map(l=>({...l,id:uid('line')}));
    saveDrafts(); renderInvoices(); toast('Factura repetida como borrador');
  }
  function invoiceListTable(invs){
    if(!invs.length) return '<div class="empty">No hay facturas guardadas.</div>';
    return `<div class="tableWrap"><table><thead><tr><th>Fecha</th><th>Nº</th><th>Cliente</th><th>Estado</th><th class="num">Total</th><th class="num">Pendiente</th><th>Acciones</th></tr></thead><tbody>${invs.map(i=>{const t=invoiceTotals(i); const editLabel=['borrador','reabierta'].includes(i.status)?'Editar':'Reabrir'; return `<tr><td>${esc(i.date)}</td><td class="mono">${esc(i.no)}</td><td>${esc(i.clientName)}</td><td><span class="badge ${i.status==='anulada'?'badBadge':i.status==='reabierta'?'warnBadge':''}">${esc(i.status)}</span></td><td class="num"><b>${fmtMoney(t.total)}</b></td><td class="num">${fmtMoney(t.pending)}</td><td><button class="primaryBtn tiny" data-edit-inv="${i.id}">${editLabel}</button> <button class="ghostBtn tiny" data-pdf-inv="${i.id}">PDF</button> <button class="ghostBtn tiny" data-dup-inv="${i.id}">Duplicar</button> <button class="successBtn tiny" data-pay-inv="${i.id}">Cobrar</button> <button class="dangerBtn tiny" data-void-inv="${i.id}">Anular</button></td></tr>`}).join('')}</tbody></table></div>`;
  }


  function renderOrders(){
    $('#view').innerHTML = `
      <div class="card">
        <div class="cardTitle">
          <div><h2>Pedidos</h2><p>Pega un pedido una vez y conviértelo en compra, factura o ambas. Sugerencias libres: puedes escribir el nombre completo.</p></div>
          <div class="toolbar"><button class="ghostBtn small" id="clearOrderBtn">Pedido limpio</button><button class="ghostBtn small" id="exampleOrderBtn">Ejemplo Dani</button></div>
        </div>
        <div class="row">
          <div class="field col4"><label>Cliente detectado</label><input id="orderClientName" value="${esc(orderDraft.clientName||'')}" placeholder="Ej. DANI" /></div>
          <div class="field col3"><label>Etiqueta / ruta</label><input id="orderTag" value="${esc(orderDraft.tag||'')}" placeholder="Ej. LOCUTORIO" /></div>
          <div class="field col2"><label>Fecha</label><input id="orderDate" type="date" value="${esc(orderDraft.date||todayISO())}" /></div>
          <div class="field col3"><label>Estado</label><select id="orderStatus"><option value="borrador">Borrador</option><option value="revisado">Revisado</option><option value="faltante">Con faltas</option><option value="compra">Compra creada</option><option value="factura">Factura creada</option><option value="convertido">Convertido</option><option value="cerrado">Cerrado</option></select></div>
          <div class="field col12"><label>Texto del pedido</label><textarea id="orderRaw" rows="8" placeholder="Pega aquí el pedido de WhatsApp...">${esc(orderDraft.raw||'')}</textarea></div>
        </div>
        <div class="toolbar">
          <button class="primaryBtn small" id="parseOrderBtn">Leer pedido</button>
          <button class="successBtn small" id="allAvailableBtn">Hay de todo</button>
          <button class="ghostBtn small" id="mergeOrderBtn">Unificar repetidos</button>
          <button class="ghostBtn small" id="addOrderLineBtn">+ Línea manual</button>
          <button class="primaryBtn small" id="orderToInvoiceBtn">Convertir a factura</button>
          <button class="ghostBtn small" id="orderToPurchaseBtn">Convertir a compra</button>
          <button class="successBtn small" id="orderToBothBtn">Compra + factura</button>
          <button class="ghostBtn small" id="orderToShopBtn">Enviar a tienda</button>
          <button class="ghostBtn small" id="orderValidateBtn">Validar pedido</button>
          <button class="ghostBtn small" id="orderWhatsSupplierBtn">WhatsApp proveedor</button>
          <button class="ghostBtn small" id="orderWhatsClientBtn">WhatsApp cliente</button>
          <button class="ghostBtn small" id="saveOrderBtn">Guardar pedido</button>
        </div>
        <div id="orderAlerts" style="margin:12px 0"></div>
        <div class="tableWrap"><table class="lineTable" id="orderLineTable"><thead><tr><th>#</th><th>Hay</th><th class="num">Cant.</th><th>Producto</th><th>Modo</th><th class="num">Kg/caja</th><th class="num">Neto</th><th class="num">P. compra</th><th class="num">P. venta</th><th>IVA</th><th class="num">Venta</th><th></th></tr></thead><tbody></tbody></table></div>
        <div style="margin-top:16px" id="orderSummary"></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="cardTitle"><h2>Pedidos guardados</h2></div>${orderListTable()}</div>`;
    $('#orderStatus').value = orderDraft.status || 'borrador';
    renderOrderRows();
    bindOrderForm();
    updateOrderSummary();
  }

  function bindOrderForm(){
    $('#orderClientName').oninput=e=>{ orderDraft.clientName=e.target.value; scheduleDraftSave(); };
    $('#orderTag').oninput=e=>{ orderDraft.tag=e.target.value; scheduleDraftSave(); };
    $('#orderDate').onchange=e=>{ orderDraft.date=e.target.value; scheduleDraftSave(); };
    $('#orderStatus').onchange=e=>{ orderDraft.status=e.target.value; scheduleDraftSave(); };
    $('#orderRaw').oninput=e=>{ orderDraft.raw=e.target.value; scheduleDraftSave(); };
    $('#parseOrderBtn').onclick=()=>{ parseOrderIntoDraft($('#orderRaw').value); renderOrders(); };
    $('#exampleOrderBtn').onclick=()=>{ $('#orderRaw').value = sampleDaniOrder(); orderDraft.raw = $('#orderRaw').value; parseOrderIntoDraft(orderDraft.raw); renderOrders(); };
    $('#clearOrderBtn').onclick=()=>confirmModal('Pedido limpio','<p>Se borrará el pedido actual.</p>',()=>{orderDraft=newOrderDraft(); saveDrafts(); renderOrders();},'Limpiar');
    $('#allAvailableBtn').onclick=()=>{ orderDraft.lines.forEach(l=>l.available=true); updateOrderAvailabilityUI(); updateOrderSummary(); scheduleDraftSave(); toast('Pedido marcado como disponible'); };
    $('#mergeOrderBtn').onclick=()=>{ mergeOrderDuplicates(); renderOrders(); toast('Productos repetidos unificados'); };
    $('#addOrderLineBtn').onclick=()=>{ orderDraft.lines.push(newOrderLine('', '', true)); renderOrders(); };
    $('#orderToInvoiceBtn').onclick=()=>convertOrderToInvoice();
    $('#orderToPurchaseBtn').onclick=()=>convertOrderToPurchase();
    $('#orderToBothBtn').onclick=()=>convertOrderToBoth();
    $('#orderToShopBtn').onclick=()=>convertOrderToShop();
    $('#orderValidateBtn').onclick=()=>showOrderValidationModal();
    $('#orderWhatsSupplierBtn').onclick=()=>copyOrderWhatsApp('supplier');
    $('#orderWhatsClientBtn').onclick=()=>copyOrderWhatsApp('client');
    $('#saveOrderBtn').onclick=()=>saveOrder();
  }

  function sampleDaniOrder(){
    return `📦 *Pedido DANI — LOCUTORIO*\n\n2 MACHO VERDE\n5 MACHO MADURO PRIMERA\n1 YUCA\n1 GUINEO VERDE\n1 BANANA\n5 AGUACATE PRIMERA\n4 AVOCADO\n1 TOMATE DANIELA\n1 MANGO\n1 LIMON EXTRA\n2 LIMA\n40 CILANTRO\n1 OKRA\n2 HABANERO\n1 AJO PRIMERA\n1 MANGO\n1 GUINDILLA`;
  }

  function parseOrderIntoDraft(text){
    const raw = String(text||'').replace(/�/g,'').trim();
    orderDraft.raw = raw;
    const lines = raw.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    const header = lines.find(l=>/pedido/i.test(l)) || '';
    const cleanedHeader = header.replace(/[📦*]/g,'').replace(/pedido/i,'').trim();
    if(cleanedHeader){
      const parts = cleanedHeader.split(/—|–|-|\|/).map(x=>x.trim()).filter(Boolean);
      orderDraft.clientName = (parts[0] || orderDraft.clientName || '').toUpperCase();
      orderDraft.tag = (parts.slice(1).join(' · ') || orderDraft.tag || '').toUpperCase();
    }
    const parsed=[];
    lines.forEach(row=>{
      let clean = row.replace(/[📦*•]/g,'').trim();
      if(!clean || /pedido/i.test(clean)) return;
      const m = clean.match(/^(\d+(?:[,.]\d+)?)\s+(.+)$/);
      if(!m) return;
      const qty=m[1];
      const name=m[2].replace(/\b(cajas?|kg|ud|unidad(?:es)?|manojos?)\b/ig,'').trim().toUpperCase();
      parsed.push(newOrderLine(qty, name, true));
    });
    orderDraft.lines = parsed;
    orderDraft.status = 'borrador';
    saveDrafts();
  }

  function smartFindProduct(name){
    return findProductByName(name) || productSuggestions(name, 1)[0] || null;
  }

  function newOrderLine(qty, name, available=true){
    const line = {id:uid('ordline'), productId:'', productName:name||'', mode:'kg', qty:qty||'', kgBox:'', bruto:'', tara:'', neto:'', price:'', buyPrice:'', vat:'4', discount:'', note:'', available, type:'order'};
    const p=smartFindProduct(name);
    if(p) applyProductToLine(line,p,'invoice');
    line.qty = qty || line.qty || '';
    return line;
  }

  function renderOrderRows(){
    const tbody = $('#orderLineTable tbody'); if(!tbody) return;
    tbody.innerHTML = orderDraft.lines.map((line,idx)=>orderRowHtml(line,idx)).join('');
    if(!tbody.dataset.boundOrders){ bindOrderTable(tbody); tbody.dataset.boundOrders='1'; }
  }
  function orderRowHtml(line,idx){
    const c=lineCalc(line,false);
    return `<tr data-line-id="${line.id}" class="${line.available===false?'mutedRow':''}">
      <td data-label="#"><span class="lineIndex">${idx+1}</span></td>
      <td data-label="Código"><b class="mono">${esc(productCodeFor(line)||'—')}</b></td>
      <td data-label="Hay"><input type="checkbox" data-order-available ${line.available!==false?'checked':''} /></td>
      <td data-label="Cant."><input class="decimalInput" inputmode="decimal" data-order-field="qty" value="${esc(line.qty)}" placeholder="0" /></td>
      <td data-label="Producto" class="productCell"><div class="suggestHost"><input data-order-field="productName" value="${esc(line.productName)}" placeholder="Escribir producto..." autocomplete="off" /><div class="suggestList hidden"></div></div><small class="muted">${line.productId?'Detectado':'Manual o pendiente'}</small></td>
      <td data-label="Modo"><select data-order-field="mode">${modeOptions(line.mode)}</select></td>
      <td data-label="Kg/caja"><input class="decimalInput" inputmode="decimal" data-order-field="kgBox" value="${esc(line.kgBox)}" placeholder="0" /></td>
      <td data-label="Neto" class="calcCell" data-calc="neto">${fmtNum(c.neto)}${unitSuffix(line)}</td>
      <td data-label="P. compra" class="moneyCell"><div class="priceBox"><button class="stepBtn" data-order-step-buy="-0.10">−</button><input class="decimalInput" inputmode="decimal" data-order-field="buyPrice" value="${esc(line.buyPrice)}" placeholder="0,00" /><button class="stepBtn" data-order-step-buy="0.10">+</button></div></td>
      <td data-label="P. venta" class="moneyCell"><div class="priceBox"><button class="stepBtn" data-order-step-sell="-0.10">−</button><input class="decimalInput" inputmode="decimal" data-order-field="price" value="${esc(line.price)}" placeholder="0,00" /><button class="stepBtn" data-order-step-sell="0.10">+</button></div></td>
      <td data-label="IVA"><select data-order-field="vat">${vatOptions(line.vat)}</select></td>
      <td data-label="Venta" class="calcCell" data-calc="importe">${fmtMoney(c.base)}</td>
      <td data-label="Acción"><button class="dangerBtn tiny" data-delete-order-line>×</button></td>
    </tr>`;
  }
  function bindOrderTable(tbody){
    tbody.addEventListener('input', e=>{
      const input=e.target.closest('[data-order-field]'); if(!input)return;
      const tr=input.closest('tr'); const line=orderDraft.lines.find(l=>l.id===tr.dataset.lineId); if(!line)return;
      line[input.dataset.orderField]=input.value;
      if(input.dataset.orderField==='productName') showOrderSuggestions(input,line);
      updateLineCalc(tr,line,'invoice'); updateOrderSummary(); scheduleDraftSave();
    });
    tbody.addEventListener('change', e=>{
      const tr=e.target.closest('tr'); if(!tr)return; const line=orderDraft.lines.find(l=>l.id===tr.dataset.lineId); if(!line)return;
      if(e.target.closest('[data-order-available]')){ line.available=e.target.checked; tr.classList.toggle('mutedRow', !line.available); updateOrderSummary(); scheduleDraftSave(); return; }
      const input=e.target.closest('[data-order-field]'); if(input){ line[input.dataset.orderField]=input.value; if(input.dataset.orderField==='productName'){ const exact=findProductByName(input.value); if(exact){ applyProductToLine(line,exact,'invoice'); paintOrderInputs(tr,line); } } updateLineCalc(tr,line,'invoice'); updateOrderSummary(); scheduleDraftSave(); }
    });
    tbody.addEventListener('blur', e=>{
      const input=e.target.closest('.decimalInput'); if(!input||input.value==='')return;
      input.value=String(input.value).replace('.',','); const tr=input.closest('tr'); const line=orderDraft.lines.find(l=>l.id===tr.dataset.lineId); if(line&&input.dataset.orderField) line[input.dataset.orderField]=input.value; scheduleDraftSave();
    }, true);
    tbody.addEventListener('click', e=>{
      const tr=e.target.closest('tr'); if(!tr)return; const line=orderDraft.lines.find(l=>l.id===tr.dataset.lineId); if(!line)return;
      if(e.target.closest('[data-order-step-sell]')){ const delta=toNumber(e.target.closest('[data-order-step-sell]').dataset.orderStepSell); line.price=round2(toNumber(line.price)+delta).toString().replace('.',','); tr.querySelector('[data-order-field="price"]').value=line.price; updateLineCalc(tr,line,'invoice'); updateOrderSummary(); scheduleDraftSave(); }
      if(e.target.closest('[data-order-step-buy]')){ const delta=toNumber(e.target.closest('[data-order-step-buy]').dataset.orderStepBuy); line.buyPrice=round2(toNumber(line.buyPrice)+delta).toString().replace('.',','); tr.querySelector('[data-order-field="buyPrice"]').value=line.buyPrice; updateLineCalc(tr,line,'invoice'); updateOrderSummary(); scheduleDraftSave(); }
      if(e.target.closest('[data-delete-order-line]')){ orderDraft.lines=orderDraft.lines.filter(l=>l.id!==line.id); renderOrderRows(); updateOrderSummary(); scheduleDraftSave(); }
    });
  }
  function showOrderSuggestions(input,line){
    const host=input.closest('.suggestHost'); const box=$('.suggestList',host); const sug=productSuggestions(input.value,8);
    if(!input.value.trim() || !sug.length){ box.innerHTML=input.value.trim()?'<div class="suggestEmpty">Producto nuevo/manual. Puedes seguir escribiendo.</div>':''; box.classList.toggle('hidden',!input.value.trim()); return; }
    box.innerHTML=sug.map(p=>`<div class="suggestItem" data-product-id="${p.id}"><b><span class="mono">${esc(p.code||'')}</span> · ${esc(p.name)}</b><span>${esc(p.mode)} · IVA ${p.vat}% · V ${fmtMoney(p.sellPrice||0)}</span></div>`).join('') + `<div class="suggestEmpty">Puedes ignorar sugerencias y escribir completo.</div>`;
    box.classList.remove('hidden');
    $$('.suggestItem',box).forEach(item=>item.onmousedown=ev=>{ ev.preventDefault(); const p=state.products.find(x=>x.id===item.dataset.productId); applyProductToLine(line,p,'invoice'); const tr=input.closest('tr'); paintOrderInputs(tr,line); box.classList.add('hidden'); updateLineCalc(tr,line,'invoice'); updateOrderSummary(); scheduleDraftSave(); });
  }
  function paintOrderInputs(tr,line){
    if(!tr || !line) return;
    const set=(field,value)=>{ const el=tr.querySelector(`[data-order-field="${field}"]`); if(el) el.value=value ?? ''; };
    set('productName', line.productName || ''); set('qty', line.qty || ''); set('mode', line.mode || 'kg'); set('kgBox', line.kgBox || ''); set('buyPrice', line.buyPrice || ''); set('price', line.price || ''); set('vat', line.vat || '4');
  }
  function updateOrderAvailabilityUI(){ $$('#orderLineTable tbody tr').forEach(tr=>{ const line=orderDraft.lines.find(l=>l.id===tr.dataset.lineId); if(line){ const cb=tr.querySelector('[data-order-available]'); if(cb)cb.checked=line.available!==false; tr.classList.toggle('mutedRow', line.available===false); } }); }
  function orderTotals(){
    const lines=orderDraft.lines.filter(l=>l.productName && l.available!==false);
    const calcs=lines.map(l=>({line:l, calc:lineCalc(l,false)}));
    const subtotal=round2(calcs.reduce((s,x)=>s+x.calc.base,0));
    const cost=round2(calcs.reduce((s,x)=>s+x.calc.cost,0));
    const profit=round2(subtotal-cost);
    const margin=subtotal?round2(profit/subtotal*100):0;
    const missing=orderDraft.lines.filter(l=>l.productName && l.available===false);
    const noBuy=lines.filter(l=>!toNumber(l.buyPrice));
    const noSell=lines.filter(l=>!toNumber(l.price));
    const unknown=lines.filter(l=>!smartFindProduct(l.productName));
    return {lines, calcs, subtotal, cost, profit, margin, missing, noBuy, noSell, unknown, totalLines:orderDraft.lines.filter(l=>l.productName).length};
  }
  function updateOrderSummary(){
    const root=$('#orderSummary'); if(!root)return; const t=orderTotals();
    const missingList=t.missing.map(l=>`<span class="badge badBadge">${esc(l.qty)} ${esc(l.productName)}</span>`).join(' ');
    const alerts=[];
    if(t.missing.length) alerts.push(`<div class="alertItem warn"><strong>Faltan productos</strong><br>${missingList}</div>`);
    if(t.unknown.length) alerts.push(`<div class="alertItem warn"><strong>Productos sin reconocer</strong><br>${t.unknown.slice(0,6).map(l=>esc(l.productName)).join(' · ')}</div>`);
    if(t.noBuy.length) alerts.push(`<div class="alertItem warn"><strong>Faltan precios de compra</strong><br>${t.noBuy.slice(0,6).map(l=>esc(l.productName)).join(' · ')}</div>`);
    if(t.noSell.length) alerts.push(`<div class="alertItem warn"><strong>Faltan precios de venta</strong><br>${t.noSell.slice(0,6).map(l=>esc(l.productName)).join(' · ')}</div>`);
    if(!alerts.length && t.totalLines) alerts.push('<div class="alertItem good"><strong>Pedido listo</strong><br>Puedes convertirlo en compra, factura o ambas.</div>');
    $('#orderAlerts').innerHTML = alerts.join('');
    root.innerHTML=`<div class="totalPanel"><div class="summaryBox"><div class="summaryLine"><span>Líneas del pedido</span><strong>${t.totalLines}</strong></div><div class="summaryLine"><span>Disponibles</span><strong>${t.lines.length}</strong></div><div class="summaryLine"><span>Faltantes</span><strong>${t.missing.length}</strong></div><div class="summaryLine"><span>Coste compra estimado</span><strong>${fmtMoney(t.cost)}</strong></div><div class="summaryLine"><span>Venta base estimada</span><strong>${fmtMoney(t.subtotal)}</strong></div><div class="summaryLine"><span>Diferencia estimada interna</span><strong>${fmtMoney(t.profit)}</strong></div></div><div class="totalBox"><span>Margen pedido</span><strong>${fmtNum(t.margin,2)}%</strong><small>Solo informe interno</small></div></div>`;
  }
  function mergeOrderDuplicates(){
    const map=new Map();
    orderDraft.lines.forEach(line=>{
      if(!line.productName) return;
      const key=normalize(line.productName);
      if(!map.has(key)) map.set(key,{...line,id:uid('ordline')});
      else { const ex=map.get(key); ex.qty=String(round2(toNumber(ex.qty)+toNumber(line.qty))).replace('.',','); }
    });
    orderDraft.lines=[...map.values()]; scheduleDraftSave();
  }
  function convertOrderToInvoice(){
    const t=orderTotals();
    if(!orderDraft.clientName){ toast('Escribe o detecta el cliente'); return; }
    if(!t.lines.length){ toast('No hay líneas disponibles para facturar'); return; }
    const client = state.clients.find(c=>normalize(c.name)===normalize(orderDraft.clientName));
    invoiceDraft = newInvoiceDraft();
    invoiceDraft.clientId = client?.id || '';
    invoiceDraft.clientName = client?.name || orderDraft.clientName;
    invoiceDraft.date = orderDraft.date || todayISO();
    if(client){ invoiceDraft.transportMode=client.transportMode||'none'; invoiceDraft.transportValue=client.transportValue||0; invoiceDraft.paymentMethod=client.paymentMethod||'efectivo'; }
    invoiceDraft.notes = `Pedido convertido${orderDraft.tag?' · '+orderDraft.tag:''}`;
    invoiceDraft.lines = t.lines.map(l=>({...l,id:uid('line'),type:'invoice'}));
    while(invoiceDraft.lines.length < (state.settings.lineDefaults||8)) invoiceDraft.lines.push(...emptyLines(1));
    orderDraft.status='factura';
    saveOrder(false);
    saveDrafts();
    renderPage('invoices');
    toast('Pedido convertido a factura. Revisa precios y emite.');
  }
  function convertOrderToPurchase(){
    const t=orderTotals();
    if(!t.lines.length){ toast('No hay líneas disponibles para comprar'); return; }
    purchaseDraft = newPurchaseDraft();
    purchaseDraft.date = orderDraft.date || todayISO();
    purchaseDraft.invoiceNo = `PEDIDO ${orderDraft.clientName||''}${orderDraft.tag?' '+orderDraft.tag:''}`.trim();
    purchaseDraft.notes = `Compra creada desde pedido${orderDraft.clientName?' · '+orderDraft.clientName:''}${orderDraft.tag?' · '+orderDraft.tag:''}`;
    const suppliers = [...new Set(t.lines.map(l=>smartFindProduct(l.productName)?.supplier).filter(Boolean))];
    const sup = state.suppliers.find(s=>normalize(s.name)===normalize(suppliers[0]||''));
    purchaseDraft.supplierId = sup?.id || '';
    purchaseDraft.supplierName = sup?.name || (suppliers[0] || '');
    purchaseDraft.lines = t.lines.map(l=>{
      const copy={...l,id:uid('line'),type:'purchase'};
      copy.price = copy.buyPrice || copy.price || '';
      return copy;
    });
    while(purchaseDraft.lines.length < (state.settings.lineDefaults||8)) purchaseDraft.lines.push(...emptyLines(1,'purchase'));
    orderDraft.status='compra';
    saveOrder(false);
    saveDrafts();
    renderPage('purchases');
    toast('Pedido convertido a compra. Revisa precios de compra y guarda.');
  }
  function convertOrderToBoth(){
    convertOrderToPurchase();
    const savedPurchaseDraft = structuredClone(purchaseDraft);
    convertOrderToInvoice();
    purchaseDraft = savedPurchaseDraft;
    saveDrafts();
    toast('Pedido preparado como compra y factura. Revisa ambos borradores antes de guardar/emitir.');
  }

  function orderValidationDetails(){
    const t = orderTotals();
    const alerts = [];
    if(!orderDraft.clientName) alerts.push({type:'bad', title:'Falta cliente', detail:'Escribe o detecta el cliente antes de convertir a factura.'});
    if(!t.totalLines) alerts.push({type:'bad', title:'Pedido vacío', detail:'No hay productos en el pedido.'});
    if(t.missing.length) alerts.push({type:'warn', title:'Productos faltantes', detail:t.missing.map(l=>`${l.qty||''} ${l.productName}`).join(' · ')});
    if(t.unknown.length) alerts.push({type:'warn', title:'Productos no reconocidos', detail:t.unknown.map(l=>l.productName).join(' · ')});
    if(t.noBuy.length) alerts.push({type:'warn', title:'Falta precio de compra', detail:t.noBuy.map(l=>l.productName).join(' · ')});
    if(t.noSell.length) alerts.push({type:'warn', title:'Falta precio de venta', detail:t.noSell.map(l=>l.productName).join(' · ')});
    const low = t.lines.filter(l=>toNumber(l.price) && toNumber(l.buyPrice) && toNumber(l.price)<toNumber(l.buyPrice));
    if(low.length) alerts.push({type:'bad', title:'Venta bajo coste', detail:low.map(l=>`${l.productName}: compra ${fmtMoney(toNumber(l.buyPrice))} / venta ${fmtMoney(toNumber(l.price))}`).join(' · ')});
    if(!alerts.length) alerts.push({type:'good', title:'Pedido listo', detail:'Puedes convertirlo en compra, factura, ambas o tienda propia.'});
    return {totals:t, alerts};
  }
  function showOrderValidationModal(){
    const v = orderValidationDetails();
    const items = v.alerts.map(a=>`<div class="alertItem ${a.type==='bad'?'bad':a.type==='good'?'good':'warn'}"><strong>${esc(a.title)}</strong><br>${esc(a.detail||'')}</div>`).join('');
    $('#modalRoot').innerHTML = `<div class="modalBackdrop"><div class="modal wide"><div class="modalHead"><h3>Validación del pedido</h3><button class="iconBtn" data-modal-close>×</button></div>${items}<div class="totalPanel" style="margin-top:14px"><div class="summaryBox"><div class="summaryLine"><span>Coste compra estimado</span><strong>${fmtMoney(v.totals.cost)}</strong></div><div class="summaryLine"><span>Venta base estimada</span><strong>${fmtMoney(v.totals.subtotal)}</strong></div><div class="summaryLine"><span>Diferencia interna</span><strong>${fmtMoney(v.totals.profit)}</strong></div></div><div class="totalBox"><span>Margen</span><strong>${fmtNum(v.totals.margin,2)}%</strong><small>Solo interno</small></div></div></div></div>`;
    $$('[data-modal-close]').forEach(b=>b.onclick=()=>$('#modalRoot').innerHTML='');
  }
  function convertOrderToShop(){
    const t = orderTotals();
    if(!t.lines.length){ toast('No hay líneas disponibles para enviar a tienda'); return; }
    const shop = state.shops.find(s=>normalize(orderDraft.tag).includes(normalize(s.name)) || normalize(orderDraft.clientName).includes(normalize(s.name))) || state.shops[0];
    transferDraft = newTransferDraft();
    transferDraft.date = orderDraft.date || todayISO();
    transferDraft.shopId = shop?.id || '';
    transferDraft.shopName = shop?.name || '';
    transferDraft.notes = `Reparto creado desde pedido${orderDraft.clientName?' · '+orderDraft.clientName:''}${orderDraft.tag?' · '+orderDraft.tag:''}`;
    transferDraft.lines = t.lines.map(l=>({...l,id:uid('line'),type:'transfer'}));
    while(transferDraft.lines.length < (state.settings.lineDefaults||8)) transferDraft.lines.push(...emptyLines(1,'transfer'));
    orderDraft.status='convertido';
    saveOrder(false);
    saveDrafts();
    renderPage('shops');
    toast('Pedido enviado a Tiendas propias. Revisa tienda y guarda reparto.');
  }
  function duplicateOrder(id){
    const o=state.orders.find(x=>x.id===id); if(!o)return;
    orderDraft=structuredClone(o); orderDraft.id=uid('draftord'); orderDraft.status='borrador'; orderDraft.date=todayISO(); orderDraft.lines=(orderDraft.lines||[]).map(l=>({...l,id:uid('ordline')}));
    saveDrafts(); renderPage('orders'); toast('Pedido duplicado como borrador');
  }
  function deleteOrder(id){
    const o=state.orders.find(x=>x.id===id); if(!o)return;
    confirmModal('Eliminar pedido', `<p>¿Eliminar el pedido de <b>${esc(o.clientName||'')}</b>?</p>`, ()=>{ state.orders=state.orders.filter(x=>x.id!==id); logChange(`Pedido eliminado ${o.clientName||''}`); saveState('Pedido eliminado'); renderOrders(); }, 'Eliminar');
  }
  function loadOrderAction(id, action){
    const o=state.orders.find(x=>x.id===id); if(!o)return;
    orderDraft=structuredClone(o); saveDrafts();
    if(action==='invoice') return convertOrderToInvoice();
    if(action==='purchase') return convertOrderToPurchase();
    if(action==='both') return convertOrderToBoth();
    if(action==='shop') return convertOrderToShop();
    renderPage('orders');
  }
  function orderWhatsText(kind){
    const lines = orderDraft.lines.filter(l=>l.productName && (kind==='supplier' || l.available!==false));
    const header = kind==='supplier' ? `Pedido proveedor${orderDraft.clientName?' · '+orderDraft.clientName:''}${orderDraft.tag?' · '+orderDraft.tag:''}` : `Pedido ${orderDraft.clientName||''}${orderDraft.tag?' — '+orderDraft.tag:''}`;
    const body = lines.map(l=>`${l.qty || ''} ${l.productName}`.trim()).join('\n');
    const missing = orderDraft.lines.filter(l=>l.productName && l.available===false).map(l=>`${l.qty || ''} ${l.productName}`.trim());
    return `${header}\n\n${body}${kind==='client' && missing.length ? `\n\nPendiente / falta:\n${missing.join('\n')}` : ''}`.trim();
  }
  function copyOrderWhatsApp(kind){
    const text = orderWhatsText(kind);
    navigator.clipboard?.writeText(text).then(()=>toast('Resumen copiado para WhatsApp')).catch(()=>{
      $('#modalRoot').innerHTML=`<div class="modalBackdrop"><div class="modal"><div class="modalHead"><h3>Resumen WhatsApp</h3><button class="iconBtn" data-modal-close>×</button></div><textarea rows="12" style="width:100%">${esc(text)}</textarea></div></div>`;
      $$('[data-modal-close]').forEach(b=>b.onclick=()=>$('#modalRoot').innerHTML='');
    });
  }

  function saveOrder(show=true){
    const existing=state.orders.find(o=>o.id===orderDraft.id);
    const clone=structuredClone(orderDraft); clone.routeId=route()?.id; clone.updatedAt=nowStamp();
    if(existing) Object.assign(existing, clone); else state.orders.unshift({...clone, createdAt:nowStamp()});
    logChange(`Pedido guardado ${orderDraft.clientName||''} · ${orderDraft.lines.filter(l=>l.productName).length} líneas`);
    saveState('Pedido guardado'); if(show) toast('Pedido guardado');
  }
  function orderListTable(){
    if(!state.orders?.length) return '<div class="empty">No hay pedidos guardados.</div>';
    return `<div class="tableWrap"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Etiqueta</th><th>Estado</th><th class="num">Líneas</th><th class="num">Disponibles</th><th class="num">Faltan</th><th class="num">Venta est.</th><th>Acciones</th></tr></thead><tbody>${state.orders.map(o=>{const lines=(o.lines||[]).filter(l=>l.productName); const av=lines.filter(l=>l.available!==false); const missing=lines.filter(l=>l.available===false); const subtotal=round2(av.reduce((s,l)=>s+lineCalc(l,false).base,0)); return `<tr><td>${esc(o.date)}</td><td><b>${esc(o.clientName)}</b></td><td>${esc(o.tag||'')}</td><td><span class="badge ${o.status==='convertido'?'goodBadge':o.status==='revisado'?'warnBadge':''}">${esc(o.status||'')}</span></td><td class="num">${lines.length}</td><td class="num">${av.length}</td><td class="num">${missing.length}</td><td class="num"><b>${fmtMoney(subtotal)}</b></td><td><button class="ghostBtn tiny" data-load-order="${o.id}">Abrir</button> <button class="primaryBtn tiny" data-order-list-action="invoice" data-order-id="${o.id}">Factura</button> <button class="ghostBtn tiny" data-order-list-action="purchase" data-order-id="${o.id}">Compra</button> <button class="successBtn tiny" data-order-list-action="both" data-order-id="${o.id}">Ambas</button> <button class="ghostBtn tiny" data-order-list-action="shop" data-order-id="${o.id}">Tienda</button> <button class="ghostBtn tiny" data-duplicate-order="${o.id}">Duplicar</button> <button class="dangerBtn tiny" data-delete-order="${o.id}">Eliminar</button></td></tr>`}).join('')}</tbody></table></div>`;
  }
  document.addEventListener('click', e=>{
    const load=e.target.closest('[data-load-order]');
    if(load){ const o=state.orders.find(x=>x.id===load.dataset.loadOrder); if(o){ orderDraft=structuredClone(o); saveDrafts(); renderPage('orders'); } }
    const action=e.target.closest('[data-order-list-action]');
    if(action){ loadOrderAction(action.dataset.orderId, action.dataset.orderListAction); }
    const dup=e.target.closest('[data-duplicate-order]');
    if(dup){ duplicateOrder(dup.dataset.duplicateOrder); }
    const del=e.target.closest('[data-delete-order]');
    if(del){ deleteOrder(del.dataset.deleteOrder); }
  });

  function renderPurchases(){
    $('#view').innerHTML = `<div class="card"><div class="cardTitle"><div><h2>Nueva compra proveedor</h2><p>Sugerencias igual que facturas, escritura libre y precios de compra actualizables.</p></div><button class="ghostBtn small" id="clearPurchaseBtn">Nueva limpia</button></div>
      <div class="row">
        <div class="field col3"><label>Proveedor</label><select id="purSupplier"><option value="">Seleccionar proveedor</option>${state.suppliers.map(s=>`<option value="${s.id}" ${purchaseDraft.supplierId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field col2"><label>Fecha</label><input id="purDate" type="date" value="${esc(purchaseDraft.date)}" /></div>
        <div class="field col3"><label>Nº factura proveedor</label><input id="purNo" value="${esc(purchaseDraft.invoiceNo)}" placeholder="Opcional" /></div>
        <div class="field col2"><label>Actualizar costes</label><select id="purUpdateCosts"><option value="true">Sí</option><option value="false">No</option></select></div>
        <div class="field col2"><label>Adjunto</label><input id="purFile" type="file" accept="image/*,.pdf" /></div>
      </div>
      <div class="sep"></div>
      <div class="toolbar"><button class="ghostBtn small" id="addPurLine">+ Línea</button><button class="ghostBtn small" id="addPur5">+ 5 líneas</button><button class="ghostBtn small" id="pastePurList">Pegar lista</button><button class="primaryBtn small" id="savePurchaseBtn">Guardar compra</button></div>
      <div class="chips" id="purchaseFrequent" style="margin-bottom:12px"></div>
      <div class="tableWrap"><table class="lineTable" id="purchaseLineTable"><thead>${lineHead()}</thead><tbody></tbody></table></div>
      <div style="margin-top:16px" id="purchaseSummary"></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="cardTitle"><h2>Compras guardadas</h2></div>${purchaseListTable()}</div>`;
    $('#purUpdateCosts').value = String(!!purchaseDraft.updateCosts);
    renderLineRows('purchaseLineTable', purchaseDraft.lines, 'purchase');
    bindPurchaseForm(); updatePurchaseFrequent(); updatePurchaseSummary();
  }
  function bindPurchaseForm(){
    $('#purSupplier').onchange=e=>{ const s=getSupplier(e.target.value); purchaseDraft.supplierId=s?.id||''; purchaseDraft.supplierName=s?.name||''; scheduleDraftSave(); };
    $('#purDate').onchange=e=>{ purchaseDraft.date=e.target.value; scheduleDraftSave(); };
    $('#purNo').oninput=e=>{ purchaseDraft.invoiceNo=e.target.value; scheduleDraftSave(); };
    $('#purUpdateCosts').onchange=e=>{ purchaseDraft.updateCosts=e.target.value==='true'; scheduleDraftSave(); };
    $('#addPurLine').onclick=()=>{ purchaseDraft.lines.push(...emptyLines(1,'purchase')); renderPurchases(); };
    $('#addPur5').onclick=()=>{ purchaseDraft.lines.push(...emptyLines(5,'purchase')); renderPurchases(); };
    $('#pastePurList').onclick=()=>pasteLinesModal('purchase');
    $('#clearPurchaseBtn').onclick=()=>confirmModal('Nueva compra limpia','<p>Se borrará el borrador actual.</p>',()=>{purchaseDraft=newPurchaseDraft(); saveDrafts(); renderPurchases();},'Limpiar');
    $('#savePurchaseBtn').onclick=()=>savePurchase();
  }
  function updatePurchaseFrequent(){
    const names = [...new Set(state.products.slice(0,18).map(p=>p.name))];
    $('#purchaseFrequent').innerHTML = names.map(n=>`<button class="chip" data-add-purchase-product="${esc(n)}">${esc(n)}</button>`).join('');
    $$('[data-add-purchase-product]').forEach(b=>b.onclick=()=>{ const line=purchaseDraft.lines.find(l=>!l.productName)||(purchaseDraft.lines.push(...emptyLines(1,'purchase')),purchaseDraft.lines[purchaseDraft.lines.length-1]); line.productName=b.dataset.addPurchaseProduct; const p=findProductByName(line.productName); if(p) applyProductToLine(line,p,'purchase'); renderPurchases(); });
  }
  function updatePurchaseSummary(){
    const t = purchaseTotals(purchaseDraft);
    const root=$('#purchaseSummary'); if(!root)return;
    root.innerHTML = `<div class="totalPanel"><div class="summaryBox"><div class="summaryLine"><span>Subtotal compra</span><strong>${fmtMoney(t.subtotal)}</strong></div>${t.vatGroups.map(g=>`<div class="summaryLine"><span>IVA ${g.vat}% sobre ${fmtMoney(g.base)}</span><strong>${fmtMoney(g.tax)}</strong></div>`).join('')}</div><div class="totalBox"><span>Total compra</span><strong>${fmtMoney(t.total)}</strong><small>${t.lines.length} líneas</small></div></div>`;
  }
  function savePurchase(){
    const t = purchaseTotals(purchaseDraft); if(!t.lines.length){toast('Añade productos de compra');return;}
    const pur=structuredClone(purchaseDraft); pur.id=uid('pur'); pur.routeId=route()?.id; pur.createdAt=nowStamp();
    state.purchases.unshift(pur);
    if(pur.updateCosts){
      t.lines.forEach(line=>{ let p=findProductByName(line.productName); if(!p) p=createOrUpdateProductFromLine(line,false); p.buyPrice=toNumber(line.price); p.mode=line.mode; p.kgBox=toNumber(line.kgBox)||p.kgBox; p.vat=toNumber(line.vat)||p.vat; p.supplier=pur.supplierName||p.supplier; });
    }
    logChange(`Compra guardada ${pur.supplierName||''} · ${fmtMoney(t.total)}`);
    purchaseDraft=newPurchaseDraft(); saveState('Compra guardada'); renderPurchases(); toast('Compra guardada');
  }
  function purchaseListTable(){
    if(!state.purchases.length)return'<div class="empty">No hay compras guardadas.</div>';
    return `<div class="tableWrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Nº</th><th class="num">Total</th><th>Líneas</th></tr></thead><tbody>${state.purchases.map(p=>{const t=purchaseTotals(p);return`<tr><td>${esc(p.date)}</td><td>${esc(p.supplierName)}</td><td>${esc(p.invoiceNo||'')}</td><td class="num"><b>${fmtMoney(t.total)}</b></td><td>${t.lines.length}</td></tr>`}).join('')}</tbody></table></div>`;
  }

  function renderProducts(){
    $('#view').innerHTML = `<div class="card"><div class="cardTitle"><div><h2>Productos</h2><p>Códigos cortos, precios por defecto, IVA, caja x kg y sinónimos.</p></div><button class="primaryBtn small" id="newProductBtn">+ Producto</button></div><div class="toolbar"><input id="productSearch" class="input" placeholder="Buscar por código, producto, alias o proveedor..." /></div><div id="productsTable"></div></div>`;
    $('#newProductBtn').onclick=()=>productModal();
    $('#productSearch').oninput=()=>renderProductsTable($('#productSearch').value);
    renderProductsTable('');
  }
  function renderProductsTable(q){
    const n=normalize(q); const list=state.products.filter(p=>!n||normalize(`${p.code||''} ${p.name} ${p.aliases} ${p.supplier}`).includes(n));
    $('#productsTable').innerHTML = `<div class="tableWrap"><table><thead><tr><th>Código</th><th>Producto</th><th>Modo</th><th class="num">Kg/caja</th><th class="num">Compra</th><th class="num">Venta</th><th class="num">Recomendado</th><th>IVA</th><th>Proveedor</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td><b class="mono">${esc(p.code||'')}</b></td><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.aliases||'')}</span></td><td>${esc(p.mode)}</td><td class="num">${fmtNum(p.kgBox)}</td><td class="num">${fmtMoney(p.buyPrice||0)}</td><td class="num">${fmtMoney(p.sellPrice||0)}</td><td class="num"><b>${fmtMoney(recommendedPriceForProduct(p)||0)}</b></td><td>${p.vat}%</td><td>${esc(p.supplier||'')}</td><td><button class="ghostBtn tiny" data-edit-product="${p.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`;
    $$('[data-edit-product]').forEach(b=>b.onclick=()=>productModal(state.products.find(p=>p.id===b.dataset.editProduct)));
  }
  function productModal(p=null){
    const isNew=!p; p=p||{id:uid('prod'),code:'',name:'',aliases:'',mode:'kg',unit:'kg',kgBox:0,buyPrice:0,sellPrice:0,vat:4,supplier:'',minMargin:15,active:true};
    $('#modalRoot').innerHTML=`<div class="modalBackdrop"><div class="modal"><div class="modalHead"><h3>${isNew?'Nuevo producto':'Editar producto'}</h3><button class="iconBtn" data-modal-close>×</button></div><div class="row">
      <div class="field col2"><label>Código</label><input id="pCode" value="${esc(p.code||'')}" placeholder="MV" /></div>
      <div class="field col5"><label>Nombre</label><input id="pName" value="${esc(p.name)}" /></div>
      <div class="field col5"><label>Sinónimos</label><input id="pAliases" value="${esc(p.aliases||'')}" /></div>
      <div class="field col3"><label>Modo</label><select id="pMode">${modeOptions(p.mode)}</select></div>
      <div class="field col3"><label>Unidad</label><input id="pUnit" value="${esc(p.unit||'kg')}" /></div>
      <div class="field col3"><label>Kg/caja</label><input id="pKgBox" inputmode="decimal" value="${esc(p.kgBox)}" /></div>
      <div class="field col3"><label>IVA</label><select id="pVat">${vatOptions(String(p.vat))}</select></div>
      <div class="field col3"><label>Precio compra</label><input id="pBuy" inputmode="decimal" value="${esc(String(p.buyPrice).replace('.',','))}" /></div>
      <div class="field col3"><label>Precio venta</label><input id="pSell" inputmode="decimal" value="${esc(String(p.sellPrice).replace('.',','))}" /></div>
      <div class="field col3"><label>Margen mínimo %</label><input id="pMin" inputmode="decimal" value="${esc(p.minMargin)}" /></div>
      <div class="field col3"><label>Proveedor</label><input id="pSupplier" value="${esc(p.supplier||'')}" /></div>
    </div><div class="toolbar right" style="margin-top:16px"><button class="ghostBtn" data-modal-close>Cancelar</button><button class="primaryBtn" id="saveProductModal">Guardar</button></div></div></div>`;
    $$('[data-modal-close]').forEach(b=>b.onclick=()=>$('#modalRoot').innerHTML='');
    $('#saveProductModal').onclick=()=>{ const rawCode = $('#pCode').value.trim().toUpperCase() || DEFAULT_CODE_MAP[$('#pName').value.trim().toUpperCase()] || autoCodeFromName($('#pName').value); const code = uniqueProductCode(rawCode, p.id); Object.assign(p,{code,name:$('#pName').value.trim().toUpperCase(),aliases:$('#pAliases').value,mode:$('#pMode').value,unit:$('#pUnit').value,kgBox:toNumber($('#pKgBox').value),vat:toNumber($('#pVat').value),buyPrice:toNumber($('#pBuy').value),sellPrice:toNumber($('#pSell').value),minMargin:toNumber($('#pMin').value),supplier:$('#pSupplier').value,active:true}); if(isNew)state.products.push(p); logChange(`Producto ${isNew?'creado':'editado'}: ${p.name}`); saveState('Producto guardado'); $('#modalRoot').innerHTML=''; renderProducts(); };
  }

  function clientHistoryStats(clientId){
    const invoices = state.invoices.filter(i => i.clientId === clientId || (!i.clientId && normalize(i.clientName) === normalize(getClient(clientId)?.name)));
    const rows = invoices.map(inv => ({inv, totals:invoiceTotals(inv)})).sort((a,b)=>String(b.inv.date||'').localeCompare(String(a.inv.date||'')));
    const total = round2(rows.reduce((sum,x)=>sum+x.totals.total,0));
    const paid = round2(rows.reduce((sum,x)=>sum+Math.min(x.totals.total,toNumber(x.inv.paid)),0));
    const pending = round2(rows.reduce((sum,x)=>sum+x.totals.pending,0));
    const profit = round2(rows.reduce((sum,x)=>sum+x.totals.profit,0));
    return {rows,total,paid,pending,profit,count:rows.length};
  }
  function renderClients(){
    const q = normalize(state.uiClientSearch || '');
    const clients = state.clients.filter(c => !q || normalize(`${c.name} ${c.nif||''} ${c.phone||''} ${c.address||''}`).includes(q));
    const aggregate = state.clients.map(c=>clientHistoryStats(c.id)).reduce((a,x)=>({total:a.total+x.total,paid:a.paid+x.paid,pending:a.pending+x.pending}),{total:0,paid:0,pending:0});
    $('#view').innerHTML=`<div class="grid cols3"><div class="kpi"><span>Total histórico facturado</span><strong>${fmtMoney(aggregate.total)}</strong></div><div class="kpi good"><span>Total histórico cobrado</span><strong>${fmtMoney(aggregate.paid)}</strong></div><div class="kpi ${aggregate.pending?'warn':''}"><span>Total pendiente</span><strong>${fmtMoney(aggregate.pending)}</strong></div></div>
    <div class="card" style="margin-top:16px"><div class="cardTitle"><div><h2>Clientes e historial</h2><p>Todas las facturas permanecen guardadas aunque cierres o limpies una semana.</p></div><button class="primaryBtn small" id="newClientBtn">+ Cliente</button></div>
    <div class="toolbar"><input class="input" id="clientHistorySearch" placeholder="Buscar por nombre, NIF, teléfono o dirección" value="${esc(state.uiClientSearch||'')}"></div>
    <div class="tableWrap"><table><thead><tr><th>Cliente</th><th class="num">Facturas</th><th class="num">Facturado</th><th class="num">Cobrado</th><th class="num">Pendiente</th><th></th></tr></thead><tbody>${clients.map(c=>{const h=clientHistoryStats(c.id);return`<tr><td><b>${esc(c.name)}</b><br><span class="muted">${esc(c.nif||'Sin NIF')} · ${esc(c.phone||'Sin teléfono')}</span></td><td class="num">${h.count}</td><td class="num">${fmtMoney(h.total)}</td><td class="num profitText">${fmtMoney(h.paid)}</td><td class="num ${h.pending?'lossText':''}">${fmtMoney(h.pending)}</td><td><button class="primaryBtn tiny" data-history-client="${c.id}">Historial</button> <button class="ghostBtn tiny" data-edit-client="${c.id}">Editar</button></td></tr>`}).join('')}</tbody></table></div></div>`;
    $('#newClientBtn').onclick=()=>clientModal();
    $('#clientHistorySearch').oninput=e=>{state.uiClientSearch=e.target.value;renderClients();};
    $$('[data-edit-client]').forEach(b=>b.onclick=()=>clientModal(getClient(b.dataset.editClient)));
    $$('[data-history-client]').forEach(b=>b.onclick=()=>renderClientHistory(b.dataset.historyClient));
  }
  function renderClientHistory(clientId){
    const c=getClient(clientId); if(!c){renderClients();return;}
    const h=clientHistoryStats(clientId);
    $('#pageTitle').textContent=c.name; $('#pageSubtitle').textContent='Historial completo de facturación y cobros';
    $('#view').innerHTML=`<div class="toolbar"><button class="ghostBtn" id="backClients">← Clientes</button><button class="primaryBtn" id="newClientInvoice">+ Nueva factura</button></div>
    <div class="grid cols4"><div class="kpi"><span>Facturas</span><strong>${h.count}</strong></div><div class="kpi"><span>Total facturado</span><strong>${fmtMoney(h.total)}</strong></div><div class="kpi good"><span>Total cobrado</span><strong>${fmtMoney(h.paid)}</strong></div><div class="kpi ${h.pending?'warn':''}"><span>Pendiente</span><strong>${fmtMoney(h.pending)}</strong></div></div>
    <div class="card" style="margin-top:16px"><div class="cardTitle"><div><h2>${esc(c.name)}</h2><p>${esc(c.nif||'Sin NIF')} · ${esc(c.address||'Sin dirección')} · ${esc(c.phone||'Sin teléfono')}</p></div><button class="ghostBtn small" id="editHistoryClient">Editar ficha</button></div>
    ${h.rows.length?`<div class="tableWrap"><table><thead><tr><th>Fecha</th><th>Factura</th><th>Ruta</th><th>Estado</th><th class="num">Total</th><th class="num">Cobrado</th><th class="num">Pendiente</th><th></th></tr></thead><tbody>${h.rows.map(x=>{const r=state.routes.find(z=>z.id===x.inv.routeId);return`<tr><td>${esc(x.inv.date)}</td><td><b>${esc(x.inv.no)}</b></td><td>${esc(r?.name||'Histórica')}</td><td><span class="badge ${x.totals.pending?'warn':'good'}">${x.totals.pending?(toNumber(x.inv.paid)>0?'PARCIAL':'PENDIENTE'):'COBRADA'}</span></td><td class="num">${fmtMoney(x.totals.total)}</td><td class="num profitText">${fmtMoney(Math.min(x.totals.total,toNumber(x.inv.paid)))}</td><td class="num ${x.totals.pending?'lossText':''}">${fmtMoney(x.totals.pending)}</td><td><button class="ghostBtn tiny" data-open-history-inv="${x.inv.id}">Abrir</button>${x.totals.pending?` <button class="successBtn tiny" data-history-pay="${x.inv.id}">Cobrar</button>`:''}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">Este cliente todavía no tiene facturas.</div>'}</div>`;
    $('#backClients').onclick=()=>renderPage('clients');
    $('#editHistoryClient').onclick=()=>clientModal(c);
    $('#newClientInvoice').onclick=()=>{invoiceDraft=newInvoiceDraft();invoiceDraft.clientId=c.id;invoiceDraft.clientName=c.name;applyClientDefaults(c);renderPage('invoices');};
    $$('[data-history-pay]').forEach(b=>b.onclick=()=>payInvoiceModal(b.dataset.historyPay));
    $$('[data-open-history-inv]').forEach(b=>b.onclick=()=>{const inv=state.invoices.find(i=>i.id===b.dataset.openHistoryInv);if(inv){openInvoice(inv.id);}});
  }

  function renderSuppliers(){
    $('#view').innerHTML=`<div class="card"><div class="cardTitle"><div><h2>Proveedores</h2><p>Historial de compras y precios por proveedor.</p></div><button class="primaryBtn small" id="newSupplierBtn">+ Proveedor</button></div><div class="tableWrap"><table><thead><tr><th>Proveedor</th><th>Teléfono</th><th class="num">Compras</th><th class="num">Total</th><th></th></tr></thead><tbody>${state.suppliers.map(s=>{const ps=state.purchases.filter(p=>p.supplierId===s.id);const total=ps.reduce((a,p)=>a+purchaseTotals(p).total,0);return`<tr><td><b>${esc(s.name)}</b><br><span class="muted">${esc(s.notes||'')}</span></td><td>${esc(s.phone||'')}</td><td class="num">${ps.length}</td><td class="num">${fmtMoney(total)}</td><td><button class="ghostBtn tiny" data-edit-sup="${s.id}">Editar</button></td></tr>`}).join('')}</tbody></table></div></div>`;
    $('#newSupplierBtn').onclick=()=>supplierModal(); $$('[data-edit-sup]').forEach(b=>b.onclick=()=>supplierModal(getSupplier(b.dataset.editSup)));
  }
  function supplierModal(s=null){ const isNew=!s; s=s||{id:uid('sup'),name:'',phone:'',notes:''}; $('#modalRoot').innerHTML=`<div class="modalBackdrop"><div class="modal"><div class="modalHead"><h3>${isNew?'Nuevo proveedor':'Editar proveedor'}</h3><button class="iconBtn" data-modal-close>×</button></div><div class="row"><div class="field col6"><label>Nombre</label><input id="sName" value="${esc(s.name)}"></div><div class="field col6"><label>Teléfono</label><input id="sPhone" value="${esc(s.phone)}"></div><div class="field col12"><label>Notas</label><input id="sNotes" value="${esc(s.notes)}"></div></div><div class="toolbar right" style="margin-top:16px"><button class="ghostBtn" data-modal-close>Cancelar</button><button class="primaryBtn" id="saveSup">Guardar</button></div></div></div>`; $$('[data-modal-close]').forEach(b=>b.onclick=()=>$('#modalRoot').innerHTML=''); $('#saveSup').onclick=()=>{s.name=$('#sName').value;s.phone=$('#sPhone').value;s.notes=$('#sNotes').value;if(isNew)state.suppliers.push(s);saveState('Proveedor');$('#modalRoot').innerHTML='';renderSuppliers();}; }

  function renderShops(){
    $('#view').innerHTML=`<div class="card"><div class="cardTitle"><div><h2>Tiendas propias</h2><p>Reparto interno separado de clientes externos.</p></div></div><div class="row"><div class="field col4"><label>Tienda</label><select id="trShop"><option value="">Seleccionar tienda</option>${state.shops.map(s=>`<option value="${s.id}" ${transferDraft.shopId===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="field col3"><label>Fecha</label><input id="trDate" type="date" value="${esc(transferDraft.date)}"></div><div class="field col5"><label>Notas</label><input id="trNotes" value="${esc(transferDraft.notes)}"></div></div><div class="sep"></div><div class="toolbar"><button class="ghostBtn small" id="addTrLine">+ Línea</button><button class="ghostBtn small" id="addTr5">+ 5 líneas</button><button class="primaryBtn small" id="saveTransferBtn">Guardar reparto</button></div><div class="tableWrap"><table class="lineTable" id="transferLineTable"><thead>${lineHead()}</thead><tbody></tbody></table></div><div style="margin-top:16px" id="transferSummary"></div></div><div class="card" style="margin-top:16px"><div class="cardTitle"><h2>Repartos guardados</h2></div>${transferListTable()}</div>`;
    renderLineRows('transferLineTable', transferDraft.lines, 'transfer'); bindTransferForm(); updateTransferSummary();
  }
  function bindTransferForm(){ $('#trShop').onchange=e=>{const s=getShop(e.target.value); transferDraft.shopId=s?.id||''; transferDraft.shopName=s?.name||''; scheduleDraftSave();}; $('#trDate').onchange=e=>{transferDraft.date=e.target.value;scheduleDraftSave();}; $('#trNotes').oninput=e=>{transferDraft.notes=e.target.value;scheduleDraftSave();}; $('#addTrLine').onclick=()=>{transferDraft.lines.push(...emptyLines(1,'transfer'));renderShops();}; $('#addTr5').onclick=()=>{transferDraft.lines.push(...emptyLines(5,'transfer'));renderShops();}; $('#saveTransferBtn').onclick=()=>saveTransfer(); }
  function updateTransferSummary(){const t=transferTotals(transferDraft); const root=$('#transferSummary'); if(!root)return; root.innerHTML=summaryBlock([['Valor estimado',t.value],['Coste interno',-t.cost]],'Margen estimado tienda',t.profit);}
  function saveTransfer(){const t=transferTotals(transferDraft); if(!transferDraft.shopId){toast('Selecciona tienda');return;} if(!t.lines.length){toast('Añade productos');return;} const tr=structuredClone(transferDraft); tr.id=uid('tr'); tr.routeId=route()?.id; tr.createdAt=nowStamp(); state.transfers.unshift(tr); logChange(`Reparto tienda ${tr.shopName} · ${fmtMoney(t.value)}`); transferDraft=newTransferDraft(); saveState('Reparto guardado'); renderShops();}
  function transferListTable(){ if(!state.transfers.length)return'<div class="empty">No hay repartos guardados.</div>'; return `<div class="tableWrap"><table><thead><tr><th>Fecha</th><th>Tienda</th><th class="num">Valor</th><th class="num">Coste</th><th class="num">Margen</th></tr></thead><tbody>${state.transfers.map(t=>{const x=transferTotals(t);return`<tr><td>${esc(t.date)}</td><td>${esc(t.shopName)}</td><td class="num">${fmtMoney(x.value)}</td><td class="num">${fmtMoney(x.cost)}</td><td class="num ${x.profit<0?'lossText':'profitText'}">${fmtMoney(x.profit)}</td></tr>`}).join('')}</tbody></table></div>`; }

  function renderExpenses(){
    $('#view').innerHTML=`<div class="card"><div class="cardTitle"><div><h2>Gastos de ruta</h2><p>Furgoneta, gasolina, peajes, dietas y otros.</p></div><button class="primaryBtn small" id="addExpenseBtn">+ Gasto</button></div>${expensesTable()}</div>`;
    $('#addExpenseBtn').onclick=()=>expenseModal(); $$('[data-del-exp]').forEach(b=>b.onclick=()=>{state.expenses=state.expenses.filter(e=>e.id!==b.dataset.delExp);saveState('Gasto eliminado');renderExpenses();});
  }
  function expensesTable(){ if(!state.expenses.length)return'<div class="empty">Sin gastos guardados.</div>'; return `<div class="tableWrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Nota</th><th class="num">Importe</th><th></th></tr></thead><tbody>${state.expenses.map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.type)}</td><td>${esc(e.note||'')}</td><td class="num"><b>${fmtMoney(e.amount)}</b></td><td><button class="dangerBtn tiny" data-del-exp="${e.id}">×</button></td></tr>`).join('')}</tbody></table></div>`; }
  function expenseModal(){ $('#modalRoot').innerHTML=`<div class="modalBackdrop"><div class="modal"><div class="modalHead"><h3>Nuevo gasto</h3><button class="iconBtn" data-modal-close>×</button></div><div class="row"><div class="field col4"><label>Fecha</label><input id="eDate" type="date" value="${todayISO()}"></div><div class="field col4"><label>Tipo</label><select id="eType"><option>Furgoneta</option><option>Gasolina</option><option>Peaje</option><option>Parking</option><option>Dieta</option><option>Otro</option></select></div><div class="field col4"><label>Importe</label><input id="eAmount" inputmode="decimal"></div><div class="field col12"><label>Nota</label><input id="eNote"></div></div><div class="toolbar right" style="margin-top:16px"><button class="ghostBtn" data-modal-close>Cancelar</button><button class="primaryBtn" id="saveExp">Guardar</button></div></div></div>`; $$('[data-modal-close]').forEach(b=>b.onclick=()=>$('#modalRoot').innerHTML=''); $('#saveExp').onclick=()=>{state.expenses.unshift({id:uid('exp'),routeId:route()?.id,date:$('#eDate').value,type:$('#eType').value,amount:toNumber($('#eAmount').value),note:$('#eNote').value,createdAt:nowStamp()}); logChange(`Gasto guardado: ${$('#eType').value} ${fmtMoney(toNumber($('#eAmount').value))}`); saveState('Gasto guardado'); $('#modalRoot').innerHTML=''; renderExpenses();}; }

  function renderPayments(){
    const pending = state.invoices.map(i=>({i,t:invoiceTotals(i)})).filter(x=>x.t.pending>0);
    $('#view').innerHTML=`<div class="card"><div class="cardTitle"><div><h2>Cobros y pendientes</h2><p>Control de facturas pendientes, parciales y cobradas.</p></div></div>${pending.length?`<div class="tableWrap"><table><thead><tr><th>Cliente</th><th>Factura</th><th>Fecha</th><th class="num">Total</th><th class="num">Pendiente</th><th></th></tr></thead><tbody>${pending.map(x=>`<tr><td>${esc(x.i.clientName)}</td><td>${esc(x.i.no)}</td><td>${esc(x.i.date)}</td><td class="num">${fmtMoney(x.t.total)}</td><td class="num"><b>${fmtMoney(x.t.pending)}</b></td><td><button class="successBtn tiny" data-pay-inv="${x.i.id}">Cobrar</button><button class="ghostBtn tiny" data-wa-remind="${x.i.id}">WhatsApp</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No hay pendientes.</div>'}</div>`;
    $$('[data-pay-inv]').forEach(b=>b.onclick=()=>payInvoiceModal(b.dataset.payInv));
    $$('[data-wa-remind]').forEach(b=>b.onclick=()=>whatsappReminder(b.dataset.waRemind));
  }
  function payInvoiceModal(id){ const inv=state.invoices.find(i=>i.id===id); if(!inv)return; const t=invoiceTotals(inv); $('#modalRoot').innerHTML=`<div class="modalBackdrop"><div class="modal"><div class="modalHead"><h3>Cobrar factura</h3><button class="iconBtn" data-modal-close>×</button></div><p>${esc(inv.clientName)} · ${esc(inv.no)} · pendiente ${fmtMoney(t.pending)}</p><div class="row"><div class="field col6"><label>Importe cobrado</label><input id="payAmount" inputmode="decimal" value="${fmtNum(t.pending)}"></div><div class="field col6"><label>Método</label><select id="payMethod"><option>efectivo</option><option>tarjeta</option><option>transferencia</option><option>bizum</option><option>mixto</option></select></div></div><div class="toolbar right" style="margin-top:16px"><button class="ghostBtn" data-modal-close>Cancelar</button><button class="primaryBtn" id="savePay">Guardar cobro</button></div></div></div>`; $$('[data-modal-close]').forEach(b=>b.onclick=()=>$('#modalRoot').innerHTML=''); $('#savePay').onclick=()=>{const amt=toNumber($('#payAmount').value); inv.paid=round2(toNumber(inv.paid)+amt); inv.status=invoiceTotals(inv).pending<=0?'cobrada':'parcial'; state.payments.unshift({id:uid('pay'),invoiceId:inv.id,date:todayISO(),amount:amt,method:$('#payMethod').value}); logChange(`Cobro ${fmtMoney(amt)} · ${inv.clientName}`); saveState('Cobro guardado'); $('#modalRoot').innerHTML=''; renderPayments();}; }
  function whatsappReminder(id){ const inv=state.invoices.find(i=>i.id===id); if(!inv)return; const t=invoiceTotals(inv); const msg=`Hola ${inv.clientName}, te recuerdo la factura ${inv.no} del ${inv.date}. Pendiente: ${fmtMoney(t.pending)}. Gracias.`; window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank'); }

  function renderInternalGate(){ promptPin(renderInternal); }
  function renderInternal(){
    const m=dashboardMetrics(); const byProd=profitByProduct(); const byClient=profitByClient();
    $('#view').innerHTML=`<div class="grid cols4"><div class="kpi good"><span>Beneficio interno</span><strong>${fmtMoney(m.internalProfit)}</strong></div><div class="kpi"><span>Beneficio caja</span><strong>${fmtMoney(m.cashProfit)}</strong></div><div class="kpi"><span>Valor stock</span><strong>${fmtMoney(stockTotals().value)}</strong></div><div class="kpi"><span>Gastos</span><strong>${fmtMoney(m.expenses)}</strong></div></div>
    <div class="grid cols2" style="margin-top:16px"><div class="card"><div class="cardTitle"><h2>Beneficio por producto</h2></div>${profitProductTable(byProd)}</div><div class="card"><div class="cardTitle"><h2>Beneficio por cliente</h2></div>${profitClientTable(byClient)}</div></div>
    <div class="card" style="margin-top:16px"><div class="cardTitle"><h2>Alertas internas</h2></div><div class="alertList">${buildAlerts().map(a=>`<div class="alertItem ${a.type}"><strong>${esc(a.title)}</strong><br><span>${esc(a.text)}</span></div>`).join('')||'<div class="empty">Sin alertas.</div>'}</div></div>`;
  }
  function profitByProduct(){
    const map={};
    state.invoices.forEach(inv=>invoiceTotals(inv).lineCalcs.forEach(x=>{const key=x.line.productName||'SIN PRODUCTO'; if(!map[key])map[key]={code:productCodeFor(x.line)||'',product:key,qty:0,base:0,cost:0,profit:0}; map[key].qty+=x.calc.neto; map[key].base+=x.calc.base; map[key].cost+=x.calc.cost; map[key].profit+=x.calc.profit;}));
    state.transfers.forEach(tr=>transferTotals(tr).calcs.forEach(x=>{const key=x.line.productName||'SIN PRODUCTO'; if(!map[key])map[key]={code:productCodeFor(x.line)||'',product:key,qty:0,base:0,cost:0,profit:0}; map[key].qty+=x.calc.neto; map[key].base+=x.calc.base; map[key].cost+=x.calc.cost; map[key].profit+=x.calc.profit;}));
    return Object.values(map).map(r=>({...r,base:round2(r.base),cost:round2(r.cost),profit:round2(r.profit),margin:r.base?round2(r.profit/r.base*100):0})).sort((a,b)=>b.profit-a.profit);
  }
  function profitByClient(){
    return state.invoices.map(inv=>{const t=invoiceTotals(inv);return{client:inv.clientName, invoice:inv.no, base:t.subtotalAfterDiscount+t.transportBase, cost:t.cost, commission:t.commission, profit:t.profit, margin:(t.subtotalAfterDiscount+t.transportBase)?round2(t.profit/(t.subtotalAfterDiscount+t.transportBase)*100):0}}).sort((a,b)=>b.profit-a.profit);
  }
  function profitProductTable(rows){ if(!rows.length)return'<div class="empty">Sin datos.</div>'; return `<div class="tableWrap"><table><thead><tr><th>Código</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Venta base</th><th class="num">Coste</th><th class="num">Beneficio</th><th class="num">Margen</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.profit<0?'lossRow':''}"><td><b class="mono">${esc(r.code||'')}</b></td><td><b>${esc(r.product)}</b></td><td class="num">${fmtNum(r.qty)}</td><td class="num">${fmtMoney(r.base)}</td><td class="num">${fmtMoney(r.cost)}</td><td class="num ${r.profit<0?'lossText':'profitText'}">${fmtMoney(r.profit)}</td><td class="num">${fmtNum(r.margin,2)}%</td></tr>`).join('')}</tbody></table></div>`; }
  function profitClientTable(rows){ if(!rows.length)return'<div class="empty">Sin datos.</div>'; return `<div class="tableWrap"><table><thead><tr><th>Cliente</th><th class="num">Venta base</th><th class="num">Coste</th><th class="num">Comisión</th><th class="num">Beneficio</th><th class="num">Margen</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.profit<0?'lossRow':''}"><td><b>${esc(r.client)}</b><br><span class="muted">${esc(r.invoice)}</span></td><td class="num">${fmtMoney(r.base)}</td><td class="num">${fmtMoney(r.cost)}</td><td class="num">${fmtMoney(r.commission)}</td><td class="num ${r.profit<0?'lossText':'profitText'}">${fmtMoney(r.profit)}</td><td class="num">${fmtNum(r.margin,2)}%</td></tr>`).join('')}</tbody></table></div>`; }

  function renderRoute(){
    const m=dashboardMetrics();
    $('#view').innerHTML=`<div class="card"><div class="cardTitle"><div><h2>Ruta de hoy</h2><p>Cierre profesional con revisión automática.</p></div><button class="primaryBtn small" id="closeRouteBtn">Cerrar ruta</button></div><div class="row"><div class="field col4"><label>Ruta activa</label><select id="activeRoute">${state.routes.map(r=>`<option value="${r.id}" ${state.activeRouteId===r.id?'selected':''}>${esc(r.date)} · ${esc(r.name)} · ${esc(r.status)}</option>`).join('')}</select></div><div class="field col3"><label>Nueva ruta fecha</label><input id="newRouteDate" type="date" value="${todayISO()}"></div><div class="field col3"><label>Nombre</label><input id="newRouteName" value="Ruta"></div><div class="field col2"><label>&nbsp;</label><button class="ghostBtn" id="newRouteBtn">Crear ruta</button></div></div><div class="sep"></div>${summaryBlock([['Ventas clientes',m.sales],['Compras proveedor',-m.purchases],['Tiendas propias margen',m.shopProfit],['Transporte cobrado',m.transport],['Comisiones internas',m.commissions],['Gastos ruta',-m.expenses]],'Beneficio interno',m.internalProfit)}<div class="sep"></div><div class="cardTitle"><h3>Revisión automática</h3></div><div class="alertList">${buildAlerts().map(a=>`<div class="alertItem ${a.type}"><strong>${esc(a.title)}</strong><br><span>${esc(a.text)}</span></div>`).join('')||'<div class="empty">Todo correcto.</div>'}</div></div>`;
    $('#activeRoute').onchange=e=>{state.activeRouteId=e.target.value;saveState('Ruta activa');renderRoute();};
    $('#newRouteBtn').onclick=()=>{const r={id:'route_'+$('#newRouteDate').value+'_'+uid(''),date:$('#newRouteDate').value,name:$('#newRouteName').value,status:'abierta',createdAt:nowStamp(),closedAt:''};state.routes.unshift(r);state.activeRouteId=r.id;saveState('Ruta creada');renderRoute();};
    $('#closeRouteBtn').onclick=()=>confirmModal('Cerrar semana y empezar limpia','<p>Se cerrará la ruta actual y se creará una nueva semana vacía. <b>No se borrarán clientes, productos, facturas, cobros, deudas ni historial.</b> Los documentos cerrados seguirán disponibles por cliente.</p>',()=>{const r=route();r.status='cerrada';r.closedAt=nowStamp();const d=new Date();d.setDate(d.getDate()+7);const nextDate=d.toISOString().slice(0,10);const nr={id:'route_'+nextDate+'_'+uid(''),date:nextDate,name:'Ruta Madrid '+nextDate,status:'abierta',createdAt:nowStamp(),closedAt:''};state.routes.unshift(nr);state.activeRouteId=nr.id;invoiceDraft=newInvoiceDraft();orderDraft=newOrderDraft();purchaseDraft=newPurchaseDraft();transferDraft=newTransferDraft();logChange(`Semana cerrada: ${r.date}. Nueva semana: ${nextDate}`);saveState('Nueva semana creada');exportInternalPDF();renderRoute();},'Cerrar y crear semana');
  }


  function stockKey(line){
    const p = line?.productId ? state.products.find(x=>x.id===line.productId) : findProductByName(line?.productName);
    return p?.id || normalize(line?.productName || 'manual');
  }
  function stockProduct(line){
    return (line?.productId ? state.products.find(x=>x.id===line.productId) : findProductByName(line?.productName)) || {id:stockKey(line), name:String(line?.productName||'PRODUCTO').toUpperCase(), mode:line?.mode||'kg', kgBox:toNumber(line?.kgBox), buyPrice:toNumber(line?.buyPrice)};
  }
  function ensureStockBucket(map,line){
    const p = stockProduct(line); const key = p.id || stockKey(line);
    if(!map[key]) map[key] = {key, product:p.name, productObj:p, mode:p.mode||line.mode||'kg', kgBox:toNumber(p.kgBox||line.kgBox), code:p.code||'', boughtQty:0, boughtCost:0, soldQty:0, soldCost:0, shopQty:0, shopCost:0, wasteQty:0, wasteCost:0, adjustQty:0, adjustCost:0};
    return map[key];
  }
  function stockTotals(){
    const rows = stockSummary();
    return {value: round2(rows.reduce((s,r)=>s+r.stockValue,0)), qty: round2(rows.reduce((s,r)=>s+Math.max(0,r.remainingQty),0)), items: rows.length};
  }
  function stockSummary(){
    const map = {};
    routeFiltered(state.purchases).forEach(pur=> activeLines(pur.lines).forEach(line=>{
      const b=ensureStockBucket(map,line); const calc=lineCalc(line,false); b.boughtQty += calc.neto; b.boughtCost += calc.base;
    }));
    routeFiltered(state.invoices).filter(i=>i.status!=='anulada').forEach(inv=> invoiceTotals(inv).lineCalcs.forEach(x=>{
      const b=ensureStockBucket(map,x.line); b.soldQty += x.calc.neto; b.soldCost += x.calc.cost;
    }));
    routeFiltered(state.transfers).forEach(tr=> transferTotals(tr).calcs.forEach(x=>{
      const b=ensureStockBucket(map,x.line); b.shopQty += x.calc.neto; b.shopCost += x.calc.cost;
    }));
    routeFiltered(state.wastes||[]).forEach(w=> wasteTotals(w).calcs.forEach(x=>{
      const b=ensureStockBucket(map,x.line); b.wasteQty += x.calc.neto; b.wasteCost += x.calc.cost;
    }));
    return Object.values(map).map(r=>{
      const avg = r.boughtQty ? r.boughtCost / r.boughtQty : toNumber(r.productObj?.buyPrice || 0);
      const remainingQty = round2(r.boughtQty - r.soldQty - r.shopQty - r.wasteQty + r.adjustQty);
      const stockValue = round2(Math.max(0, remainingQty) * avg);
      const boxes = r.kgBox ? remainingQty / r.kgBox : 0;
      return {...r, avgCost:round2(avg), remainingQty, stockValue, boxes:round2(boxes)};
    }).sort((a,b)=>b.stockValue-a.stockValue || a.product.localeCompare(b.product));
  }
  function wasteTotals(w){
    const lines = activeLines(w.lines || []);
    const calcs = lines.map(l=>({line:l, calc:lineCalc(l,false)}));
    const cost = round2(calcs.reduce((s,x)=>s+x.calc.cost,0));
    return {lines, calcs, cost};
  }
  function renderStock(){
    const rows=stockSummary(); const total=stockTotals();
    $('#view').innerHTML = `<div class="card"><div class="cardTitle"><div><h2>Stock / Almacén</h2><p>Sobrante después de compras, facturas, tiendas propias y mermas. Valor calculado a coste medio de compra.</p></div><div class="toolbar"><button class="ghostBtn small" id="stockRefreshBtn">Recalcular</button><button class="primaryBtn small" id="stockPdfBtn">PDF interno</button></div></div>
      <div class="grid cols3"><div class="kpi"><span>Valor en stock</span><strong>${fmtMoney(total.value)}</strong><small>Género sobrante</small></div><div class="kpi"><span>Productos con stock</span><strong>${rows.filter(r=>r.remainingQty>0).length}</strong><small>${rows.length} productos movidos</small></div><div class="kpi"><span>Ruta</span><strong>${esc(route()?.date||'')}</strong><small>${esc(route()?.name||'')}</small></div></div>
      <div class="sep"></div>
      <div class="card flat"><div class="cardTitle"><div><h3>Buscar historial por código</h3><p>Escribe MV, MM, CL, OK... para ver dónde se compró, a quién se vendió, tiendas, merma y stock.</p></div></div><div class="row"><div class="field col4"><label>Código o producto</label><input id="stockCodeSearch" class="input" placeholder="Ej. MV, CL, OKRA" /></div></div><div id="stockCodeResult" style="margin-top:12px"></div></div>
      <div class="sep"></div>
      <div class="tableWrap"><table class="compact"><thead><tr><th>Código</th><th>Producto</th><th class="num">Comprado</th><th class="num">Facturado</th><th class="num">Tiendas</th><th class="num">Merma</th><th class="num">Sobrante</th><th class="num">Coste medio</th><th class="num">Valor stock</th><th>Acciones</th></tr></thead><tbody>${rows.map(r=>`<tr class="${r.remainingQty<0?'lossRow':''}"><td><b class="mono">${esc(r.code||'')}</b></td><td><b>${esc(r.product)}</b><br><small class="muted">${r.kgBox?`≈ ${fmtNum(r.boxes,2)} cajas · ${fmtNum(r.kgBox)} kg/caja`:modeLabel(r.mode)}</small></td><td class="num">${fmtNum(r.boughtQty)}</td><td class="num">${fmtNum(r.soldQty)}</td><td class="num">${fmtNum(r.shopQty)}</td><td class="num">${fmtNum(r.wasteQty)}</td><td class="num"><b>${fmtNum(r.remainingQty)}</b></td><td class="num">${fmtMoney(r.avgCost)}</td><td class="num"><b>${fmtMoney(r.stockValue)}</b></td><td><button class="ghostBtn tiny" data-stock-shop="${esc(r.key)}">Tienda</button> <button class="dangerBtn tiny" data-stock-waste="${esc(r.key)}">Merma</button></td></tr>`).join('') || '<tr><td colspan="10" class="empty">No hay movimientos de stock en esta ruta.</td></tr>'}</tbody></table></div></div>`;
    $('#stockRefreshBtn').onclick=()=>renderStock(); $('#stockPdfBtn').onclick=()=>promptPin(exportInternalPDF); const codeInput=$('#stockCodeSearch'); if(codeInput){ codeInput.oninput=()=>renderStockCodeLookup(codeInput.value); renderStockCodeLookup(''); }
    $$('[data-stock-shop]').forEach(b=>b.onclick=()=>stockAssignModal(b.dataset.stockShop,'shop'));
    $$('[data-stock-waste]').forEach(b=>b.onclick=()=>stockAssignModal(b.dataset.stockWaste,'waste'));
  }
  function stockAssignModal(key, type){
    const row=stockSummary().find(r=>String(r.key)===String(key)); if(!row)return;
    const shopOptions=state.shops.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
    $('#modalRoot').innerHTML=`<div class="modalBackdrop"><div class="modal"><div class="modalHead"><h3>${type==='shop'?'Asignar a tienda propia':'Registrar merma'}</h3><button class="iconBtn" data-modal-close>×</button></div><p><b>${esc(row.product)}</b> · Sobrante: ${fmtNum(row.remainingQty)} ${row.kgBox?'kg':''} · Valor: ${fmtMoney(row.stockValue)}</p><div class="row">${type==='shop'?`<div class="field col6"><label>Tienda</label><select id="stockShop">${shopOptions}</select></div>`:''}<div class="field col3"><label>Cantidad</label><input id="stockQty" class="decimalInput" inputmode="decimal" placeholder="0"></div><div class="field col3"><label>Modo</label><select id="stockMode"><option value="kg">Kg/base</option><option value="cajas">Cajas</option><option value="ud">Ud/manojo</option></select></div><div class="field col12"><label>Motivo / notas</label><input id="stockNotes" placeholder="Ej. sobrante para San Pablo, producto pasado..."></div></div><div class="toolbar right" style="margin-top:16px"><button class="ghostBtn" data-modal-close>Cancelar</button><button class="primaryBtn" id="stockConfirmBtn">Guardar</button></div></div></div>`;
    $$('[data-modal-close]').forEach(b=>b.onclick=()=>$('#modalRoot').innerHTML='');
    $('#stockConfirmBtn').onclick=()=>{
      const qtyRaw=toNumber($('#stockQty').value); if(!qtyRaw){toast('Introduce cantidad');return;}
      const qtyBase=$('#stockMode').value==='cajas' && row.kgBox ? qtyRaw*row.kgBox : qtyRaw;
      const p=row.productObj; const line={id:uid('line'), productId:p.id||'', productName:row.product, mode:'kg', qty:String(qtyBase).replace('.',','), kgBox:'', bruto:'', tara:'', neto:String(qtyBase).replace('.',','), price:String(row.avgCost).replace('.',','), buyPrice:String(row.avgCost).replace('.',','), vat:String(p.vat||4), discount:'', note:$('#stockNotes').value};
      if(type==='shop'){
        const shop=getShop($('#stockShop').value); state.transfers.unshift({id:uid('trf'), routeId:route()?.id, date:todayISO(), shopId:shop?.id||'', shopName:shop?.name||'', notes:$('#stockNotes').value, lines:[line], createdAt:nowStamp()});
        logChange(`Stock asignado a tienda: ${row.product} · ${fmtNum(qtyBase)}`);
      } else {
        state.wastes.unshift({id:uid('wst'), routeId:route()?.id, date:todayISO(), reason:$('#stockNotes').value||'Merma', notes:$('#stockNotes').value, lines:[line], createdAt:nowStamp()});
        logChange(`Merma registrada: ${row.product} · ${fmtNum(qtyBase)}`);
      }
      $('#modalRoot').innerHTML=''; saveState('Stock actualizado'); renderStock(); toast('Stock actualizado');
    };
  }

  function renderStockCodeLookup(q){
    const root = $('#stockCodeResult');
    if(!root) return;
    const query = String(q||'').trim();
    if(!query){ root.innerHTML = '<div class="empty" style="padding:14px">Introduce un código para ver el historial completo del producto.</div>'; return; }
    const p = findProductByName(query) || productSuggestions(query,1)[0];
    if(!p){ root.innerHTML = '<div class="alertItem warn"><strong>No encontrado</strong><br><span>Ese código o producto no existe todavía.</span></div>'; return; }
    const stock = stockSummary().find(r => r.productObj?.id === p.id) || {boughtQty:0,soldQty:0,shopQty:0,wasteQty:0,remainingQty:0,stockValue:0,avgCost:toNumber(p.buyPrice),boxes:0};
    const purchases = state.purchases.flatMap(pur => activeLines(pur.lines).map(line=>({pur,line,prod:line.productId?state.products.find(x=>x.id===line.productId):findProductByName(line.productName)})).filter(x=>x.prod?.id===p.id));
    const sales = state.invoices.filter(i=>i.status!=='anulada').flatMap(inv => invoiceTotals(inv).lineCalcs.map(x=>({inv,line:x.line,calc:x.calc,prod:x.line.productId?state.products.find(p=>p.id===x.line.productId):findProductByName(x.line.productName)})).filter(x=>x.prod?.id===p.id));
    const shops = state.transfers.flatMap(tr => transferTotals(tr).calcs.map(x=>({tr,line:x.line,calc:x.calc,prod:x.line.productId?state.products.find(p=>p.id===x.line.productId):findProductByName(x.line.productName)})).filter(x=>x.prod?.id===p.id));
    const wastes = (state.wastes||[]).flatMap(w => wasteTotals(w).calcs.map(x=>({w,line:x.line,calc:x.calc,prod:x.line.productId?state.products.find(p=>p.id===x.line.productId):findProductByName(x.line.productName)})).filter(x=>x.prod?.id===p.id));
    root.innerHTML = `<div class="grid cols4">
      <div class="kpi"><span>${esc(p.code||'')}</span><strong>${esc(p.name)}</strong><small>Producto</small></div>
      <div class="kpi"><span>Comprado</span><strong>${fmtNum(stock.boughtQty)}</strong><small>${p.kgBox?`≈ ${fmtNum(stock.boughtQty/toNumber(p.kgBox),2)} cajas`:modeLabel(p.mode)}</small></div>
      <div class="kpi"><span>Vendido</span><strong>${fmtNum(stock.soldQty)}</strong><small>Clientes</small></div>
      <div class="kpi good"><span>Stock €</span><strong>${fmtMoney(stock.stockValue)}</strong><small>Sobrante ${fmtNum(stock.remainingQty)}</small></div>
    </div>
    <div class="grid cols2" style="margin-top:12px">
      <div class="summaryBox"><h3>Compras</h3>${miniCodeTable(['Fecha','Proveedor','Cant.','Precio'], purchases.map(x=>[x.pur.date, x.pur.supplierName||'', fmtNum(lineCalc(x.line,false).neto), fmtMoney(toNumber(x.line.price))]))}</div>
      <div class="summaryBox"><h3>Ventas</h3>${miniCodeTable(['Fecha','Cliente','Factura','Cant.','Precio'], sales.map(x=>[x.inv.date, x.inv.clientName||'', x.inv.no||'', fmtNum(x.calc.neto), fmtMoney(toNumber(x.line.price))]))}</div>
      <div class="summaryBox"><h3>Tiendas propias</h3>${miniCodeTable(['Fecha','Tienda','Cant.','Valor'], shops.map(x=>[x.tr.date, x.tr.shopName||'', fmtNum(x.calc.neto), fmtMoney(x.calc.base)]))}</div>
      <div class="summaryBox"><h3>Mermas / pérdidas</h3>${miniCodeTable(['Fecha','Motivo','Cant.','Coste'], wastes.map(x=>[x.w.date, x.w.reason||x.w.notes||'', fmtNum(x.calc.neto), fmtMoney(x.calc.cost)]))}</div>
    </div>`;
  }
  function miniCodeTable(head, rows){
    if(!rows.length) return '<div class="empty" style="padding:10px">Sin movimientos.</div>';
    return `<div class="tableWrap"><table class="compact"><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,30).map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function renderWastes(){
    const wastes=routeFiltered(state.wastes||[]);
    const total=round2(wastes.reduce((s,w)=>s+wasteTotals(w).cost,0));
    $('#view').innerHTML=`<div class="card"><div class="cardTitle"><div><h2>Mermas / pérdidas</h2><p>Producto pasado, golpeado, devolución, regalo o ajuste físico. Se descuenta solo en informe interno.</p></div><div class="toolbar"><button class="ghostBtn small" id="goStockBtn">Ir a stock</button></div></div><div class="kpi bad"><span>Total merma ruta</span><strong>${fmtMoney(total)}</strong><small>${wastes.length} registros</small></div><div class="sep"></div><div class="tableWrap"><table><thead><tr><th>Fecha</th><th>Motivo</th><th>Código</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Coste</th><th>Acción</th></tr></thead><tbody>${wastes.flatMap(w=>wasteTotals(w).calcs.map(x=>`<tr><td>${esc(w.date)}</td><td>${esc(w.reason||w.notes||'Merma')}</td><td>${esc(x.line.productName)}</td><td class="num">${fmtNum(x.calc.neto)}</td><td class="num"><b>${fmtMoney(x.calc.cost)}</b></td><td><button class="dangerBtn tiny" data-delete-waste="${w.id}">Borrar</button></td></tr>`)).join('')||'<tr><td colspan="6" class="empty">No hay mermas registradas.</td></tr>'}</tbody></table></div></div>`;
    $('#goStockBtn').onclick=()=>renderPage('stock');
    $$('[data-delete-waste]').forEach(b=>b.onclick=()=>confirmModal('Borrar merma','<p>¿Borrar este registro de merma?</p>',()=>{state.wastes=state.wastes.filter(w=>w.id!==b.dataset.deleteWaste);saveState('Merma borrada');renderWastes();},'Borrar'));
  }

  function renderReports(){
    $('#view').innerHTML=`<div class="card"><div class="cardTitle"><div><h2>Reportes y exportaciones</h2><p>PDF cliente, PDF interno, Excel completo y backup JSON.</p></div></div><div class="grid cols3"><button class="primaryBtn" id="internalPdfBtn">PDF informe interno</button><button class="ghostBtn" id="exportExcelBtn">Exportar Excel</button><button class="ghostBtn" id="backupBtn">Backup JSON</button><label class="ghostBtn" style="text-align:center">Restaurar JSON<input id="restoreInput" type="file" accept=".json" hidden></label><button class="ghostBtn" id="printBtn">Imprimir pantalla</button></div></div>`;
    $('#internalPdfBtn').onclick=()=>promptPin(exportInternalPDF); $('#exportExcelBtn').onclick=()=>exportExcel(); $('#backupBtn').onclick=()=>downloadFile(`FACTURA_AW_backup_${todayISO()}.json`, JSON.stringify(state,null,2), 'application/json'); $('#restoreInput').onchange=e=>restoreBackup(e.target.files[0]); $('#printBtn').onclick=()=>window.print();
  }
  function renderSettings(){
    $('#view').innerHTML=`<div class="card"><div class="cardTitle"><div><h2>Ajustes</h2><p>Modo blanco por defecto, PIN, cloud y numeración.</p></div></div><div class="row"><div class="field col3"><label>Tema</label><select id="setTheme"><option value="light">Blanco</option><option value="dark">Negro</option></select></div><div class="field col3"><label>PIN interno</label><input id="setPin" type="password" value="${esc(state.settings.pin)}"></div><div class="field col3"><label>Líneas por defecto</label><select id="setLines"><option>5</option><option>8</option><option>10</option><option>15</option></select></div><div class="field col3"><label>Margen objetivo %</label><input id="setDefaultMargin" inputmode="decimal" value="${esc(state.settings.defaultTargetMargin||18)}"></div><div class="field col3"><label>Numeración</label><select id="setNoMode"><option value="daily">Diaria</option><option value="year">Anual</option></select></div><div class="field col6"><label>Empresa</label><input id="setCompanyName" value="${esc(state.settings.companyName)}"></div><div class="field col3"><label>NIF</label><input id="setCompanyNif" value="${esc(state.settings.companyNif)}"></div><div class="field col3"><label>Teléfono</label><input id="setCompanyPhone" value="${esc(state.settings.companyPhone)}"></div><div class="field col8"><label>Dirección</label><input id="setCompanyAddress" value="${esc(state.settings.companyAddress)}"></div><div class="field col4"><label>Email</label><input id="setCompanyEmail" value="${esc(state.settings.companyEmail)}"></div></div><div class="sep"></div><div class="toolbar"><button class="primaryBtn" id="saveSettingsBtn">Guardar ajustes</button><button class="ghostBtn" id="enableCloudBtn">Activar cloud Firebase</button><button class="dangerBtn" id="resetBtn">Reset demo</button></div><div class="alertItem warn"><strong>Cloud multidispositivo</strong><br>Rellena firebase-config.js, sube a GitHub Pages y pulsa Activar cloud. La app funciona en local aunque Firebase esté vacío.</div></div>`;
    $('#setTheme').value=state.settings.theme; $('#setLines').value=String(state.settings.lineDefaults); $('#setNoMode').value=state.settings.invoiceNoMode;
    $('#saveSettingsBtn').onclick=()=>{Object.assign(state.settings,{theme:$('#setTheme').value,pin:$('#setPin').value,lineDefaults:toNumber($('#setLines').value)||8,defaultTargetMargin:toNumber($('#setDefaultMargin').value)||18,invoiceNoMode:$('#setNoMode').value,companyName:$('#setCompanyName').value,companyNif:$('#setCompanyNif').value,companyPhone:$('#setCompanyPhone').value,companyAddress:$('#setCompanyAddress').value,companyEmail:$('#setCompanyEmail').value});document.documentElement.dataset.theme=state.settings.theme;saveState('Ajustes guardados');toast('Ajustes guardados');};
    $('#enableCloudBtn').onclick=()=>initFirebaseIfNeeded(true);
    $('#resetBtn').onclick=()=>confirmModal('Reset demo','<p>Esto reiniciará la app a datos demo y borrará datos locales.</p>',()=>{localStorage.removeItem(APP_KEY);localStorage.removeItem(DRAFT_KEY);location.reload();},'Reset');
  }

  function pasteLinesModal(context){
    $('#modalRoot').innerHTML=`<div class="modalBackdrop"><div class="modal"><div class="modalHead"><h3>Pegar lista rápida</h3><button class="iconBtn" data-modal-close>×</button></div><p class="muted">Ejemplo: Macho maduro 2 cajas · Lima 1 · Cilantro 20 · Jengibre 5 kg</p><textarea id="pasteText" rows="8" class="input" style="width:100%"></textarea><div class="toolbar right" style="margin-top:16px"><button class="ghostBtn" data-modal-close>Cancelar</button><button class="primaryBtn" id="importLines">Importar líneas</button></div></div></div>`;
    $$('[data-modal-close]').forEach(b=>b.onclick=()=>$('#modalRoot').innerHTML='');
    $('#importLines').onclick=()=>{ const parsed=parsePastedLines($('#pasteText').value,context); const target=context==='invoice'?invoiceDraft.lines:purchaseDraft.lines; parsed.forEach(l=>target.push(l)); $('#modalRoot').innerHTML=''; if(context==='invoice')renderInvoices(); else renderPurchases(); };
  }
  function parsePastedLines(text,context){
    return String(text||'').split(/\n+/).map(s=>s.trim()).filter(Boolean).map(row=>{
      const parts=row.split(/\s+/); let qty=''; let mode='';
      for(let i=parts.length-1;i>=0;i--){ if(/^[\d,.]+$/.test(parts[i])){ qty=parts[i]; parts.splice(i,1); break; } }
      const joined=parts.join(' ');
      if(/caja/i.test(row)) mode='caja_kg'; if(/ud|unidad/i.test(row)) mode='ud'; if(/manojo/i.test(row)) mode='manojo'; if(/kg/i.test(row)) mode='kg';
      const line={id:uid('line'),productId:'',productName:joined.replace(/\b(cajas?|kg|ud|unidad(es)?|manojos?)\b/ig,'').trim().toUpperCase(),mode:mode||'kg',qty,kgBox:'',bruto:'',tara:'',neto:'',price:'',buyPrice:'',vat:'4',discount:'',note:'',type:context};
      const p=findProductByName(line.productName); if(p) applyProductToLine(line,p,context);
      return line;
    });
  }

  function exportInvoicePDF(inv, saved=true){
    if(!window.jspdf?.jsPDF){ toast('Librería PDF no cargada'); return; }
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({unit:'pt',format:'a4'});
    const t=invoiceTotals(inv);
    const margin=42;
    let y=42;
    const vatLabel = usedVatLabelFromTotals(t);

    // Cabecera limpia para cliente
    doc.setFont('helvetica','bold');
    doc.setFontSize(22);
    doc.text('FACTURA', margin, y);
    doc.setFontSize(11);
    doc.text('AW', 530, y, {align:'right'});
    y+=22;
    doc.setDrawColor(20);
    doc.line(margin,y,553,y);
    y+=24;

    doc.setFontSize(9);
    doc.setFont('helvetica','bold');
    doc.text('Proveedor', margin, y);
    doc.text('Cliente', 330, y);
    y+=14;
    doc.setFont('helvetica','normal');
    const c=getClient(inv.clientId)||{};
    const left=[state.settings.companyName,`NIF: ${state.settings.companyNif}`,state.settings.companyAddress,`${state.settings.companyPhone} · ${state.settings.companyEmail}`];
    const right=[inv.clientName||c.name||'',c.nif?`NIF: ${c.nif}`:'',c.address||'',c.phone||''].filter(Boolean);
    left.forEach((l,i)=>doc.text(String(l),margin,y+i*13));
    right.forEach((l,i)=>doc.text(String(l),330,y+i*13));
    y+=62;

    doc.setFont('helvetica','bold');
    doc.text(`Nº factura: ${inv.no}`, margin, y);
    doc.text(`Fecha: ${formatDate(inv.date)}`, 330, y);
    y+=16;
    doc.setFont('helvetica','normal');
    doc.text(`IVA aplicado: ${vatLabel}`, margin, y);
    y+=20;

    const rows=t.lineCalcs.map(x=>[
      productCodeFor(x.line) || '',
      x.line.productName,
      modeLabel(x.line.mode),
      displayQty(x.line,x.calc),
      fmtMoney(toNumber(x.line.price)).replace(' €',''),
      fmtMoney(x.calc.base)
    ]);
    doc.autoTable({
      startY:y,
      head:[['Código','Producto','Modo','Cantidad','Precio','Importe']],
      body:rows,
      margin:{left:margin,right:margin},
      theme:'grid',
      headStyles:{fillColor:[20,20,20]},
      styles:{fontSize:8,cellPadding:5},
      columnStyles:{5:{halign:'right'},4:{halign:'right'}}
    });
    y=doc.lastAutoTable.finalY+18;

    const baseImponible = round2(t.subtotalAfterDiscount + t.transportBase);
    const summary=[];
    summary.push(['Subtotal productos',fmtMoney(t.subtotal)]);
    if(t.discount) summary.push(['Descuento','-'+fmtMoney(t.discount)]);
    if(t.transportBase) summary.push(['Transporte',fmtMoney(t.transportBase)]);
    summary.push(['Base imponible',fmtMoney(baseImponible)]);
    summary.push(['IVA total',fmtMoney(t.taxTotal)]);

    doc.autoTable({
      startY:y,
      body:summary,
      margin:{left:330,right:margin},
      theme:'plain',
      styles:{fontSize:10,cellPadding:4},
      columnStyles:{0:{fontStyle:'bold'},1:{halign:'right',fontStyle:'bold'}}
    });
    y=doc.lastAutoTable.finalY+8;

    // Total destacado en cuadro profesional
    const boxX=330, boxW=223, boxH=52;
    doc.setDrawColor(20);
    doc.setLineWidth(0.8);
    doc.roundedRect(boxX, y, boxW, boxH, 5, 5);
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.text('TOTAL FACTURA', boxX+12, y+18);
    doc.setFontSize(17);
    doc.text(fmtMoney(t.total), boxX+boxW-12, y+36, {align:'right'});
    y+=boxH+14;

    doc.setFontSize(10);
    doc.setFont('helvetica','bold');
    doc.text('Pendiente', boxX+12, y);
    doc.text(fmtMoney(t.pending), boxX+boxW-12, y, {align:'right'});

    const pages=doc.internal.getNumberOfPages();
    for(let i=1;i<=pages;i++){
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica','normal');
      doc.text(`AW · ${inv.no} · Página ${i}/${pages}`, margin, 815);
    }
    doc.save(`FACTURA_${safeFile(inv.clientName)}_${inv.date}.pdf`);
  }
  function exportInternalPDF(){
    if(!window.jspdf?.jsPDF){ toast('Librería PDF no cargada'); return; }
    const {jsPDF}=window.jspdf; const doc=new jsPDF({unit:'pt',format:'a4'}); const m=dashboardMetrics();
    doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.text('INFORME INTERNO · FACTURA AW',42,45); doc.setFontSize(10); doc.text(`Ruta: ${route()?.date||''} · Generado: ${nowStamp()}`,42,62);
    doc.autoTable({startY:82, body:[['Ventas clientes',fmtMoney(m.sales)],['Compras proveedor',fmtMoney(m.purchases)],['Transporte cobrado',fmtMoney(m.transport)],['Comisiones internas',fmtMoney(m.commissions)],['Tiendas propias margen',fmtMoney(m.shopProfit)],['Gastos ruta',fmtMoney(m.expenses)],['Beneficio interno',fmtMoney(m.internalProfit)],['Beneficio caja',fmtMoney(m.cashProfit)]], theme:'grid', styles:{fontSize:10}, columnStyles:{1:{halign:'right',fontStyle:'bold'}}, headStyles:{fillColor:[20,20,20]}});
    doc.addPage(); doc.setFontSize(16); doc.text('Beneficio por producto',42,45);
    doc.autoTable({startY:60, head:[['Código','Producto','Cantidad','Venta base','Coste','Beneficio','Margen']], body:profitByProduct().map(r=>[r.code||'',r.product,fmtNum(r.qty),fmtMoney(r.base),fmtMoney(r.cost),fmtMoney(r.profit),fmtNum(r.margin,2)+'%']), styles:{fontSize:8}, headStyles:{fillColor:[20,20,20]}, didParseCell:data=>{ if(data.section==='body' && String(data.row.raw[5]).startsWith('-')) data.cell.styles.textColor=[200,40,40]; }});
    doc.addPage(); doc.setFontSize(16); doc.text('Beneficio por cliente',42,45);
    doc.autoTable({startY:60, head:[['Cliente','Venta base','Coste','Comisión','Beneficio','Margen']], body:profitByClient().map(r=>[r.client,fmtMoney(r.base),fmtMoney(r.cost),fmtMoney(r.commission),fmtMoney(r.profit),fmtNum(r.margin,2)+'%']), styles:{fontSize:8}, headStyles:{fillColor:[20,20,20]}, didParseCell:data=>{ if(data.section==='body' && String(data.row.raw[4]).startsWith('-')) data.cell.styles.textColor=[200,40,40]; }});
    doc.addPage(); doc.setFontSize(16); doc.text('Stock y sobrantes',42,45);
    doc.autoTable({startY:60, head:[['Código','Producto','Comprado','Facturado','Tiendas','Merma','Sobrante','Valor stock']], body:stockSummary().map(r=>[r.code||'',r.product,fmtNum(r.boughtQty),fmtNum(r.soldQty),fmtNum(r.shopQty),fmtNum(r.wasteQty),fmtNum(r.remainingQty),fmtMoney(r.stockValue)]), styles:{fontSize:8}, headStyles:{fillColor:[20,20,20]}, columnStyles:{7:{halign:'right',fontStyle:'bold'}}});
    doc.save(`INFORME_INTERNO_FACTURA_AW_${todayISO()}.pdf`);
    toast('PDF interno generado');
  }
  function exportExcel(){
    if(!window.XLSX){ toast('Librería Excel no cargada'); return; }
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.invoices.map(i=>{const t=invoiceTotals(i); return {fecha:i.date, numero:i.no, cliente:i.clientName, estado:i.status, subtotal:t.subtotal, transporte:t.transportBase, iva:t.taxTotal,total:t.total,cobrado:t.paid,pendiente:t.pending};})), 'Facturas');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.invoices.flatMap(i=>invoiceTotals(i).lineCalcs.map(x=>({factura:i.no,cliente:i.clientName,codigo:productCodeFor(x.line),producto:x.line.productName,modo:x.line.mode,cantidad:x.calc.neto,precio:toNumber(x.line.price),iva:x.line.vat,base:x.calc.base,total:x.calc.total})))), 'Lineas factura');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.purchases.map(p=>{const t=purchaseTotals(p); return {fecha:p.date, proveedor:p.supplierName, numero:p.invoiceNo, subtotal:t.subtotal, iva:t.taxTotal,total:t.total};})), 'Compras');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.products), 'Productos');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.clients), 'Clientes');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(profitByProduct()), 'Margenes productos');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(profitByClient()), 'Margenes clientes');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(stockSummary()), 'Stock');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((state.wastes||[]).flatMap(w=>wasteTotals(w).calcs.map(x=>({fecha:w.date,motivo:w.reason||w.notes,producto:x.line.productName,cantidad:x.calc.neto,coste:x.calc.cost})))), 'Mermas');
    XLSX.writeFile(wb, `FACTURA_AW_${todayISO()}.xlsx`);
  }
  function restoreBackup(file){ if(!file)return; const reader=new FileReader(); reader.onload=()=>{try{state=JSON.parse(reader.result); saveState('Backup restaurado'); location.reload();}catch{toast('Backup inválido');}}; reader.readAsText(file); }
  function downloadFile(name, content, type='text/plain'){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url); }
  function formatDate(iso){ if(!iso)return''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
  function safeFile(s){ return normalize(s).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').toUpperCase() || 'CLIENTE'; }
  function modeLabel(m){ return ({kg:'Kg',caja_kg:'Caja x kg',caja_fija:'Caja fija',ud:'Ud',manojo:'Manojo'}[m]||m); }
  function displayQty(line,calc){ if(line.mode==='caja_kg') return `${fmtNum(toNumber(line.qty))} cajas × ${fmtNum(toNumber(line.kgBox))} kg = ${fmtNum(calc.neto)} kg`; if(line.mode==='caja_fija') return `${fmtNum(toNumber(line.qty))} cajas`; if(line.mode==='kg') return `${fmtNum(calc.neto)} kg`; if(line.mode==='manojo') return `${fmtNum(calc.neto)} manojos`; return `${fmtNum(calc.neto)} ud`; }

  document.addEventListener('click', e => {
    const edit = e.target.closest('[data-edit-inv]'); if(edit){ editInvoice(edit.dataset.editInv); return; }
    const pdf = e.target.closest('[data-pdf-inv]'); if(pdf){ const inv=state.invoices.find(i=>i.id===pdf.dataset.pdfInv); if(inv)exportInvoicePDF(inv); return; }
    const dup = e.target.closest('[data-dup-inv]'); if(dup){ const inv=state.invoices.find(i=>i.id===dup.dataset.dupInv); if(inv){ invoiceDraft=structuredClone(inv); invoiceDraft.id=uid('draftinv'); invoiceDraft.editingId=''; invoiceDraft.editingOriginalStatus=''; invoiceDraft.no=nextInvoiceNo(); invoiceDraft.status='borrador'; invoiceDraft.lines=invoiceDraft.lines.map(l=>({...l,id:uid('line')})); saveDrafts(); renderPage('invoices'); } return; }
    const pay = e.target.closest('[data-pay-inv]'); if(pay){ payInvoiceModal(pay.dataset.payInv); return; }
    const voidBtn = e.target.closest('[data-void-inv]'); if(voidBtn){ voidInvoice(voidBtn.dataset.voidInv); return; }
  });

  function initFirebaseIfNeeded(force){
    const cfg = window.FACTURA_FIREBASE_CONFIG || {};
    if(!cfg.apiKey){ if(force) toast('Rellena firebase-config.js para activar cloud'); return; }
    if(firebaseReady) { toast('Cloud ya está preparado'); return; }
    try{
      firebase.initializeApp(cfg); const auth=firebase.auth(); const db=firebase.database();
      const email = localStorage.getItem('factura_aw_email') || prompt('Email Firebase:'); if(!email)return;
      const pass = prompt('Contraseña Firebase:'); if(!pass)return;
      auth.signInWithEmailAndPassword(email,pass).then(user=>{
        localStorage.setItem('factura_aw_email',email); const key=window.FACTURA_COMPANY_KEY||'aw'; dbRef=db.ref(`companies/${key}/state`); firebaseReady=true; state.settings.cloudEnabled=true;
        dbRef.once('value').then(snap=>{ if(snap.exists()){ const cloud=snap.val(); if(cloud?.version){ state={...state,...cloud,settings:{...state.settings,...cloud.settings}}; localStorage.setItem(APP_KEY,JSON.stringify(state)); } } saveState('Cloud activado'); toast('Cloud activado'); renderPage(currentPage); });
      }).catch(err=>toast('Firebase: '+err.message));
    }catch(err){ if(force)toast('Firebase error: '+err.message); }
  }

  init();
})();
