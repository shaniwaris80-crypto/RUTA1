
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
  notes: {},
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
function cloud(text, mode="offline") {
  const el = $("#cloudStatus");
  el.textContent = `● ${text}`;
  el.className = `cloud ${mode}`;
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
  try {
    await set(ref(db, `${workspacePath}/${path}`), value);
    cloud("Sincronizado", "online");
    if (successMessage) toast(successMessage);
  } catch (error) {
    console.error(error);
    cloud("Error al guardar", "offline");
    toast("No se pudo guardar");
  }
}
async function patch(values, successMessage="Guardado") {
  cloud("Sincronizando", "sync");
  try {
    await update(ref(db, workspacePath), values);
    cloud("Sincronizado", "online");
    if (successMessage) toast(successMessage);
  } catch (error) {
    console.error(error);
    cloud("Error al guardar", "offline");
    toast("No se pudo guardar");
  }
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
      <div class="section-title"><h2>Catálogo guardado</h2></div>
      <div class="line"><div><b>${allClients.length} clientes</b><div class="muted">Se conservan al limpiar la ruta</div></div></div>
      <div class="line"><div><b>${products().length} productos</b><div class="muted">Se conservan al limpiar la ruta</div></div></div>
    </article>`;
}
function clientCard(client) {
  const lines = orderLines(client.id).length;
  const done = state.route.status?.[client.id] === "done";
  return `<div class="client">
    <div class="num">${fmt(client.routeOrder)}</div>
    <div class="grow">
      <b>${esc(client.name)}</b>
      <div><span class="badge ${done ? "done" : ""}">${done ? "Pedido guardado" : "Pendiente"}</span> <span class="badge">${lines} productos</span></div>
    </div>
    <button class="btn primary small" data-open-client="${client.id}">Abrir</button>
    <button class="btn soft small" data-edit-client="${client.id}">Editar</button>
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
    <article class="card">
      <div class="section-title">
        <div><h2>Tomar pedido</h2><div class="muted">Los cambios se guardan inmediatamente</div></div>
        <button class="btn soft small" data-action="add-product">+ Producto</button>
      </div>
      <select id="clientSelector" class="search">
        ${allClients.map((c) => `<option value="${c.id}" ${c.id === selectedClientId ? "selected" : ""}>${fmt(c.routeOrder)}. ${esc(c.name)}</option>`).join("")}
      </select>
      <input id="productSearch" class="search" style="margin-top:8px" placeholder="Buscar producto" value="${esc(productSearch)}">
      <div class="tabs">
        ${categories.map((cat) => `<button class="btn ${cat === productCategory ? "dark" : "soft"} small" data-category="${esc(cat)}">${esc(cat)}</button>`).join("")}
      </div>
    </article>
    <article class="card">
      <div class="section-title">
        <div><h2>${esc(client.name)}</h2><div class="muted">${orderLines(client.id).length} productos añadidos</div></div>
        <button class="btn primary small" data-finish-client="${client.id}">Marcar pedido hecho</button>
      </div>
      <div id="productList" class="product-list">${productList.map((p) => productRow(client.id,p)).join("") || '<div class="muted">Sin resultados</div>'}</div>
    </article>`;
}
function renderBuy() {
  const list = totals();
  $("#view-buy").innerHTML = `
    <article class="card"><div class="section-title"><h2>Compra real</h2><button class="btn soft small" data-action="copy-buy">Copiar compra</button></div></article>
    <article class="card">
      ${list.map((item) => {
        const bought = state.route.purchasedQty?.[item.product.id] === undefined ? item.qty : num(state.route.purchasedQty[item.product.id]);
        const diff = bought - item.qty;
        return `<div class="line">
          <div>
            <b>${esc(item.product.name)}</b>
            <div class="muted">Pedido ${fmt(item.qty)} ${esc(item.product.unit)} · ${item.clients.length} clientes</div>
            <div class="${diff < 0 ? "status-bad" : "status-good"}">${diff === 0 ? "Correcto" : diff < 0 ? `Faltan ${fmt(Math.abs(diff))}` : `Sobran ${fmt(diff)}`}</div>
          </div>
          <div class="right">
            <input class="field" style="width:90px;text-align:center" data-bought-input="${item.product.id}" inputmode="decimal" value="${fmt(bought)}">
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
    <article class="card"><div class="section-title"><h2>Reparto</h2><button class="btn primary small" data-action="final-report">Resumen final</button></div></article>
    ${routeClients.map((client) => {
      const lines = orderLines(client.id).sort((a,b) => {
        const ak = !!state.route.delivered?.[finalKey(client.id,a.product.id)];
        const bk = !!state.route.delivered?.[finalKey(client.id,b.product.id)];
        return Number(ak) - Number(bk);
      });
      return `<article class="card">
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
  await write(`activeRoute/delivered/${key}`, !state.route.delivered?.[key], "");
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
  if (button.dataset.action === "add-client") return addClientModal();
  if (button.dataset.action === "add-product") return addProductModal();
  if (button.dataset.action === "copy-buy") return copyText(buyText());
  if (button.dataset.action === "reset-load") return write("activeRoute/loaded", null, "Carga reiniciada");
  if (button.dataset.action === "final-report") return finalReportModal();
  if (button.dataset.action === "copy-final") return copyText(finalReportText());
  if (button.dataset.action === "share-final") return navigator.share ? navigator.share({text:finalReportText()}) : copyText(finalReportText());

  if (button.dataset.openClient) { selectedClientId = button.dataset.openClient; return setView("orders"); }
  if (button.dataset.editClient) return addClientModal(button.dataset.editClient);
  if (button.dataset.finishClient) return markClientDone(button.dataset.finishClient);
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
