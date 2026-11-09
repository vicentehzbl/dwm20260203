const apiBase = document.querySelector('meta[name="tn-gateway-url"]')?.content || "http://localhost:4000";
const form = document.getElementById("invoice-login-form");
const feedback = document.getElementById("invoice-login-feedback");
const table = document.getElementById("invoice-list");
const showError = message => { feedback.textContent = message; feedback.setAttribute("role", "alert"); };

async function loadOwnInvoices() {
  const response = await fetch(`${apiBase}/api/v1/me/invoices`, { credentials: "include" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "No se pudo cargar el historial.");
  document.getElementById("invoice-demo").hidden = false;
  document.getElementById("show-invoice-demo")?.remove();
  table.replaceChildren();
  for (const invoice of result.items) {
    const row = document.createElement("tr");
    for (const value of [invoice.id, new Date(invoice.date).toLocaleDateString("es-CL"), `${invoice.lines.length} productos · ${invoice.type}`, new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(invoice.total), invoice.status]) {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }
    table.append(row);
  }
  document.getElementById("invoice-page-status").textContent = result.items.length ? `${result.items.length} documento(s) propio(s).` : "No hay documentos emitidos en tu cuenta.";
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const response = await fetch(`${apiBase}/api/v1/auth/sessions`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: document.getElementById("invoice-email").value, password: document.getElementById("invoice-password").value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "No se pudo iniciar sesión.");
    document.getElementById("invoice-password").value = "";
    feedback.textContent = `Sesión iniciada para ${result.cliente.nombre}.`;
    await loadOwnInvoices();
  } catch (error) { showError(error.message); }
});
