
function formatoPrecio(precio) {
    return "$" + precio.toLocaleString("es-CL");
}

function crearProducto(producto) {
    const columna = document.createElement("div");
    columna.className = "col-sm-6 col-lg-4 mb-4";

    const tarjeta = document.createElement("div");
    tarjeta.className = "product-card";

    const imagen = document.createElement("img");
    imagen.setAttribute("src", producto.imagen);
    imagen.setAttribute("alt", producto.nombre);
    imagen.className = "product-img";

    tarjeta.appendChild(imagen);

    const cuerpo = document.createElement("div");
    cuerpo.className = "p-4";

    const categoria = document.createElement("span");
    categoria.className = "badge badge-tokyo mb-2";
    categoria.innerText = producto.categoria;

    cuerpo.appendChild(categoria);

    const titulo = document.createElement("h3");
    titulo.className = "h5 fw-bold";
    titulo.innerText = producto.nombre;

    cuerpo.appendChild(titulo);

    const descripcion = document.createElement("p");
    descripcion.className = "text-secondary";
    descripcion.innerText = producto.descripcion;

    cuerpo.appendChild(descripcion);

    const precio = document.createElement("div");
    precio.className = "price";
    precio.innerText = formatoPrecio(producto.precio);

    cuerpo.appendChild(precio);

    const enlace = document.createElement("a");
    enlace.className = "btn btn-tokyo mt-3";
    enlace.innerText = "Ver producto";

    const url = new URL("productos.php", window.location.href);
    url.searchParams.set("productoId", producto.id);

    enlace.href = url.href;

    cuerpo.appendChild(enlace);

    tarjeta.appendChild(cuerpo);
    columna.appendChild(tarjeta);

    return columna;
}

function crearDetalleProducto(producto) {
    const contenedor = document.getElementById("contenedorProductos");

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = "";

    const columna = document.createElement("div");
    columna.className = "col-12";

    const detalle = document.createElement("div");
    detalle.className = "product-detail";

    const imagen = document.createElement("img");
    imagen.src = producto.imagen;
    imagen.alt = producto.nombre;
    imagen.className = "product-detail-img";

    const contenido = document.createElement("div");
    contenido.className = "product-detail-content";

    const categoria = document.createElement("span");
    categoria.className = "badge badge-tokyo mb-3";
    categoria.innerText = producto.categoria;

    const titulo = document.createElement("h2");
    titulo.className = "section-title";
    titulo.innerText = producto.nombre;

    const descripcion = document.createElement("p");
    descripcion.className = "text-secondary fs-5";
    descripcion.innerText = producto.descripcion;

    const precio = document.createElement("div");
    precio.className = "price mb-4";
    precio.innerText = formatoPrecio(producto.precio);

    const volver = document.createElement("a");
    volver.className = "btn btn-outline-dark";
    volver.href = "productos.php";
    volver.innerText = "Volver al menú";

    contenido.appendChild(categoria);
    contenido.appendChild(titulo);
    contenido.appendChild(descripcion);
    contenido.appendChild(precio);
    contenido.appendChild(volver);

    detalle.appendChild(imagen);
    detalle.appendChild(contenido);

    columna.appendChild(detalle);
    contenedor.appendChild(columna);
}

async function cargarProductos(filtro = "Todos") {
    const contenedor = document.getElementById("contenedorProductos");

    if (!contenedor) {
        return;
    }

    const productos = await obtenerProductos();

    contenedor.innerHTML = "";

    productos.forEach(function(producto) {
        if (filtro === "Todos" || producto.categoria === filtro) {
            contenedor.appendChild(crearProducto(producto));
        }
    });
}

async function cargarCategorias() {
    const contenedor = document.getElementById("categorias");

    if (!contenedor) {
        return;
    }

    const productos = await obtenerProductos();

    contenedor.innerHTML = "";

    const categorias = ["Todos"];

    productos.forEach(function(producto) {
        if (!categorias.includes(producto.categoria)) {
            categorias.push(producto.categoria);
        }
    });

    categorias.forEach(function(categoria) {
        const boton = document.createElement("a");

        boton.className =
            "category-pill me-2 mb-2 d-inline-block text-decoration-none";

        boton.innerText = categoria;

        const url = new URL("productos.php", window.location.href);

        if (categoria !== "Todos") {
            url.searchParams.set("categoria", categoria);
        }

        boton.href = url.href;

        contenedor.appendChild(boton);
    });
}

async function cargarBusquedaDesdeURL() {
    const parametros = obtenerParametrosURL();

    if (!parametros.busqueda) {
        return false;
    }

    const buscador = document.getElementById("txtBuscar");
    const contenedor = document.getElementById("contenedorProductos");

    if (!contenedor) {
        return false;
    }

    const texto = parametros.busqueda.toLowerCase().trim();

    if (buscador) {
        buscador.value = parametros.busqueda;
    }

    const productos = await obtenerProductos();

    contenedor.innerHTML = "";

    productos.forEach(function(producto) {
        const nombre = producto.nombre.toLowerCase();
        const categoria = producto.categoria.toLowerCase();

        if (
            nombre.includes(texto) ||
            categoria.includes(texto)
        ) {
            contenedor.appendChild(crearProducto(producto));
        }
    });

    return true;
}

async function cargarProductoDesdeURL() {
    const parametros = obtenerParametrosURL();

    if (!parametros.productoId) {
        return false;
    }

    const productos = await obtenerProductos();

    const producto = productos.find(function(item) {
        return String(item.id) === String(parametros.productoId);
    });

    if (!producto) {
        const contenedor = document.getElementById("contenedorProductos");

        if (contenedor) {
            contenedor.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-warning">
                        No encontramos el producto solicitado.
                    </div>
                </div>
            `;
        }

        return true;
    }

    crearDetalleProducto(producto);

    return true;
}

document.addEventListener("DOMContentLoaded", async function() {
    const parametros = obtenerParametrosURL();

    const contenedorProductos =
        document.getElementById("contenedorProductos");

    if (contenedorProductos) {

        if (parametros.productoId) {
            await cargarProductoDesdeURL();

        } else {
            await cargarCategorias();

            if (parametros.busqueda) {
                await cargarBusquedaDesdeURL();

            } else if (parametros.categoria) {
                await cargarProductos(parametros.categoria);

            } else {
                await cargarProductos();
            }
        }
    }
   
    const buscador = document.getElementById("txtBuscar");

    if (buscador) {
        buscador.addEventListener("input", function() {
            const texto = buscador.value.trim();

            const url = new URL("productos.php", window.location.href);

            if (texto !== "") {
                url.searchParams.set("q", texto);
            }

            window.history.replaceState({}, "", url);

            cargarBusquedaDesdeURL();
        });
    }

    const formulario = document.getElementById("formContacto");

    if (formulario) {
        formulario.addEventListener("submit", enviarContacto);
    }
});

function enviarContacto(event) {
    event.preventDefault();

    const nombre = document.getElementById("nombre").value;
    const email = document.getElementById("email").value;
    const mensaje = document.getElementById("mensaje").value;
    const alerta = document.getElementById("alertaContacto");

    try {
        if (
            nombre.trim() === "" ||
            email.trim() === "" ||
            mensaje.trim() === ""
        ) {
            throw new Error("Completa todos los campos.");
        }

        alerta.className = "alert alert-success mt-3";
        alerta.innerText =
            "¡Gracias " + nombre + "! Recibimos tu mensaje.";

        document.getElementById("formContacto").reset();

    } catch (error) {
        alerta.className = "alert alert-danger mt-3";
        alerta.innerText = "Error: " + error.message;
    }
}

