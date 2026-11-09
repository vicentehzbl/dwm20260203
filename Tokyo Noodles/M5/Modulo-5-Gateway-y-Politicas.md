# Módulo 5 — API Gateway y políticas

**Caso:** Tokyo Noodles.  
**Base:** contratos M1 S01–S13, permisos M4, sistemas internos M3 y los dos materiales de apoyo adjuntos.  
**Estado:** se conserva un solo API Gateway REST externo y se formalizan sus rutas/políticas en código. El GraphQL Gateway queda modelado como interfaz de red privada futura, sin implementación ni despliegue porque el caso no tiene un consumidor que lo necesite.

**Actualización posterior:** lo anterior documenta la decisión al cerrar M5. M8 añade un caso de uso de Seguimiento y activa un GraphQL Gateway privado; el estado actual, schema, política y evidencia están en `../M8/Modulo-8-Separacion-y-GraphQL.md`.

## 1. Propósito y decisiones de arquitectura

El API Gateway separa a la interfaz pública de `clients`, `inventory`, `orders` y `payments`. Se elige **un Gateway REST externo**, no uno por microservicio ni uno aparte para administración:

- centraliza autenticación, autorización por ruta, rate limit, timeout, errores y logging seguro;
- mantiene un catálogo explícito de destinos/métodos y no actúa como proxy genérico;
- divide rutas públicas, autenticadas, administrativas e integración de proveedor mediante `RouteDefinition` y políticas;
- los servicios internos quedan en loopback/red privada y mantienen autenticación entre servicios y validación del negocio.

Los endpoints administrativos usan el mismo Gateway porque la diferencia está en rol y alcance de ruta, no en un segundo punto de entrada. Se podría separar un gateway administrativo si el negocio exige red, disponibilidad o administración de credenciales distinta; esa necesidad no aparece en el caso.

Se modela `GraphQLGateway` dentro de `RedPrivada` porque la guía lo requiere en el segundo UML. Se deja **no desplegado**: el frontend existente necesita operaciones REST concretas y no hay consultas agregadas de alto volumen que justifiquen otro protocolo/componente. Analytics y servicios especializados de alta demanda tampoco se añaden: no hay requisitos ni carga que los sustenten. No se añade cliente gRPC porque los contratos actuales entre componentes son HTTP/JSON.

## 2. Componentes y fronteras de confianza

| Zona/componente | Función y confianza | Qué comprueba / qué no hace |
|---|---|---|
| Navegador / frontend | Cliente externo no confiable. | Envía cookie y datos de entrada. No es autoridad para rol, propietario, precio, stock, pago ni URL interna. |
| API Gateway REST | Única frontera de entrada externa. | Busca ruta exacta, verifica método, limita solicitudes, valida sesión/rol, encamina firma/cuerpo del proveedor hacia `payments` para su validación, elige destino predefinido, limita tiempo, genera request ID y registra datos no secretos. No resuelve reglas de pedido/stock ni decide pago. |
| `clients` / Auth Service | Servicio privado de identidad/sesión. | Comprueba credenciales, firma/introspecciona sesión y devuelve identidad/rol mínimos. No administra secretos técnicos ni decide permisos de negocio sobre recursos. |
| `SecretProvider` | Límite de secretos técnicos. | El adaptador local obtiene referencias de variables de entorno. El objetivo de despliegue es Vault con políticas de mínimo privilegio, rotación y revocación. Vault no autentica clientes. |
| Microservicios privados | inventory, orders, payments. | Rechazan llamadas sin identidad de servicio; vuelven a validar contrato, propiedad, saldo, estado, firma e idempotencia según su dato de autoridad. No confían en headers de usuario enviados directamente desde Internet. |
| GraphQL Gateway | Componente propuesto exclusivamente dentro de la red privada. | Si se activa, autentica workload, limita operaciones/campos y llama a adaptadores privados; no expone el schema a internet por defecto. No está ejecutándose en esta versión. |

En el modo local todos los servicios se enlazan a `127.0.0.1`, con credenciales en `.env` ignorado por Git. El Gateway es la única API de cliente, pero no hay aún despliegue multi-host ni Vault. En producción: TLS exterior, red privada/segmentada, backend accesible solo desde Gateway/identidades autorizadas, credenciales por consumidor (no un secreto compartido), Vault o Secret Manager con mínimo privilegio y rotación. El modo dev/root de Vault mostrado en el laboratorio es solo pedagógico, no para producción.

## 3. Rutas y políticas externas

Las rutas expuestas son explícitas en `backend/gateway-policy.js`. El Gateway no toma host, ruta destino ni verbo del usuario para redirigir libremente.

| ID / ruta externa | Verbo(s) | Clase | Autenticación/autorización | Destino interno / controles |
|---|---|---|---|---|
| Health `/health` | GET | Anónima, operacional | Sin sesión; entrega solo salud de dependencias, sin secretos. | Health checks internos con timeout 1 s; rate limit local 30/min por origen. |
| S01 `/api/v1/products` | GET | Externa anónima | Filtros públicos validados. | inventory `/internal/catalog`; DTO público; 60/min por origen. |
| S02 `/api/v1/products/{id}` | GET | Externa anónima | ID numérico en patrón de ruta. | inventory `/internal/catalog/{id}`; solo producto publicable. |
| S03 `/api/v1/auth/sessions` | POST | Externa anónima | clients autentica; error genérico. | clients `/internal/sessions`; cookie HttpOnly/SameSite; 8/min por origen. |
| Logout `/api/v1/auth/sessions/current` | DELETE | Externa autenticada | Sesión vigente. | Borra cookie local; revocación remota duradera aún no está implementada. |
| S07 `/api/v1/orders` | POST | Externa autenticada | Rol customer, Idempotency-Key, sesión. | orders `/internal/orders`; server valida payload, dueño, precio; inventory reserva stock. |
| S10 `/api/v1/me/orders/{id}` | GET | Externa autenticada | Rol customer y dueño del pedido. | orders `/internal/orders/{id}`; Gateway deriva clientId desde sesión; orders vuelve a verificar titular. |
| S08 `/api/v1/orders/{id}/payments` | POST | Externa autenticada | customer dueño de pedido pagable. | payments interno; comprueba pedido/importe; URL local simulada. |
| S09 `/api/v1/integrations/payments/demo/events` | POST | Integración externa proveedor | HMAC, fecha y eventId verificados por payments; deduplicación. | payments `/internal/provider-events/demo`; body original preservado; 60/min por origen. |
| S11 `/api/v1/staff/inventory` | GET | Administrativa | Rol inventory u operations. | inventory `/internal/inventory`; información interna. |
| S12 `/api/v1/staff/inventory/{id}/adjustments` | POST | Administrativa | Solo rol inventory. | inventory; actor deriva de sesión; saldo no puede quedar bajo reservas. |
| S13 `/api/v1/staff/orders/{id}/status` | PUT | Administrativa | Solo rol operations; estado y transición permitidos. | orders; registra actor/hito y valida la máquina de estados. |
| Rutas internas de microservicio | No expuestas en Gateway | Internas | Identidad de workload/tokens y autorización del servicio receptor. | No hay catch-all `/api/{path}` ni forwarding hacia URL escogida por usuario. |

`GraphQLGateway` no tiene ruta externa. Si luego se habilita, su endpoint será accesible únicamente desde workloads de la red privada. `POST /graphql` por sí solo nunca concede permiso: el resolver debe verificar operación, campo, recurso, dueño y rol; limitar profundidad/costo y el tiempo de ejecución.

## 4. Qué valida cada capa

### API Gateway

1. Hace match contra `RouteDefinition` y deniega ruta desconocida (`404`) o método no permitido (`405` + `Allow`).
2. Aplica rate limit por ruta/origen y timeout de dependencias.
3. Verifica sesión con `clients` para operaciones autenticadas; 401 significa no autenticado/no vigente, 403 rol insuficiente.
4. Verifica rol por ruta; no usa la presencia de un token como permiso general.
5. Reenvía solo campos/headers construidos desde el contexto verificado. Descarta identidad aportada por el navegador.
6. En S09 entrega la firma/cuerpo original para que `payments` haga la validación criptográfica. No confía en el retorno del checkout.
7. Devuelve errores controlados: 400/401/403/404/405/409/429/502/503; nunca propaga traza, secreto, cabecera interna ni respuesta técnica sensible.
8. Escribe logs estructurados con request ID, route ID, método, código y duración. No guarda cookie, token, secreto, contraseña, cuerpo ni query.

### Sistemas internos

- **clients/Auth Service:** credenciales, expiración e identidad/rol de la sesión.
- **inventory:** existencia del producto, reserva, saldo, ajuste y actor autorizado. El Gateway no puede “forzar” un stock.
- **orders:** propiedad, transición, Idempotency-Key, total calculado y estado oficial del pedido. No confía en un `clientId` arbitrario del browser.
- **payments:** firma, fecha y deduplicación del evento. Solo después comunica el resultado validado a orders.
- Cada servicio debe rechazar credenciales de servicio ausentes/incorrectas; en producción, scopes/identidad diferentes por consumidor. El Gateway no reemplaza la validación de negocio ni de propiedad del dueño del recurso.

## 5. Recorridos de solicitud

### Autorizada: seguimiento propio

1. Browser pide `GET /api/v1/me/orders/{id}` con cookie.
2. Gateway encuentra S10 y el método permitido, aplica límite e introspecciona la sesión en clients.
3. Gateway acepta rol customer, obtiene identidad verificada y añade `X-Client-Id` confiable a la llamada interna.
4. orders compara ese ID con el titular persistido; si coincide, devuelve DTO mínimo. Si la dependencia no responde, Gateway responde 503; no inventa resultado.

### Denegada: DELETE público de producto

1. Browser pide `DELETE /api/v1/products/1`.
2. La ruta coincide con S02, pero la definición admite solo GET.
3. Gateway responde `405 Method Not Allowed` y `Allow: GET`; no llama a inventory.
4. Aunque el caller tuviese sesión válida, esta no crea un permiso de administración.

### Denegada: cliente sin rol de inventario

Gateway identifica una sesión customer en la ruta S12 y devuelve 403 antes de llamar a inventory. Inventory sigue validando la identidad de servicio y saldo en cualquier llamada que sí alcance su endpoint privado.

Secuencias Mermaid: `FLUJO-GATEWAY-AUTORIZADO-DENEGADO.mmd`.

## 6. UML y estructura

El segundo diagrama UML solicitado está en `UML-Gateway-y-Politicas.mmd` e incluye ApiGateway, RouteDefinition, AuthenticationPolicy, AuthorizationPolicy, RateLimitPolicy, ServiceTarget, SecretProvider, AuthService, GraphQLGateway, Schema, Resolver y adaptadores a inventory/orders/clients/payments.

- **Composición estructural:** un ApiGateway compone una o más definiciones de ruta; GraphQLGateway compone un Schema, y Schema define uno o más Resolver.
- **Políticas reusables:** muchas rutas pueden referir la misma política; cada ruta de este diseño referencia una política de autenticación y una de autorización explícitas (la política anónima también está modelada).
- **Targets:** varias rutas pueden compartir un destino, pero cada ruta de negocio tiene un target estático.
- **Dependencias:** Gateway → Auth Service, SecretProvider y targets; resolvers GraphQL → adapters; adapters → sistemas privados. Las flechas de dependencia no significan que una instancia de gateway “posea” instancias de los servicios.
- El diagrama muestra estructura UML; el mapa M3 muestra flujos de red. No son intercambiables.

## 7. Implementación del incremento M5 y límites

Se modificó el Gateway local de M3:

- nueva `backend/gateway-policy.js` con allowlist de rutas, métodos, clase de acceso, servicio destino, rate limit y política;
- `api.js` aplica la política antes de ejecutar handlers; rutas desconocidas 404, método incorrecto 405, exceso 429;
- rate limits locales iniciales: catálogo 60/min, login 8/min y operaciones privadas con cuotas específicas;
- request timeouts existentes de 2–3 s a servicios y 1 s para health; Auth Service no disponible devuelve 503; errores no exponen detalles;
- logs estructurados usan ID lógico de ruta y no guardan tokens, cookies, query o cuerpo.

La configuración en `gateway-policy.js` es una tabla de rutas, no un reverse proxy genérico. `EnvironmentSecretProvider` es el adaptador ejecutable local y lee referencias de tokens de alcance definido desde el entorno. M6 elimina el token compartido inicial. `VaultSecretProvider` está modelado, pero no desplegado ni conectado. Los límites en memoria sirven para ejecución local de un solo proceso; en varias réplicas se requiere store distribuido o limitador de infraestructura.

No se desplegó HashiCorp Vault ni se añadió el GraphQL Gateway ejecutable. En el entorno local `EnvironmentSecretProvider` lee variables en `.env`, ignoradas por Git; Vault queda como proveedor de destino en UML. La autenticación de clientes sigue dentro del microservicio `clients`. Logout local borra la cookie; revocación persistente debe completarse al evolucionar Auth Service. El módulo M6 define rutas a destinos por sistema, identidad por tramo, inventario de secretos, permisos, rotación/revocación y tratamiento de fallos del secret manager. M10 cubre endurecimiento y despliegue final.

## 8. Control antes de avanzar

| Pregunta | Resultado | Evidencia |
|---|---|---|
| ¿Se entiende cómo se impide el acceso directo no autorizado? | Sí, en arquitectura local. | Microservicios en loopback/red privada y requisito de credencial interna; production añade red segmentada/mTLS. |
| ¿Se distinguen configuración de rutas, políticas y secretos? | Sí. | RouteDefinition/Policy/ServiceTarget y SecretProvider separados en UML y código. |
| ¿La elección de gateways tiene fundamento? | Sí. | Uno para REST externo; rutas admin usan políticas. GraphQL se modela privado y se deja apagado por falta de necesidad actual. |
| ¿Hay límites, timeout, errores y logs sin secretos? | Sí, a nivel de prototipo local. | Tabla de políticas, timeout, códigos controlados y logs mínimos. Rate limit distribuido queda para despliegue. |
| ¿Los servicios preservan validaciones y propiedad? | Sí, en las rutas implementadas. | S10 compara dueño; inventory/orders/payments validan stock, estado, firma y permiso. S04–S06 aún no tienen endpoints. |

**Resultado:** Módulo 5 queda documentado con segundo UML y políticas implementadas para el Gateway REST local. GraphQL Gateway está representado como parte de la red privada, pero no se activa sin un caso de uso. No se afirma una instalación de Vault ni alta disponibilidad productiva.

## 9. Material de apoyo aplicado

Los laboratorios de `Desarrollo_Web_Movil-1.pdf` y `AutenticacionAutorizacion.pdf` se usan para separar identidad de cliente y credencial interna, Auth Service de Vault, gateway de lógica de negocio, bloqueo de bypass al backend, errores 401/403/502/503, rate limiting, timeout, rotación y red privada. El modo dev/root de Vault mostrado en ellos no se adopta como configuración de producción. La especificación de rutas/diagrama/controles se alinea con Módulo 5 de Evaluación 2 DWM.
