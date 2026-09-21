Integrantes: Vicente Hormazábal Pacheco    

Restaurante de ramen “Tokyo Noodles” – ramen y gyozas.

**Tecnologías:** HTML5, PHP, CSS3, Bootstrap 5.3.8, JavaScript y JSON. El proyecto está dividido en las vistas 
`index.php`, `productos.php`, `empresa.php`, `servicios.php` y `contacto.php`, con los estilos en `css/style.css` 
y la lógica JavaScript separada en `router.js`, `api.js` y `app.js`. Los datos de productos se encuentran actualmente 
en `api/gateway.json` y `api/productos.json`, simulando una API Gateway y una API normal. 
`router.js` obtiene los parámetros de la URL mediante `URLSearchParams`, permitiendo trabajar con `categoria`, `q` y `productoId` 
para filtros, búsquedas y detalles. `api.js` realiza las peticiones mediante `fetch()` y procesa las respuestas de las APIs, mientras que `app.js` 
se encarga del renderizado dinámico de productos, categorías, búsquedas, filtros y formularios. La navegación y las funcionalidades principales se controlan 
mediante parámetros en la URL, dejando la estructura preparada para conectar posteriormente un backend real.

https://github.com/vicentehzbl/dwm20260203
