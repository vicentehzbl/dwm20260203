// Tokyo Noodles - JavaScript construido a partir de las técnicas de Semana 3.
// Se utiliza un objeto con estructura similar a una respuesta de API y se crean
// elementos del DOM dinámicamente.

const respuestaAPI = {
    "status": 200,
    "message": "Productos obtenidos correctamente",
    "data": [
        {"id":1,"nombre":"Tokyo Shoyu","categoria":"Ramen","descripcion":"Caldo de soya, cerdo chashu, huevo y cebollín.","precio":8990,"imagen":"https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80"},
        {"id":2,"nombre":"Miso Ramen","categoria":"Ramen","descripcion":"Miso, maíz, chashu, nori y cebollín fresco.","precio":9490,"imagen":"https://images.unsplash.com/photo-1557872943-16a5ac26437e?auto=format&fit=crop&w=800&q=80"},
        {"id":3,"nombre":"Tonkotsu","categoria":"Ramen","descripcion":"Caldo cremoso de cerdo, chashu, huevo y nori.","precio":9990,"imagen":"https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80"},
        {"id":4,"nombre":"Gyozas Clásicas","categoria":"Gyozas","descripcion":"Masa dorada rellena de cerdo, repollo y cebollín.","precio":5490,"imagen":"https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=800&q=80"},
        {"id":5,"nombre":"Gyozas Vegetales","categoria":"Gyozas","descripcion":"Relleno de verduras, hongos y especias japonesas.","precio":4990,"imagen":"https://images.unsplash.com/photo-1625938144755-652e08e359b7?auto=format&fit=crop&w=800&q=80"},
        {"id":6,"nombre":"Combo Tokyo","categoria":"Combos","descripcion":"Ramen a elección + 5 gyozas + bebida.","precio":12990,"imagen":"https://images.unsplash.com/photo-1617622141573-2f00f1a3c58f?auto=format&fit=crop&w=800&q=80"}
    ]
};

function formatoPrecio(precio){
    return "$" + precio.toLocaleString("es-CL");
}

function crearProducto(producto){
    let columna = document.createElement("div");
    columna.className = "col-sm-6 col-lg-4 mb-4";

    let tarjeta = document.createElement("div");
    tarjeta.className = "product-card";

    let imagen = document.createElement("img");
    imagen.setAttribute("src", producto.imagen);
    imagen.setAttribute("alt", producto.nombre);
    imagen.className = "product-img";
    tarjeta.appendChild(imagen);

    let cuerpo = document.createElement("div");
    cuerpo.className = "p-4";

    let categoria = document.createElement("span");
    categoria.className = "badge badge-tokyo mb-2";
    categoria.innerText = producto.categoria;
    cuerpo.appendChild(categoria);

    let titulo = document.createElement("h3");
    titulo.className = "h5 fw-bold";
    titulo.innerText = producto.nombre;
    cuerpo.appendChild(titulo);

    let descripcion = document.createElement("p");
    descripcion.className = "text-secondary";
    descripcion.innerText = producto.descripcion;
    cuerpo.appendChild(descripcion);

    let precio = document.createElement("div");
    precio.className = "price";
    precio.innerText = formatoPrecio(producto.precio);
    cuerpo.appendChild(precio);

    tarjeta.appendChild(cuerpo);
    columna.appendChild(tarjeta);
    return columna;
}

function cargarProductos(filtro = "Todos"){
    let contenedor = document.getElementById("contenedorProductos");
    if(!contenedor){ return; }

    contenedor.innerHTML = "";

    respuestaAPI.data.forEach((producto) => {
        if(filtro === "Todos" || producto.categoria === filtro){
            contenedor.appendChild(crearProducto(producto));
        }
    });
}

function cargarCategorias(){
    let contenedor = document.getElementById("categorias");
    if(!contenedor){ return; }

    let categorias = ["Todos"];
    respuestaAPI.data.forEach((producto) => {
        if(!categorias.includes(producto.categoria)){
            categorias.push(producto.categoria);
        }
    });

    categorias.forEach((categoria) => {
        let boton = document.createElement("button");
        boton.type = "button";
        boton.className = "category-pill me-2 mb-2";
        boton.innerText = categoria;

        boton.addEventListener("click", function(){
            document.querySelectorAll(".category-pill").forEach((item) => item.classList.remove("active"));
            boton.classList.add("active");
            cargarProductos(categoria);
        });

        contenedor.appendChild(boton);
    });
}

function buscarProductos(){
    let buscador = document.getElementById("txtBuscar");
    let contenedor = document.getElementById("contenedorProductos");
    if(!buscador || !contenedor){ return; }

    let texto = buscador.value.toLowerCase();
    contenedor.innerHTML = "";

    respuestaAPI.data.forEach((producto) => {
        if(producto.nombre.toLowerCase().includes(texto) ||
           producto.categoria.toLowerCase().includes(texto)){
            contenedor.appendChild(crearProducto(producto));
        }
    });
}

function enviarContacto(event){
    event.preventDefault();
    let nombre = document.getElementById("nombre").value;
    let email = document.getElementById("email").value;
    let mensaje = document.getElementById("mensaje").value;
    let alerta = document.getElementById("alertaContacto");

    try{
        if(nombre.trim() === "" || email.trim() === "" || mensaje.trim() === ""){
            throw new Error("Completa todos los campos.");
        }

        alerta.className = "alert alert-success mt-3";
        alerta.innerText = "¡Gracias " + nombre + "! Recibimos tu mensaje.";
        document.getElementById("formContacto").reset();
    }catch(err){
        alerta.className = "alert alert-danger mt-3";
        alerta.innerText = "Error: " + err.message;
    }
}

document.addEventListener("DOMContentLoaded", function(){
    cargarProductos();
    cargarCategorias();

    let buscador = document.getElementById("txtBuscar");
    if(buscador){
        buscador.addEventListener("input", buscarProductos);
    }

    let formulario = document.getElementById("formContacto");
    if(formulario){
        formulario.addEventListener("submit", enviarContacto);
    }
});
