const gatewayUrl = (() => {
  const configured = document.querySelector('meta[name="tn-gateway-url"]')?.content.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "";
})();

const loginForm = document.getElementById("tracking-login");
const queryForm = document.getElementById("tracking-query");
const feedback = document.getElementById("tracking-feedback");
const resultPanel = document.getElementById("tracking-result");
const orderIdInput = document.getElementById("tracking-order-id");
const graphqlQuery = `query SeguimientoPedido($orderId: ID!, $first: Int!, $after: String) {
  myOrderSummary(orderId: $orderId) {
    id status fulfillment total currency catalogStatus
    timeline { status at }
    items(first: $first, after: $after) {
      nodes { productId quantity unitPrice lineTotal product { name category description } }
      totalCount pageInfo { endCursor hasNextPage }
    }
  }
}`;

let activeOrderId = "";
let nextCursor = null;
const money = amount => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
const displayStatus = status => ({
  pending_payment: "Pendiente de pago", confirmed: "Pago confirmado", preparing: "En preparación",
  ready: "Listo", dispatched: "En reparto", delivered: "Entregado", cancelled: "Cancelado",
  payment_failed: "Pago rechazado", expired: "Expirado"
}[status] || status);

function setFeedback(message, kind = "info") {
  feedback.className = `alert alert-${kind}`;
  feedback.textContent = message;
}

function node(tag, text, className = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = String(text);
  return element;
}

async function api(path, options = {}) {
  const response = await fetch(`${gatewayUrl}${path}`, { credentials: "include", ...options });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch {}
  return { response, payload };
}

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!gatewayUrl) return setFeedback("Configura el endpoint del Gateway en la meta tn-gateway-url para este dominio.", "warning");
  const submit = loginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setFeedback("Comprobando la sesión…");
  try {
    const values = new FormData(loginForm);
    const { response, payload } = await api("/api/v1/auth/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: values.get("email"), password: values.get("password") })
    });
    if (!response.ok) throw new Error(payload.error?.message || `No se pudo iniciar sesión (HTTP ${response.status}).`);
    document.getElementById("tracking-password").value = "";
    document.getElementById("tracking-welcome").textContent = `Sesión iniciada para ${payload.cliente?.nombre || "cliente"}.`;
    loginForm.hidden = true;
    queryForm.hidden = false;
    setFeedback("Sesión activa. Ingresa el ID del pedido que quieres consultar.", "success");
    orderIdInput.focus();
  } catch (cause) {
    setFeedback(cause.message || "No se pudo conectar al Gateway. Usa Live Server y verifica que el backend esté activo.", "danger");
  } finally {
    submit.disabled = false;
  }
});

queryForm.addEventListener("submit", async event => {
  event.preventDefault();
  activeOrderId = orderIdInput.value.trim();
  nextCursor = null;
  await loadSummary(null);
});

async function loadSummary(after) {
  if (!activeOrderId) return;
  const submit = queryForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  resultPanel.hidden = false;
  resultPanel.replaceChildren(node("p", "Consultando Orders e Inventory…", "text-muted"));
  try {
    const { response, payload } = await api("/api/v1/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "SeguimientoPedido",
        query: graphqlQuery,
        variables: { orderId: activeOrderId, first: 5, after }
      })
    });
    if (response.status === 401) throw new Error("La sesión venció. Vuelve a iniciar sesión.");
    if (response.status === 403) throw new Error("Tu sesión no tiene permiso para consultar este pedido.");
    if (response.status >= 500) throw new Error("El servicio de seguimiento no está disponible temporalmente.");
    const order = payload.data?.myOrderSummary;
    if (!order) throw new Error(payload.errors?.[0]?.message || `Consulta no disponible (HTTP ${response.status}).`);
    renderOrder(order, payload.errors || []);
  } catch (cause) {
    resultPanel.replaceChildren(node("div", cause.message || "No se pudo completar la consulta.", "alert alert-warning"));
  } finally {
    submit.disabled = false;
  }
}

function renderOrder(order, errors) {
  resultPanel.replaceChildren();
  const header = node("div", undefined, "d-flex justify-content-between align-items-start flex-wrap gap-2");
  header.append(node("h2", `Pedido ${order.id}`, "h4 mb-0"));
  header.append(node("span", displayStatus(order.status), "badge text-bg-warning"));
  resultPanel.append(header);
  resultPanel.append(node("p", `${order.fulfillment === "delivery" ? "Despacho" : "Retiro"} · Total ${money(order.total)}`, "text-muted mt-2"));

  if (order.catalogStatus === "UNAVAILABLE" || errors.some(item => item.extensions?.code === "CATALOG_PARTIAL")) {
    resultPanel.append(node("div", "Mostramos el estado y los importes del pedido. Algunas fichas públicas actuales no están disponibles; sus descripciones se omiten temporalmente.", "alert alert-warning"));
  }

  const timelineHeading = node("h3", "Historial", "h5 mt-4");
  resultPanel.append(timelineHeading);
  const timeline = node("ol", undefined, "order-timeline");
  for (const event of order.timeline || []) {
    const item = node("li", undefined, "done");
    item.append(node("strong", displayStatus(event.status)));
    item.append(node("span", new Date(event.at).toLocaleString("es-CL")));
    timeline.append(item);
  }
  resultPanel.append(timeline);

  const connection = order.items;
  resultPanel.append(node("h3", `Productos (${connection.totalCount})`, "h5 mt-4"));
  if (!connection.nodes.length) resultPanel.append(node("p", "Este pedido no tiene líneas para mostrar.", "text-muted"));
  for (const line of connection.nodes) {
    const row = node("article", undefined, "border rounded p-3 mb-2");
    const product = line.product;
    row.append(node("h4", product?.name || `Producto ${line.productId}`, "h6 mb-1"));
    if (product) row.append(node("p", `${product.category} · ${product.description}`, "small text-muted mb-1"));
    row.append(node("p", `${line.quantity} × ${money(line.unitPrice)} = ${money(line.lineTotal)}`, "mb-0"));
    resultPanel.append(row);
  }

  nextCursor = connection.pageInfo.endCursor;
  if (connection.pageInfo.hasNextPage && nextCursor) {
    const more = node("button", "Ver más productos", "btn btn-outline-secondary mt-2");
    more.type = "button";
    more.addEventListener("click", () => loadSummary(nextCursor));
    resultPanel.append(more);
  }
  if (!errors.length) setFeedback("Seguimiento actualizado desde Orders e Inventory.", "success");
}

document.getElementById("tracking-logout").addEventListener("click", async () => {
  try {
    const { response } = await api("/api/v1/auth/sessions/current", { method: "DELETE" });
    if (!response.ok && response.status !== 204) throw new Error("No se pudo cerrar la sesión.");
    queryForm.hidden = true;
    loginForm.hidden = false;
    resultPanel.hidden = true;
    resultPanel.replaceChildren();
    orderIdInput.value = "";
    setFeedback("Se cerró la sesión de este navegador.", "info");
  } catch (cause) {
    setFeedback(cause.message || "No se pudo cerrar la sesión.", "danger");
  }
});
