
import { firebaseConfig } from './firebase-config.js';

const LOCAL_KEY='nexoruta_cloud_state_v1';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const uid=(p='id')=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const iso=()=>new Date().toISOString().slice(0,10);
const n=v=>{let s=String(v??'').trim().replace(/\s/g,'').replace('€','');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else s=s.replace(',','.');return Number(s)||0};
const money=v=>n(v).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const fmt=v=>n(v).toLocaleString('es-ES',{maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

const seedProducts=[
 ['MV','PLÁTANO MACHO VERDE','macho verde,platano verde,verde dole','CAJA',22,1.25,1.50,4],
 ['MM','PLÁTANO MACHO MADURO','macho maduro,platano maduro','CAJA',22,1.60,1.85,4],
 ['CL','CILANTRO','cilantro manojo,coriander','MANOJO',0,.55,.75,10],
 ['YU','YUCA','yuka,cassava','KG',0,1.60,2.10,4],
 ['MG','MANGO','mango caja,mango avion','CAJA',0,10.80,12.50,4],
 ['AV','AGUACATE PREMIUM','aguacate,avocado','CAJA',0,18,21,4],
].map(x=>({id:uid('prd'),code:x[0],name:x[1],aliases:x[2],unit:x[3],kgBox:x[4],buyPrice:x[5],sellPrice:x[6],vat:x[7],active:true}));

function fresh(){
 const route={id:uid('route'),name:`Ruta Madrid ${iso()}`,date:iso(),status:'open',createdAt:new Date().toISOString()};
 return {version:1,settings:{business:'NEXORUTA CLOUD',invoicePrefix:'NX',nextInvoice:1,theme:'light',transport:0},users:[],clients:[],products:seedProducts,routes:[route],activeRouteId:route.id,orders:[],deliveries:[],invoices:[],payments:[],purchases:[],expenses:[],stockMoves:[],suppliers:[]}
}
let state=load(),page='dashboard',db=null,cloud=false,user=null;
function load(){try{return {...fresh(),...JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}')}}catch{return fresh()}}
function save(){localStorage.setItem(LOCAL_KEY,JSON.stringify(state));if(cloud&&db)saveCloud();render()}
function toast(t){const el=$('#toast');el.textContent=t;el.style.display='block';setTimeout(()=>el.style.display='none',2500)}
function route(){return state.routes.find(r=>r.id===state.activeRouteId)}
function client(id){return state.clients.find(x=>x.id===id)}
function product(id){return state.products.find(x=>x.id===id)}
function order(id){return state.orders.find(x=>x.id===id)}
function invoiceTotal(inv){return inv.lines.reduce((s,l)=>s+n(l.qty)*n(l.price)*(1+n(l.vat)/100),0)+n(inv.transport)-n(inv.discount)}
function paidForInvoice(id){return state.payments.filter(p=>p.invoiceId===id).reduce((s,p)=>s+n(p.amount),0)}
function clientTotals(cid){const invs=state.invoices.filter(i=>i.clientId===cid);const billed=invs.reduce((s,i)=>s+invoiceTotal(i),0);const paid=invs.reduce((s,i)=>s+paidForInvoice(i.id),0);return{billed,paid,pending:billed-paid,count:invs.length}}
function routeOrders(){return state.orders.filter(o=>o.routeId===state.activeRouteId)}
function routeInvoices(){return state.invoices.filter(i=>i.routeId===state.activeRouteId)}
function nav(){return[
 ['dashboard','⌂ Inicio'],['week','▣ Semana actual'],['orders','☑ Pedidos'],['purchase','▦ Compra consolidada'],
 ['delivery','🚚 Entregas'],['invoices','▤ Facturas'],['payments','€ Cobros'],['clients','◉ Clientes'],
 ['products','◎ Productos'],['stock','▧ Stock'],['expenses','− Gastos'],['history','◌ Semanas'],['settings','⚙ Ajustes']
]}
function renderNav(){$('#nav').innerHTML=nav().map(x=>`<button class="${page===x[0]?'active':''}" data-page="${x[0]}">${x[1]}</button>`).join('');$$('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render()})}
function setTitle(t,s){pageTitle.textContent=t;pageSub.textContent=s}
function totals(){
 const invs=routeInvoices(),sales=invs.reduce((s,i)=>s+invoiceTotal(i),0),paid=invs.reduce((s,i)=>s+paidForInvoice(i.id),0);
 const purchase=state.purchases.filter(p=>p.routeId===state.activeRouteId).reduce((s,p)=>s+n(p.total),0);
 const expenses=state.expenses.filter(e=>e.routeId===state.activeRouteId).reduce((s,e)=>s+n(e.amount),0);
 return{sales,paid,pending:sales-paid,purchase,expenses,profit:sales-purchase-expenses}
}
function dashboard(){
 setTitle('Inicio','Resumen económico y operativo');const t=totals();
 return `<div class="hero"><div><small>BENEFICIO ESTIMADO DE LA SEMANA</small><strong>${money(t.profit)}</strong><span>${route()?.name||''}</span></div><button onclick="go('orders')">+ Nuevo pedido</button></div>
 <div class="grid cols4" style="margin-top:14px">${[['Facturación',t.sales],['Compra',t.purchase],['Cobrado',t.paid],['Pendiente',t.pending]].map(x=>`<div class="kpi"><span>${x[0]}</span><strong>${money(x[1])}</strong></div>`).join('')}</div>
 <div class="grid cols2" style="margin-top:14px"><div class="card"><div class="head"><div><h3>Estado de la ruta</h3><p>Pedidos, entregas y facturas</p></div></div>
 ${[['Pedidos',routeOrders().length],['Entregas',state.deliveries.filter(d=>d.routeId===state.activeRouteId).length],['Facturas',routeInvoices().length]].map(x=>`<div class="itemtop" style="padding:10px 0;border-bottom:1px solid var(--line)"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div>
 <div class="card"><div class="head"><div><h3>Alertas</h3><p>Revisión necesaria</p></div></div>${alerts()}</div></div>`
}
function alerts(){const a=[];routeOrders().filter(o=>!state.deliveries.some(d=>d.orderId===o.id)).forEach(o=>a.push(`Pedido de ${esc(client(o.clientId)?.name)} sin preparar`));routeInvoices().filter(i=>paidForInvoice(i.id)<invoiceTotal(i)).forEach(i=>a.push(`Factura ${i.no} pendiente: ${money(invoiceTotal(i)-paidForInvoice(i.id))}`));return a.length?a.slice(0,8).map(x=>`<div class="item"><span class="badge warn">Aviso</span> ${x}</div>`).join(''):'<div class="empty">Todo bajo control</div>'}
function week(){
 setTitle('Semana actual','Cierre semanal sin perder facturas');const t=totals();
 return `<div class="grid cols4">${[['Ventas',t.sales],['Cobrado',t.paid],['Gastos',t.expenses],['Beneficio',t.profit]].map(x=>`<div class="kpi"><span>${x[0]}</span><strong>${money(x[1])}</strong></div>`).join('')}</div>
 <div class="card" style="margin-top:14px"><div class="head"><div><h2>${esc(route()?.name)}</h2><p>${route()?.status==='open'?'Abierta':'Cerrada'}</p></div><button class="danger" onclick="closeWeek()">Cerrar semana y crear nueva</button></div>
 <p>Al cerrar se conservan clientes, productos, facturas, cobros, stock, compras e historial. La semana nueva comienza sin pedidos ni entregas.</p></div>`
}
function orders(){
 setTitle('Pedidos','Entrada rápida por cliente y vocabulario');
 return `<div class="head"><div><h2>Pedidos de la semana</h2><p>Pega pedidos de WhatsApp o añade líneas</p></div><button class="primary" onclick="openOrder()">+ Pedido</button></div>
 <div class="list">${routeOrders().map(o=>{const c=client(o.clientId);return`<div class="item"><div class="itemtop"><div><h3>${esc(c?.name||'Cliente')}</h3><div class="muted">${o.lines.length} productos · ${o.status}</div></div><div><button class="secondary" onclick="openOrder('${o.id}')">Abrir</button> <button class="primary" onclick="prepareDelivery('${o.id}')">Preparar entrega</button></div></div></div>`}).join('')||'<div class="empty">No hay pedidos.</div>'}</div>`
}
function purchase(){
 setTitle('Compra consolidada','Suma automática de todos los pedidos');const map={};
 routeOrders().forEach(o=>o.lines.forEach(l=>{const k=l.productId;map[k]??={productId:k,qty:0};map[k].qty+=n(l.qty)}));
 return `<div class="head"><div><h2>Compra total</h2><p>Calculada desde los pedidos</p></div><button class="secondary" onclick="copyPurchase()">Copiar TXT</button></div>
 <div class="card"><div class="table"><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Unidad</th><th>Coste estimado</th></tr></thead><tbody>${Object.values(map).map(x=>{const p=product(x.productId);return`<tr><td>${esc(p?.name)}</td><td>${fmt(x.qty)}</td><td>${p?.unit}</td><td>${money(x.qty*n(p?.buyPrice))}</td></tr>`}).join('')}</tbody></table></div></div>`
}
function delivery(){
 setTitle('Entregas','Factura según lo realmente bajado al cliente');const ds=state.deliveries.filter(d=>d.routeId===state.activeRouteId);
 return `<div class="head"><div><h2>Entregas</h2><p>Pedido → preparado → bajado → devuelto → facturable</p></div></div>
 <div class="list">${ds.map(d=>{const c=client(d.clientId);return`<div class="item"><div class="itemtop"><div><h3>${esc(c?.name)}</h3><div class="muted">${d.status}</div></div><div><button class="secondary" onclick="editDelivery('${d.id}')">Revisar</button> <button class="primary" onclick="invoiceDelivery('${d.id}')">Facturar entregado</button></div></div>
 <div class="table" style="margin-top:10px"><table><thead><tr><th>Producto</th><th>Pedido</th><th>Bajado</th><th>Devuelto</th><th>Facturable</th></tr></thead><tbody>${d.lines.map(l=>`<tr><td>${esc(product(l.productId)?.name)}</td><td>${fmt(l.ordered)}</td><td>${fmt(l.delivered)}</td><td>${fmt(l.returned)}</td><td><b>${fmt(Math.max(0,n(l.delivered)-n(l.returned)))}</b></td></tr>`).join('')}</tbody></table></div></div>`}).join('')||'<div class="empty">Prepara una entrega desde Pedidos.</div>'}</div>`
}
function invoices(){
 setTitle('Facturas','Historial permanente y PDF imprimible');
 return `<div class="head"><div><h2>Facturas</h2><p>No se eliminan al cerrar semana</p></div><button class="secondary" onclick="window.print()">Imprimir / PDF</button></div>
 <div class="card"><div class="table"><table><thead><tr><th>Número</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Cobrado</th><th>Pendiente</th></tr></thead><tbody>${state.invoices.slice().reverse().map(i=>{const total=invoiceTotal(i),paid=paidForInvoice(i.id);return`<tr><td>${i.no}</td><td>${esc(client(i.clientId)?.name)}</td><td>${i.date}</td><td>${money(total)}</td><td>${money(paid)}</td><td>${money(total-paid)}</td></tr>`}).join('')}</tbody></table></div></div>`
}
function payments(){
 setTitle('Cobros','Pagos completos, parciales y deuda');
 const pending=state.invoices.filter(i=>paidForInvoice(i.id)<invoiceTotal(i));
 return `<div class="head"><div><h2>Cobros pendientes</h2><p>Asigna pagos a cada factura</p></div></div><div class="list">${pending.map(i=>`<div class="item"><div class="itemtop"><div><h3>${i.no} · ${esc(client(i.clientId)?.name)}</h3><div class="muted">Pendiente ${money(invoiceTotal(i)-paidForInvoice(i.id))}</div></div><button class="primary" onclick="payInvoice('${i.id}')">Registrar pago</button></div></div>`).join('')||'<div class="empty">No hay facturas pendientes.</div>'}</div>`
}
function clients(){
 setTitle('Clientes','Facturas, cobros y saldo por nombre');
 return `<div class="head"><div><h2>Clientes</h2><p>Historial económico completo</p></div><button class="primary" onclick="openClient()">+ Cliente</button></div>
 <div class="card"><div class="table"><table><thead><tr><th>Cliente</th><th>Facturado</th><th>Cobrado</th><th>Pendiente</th><th>Facturas</th><th></th></tr></thead><tbody>${state.clients.map(c=>{const t=clientTotals(c.id);return`<tr><td><b>${esc(c.name)}</b><br><small>${esc(c.phone||'')}</small></td><td>${money(t.billed)}</td><td>${money(t.paid)}</td><td>${money(t.pending)}</td><td>${t.count}</td><td><button class="secondary" onclick="clientHistory('${c.id}')">Ver historial</button></td></tr>`}).join('')}</tbody></table></div></div>`
}
function products(){
 setTitle('Productos','Códigos, vocabulario y precios');return `<div class="head"><div><h2>Productos</h2><p>Búsqueda por nombre, código o sinónimo</p></div><button class="primary" onclick="openProduct()">+ Producto</button></div>
 <div class="card"><div class="table"><table><thead><tr><th>Código</th><th>Producto</th><th>Vocabulario</th><th>Unidad</th><th>Compra</th><th>Venta</th></tr></thead><tbody>${state.products.map(p=>`<tr><td><b>${p.code}</b></td><td>${esc(p.name)}</td><td>${esc(p.aliases)}</td><td>${p.unit}</td><td>${money(p.buyPrice)}</td><td>${money(p.sellPrice)}</td></tr>`).join('')}</tbody></table></div></div>`
}
function stock(){setTitle('Stock','Movimientos y sobrante entre semanas');const map={};state.stockMoves.forEach(m=>map[m.productId]=(map[m.productId]||0)+n(m.qty));return `<div class="card"><div class="table"><table><thead><tr><th>Producto</th><th>Stock</th><th>Valor coste</th></tr></thead><tbody>${Object.entries(map).map(([pid,q])=>`<tr><td>${esc(product(pid)?.name)}</td><td>${fmt(q)}</td><td>${money(q*n(product(pid)?.buyPrice))}</td></tr>`).join('')}</tbody></table></div></div>`}
function expenses(){setTitle('Gastos','Gasóleo, peajes, ayudante y otros');return `<div class="head"><div><h2>Gastos de la semana</h2></div><button class="primary" onclick="addExpense()">+ Gasto</button></div><div class="list">${state.expenses.filter(e=>e.routeId===state.activeRouteId).map(e=>`<div class="item itemtop"><span>${esc(e.type)} · ${esc(e.note||'')}</span><b>${money(e.amount)}</b></div>`).join('')||'<div class="empty">Sin gastos.</div>'}</div>`}
function history(){setTitle('Semanas anteriores','Rutas cerradas y resultados');return `<div class="list">${state.routes.slice().reverse().map(r=>`<div class="item itemtop"><div><h3>${esc(r.name)}</h3><div class="muted">${r.status} · ${r.date}</div></div><button class="secondary" onclick="switchRoute('${r.id}')">Abrir</button></div>`).join('')}</div>`}
function settings(){setTitle('Ajustes','Negocio, copia de seguridad y Firebase');return `<div class="card formgrid"><label>Nombre del negocio<input value="${esc(state.settings.business)}" onchange="patchSetting('business',this.value)"></label><label>Prefijo de factura<input value="${esc(state.settings.invoicePrefix)}" onchange="patchSetting('invoicePrefix',this.value)"></label><label>Transporte semanal<input value="${fmt(state.settings.transport)}" onchange="patchSetting('transport',this.value)"></label><label>Datos<input type="button" value="Exportar backup" onclick="exportBackup()"></label></div>`}
function render(){renderNav();document.documentElement.dataset.theme=state.settings.theme;const fn={dashboard,week,orders,purchase,delivery,invoices,payments,clients,products,stock,expenses,history,settings}[page]||dashboard;view.innerHTML=fn()}
window.go=p=>{page=p;render()};window.patchSetting=(k,v)=>{state.settings[k]=k==='transport'?n(v):v;save()}
function modal(html){$('#modal').innerHTML=`<div class="modalbox">${html}</div>`;$('#modal').classList.add('open')}
function closeModal(){$('#modal').classList.remove('open');$('#modal').innerHTML=''}window.closeModal=closeModal;
window.openClient=()=>modal(`<div class="head"><h2>Nuevo cliente</h2><button onclick="closeModal()">×</button></div><div class="formgrid"><label>Nombre<input id="cName"></label><label>NIF/CIF<input id="cNif"></label><label>Teléfono<input id="cPhone"></label><label>Dirección<input id="cAddress"></label></div><div class="toolbar" style="margin-top:14px"><button class="primary" onclick="saveClient()">Guardar</button></div>`);
window.saveClient=()=>{if(!cName.value.trim())return;state.clients.push({id:uid('cli'),name:cName.value.trim(),nif:cNif.value,phone:cPhone.value,address:cAddress.value});closeModal();save()}
window.openProduct=()=>modal(`<div class="head"><h2>Nuevo producto</h2><button onclick="closeModal()">×</button></div><div class="formgrid"><label>Código<input id="pCode"></label><label>Nombre<input id="pName"></label><label>Vocabulario<input id="pAliases"></label><label>Unidad<select id="pUnit"><option>CAJA</option><option>KG</option><option>UD</option><option>MANOJO</option></select></label><label>Precio compra<input id="pBuy"></label><label>Precio venta<input id="pSell"></label><label>IVA<input id="pVat" value="4"></label></div><button class="primary" onclick="saveProduct()">Guardar</button>`);
window.saveProduct=()=>{state.products.push({id:uid('prd'),code:pCode.value.toUpperCase(),name:pName.value.toUpperCase(),aliases:pAliases.value,unit:pUnit.value,buyPrice:n(pBuy.value),sellPrice:n(pSell.value),vat:n(pVat.value),active:true});closeModal();save()}
function findProduct(q){const z=norm(q);return state.products.find(p=>norm(p.code)===z||norm(p.name)===z||p.aliases.split(',').some(a=>norm(a)===z))}
window.openOrder=id=>{const o=id?order(id):{id:uid('ord'),routeId:state.activeRouteId,clientId:'',status:'draft',lines:[]};modal(`<div class="head"><div><h2>Pedido</h2><p>Pega texto: 5 MV, 40 CL...</p></div><button onclick="closeModal()">×</button></div><label>Cliente<select id="oClient">${state.clients.map(c=>`<option value="${c.id}" ${c.id===o.clientId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><label style="display:block;margin-top:10px">Pedido rápido<textarea id="oRaw" rows="7" placeholder="5 MV&#10;40 CL&#10;3 mango">${o.lines.map(l=>`${fmt(l.qty)} ${product(l.productId)?.code}`).join('\n')}</textarea></label><button class="primary" style="margin-top:12px" onclick="saveOrder('${o.id}',${id?'true':'false'})">Guardar pedido</button>`) }
window.saveOrder=(id,exists)=>{const lines=oRaw.value.split(/\n/).map(x=>x.trim()).filter(Boolean).map(row=>{const m=row.match(/^([\d.,]+)\s+(.+)$/);if(!m)return null;const p=findProduct(m[2]);return p?{id:uid('line'),productId:p.id,qty:n(m[1]),price:p.sellPrice,vat:p.vat}:null}).filter(Boolean);const obj={id,routeId:state.activeRouteId,clientId:oClient.value,status:'saved',lines};if(exists)Object.assign(order(id),obj);else state.orders.push(obj);closeModal();save()}
window.prepareDelivery=oid=>{const o=order(oid);let d=state.deliveries.find(x=>x.orderId===oid);if(!d){d={id:uid('del'),orderId:oid,routeId:o.routeId,clientId:o.clientId,status:'prepared',lines:o.lines.map(l=>({productId:l.productId,ordered:l.qty,prepared:l.qty,delivered:l.qty,returned:0,price:l.price,vat:l.vat}))};state.deliveries.push(d)}page='delivery';save()}
window.editDelivery=id=>{const d=state.deliveries.find(x=>x.id===id);modal(`<div class="head"><h2>Entrega · ${esc(client(d.clientId)?.name)}</h2><button onclick="closeModal()">×</button></div>${d.lines.map((l,i)=>`<div class="linegrid"><b>${esc(product(l.productId)?.name)}</b><input value="${fmt(l.ordered)}" disabled><span>${product(l.productId)?.unit}</span><input id="del_${i}" value="${fmt(l.delivered)}"><input id="ret_${i}" value="${fmt(l.returned)}"><b>${money((n(l.delivered)-n(l.returned))*n(l.price)*(1+n(l.vat)/100))}</b><span></span></div>`).join('')}<button class="primary" style="margin-top:12px" onclick="saveDelivery('${id}')">Guardar entrega</button>`)}
window.saveDelivery=id=>{const d=state.deliveries.find(x=>x.id===id);d.lines.forEach((l,i)=>{l.delivered=n($('#del_'+i).value);l.returned=n($('#ret_'+i).value)});d.status='confirmed';closeModal();save()}
window.invoiceDelivery=id=>{const d=state.deliveries.find(x=>x.id===id);if(state.invoices.some(i=>i.deliveryId===id))return toast('Esta entrega ya está facturada');const lines=d.lines.map(l=>({...l,qty:Math.max(0,n(l.delivered)-n(l.returned))})).filter(l=>l.qty>0);const no=`${state.settings.invoicePrefix}-${new Date().getFullYear()}-${String(state.settings.nextInvoice++).padStart(5,'0')}`;state.invoices.push({id:uid('inv'),deliveryId:id,routeId:d.routeId,clientId:d.clientId,no,date:iso(),lines,transport:0,discount:0,status:'issued'});lines.forEach(l=>state.stockMoves.push({id:uid('stk'),routeId:d.routeId,productId:l.productId,qty:-l.qty,type:'delivery'}));d.status='invoiced';page='invoices';save();toast('Factura creada según lo entregado')}
window.payInvoice=id=>{const i=state.invoices.find(x=>x.id===id),pend=invoiceTotal(i)-paidForInvoice(id);const amount=prompt(`Pendiente ${money(pend)}. Importe cobrado:`,String(pend).replace('.',','));if(amount===null)return;state.payments.push({id:uid('pay'),invoiceId:id,clientId:i.clientId,date:iso(),amount:n(amount),method:'efectivo'});save()}
window.clientHistory=cid=>{const c=client(cid),t=clientTotals(cid),invs=state.invoices.filter(i=>i.clientId===cid);modal(`<div class="head"><div><h2>${esc(c.name)}</h2><p>Historial permanente</p></div><button onclick="closeModal()">×</button></div><div class="grid cols3"><div class="kpi"><span>Facturado</span><strong>${money(t.billed)}</strong></div><div class="kpi"><span>Cobrado</span><strong>${money(t.paid)}</strong></div><div class="kpi"><span>Pendiente</span><strong>${money(t.pending)}</strong></div></div><div class="table" style="margin-top:12px"><table><thead><tr><th>Factura</th><th>Fecha</th><th>Total</th><th>Pendiente</th></tr></thead><tbody>${invs.map(i=>`<tr><td>${i.no}</td><td>${i.date}</td><td>${money(invoiceTotal(i))}</td><td>${money(invoiceTotal(i)-paidForInvoice(i.id))}</td></tr>`).join('')}</tbody></table></div>`)}
window.addExpense=()=>{const type=prompt('Tipo de gasto:','Gasóleo');if(!type)return;const amount=prompt('Importe:','0');state.expenses.push({id:uid('exp'),routeId:state.activeRouteId,type,amount:n(amount),date:iso()});save()}
window.closeWeek=()=>{if(!confirm('Cerrar esta semana y crear una nueva limpia?'))return;route().status='closed';route().closedAt=new Date().toISOString();const r={id:uid('route'),name:`Ruta Madrid ${iso()}`,date:iso(),status:'open',createdAt:new Date().toISOString()};state.routes.push(r);state.activeRouteId=r.id;page='dashboard';save()}
window.switchRoute=id=>{state.activeRouteId=id;page='dashboard';save()}
window.copyPurchase=()=>{const map={};routeOrders().forEach(o=>o.lines.forEach(l=>map[l.productId]=(map[l.productId]||0)+n(l.qty)));navigator.clipboard.writeText(Object.entries(map).map(([id,q])=>`${fmt(q)} ${product(id)?.unit} ${product(id)?.name}`).join('\n'));toast('Compra copiada')}
window.exportBackup=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download=`nexoruta-backup-${iso()}.json`;a.click()}
menuBtn.onclick=()=>$('#app').classList.toggle('menu');themeBtn.onclick=()=>{state.settings.theme=state.settings.theme==='dark'?'light':'dark';save()};

async function connectFirebase(){
 if(!firebaseConfig?.apiKey||firebaseConfig.apiKey.includes('PEGA_'))return modal(`<div class="head"><h2>Configurar Firebase</h2><button onclick="closeModal()">×</button></div><p>Crea un proyecto Firebase nuevo, activa Authentication y Firestore, y pega la configuración en <b>firebase-config.js</b>.</p>`);
 try{
  const {initializeApp}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
  const {getAuth,signInWithEmailAndPassword}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
  const {getFirestore,doc,getDoc,setDoc}=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
  const app=initializeApp(firebaseConfig),auth=getAuth(app);db={fs:getFirestore(app),doc,getDoc,setDoc};
  const email=prompt('Correo Firebase:');if(!email)return;const pass=prompt('Contraseña:');if(!pass)return;
  user=await signInWithEmailAndPassword(auth,email,pass);cloud=true;syncState.textContent='Firebase conectado';cloudBtn.textContent='☁ Sincronizado';await loadCloud();render()
 }catch(e){toast('Error Firebase: '+e.message)}
}
async function loadCloud(){const ref=db.doc(db.fs,'companies','nexoruta','state','main'),snap=await db.getDoc(ref);if(snap.exists()){if(confirm('Hay datos en la nube. ¿Cargarlos?'))state=snap.data()}else await saveCloud();localStorage.setItem(LOCAL_KEY,JSON.stringify(state))}
async function saveCloud(){if(!db)return;const ref=db.doc(db.fs,'companies','nexoruta','state','main');await db.setDoc(ref,state)}
cloudBtn.onclick=connectFirebase;
render();
