// Interacciones locales para mostrar los flujos; no llama a una API ni persiste datos.
const fulfillment = document.querySelector("#fulfillment");
const addressGroup = document.querySelector("#address-group");
const documentType = document.querySelector("#document-type");
const billingGroup = document.querySelector("#billing-group");

fulfillment?.addEventListener("change", () => {
  addressGroup.hidden = fulfillment.value !== "delivery";
});

documentType?.addEventListener("change", () => {
  billingGroup.hidden = documentType.value !== "factura";
});

document.querySelector("#order-demo")?.addEventListener("submit", event => {
  event.preventDefault();
  document.querySelector("#order-message").textContent =
    "Demostración: el backend validaría disponibilidad, calcularía el total y crearía el pedido pendiente de pago.";
});

document.querySelector("#inventory-demo")?.addEventListener("submit", event => {
  event.preventDefault();
  const delta = Number(document.querySelector("#stock-delta").value);
  document.querySelector("#inventory-message").textContent = delta === 0
    ? "El ajuste debe ser distinto de cero. No se cambió el inventario."
    : "Demostración: el backend validaría el saldo y guardaría el ajuste con su motivo y responsable. No se cambió el inventario.";
});
