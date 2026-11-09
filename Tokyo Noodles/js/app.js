// Datos comunes y formato de moneda.
const gatewayUrl = "api/gateway.json";
const apiGateway = document.querySelector('meta[name="tn-gateway-url"]')?.content || "http://localhost:4000";
const params = new URLSearchParams(window.location.search);
const money = value => new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
}).format(value);

async function getProducts() {
  try {
    const response = await fetch(`${apiGateway}/api/v1/products?available=true`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.items)) throw new Error("Respuesta de catálogo no válida");
    return payload.items;
  } catch (error) {
    console.error("No fue posible cargar el catálogo:", error);
    return [];
  }
}

// Construye una tarjeta reutilizable para Inicio y Menú.
function productCard(product) {
  const col = document.createElement("div");
  col.className = "col-sm-6 col-lg-4";
  const href = new URL("detalle.html", window.location.href);
  href.searchParams.set("productoId", product.id);
  href.searchParams.set("categoria", product.categoria);
  col.innerHTML = `
    <article class="product-card">
      <a href="${href.href}">
        <img src="${product.imagen}" alt="${product.nombre}" loading="lazy">
        <div class="product-card-body">
          <span class="product-category">${product.categoria}</span>
          <h3>${product.nombre}</h3>
          <p>${product.descripcion}</p>
          <span class="product-price">${money(product.precio)}</span>
          <span class="card-cta">Ver detalle →</span>
        </div>
      </a>
    </article>
  `;
  return col;
}

// Inicio: muestra una selección del catálogo.
async function loadFeatured() {
  const target = document.getElementById("featured-products");
  if (!target) {
    return;
  }
  const products = await getProducts();
  products.slice(0, 3).forEach(product => target.append(productCard(product)));
  if (!products.length) {
    target.innerHTML = '<p class="text-secondary">No pudimos cargar el menú. Intenta recargar la página.</p>';
  }
}

// Menú: búsqueda y categorías se aplican sobre el catálogo.
async function loadCatalog() {
  const target = document.getElementById("product-list");
  if (!target) {
    return;
  }
  const products = await getProducts();
  const categories = ["Todos", ...new Set(products.map(item => item.categoria))];
  const chosen = params.get("categoria") || "Todos";
  const categoryBox = document.getElementById("categories");
  const searchBox = document.getElementById("product-search");
  const status = document.getElementById("catalog-status");
  let query = params.get("q") || "";
  searchBox.value = query;
  function render() {
    const filtered = products.filter(item => {
      const matchesCategory = chosen === "Todos" || item.categoria === chosen;
      const searchableText = `${item.nombre} ${item.categoria} ${item.descripcion}`;
      const matchesSearch = searchableText.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"));
      return matchesCategory && matchesSearch;
    });
    target.replaceChildren(...filtered.map(productCard));
    if (filtered.length === 0) {
      status.textContent = "No encontramos productos con esa búsqueda.";
      return;
    }
    const countLabel = filtered.length === 1 ? "opción disponible" : "opciones disponibles";
    status.textContent = `${filtered.length} ${countLabel}`;
  }
  categories.forEach(category => {
    const link = document.createElement("a");
    link.className = `category-pill ${category === chosen ? "active" : ""}`;
    link.href = category === "Todos"
      ? "productos.html"
      : `productos.html?categoria=${encodeURIComponent(category)}`;
    link.setAttribute("aria-current", category === chosen ? "true" : "false");
    link.textContent = category;
    categoryBox.append(link);
  });
  searchBox.addEventListener("input", () => {
    query = searchBox.value.trim();
    render();
  });
  render();
}

// Detalle: productoId identifica el producto; categoria sirve para volver.
async function loadDetail() {
  const target = document.getElementById("product-detail");
  if (!target) {
    return;
  }
  const productId = params.get("productoId");
  const category = params.get("categoria") || "Todos";
  const back = category === "Todos"
    ? "productos.html"
    : `productos.html?categoria=${encodeURIComponent(category)}`;
  const products = await getProducts();
  const product = products.find(item => String(item.id) === String(productId));
  if (!product) {
    target.innerHTML = `
      <div class="notice-box">
        <p>No encontramos ese producto. <a class="back-link" href="${back}">Volver al menú</a></p>
      </div>
    `;
    return;
  }
  target.innerHTML = `
    <article class="detail-card">
      <img src="${product.imagen}" alt="${product.nombre}">
      <div class="detail-copy">
        <span class="product-category">${product.categoria}</span>
        <h2>${product.nombre}</h2>
        <p>${product.descripcion}</p>
        <p>Preparado al momento con ingredientes frescos y el cuidado de nuestra cocina.</p>
        <div class="detail-price">${money(product.precio)}</div>
        <a class="btn btn-coral btn-lg mb-4" href="contacto.html">
          Consultar disponibilidad <span aria-hidden="true">→</span>
        </a>
        <a class="back-link" href="${back}">
          ← Volver a ${category === "Todos" ? "todos los productos" : category}
        </a>
      </div>
    </article>
  `;
}

// Facturas: datos de ejemplo y paginación local hasta conectar la API.
function loadInvoices() {
  const target = document.getElementById("invoice-list");
  if (!target) {
    return;
  }

  const invoices = [
    { number: "DEMO-1042", date: "12 oct 2026", detail: "2 productos · Pedido en local", total: 14480 },
    { number: "DEMO-1036", date: "08 oct 2026", detail: "1 producto · Pedido para llevar", total: 8990 },
    { number: "DEMO-1021", date: "01 oct 2026", detail: "3 productos · Pedido en local", total: 23960 },
    { number: "DEMO-0987", date: "28 sep 2026", detail: "3 productos · Pedido para llevar", total: 23960 },
    { number: "DEMO-0962", date: "22 sep 2026", detail: "2 productos · Pedido en local", total: 15480 },
    { number: "DEMO-0914", date: "15 sep 2026", detail: "1 producto · Pedido en local", total: 9990 },
    { number: "DEMO-0888", date: "09 sep 2026", detail: "2 productos · Pedido para llevar", total: 14480 }
  ];
  const pageSize = 3;
  let page = 1;
  const pageStatus = document.getElementById("invoice-page-status");
  const pagination = document.getElementById("invoice-pagination");

  function renderPage() {
    const pageCount = Math.ceil(invoices.length / pageSize);
    const start = (page - 1) * pageSize;
    const visibleInvoices = invoices.slice(start, start + pageSize);

    target.innerHTML = visibleInvoices.map(invoice => `
      <tr>
        <td class="invoice-number">${invoice.number}<br><span class="invoice-status">Ejemplo</span></td>
        <td>${invoice.date}</td>
        <td>${invoice.detail}</td>
        <td>${money(invoice.total)}</td>
        <td><button type="button" class="invoice-download" disabled title="La descarga se habilitará al conectar el backend">Descargar PDF</button></td>
      </tr>
    `).join("");

    pageStatus.textContent = `Mostrando ${start + 1}–${start + visibleInvoices.length} de ${invoices.length} facturas de ejemplo`;
    pagination.innerHTML = `
      <li class="page-item ${page === 1 ? "disabled" : ""}">
        <button class="page-link" type="button" data-page="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="Página anterior">Anterior</button>
      </li>
      ${Array.from({ length: pageCount }, (_, index) => `
        <li class="page-item ${page === index + 1 ? "active" : ""}">
          <button class="page-link" type="button" data-page="${index + 1}" aria-current="${page === index + 1 ? "page" : "false"}">${index + 1}</button>
        </li>
      `).join("")}
      <li class="page-item ${page === pageCount ? "disabled" : ""}">
        <button class="page-link" type="button" data-page="${page + 1}" ${page === pageCount ? "disabled" : ""} aria-label="Página siguiente">Siguiente</button>
      </li>
    `;

    pagination.querySelectorAll("[data-page]").forEach(button => {
      button.addEventListener("click", () => {
        page = Number(button.dataset.page);
        renderPage();
      });
    });
  }

  renderPage();

  const showDemo = document.getElementById("show-invoice-demo");
  const demo = document.getElementById("invoice-demo");
  showDemo?.addEventListener("click", () => {
    demo.hidden = false;
    showDemo.disabled = true;
    showDemo.textContent = "Vista de ejemplo abierta";
  });
}

// Acceso de ejemplo: no transmite ni conserva las credenciales.
function setupInvoiceLogin() {
  const form = document.getElementById("invoice-login-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    document.getElementById("invoice-login-feedback").innerHTML = `
      <div class="alert alert-info mt-2 mb-0" role="status">
        El acceso aún no está conectado. No se enviaron ni guardaron tus credenciales.
      </div>
    `;
    form.reset();
  });
}

// Contacto: valida y persiste el mensaje a través del API Gateway.
function setupContact() {
  const form = document.getElementById("contact-form");
  if (!form) {
    return;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const feedback = document.getElementById("contact-feedback");
    try {
      const response = await fetch(`${apiGateway}/api/v1/contact-messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: document.getElementById("contact-name").value, email: document.getElementById("contact-email").value, message: document.getElementById("contact-message").value }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "No se pudo enviar el mensaje.");
      feedback.textContent = `Mensaje recibido (${payload.id}).`; form.reset();
    } catch (error) { feedback.textContent = error.message; }
  });
}

loadFeatured();
loadCatalog();
loadDetail();
loadInvoices();
setupInvoiceLogin();
setupContact();
