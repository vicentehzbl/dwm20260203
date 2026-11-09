# Módulo 8 — Separación privada y agregaciones GraphQL

Caso: **Tokyo Noodles**. Esta carpeta contiene el borrador del módulo, la consulta de referencia, una respuesta ficticia, el mapa de componentes y el verificador de integración. El schema y sus resolvers ejecutables están en `MODULO 3/backend/graphql-gateway/`.

## Archivos

- `Modulo-8-Separacion-y-GraphQL.md`: decisiones, matriz de sistemas, seguridad, controles y resultados.
- `mapa-componentes.mmd`: mapa Mermaid editable de la frontera pública y los subsistemas privados.
- `consulta-prueba.graphql`: consulta usada por la pantalla Seguimiento.
- `respuesta-ficticia.json`: forma esperada de la respuesta con datos inventados.
- `Resultados-validacion.md`: resultados observados del backend y la frontera estática.
- `verificar-integracion.mjs`: ejecuta las comprobaciones de autorización, agregación, paginación y fallo parcial.
- `servidor-estatico-seguro.mjs`: servidor que publica únicamente `docs/` para no exponer por accidente el `.env` del backend.

## Ejecución local

1. Requiere Node.js 20 o superior.
2. En `MODULO 3/backend`, ejecuta `npm ci` una vez.
3. Copia `.env.example` a `.env`, cambia cada placeholder por un valor aleatorio local distinto y configura las tres cuentas demo.
4. Desde esa carpeta, inicia `node dev.js`.
5. Sirve **solo `docs/`** con Live Server, por ejemplo en `http://127.0.0.1:5500`; entra a Seguimiento, inicia sesión y consulta un pedido propio. Como alternativa, desde la raíz ejecuta `node M8/servidor-estatico-seguro.mjs` y abre `http://127.0.0.1:5500/seguimiento.html`.
6. Para probar automáticamente, desde la raíz ejecuta `node M8/verificar-integracion.mjs`. El script crea un pedido ficticio de seis líneas, muestra su ID y luego verifica la agregación. No imprime cookies ni credenciales.

No sirvas la raíz del repositorio con un servidor estático cuando exista un `.env` local. GitHub Pages sigue siendo estático y no ejecuta Node. Para usar Seguimiento fuera del entorno local se debe desplegar el backend con HTTPS, red privada y configuración de origen/cookie adecuada; esta carpeta no afirma que ese despliegue exista.
