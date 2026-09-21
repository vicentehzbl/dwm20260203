const API_GATEWAY_URL = "api/gateway.json";
const API_NORMAL_URL = "api/productos.json";

async function consultarAPI(url) {
    try {
        const respuesta = await fetch(url);

        if (!respuesta.ok) {
            throw new Error("Error HTTP: " + respuesta.status);
        }

        return await respuesta.json();

    } catch (error) {
        console.error("Error al consultar:", url);
        console.error(error);

        return null;
    }
}

async function obtenerProductos() {
    const datos = await consultarAPI(API_GATEWAY_URL);

    if (!datos) {
        return [];
    }

    if (datos.status !== 200) {
        console.error("Error del API Gateway:", datos.message);
        return [];
    }

    console.log("API Gateway:", datos.message);

    return datos.data || [];
}

async function obtenerProductosAPI() {
    const datos = await consultarAPI(API_NORMAL_URL);

    if (!datos) {
        return [];
    }

    if (datos.status !== 200) {
        console.error("Error de la API normal:", datos.message);
        return [];
    }

    console.log("API normal:", datos.message);

    return datos.data || [];
}

