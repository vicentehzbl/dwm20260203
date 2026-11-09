# Módulo 10 — Backend completo e integración verificable

Caso: Tokyo Noodles. El backend integra API Gateway (`4000`), GraphQL privado (`4200`), Auth/Clients (`4103`), Inventory (`4101`), Orders (`4102`) y Payments (`4104`). Cada proceso enlaza a `127.0.0.1`; solo el Gateway es la URL de la aplicación web. Los servicios internos exigen un token de servicio distinto por integración. GraphQL combina Orders e Inventory y continúa limitado por los controles M8. La decisión M9 justifica no desplegar analítica ni gRPC para los volúmenes y flujos actuales.

## Inicio, datos y detención

Requisitos: Node.js 20+, npm compatible y PowerShell. `graphql` se fija en `16.14.2` en `package.json` y `package-lock.json`.

```powershell
cd "MODULO 3\backend"
npm ci
npm run prepare:local
node dev.js
```

`prepare:local` crea `backend/.env` una sola vez, genera referencias locales aleatorias independientes y asigna claves de cuentas ficticias. No se sobrescribe un archivo existente. Las variables y referencias requeridas aparecen sin valores reales en `.env.example`. El backend valida que los secretos de integración sean distintos antes de iniciar. Para cerrar, usa `Ctrl+C` en la terminal de `dev.js`; el proceso padre detiene sus servicios secundarios.

En otra terminal, desde la raíz del proyecto, publica solo el sitio:

```powershell
node M8/servidor-estatico-seguro.mjs
```

Abre `http://127.0.0.1:5500/`. Para que la cookie de sesión y CORS coincidan, sirve las páginas como `http://localhost:5500` si se cambia `CORS_ALLOWED_ORIGINS`, o usa el origen ya configurado en `.env`. El Gateway local escucha en `http://localhost:4000`.

Datos ficticios de prueba:

- Cliente: `cliente@tokyonoodles.test` / `TokyoDemo!Cliente2026`
- Inventario: `inventario@tokyonoodles.test` / `TokyoDemo!Inventario2026`
- Operaciones: `operaciones@tokyonoodles.test` / `TokyoDemo!Operaciones2026`
- Registro de cuenta de cliente: desde Pedido, correo nuevo y contraseña de 12+ caracteres.

En una segunda terminal, desde `MODULO 3/backend`, inicializa el catálogo y ejecuta las comprobaciones:

```powershell
npm run seed
npm run test:m7
npm run test:m8
npm run test:m10
npm run test:m9
```

Los stores persistentes están en `backend/data/` (excluidos del ZIP). El paquete educativo sí incluye `backend/.env` con secretos y cuentas locales ficticios; Git lo ignora por defecto y debe agregarse con `git add -f` si se requiere versionarlo para la demostración académica. Rótalo antes de reutilizarlo en otro entorno. Cada documento JSON declara `schemaVersion: 1`; `lib/store.js` aplica la migración compatible al cargar stores previos, valida arreglos raíz y guarda cada actualización mediante archivo temporal y renombrado atómico. Inventory, Orders, Payments y Clients administran archivos separados. El catálogo ficticio se siembra al primer acceso; los pedidos, eventos, ajustes, clientes registrados y mensajes se agregan durante los flujos. Para reiniciar datos locales, detén `dev.js` y elimina solo los archivos de `backend/data/`; el siguiente acceso vuelve a crear el catálogo inicial. Esto elimina pedidos y registros locales.

## Contratos relevantes

| Operación | Contrato público | Autorización / regla |
|---|---|---|
| Catálogo | `GET /api/v1/products?available=true&category=&q=` | Anónimo; proyecta atributos públicos, no stock físico. |
| Registro / sesión | `POST /api/v1/auth/registrations`, `POST /api/v1/auth/sessions`, `DELETE /api/v1/auth/sessions/current` | La clave se almacena como scrypt con salt; cookie de sesión HttpOnly, SameSite=Lax, expira en una hora. |
| Pedido | `POST /api/v1/orders` | Cliente; exige Idempotency-Key, verifica catálogo y reserva inventario. El servidor fija precio, subtotal y total. |
| Pago | `POST /api/v1/orders/{id}/payments` | Cliente titular; ignora importes/estado de pago enviados por el navegador. |
| Resultado de pago demo | `POST /api/v1/demo/payments/{paymentId}` | Adaptador académico; el Gateway firma internamente el evento HMAC; no procesa dinero. |
| Estado / seguimiento | `GET /api/v1/me/orders/{id}`, `POST /api/v1/graphql` | Cliente titular; un pedido ajeno se presenta como 404. GraphQL aplica schema, profundidad, costo, límite de body, paginación y timeout de M8. |
| Boletas / facturas | `GET /api/v1/me/invoices` | Solo lista documentos de pedidos pagados del titular. No emite DTE ni representa boleta fiscal del SII. |
| Inventario | `GET /api/v1/staff/inventory`, `POST /api/v1/staff/inventory/{id}/adjustments` | Roles inventory/operations para lectura; solo inventory ajusta; disponible no puede quedar bajo lo reservado. |
| Operaciones | `PUT /api/v1/staff/orders/{id}/status` | Solo operations y transiciones permitidas; conserva historial. |
| Cola de operaciones | `GET /api/v1/staff/orders` | Solo operations; hasta 100 pedidos recientes; no incluye cliente, dirección ni datos de pago. |
| Contacto | `POST /api/v1/contact-messages` | Anónimo con límite de tasa, validación de campos, persistencia local y borrado lógico por retención de 90 días. No envía email externo. |

El proveedor de pago externo y el servicio de correo no tienen credenciales de sandbox accesibles en este entorno. El adaptador de pago conserva el flujo `pending → confirmed/payment_failed`, autenticación del aviso por HMAC, ventana temporal, idempotencia y efecto de stock. Los pagos y mensajes no se presentan como integraciones reales de terceros. Los mensajes de contacto se conservan localmente por 90 días. No se usa tarjeta ni se guardan datos de tarjeta. Los documentos de venta son registros internos de pedido; la emisión tributaria, los PDF y la integración fiscal quedan fuera del prototipo.

## Matriz de trazabilidad y resultado

| Requisito | Pantalla | Servicio | Prueba | Resultado | Evidencia |
|---|---|---|---|---|---|
| Catálogo público | Inicio, Menú, Detalle | Inventory / GET products | M7 catálogo anónimo; M10 | PASS, seis productos | M7 consola; `Resultados-integracion.md` |
| Registro y autenticación | Pedido, Facturas, Inventario | Clients / registrations, sessions | M10 registro persistente, hash scrypt, sesión; M7 rol/sesión | PASS | salida de test:m10 y test:m7 |
| Pedidos e idempotencia | Pedido | Orders + Inventory | M10 total servidor, replay y conflicto; M7 proyección | PASS | `Resultados-integracion.md` |
| Stock y recuperación | Pedido, Inventario | Inventory reservations/adjustments | M10 falla pago libera reserva; M7 ajuste negativo no autorizado | PASS | salida de test:m10 y test:m7 |
| Pagos y duplicados | Checkout de prueba | Payments + Orders | M10 datos alterados ignorados, HMAC repetido deduplicado | PASS | salida de test:m10 |
| Seguimiento y privacidad | Seguimiento | GraphQL → Orders + Inventory | M8 titular, rol, batching, límites, error parcial y acceso directo | PASS, 10 comprobaciones | `M8/Resultados-validacion.md` |
| Boletas / facturas del titular | Facturas | Orders / invoices | M10 lista solo del titular | PASS | salida de test:m10 |
| Administración | Inventario, operaciones | Inventory, Orders | M7 rol, transición, DTO mínimo; M10 lista operacional | PASS | `M7/Validacion-backend.md`, salida de test:m10 |
| Mensajes de contacto | Contacto | Clients / messages | M10 validación y escritura persistente | PASS | salida de test:m10 |
| Preflight del navegador | Pedido | API Gateway / CORS | M10 permite `Idempotency-Key` solo en creación y rechaza headers arbitrarios | PASS | salida de test:m10 |
| Carga prevista | Seguimiento | Gateway + GraphQL | M9, 20 requests, concurrencia 4 | PASS: 20/20 HTTP 200, 0 errores, p95 82,16 ms | `M9/Resultados-carga.md`, `M9/evidencia-carga.json` |

## Despliegue y límites

En este paquete el despliegue reproducible usa procesos Node locales; los puertos privados quedan ligados a loopback y no se publican en la interfaz del navegador. El API Gateway valida sesión y rol y emite identidad interna; los servicios vuelven a verificar el token específico, y los sistemas de dominio validan propiedad/estado. `GET /health` del Gateway comprueba dependencias; las respuestas incluyen `X-Request-Id` y los logs estructurados del Gateway registran ID, ruta, método, estado y duración, sin cabeceras, cuerpos, secretos ni datos personales.

El administrador de secretos es el adaptador `lib/secret-provider.js`; en desarrollo resuelve referencias desde variables de entorno que solo se pasan al proceso consumidor. Para producción se debe enlazar un gestor de secretos, TLS/mTLS, rate limiting distribuido, rotación y despliegue de red privada. No se afirma que el prototipo local sea un entorno productivo ni que un proveedor externo esté conectado.
