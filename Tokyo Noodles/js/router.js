
function obtenerParametrosURL() {
    const parametrosURL = new URLSearchParams(window.location.search);

    return {
        categoria: parametrosURL.get("categoria"),
        busqueda: parametrosURL.get("q"),
        productoId: parametrosURL.get("productoId")
    };
}
