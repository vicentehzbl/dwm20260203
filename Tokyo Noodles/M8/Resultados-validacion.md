# Resultados de validación M8

**Fecha:** 9 de noviembre de 2026.  
**Entorno:** Node.js v24.22.1; API Gateway local `127.0.0.1:4000`; GraphQL privado `127.0.0.1:4200`; Inventory `4101`; Orders `4102`; Clients `4103`; Payments `4104`.  
**Datos:** pedido de demostración de seis líneas, cuentas demo y tokens generados temporalmente; no se guardan credenciales en este informe. Los archivos JSON de prueba se eliminaron al finalizar.

## Pruebas de integración

Comando reproducible, con backend iniciado y `.env` local configurado desde `.env.example`:

```text
node M8/verificar-integracion.mjs
```

Resultado observado: **10/10 PASS**.

| # | Comprobación | Resultado observado |
|---:|---|---|
| 1 | API Gateway y dependencias | HTTP 200; los cinco servicios detrás del Gateway reportaron health activo. |
| 2 | Sesión anónima y headers de identidad falsificados | HTTP 401; el Gateway no aceptó `X-Verified-Client-Id`/`X-Verified-Role` enviados por el cliente. |
| 3 | Llamadas directas a GraphQL, Inventory y Orders | HTTP 401 en los tres servicios sin token técnico. |
| 4 | Agregación desde el endpoint externo del Gateway | HTTP 200; el pedido ficticio `ord_26efa19a-1f21-4972-8d92-14ccc1ff62b7` combinó estado/líneas de Orders con fichas públicas de Inventory. `catalogStatus=AVAILABLE`; no aparecieron titular, dirección, facturación, expiración de pago, stock, reservas o tokens. |
| 5 | Paginación | Página 1 devolvió 5 de 6 líneas; cursor de página 2 devolvió 1 línea y `hasNextPage=false`. |
| 6 | Consulta de pedido ajeno | Orders devolvió `ORDER_NOT_FOUND`; GraphQL dejó `myOrderSummary: null`, sin revelar si el ID existe. |
| 7 | Rol personal en operación de cliente | HTTP 403. |
| 8 | Campos inexistentes, introspección, `first=21` y consulta de costo mayor a 250 | HTTP 400 en las cuatro solicitudes. |
| 9 | CORS | Origen local permitido: preflight HTTP 204 con credenciales; origen no autorizado: HTTP 403. |
| 10 | Falla de Inventory | En una segunda instancia privada de prueba con Inventory inaccesible, el pedido de Orders se conservó; los productos quedaron nulos y GraphQL informó `CATALOG_PARTIAL`. |

El script imprimió un PASS por caso, un ID ficticio y el resultado de paginación. No imprime emails, contraseñas, cookies ni tokens. La instancia secundaria para simular caída de Inventory se cierra al terminar la prueba.

Además, `schema.graphql` se comparó con el schema ejecutable y coincidieron los nombres de tipos, campos, tipos de campo y valores de enum.

## Pantalla estática y frontera de publicación

El servidor M8 se probó localmente con `GET /seguimiento.html` y recibió HTTP 200; el HTML contiene el formulario `tracking-login`. `GET /pedido.html` también devolvió HTTP 200 e incluye un enlace a Seguimiento. Se intentó solicitar la ruta de `.env` por el servidor estático limitado a `docs/`: respuesta 404. Así no se publica el archivo de configuración por servir el frontend.

La prueba automatizada ejecuta la operación contra la misma ruta pública que llama `js/seguimiento.js` (`POST /api/v1/graphql`). No automatiza la interacción gráfica del navegador. La apertura visual se intentó con Computer Use, pero el control terminó porque no pudo determinar con suficiente certeza la URL actual del navegador; por eso no se declara una captura de pantalla o clic de navegador como evidencia. La integración del formulario está implementada y puede revisarse abriendo `docs/` con Live Server y pegando el ID impreso por el verificador.

## Alcance

Estas son pruebas de integración locales, no evidencia de backend desplegado en Internet ni de servicio administrado de secretos. Los microservicios corrieron en loopback y usaron stores JSON de demostración. Los secretos efímeros y los datos JSON generados se retiraron al cerrar la ejecución.
