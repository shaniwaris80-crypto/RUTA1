
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
  purchaseStatus: {},
  loaded: {},
  delivered: {},
  finalDelivered: {},
  extraPurchase: {},
  stockRemaining: {},
  returnedQty: {},
  lossQty: {},
  deliveryReasons: {},
  notes: {},
  closed: false,
  closedAt: null,
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
let currentView = "orders";
let unsubscribeWorkspace = null;
let toastTimer = null;
let saveState = "saved";
let undoAction = null;
let deliveryHideCompleted = false;
let reportMode = "final";
let orderActionsOpen = false;
let deliveryClientIndex = 0;
let deliveryShowCompleted = false;
let purchaseFilter = "all";
let purchaseProviderFilter = "Todos";
let clientStatusFilter = "all";
let productMode = "all";
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
  if (!document.querySelector(".view.active")) setView("orders");
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
function clients(includeSkipped=false) {
  return Object.values(state.catalog.clients || {})
    .filter((c) => c.active !== false)
    .filter((c) => includeSkipped || state.route.status?.[c.id] !== "skip")
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
    state.route.purchaseStatus = state.route.purchaseStatus || {};
    state.metadata = remote.metadata || {};
    state.habitualOrders = remote.habitualOrders || {};
    state.routesArchive = remote.routesArchive || {};
    state.route.returnedQty = state.route.returnedQty || {};
    state.route.lossQty = state.route.lossQty || {};
    state.route.deliveryReasons = state.route.deliveryReasons || {};
    state.route.purchaseStatus = state.route.purchaseStatus || {};
    state.route.closed = !!state.route.closed;
    if (!selectedClientId || !state.catalog.clients?.[selectedClientId]) {
      selectedClientId = clients()[0]?.id || "";
    }
    localStorage.setItem("rutaMadridV12Backup", JSON.stringify(state));
    cloud("Sincronizado", "online");
    render();
    setView(currentView || "orders");
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
  renderClientStatus();
  renderSaveState();
}

function renderClientStatus() {
  const all = clients(true).sort((a,b)=>num(a.routeOrder)-num(b.routeOrder));
  const rows = all.map((client) => {
    const status = state.route.status?.[client.id] || "pending";
    const productCount = orderLines(client.id).length;
    const totalQty = orderLines(client.id).reduce((sum,line)=>sum+line.qty,0);
    return { client, status, productCount, totalQty };
  });

  const counts = {
    all: rows.length,
    pending: rows.filter((row)=>row.status==="pending").length,
    done: rows.filter((row)=>row.status==="done").length,
    skip: rows.filter((row)=>row.status==="skip").length
  };

  const filtered = rows.filter((row) =>
    clientStatusFilter === "all" || row.status === clientStatusFilter
  );

  $("#view-client-status").innerHTML = `
    <div class="final-shell client-status-page">
      <section class="client-status-title">
        <span class="overline">Seguimiento de pedidos</span>
        <h2>Estado de clientes</h2>
        <p>Comprueba quién ha pedido, quién falta y quién no pide esta semana.</p>
      </section>

      <section class="client-status-metrics">
        <div class="metric-all"><b>${counts.all}</b><span>Total</span></div>
        <div class="metric-pending"><b>${counts.pending}</b><span>Faltan</span></div>
        <div class="metric-done"><b>${counts.done}</b><span>Han pedido</span></div>
        <div class="metric-skip"><b>${counts.skip}</b><span>No pide</span></div>
      </section>

      <section class="client-status-filters">
        ${[
          ["all","Todos",counts.all],
          ["pending","Faltan por pedir",counts.pending],
          ["done","Ya han pedido",counts.done],
          ["skip","No pide",counts.skip]
        ].map(([key,label,count])=>`
          <button class="${clientStatusFilter===key?"active":""}" data-client-status-filter="${key}">
            ${label} <span>${count}</span>
          </button>
        `).join("")}
      </section>

      <section class="client-status-list">
        ${filtered.map((row) => {
          const statusLabel =
            row.status === "done" ? "Pedido hecho" :
            row.status === "skip" ? "No pide" :
            "Falta por pedir";

          return `
            <div class="client-status-row status-${row.status}">
              <div class="client-status-number">${fmt(row.client.routeOrder)}</div>

              <button class="client-status-info" data-open-client="${row.client.id}">
                <b>${esc(row.client.name)}</b>
                <span>
                  ${row.status === "done"
                    ? `${row.productCount} productos · ${fmt(row.totalQty)} total`
                    : row.status === "skip"
                      ? "Marcado como no pide"
                      : "Todavía no ha enviado pedido"}
                </span>
              </button>

              <div class="client-status-badge">${statusLabel}</div>

              <div class="client-status-actions">
                ${row.status !== "done"
                  ? `<button class="status-action black" data-open-client="${row.client.id}">Abrir pedido</button>`
                  : `<button class="status-action outline" data-open-client="${row.client.id}">Ver pedido</button>`}
                ${row.status === "pending"
                  ? `<button class="status-action muted" data-no-order="${row.client.id}">No pide</button>`
                  : ""}
                ${row.status !== "pending"
                  ? `<button class="status-action muted" data-reset-client-status="${row.client.id}">Volver pendiente</button>`
                  : ""}
              </div>
            </div>
          `;
        }).join("") || '<div class="empty-state">No hay clientes en este filtro.</div>'}
      </section>
    </div>
  `;
}

function renderHome() {
  const ps = purchaseStats();
  const issues = routeReviewIssues();
  $("#view-home").innerHTML = `
    <div class="final-shell more-final">
      <section class="page-title">
        <span class="overline">Administración</span>
        <h2>Más opciones</h2>
        <p>Informes, gestión, seguridad y cierre de ruta.</p>
      </section>

      <section class="status-overview">
        <div><b>${state.route.date}</b><span>Ruta activa</span></div>
        <div><b>${clients().length}</b><span>Clientes</span></div>
        <div><b>${ps.products}</b><span>Productos</span></div>
        <div><b>${issues.length}</b><span>Avisos</span></div>
      </section>

      <section class="menu-section">
        <h3>Informes PDF</h3>
        <div class="menu-grid">
          <button class="menu-item" data-report-type="orders"><b>Pedidos totales</b><span>Totales por producto y unidad</span></button>
          <button class="menu-item" data-report-type="purchase"><b>Compra completa</b><span>Previsto, real, estado y diferencia</span></button>
          <button class="menu-item" data-report-type="providers"><b>Compra por proveedor</b><span>Un bloque por proveedor</span></button>
          <button class="menu-item" data-report-type="delivery"><b>Reparto final</b><span>Cliente por cliente</span></button>
          <button class="menu-item" data-report-type="shortages"><b>Repartido y faltante</b><span>Stock, merma y clientes afectados</span></button>
          <button class="menu-item" data-report-type="stock"><b>Stock final</b><span>Sobrantes por producto</span></button>
          <button class="menu-item" data-report-type="clients"><b>PDF por cliente</b><span>Pedido y entrega final individual</span></button>
          <button class="menu-item black" data-report-type="complete"><b>Informe completo</b><span>Toda la ruta en un PDF</span></button>
        </div>
      </section>

      <section class="menu-section">
        <h3>Cierre y control</h3>
        <div class="menu-grid">
          <button class="menu-item" data-action="review-route"><b>Revisar ruta</b><span>${issues.length} grupos de avisos</span></button>
          <button class="menu-item" data-action="diagnostics"><b>Diagnóstico</b><span>Firebase, caché y versión</span></button>
          ${routeIsClosed()
            ? `<button class="menu-item black" data-action="reopen-route"><b>Reabrir ruta</b><span>Permitir modificaciones</span></button>`
            : `<button class="menu-item black" data-action="close-route"><b>Cerrar ruta</b><span>Bloquear y marcar definitiva</span></button>`}
          <button class="menu-item danger" data-action="new-route"><b>Nueva semana</b><span>Archivar y limpiar ruta</span></button>
        </div>
      </section>

      <section class="menu-section">
        <h3>Catálogo y seguridad</h3>
        <div class="menu-grid">
          <button class="menu-item" data-action="add-client"><b>Añadir cliente</b><span>Nuevo cliente permanente</span></button>
          <button class="menu-item" data-action="add-product"><b>Añadir producto</b><span>Producto, unidad y proveedor</span></button>
          <button class="menu-item" data-action="show-history"><b>Historial de rutas</b><span>Consultar o restaurar</span></button>
          <button class="menu-item" data-action="export-backup"><b>Exportar copia</b><span>Descargar JSON de seguridad</span></button>
          <button class="menu-item" data-action="import-backup"><b>Restaurar copia</b><span>Cargar un respaldo</span></button>
          <button class="menu-item" data-action="pending-orders"><b>Clientes pendientes</b><span>Control antes del jueves</span></button>
        </div>
      </section>
    </div>`;
}
function clientCard(client) {
  const lines = orderLines(client.id).length;
  const status = state.route.status?.[client.id] || "pending";
  const done = status === "done";
  const skipped = status === "skip";
  return `<div class="clean-client">
    <div class="clean-client-main">
      <b>${fmt(client.routeOrder)}. ${esc(client.name)}</b>
      <div class="section-subtle">
        <span class="inline-chip ${done ? "done" : ""}">${done ? "Hecho" : skipped ? "No pide" : "Pendiente"}</span>
        <span class="inline-chip">${lines} productos</span>
      </div>
    </div>
    <div class="focus-actions">
      <button class="btn primary small" data-open-client="${client.id}">Abrir</button>
      <button class="btn soft small" data-edit-client="${client.id}">Editar</button>
    </div>
  </div>`;
}
function renderClients(filter="") {
  const q = filter.trim().toUpperCase();
  const list = clients(true).filter((c) => !q || c.name.includes(q));
  $("#view-clients").innerHTML = `
    <article class="card">
      <div class="clean-header">
        <div><h2>Clientes</h2><div class="section-subtle">${list.length} registros</div></div>
        <button class="btn soft small" data-action="add-client">+ Cliente</button>
      </div>
      <input id="clientSearch" class="search" placeholder="Buscar cliente" value="${esc(filter)}" style="margin-top:10px">
    </article>
    <article class="card">
      <div id="clientGrid" class="clean-list">${list.map(clientCard).join("") || '<div class="muted">Sin resultados</div>'}</div>
    </article>`;
}
function completedClientsText(){ const list = clients(); const done = list.filter(c => state.route.status?.[c.id] === "done").length; return `${done}/${list.length} hechos`; }


function routeIsClosed() {
  return !!state.route.closed;
}
function ensureRouteEditable() {
  if (!routeIsClosed()) return true;
  toast("La ruta está cerrada. Reábrela desde Más.");
  return false;
}
function archivedRoutesSorted() {
  return Object.values(state.routesArchive || {}).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function previousOrderForClient(clientId) {
  return archivedRoutesSorted().find((r) =>
    r.orders?.[clientId] && Object.values(r.orders[clientId]).some((q)=>num(q)>0)
  )?.orders?.[clientId] || {};
}
function previousQty(clientId, productId) {
  return num(previousOrderForClient(clientId)[productId]);
}
function habitualQty(clientId, productId) {
  return num(state.habitualOrders?.[clientId]?.[productId]);
}
function productPriority(clientId, product) {
  const current = num(clientOrder(clientId)[product.id]);
  const habitual = habitualQty(clientId, product.id);
  const previous = previousQty(clientId, product.id);
  if (current > 0) return 0;
  if (habitual > 0) return 1;
  if (previous > 0) return 2;
  return 3;
}
function totalsByUnit(lines) {
  const grouped = {};
  for (const line of lines) {
    const unit = line.unit || line.product?.unit || "UD";
    const quantity = num(line.qty ?? line.quantity);
    grouped[unit] = (grouped[unit] || 0) + quantity;
  }
  return grouped;
}
function unitTotalsText(grouped) {
  return Object.entries(grouped).map(([unit,value])=>`${fmt(value)} ${unit}`).join(" · ") || "0";
}
function supplierName(product) {
  return product?.provider?.trim() || "SIN PROVEEDOR";
}
function productProviderOptions() {
  return ["Todos", ...new Set(products().map(supplierName))].sort((a,b)=>a.localeCompare(b,"es"));
}
function deliveredQty(clientId, productId) {
  return finalQty(clientId, productId);
}
function returnedQty(clientId, productId) {
  return num(state.route.returnedQty?.[finalKey(clientId,productId)]);
}
function lossQty(clientId, productId) {
  return num(state.route.lossQty?.[finalKey(clientId,productId)]);
}
function stockForProduct(productId) {
  const item = totals().find((x)=>x.product.id===productId);
  if (!item) return 0;
  const extra = num(state.route.extraPurchase?.[productId]);
  const expected = item.qty + extra;
  const bought = state.route.purchasedQty?.[productId] === undefined ? expected : num(state.route.purchasedQty[productId]);
  const delivered = clients(true).reduce((sum,c)=>sum+deliveredQty(c.id,productId),0);
  const losses = clients(true).reduce((sum,c)=>sum+lossQty(c.id,productId),0);
  return bought - delivered - losses;
}
function routeReviewIssues() {
  const issues = [];
  const pendingClients = clients().filter((c)=>!["done","skip"].includes(state.route.status?.[c.id]));
  if (pendingClients.length) issues.push({type:"Clientes pendientes",count:pendingClients.length,detail:pendingClients.map(c=>c.name).join(", ")});
  const purchasePending = totals().filter((item)=>{
    const extra=num(state.route.extraPurchase?.[item.product.id]);
    const expected=item.qty+extra;
    const bought=state.route.purchasedQty?.[item.product.id]===undefined?expected:num(state.route.purchasedQty[item.product.id]);
    return !["bought","missing"].includes(purchaseStatusFor(item.product.id,expected,bought));
  });
  if (purchasePending.length) issues.push({type:"Compras sin confirmar",count:purchasePending.length,detail:purchasePending.map(x=>x.product.name).join(", ")});
  const notLoaded = totals().filter((item)=>!state.route.loaded?.[item.product.id]);
  if (notLoaded.length) issues.push({type:"Productos sin cargar",count:notLoaded.length,detail:notLoaded.map(x=>x.product.name).join(", ")});
  const incompleteDeliveries = clients(true).filter((c)=>orderLines(c.id).length && orderLines(c.id).some((line)=>!state.route.delivered?.[finalKey(c.id,line.product.id)]));
  if (incompleteDeliveries.length) issues.push({type:"Clientes sin completar reparto",count:incompleteDeliveries.length,detail:incompleteDeliveries.map(c=>c.name).join(", ")});
  const shortages = totals().filter((item)=>stockForProduct(item.product.id)<0);
  if (shortages.length) issues.push({type:"Productos con faltante",count:shortages.length,detail:shortages.map(x=>x.product.name).join(", ")});
  return issues;
}

function filteredProducts() {
  const clientId = selectedClientId;
  return products()
    .filter((p) =>
      (!productSearch || p.name.toUpperCase().includes(productSearch.toUpperCase())) &&
      (productCategory === "Todos" || p.category === productCategory) &&
      (productMode === "all" ||
       (productMode === "added" && num(clientOrder(clientId)[p.id]) > 0) ||
       (productMode === "habitual" && habitualQty(clientId,p.id) > 0) ||
       (productMode === "previous" && previousQty(clientId,p.id) > 0))
    )
    .sort((a,b)=>productPriority(clientId,a)-productPriority(clientId,b) || a.name.localeCompare(b.name,"es"));
}

function productClientRows(productId) {
  return clients(true)
    .map((client) => {
      const ordered = num(clientOrder(client.id)[productId]);
      const final = finalQty(client.id, productId);
      return { client, ordered, final };
    })
    .filter((row) => row.ordered > 0 || row.final > 0);
}
function productInfoModal(productId) {
  const product = state.catalog.products?.[productId];
  if (!product) return;
  const rows = productClientRows(productId);
  const totalOrdered = rows.reduce((sum, row) => sum + row.ordered, 0);
  const totalFinal = rows.reduce((sum, row) => sum + row.final, 0);
  const bought = state.route.purchasedQty?.[productId] === undefined ? totalOrdered + num(state.route.extraPurchase?.[productId]) : num(state.route.purchasedQty[productId]);
  openModal("Detalle del producto", `
    <article class="card">
      <div class="clean-header">
        <div><h2>${esc(product.name)}</h2><div class="section-subtle">${esc(product.unit)}</div></div>
        <div class="row-buttons"><button class="outline-button small" data-edit-product="${productId}">Editar</button><button class="black-button small" data-buy-detail="${productId}">Compra</button></div>
      </div>
      <div class="summary-strip">
        <div class="summary-mini"><b>${fmt(totalOrdered)}</b><span>Pedido</span></div>
        <div class="summary-mini"><b>${fmt(bought)}</b><span>Comprado</span></div>
        <div class="summary-mini"><b>${fmt(totalFinal)}</b><span>Final</span></div>
      </div>
    </article>
    <article class="card">
      <div class="clean-header"><h2>Quién lo tiene</h2><div class="tap-hint">${rows.length} clientes</div></div>
      <div class="modal-list">
        ${rows.map((row) => `<div class="modal-row">
          <div>
            <b>${esc(row.client.name)}</b>
            <div class="section-subtle">Pedido ${fmt(row.ordered)} ${esc(product.unit)}${row.final !== row.ordered ? ` · Final ${fmt(row.final)}` : ""}</div>
          </div>
          <button class="btn soft small" data-open-client="${row.client.id}">Abrir</button>
        </div>`).join("") || '<div class="muted">Nadie tiene este producto.</div>'}
      </div>
    </article>`);
}

function productRow(clientId, product) {
  const value = num(clientOrder(clientId)[product.id]);
  const previous = previousQty(clientId, product.id);
  const habitual = habitualQty(clientId, product.id);
  return `<div class="product-row ${value>0?"selected":""}">
    <button class="product-row-info" data-product-info="${product.id}">
      <span class="product-row-title">${esc(product.name)}</span>
      <span class="product-row-meta">${esc(product.unit)}${previous>0?` · anterior ${fmt(previous)}`:""}${habitual>0?` · habitual ${fmt(habitual)}`:""}</span>
    </button>
    <div class="qty qty-pro">
      <button data-qty-minus="${clientId}|${product.id}" ${routeIsClosed()?"disabled":""}>−</button>
      <input data-qty-input="${clientId}|${product.id}" inputmode="decimal" value="${value || ""}" ${routeIsClosed()?"disabled":""}>
      <button data-qty-plus="${clientId}|${product.id}" ${routeIsClosed()?"disabled":""}>+</button>
    </div>
  </div>`;
}
function renderOrders() {
  const allClients = clients();
  if (!selectedClientId || !state.catalog.clients?.[selectedClientId] || state.route.status?.[selectedClientId] === "skip") {
    selectedClientId = allClients[0]?.id || "";
  }
  const client = state.catalog.clients?.[selectedClientId];
  if (!client) {
    $("#view-orders").innerHTML = '<div class="final-shell"><article class="card empty-state">No hay clientes pendientes.</article></div>';
    return;
  }

  const currentIndex = Math.max(0, allClients.findIndex((c)=>c.id===selectedClientId));
  const categories = ["Todos", ...new Set(products().map((p)=>p.category))];
  const productList = filteredProducts();
  const lines = orderLines(client.id);
  const totalsUnits = totalsByUnit(lines.map((x)=>({unit:x.product.unit,qty:x.qty})));

  $("#view-orders").innerHTML = `
    <div class="final-shell orders-final">
      ${routeIsClosed()?`<div class="closed-banner">Ruta cerrada · modo solo lectura</div>`:""}

      <div class="client-selector-sticky">
        <button class="icon-button" data-prev-client>←</button>
        <div class="client-selector-center">
          <label>Cliente ${currentIndex+1} de ${allClients.length}</label>
          <select id="clientSelector" class="client-select">
            ${allClients.map((c)=>`<option value="${c.id}" ${c.id===selectedClientId?"selected":""}>${fmt(c.routeOrder)}. ${esc(c.name)}</option>`).join("")}
          </select>
        </div>
        <button class="icon-button" data-next-client>→</button>
      </div>

      <section class="order-summary-panel">
        <div>
          <span class="overline">Pedido actual</span>
          <h2>${esc(client.name)}</h2>
          <p>${lines.length} productos · ${esc(unitTotalsText(totalsUnits))}</p>
        </div>
        <button class="outline-button" data-action="toggle-order-actions">Acciones</button>
      </section>

      <div class="secondary-actions monochrome ${orderActionsOpen?"open":""}">
        <button class="outline-button" data-repeat-order="${client.id}">Repetir último</button>
        <button class="outline-button" data-save-habitual="${client.id}">Guardar habitual</button>
        <button class="outline-button" data-load-habitual="${client.id}">Cargar habitual</button>
        <button class="black-button" data-whatsapp-import="${client.id}">Pegar WhatsApp</button>
        <button class="outline-button" data-no-order="${client.id}">No pide</button>
        <button class="outline-button" data-action="add-product">Añadir producto</button>
      </div>

      <section class="product-toolbar-final">
        <input id="productSearch" class="search-final" placeholder="Buscar producto" value="${esc(productSearch)}">
        <div class="mode-pills">
          ${[["all","Todos"],["added","Añadidos"],["habitual","Habituales"],["previous","Anterior"]]
            .map(([key,label])=>`<button class="${productMode===key?"active":""}" data-product-mode="${key}">${label}</button>`).join("")}
        </div>
        <div class="category-scroll">
          ${categories.map((cat)=>`<button class="${cat===productCategory?"active":""}" data-category="${esc(cat)}">${esc(cat)}</button>`).join("")}
        </div>
      </section>

      <section class="products-table">
        <div class="products-heading">
          <span>Producto</span><span>Cantidad</span>
        </div>
        <div id="productList" class="product-rows">
          ${productList.map((p)=>productRow(client.id,p)).join("") || '<div class="empty-state">Sin resultados</div>'}
        </div>
      </section>

      <button class="black-button save-next-final" data-save-next="${client.id}|${currentIndex}" ${routeIsClosed()?"disabled":""}>Guardar y siguiente</button>
    </div>`;
}

function purchaseStatusFor(productId, orderedQty, boughtQty) {
  const explicit = state.route.purchaseStatus?.[productId];
  return explicit || "pending";
}
function purchaseStatusLabel(status) {
  return {pending:"Pendiente",ordered:"Pedido",bought:"Comprado",partial:"Parcial",missing:"No conseguido"}[status] || "Pendiente";
}
function purchaseStatusClass(status) {
  return ["pending","ordered","bought","partial","missing"].includes(status) ? status : "pending";
}
function purchaseStats() {
  const list = totals();
  let ordered = 0, bought = 0, stock = 0, shortage = 0, completed = 0;
  for (const item of list) {
    const extra = num(state.route.extraPurchase?.[item.product.id]);
    const expected = item.qty + extra;
    const hasReal = state.route.purchasedQty?.[item.product.id] !== undefined;
    const real = hasReal ? num(state.route.purchasedQty[item.product.id]) : 0;
    const status = purchaseStatusFor(item.product.id, expected, real);
    const delivered = clients(true).reduce((sum,c)=>sum+finalQty(c.id,item.product.id),0);

    ordered += expected;
    bought += real;

    if (["bought","partial","missing"].includes(status)) completed++;

    if (hasReal) {
      const diff = real - delivered;
      if (diff > 0) stock += diff;
      if (diff < 0) shortage += Math.abs(diff);
    }
  }
  return { products:list.length, ordered, bought, stock, shortage, completed };
}
async function setPurchaseStatus(productId, status) {
  await write(`activeRoute/purchaseStatus/${productId}`, status, "Estado actualizado");
}

function renderBuy() {
  const list = totals();
  const providers = productProviderOptions();

  const rows = list.map((item) => {
    const extra = num(state.route.extraPurchase?.[item.product.id]);
    const expected = item.qty + extra;
    const hasReal = state.route.purchasedQty?.[item.product.id] !== undefined;
    const bought = hasReal ? num(state.route.purchasedQty[item.product.id]) : 0;
    const status = purchaseStatusFor(item.product.id, expected, bought);
    const completed = ["bought","partial","missing"].includes(status);
    const delivered = clients(true).reduce((sum,c)=>sum+finalQty(c.id,item.product.id),0);
    const stock = hasReal ? bought - delivered : 0;
    return { item, extra, expected, bought, status, completed, delivered, stock, hasReal };
  });

  const providerRows = rows.filter((row) =>
    purchaseProviderFilter === "Todos" ||
    supplierName(row.item.product) === purchaseProviderFilter
  );

  const filtered = providerRows.filter((row) => {
    if (purchaseFilter === "all") return true;
    if (purchaseFilter === "pending") return !row.completed;
    if (purchaseFilter === "stock") return row.hasReal && row.stock > 0;
    if (purchaseFilter === "shortage") return row.hasReal && row.stock < 0;
    return row.status === purchaseFilter;
  });

  // Los pendientes quedan arriba. Los marcados bajan automáticamente.
  const pending = filtered.filter((row) => !row.completed);
  const completed = filtered.filter((row) => row.completed);
  const orderedRows = [...pending, ...completed];

  const total = providerRows.length;
  const done = providerRows.filter((row) => row.completed).length;
  const pct = total ? Math.round(done / total * 100) : 0;

  $("#view-buy").innerHTML = `
    <div class="final-shell checklist-page purchase-page">
      <section class="checklist-title purchase-title">
        <span class="overline">Lista de compra</span>
        <h2>Compra</h2>
        <p>Toca el círculo cuando hayas comprado el producto.</p>
      </section>

      <section class="checklist-metrics purchase-metrics">
        <div><b>${total}</b><span>Productos</span></div>
        <div><b>${done}</b><span>Comprados</span></div>
        <div><b>${total-done}</b><span>Pendientes</span></div>
        <div><b>${pct}%</b><span>Completado</span></div>
      </section>

      <div class="checklist-progress purchase-progress">
        <span style="width:${pct}%"></span>
      </div>

      <section class="filters-final">
        <select id="providerFilter" class="select-final">
          ${providers.map((p)=>`<option ${p===purchaseProviderFilter?"selected":""}>${esc(p)}</option>`).join("")}
        </select>
        <div class="mode-pills purchase-pills">
          ${[
            ["all","Todos"],
            ["pending","Pendientes"],
            ["bought","Comprados"],
            ["partial","Parciales"],
            ["missing","No conseguido"],
            ["stock","Con stock"],
            ["shortage","Con faltante"]
          ].map(([key,label]) =>
            `<button class="${purchaseFilter===key?"active":""}" data-purchase-filter="${key}">${label}</button>`
          ).join("")}
        </div>
      </section>

      <section class="checklist-list purchase-list">
        ${orderedRows.map((row) => `
          <div class="checklist-row purchase-item ${row.completed?"completed":""} status-${row.status}">
            <button
              class="round-check purchase-round-check ${row.completed?"checked":""}"
              data-toggle-purchase="${row.item.product.id}"
              ${routeIsClosed()?"disabled":""}
              aria-label="${row.completed?"Volver a pendiente":"Marcar como comprado"}">
              ${row.completed?"✓":""}
            </button>

            <button class="checklist-product" data-product-info="${row.item.product.id}">
              <b>${esc(row.item.product.name)}</b>
              <span>${esc(supplierName(row.item.product))} · ${esc(row.item.product.unit)}</span>
              <small>
                Pedido ${fmt(row.item.qty)}
                ${row.extra ? ` · Extra ${fmt(row.extra)}` : ""}
                · Comprar ${fmt(row.expected)}
              </small>
            </button>

            <div class="checklist-amount">
              <b>${fmt(row.hasReal ? row.bought : row.expected)}</b>
              <span>${esc(row.item.product.unit)}</span>
            </div>

            <div class="checklist-status">
              <strong>${row.completed ? purchaseStatusLabel(row.status) : "Pendiente"}</strong>
              ${row.completed && row.bought > row.expected
                ? `<small>Compraste ${fmt(row.bought-row.expected)} más</small>`
                : row.status === "partial"
                  ? `<small>Faltan ${fmt(Math.max(0,row.expected-row.bought))}</small>`
                  : row.status === "missing"
                    ? `<small>No conseguido</small>`
                    : `<small>${row.completed ? "Finalizado" : "Por comprar"}</small>`}
            </div>

            <button class="edit-checklist-button" data-buy-detail="${row.item.product.id}">
              Editar
            </button>
          </div>
        `).join("") || '<div class="empty-state">No hay productos en este filtro.</div>'}
      </section>

      ${completed.length
        ? `<div class="completed-caption">${completed.length} comprado${completed.length===1?"":"s"} aparecen al final</div>`
        : ""}
    </div>`;
}

function buyDetailModal(productId) {
  const item = totals().find((x) => x.product.id === productId);
  if (!item) return;

  const rows = productClientRows(productId);
  const extra = num(state.route.extraPurchase?.[productId]);
  const expected = item.qty + extra;
  const hasReal = state.route.purchasedQty?.[productId] !== undefined;
  const bought = hasReal ? num(state.route.purchasedQty[productId]) : expected;
  const delivered = rows.reduce((sum,row) => sum + row.final, 0);
  const stock = hasReal ? bought - delivered : 0;
  const status = purchaseStatusFor(productId, expected, hasReal ? bought : 0);

  openModal("Compra", `
    <article class="card center-card purchase-detail-card">
      <div class="clean-header">
        <div>
          <h2>${esc(item.product.name)}</h2>
          <div class="section-subtle">${esc(item.product.unit)} · ${esc(supplierName(item.product))}</div>
        </div>
        <span class="purchase-status ${purchaseStatusClass(status)}">
          ${status==="pending" ? "Pendiente" : purchaseStatusLabel(status)}
        </span>
      </div>

      <div class="purchase-detail-grid" style="margin-top:10px">
        <div class="purchase-detail-item"><span>Pedido clientes</span><b>${fmt(item.qty)}</b></div>
        <div class="purchase-detail-item">
          <span>Extra</span>
          <input class="field" data-extra-input="${productId}" value="${fmt(extra)}">
        </div>
        <div class="purchase-detail-item"><span>Total previsto</span><b>${fmt(expected)}</b></div>
        <div class="purchase-detail-item">
          <span>Comprado real</span>
          <input class="field" data-bought-input="${productId}" value="${fmt(bought)}">
        </div>
        <div class="purchase-detail-item"><span>Repartido</span><b>${fmt(delivered)}</b></div>
        <div class="purchase-detail-item">
          <span>${hasReal && stock < 0 ? "Faltante" : "Stock"}</span>
          <b>${hasReal ? fmt(Math.abs(stock)) : "—"}</b>
        </div>
      </div>

      <div class="status-buttons">
        <button class="btn primary" data-set-purchase-status="${productId}|bought">Comprado</button>
        <button class="btn soft" data-set-purchase-status="${productId}|partial">Parcial</button>
        <button class="btn danger" data-set-purchase-status="${productId}|missing">No conseguido</button>
        <button class="btn soft" data-set-purchase-status="${productId}|pending">Volver a pendiente</button>
      </div>

      <button class="btn dark" style="width:100%;margin-top:10px"
              data-allocate-product="${productId}">
        Ver clientes y repartir
      </button>
    </article>
  `);
}

function renderLoad() {
  const list=totals();
  const pending=list.filter((x)=>!state.route.loaded?.[x.product.id]);
  const done=list.filter((x)=>state.route.loaded?.[x.product.id]);
  const pct=list.length?Math.round(done.length/list.length*100):0;
  const units=totalsByUnit(list.map((x)=>({unit:x.product.unit,qty:state.route.purchasedQty?.[x.product.id]===undefined?x.qty:num(state.route.purchasedQty[x.product.id])})));

  $("#view-load").innerHTML = `
    <div class="final-shell">
      <section class="page-title">
        <span class="overline">Preparación</span>
        <h2>Carga de furgoneta</h2>
        <p>${esc(unitTotalsText(units))}</p>
      </section>
      <section class="metric-grid">
        <div><b>${list.length}</b><span>Productos</span></div>
        <div><b>${done.length}</b><span>Cargados</span></div>
        <div><b>${pending.length}</b><span>Pendientes</span></div>
        <div><b>${pct}%</b><span>Progreso</span></div>
      </section>
      <div class="progress-final"><span style="width:${pct}%"></span></div>
      <section class="check-list-final">
        ${[...pending,...done].map((item)=>{
          const checked=!!state.route.loaded?.[item.product.id];
          const bought=state.route.purchasedQty?.[item.product.id]===undefined?item.qty:num(state.route.purchasedQty[item.product.id]);
          return `<div class="check-row ${checked?"done":""}">
            <button class="check-product" data-product-info="${item.product.id}">
              <b>${esc(item.product.name)}</b><span>${fmt(bought)} ${esc(item.product.unit)}</span>
            </button>
            <button class="${checked?"black-button":"outline-button"}" data-toggle-load="${item.product.id}" ${routeIsClosed()?"disabled":""}>${checked?"Cargado":"Marcar"}</button>
          </div>`;
        }).join("") || '<div class="empty-state">No hay compra.</div>'}
      </section>
    </div>`;
}
function renderDelivery() {
  const allRouteClients=clients(true).filter((c)=>orderLines(c.id).length && state.route.status?.[c.id]!=="skip");
  const routeClients=allRouteClients.filter((c)=>{
    const complete=orderLines(c.id).every((line)=>!!state.route.delivered?.[finalKey(c.id,line.product.id)]);
    return deliveryShowCompleted || !complete;
  });

  if (!routeClients.length) {
    $("#view-delivery").innerHTML=`<div class="final-shell"><section class="page-title"><h2>Reparto</h2></section><div class="empty-state">No quedan clientes pendientes.</div><button class="outline-button wide" data-action="toggle-delivery-completed">Mostrar completados</button></div>`;
    return;
  }

  deliveryClientIndex=Math.min(deliveryClientIndex,routeClients.length-1);
  const client=routeClients[deliveryClientIndex];
  const lines=orderLines(client.id).sort((a,b)=>Number(!!state.route.delivered?.[finalKey(client.id,a.product.id)])-Number(!!state.route.delivered?.[finalKey(client.id,b.product.id)]));
  const done=lines.filter((line)=>!!state.route.delivered?.[finalKey(client.id,line.product.id)]).length;
  const pct=lines.length?Math.round(done/lines.length*100):0;
  const units=totalsByUnit(lines.map((x)=>({unit:x.product.unit,qty:deliveredQty(client.id,x.product.id)})));

  $("#view-delivery").innerHTML=`
    <div class="final-shell delivery-final">
      ${routeIsClosed()?`<div class="closed-banner">Ruta cerrada · modo solo lectura</div>`:""}
      <div class="client-selector-sticky">
        <button class="icon-button" data-prev-delivery>←</button>
        <div class="client-selector-center">
          <label>Parada ${deliveryClientIndex+1} de ${routeClients.length}</label>
          <select id="deliveryClientSelector" class="client-select">
            ${routeClients.map((c,i)=>`<option value="${i}" ${i===deliveryClientIndex?"selected":""}>${fmt(c.routeOrder)}. ${esc(c.name)}</option>`).join("")}
          </select>
        </div>
        <button class="icon-button" data-next-delivery>→</button>
      </div>

      <section class="order-summary-panel">
        <div><span class="overline">Entrega</span><h2>${esc(client.name)}</h2><p>${done}/${lines.length} bajados · ${esc(unitTotalsText(units))}</p></div>
        <button class="outline-button" data-complete-client="${client.id}" ${routeIsClosed()?"disabled":""}>Todo bajado</button>
      </section>
      <div class="progress-final"><span style="width:${pct}%"></span></div>

      <section class="delivery-list-final">
        ${lines.map((line)=>{
          const key=finalKey(client.id,line.product.id);
          const checked=!!state.route.delivered?.[key];
          const returned=returnedQty(client.id,line.product.id);
          const loss=lossQty(client.id,line.product.id);
          return `<div class="delivery-row-final ${checked?"done":""}">
            <button class="delivery-check" data-toggle-delivery="${key}" ${routeIsClosed()?"disabled":""}>${checked?"✓":""}</button>
            <button class="delivery-product" data-product-info="${line.product.id}">
              <b>${esc(line.product.name)}</b>
              <span>Entregado ${fmt(deliveredQty(client.id,line.product.id))} ${esc(line.product.unit)}${returned?` · devuelto ${fmt(returned)}`:""}${loss?` · merma ${fmt(loss)}`:""}</span>
            </button>
            <button class="outline-button small" data-edit-delivery="${client.id}|${line.product.id}" ${routeIsClosed()?"disabled":""}>Editar</button>
          </div>`;
        }).join("")}
      </section>

      <div class="bottom-actions-final">
        <button class="outline-button" data-action="toggle-delivery-completed">${deliveryShowCompleted?"Ocultar completados":"Mostrar completados"}</button>
        <button class="black-button" data-action="final-report">Resumen final</button>
      </div>
    </div>`;
}



function routeReviewModal() {
  const issues=routeReviewIssues();
  openModal("Revisión de ruta", `
    <div class="modal-heading"><span class="overline">Control final</span><h2>${issues.length?"Hay puntos por revisar":"La ruta está lista"}</h2></div>
    <div class="review-list">
      ${issues.map((issue)=>`<div class="review-row"><div><b>${esc(issue.type)}</b><span>${esc(issue.detail)}</span></div><strong>${issue.count}</strong></div>`).join("") || '<div class="success-box">No se han encontrado incidencias importantes.</div>'}
    </div>
    <div class="bottom-actions-final">
      <button class="outline-button" data-action="close-modal">Volver</button>
      ${routeIsClosed()?"":'<button class="black-button" data-action="confirm-close-route">Cerrar de todos modos</button>'}
    </div>`);
}
async function closeRoute() {
  await patch({
    "activeRoute/closed":true,
    "activeRoute/closedAt":Date.now()
  },"Ruta cerrada");
  closeModal();
  setView("home");
}
async function reopenRoute() {
  if (!confirm("¿Reabrir la ruta para permitir cambios?")) return;
  await patch({"activeRoute/closed":false,"activeRoute/closedAt":null},"Ruta reabierta");
  setView("home");
}
async function diagnosticsModal() {
  openModal("Diagnóstico", '<div class="diagnostic-loading">Comprobando sistema…</div>');
  const results=[];
  results.push({name:"Usuario",ok:!!auth.currentUser,detail:auth.currentUser?.email||"Sin sesión"});
  results.push({name:"Internet",ok:navigator.onLine,detail:navigator.onLine?"Conectado":"Sin conexión"});
  results.push({name:"Service Worker",ok:"serviceWorker" in navigator,detail:"serviceWorker" in navigator?"Disponible":"No compatible"});
  results.push({name:"Almacenamiento local",ok:true,detail:localStorage.getItem("rutaMadridV12Backup")?"Copia disponible":"Sin copia todavía"});
  try {
    const testPath=`${workspacePath}/diagnostics/${Date.now()}`;
    await set(ref(db,testPath),{ok:true,at:Date.now()});
    await set(ref(db,testPath),null);
    results.push({name:"Firebase escritura",ok:true,detail:"Correcta"});
  } catch (error) {
    results.push({name:"Firebase escritura",ok:false,detail:error?.message||"Error"});
  }
  openModal("Diagnóstico", `
    <div class="modal-heading"><span class="overline">Versión V19</span><h2>Estado del sistema</h2></div>
    <div class="diagnostic-list">
      ${results.map((r)=>`<div class="diagnostic-row ${r.ok?"ok":"bad"}"><span>${r.ok?"✓":"!"}</span><div><b>${esc(r.name)}</b><small>${esc(r.detail)}</small></div></div>`).join("")}
    </div>`);
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


function deliveryEditModal(clientId, productId) {
  const client=state.catalog.clients?.[clientId];
  const product=state.catalog.products?.[productId];
  if (!client || !product) return;
  const key=finalKey(clientId,productId);
  openModal("Editar entrega", `
    <div class="form-final">
      <div class="modal-heading"><span class="overline">${esc(client.name)}</span><h2>${esc(product.name)}</h2></div>
      <label>Previsto<input class="field" value="${fmt(clientOrder(clientId)[productId])}" disabled></label>
      <label>Entregado<input id="deliveryFinalInput" class="field" inputmode="decimal" value="${fmt(deliveredQty(clientId,productId))}"></label>
      <label>Devuelto<input id="deliveryReturnedInput" class="field" inputmode="decimal" value="${fmt(returnedQty(clientId,productId))}"></label>
      <label>Merma / rotura<input id="deliveryLossInput" class="field" inputmode="decimal" value="${fmt(lossQty(clientId,productId))}"></label>
      <label>Motivo / observación<textarea id="deliveryReasonInput" class="field">${esc(state.route.deliveryReasons?.[key]||"")}</textarea></label>
      <button class="black-button wide" data-save-delivery="${clientId}|${productId}">Guardar entrega</button>
    </div>`);
}
async function saveDeliveryEdit(clientId, productId) {
  if (!ensureRouteEditable()) return;
  const key=finalKey(clientId,productId);
  await patch({
    [`activeRoute/finalDelivered/${key}`]:Math.max(0,num($("#deliveryFinalInput").value)),
    [`activeRoute/returnedQty/${key}`]:Math.max(0,num($("#deliveryReturnedInput").value)),
    [`activeRoute/lossQty/${key}`]:Math.max(0,num($("#deliveryLossInput").value)),
    [`activeRoute/deliveryReasons/${key}`]:$("#deliveryReasonInput").value.trim()||null
  },"Entrega actualizada");
  closeModal();
}

async function updateOrderQty(clientId, productId, value) {
  if (!ensureRouteEditable()) return;
  const q = Math.max(0, num(value));
  const path = `activeRoute/orders/${clientId}/${productId}`;
  await write(path, q || null, "");
}
async function setBought(productId, value) {
  if (!ensureRouteEditable()) return;
  await write(`activeRoute/purchasedQty/${productId}`, Math.max(0,num(value)), "Compra actualizada");
}
async function toggleLoad(productId) {
  if (!ensureRouteEditable()) return;
  await write(`activeRoute/loaded/${productId}`, !state.route.loaded?.[productId], "");
}
async function toggleDelivery(key) {
  if (!ensureRouteEditable()) return;
  const previous = !!state.route.delivered?.[key];
  await write(`activeRoute/delivered/${key}`, !previous, "");
  setUndo(previous ? "Marca retirada" : "Producto descargado", () => write(`activeRoute/delivered/${key}`, previous, ""));
}
async function completeClientDelivery(clientId) {
  if (!ensureRouteEditable()) return;
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
function addProductModal(productId="") {
  const p=productId?state.catalog.products?.[productId]:null;
  openModal(p?"Editar producto":"Añadir producto", `
    <div class="form-final">
      <label>Producto<input id="productNameInput" class="field" value="${esc(p?.name||"")}"></label>
      <label>Unidad<select id="productUnitInput" class="field">
        ${["CAJA","KG","UD","MANOJO","SACO"].map((u)=>`<option ${u===p?.unit?"selected":""}>${u}</option>`).join("")}
      </select></label>
      <label>Categoría<input id="productCategoryInput" class="field" value="${esc(p?.category||"Otros")}"></label>
      <label>Proveedor principal<input id="productProviderInput" class="field" value="${esc(p?.provider||"")}"></label>
      <label>Proveedor alternativo<input id="productAlternativeProviderInput" class="field" value="${esc(p?.alternativeProvider||"")}"></label>
      <label>Alias separados por coma<input id="productAliasesInput" class="field" value="${esc((p?.aliases||[]).join(", "))}"></label>
      <button class="black-button wide" data-save-product="${productId}">Guardar producto</button>
    </div>`);
}
async function saveProduct(productId="") {
  const name=$("#productNameInput").value.trim().toUpperCase();
  if (!name) { toast("Escribe el producto"); return; }
  const id=productId || push(ref(db,`${catalogPath}/products`)).key;
  const existing=state.catalog.products?.[id]||{};
  const product={
    ...existing,id,name,
    unit:$("#productUnitInput").value,
    category:$("#productCategoryInput").value.trim()||"Otros",
    provider:$("#productProviderInput").value.trim().toUpperCase(),
    alternativeProvider:$("#productAlternativeProviderInput").value.trim().toUpperCase(),
    aliases:$("#productAliasesInput").value.split(",").map(x=>x.trim()).filter(Boolean),
    active:true
  };
  await write(`catalog/products/${id}`,product,"Producto guardado");
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

async function getJsPDF() {
  const module=await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm");
  return module.jsPDF;
}
function pdfSafe(value="") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function reportUnitTotals(items) {
  return unitTotalsText(totalsByUnit(items));
}
async function generatePdfReport(type) {
  toast("Preparando PDF…");
  const jsPDF=await getJsPDF();
  const doc=new jsPDF({unit:"mm",format:"a4"});
  const routeDate=state.route.date;
  const finalLabel=routeIsClosed()?"DEFINITIVO":"PROVISIONAL";
  let y=16;
  const pageWidth=210;
  const left=14;
  const right=196;

  const newPageIfNeeded=(height=12)=>{
    if (y+height>282) {
      doc.addPage(); y=16; header(false);
    }
  };
  const header=(first=true)=>{
    doc.setTextColor(0);
    doc.setFont("helvetica","bold"); doc.setFontSize(16);
    doc.text("RUTA MADRID",left,y);
    doc.setFont("helvetica","normal"); doc.setFontSize(9);
    doc.text(`${pdfSafe(routeDate)} · ${finalLabel} · generado ${new Date().toLocaleString("es-ES")}`,left,y+5);
    doc.setDrawColor(0); doc.line(left,y+8,right,y+8);
    y+=14;
  };
  const title=(text)=>{
    newPageIfNeeded(15); doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.text(pdfSafe(text),left,y); y+=7;
  };
  const line=(cols,bold=false)=>{
    newPageIfNeeded(7); doc.setFont("helvetica",bold?"bold":"normal"); doc.setFontSize(8.5);
    const widths=[92,24,24,24,24];
    let x=left;
    cols.slice(0,5).forEach((value,i)=>{
      const text=pdfSafe(value??"");
      doc.text(text,x,y,{maxWidth:widths[i]-2});
      x+=widths[i];
    });
    y+=5.5;
  };
  const divider=()=>{newPageIfNeeded(4);doc.setDrawColor(210);doc.line(left,y,right,y);y+=4;};
  const paragraph=(text)=>{
    const lines=doc.splitTextToSize(pdfSafe(text),right-left);
    newPageIfNeeded(lines.length*4+3);doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.text(lines,left,y);y+=lines.length*4+3;
  };

  header();

  const allTotals=totals();
  const purchaseRows=allTotals.map((item)=>{
    const extra=num(state.route.extraPurchase?.[item.product.id]);
    const expected=item.qty+extra;
    const bought=state.route.purchasedQty?.[item.product.id]===undefined?expected:num(state.route.purchasedQty[item.product.id]);
    const delivered=clients(true).reduce((sum,c)=>sum+deliveredQty(c.id,item.product.id),0);
    const loss=clients(true).reduce((sum,c)=>sum+lossQty(c.id,item.product.id),0);
    return {item,extra,expected,bought,delivered,loss,stock:bought-delivered-loss,status:purchaseStatusLabel(purchaseStatusFor(item.product.id,expected,bought))};
  });

  if (type==="orders" || type==="complete") {
    title("TOTALES DE PEDIDOS");
    line(["Producto","Pedido","Unidad","Clientes","Proveedor"],true);
    divider();
    purchaseRows.forEach((r)=>line([r.item.product.name,fmt(r.item.qty),r.item.product.unit,String(r.item.clients.length),supplierName(r.item.product)]));
    paragraph(`Totales por unidad: ${reportUnitTotals(purchaseRows.map(r=>({unit:r.item.product.unit,qty:r.item.qty})))}`);
  }

  if (type==="purchase" || type==="complete") {
    title("COMPRA COMPLETA");
    line(["Producto","Previsto","Comprado","Diferencia","Estado"],true);divider();
    purchaseRows.forEach((r)=>line([r.item.product.name,fmt(r.expected),fmt(r.bought),fmt(r.bought-r.expected),r.status]));
    paragraph(`Total previsto por unidad: ${reportUnitTotals(purchaseRows.map(r=>({unit:r.item.product.unit,qty:r.expected})))}`);
  }

  if (type==="providers") {
    const groups={};
    purchaseRows.forEach((r)=>(groups[supplierName(r.item.product)] ||= []).push(r));
    for (const [provider,rows] of Object.entries(groups).sort()) {
      title(`PROVEEDOR: ${provider}`);
      line(["Producto","Comprar","Comprado","Unidad","Estado"],true);divider();
      rows.forEach((r)=>line([r.item.product.name,fmt(r.expected),fmt(r.bought),r.item.product.unit,r.status]));
      paragraph(`Totales: ${reportUnitTotals(rows.map(r=>({unit:r.item.product.unit,qty:r.expected})))}`);
    }
  }

  if (type==="delivery" || type==="complete" || type==="clients") {
    title(type==="clients"?"INFORMES INDIVIDUALES POR CLIENTE":"REPARTO FINAL");
    for (const client of clients(true)) {
      const rows=products().map((p)=>({p,q:deliveredQty(client.id,p.id),returned:returnedQty(client.id,p.id),loss:lossQty(client.id,p.id)})).filter((r)=>r.q>0||r.returned>0||r.loss>0);
      if (!rows.length) continue;
      newPageIfNeeded(13);doc.setFont("helvetica","bold");doc.setFontSize(10);doc.text(pdfSafe(client.name),left,y);y+=5;
      line(["Producto","Entregado","Devuelto","Merma","Unidad"],true);
      rows.forEach((r)=>line([r.p.name,fmt(r.q),fmt(r.returned),fmt(r.loss),r.p.unit]));
      paragraph(`Totales entregados: ${reportUnitTotals(rows.map(r=>({unit:r.p.unit,qty:r.q})))}`);
      divider();
    }
  }

  if (type==="shortages" || type==="complete") {
    title("REPARTIDO, STOCK Y FALTANTES");
    line(["Producto","Comprado","Repartido","Stock/Falta","Unidad"],true);divider();
    purchaseRows.forEach((r)=>line([r.item.product.name,fmt(r.bought),fmt(r.delivered),fmt(r.stock),r.item.product.unit]));
    const affected=purchaseRows.filter(r=>r.stock<0);
    if (affected.length) {
      title("CLIENTES POSIBLEMENTE AFECTADOS");
      affected.forEach((r)=>paragraph(`${r.item.product.name}: ${r.item.clients.map(x=>`${x.client.name} ${fmt(x.qty)}`).join(", ")}`));
    }
  }

  if (type==="stock" || type==="complete") {
    title("STOCK FINAL");
    line(["Producto","Stock","Merma","Unidad","Proveedor"],true);divider();
    purchaseRows.filter(r=>r.stock!==0||r.loss>0).forEach((r)=>line([r.item.product.name,fmt(r.stock),fmt(r.loss),r.item.product.unit,supplierName(r.item.product)]));
  }

  if (type==="complete") {
    title("ESTADO DE CLIENTES");
    clients(true).forEach((c)=>line([c.name,state.route.status?.[c.id]==="done"?"PEDIDO HECHO":state.route.status?.[c.id]==="skip"?"NO PIDE":"PENDIENTE","","",""]));
    title("AVISOS DE CIERRE");
    const issues=routeReviewIssues();
    if (issues.length) issues.forEach((issue)=>paragraph(`${issue.type} (${issue.count}): ${issue.detail}`));
    else paragraph("Sin incidencias relevantes.");
  }

  const pages=doc.getNumberOfPages();
  for (let i=1;i<=pages;i++) {
    doc.setPage(i);doc.setFontSize(8);doc.setTextColor(100);
    doc.text(`Pagina ${i} de ${pages}`,right,291,{align:"right"});
  }
  const names={
    orders:"pedidos_totales",purchase:"compra_completa",providers:"compra_proveedores",
    delivery:"reparto_final",shortages:"repartido_faltantes",stock:"stock_final",
    clients:"clientes_individuales",complete:"informe_completo"
  };
  doc.save(`ruta_madrid_${names[type]||type}_${routeDate}.pdf`);
  toast("PDF descargado");
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Texto copiado"); }
  catch { prompt("Copia el texto:", text); }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button,[data-toggle-load],[data-toggle-delivery]");
  if (!button) return;

  if (button.dataset.view) return setView(button.dataset.view);
  if (button.dataset.clientStatusFilter) {
    clientStatusFilter = button.dataset.clientStatusFilter;
    return renderClientStatus();
  }
  if (button.dataset.action === "go-orders") return setView("orders");
  if (button.dataset.action === "new-route") return createNewRoute();
  if (button.dataset.action === "export-backup") return exportBackup();
  if (button.dataset.action === "import-backup") return $("#backupFileInput").click();
  if (button.dataset.action === "show-history") return showHistoryModal();
  if (button.dataset.action === "review-route") return routeReviewModal();
  if (button.dataset.action === "close-route") return routeReviewModal();
  if (button.dataset.action === "confirm-close-route") return closeRoute();
  if (button.dataset.action === "reopen-route") return reopenRoute();
  if (button.dataset.action === "diagnostics") return diagnosticsModal();
  if (button.dataset.action === "toggle-completed") { deliveryHideCompleted = !deliveryHideCompleted; return renderDelivery(); }
  if (button.dataset.action === "pending-orders") return pendingOrdersModal();
  if (button.dataset.action === "copy-pending") return copyText(pendingClientsText());
  if (button.dataset.action === "share-pending") return navigator.share ? navigator.share({text:pendingClientsText()}) : copyText(pendingClientsText());
  if (button.dataset.action === "toggle-order-actions") { orderActionsOpen = !orderActionsOpen; return renderOrders(); }
  if (button.dataset.action === "toggle-delivery-completed") { deliveryShowCompleted = !deliveryShowCompleted; return renderDelivery(); }
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

  if (button.dataset.openClient) { selectedClientId = button.dataset.openClient; closeModal(); return setView("orders"); }
  if (button.dataset.editClient) return addClientModal(button.dataset.editClient);
  if (button.dataset.archiveClient) return archiveClient(button.dataset.archiveClient);
  if (button.dataset.noOrder) return markNoOrder(button.dataset.noOrder);
  if (button.dataset.resetClientStatus) {
    if (!ensureRouteEditable()) return;
    await write(`activeRoute/status/${button.dataset.resetClientStatus}`, null, "Cliente pendiente");
    return;
  }
  if (button.dataset.whatsappImport) return whatsappImportModal(button.dataset.whatsappImport);
  if (button.dataset.applyWhatsapp) return applyWhatsappImport(button.dataset.applyWhatsapp);
  if (button.dataset.confirmClient) return confirmClientModal(button.dataset.confirmClient);
  if (button.dataset.finishClient) { closeModal(); return markClientDone(button.dataset.finishClient); }
  if (button.dataset.repeatOrder) return repeatLastOrder(button.dataset.repeatOrder);
  if (button.dataset.saveHabitual) return saveHabitual(button.dataset.saveHabitual);
  if (button.dataset.loadHabitual) return loadHabitual(button.dataset.loadHabitual);
  if (button.dataset.restoreRoute) return restoreRoute(button.dataset.restoreRoute);
  if (button.dataset.reportType) return generatePdfReport(button.dataset.reportType);
  if (button.dataset.productMode) { productMode=button.dataset.productMode; return renderOrders(); }
  if (button.dataset.editProduct) return addProductModal(button.dataset.editProduct);
  if (button.dataset.editDelivery) {
    const [clientId,productId]=button.dataset.editDelivery.split("|");
    return deliveryEditModal(clientId,productId);
  }
  if (button.dataset.saveDelivery) {
    const [clientId,productId]=button.dataset.saveDelivery.split("|");
    return saveDeliveryEdit(clientId,productId);
  }
  if (button.dataset.togglePurchase) {
    if (!ensureRouteEditable()) return;
    const productId = button.dataset.togglePurchase;
    const item = totals().find((x) => x.product.id === productId);
    if (!item) return;

    const extra = num(state.route.extraPurchase?.[productId]);
    const expected = item.qty + extra;
    const currentStatus = purchaseStatusFor(
      productId,
      expected,
      state.route.purchasedQty?.[productId] === undefined
        ? 0
        : num(state.route.purchasedQty[productId])
    );
    const isCompleted = ["bought","partial","missing"].includes(currentStatus);

    if (isCompleted) {
      await patch({
        [`activeRoute/purchaseStatus/${productId}`]: "pending",
        [`activeRoute/purchasedQty/${productId}`]: null
      }, "Compra pendiente");
    } else {
      const existing = state.route.purchasedQty?.[productId];
      const realBought = existing === undefined ? expected : num(existing);
      await patch({
        [`activeRoute/purchasedQty/${productId}`]: realBought,
        [`activeRoute/purchaseStatus/${productId}`]: "bought"
      }, "Producto comprado");
    }
    return;
  }
  if (button.dataset.productInfo) return productInfoModal(button.dataset.productInfo);
  if (button.dataset.purchaseFilter) { purchaseFilter = button.dataset.purchaseFilter; return renderBuy(); }
  if (button.dataset.markBought) {
    const item = totals().find(x=>x.product.id===button.dataset.markBought);
    if (!item) return;
    const extra = num(state.route.extraPurchase?.[item.product.id]);
    const expected = item.qty + extra;
    await patch({
      [`activeRoute/purchasedQty/${item.product.id}`]: expected,
      [`activeRoute/purchaseStatus/${item.product.id}`]: "bought"
    }, "Compra marcada");
    return;
  }
  if (button.dataset.setPurchaseStatus) {
    if (!ensureRouteEditable()) return;
    const [productId,status] = button.dataset.setPurchaseStatus.split("|");
    const item = totals().find((x) => x.product.id === productId);
    if (!item) return;

    if (status === "pending") {
      await patch({
        [`activeRoute/purchaseStatus/${productId}`]: "pending",
        [`activeRoute/purchasedQty/${productId}`]: null
      }, "Compra pendiente");
      closeModal();
      return;
    }

    const expected = item.qty + num(state.route.extraPurchase?.[productId]);
    const existing = state.route.purchasedQty?.[productId];
    const realBought = existing === undefined
      ? (status === "missing" ? 0 : expected)
      : num(existing);

    await patch({
      [`activeRoute/purchasedQty/${productId}`]: realBought,
      [`activeRoute/purchaseStatus/${productId}`]: status
    }, "Estado actualizado");
    closeModal();
    return;
  }
  if (button.dataset.allocateProduct) return allocationModal(button.dataset.allocateProduct);
  if (button.dataset.buyDetail) return buyDetailModal(button.dataset.buyDetail);
  if (button.dataset.toggleLoad) return toggleLoad(button.dataset.toggleLoad);
  if (button.dataset.toggleDelivery) return toggleDelivery(button.dataset.toggleDelivery);
  if (button.dataset.completeClient) return completeClientDelivery(button.dataset.completeClient);
  if (button.dataset.saveClient !== undefined) return saveClient(button.dataset.saveClient);
  if (button.hasAttribute("data-save-product")) return saveProduct(button.dataset.saveProduct || "");

  if (button.hasAttribute("data-prev-client")) {
    const list = clients();
    const idx = Math.max(0, list.findIndex(c=>c.id===selectedClientId)-1);
    selectedClientId = list[idx]?.id || selectedClientId;
    return renderOrders();
  }
  if (button.hasAttribute("data-next-client")) {
    const list = clients();
    const idx = Math.min(list.length-1, list.findIndex(c=>c.id===selectedClientId)+1);
    selectedClientId = list[idx]?.id || selectedClientId;
    return renderOrders();
  }
  if (button.dataset.saveNext) {
    const [clientId] = button.dataset.saveNext.split("|");
    await markClientDone(clientId);
    const list = clients();
    const current = list.findIndex(c=>c.id===clientId);
    selectedClientId = list.slice(current+1).find(c=>state.route.status?.[c.id]!=="done")?.id || list[Math.min(current+1,list.length-1)]?.id || clientId;
    return renderOrders();
  }
  if (button.hasAttribute("data-prev-delivery")) {
    deliveryClientIndex = Math.max(0, deliveryClientIndex-1);
    return renderDelivery();
  }
  if (button.hasAttribute("data-next-delivery")) {
    deliveryClientIndex += 1;
    return renderDelivery();
  }
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
  if (target.id === "providerFilter") {
    purchaseProviderFilter=target.value;
    renderBuy();
    return;
  }
  if (target.id === "deliveryClientSelector") {
    deliveryClientIndex = num(target.value);
    renderDelivery();
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
