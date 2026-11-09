const gateway = document.querySelector('meta[name="tn-gateway-url"]')?.content || "http://localhost:4000";
const $ = id => document.getElementById(id);
const request = async (path, options = {}) => {
  const response = await fetch(`${gateway}${path}`, { credentials: "include", ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Error HTTP ${response.status}`);
  return payload;
};
const say = (node, message, bad = false) => { node.textContent = message; node.className = bad ? "text-danger" : "text-success"; };

const fulfillment = $("fulfillment");
fulfillment?.addEventListener("change", () => { $("address-group").hidden = fulfillment.value !== "delivery"; });
$("document-type")?.addEventListener("change", event => { $("billing-group").hidden = event.target.value !== "factura"; });

async function loadProducts() {
  const select = $("product-choice");
  if (!select) return;
  try {
    const { items } = await request("/api/v1/products?available=true");
    select.replaceChildren(...items.map(item => { const option = document.createElement("option"); option.value = item.id; option.textContent = `${item.nombre} · $${item.precio.toLocaleString("es-CL")}`; return option; }));
    if (!items.length) select.add(new Option("Sin productos disponibles", ""));
  } catch (error) { select.replaceChildren(new Option("No se pudo cargar el catálogo", "")); say($("order-message"), error.message, true); }
}

async function auth(register) {
  const message = $("auth-message");
  const body = { email: $("customer-email").value.trim(), password: $("customer-password").value };
  if (register) body.name = $("customer-name").value.trim();
  try {
    await request(register ? "/api/v1/auth/registrations" : "/api/v1/auth/sessions", { method: "POST", body: JSON.stringify(body) });
    $("customer-password").value = "";
    say(message, register ? "Cuenta creada e inicio de sesión activo." : "Sesión iniciada.");
  } catch (error) { say(message, error.message, true); }
}
$("login-button")?.addEventListener("click", () => auth(false));
$("register-button")?.addEventListener("click", () => auth(true));

$("order-demo")?.addEventListener("submit", async event => {
  event.preventDefault();
  const message = $("order-message");
  const item = { productId: Number($("product-choice").value), quantity: Number($("product-quantity").value) };
  const body = { items: [item], fulfillment: fulfillment.value, documentType: $("document-type").value };
  if (body.fulfillment === "delivery") body.deliveryAddress = { calle: $("delivery-street").value.trim(), numero: $("delivery-number").value.trim(), comuna: $("delivery-city").value.trim(), region: $("delivery-region").value.trim() };
  if (body.documentType === "factura") body.billingDetails = { rut: $("billing-rut").value.trim(), razonSocial: $("billing-name").value.trim(), direccion: $("billing-address").value.trim(), giro: $("billing-giro").value.trim() };
  try {
    const order = await request("/api/v1/orders", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) });
    const payment = await request(`/api/v1/orders/${encodeURIComponent(order.id)}/payments`, { method: "POST" });
    say(message, `Pedido ${order.id} creado por $${order.total.toLocaleString("es-CL")}. `);
    const link = document.createElement("a"); link.href = payment.checkoutUrl; link.textContent = "Abrir checkout de prueba"; link.className = "btn btn-outline-dark ms-2"; link.target = "_blank"; link.rel = "noopener"; message.append(link);
  } catch (error) { say(message, error.message, true); }
});

loadProducts();
