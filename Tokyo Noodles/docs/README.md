# Tokyo Noodles — sitio estático

Esta carpeta contiene la versión web estática para GitHub Pages. Para publicarla, selecciona `docs/` como carpeta del sitio. GitHub Pages no ejecuta Node.js ni los servicios privados.

El catálogo y las páginas públicas funcionan como frontend estático. Seguimiento tiene una integración con `POST /api/v1/graphql` cuando se abre con Live Server y el backend local está activo. En Pages, esa pantalla solo podrá consultar datos si se despliega por separado un API Gateway HTTPS y se configura el origen permitido; no contiene secretos ni URL interna de servicios.

Los borradores y la ejecución del backend se encuentran en la raíz del proyecto, fuera de `docs/`. Las instrucciones y pruebas M8 están en `M8/` y `MODULO 3/backend/README.md`.
