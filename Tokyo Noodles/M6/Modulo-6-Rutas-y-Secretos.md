# Módulo 6 — Rutas y secretos de integración

**Caso:** Tokyo Noodles.  
**Propósito:** documentar cómo llega una solicitud externa al sistema que responde y qué identidad permite cada tramo.  
**Base de trazabilidad:** contratos S01–S14 de M1, roles y condiciones de M4, sistemas de M3 y políticas/rutas de M5.
**Estado al cierre de M6:** diseño completado para las rutas REST implementadas; secretos separados en el backend local. En ese momento GraphQL y gRPC quedaban fuera de servicio. M8 implementa una operación GraphQL privada, añade sus rutas y referencias de secreto. S04–S06 siguen pendientes de implementación y por tanto no se exponen.

## 1. Cómo leer este módulo

- **Ruta externa:** método y URL que puede llamar el navegador o proveedor.
- **Destino interno:** endpoint fijo que el Gateway selecciona. El cliente nunca elige host o endpoint.
- **Credencial de usuario:** cookie de sesión que identifica al cliente o trabajador. Sirve para decidir quién puede actuar y sobre qué recurso.
- **Credencial de servicio:** token técnico del tramo entre dos componentes. Autoriza a un sistema a llamar operaciones concretas; no representa al cliente.
- **Transformación:** validación, filtrado o dato confiable que el Gateway agrega antes de enviar la solicitud.
- **Referencia simbólica:** nombre del secreto (por ejemplo `PAYMENTS_ORDERS_TOKEN`), nunca su valor.

Una solicitud autenticada conserva dos contextos separados: el Gateway valida la cookie con `clients` y deriva el identificador de usuario desde esa respuesta confiable; luego envía ese identificador en una cabecera interna junto con la credencial técnica del llamador. El servicio receptor valida la credencial técnica y vuelve a comprobar propiedad/rol/estado. El Gateway no reenvía `X-Client-Id`, `X-Actor-Id` ni `X-Actor-Role` aportados por el navegador: los construye desde la sesión ya verificada.

## 2. Decisiones de arquitectura

1. Hay **un API Gateway REST externo**. Mantiene la lista de rutas y verbos admitidos. Los sistemas internos no se publican como destinos de red pública; en la implementación local escuchan en `127.0.0.1` y la aplicación usa URLs internas configuradas.
2. Cada integración tiene credenciales diferentes por consumidor y propósito. Las credenciales no se comparten entre Inventory, Orders, Clients y Payments. Un token de pagos no concede administración de inventario.
3. Para el prototipo se usan referencias en variables de entorno cargadas desde `MODULO 3/backend/.env`, archivo ignorado por Git. En producción se propone un gestor como Vault/Secret Manager, identidad de workload y TLS/mTLS. El gestor aún no está desplegado; no se afirma rotación automatizada.
4. El proveedor de pago firma el webhook; `payments` valida su firma HMAC, fecha e identificador de evento. El Gateway lo encamina, pero no declara un pago exitoso.
5. No hay base de datos externa: cada servicio mantiene archivos JSON locales. Si se agrega una base, su credencial debe consumirla solamente el servicio dueño de esos datos, no el navegador ni el Gateway.
6. Solo se configura `GET`, `POST`, `PUT` o `DELETE` donde lo requiere el contrato activo. No se habilitan `PATCH` o `DELETE` para borrar pedidos, productos o facturas. La anulación de pedido conserva su historial y debe seguir una transición de negocio.

## 3. Matriz de rutas externas REST

Las referencias de permiso M4 identifican las condiciones relevantes del rol: público, sesión del titular, personal de inventario u operaciones, o proveedor firmado. Las cuotas de la tabla son los límites locales de M5; hoy son por proceso/origen, no distribuidos.

| ID | Gateway | Verbo | Ruta externa | Permiso M4 relacionado | Sistema y ruta destino | Transformación y controles | Referencia de credencial |
|---|---|---|---|---|---|---|---|
| S01 | REST externo | GET | `/api/v1/products` | M4 S01: Visitante, GET permitido; campos públicos | inventory `GET /internal/catalog` | Solo pasa `available`, `category`, `q`; valida filtros, DTO público, límite 60/min, timeout y 503 si no responde. | `GATEWAY_INVENTORY_READ_TOKEN` |
| S02 | REST externo | GET | `/api/v1/products/{id}` | M4 S02: Visitante, GET permitido; solo ficha pública | inventory `GET /internal/catalog/{id}` | El ID debe ser numérico; no devuelve stock exacto ni atributos internos; límite 60/min. | `GATEWAY_INVENTORY_READ_TOKEN` |
| S03 | REST externo | POST | `/api/v1/auth/sessions`, `/api/v1/auth/registrations` | M4 S03: anónimo puede autenticar o registrar; POST permitido | clients `POST /internal/sessions`, `/internal/registrations` | Contraseña viaja solo por cuerpo y se almacena con scrypt+salt; Gateway devuelve cookie HttpOnly, nunca contraseña/token en JSON; límites por ruta. | `GATEWAY_CLIENTS_TOKEN`; `SESSION_SECRET` pertenece a clients |
| S03 (salida) | REST externo | DELETE | `/api/v1/auth/sessions/current` | M4 política de sesión: cierre de cookie del propio usuario; endpoint auxiliar no listado como operación CRUD M1 | Sin llamada interna; el Gateway expira la cookie local | No invalida sesión persistida; revocación remota queda como brecha de Auth. Límite 20/min. | Cookie de usuario; no usa token entre sistemas |
| S07 | REST externo | POST | `/api/v1/orders` | M4 S07: cliente autenticado, crea para sí; POST permitido | orders `POST /internal/orders` | Gateway agrega `X-Client-Id` de sesión verificada y `Idempotency-Key`; Orders valida líneas, calcula precios/total, consulta/reserva Inventory; límite 20/min. | `GATEWAY_ORDERS_CREATE_TOKEN`; Orders usa `ORDERS_INVENTORY_READ_TOKEN` para catálogo y `ORDERS_INVENTORY_TOKEN` para reservas |
| S10 | REST externo | GET | `/api/v1/me/orders/{id}` | M4 S10: cliente autenticado y titular; GET permitido | orders `GET /internal/orders/{id}` | Gateway crea `X-Client-Id` verificado; Orders vuelve a comparar dueño y devuelve DTO mínimo; ocultar existencia ajena con 404; límite 60/min. | `GATEWAY_ORDERS_READ_TOKEN` + cookie de usuario |
| M8-A01 (M1 S10) | API Gateway REST externo | POST | `/api/v1/graphql` | M4 S10: customer autenticado; solo resumen de pedido propio | GraphQL privado `POST /graphql`; resolver llama Orders `GET /internal/orders/{id}/graphql-summary` y una sola vez Inventory `POST /internal/catalog/batch` | Gateway verifica sesión/rol, descarta identidad entrante, reenvía `X-Verified-*` derivado; GraphQL limita schema/costo/página; Orders revalida titular; batch devuelve campos públicos. 30/min, timeout total 3,5 s. | Cookie de usuario + `GATEWAY_GRAPHQL_TOKEN`; GraphQL → Orders `GRAPHQL_ORDERS_READ_TOKEN`; GraphQL → Inventory `GRAPHQL_INVENTORY_READ_TOKEN` |
| S08 | REST externo | POST | `/api/v1/orders/{id}/payments` | M4 S08: cliente autenticado, dueño y pedido pagable; POST permitido | payments `POST /internal/orders/{id}/payments`; después payments llama a orders `GET /internal/orders/{id}/payment-context` y `POST .../register-payment` | Gateway añade identidad verificada; Payments consulta contexto mínimo, verifica estado/vencimiento/importe y vincula el intento. Checkout actual es simulación y no cobra; límite 15/min. | `GATEWAY_PAYMENTS_API_TOKEN`; `PAYMENTS_ORDERS_TOKEN` solo para Payments → Orders |
| S09 | REST externo | POST | `/api/v1/integrations/payments/demo/events` | M4 S09: identidad `payment-provider`, solo POST con firma vigente válida | payments `POST /internal/provider-events/demo`; después payments llama a orders `POST /internal/orders/{id}/payment-result` | Preserva bytes del cuerpo y firma; Payments verifica HMAC, fecha ±5 minutos, eventId/idempotencia y transición. Límite 60/min. Nunca confiar en retorno del checkout. | `GATEWAY_PAYMENTS_EVENT_TOKEN` en Gateway → Payments; `PAYMENT_WEBHOOK_SECRET` se comparte únicamente entre proveedor y Payments para verificar firma; `PAYMENTS_ORDERS_TOKEN` Payments → Orders |
| S11 | REST externo | GET | `/api/v1/staff/inventory` | M4 S11: personal `inventory` u `operations`; GET permitido | inventory `GET /internal/inventory` | Comprueba sesión y rol; devuelve inventario necesario al personal autorizado; límite 60/min. | `GATEWAY_INVENTORY_READ_TOKEN` |
| S12 | REST externo | POST | `/api/v1/staff/inventory/{id}/adjustments` | M4 S12: solo personal `inventory`; POST permitido | inventory `POST /internal/inventory/{id}/adjustments` | Gateway deriva rol/actor de la sesión; Inventory vuelve a validar rol, delta, motivo y que stock disponible no quede bajo reservas; límite 30/min. | `GATEWAY_INVENTORY_WRITE_TOKEN` |
| S13 | REST externo | PUT | `/api/v1/staff/orders/{id}/status` | M4 S13: solo personal `operations`; PUT permitido | orders `PUT /internal/orders/{id}/status` | Gateway deriva actor/rol; Orders valida estado/transición y registra historia; PUT reemplaza el estado solicitado dentro de esa transición, no elimina el pedido. | `GATEWAY_ORDERS_OPERATIONS_TOKEN` |
| S04 | REST externo | POST | `/api/v1/contact-messages` | Anónimo, límite 4/min | clients `POST /internal/messages` | Valida nombre, correo y mensaje; persistencia restringida local; retención de 90 días. No reenvía a proveedor externo. | `GATEWAY_CLIENTS_TOKEN` |
| S05 | REST externo | GET | `/api/v1/me/invoices` | Cliente autenticado y titular de sesión | orders `GET /internal/invoices` | Gateway transmite ID de sesión verificado; orders devuelve solo documentos internos de pedidos pagados del cliente. Sin emisión DTE/PDF fiscal. | `GATEWAY_ORDERS_READ_TOKEN` |
| S14 | REST externo | GET | `/api/v1/staff/orders` | Solo personal `operations` | orders `GET /internal/orders` | DTO de máximo 100 pedidos recientes; excluye identidad cliente, dirección y detalle de pago. | `GATEWAY_ORDERS_OPERATIONS_TOKEN` |
| Auxiliar | REST externo | GET | `/health` | Anónimo, salud operacional mínima | Gateway consulta `/health` fijo en los cuatro servicios | Plazo 1 s por dependencia; solo `ok`/salud, sin configuración ni secretos. Límite 30/min. | No usa token en el prototipo; endpoint privado/solo infraestructura en producción |
| Auxiliar demo | REST externo | GET | `/demo-checkout/{paymentId}` | Anónimo; pantalla de retorno de demostración | Gateway responde página/JSON demo; sin autoridad para cambiar estado | Solo IDs `pay_...`; no cobra ni confirma; límite 30/min. | Ninguna |

**Servicio M1 parcialmente pendiente:** S06 `GET /api/v1/me/invoices/{invoiceId}/document` no tiene handler de PDF fiscal. S04 persiste el contacto local y S05 expone historial interno de compra; aún no hay sistema de mensajería, proveedor de email, DTE/SII ni almacenamiento/descarga PDF fiscal.

**Métodos denegados:** las rutas solo admiten los verbos mostrados. Por ejemplo, `DELETE /api/v1/products/{id}` no tiene destino ni permiso de administración; `PUT /api/v1/orders` no crea ni modifica pedidos; un `DELETE` de pedido/documento no equivale a cancelación y no borra el historial. Ruta no conocida: 404; método no admitido en una ruta conocida: 405 con `Allow`.

## 4. Identidad de usuario y contexto de propiedad

### Ejemplo: consultar un pedido propio (S10)

1. El navegador envía `GET /api/v1/me/orders/ord_demo` y su cookie de sesión por HTTPS.
2. El Gateway consulta la sesión a `clients` usando `GATEWAY_CLIENTS_TOKEN`. El ID del cliente proviene de la respuesta de Auth, no de un parámetro del navegador.
3. El Gateway llama a Orders con `GATEWAY_ORDERS_READ_TOKEN` y añade el `X-Client-Id` derivado de esa sesión.
4. Orders verifica el token interno y compara el ID recibido con el dueño guardado. Si no es el mismo, devuelve 404; el Gateway no puede saltarse esa regla.

La credencial de servicio prueba qué proceso llama. La cookie prueba qué usuario inició sesión. Ambas son necesarias en este flujo y no se intercambian. Cualquier header de identidad interna que venga del navegador se ignora o descarta.

## 5. Matriz GraphQL (actualizada por M8)

El estado histórico de M6 era “no desplegado”. M8 agrega una operación concreta para la pantalla Seguimiento; el endpoint privado sigue sin exposición directa. SDL en `MODULO 3/backend/graphql-gateway/schema.graphql`; validación, resolvers y límites en `server.js` y `schema.js`.

| Ruta pública por el Gateway | Operación | Tipo | Campos autorizados | Resolver/adaptadores | Subsistemas | Identidad y plazo |
|---|---|---|---|---|---|---|
| `POST /api/v1/graphql` | `myOrderSummary(orderId, first, after)` | Query | ID, estado, modalidad, total/moneda, hitos; líneas con cantidad/precio y ficha pública `id/name/category/description`. Sin cliente titular, dirección, facturación, pago, stock o reservas. | `Query.myOrderSummary` → Orders `GET /internal/orders/{id}/graphql-summary`; `OrderLine.product` resuelve desde un mapa de resultados de un único `POST /internal/catalog/batch`. | Orders + Inventory. No llama Clients tras la sesión ni Payments. | Cookie cliente; Gateway exige rol customer y agrega identidad verificada. Orders vuelve a validar titular. Token exclusivo por tramo. 1,5 s por servicio; Gateway total 3,5 s. |

No se define `Mutation`: una consulta agregada no ejecuta transacciones. No hay fragments, introspección ni más de una raíz. Página `first` de 1–20, body 16 KiB, query 8 KiB/1.000 tokens, profundidad 6, costo 250. Un fallo de Orders impide presentar resultado; un fallo de Inventory conserva el resumen y devuelve `CATALOG_PARTIAL` sin descripciones. La matriz detallada y la prueba están en `M8/Modulo-8-Separacion-y-GraphQL.md` y `M8/Resultados-validacion.md`.

## 6. Matriz gRPC

Los servicios actuales se comunican con HTTP/JSON. No hay puerto, cliente, proto ni método gRPC desplegado; no se deben anunciar rutas gRPC.

| Estado | Servicio/método | Entrada/salida | Modalidad | Identidad permitida | Plazo |
|---|---|---|---|---|---|
| No aplica en la versión actual | Ninguno | — | — | — | — |

Una futura integración gRPC requeriría contrato `.proto`, método explícito, identidad de workload/mTLS y plazo máximo por RPC. No se traduce una ruta REST en gRPC de forma implícita.

## 7. Inventario de credenciales y secretos

Todos los valores reales se generan fuera de este documento. Las etiquetas de `.env.example` son placeholders y deben sustituirse localmente por valores aleatorios distintos. La tabla no incluye ni debe copiar claves reales.

| Referencia | Tipo | Emisor/responsable | Consumidor | Finalidad | Ubicación segura actual / objetivo | Alcance mínimo | Rotación y revocación |
|---|---|---|---|---|---|---|---|
| `GATEWAY_INVENTORY_READ_TOKEN` | Token de servicio | Responsable del despliegue | Gateway → Inventory | Catálogo e inventario de lectura | `.env` local ignorado por Git / gestor de secretos en producción | Solo GET catálogo e inventario; el receptor lo exige por ruta | Generar reemplazo único; inyectarlo en Gateway e Inventory, validar, retirar anterior; revocar de inmediato si se filtra |
| `GATEWAY_INVENTORY_WRITE_TOKEN` | Token de servicio | Responsable del despliegue | Gateway → Inventory | Ajuste autorizado de stock | `.env` local / gestor de secretos | Solo ruta interna de ajustes; rol y regla de saldo los vuelve a comprobar Inventory | Rotación coordinada; revocar y crear token nuevo ante filtración |
| `ORDERS_INVENTORY_READ_TOKEN` | Token de servicio | Responsable del despliegue | Orders → Inventory | Consultar catálogo durante validación de pedido | `.env` local en ambos procesos / gestor de secretos con acceso exclusivo | Solo lectura de producto; no permite reservar, consumir, liberar ni ajustar | Rotación coordinada entre Orders e Inventory; revocación rápida si se filtra |
| `ORDERS_INVENTORY_TOKEN` | Token de servicio | Responsable del despliegue | Orders → Inventory | Crear, consumir o liberar reserva | `.env` local en ambos procesos / gestor de secretos con acceso exclusivo | Solo endpoints de reserva; no permite ajuste manual ni catálogo de lectura | Rotación coordinada entre Orders e Inventory; revocación rápida si se filtra |
| `GATEWAY_CLIENTS_TOKEN` | Token de servicio | Responsable del despliegue | Gateway → Clients | Crear e introspectar sesión | `.env` local / gestor de secretos | Solo endpoints internos de sesión | Rotar en ambos procesos; si Auth se cae, negar autenticación temporalmente (503) |
| `GATEWAY_ORDERS_CREATE_TOKEN` | Token de servicio | Responsable del despliegue | Gateway → Orders | Crear pedido autenticado | `.env` local / gestor de secretos | Solo POST de creación; Orders exige identidad de usuario e idempotencia | Reemplazar coordinadamente; revocar sin afectar lectura/operaciones por tener tokens distintos |
| `GATEWAY_ORDERS_READ_TOKEN` | Token de servicio | Responsable del despliegue | Gateway → Orders | Leer pedido del cliente | `.env` local / gestor de secretos | Solo lectura; Orders exige X-Client-Id y titularidad | Rotar y revocar independientemente de create/status |
| `GATEWAY_ORDERS_OPERATIONS_TOKEN` | Token de servicio | Responsable del despliegue | Gateway → Orders | Cambiar estado operativo | `.env` local / gestor de secretos | Solo cambio de estado; rol de operaciones y transición de negocio obligatorios | Rotación independiente; revocar ante filtración |
| `PAYMENTS_ORDERS_TOKEN` | Token de servicio | Responsable del despliegue | Payments → Orders | Obtener contexto mínimo, registrar intento y aplicar resultado verificado | `.env` local / gestor de secretos | No lee pedidos completos ni cambia estado arbitrariamente; endpoints de pago solamente | Coordinar reemplazo entre Payments y Orders; revocar ante filtración |
| `GATEWAY_PAYMENTS_API_TOKEN` | Token de servicio | Responsable del despliegue | Gateway → Payments | Iniciar pago de pedido | `.env` local / gestor de secretos | Solo endpoint de inicio; Payments valida propiedad/pagabilidad por medio de Orders | Rotar separadamente del token de eventos |
| `GATEWAY_PAYMENTS_EVENT_TOKEN` | Token de servicio | Responsable del despliegue | Gateway → Payments | Entregar callback firmado al handler privado | `.env` local / gestor de secretos | Solo recibe eventos; Payments aún verifica firma del proveedor | Revocar ante filtración y emitir otro token distinto |
| `GATEWAY_GRAPHQL_TOKEN` | Token de servicio | Responsable del despliegue | API Gateway → GraphQL privado | Encaminamiento al agregador | `.env` local / gestor de secretos | Solo `POST /graphql`; no autoriza a un rol de cliente ni es accesible desde el browser | Rotar coordinadamente Gateway y GraphQL; revocar ante filtración |
| `GRAPHQL_ORDERS_READ_TOKEN` | Token de servicio | Responsable del despliegue | GraphQL → Orders | Leer resumen mínimo de pedido | `.env` local / gestor de secretos | Solo endpoint de resumen; Orders exige identidad titular y responde campos permitidos | Rotación coordinada entre GraphQL y Orders |
| `GRAPHQL_INVENTORY_READ_TOKEN` | Token de servicio | Responsable del despliegue | GraphQL → Inventory | Resolver ficha pública en batch | `.env` local / gestor de secretos | Solo lectura batch de 1–30 IDs; sin stock, reservas ni ajustes | Rotación coordinada entre GraphQL e Inventory |
| `PAYMENT_WEBHOOK_SECRET` | Secreto HMAC de proveedor | Proveedor de pago y responsable de pagos | Payments verifica firma; proveedor firma | Autenticidad/integridad del webhook | `.env` local / gestor de secretos de Payments y bóveda/configuración del proveedor | Solo firma de eventos para esta integración, distinto de tokens de servicio | Coordinar periodo de doble clave si el proveedor lo admite; cambiar ambos lados y retirar la clave anterior; filtrar = pausar/revocar endpoint |
| `SESSION_SECRET` | Clave de firma de sesión | Responsable de Auth/Clients | Solo Clients | Firmar/verificar sesión de cliente | `.env` local / gestor de secretos con acceso exclusivo de Clients | No sirve como token de servicio ni se entrega al Gateway/navegador | Rotar invalida sesiones firmadas existentes; informar reautenticación y reemplazar clave; revocar inmediatamente si se expone |
| Contraseña de usuario (`DEMO_*_PASSWORD`) | Credencial de usuario | Usuario/administrador de cuentas | Cliente y Clients/Auth | Iniciar sesión local | `.env` local para cuentas demo / almacén de identidades con hash en producción | Una identidad/rol; nunca usar como credencial de servicio | Cambiar/revocar cuenta; prototipo usa cuentas demo y no es gestión de usuarios de producción |
| Credencial de base de datos | No existe actualmente | — | — | — | No aplica; persistencia JSON local | Si se incorpora, consumidor único: servicio dueño de esos datos | Al crear DB, guardar en gestor de secretos, privilegios por esquema/operación y rotación gestionada por el dueño del servicio |

**Almacenamiento y permisos mínimos:** en esta entrega académica se incluye un `.env` generado con valores aleatorios y cuentas ficticias para facilitar la reproducción. No contiene credenciales de proveedor real; al cambiar a otro entorno, generar y rotar los valores. Cada token de servicio debe tener un valor aleatorio independiente. `dev.js` valida que tokens técnicos, clave de sesión y firma webhook tengan valores distintos; además, inicia cada proceso con listas permitidas para los seis procesos: Gateway, Inventory, Orders, Clients, Payments y GraphQL. El proceso supervisor que lee `.env` aún puede ver todas las variables, por lo que en producción debe reemplazarse por inyección de referencias/identidad desde Vault o Secret Manager, políticas de lectura limitadas por nombre/servicio, auditoría y TLS/mTLS. El API Gateway no debe leer contraseñas de base de datos ni secretos del proveedor que no consume.

**Rotación y revocación ejecutable hoy:** no hay Vault, certificados, automatización de rotación ni administración de sesiones persistentes en esta demo. La rotación es un procedimiento de despliegue: crear valor nuevo, actualizar emisor y consumidor de forma coordinada, verificar health/llamadas, eliminar el valor anterior; en filtración, aislar/revocar primero, tolerar 503 mientras se reemplaza y revisar logs sin registrar la clave. No guardar valores en URLs, parámetros, código, capturas ni logs.

## 8. Errores, tiempos y fallos de secreto

| Situación | Respuesta/decisión |
|---|---|
| Ruta no permitida / verbo inválido | 404 / 405; no se hace llamada interna. |
| Usuario sin sesión o rol | 401 / 403 antes de actuar; si es recurso ajeno, Orders responde 404 sin revelar existencia. |
| Dependencia interna no disponible o plazo agotado | Error controlado 503; no se confirma el pedido/pago con información incompleta. No hacer fallback anónimo. |
| Secreto local ausente | El Gateway no puede resolver la referencia y devuelve 503; el servicio interno sin credencial esperada responde 503. Se falla cerrado. |
| Credencial técnica incorrecta | Servicio receptor rechaza con 401; no reintentar indefinidamente. Revisar configuración/identidad sin registrar el valor. |
| Gestor de secretos no disponible en producción | No iniciar nuevas operaciones que dependan del secreto o responder 503; usar caché solo si la política operacional define vigencia y revocación segura. Nunca usar secreto vacío/de prueba como fallback. |
| Firma webhook no válida/vencida o repetida | 401/400 o respuesta idempotente duplicada; no actualizar pago/pedido. El proveedor puede reintentar los fallos transitorios. |
| Filtración | Revocar/reemplazar credencial afectada, limitar el alcance de incidente, auditar uso por identidad y hora, rotar credenciales relacionadas solo si hubo exposición, y no publicar secreto en el reporte. |

Los timeouts locales están acotados en las llamadas HTTP del backend; API Gateway y servicios devuelven errores genéricos. En producción, se añade TLS en cada tramo y segmentación de red; las llamadas que transportan datos restringidos no deben viajar en claro.

## 9. Correspondencia y control final

| Requisito M6 | Resultado | Evidencia/estado |
|---|---|---|
| Rutas/verbos permitidos enlazados a servicio y política M4 | Cumple para rutas activas | Matriz de rutas REST; allowlist en `MODULO 3/backend/gateway-policy.js`. |
| Ruta externa, transformación y destino interno | Cumple | Cada ruta indica destino fijo y controles. S04–S06 se marcan sin destino implementado y no publicadas. |
| Credencial de usuario separada de credencial entre sistemas | Cumple en diseño y código local | Cookie/identidad de Clients separada de tokens técnicos; Orders revalida propiedad. |
| Tipo de credencial, consumidor, alcance y ciclo de vida | Documentado; ciclo productivo pendiente | Inventario simbólico; local usa variables de entorno, Vault/rotación automática no están desplegados. |
| GraphQL y gRPC | GraphQL activo desde M8; gRPC no aplica | M8 agrega schema, resolver, ruta Gateway, tokens separados y pruebas. No existe proto/RPC gRPC. |
| Respuesta ante fuga o falla de proveedor secreto | Cumple como política; Vault no está activo | Falla cerrada, 503 y procedimiento de reemplazo/revocación. |

**Control:** las solicitudes externas tienen destino, acceso y controles definidos; cada credencial tiene consumidor/finalidad; un dato de identidad del usuario solo se conserva desde sesión verificada y el sistema dueño vuelve a verificar propiedad. No quedan rutas internas publicadas por omisión. Falta desplegar el backend en una red privada productiva y conectar gestor de secretos/TLS, proveedores reales, revocación persistente de sesiones y endpoints S04–S06; esto se aborda en integración/despliegue posterior, no se declara resuelto por esta matriz.

## 10. Archivos de implementación relacionados

- `MODULO 3/backend/gateway-policy.js`: rutas externas permitidas, verbos, roles y límites.
- `MODULO 3/backend/api.js`: enrutamiento fijo, verificación de sesión, transformación a identidad confiable y elección de referencia técnica.
- `MODULO 3/backend/services/*.js`: validación de token de servicio y reglas de propiedad/negocio en el destinatario.
- `MODULO 3/backend/lib/secret-provider.js`: adaptador local que resuelve referencias desde entorno.
- `MODULO 3/backend/.env.example`: nombres y placeholders, nunca secretos reales.

**Fuente académica:** PDF *Evaluación 2 DWM*, módulo 6 “Rutas y secretos de integración”; los ejemplos de identidad/secreto se desarrollan aquí para Tokyo Noodles y se contrastan con las rutas implementadas.
