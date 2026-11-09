# Tokyo Noodles

Aplicación web responsiva de restaurante japonés con frontend estático y backend local de microservicios. Este repositorio contiene el proyecto actualizado a Módulo 10, su documentación técnica, los diagramas editables y pruebas reproducibles.

**Autor:** Vicente Hormazábal  
**Frontend:** HTML5, CSS3, Bootstrap 5.3.8 y JavaScript  
**Backend:** Node.js 20+, API REST, GraphQL.js 16.14.2 y persistencia JSON por servicio  
**Estado:** prototipo académico integrado para ejecución local. La entrega no representa un despliegue productivo.

## Qué hace

- Publica un catálogo de ramen, gyozas y combos desde Inventory.
- Permite registrar e iniciar sesión con cuentas de cliente y personal.
- Crea pedidos con totales calculados en el servidor, claves idempotentes y reservas de stock.
- Inicia un checkout de prueba con eventos HMAC, estados de pago y liberación o consumo de stock.
- Muestra el seguimiento del pedido propio mediante una agregación GraphQL de Orders e Inventory.
- Ofrece historial de documentos internos propios, herramientas de inventario y operaciones de pedidos.
- Recibe mensajes de contacto con validación, persistencia local y retención de 90 días.

## Arquitectura

```text
Navegador → API Gateway :4000 → Clients :4103
                              → Inventory :4101
                              → Orders :4102 ↔ Inventory :4101
                              → Payments :4104 → Orders :4102
              API Gateway → GraphQL privado :4200 → Orders + Inventory
```

Los servicios se ejecutan como procesos separados y escuchan solo en `127.0.0.1`. El navegador conoce únicamente el Gateway. Los servicios validan credenciales técnicas, roles, titularidad, stock y transiciones. El GraphQL Gateway está limitado a una operación de lectura con autorización, batching, paginación y límites de costo/profundidad.

## Ejecución local

Requiere Node.js 20 o superior y PowerShell. Abre dos terminales desde la raíz del proyecto.

**Backend:**

```powershell
cd "MODULO 3\backend"
npm ci
npm run prepare:local
node dev.js
```

El paquete educativo incluye `MODULO 3/backend/.env` con valores locales ficticios para facilitar la demostración. El archivo está ignorado por Git; para incluirlo expresamente en el repositorio académico se debe usar `git add -f "MODULO 3/backend/.env"`. No reutilices estos valores fuera de la demostración, y rótalos si el repositorio se hará público. `prepare:local` genera otro `.env` aleatorio y no sobrescribe uno existente. Los datos generados en `backend/data/` siguen excluidos del paquete.

**Frontend:**

```powershell
node M8/servidor-estatico-seguro.mjs
```

Abre `http://localhost:5500/`. Este servidor publica exclusivamente `docs/`, no los secretos del backend. El API Gateway responde en `http://localhost:4000`. Para otro hostname, ajusta `CORS_ALLOWED_ORIGINS` en el `.env` local.

## Cuentas ficticias

El script local configura estas cuentas para demostración:

| Rol | Correo | Contraseña |
|---|---|---|
| Cliente | `cliente@tokyonoodles.test` | `TokyoDemo!Cliente2026` |
| Inventario | `inventario@tokyonoodles.test` | `TokyoDemo!Inventario2026` |
| Operaciones | `operaciones@tokyonoodles.test` | `TokyoDemo!Operaciones2026` |

También se puede registrar una cuenta nueva desde la pantalla Pedido. Las contraseñas de cuentas registradas se guardan con scrypt y salt.

## Pruebas

Con el backend activo, desde otra terminal:

```powershell
cd "MODULO 3\backend"
npm run seed
npm run test:m7
npm run test:m8
npm run test:m10
npm run test:m9
```

La última medición reportada completó M7 (7 controles), M8 (10 comprobaciones), M10 (10 pruebas) y una carga GraphQL de 20/20 solicitudes con concurrencia 4. El p95 fue 82,16 ms en una ráfaga local; no es una proyección de capacidad productiva. Los resultados están en `M10/Resultados-integracion.md` y `M9/Resultados-carga.md`.

## Datos y contratos

Cada subsistema mantiene su propio archivo JSON bajo `MODULO 3/backend/data/`. `schemaVersion: 1` permite migración de forma al cargar; las escrituras usan archivo temporal y renombrado atómico. El catálogo ficticio se crea al primer acceso. `npm run seed` verifica el catálogo y `npm run test:m10` recorre registro, compra, pago, stock, propiedad, contacto y roles.

Los contratos REST y sus ejemplos ficticios están en `MODULO 1/Modulo-1-Tokyo-Noodles.md`; los contratos GraphQL, reglas de autorización y límites están en `M8/Modulo-8-Separacion-y-GraphQL.md`. Las rutas exactas se mantienen en `MODULO 3/backend/gateway-policy.js`.

## Estructura del proyecto

- `index.html`, `productos.html`, `detalle.html`, `pedido.html`, `seguimiento.html`, `facturas.html`, `contacto.html`: pantallas del cliente.
- `admin/`: pantallas de inventario y operaciones.
- `js/`, `css/`: frontend fuente; `docs/` es su copia para publicación estática.
- `MODULO 3/backend/`: API Gateway, Auth/Clients, Inventory, Orders, Payments y GraphQL Gateway.
- `MODULO 1/`, `UML MODULO 2/`, `M4`–`M10/`: requisitos, contratos, UML, arquitectura, seguridad, pruebas e informe.
- `INFORME-BACKEND-M1-M10.md` (editable) y `INFORME-BACKEND-M1-M10.pdf` (entrega)`: informe técnico completo de la entrega.

## Limitaciones conocidas

- El pago es un adaptador de prueba: no procesa dinero ni recibe tarjetas.
- El historial genera documentos internos de compra; no emite DTE/SII ni PDF tributarios.
- Contacto guarda mensajes localmente, pero no los envía por correo.
- La persistencia JSON sirve para la demostración local, no para transacciones distribuidas ni operación productiva multiinstancia.
- El adaptador de secretos usa variables de entorno en desarrollo. Para producción se requiere un gestor de secretos, TLS/mTLS, almacenamiento transaccional, rotación, observabilidad y despliegue privado.
- M9 justifica no añadir Analytics ni gRPC para la carga y los flujos actuales. La decisión se reabre si cambian los requisitos o las mediciones.

## Documentación principal

- [Informe técnico M1–M10 editable](INFORME-BACKEND-M1-M10.md)
- [Informe técnico M1–M10 en PDF](INFORME-BACKEND-M1-M10.pdf)
- [Guía de integración M10](M10/README.md)
- [Resultados de pruebas](M10/Resultados-integracion.md)
- [ADR y resultados de carga M9](M9/ADR-M9-Analitica-y-gRPC.md)

## Publicar en GitHub para fines académicos

El backend ignora `.env` por defecto. Para incluir deliberadamente el archivo de demostración en este repositorio educativo, desde la raíz ejecuta `git add -A` y luego `git add -f "MODULO 3/backend/.env"`. Revisa `git status` antes del commit. El `.env` del paquete contiene únicamente valores generados y cuentas ficticias; no lo conectes a servicios reales y rótalo si cambias el entorno.

