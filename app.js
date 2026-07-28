const KEY="ruta_madrid_pro_v1", OLD_KEY="pedidos_madrid_v4";
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const id=()=>crypto.randomUUID?.()||Math.random().toString(36).slice(2);
const num=v=>{let s=String(v??"").trim().replace(/\s/g,""); if(s.includes(",")&&s.includes("."))s=s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,"");else s=s.replace(",",".");return Number(s)||0};
const money=v=>num(v).toLocaleString("es-ES",{style:"currency",currency:"EUR"});
const qty=v=>num(v).toLocaleString("es-ES",{maximumFractionDigits:2});
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const today=()=>new Date().toISOString().slice(0,10);
const defaults=()=>({version:1,date:today(),business:"Ruta Madrid Pro",phone:"",transport:0,theme:"light",clients:[],orders:{},purchase:{},payments:{}});
let state=load(), selectedClient=state.clients[0]?.id||null, purchaseFilter="all";

function load(){try{return {...defaults(),...JSON.parse(localStorage.getItem(KEY)||"{}")}}catch{return defaults()}}
function save(render=true){localStorage.setItem(KEY,JSON.stringify(state));if(render)renderAll()}
function lines(cid){return state.orders[cid]||(state.orders[cid]=[])}
function client(cid){return state.clients.find(c=>c.id===cid)}
function totalsForClient(cid){
 const ls=lines(cid); let sale=0,cost=0;
 ls.forEach(l=>{sale+=num(l.quantity)*num(l.sale);cost+=num(l.quantity)*num(l.cost)});
 const paid=num(state.payments[cid]?.paid), profit=sale-cost, pending=Math.max(0,sale-paid);
 return {sale,cost,profit,paid,pending,margin:sale?profit/sale*100:0};
}
function consolidate(){
 const map=new Map();
 state.clients.forEach(c=>lines(c.id).forEach(l=>{
  const key=(l.product||"").trim().toUpperCase()+"__"+l.unit;
  const x=map.get(key)||{key,product:(l.product||"").trim().toUpperCase(),unit:l.unit||"CAJA",quantity:0,cost:0,sale:0,clients:[]};
  x.quantity+=num(l.quantity);x.cost+=num(l.quantity)*num(l.cost);x.sale+=num(l.quantity)*num(l.sale);x.clients.push({name:c.name,quantity:num(l.quantity)});map.set(key,x)
 }));
 return [...map.values()].sort((a,b)=>a.product.localeCompare(b.product,"es"));
}
function globalTotals(){
 let sale=0,cost=0,paid=0,delivered=0,withOrder=0;
 state.clients.forEach(c=>{const t=totalsForClient(c.id);sale+=t.sale;cost+=t.cost;paid+=t.paid;if(lines(c.id).length)withOrder++;if(c.status==="delivered")delivered++});
 const profit=sale-cost-num(state.transport),pending=Math.max(0,sale-paid);
 return {sale,cost,paid,pending,profit,margin:sale?profit/sale*100:0,delivered,withOrder};
}
function go(view){$$(".view").forEach(v=>v.classList.toggle("active",v.id===view));$$(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.go===view));renderAll();scrollTo(0,0)}
function renderAll(){applyTheme();renderHeader();renderDashboard();renderOrders();renderPurchase();renderRoute();renderReports();renderSettings()}
function applyTheme(){document.body.classList.toggle("dark",state.theme==="dark")}
function renderHeader(){routeDate.textContent=new Date(state.date+"T12:00").toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"});}

function renderDashboard(){
 const g=globalTotals();heroProfit.textContent=money(g.profit);heroMargin.textContent=`Margen ${g.margin.toLocaleString("es-ES",{maximumFractionDigits:1})}% · Transporte ${money(state.transport)}`;
 stats.innerHTML=[
 ["Ventas",money(g.sale),`${g.withOrder} clientes con pedido`],["Compra",money(g.cost),`${consolidate().length} productos`],
 ["Cobrado",money(g.paid),`Pendiente ${money(g.pending)}`],["Entregados",`${g.delivered}/${g.withOrder}`,`${Math.round(g.delivered/Math.max(1,g.withOrder)*100)}% de la ruta`]
 ].map(x=>`<article class="stat"><label>${x[0]}</label><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join("");
 const pct=Math.round(g.delivered/Math.max(1,g.withOrder)*100);
 routeProgress.innerHTML=`<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><div class="progress-labels"><span>${g.delivered} entregados</span><b>${pct}%</b><span>${Math.max(0,g.withOrder-g.delivered)} pendientes</span></div>`;
 const missing=consolidate().filter(x=>(state.purchase[x.key]?.status||"pending")==="missing").length;
 const unpaid=state.clients.filter(c=>totalsForClient(c.id).pending>0).length;
 alerts.innerHTML=[
 missing?["⚠️",`${missing} productos faltantes`,"Revisa la compra consolidada"]:null,
 unpaid?["💶",`${unpaid} clientes pendientes de pago`,money(g.pending)]:null,
 !state.clients.length?["👥","Aún no hay clientes","Añade el primer cliente"]:null
 ].filter(Boolean).map(a=>`<div class="alert"><span>${a[0]}</span><div><b>${a[1]}</b><small>${a[2]}</small></div></div>`).join("")||`<div class="alert"><span>✓</span><div><b>Todo bajo control</b><small>No hay alertas importantes</small></div></div>`;
}
function renderOrders(){
 clientSelect.innerHTML=state.clients.map(c=>`<option value="${c.id}" ${c.id===selectedClient?"selected":""}>${esc(c.name)}</option>`).join("");
 const c=client(selectedClient);if(!c){orderEditor.innerHTML=`<div class="empty">Añade un cliente para comenzar.</div>`;return}
 const t=totalsForClient(c.id);
 orderEditor.innerHTML=`<article class="order-card">
 <div class="section-head"><div><h3>${esc(c.name)}</h3><p>${esc(c.address||"Sin dirección")} · ${esc(c.phone||"Sin teléfono")}</p></div><button class="secondary" onclick="editClient('${c.id}')">Editar</button></div>
 <div class="order-toolbar"><input id="newProduct" placeholder="Producto"><input id="newQty" inputmode="decimal" placeholder="Cant."><select id="newUnit"><option>CAJA</option><option>KG</option><option>UD</option><option>MANOJO</option></select><input id="newSale" inputmode="decimal" placeholder="Venta €"><button class="primary" onclick="addLine('${c.id}')">Añadir</button></div>
 <div class="order-lines">${lines(c.id).map(l=>`<div class="order-line">
 <input value="${esc(l.product)}" onchange="patchLine('${c.id}','${l.id}','product',this.value)">
 <input value="${qty(l.quantity)}" inputmode="decimal" onchange="patchLine('${c.id}','${l.id}','quantity',this.value)">
 <select class="unit" onchange="patchLine('${c.id}','${l.id}','unit',this.value)">${["CAJA","KG","UD","MANOJO"].map(u=>`<option ${u===l.unit?"selected":""}>${u}</option>`).join("")}</select>
 <input class="cost" value="${qty(l.cost)}" inputmode="decimal" title="Precio compra" placeholder="Compra" onchange="patchLine('${c.id}','${l.id}','cost',this.value)">
 <input class="sale" value="${qty(l.sale)}" inputmode="decimal" title="Precio venta" placeholder="Venta" onchange="patchLine('${c.id}','${l.id}','sale',this.value)">
 <button onclick="deleteLine('${c.id}','${l.id}')">×</button></div>`).join("")||`<div class="empty">Sin productos. Añade el primero arriba.</div>`}</div>
 <div class="order-footer"><div><span class="muted">Coste ${money(t.cost)} · Beneficio ${money(t.profit)}</span><div class="big-total">${money(t.sale)}</div></div><div class="button-row"><button class="secondary" onclick="copyClient('${c.id}')">Copiar</button><button class="primary" onclick="shareClient('${c.id}')">WhatsApp</button></div></div></article>`;
}
function renderPurchase(){
 const data=consolidate().filter(x=>purchaseFilter==="all"||(state.purchase[x.key]?.status||"pending")===purchaseFilter);
 purchaseList.innerHTML=data.map(x=>{const p=state.purchase[x.key]||{};return `<article class="purchase-card"><div class="card-top"><div><h3>${esc(x.product)}</h3><div class="muted">${qty(x.quantity)} ${x.unit} · ${x.clients.length} clientes</div></div><span class="pill">${money(x.cost)} estimado</span></div>
 <div class="purchase-grid"><label>Comprar<input value="${qty(p.bought??x.quantity)}" inputmode="decimal" onchange="patchPurchase('${x.key}','bought',this.value)"></label><label>Precio real<input value="${qty(p.realCost)}" inputmode="decimal" onchange="patchPurchase('${x.key}','realCost',this.value)"></label><label>Proveedor<input value="${esc(p.provider||"")}" onchange="patchPurchase('${x.key}','provider',this.value)"></label><label>Estado<select onchange="patchPurchase('${x.key}','status',this.value)"><option value="pending" ${(!p.status||p.status==="pending")?"selected":""}>Pendiente</option><option value="bought" ${p.status==="bought"?"selected":""}>Comprado</option><option value="external" ${p.status==="external"?"selected":""}>Externo</option><option value="missing" ${p.status==="missing"?"selected":""}>Faltante</option></select></label><label>Notas<input value="${esc(p.note||"")}" onchange="patchPurchase('${x.key}','note',this.value)"></label></div></article>`}).join("")||`<div class="empty">No hay productos en este filtro.</div>`;
}
function renderRoute(){
 const ordered=[...state.clients].filter(c=>lines(c.id).length).sort((a,b)=>(a.routeOrder??999)-(b.routeOrder??999));
 routeList.innerHTML=ordered.map((c,i)=>{const t=totalsForClient(c.id);return `<article class="route-card"><div class="card-top"><div><span class="pill">PARADA ${i+1}</span><h3 style="margin-top:8px">${esc(c.name)}</h3><div class="muted">${esc(c.address||"Sin dirección")} · ${lines(c.id).length} líneas</div></div><div style="text-align:right"><b>${money(t.sale)}</b><div class="muted">Pend. ${money(t.pending)}</div></div></div>
 <div class="route-actions"><button onclick="moveClient('${c.id}',-1)">↑ Subir</button><button onclick="moveClient('${c.id}',1)">↓ Bajar</button><button onclick="openMap('${esc(c.address)}')">Mapa</button><button onclick="setStatus('${c.id}','loaded')" class="${c.status==="loaded"?"active":""}">Cargado</button><button onclick="setStatus('${c.id}','delivered')" class="${c.status==="delivered"?"active":""}">Entregado</button><button onclick="markPaid('${c.id}')">Cobrado</button></div></article>`}).join("")||`<div class="empty">No hay pedidos para repartir.</div>`;
}
function renderReports(){
 const g=globalTotals();reportSummary.innerHTML=`<div class="report-cards">${[["Facturación",g.sale],["Coste mercancía",g.cost],["Transporte",state.transport],["Beneficio neto",g.profit]].map(x=>`<article class="stat"><label>${x[0]}</label><strong>${money(x[1])}</strong></article>`).join("")}</div>`;
 clientProfitTable.innerHTML=state.clients.map(c=>({c,...totalsForClient(c.id)})).filter(x=>x.sale).sort((a,b)=>b.profit-a.profit).map(x=>`<tr><td>${esc(x.c.name)}</td><td>${money(x.sale)}</td><td>${money(x.cost)}</td><td><b>${money(x.profit)}</b></td><td>${x.margin.toLocaleString("es-ES",{maximumFractionDigits:1})}%</td></tr>`).join("");
 productProfitTable.innerHTML=consolidate().map(x=>`<tr><td>${esc(x.product)}</td><td>${qty(x.quantity)} ${x.unit}</td><td>${money(x.sale)}</td><td>${money(x.cost)}</td><td><b>${money(x.sale-x.cost)}</b></td></tr>`).join("");
}
function renderSettings(){dateInput.value=state.date;transportInput.value=qty(state.transport);businessInput.value=state.business;phoneInput.value=state.phone}

window.addLine=cid=>{const product=newProduct.value.trim();if(!product)return alert("Escribe el producto.");lines(cid).push({id:id(),product,quantity:num(newQty.value)||1,unit:newUnit.value,cost:0,sale:num(newSale.value)});save()};
window.patchLine=(cid,lid,k,v)=>{const l=lines(cid).find(x=>x.id===lid);l[k]=["quantity","cost","sale"].includes(k)?num(v):v;save()};
window.deleteLine=(cid,lid)=>{state.orders[cid]=lines(cid).filter(x=>x.id!==lid);save()};
window.patchPurchase=(key,k,v)=>{state.purchase[key]||={};state.purchase[key][k]=["bought","realCost"].includes(k)?num(v):v;save()};
window.setStatus=(cid,s)=>{client(cid).status=s;save()};
window.markPaid=cid=>{state.payments[cid]={paid:totalsForClient(cid).sale};save()};
window.openMap=a=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(a),"_blank");
window.moveClient=(cid,dir)=>{const list=state.clients.filter(c=>lines(c.id).length).sort((a,b)=>(a.routeOrder??999)-(b.routeOrder??999));const i=list.findIndex(c=>c.id===cid),j=i+dir;if(j<0||j>=list.length)return;[list[i].routeOrder,list[j].routeOrder]=[list[j].routeOrder??j,list[i].routeOrder??i];save()};
function clientText(cid){const c=client(cid),t=totalsForClient(cid);return `PEDIDO ${c.name}\n${lines(cid).map(l=>`${qty(l.quantity)} ${l.unit} ${l.product} · ${money(num(l.quantity)*num(l.sale))}`).join("\n")}\n\nTOTAL: ${money(t.sale)}`;}
window.copyClient=cid=>copy(clientText(cid));window.shareClient=cid=>share(clientText(cid));
function providerText(){return `COMPRA RUTA MADRID · ${state.date}\n\n${consolidate().map(x=>`${qty(x.quantity)} ${x.unit} ${x.product}`).join("\n")}`;}
function routeText(){return `RUTA MADRID · ${state.date}\n\n${state.clients.filter(c=>lines(c.id).length).map((c,i)=>`${i+1}. ${c.name} · ${money(totalsForClient(c.id).sale)} · ${c.status||"pendiente"}`).join("\n")}`;}
async function copy(t){try{await navigator.clipboard.writeText(t);alert("Texto copiado.")}catch{prompt("Copia el texto:",t)}}
function share(t){navigator.share?navigator.share({text:t}).catch(()=>{}):window.open("https://wa.me/?text="+encodeURIComponent(t),"_blank")}

function openClient(c=null){editClientId.value=c?.id||"";clientName.value=c?.name||"";clientPhone.value=c?.phone||"";clientAddress.value=c?.address||"";clientNotes.value=c?.notes||"";clientDialog.showModal()}
window.editClient=cid=>openClient(client(cid));
saveClientBtn.onclick=e=>{e.preventDefault();if(!clientName.value.trim())return;const existing=client(editClientId.value);if(existing)Object.assign(existing,{name:clientName.value.trim(),phone:clientPhone.value,address:clientAddress.value,notes:clientNotes.value});else{const c={id:id(),name:clientName.value.trim(),phone:clientPhone.value,address:clientAddress.value,notes:clientNotes.value,status:"pending",routeOrder:state.clients.length};state.clients.push(c);selectedClient=c.id}clientDialog.close();save()};

$$("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
$$("[data-action]").forEach(b=>b.onclick=()=>{if(b.dataset.action==="copy-provider")copy(providerText());if(b.dataset.action==="share-route")share(routeText());if(b.dataset.action==="print")window.print()});
addClientBtn.onclick=()=>openClient();clientSelect.onchange=e=>{selectedClient=e.target.value;renderOrders()};
clientSearch.oninput=e=>{const q=e.target.value.toLowerCase();[...clientSelect.options].forEach(o=>o.hidden=!o.text.toLowerCase().includes(q))};
$$("[data-purchase-filter]").forEach(b=>b.onclick=()=>{$$("[data-purchase-filter]").forEach(x=>x.classList.remove("active"));b.classList.add("active");purchaseFilter=b.dataset.purchaseFilter;renderPurchase()});
themeBtn.onclick=()=>{state.theme=state.theme==="dark"?"light":"dark";save()};
dateInput.onchange=e=>{state.date=e.target.value;save()};transportInput.onchange=e=>{state.transport=num(e.target.value);save()};businessInput.onchange=e=>{state.business=e.target.value;save(false)};phoneInput.onchange=e=>{state.phone=e.target.value;save(false)};
function exportData(){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}));a.download=`ruta-madrid-${state.date}.json`;a.click();URL.revokeObjectURL(a.href)}
backupBtn.onclick=exportData;exportBtn.onclick=exportData;importBtn.onclick=()=>fileInput.click();
fileInput.onchange=async e=>{try{state={...defaults(),...JSON.parse(await e.target.files[0].text())};selectedClient=state.clients[0]?.id||null;save();alert("Copia restaurada.")}catch{alert("Archivo no válido.")}};
importOldBtn.onclick=()=>{try{const old=JSON.parse(localStorage.getItem(OLD_KEY));if(!old)return alert("No se encontraron datos antiguos en este navegador.");old.clients?.forEach((oc,i)=>{const c={id:oc.id||id(),name:oc.name||"CLIENTE",phone:oc.phone||"",address:oc.address||"",notes:oc.note||"",status:"pending",routeOrder:i};state.clients.push(c);state.orders[c.id]=(old.orders?.[oc.id]||[]).map(l=>({id:id(),product:l.product,quantity:num(l.qty),unit:l.unit||"CAJA",cost:0,sale:0}))});selectedClient=state.clients[0]?.id||null;save();alert("Clientes y pedidos importados. Falta añadir los precios.")}catch{alert("No se pudo importar.")}};
resetBtn.onclick=()=>{if(confirm("¿Seguro que quieres borrar todos los datos?")){state=defaults();selectedClient=null;save()}};
if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});
renderAll();