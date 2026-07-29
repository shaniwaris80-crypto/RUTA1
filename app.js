
import { firebaseConfig, workspaceId } from "./firebase-config.js";
import { SEED } from "./seed-data.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getDatabase, ref, onValue, get, set, update, push, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
setPersistence(auth, browserLocalPersistence).catch(console.error);

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const workspacePath = `workspaces/${workspaceId}`;
const routePath = `${workspacePath}/activeRoute`;
const catalogPath = `${workspacePath}/catalog`;

const defaultRoute = () => ({
  id: new Date().toISOString().slice(0,10),
  date: new Date().toISOString().slice(0,10),
  orders: {},
  status: {},
  purchasedQty: {},
  loaded: {},
  delivered: {},
  finalDelivered: {},
  extraPurchase: {},
  stockRemaining: {},
  notes: {},
  whatsappImports: {},
  deadline: null,
  createdAt: Date.now()
});

let state = {
  catalog: { clients: {}, products: {} },
  route: defaultRoute(),
  metadata: {}
};
let selectedClientId = "";
let productSearch = "";
let productCategory = "Todos";
let currentView = "home";
let unsubscribeWorkspace = null;
let toastTimer = null;
let saveState = "saved";
let undoAction = null;
let deliveryHideCompleted = false;
let reportMode = "final";
let pendingReminderInterval = null;

function esc(value="") {
  return String(value).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function num(value) {
  return Number(String(value ?? 0).replace(",", ".")) || 0;
}
function fmt(value) {
  return num(value).toLocaleString("es-ES", { maximumFractionDigits: 2 });
}
function renderSaveState() {
  const host = document.querySelector(".topbar > div");
  if (!host) return;
  let el = document.getElementById("saveState");
  if (!el) {
    el = document.createElement("span");
    el.id = "saveState";
    host.appendChild(el);
  }
  const map = {
    saved: ["Guardado", "saved"],
    saving: ["Guardando…", "saving"],
    error: ["Error al guardar", "error"]
  };
  const [text, cls] = map[saveState] || map.saved;
  el.textContent = "● " + text;
  el.className = "save-state " + cls;
}
function setSaveState(value) {
  saveState = value;
  renderSaveState();
  if (!pendingReminderInterval) {
    pendingReminderInterval = setInterval(updateDeadlineCountdown, 60000);
  }
}
function cloud(text, mode="offline") {
  const el = $("#cloudStatus");
  el.textContent = `● ${text}`;
  el.className = `cloud ${mode}`;
}
function setUndo(message, fn) {
  undoAction = fn;
  let bar = document.getElementById("undoBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "undoBar";
    bar.className = "undo-bar";
    bar.innerHTML = '<span id="undoText"></span><button id="undoButton" class="btn soft small">Deshacer</button>';
    document.body.appendChild(bar);
    document.getElementById("undoButton").addEventListener("click", async () => {
      const action = undoAction;
      undoAction = null;
      bar.classList.remove("show");
      if (action) await action();
    });
  }
  document.getElementById("undoText").textContent = message;
  bar.classList.add("show");
  setTimeout(() => {
    if (undoAction === fn) {
      undoAction = null;
      bar.classList.remove("show");
    }
  }, 5000);
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}
function clients() {
  return Object.values(state.catalog.clients || {})
    .filter((c) => c.active !== false)
    .sort((a,b) => num(a.routeOrder) - num(b.routeOrder) || a.name.localeCompare(b.name, "es"));
}
function products() {
  return Object.values(state.catalog.products || {})
    .filter((p) => p.active !== false)
    .sort((a,b) => a.name.localeCompare(b.name, "es"));
}
function routeOrders() { return state.route.orders || {}; }
function clientOrder(clientId) { return routeOrders()[clientId] || {}; }
function orderLines(clientId) {
  return Object.entries(clientOrder(clientId))
    .filter(([,q]) => num(q) > 0)
    .map(([productId,q]) => ({ product: state.catalog.products?.[productId], qty: num(q) }))
    .filter((x) => x.product);
}
function totals() {
  const map = {};
  for (const client of clients()) {
    for (const line of orderLines(client.id)) {
      if (!map[line.product.id]) map[line.product.id] = { product: line.product, qty: 0, clients: [] };
      map[line.product.id].qty += line.qty;
      map[line.product.id].clients.push({ client, qty: line.qty });
    }
  }
  return Object.values(map).sort((a,b) => a.product.name.localeCompare(b.product.name, "es"));
}
function finalKey(clientId, productId) { return `${clientId}__${productId}`; }
function finalQty(clientId, productId) {
  const key = finalKey(clientId, productId);
  const finalMap = state.route.finalDelivered || {};
  return finalMap[key] === undefined ? num(clientOrder(clientId)[productId]) : num(finalMap[key]);
}
function setView(view) {
  currentView = view;
  $$(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${view}`));
  $$(".nav").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  render();
}
function openModal(title, body) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = body;
  $("#modal").classList.add("open");
  $("#modal").setAttribute("aria-hidden","false");
}
function closeModal() {
  $("#modal").classList.remove("open");
  $("#modal").setAttribute("aria-hidden","true");
}
async function ensureSeedData() {
  const snap = await get(ref(db, workspacePath));
  const remote = snap.val() || {};
  const updates = {};

  if (!remote.catalog?.clients || Object.keys(remote.catalog.clients).length === 0) {
    updates[`${catalogPath}/clients`] = SEED.clients;
  }
  if (!remote.catalog?.products || Object.keys(remote.catalog.products).length === 0) {
    updates[`${catalogPath}/products`] = SEED.products;
  }
  if (!remote.activeRoute) {
    updates[routePath] = defaultRoute();
  }
  if (Object.keys(updates).length) await update(ref(db), updates);
}
function subscribeWorkspace() {
  if (unsubscribeWorkspace) unsubscribeWorkspace();
  cloud("Conectando", "sync");
  unsubscribeWorkspace = onValue(ref(db, workspacePath), (snapshot) => {
    const remote = snapshot.val() || {};
    state.catalog = remote.catalog || { clients:{}, products:{} };
    state.route = remote.activeRoute || defaultRoute();
    state.metadata = remote.metadata || {};
    state.habitualOrders = remote.habitualOrders || {};
    if (!selectedClientId || !state.catalog.clients?.[selectedClientId]) {
      selectedClientId = clients()[0]?.id || "";
    }
    localStorage.setItem("rutaMadridV12Backup", JSON.stringify(state));
    cloud("Sincronizado", "online");
    render();
  }, (error) => {
    console.error(error);
    cloud("Sin permiso o sin conexión", "offline");
    const backup = JSON.parse(localStorage.getItem("rutaMadridV12Backup") || "null");
    if (backup) { state = backup; render(); }
  });
}
async function write(path, value, successMessage="Guardado") {
  cloud("Sincronizando", "sync");
  setSaveState("saving");
  try {
    await set(ref(db, `${workspacePath}/${path}`), value);
    cloud("Sincronizado", "online");
    setSaveState("saved");
    if (successMessage) toast(successMessage);
  } catch (error) {
    console.error(error);
    cloud("Error al guardar", "offline");
    setSaveState("error");
    toast("No se pudo guardar");
  }
}
async function patch(values, successMessage="Guardado") {
  cloud("Sincronizando", "sync");
  setSaveState("saving");
  try {
    await update(ref(db, workspacePath), values);
    cloud("Sincronizado", "online");
    setSaveState("saved");
    if (successMessage) toast(successMessage);
  } catch (error) {
    console.error(error);
    cloud("Error al guardar", "offline");
    setSaveState("error");
    toast("No se pudo guardar");
  }
}


function nextThursdayDeadline(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  let add = (4 - day + 7) % 7;
  if (add === 0 && (d.getHours() > 23 || (d.getHours() === 23 && d.getMinutes() > 0))) add = 7;
  const target = new Date(d);
  target.setDate(d.getDate() + add);
  target.setHours(23,0,0,0);
  return target;
}
function routeDeadline() {
  const saved = state.route.deadline;
  if (saved) return new Date(saved);
  return nextThursdayDeadline(new Date((state.route.date || new Date().toISOString().slice(0,10)) + "T12:00:00"));
}
function deadlineStatus() {
  const now = new Date();
  const deadline = routeDeadline();
  const ms = deadline - now;
  const pending = clients().filter(c => !["done","skip"].includes(state.route.status?.[c.id]));
  return { now, deadline, ms, pending };
}
function formatCountdown(ms) {
  if (ms <= 0) return "Plazo terminado";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  return `${days ? days + " d " : ""}${hours} h ${mins} min`;
}
function normalizeText(value="") {
  return String(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function similarity(a,b) {
  a = normalizeText(a); b = normalizeText(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length,b.length)/Math.max(a.length,b.length) + 0.25;
  const at = new Set(a.split(" ")), bt = new Set(b.split(" "));
  const inter = [...at].filter(x=>bt.has(x)).length;
  const union = new Set([...at,...bt]).size || 1;
  return inter/union;
}
function productAliases(product) {
  const aliases = [product.name];
  const manual = {
    "MACHO MADURO":["PLATANO MACHO MADURO","MADURO","PLATANO MADURO"],
    "MACHO VERDE":["PLATANO MACHO VERDE","VERDE","PLATANO VERDE"],
    "AGUACATE GRANEL":["AVOCADO","AGUACATE"],
    "MANGO MINGOLO":["MINGOLO","MANGO MINGOLO"],
    "MANGO AZÚCAR":["MANGO AZUCAR","AZUCAR"],
    "CILANTRO":["CILANTROS"],
    "ÑAME":["YAME"],
    "YAUTÍA":["YAUTIA"],
    "MARACUYÁ":["MARACUYA"],
    "GUANÁBANA":["GUANABANA"],
    "LIMÓN":["LIMON"],
    "MAÍZ MAZORCA":["MAIZ MAZORCA"],
    "MAÍZ MOROCHO":["MAIZ MOROCHO"]
  };
  for (const [key,vals] of Object.entries(manual)) {
    if (normalizeText(product.name) === normalizeText(key)) aliases.push(...vals);
  }
  return aliases;
}
function matchProductName(rawName) {
  let best = null;
  for (const product of products()) {
    for (const alias of productAliases(product)) {
      const score = similarity(rawName, alias);
      if (!best || score > best.score) best = { product, score, alias };
    }
  }
  return best && best.score >= 0.34 ? best : null;
}
function parseWhatsAppText(text) {
  const rows = [];
  const lines = String(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);
  for (const original of lines) {
    const cleaned = original.replace(/[•\-–—]/g," ").trim();
    let qtyMatch = cleaned.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:CAJAS?|CJ|KG|KILOS?|UDS?|UNIDADES?|MANOJOS?|SACOS?)?\s*$/i);
    if (!qtyMatch) qtyMatch = cleaned.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
    let quantity = 0;
    let productText = cleaned;
    if (qtyMatch) {
      if (qtyMatch.index === 0 && qtyMatch[2]) {
        quantity = num(qtyMatch[1]);
        productText = qtyMatch[2];
      } else {
        quantity = num(qtyMatch[1]);
        productText = cleaned.slice(0, qtyMatch.index).trim();
      }
    } else {
      const endNum = cleaned.match(/(.+?)\s+(\d+(?:[.,]\d+)?)$/);
      if (endNum) {
        productText = endNum[1];
        quantity = num(endNum[2]);
      }
    }
    if (!quantity || !productText) continue;
    const match = matchProductName(productText);
    rows.push({
      original,
      quantity,
      productText,
      productId: match?.product?.id || "",
      productName: match?.product?.name || "",
      unit: match?.product?.unit || "",
      confidence: match?.score || 0
    });
  }
  return rows;
}
function pendingClientsText() {
  const {deadline,pending} = deadlineStatus();
  return `PEDIDOS PENDIENTES MADRID\nLímite: ${deadline.toLocaleString("es-ES")}\n\n` +
    pending.map((c,i)=>`${i+1}. ${c.name}`).join("\n");
}
function updateDeadlineCountdown() {
  const el = document.getElementById("deadlineCountdown");
  if (!el) return;
  el.textContent = formatCountdown(deadlineStatus().ms);
}

function render() {
  $("#routeDate").textContent = new Date((state.route.date || new Date().toISOString().slice(0,10)) + "T12:00")
    .toLocaleDateString("es-ES", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
  renderHome();
  renderClients();
  renderOrders();
  renderBuy();
  renderLoad();
  renderDelivery();
  renderSaveState();
}
function renderHome() {
  const allClients = clients();
  const completed = allClients.filter((c) => state.route.status?.[c.id] === "done").length;
  const pending = allClients.length - completed;
  const totalProducts = totals().length;
  $("#view-home").innerHTML = `
    <article class="card hero">
      <h2>Ruta actual</h2>
      <div class="stats">
        <div class="stat"><b>${allClients.length}</b><span>Clientes</span></div>
        <div class="stat"><b>${completed}</b><span>Pedidos hechos</span></div>
        <div class="stat"><b>${pending}</b><span>Pendientes</span></div>
        <div class="stat"><b>${totalProducts}</b><span>Productos pedidos</span></div>
      </div>
      <div class="actions">
        <button class="btn primary" data-action="go-orders">Tomar pedidos</button>
        <button class="btn soft" data-action="new-route">Nueva semana/ruta</button>
      </div>
    </article>
    <article class="card">
      <div class="section-title"><h2>Seguridad y datos</h2></div>
      <div class="toolbar-row">
        <button class="btn soft small" data-action="export-backup">Exportar copia</button>
        <button class="btn soft small" data-action="import-backup">Restaurar copia</button>
        <button class="btn soft small" data-action="show-history">Historial de rutas</button>
      </div>
    </article>
    <article class="card deadline-card ${deadlineStatus().ms <= 0 ? "closed" : deadlineStatus().pending.length ? "" : "ok"}">
      <div class="section-title">
        <div>
          <h2>Plazo de pedidos</h2>
          <div class="muted">Jueves hasta las 23:00</div>
        </div>
        <button class="btn soft small" data-action="pending-orders">Ver pendientes</button>
      </div>
      <div id="deadlineCountdown" class="deadline-countdown">${formatCountdown(deadlineStatus().ms)}</div>
      <div class="muted">${deadlineStatus().pending.length} clientes faltan por confirmar</div>
      <div class="toolbar-row" style="margin-top:8px">
        <button class="btn soft small" data-action="copy-pending">Copiar aviso</button>
        <button class="btn dark small" data-action="share-pending">WhatsApp</button>
      </div>
    </article>
    <article class="card">
      <div class="section-title"><h2>Catálogo guardado</h2></div>
      <div class="line"><div><b>${allClients.length} clientes</b><div class="muted">Se conservan al limpiar la ruta</div></div></div>
      <div class="line"><div><b>${products().length} productos</b><div class="muted">Se conservan al limpiar la ruta</div></div></div>
    </article>`;
}
function clientCard(client) {
  const lines = orderLines(client.id).length;
  const status = state.route.status?.[client.id] || "pending";
  const done = status === "done";
  const skipped = status === "skip";
  return `<div class="client">
    <div class="num">${fmt(client.routeOrder)}</div>
    <div class="grow">
      <b>${esc(client.name)}</b>
      <div><span class="badge ${done ? "done" : skipped ? "status-skip" : ""}">${done ? "Pedido guardado" : skipped ? "No pide" : "Pendiente"}</span> <span class="badge">${lines} productos</span></div>
    </div>
    <button class="btn primary small" data-open-client="${client.id}">Abrir</button>
    <button class="btn soft small" data-edit-client="${client.id}">Editar</button>
    <button class="btn soft small" data-no-order="${client.id}">No pide</button>
    <button class="btn danger small" data-archive-client="${client.id}">Archivar</button>
  </div>`;
}
function renderClients(filter="") {
  const q = filter.trim().toUpperCase();
  const list = clients().filter((c) => !q || c.name.includes(q));
  $("#view-clients").innerHTML = `
    <article class="card">
      <div class="section-title">
        <div><h2>Clientes</h2><div class="muted">Sincronizados con Firebase</div></div>
        <button class="btn primary small" data-action="add-client">+ Cliente</button>
      </div>
      <input id="clientSearch" class="search" placeholder="Buscar cliente" value="${esc(filter)}">
      <div id="clientGrid" class="grid" style="margin-top:10px">${list.map(clientCard).join("") || '<div class="muted">Sin resultados</div>'}</div>
    </article>`;
}
function filteredProducts() {
  return products().filter((p) =>
    (!productSearch || p.name.toUpperCase().includes(productSearch.toUpperCase())) &&
    (productCategory === "Todos" || p.category === productCategory)
  );
}
function productRow(clientId, product) {
  const value = num(clientOrder(clientId)[product.id]);
  return `<div class="product">
    <div class="product-top">
      <div class="product-name">${esc(product.name)}<div class="muted">${esc(product.unit)} · ${esc(product.category)}</div></div>
      <div class="qty">
        <button data-qty-minus="${clientId}|${product.id}">−</button>
        <input data-qty-input="${clientId}|${product.id}" inputmode="decimal" value="${value || ""}">
        <button data-qty-plus="${clientId}|${product.id}">+</button>
      </div>
    </div>
  </div>`;
}
function renderOrders() {
  const allClients = clients();
  if (!selectedClientId || !state.catalog.clients?.[selectedClientId]) selectedClientId = allClients[0]?.id || "";
  const client = state.catalog.clients?.[selectedClientId];
  if (!client) {
    $("#view-orders").innerHTML = '<article class="card"><div class="muted">No hay clientes.</div></article>';
    return;
  }
  const categories = ["Todos", ...new Set(products().map((p) => p.category))];
  const productList = filteredProducts();
  $("#view-orders").innerHTML = `
    <div class="split-layout">
      <aside class="card split-clients">
        <div class="section-title"><h2>Clientes</h2></div>
        <div class="compact-grid">${allClients.map(clientCard).join("")}</div>
      </aside>
      <div>
        <article class="card">
          <div class="section-title">
            <div><h2>Tomar pedido</h2><div class="muted">Guardado automático en Firebase</div></div>
            <button class="btn soft small" data-action="add-product">+ Producto</button>
          </div>
          <select id="clientSelector" class="search">
            ${allClients.map((c) => `<option value="${c.id}" ${c.id === selectedClientId ? "selected" : ""}>${fmt(c.routeOrder)}. ${esc(c.name)}</option>`).join("")}
          </select>
          <div class="toolbar-row" style="margin-top:8px">
            <button class="btn soft small" data-repeat-order="${client.id}">Repetir último</button>
            <button class="btn soft small" data-save-habitual="${client.id}">Guardar habitual</button>
            <button class="btn soft small" data-load-habitual="${client.id}">Cargar habitual</button>
            <button class="btn dark small" data-whatsapp-import="${client.id}">Pegar WhatsApp</button>
          </div>
          <input id="productSearch" class="search" style="margin-top:8px" placeholder="Buscar producto" value="${esc(productSearch)}">
          <div class="tabs">
            ${categories.map((cat) => `<button class="btn ${cat === productCategory ? "dark" : "soft"} small" data-category="${esc(cat)}">${esc(cat)}</button>`).join("")}
          </div>
        </article>
        <article class="card">
          <div class="section-title">
            <div><h2>${esc(client.name)}</h2><div class="muted">${orderLines(client.id).length} productos añadidos</div></div>
            <button class="btn primary small" data-confirm-client="${client.id}">Guardar y cerrar</button>
          </div>
          <div id="productList" class="product-list">${productList.map((p) => productRow(client.id,p)).join("") || '<div class="muted">Sin resultados</div>'}</div>
        </article>
      </div>
    </div>`;
}
function renderBuy() {
  const list = totals();
  $("#view-buy").innerHTML = `
    <article class="card">
      <div class="section-title">
        <div><h2>Compra real y stock</h2><div class="muted">Pedido + extra = compra prevista</div></div>
        <button class="btn soft small" data-action="copy-buy">Copiar compra</button>
      </div>
    </article>
    <article class="card">
      ${list.map((item) => {
        const extra = num(state.route.extraPurchase?.[item.product.id]);
        const expected = item.qty + extra;
        const bought = state.route.purchasedQty?.[item.product.id] === undefined ? expected : num(state.route.purchasedQty[item.product.id]);
        const delivered = clients().reduce((sum,c) => sum + finalQty(c.id,item.product.id), 0);
        const stock = bought - delivered;
        return `<div class="line">
          <div>
            <b>${esc(item.product.name)}</b>
            <div class="muted">Clientes ${fmt(item.qty)} · Extra ${fmt(extra)} · Previsto ${fmt(expected)} ${esc(item.product.unit)}</div>
            <div class="${stock < 0 ? "stock-bad" : stock > 0 ? "stock-good" : "stock-neutral"}">
              ${stock === 0 ? "Sin sobrante" : stock > 0 ? `Stock restante ${fmt(stock)}` : `Faltan ${fmt(Math.abs(stock))}`}
            </div>
          </div>
          <div class="right">
            <label class="muted">Extra</label>
            <input class="field" style="width:86px;text-align:center" data-extra-input="${item.product.id}" inputmode="decimal" value="${fmt(extra)}">
            <label class="muted">Comprado</label>
            <input class="field" style="width:86px;text-align:center" data-bought-input="${item.product.id}" inputmode="decimal" value="${fmt(bought)}">
            <button class="btn soft small" data-allocate-product="${item.product.id}">Repartir</button>
          </div>
        </div>`;
      }).join("") || '<div class="muted">Todavía no hay pedidos.</div>'}
    </article>`;
}
function renderLoad() {
  const list = totals();
  const pending = list.filter((x) => !state.route.loaded?.[x.product.id]);
  const done = list.filter((x) => state.route.loaded?.[x.product.id]);
  const pct = list.length ? Math.round(done.length / list.length * 100) : 0;
  $("#view-load").innerHTML = `
    <article class="card">
      <div class="section-title"><h2>Carga de furgoneta</h2><button class="btn soft small" data-action="reset-load">Reiniciar</button></div>
      <div class="progress"><span style="width:${pct}%"></span></div><div class="muted" style="margin-top:6px">${done.length}/${list.length} cargados</div>
    </article>
    <article class="card">
      ${[...pending,...done].map((item) => {
        const checked = !!state.route.loaded?.[item.product.id];
        const bought = state.route.purchasedQty?.[item.product.id] === undefined ? item.qty : num(state.route.purchasedQty[item.product.id]);
        return `<div class="delivery-item ${checked ? "checked" : ""}" data-toggle-load="${item.product.id}">
          <div class="check">${checked ? "✓" : ""}</div>
          <div><b class="item-name">${esc(item.product.name)}</b></div>
          <div class="right"><b>${fmt(bought)} ${esc(item.product.unit)}</b></div>
        </div>`;
      }).join("") || '<div class="muted">Sin compra.</div>'}
    </article>`;
}
function renderDelivery() {
  const routeClients = clients().filter((c) => orderLines(c.id).length);
  $("#view-delivery").innerHTML = `
    <article class="card">
      <div class="section-title"><h2>Reparto</h2><button class="btn primary small" data-action="final-report">Resumen final</button></div>
      <div class="toolbar-row"><button class="btn soft small" data-action="toggle-completed">${deliveryHideCompleted ? "Mostrar completados" : "Ocultar completados"}</button></div>
    </article>
    ${routeClients.map((client) => {
      const lines = orderLines(client.id).sort((a,b) => {
        const ak = !!state.route.delivered?.[finalKey(client.id,a.product.id)];
        const bk = !!state.route.delivered?.[finalKey(client.id,b.product.id)];
        return Number(ak) - Number(bk);
      });
      const clientComplete = lines.length && lines.every((line) => !!state.route.delivered?.[finalKey(client.id,line.product.id)]);
      if (deliveryHideCompleted && clientComplete) return "";
      return `<article class="card ${clientComplete ? "archived" : ""}">
        <div class="section-title"><h2>${fmt(client.routeOrder)}. ${esc(client.name)}</h2><button class="btn soft small" data-complete-client="${client.id}">Todo bajado</button></div>
        ${lines.map((line) => {
          const key = finalKey(client.id,line.product.id);
          const checked = !!state.route.delivered?.[key];
          return `<div class="delivery-item ${checked ? "checked" : ""}" data-toggle-delivery="${key}">
            <div class="check">${checked ? "✓" : ""}</div>
            <div><b class="item-name">${esc(line.product.name)}</b></div>
            <div class="right"><b>${fmt(finalQty(client.id,line.product.id))} ${esc(line.product.unit)}</b></div>
          </div>`;
        }).join("")}
      </article>`;
    }).join("") || '<article class="card"><div class="muted">Sin pedidos para repartir.</div></article>'}`;
}


function orderSummary(clientId) {
  const client = state.catalog.clients?.[clientId];
  const lines = orderLines(clientId);
  const boxes = lines.filter(x => x.product.unit === "CAJA").reduce((s,x)=>s+x.qty,0);
  const others = lines.filter(x => x.product.unit !== "CAJA").reduce((s,x)=>s+x.qty,0);
  return { client, lines, boxes, others };
}
function confirmClientModal(clientId) {
  const s = orderSummary(clientId);
  openModal("Confirmar pedido", `
    <article class="card">
      <h2>${esc(s.client.name)}</h2>
      <div class="summary-strip">
        <div class="summary-mini"><b>${s.lines.length}</b><span>Productos</span></div>
        <div class="summary-mini"><b>${fmt(s.boxes)}</b><span>Cajas</span></div>
        <div class="summary-mini"><b>${fmt(s.others)}</b><span>Otras unidades</span></div>
      </div>
      ${s.lines.map(x=>`<div class="line"><span>${esc(x.product.name)}</span><b>${fmt(x.qty)} ${esc(x.product.unit)}</b></div>`).join("") || '<div class="muted">Pedido vacío</div>'}
      <div class="actions">
        <button class="btn soft" data-action="close-modal">Seguir editando</button>
        <button class="btn primary" data-finish-client="${clientId}">Confirmar y cerrar</button>
      </div>
    </article>`);
}
async function saveHabitual(clientId) {
  await write(`habitualOrders/${clientId}`, clientOrder(clientId), "Pedido habitual guardado");
}
async function loadHabitual(clientId) {
  const habitual = state.metadata?.habitualOrders?.[clientId] || state.habitualOrders?.[clientId];
  const snap = await get(ref(db, `${workspacePath}/habitualOrders/${clientId}`));
  const data = snap.val();
  if (!data) return toast("No hay pedido habitual");
  await write(`activeRoute/orders/${clientId}`, data, "Pedido habitual cargado");
}
async function repeatLastOrder(clientId) {
  const snap = await get(ref(db, `${workspacePath}/routesArchive`));
  const archive = snap.val() || {};
  const routes = Object.values(archive).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const found = routes.find(r => r.orders?.[clientId] && Object.values(r.orders[clientId]).some(q=>num(q)>0));
  if (!found) return toast("No hay pedido anterior");
  await write(`activeRoute/orders/${clientId}`, found.orders[clientId], "Pedido anterior cargado");
}
async function setExtraPurchase(productId, value) {
  await write(`activeRoute/extraPurchase/${productId}`, Math.max(0,num(value)), "Extra actualizado");
}
async function archiveClient(clientId) {
  const before = state.catalog.clients?.[clientId];
  if (!before || !confirm(`¿Archivar a ${before.name}?`)) return;
  await write(`catalog/clients/${clientId}/active`, false, "Cliente archivado");
  setUndo("Cliente archivado", () => write(`catalog/clients/${clientId}/active`, true, "Cliente recuperado"));
}
async function exportBackup() {
  const snap = await get(ref(db, workspacePath));
  const payload = snap.val() || {};
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ruta-madrid-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Copia exportada");
}
async function importBackupFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed.catalog || !parsed.activeRoute) throw new Error("Copia no válida");
  if (!confirm("¿Restaurar esta copia completa?")) return;
  await set(ref(db, workspacePath), parsed);
  toast("Copia restaurada");
}
async function showHistoryModal() {
  const snap = await get(ref(db, `${workspacePath}/routesArchive`));
  const archive = snap.val() || {};
  const routes = Object.entries(archive).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  openModal("Historial de rutas", routes.map(([id,r])=>`
    <article class="card">
      <div class="section-title"><div><b>${esc(r.date || id)}</b><div class="muted">${Object.keys(r.orders||{}).length} clientes con pedido</div></div>
      <button class="btn soft small" data-restore-route="${id}">Restaurar</button></div>
    </article>`).join("") || '<div class="muted">No hay rutas archivadas</div>');
}
async function restoreRoute(id) {
  const snap = await get(ref(db, `${workspacePath}/routesArchive/${id}`));
  const route = snap.val();
  if (!route || !confirm("¿Restaurar esta ruta como activa?")) return;
  await write("activeRoute", route, "Ruta restaurada");
  closeModal();
}


async function markNoOrder(clientId) {
  await write(`activeRoute/status/${clientId}`, "skip", "Marcado como no pide");
  setUndo("Cliente marcado como no pide", () => write(`activeRoute/status/${clientId}`, null, "Estado restaurado"));
}
function pendingOrdersModal() {
  const {deadline,pending,ms} = deadlineStatus();
  openModal("Clientes pendientes", `
    <article class="card">
      <div class="muted">Límite</div>
      <b>${deadline.toLocaleString("es-ES")}</b>
      <div class="${ms <= 0 ? "status-bad" : "status-good"}">${formatCountdown(ms)}</div>
    </article>
    <div class="pending-list">
      ${pending.map(c=>`<div class="pending-item">
        <div class="grow"><b>${esc(c.name)}</b><div class="muted">Todavía sin pedido</div></div>
        <button class="btn primary small" data-open-client="${c.id}">Abrir</button>
        <button class="btn soft small" data-no-order="${c.id}">No pide</button>
      </div>`).join("") || '<div class="muted">Todos los clientes están confirmados.</div>'}
    </div>
  `);
}
function whatsappImportModal(clientId) {
  const client = state.catalog.clients?.[clientId];
  openModal("Importar pedido de WhatsApp", `
    <article class="card">
      <b>${esc(client?.name || "")}</b>
      <div class="muted">Pega el mensaje completo. Ejemplo: Mango 5, Cilantro 20, Yuca 2.</div>
    </article>
    <textarea id="whatsappPasteText" class="paste-box" placeholder="Pega aquí el pedido de WhatsApp"></textarea>
    <div class="actions">
      <button class="btn soft" data-action="parse-whatsapp" data-client="${clientId}">Reconocer productos</button>
      <button class="btn danger" data-action="clear-whatsapp">Limpiar</button>
    </div>
    <div id="parseResults" class="parse-result"></div>
  `);
  requestAnimationFrame(()=>document.getElementById("whatsappPasteText")?.focus());
}
function renderParsedRows(clientId, rows) {
  const host = document.getElementById("parseResults");
  if (!host) return;
  host.dataset.rows = JSON.stringify(rows);
  host.innerHTML = rows.map((row,index)=>`
    <div class="parse-line ${row.productId ? "" : "unmatched"}">
      <div>
        <b>${esc(row.original)}</b>
        <div class="muted">${row.productId ? esc(row.productName) : "No reconocido"}</div>
      </div>
      <div class="right">
        <span class="parse-confidence">${Math.round(row.confidence*100)}%</span>
        <input class="field" style="width:75px;text-align:center" data-parse-qty="${index}" value="${fmt(row.quantity)}">
        <select class="field" data-parse-product="${index}" style="max-width:240px">
          <option value="">Seleccionar producto</option>
          ${products().map(p=>`<option value="${p.id}" ${p.id===row.productId?"selected":""}>${esc(p.name)}</option>`).join("")}
        </select>
      </div>
    </div>`).join("") + `
    <button class="btn primary" style="width:100%;margin-top:10px" data-apply-whatsapp="${clientId}">Añadir al pedido</button>`;
}
async function applyWhatsappImport(clientId) {
  const host = document.getElementById("parseResults");
  if (!host) return;
  const baseRows = JSON.parse(host.dataset.rows || "[]");
  const values = {};
  let applied = 0;
  baseRows.forEach((row,index)=>{
    const productId = host.querySelector(`[data-parse-product="${index}"]`)?.value || "";
    const quantity = num(host.querySelector(`[data-parse-qty="${index}"]`)?.value);
    if (!productId || quantity <= 0) return;
    const current = num(clientOrder(clientId)[productId]);
    values[`activeRoute/orders/${clientId}/${productId}`] = current + quantity;
    applied++;
  });
  if (!applied) return toast("No hay líneas válidas");
  values[`activeRoute/whatsappImports/${Date.now()}`] = {
    clientId,
    importedAt: Date.now(),
    count: applied
  };
  await patch(values, `${applied} productos añadidos`);
  closeModal();
  selectedClientId = clientId;
  setView("orders");
}

async function updateOrderQty(clientId, productId, value) {
  const q = Math.max(0, num(value));
  const path = `activeRoute/orders/${clientId}/${productId}`;
  await write(path, q || null, "");
}
async function setBought(productId, value) {
  await write(`activeRoute/purchasedQty/${productId}`, Math.max(0,num(value)), "Compra actualizada");
}
async function toggleLoad(productId) {
  await write(`activeRoute/loaded/${productId}`, !state.route.loaded?.[productId], "");
}
async function toggleDelivery(key) {
  const previous = !!state.route.delivered?.[key];
  await write(`activeRoute/delivered/${key}`, !previous, "");
  setUndo(previous ? "Marca retirada" : "Producto descargado", () => write(`activeRoute/delivered/${key}`, previous, ""));
}
async function completeClientDelivery(clientId) {
  const values = {};
  for (const line of orderLines(clientId)) values[`activeRoute/delivered/${finalKey(clientId,line.product.id)}`] = true;
  await patch(values, "Cliente completado");
}
async function markClientDone(clientId) {
  await write(`activeRoute/status/${clientId}`, "done", "Pedido guardado");
}
async function createNewRoute() {
  if (!confirm("¿Crear una ruta nueva? Se archivará la actual y se limpiarán pedidos, compra, carga y reparto. Clientes y productos se conservarán.")) return;
  const archiveId = `${state.route.date || "ruta"}_${Date.now()}`;
  const values = {};
  values[`routesArchive/${archiveId}`] = state.route;
  values["activeRoute"] = defaultRoute();
  await patch(values, "Nueva ruta creada");
  setView("home");
}
function allocationModal(productId) {
  const item = totals().find((x) => x.product.id === productId);
  if (!item) return;
  const bought = state.route.purchasedQty?.[productId] === undefined ? item.qty : num(state.route.purchasedQty[productId]);
  const involved = clients().filter((c) => num(clientOrder(c.id)[productId]) > 0 || finalQty(c.id,productId) > 0);
  const allocated = involved.reduce((sum,c) => sum + finalQty(c.id,productId), 0);
  const remaining = bought - allocated;
  openModal("Reparto final del producto", `
    <article class="card">
      <b>${esc(item.product.name)}</b>
      <div class="muted">Pedido ${fmt(item.qty)} · Comprado ${fmt(bought)} · Repartido ${fmt(allocated)} ${esc(item.product.unit)}</div>
      <div class="${remaining < 0 ? "status-bad" : "status-good"}">${remaining === 0 ? "Reparto cuadrado" : remaining > 0 ? `Quedan ${fmt(remaining)} por repartir` : `Te has pasado ${fmt(Math.abs(remaining))}`}</div>
    </article>
    ${involved.map((c) => `<div class="line">
      <div><b>${esc(c.name)}</b><div class="muted">Pedido ${fmt(clientOrder(c.id)[productId] || 0)}</div></div>
      <div class="qty">
        <button data-final-minus="${c.id}|${productId}">−</button>
        <input data-final-input="${c.id}|${productId}" inputmode="decimal" value="${fmt(finalQty(c.id,productId))}">
        <button data-final-plus="${c.id}|${productId}">+</button>
      </div>
    </div>`).join("")}
  `);
}
async function setFinalQty(clientId, productId, value) {
  await write(`activeRoute/finalDelivered/${finalKey(clientId,productId)}`, Math.max(0,num(value)), "");
  allocationModal(productId);
}
function addClientModal(clientId="") {
  const c = clientId ? state.catalog.clients?.[clientId] : null;
  openModal(c ? "Editar cliente" : "Añadir cliente", `
    <input id="clientNameInput" class="field" placeholder="Nombre" value="${esc(c?.name || "")}">
    <input id="clientOrderInput" class="field" style="margin-top:8px" type="number" placeholder="Orden" value="${esc(c?.routeOrder ?? clients().length+1)}">
    <input id="clientPhoneInput" class="field" style="margin-top:8px" placeholder="Teléfono" value="${esc(c?.phone || "")}">
    <input id="clientAddressInput" class="field" style="margin-top:8px" placeholder="Dirección" value="${esc(c?.address || "")}">
    <button class="btn primary" style="width:100%;margin-top:10px" data-save-client="${clientId}">Guardar cliente</button>
  `);
}
async function saveClient(clientId="") {
  const name = $("#clientNameInput").value.trim().toUpperCase();
  if (!name) { toast("Escribe el nombre"); return; }
  const id = clientId || push(ref(db, `${catalogPath}/clients`)).key;
  const client = {
    id, name,
    routeOrder: num($("#clientOrderInput").value) || clients().length+1,
    phone: $("#clientPhoneInput").value.trim(),
    address: $("#clientAddressInput").value.trim(),
    active: true
  };
  await write(`catalog/clients/${id}`, client, "Cliente guardado");
  closeModal();
}
function addProductModal() {
  openModal("Añadir producto", `
    <input id="productNameInput" class="field" placeholder="Producto">
    <select id="productUnitInput" class="field" style="margin-top:8px">
      <option>CAJA</option><option>KG</option><option>UD</option><option>MANOJO</option><option>SACO</option>
    </select>
    <input id="productCategoryInput" class="field" style="margin-top:8px" placeholder="Categoría" value="Otros">
    <button class="btn primary" style="width:100%;margin-top:10px" data-save-product>Guardar producto</button>
  `);
}
async function saveProduct() {
  const name = $("#productNameInput").value.trim().toUpperCase();
  if (!name) { toast("Escribe el producto"); return; }
  const id = push(ref(db, `${catalogPath}/products`)).key;
  const product = {
    id, name,
    unit: $("#productUnitInput").value,
    category: $("#productCategoryInput").value.trim() || "Otros",
    active: true
  };
  await write(`catalog/products/${id}`, product, "Producto guardado");
  closeModal();
}
function buyText() {
  return `COMPRA MADRID · ${state.route.date}\n\n` + totals().map((x) => `${x.product.name}: ${fmt(x.qty)} ${x.product.unit}`).join("\n");
}
function finalReportText() {
  return clients().map((c) => {
    const lines = products().map((p) => ({p,q:finalQty(c.id,p.id)})).filter((x) => x.q > 0);
    return lines.length ? `CLIENTE: ${c.name}\n${lines.map((x) => `${x.p.name}: ${fmt(x.q)} ${x.p.unit}`).join("\n")}` : "";
  }).filter(Boolean).join("\n\n----------------\n\n");
}
function finalReportModal() {
  const text = finalReportText();
  openModal("Reparto final para facturar", `
    <textarea class="field" style="min-height:430px">${esc(text)}</textarea>
    <div class="actions">
      <button class="btn primary" data-action="copy-final">Copiar todo</button>
      <button class="btn dark" data-action="share-final">Compartir</button>
    </div>`);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Texto copiado"); }
  catch { prompt("Copia el texto:", text); }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button,[data-toggle-load],[data-toggle-delivery]");
  if (!button) return;

  if (button.dataset.view) return setView(button.dataset.view);
  if (button.dataset.action === "go-orders") return setView("orders");
  if (button.dataset.action === "new-route") return createNewRoute();
  if (button.dataset.action === "export-backup") return exportBackup();
  if (button.dataset.action === "import-backup") return $("#backupFileInput").click();
  if (button.dataset.action === "show-history") return showHistoryModal();
  if (button.dataset.action === "toggle-completed") { deliveryHideCompleted = !deliveryHideCompleted; return renderDelivery(); }
  if (button.dataset.action === "pending-orders") return pendingOrdersModal();
  if (button.dataset.action === "copy-pending") return copyText(pendingClientsText());
  if (button.dataset.action === "share-pending") return navigator.share ? navigator.share({text:pendingClientsText()}) : copyText(pendingClientsText());
  if (button.dataset.action === "clear-whatsapp") { const t = document.getElementById("whatsappPasteText"); if (t) t.value = ""; const r = document.getElementById("parseResults"); if (r) r.innerHTML = ""; return; }
  if (button.dataset.action === "parse-whatsapp") {
    const text = document.getElementById("whatsappPasteText")?.value || "";
    const rows = parseWhatsAppText(text);
    if (!rows.length) return toast("No se encontraron líneas con cantidades");
    return renderParsedRows(button.dataset.client, rows);
  }
  if (button.dataset.action === "close-modal") return closeModal();
  if (button.dataset.action === "add-client") return addClientModal();
  if (button.dataset.action === "add-product") return addProductModal();
  if (button.dataset.action === "copy-buy") return copyText(buyText());
  if (button.dataset.action === "reset-load") return write("activeRoute/loaded", null, "Carga reiniciada");
  if (button.dataset.action === "final-report") return finalReportModal();
  if (button.dataset.action === "copy-final") return copyText(finalReportText());
  if (button.dataset.action === "share-final") return navigator.share ? navigator.share({text:finalReportText()}) : copyText(finalReportText());

  if (button.dataset.openClient) { selectedClientId = button.dataset.openClient; return setView("orders"); }
  if (button.dataset.editClient) return addClientModal(button.dataset.editClient);
  if (button.dataset.archiveClient) return archiveClient(button.dataset.archiveClient);
  if (button.dataset.noOrder) return markNoOrder(button.dataset.noOrder);
  if (button.dataset.whatsappImport) return whatsappImportModal(button.dataset.whatsappImport);
  if (button.dataset.applyWhatsapp) return applyWhatsappImport(button.dataset.applyWhatsapp);
  if (button.dataset.confirmClient) return confirmClientModal(button.dataset.confirmClient);
  if (button.dataset.finishClient) { closeModal(); return markClientDone(button.dataset.finishClient); }
  if (button.dataset.repeatOrder) return repeatLastOrder(button.dataset.repeatOrder);
  if (button.dataset.saveHabitual) return saveHabitual(button.dataset.saveHabitual);
  if (button.dataset.loadHabitual) return loadHabitual(button.dataset.loadHabitual);
  if (button.dataset.restoreRoute) return restoreRoute(button.dataset.restoreRoute);
  if (button.dataset.allocateProduct) return allocationModal(button.dataset.allocateProduct);
  if (button.dataset.toggleLoad) return toggleLoad(button.dataset.toggleLoad);
  if (button.dataset.toggleDelivery) return toggleDelivery(button.dataset.toggleDelivery);
  if (button.dataset.completeClient) return completeClientDelivery(button.dataset.completeClient);
  if (button.dataset.saveClient !== undefined) return saveClient(button.dataset.saveClient);
  if (button.hasAttribute("data-save-product")) return saveProduct();

  if (button.dataset.qtyMinus || button.dataset.qtyPlus) {
    const raw = button.dataset.qtyMinus || button.dataset.qtyPlus;
    const [clientId,productId] = raw.split("|");
    const delta = button.dataset.qtyPlus ? 1 : -1;
    return updateOrderQty(clientId,productId,Math.max(0,num(clientOrder(clientId)[productId])+delta));
  }
  if (button.dataset.finalMinus || button.dataset.finalPlus) {
    const raw = button.dataset.finalMinus || button.dataset.finalPlus;
    const [clientId,productId] = raw.split("|");
    const delta = button.dataset.finalPlus ? 1 : -1;
    return setFinalQty(clientId,productId,Math.max(0,finalQty(clientId,productId)+delta));
  }
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.id === "clientSelector") {
    selectedClientId = target.value;
    renderOrders();
    return;
  }
  if (target.dataset.qtyInput) {
    const [clientId,productId] = target.dataset.qtyInput.split("|");
    return updateOrderQty(clientId,productId,target.value);
  }
  if (target.dataset.boughtInput) return setBought(target.dataset.boughtInput,target.value);
  if (target.dataset.extraInput) return setExtraPurchase(target.dataset.extraInput,target.value);
  if (target.dataset.finalInput) {
    const [clientId,productId] = target.dataset.finalInput.split("|");
    return setFinalQty(clientId,productId,target.value);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "clientSearch") {
    const value = event.target.value;
    const list = clients().filter((c) => c.name.toUpperCase().includes(value.toUpperCase()));
    $("#clientGrid").innerHTML = list.map(clientCard).join("") || '<div class="muted">Sin resultados</div>';
  }
  if (event.target.id === "productSearch") {
    productSearch = event.target.value;
    const client = state.catalog.clients?.[selectedClientId];
    $("#productList").innerHTML = filteredProducts().map((p) => productRow(client.id,p)).join("") || '<div class="muted">Sin resultados</div>';
  }
});

document.addEventListener("click", (event) => {
  const cat = event.target.closest("[data-category]");
  if (!cat) return;
  productCategory = cat.dataset.category;
  renderOrders();
  requestAnimationFrame(() => $("#productSearch")?.focus());
});

$("#modalClose").addEventListener("click", closeModal);
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
$("#loginButton").addEventListener("click", async () => {
  $("#loginMessage").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("#loginEmail").value.trim(), $("#loginPassword").value);
  } catch {
    $("#loginMessage").textContent = "Correo o contraseña incorrectos.";
  }
});
$("#resetPasswordButton").addEventListener("click", async () => {
  try {
    await sendPasswordResetEmail(auth, $("#loginEmail").value.trim());
    $("#loginMessage").textContent = "Correo de recuperación enviado.";
  } catch {
    $("#loginMessage").textContent = "No se pudo enviar el correo.";
  }
});
$("#logoutButton").addEventListener("click", () => signOut(auth));
$("#backupFileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await importBackupFile(file); }
  catch (error) { console.error(error); toast("Copia no válida"); }
  event.target.value = "";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    $("#login").classList.remove("hidden");
    cloud("Sesión cerrada","offline");
    if (unsubscribeWorkspace) unsubscribeWorkspace();
    return;
  }
  $("#login").classList.add("hidden");
  try {
    await ensureSeedData();
    subscribeWorkspace();
  } catch (error) {
    console.error(error);
    cloud("Error de configuración","offline");
  }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(console.error);
