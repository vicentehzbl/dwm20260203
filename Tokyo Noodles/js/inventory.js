const apiBase = document.querySelector('meta[name="tn-gateway-url"]')?.content || "http://localhost:4000";
const api = async (path, options = {}) => { const response = await fetch(`${apiBase}${path}`, { credentials: "include", ...options, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error?.message || `HTTP ${response.status}`); return body; };
const message = document.getElementById("inventory-message");
let products = [];
async function refreshInventory() {
  const data = await api("/api/v1/staff/inventory");
  products = data.items;
  const body = document.querySelector("#inventory-table tbody");
  body.replaceChildren(...products.map(item => { const row = document.createElement("tr"); for (const text of [item.nombre, item.onHand, item.reserved, item.available]) { const cell = document.createElement("td"); cell.textContent = text; row.append(cell); } return row; }));
  const select = document.getElementById("stock-product");
  select.replaceChildren(...products.map(item => new Option(item.nombre, item.productId)));
}
document.getElementById("staff-login")?.addEventListener("submit", async event => {
  event.preventDefault();
  try { await api("/api/v1/auth/sessions", { method: "POST", body: JSON.stringify({ email: document.getElementById("staff-email").value, password: document.getElementById("staff-password").value }) }); document.getElementById("staff-password").value = ""; document.getElementById("staff-login-status").textContent = "Sesión iniciada."; await refreshInventory(); }
  catch (error) { document.getElementById("staff-login-status").textContent = error.message; }
});
document.getElementById("inventory-demo")?.addEventListener("submit", async event => {
  event.preventDefault();
  try { const productId = document.getElementById("stock-product").value; const result = await api(`/api/v1/staff/inventory/${productId}/adjustments`, { method: "POST", body: JSON.stringify({ delta: Number(document.getElementById("stock-delta").value), reason: document.getElementById("stock-reason").value }) }); message.textContent = `Ajuste ${result.adjustmentId} aplicado. Saldo: ${result.onHandAfter}.`; await refreshInventory(); }
  catch (error) { message.textContent = error.message; }
});
