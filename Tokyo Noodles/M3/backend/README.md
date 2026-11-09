# Backend local del Módulo 3

Implementa un API Gateway, cuatro subsistemas transaccionales privados (`inventory`, `orders`, `clients`, `payments`) y un GraphQL Gateway privado. Es una implementación académica local; no usar con datos reales ni exponer a Internet.

El Gateway aplica las rutas/métodos permitidos de `gateway-policy.js`, rate limit local por ruta, validación de sesión/rol, timeout a dependencias y logs JSON sin cookies, tokens, cuerpos o parámetros de consulta. No realiza redirección genérica a destinos elegidos por quien llama.

## Requisitos

- Node.js 20 o superior y npm.
- Una terminal abierta en esta carpeta (`MODULO 3/backend`).
- `npm ci` instala GraphQL.js según la versión fijada en `package-lock.json`.

## Preparar y arrancar

1. Copia `.env.example` a `.env`.
2. Reemplaza todos los textos `replace-...` y `change-this-...` por valores locales secretos. Cada variable `*_TOKEN` debe tener un valor aleatorio distinto. Guarda `.env` sin subirlo al repositorio.
3. Ejecuta `npm ci` la primera vez.
4. Ejecuta `node dev.js`. El comando inicia seis procesos y muestra sus registros.
5. Abre `http://127.0.0.1:4000/health`. Para apagar todos los procesos, usa `Ctrl+C`.

Las cuentas configuradas en `DEMO_CLIENT_EMAIL` / `DEMO_CLIENT_PASSWORD`, `DEMO_INVENTORY_EMAIL` / `DEMO_INVENTORY_PASSWORD` y `DEMO_OPERATIONS_EMAIL` / `DEMO_OPERATIONS_PASSWORD` son usuarios locales de demostración con roles separados. No existe una pantalla pública de registro. El Gateway escucha solo en `127.0.0.1`.

## Rutas locales del Gateway

| Método y ruta | Contrato M1 | Acceso |
|---|---|---|
| `GET /api/v1/products?available=true` | S01 | Público. |
| `GET /api/v1/products/{id}` | S02 | Público. |
| `POST /api/v1/auth/sessions` | S03 | Correo y clave de cuenta local; devuelve cookie HttpOnly. |
| `POST /api/v1/orders` | S07 | Sesión de cliente; exige cabecera `Idempotency-Key`. |
| `GET /api/v1/me/orders/{id}` | S10 | Sesión del titular. |
| `POST /api/v1/graphql` | M8-A01 / lectura de M1 S10 | Sesión `customer`; compone el resumen del pedido propio con fichas públicas de Inventory. |
| `POST /api/v1/orders/{id}/payments` | S08 | Sesión del titular. Devuelve URL local de demostración, no cobra dinero. |
| `POST /api/v1/integrations/payments/demo/events` | S09 | Firma HMAC en `X-Payment-Signature`; sin firma válida no acepta el evento. |
| `GET /api/v1/staff/inventory` | S11 | Sesión de personal autorizado. |
| `POST /api/v1/staff/inventory/{id}/adjustments` | S12 | Personal con rol de inventario. |
| `PUT /api/v1/staff/orders/{id}/status` | S13 | Personal autorizado; respeta las transiciones. |

### Ejemplo de sesión local

En PowerShell, después de arrancar el backend:

```powershell
$login = Invoke-WebRequest -Method Post -Uri http://127.0.0.1:4000/api/v1/auth/sessions `
  -ContentType 'application/json' `
  -Body '{"email":"cliente@tokyonoodles.test","password":"LA_CLAVE_QUE_CONFIGURASTE"}' `
  -SessionVariable tn
$login.Content
```

Luego, puedes crear un pedido de demostración autenticado reutilizando `$tn`:

```powershell
$pedido = Invoke-WebRequest -Method Post -Uri 'http://127.0.0.1:4000/api/v1/orders' `
  -WebSession $tn `
  -Headers @{ 'Idempotency-Key' = 'pedido-demo-001' } `
  -ContentType 'application/json' `
  -Body '{"items":[{"productId":1,"quantity":1}],"fulfillment":"pickup","documentType":"boleta"}'
$pedido.Content
```

La clave `pedido-demo-001` se usa como ejemplo; cambia su valor en cada pedido distinto. El total y el precio se calculan dentro del servidor. Para inspeccionar el catálogo público usa `GET http://127.0.0.1:4000/api/v1/products?available=true`.

## Privacidad y almacenamiento

- Solo el Gateway recibe llamadas del navegador. Los procesos de microservicio se enlazan a `127.0.0.1` en esta ejecución local y requieren un `X-Service-Token` específico para el llamador y alcance de cada ruta. El receptor vuelve a validar rol, propiedad y reglas de negocio.
- El GraphQL Gateway privado escucha en `127.0.0.1:4200`; el browser accede solo a `POST /api/v1/graphql` en el API Gateway `127.0.0.1:4000`. La policy exige sesión customer. La agregación consulta Orders e Inventory por HTTP interno y no lee archivos de datos ajenos.
- Las credenciales GraphQL son independientes: `GATEWAY_GRAPHQL_TOKEN`, `GRAPHQL_ORDERS_READ_TOKEN` y `GRAPHQL_INVENTORY_READ_TOKEN`. El schema es de solo lectura, limita introspección, páginas a 20, profundidad a 6, costo a 250, query a 8 KiB y body a 16 KiB. Orders revalida titularidad; Inventory responde solo atributos públicos.
- Para integrar el browser local, sirve únicamente `docs/` con Live Server en `localhost:5500` o `127.0.0.1:5500`; esos orígenes son los valores CORS predeterminados. No uses la raíz del repositorio como webroot mientras exista `.env`. En otro puerto define `CORS_ALLOWED_ORIGINS` con la lista exacta.
- Las referencias simbólicas de `.env.example` separan Gateway → Inventory lectura/ajustes, Orders → Inventory lectura/reserva, Gateway → Clients, Gateway → Orders creación/lectura/operaciones, Payments → Orders, y Gateway → Payments API/eventos. No reutilices valores. `.env.example` contiene placeholders, nunca credenciales válidas.
- `dev.js` valida que los secretos técnicos, de sesión y webhook sean distintos y entrega a cada proceso solo las variables que necesita. El proceso supervisor carga `.env` para iniciar; los procesos secundarios reciben conjuntos separados.
- Cada servicio crea su propio archivo de datos en `data/`. Los archivos se ignoran en Git para no subir información de sesión/pedidos locales.
- En producción deben usarse una red privada, identidad de servicio administrada o mTLS, TLS, almacén de secretos, rotación y bases transaccionales. No se publica la configuración `.env`. El prototipo local no tiene Vault ni rotación automatizada.
- El checkout simulado no permite confirmar un pago desde la pantalla de retorno; el estado solo cambia con evento firmado y procesado por `payments`.

## Limitaciones de este avance

La versión local no incluye proveedor de pago real, emisor DTE, envío de mensajes, S04, S05/S06, interfaz de personal, rate limiting distribuido, almacenamiento SQL ni una cola durable. Esas integraciones y el despliegue final se completan en M10. La persistencia JSON es útil para revisar propiedad de datos y flujo, pero no ofrece las transacciones y concurrencia de un sistema de producción.

El detalle GraphQL, la pantalla Seguimiento, sus políticas y el verificador están en `M8/` desde la raíz del proyecto. `npm run test:m8` ejecuta la integración contra el backend ya iniciado.

La aplicabilidad de analítica y gRPC está documentada en `M9/ADR-M9-Analitica-y-gRPC.md`. En la carga prevista del caso no se justifica un subsistema analítico ni una RPC interna: las lecturas son pequeñas, puntuales y request/response. `npm run test:m9` ejecuta el perfil de 20 consultas, mientras que `powershell -ExecutionPolicy Bypass -File .\M9\medir-carga.ps1` también recoge CPU y memoria del backend desde la raíz del proyecto. La medición crea un pedido de demostración y no representa capacidad de producción.
