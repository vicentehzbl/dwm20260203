# Módulo 7 — Protección de datos y credenciales

**Caso:** Tokyo Noodles.  
**Propósito:** identificar qué información debe resguardarse y diferenciar datos personales, credenciales de usuario y secretos de integración.  
**Base:** contratos M1, permisos M4, sistemas M3, gateways M5 y rutas/secretos M6.  
**Alcance:** el frontend de GitHub Pages es estático; la validación se ejecuta contra el backend académico local M3. La matriz describe los servicios existentes y señala los que todavía no están conectados.

## 1. Clasificaciones simples

- **Público:** se puede mostrar sin iniciar sesión, como nombre y precio publicado de un producto.
- **Personal/restringido:** identifica a una persona o su compra; solo se usa para el propósito indicado y se entrega a quien tiene permiso.
- **Sensible por contexto:** una dirección, RUT/datos tributarios, mensaje privado o dato de pago puede causar daño o exponer una compra. Se limita más que un dato público. Esta clasificación es de riesgo del proyecto, no una afirmación de categoría legal.
- **Credencial del cliente:** contraseña, verificador/hash de contraseña o sesión que sirve para autenticar a una cuenta. Nunca se devuelve como dato de perfil.
- **Secreto de integración:** token técnico, clave HMAC de proveedor o clave privada que autoriza comunicación entre componentes. No corresponde a la contraseña del cliente ni se entrega al navegador.

## 2. Matriz de datos y credenciales

| Dato o credencial | Finalidad | Clasificación | Sistema custodio | Roles autorizados | Representación en el frontend | Protección | Retención propuesta |
|---|---|---|---|---|---|---|---|
| ID, nombre, categoría, descripción, precio e imagen del producto | Mostrar el menú y cotizar visualmente | Público, excepto atributos internos | `inventory` | Público para los campos publicados; `inventory` modifica catálogo | Texto e imagen pública; nunca mostrar datos internos | DTO con lista permitida; HTTPS en producción; no exponer entidad completa | Mientras el producto esté publicado; luego retirar de catálogo y conservar historial solo si hay pedido asociado |
| Indicador `disponible` | Informar si se puede pedir | Público y aproximado | `inventory` | Visitantes/cliente para indicador; `inventory` y `orders` para decisión real | “Disponible/no disponible”; no revelar unidades exactas al visitante | Calcular con stock menos reservas; `orders` vuelve a reservar antes de aceptar | Derivado; no requiere historial público |
| Stock físico, reservado, ajustes y motivo | Reposición, control de reservas y auditoría | Interno/restringido de negocio | `inventory` | `inventory` y lectura `operations`; `orders` usa reserva por integración autorizada | Oculto al cliente; personal solo ve vista autorizada | Ruta privada, token específico M6, rol y regla de saldo; actor e historial | Ajustes mientras se requiera auditoría; plazo operativo definido por el restaurante y luego depuración controlada |
| ID de cliente y nombre | Asociar compras y mostrar saludo/identidad mínima | Personal/restringido | `clients` es autoridad de cuenta; `orders` guarda el ID titular | Titular sobre su perfil; Auth y personal estrictamente necesario | Nombre/ID mínimo; nunca mostrar ID interno en UI si no hace falta | ID opaco; respuestas mínimas; no aceptar titular desde formulario | Cuenta activa; al cierre, eliminar o anonimizar cuando termine necesidad comercial y obligación aplicable |
| Correo electrónico | Inicio de sesión y contacto | Dato personal/restringido | `clients`; `orders` puede mantener solo referencia si se requiere | Titular; personal autorizado para atender un caso | Mostrar parcialmente si se muestra; nunca en catálogo, URL o logs | HTTPS; control de acceso; evitar copias innecesarias | Mientras cuenta activa y periodo de atención posterior propuesto de hasta 24 meses; revisar necesidad y obligación comercial antes de borrar |
| Contraseña de usuario recibida en login | Autenticar cuenta | Credencial de usuario; secreto de autenticación | En el prototipo está en variables `.env` de cuentas demo; en producción, servicio `clients` administra el verificador | Solo usuario la conoce; `clients` valida; operadores no la consultan | Campo password temporal; nunca eco/devolución ni almacenamiento local | Transporte HTTPS; no logs. En producción guardar **hash adaptativo con sal** (Argon2id recomendado; scrypt/bcrypt como alternativa según plataforma), jamás cifrado reversible. Las cuentas demo actuales en `.env` están en texto plano y son solo locales, no aceptables en producción | No conservar el texto recibido tras autenticar. Verificador durante la vida de cuenta; eliminar al cerrar cuenta sujeto a recuperación/auditoría necesaria |
| Hash/verificador de contraseña (objetivo productivo) | Comprobar contraseña sin poder recuperarla | Credencial derivada de alto riesgo | `clients` / proveedor de identidad | Proceso Auth; operador administra recuperación, no lectura de contraseñas | Nunca llega al navegador | Hash adaptativo con sal única por cuenta, parámetros vigentes, limitación de intentos y recuperación segura | Hasta cambio/cierre de cuenta; reemplazar tras cambio o sospecha de filtración |
| Cookie `tn_session` / token firmado | Mantener sesión de usuario autenticada | Credencial portadora; restringida | Cliente la transporta; `clients` la firma/verifica usando `SESSION_SECRET` | Navegador la envía automáticamente; Gateway valida con Clients; usuario no la ve desde JS por `HttpOnly` | No representarla como texto; cookie `HttpOnly`, `SameSite=Lax`; `Secure` con HTTPS | Token firmado HMAC, expira en 1 hora, `Cache-Control: no-store`; no loguear. El logout actual solo borra cookie, no revoca sesiones ya copiadas | Máximo 1 hora en prototipo; cierre de cookie al logout. Producción: revocación/rotación de refresh token o lista de sesiones y cierre inmediato |
| `SESSION_SECRET` | Firmar/verificar sesión | Secreto criptográfico de aplicación, no contraseña de cliente | Solo `clients` | Proceso `clients`; responsable de seguridad despliega/rota, no consulta por UI | Nunca en navegador ni API de cliente | Variable local ignorada por Git; en producción gestor de secretos, mínimo privilegio, rotación, auditoría y protección de backup | Mantener mientras se valide la sesión; revocar/rotar en filtración, aceptando invalidar sesiones existentes |
| Dirección de despacho y datos de receptor | Entregar pedido | Dato personal; sensible por contexto | `orders` (pedido) | Titular y personal de operaciones/despacho que prepara entrega | Solo en checkout y seguimiento propio; ocultar si no aplica o pedido no es propio | TLS; campos mínimos; autorización por titular/rol; excluir de logs y notificaciones innecesarias | Propuesta: eliminar/anonimizar 24 meses tras pedido completado, salvo obligación/gestión de reclamos que exija conservarlo |
| RUT, razón social, giro, dirección tributaria | Emitir factura | Dato personal/tributario de acceso restringido | Servicio de documentos/`orders` cuando esté definido; hoy S05/S06 no están implementados | Titular y personal de facturación autorizado | Captura solo si elige factura; mostrar solo al titular y personal permitido | TLS, cifrado en reposo, DTO minimizado, verificar titular; no copiar a logs | Conservar por el plazo tributario/contable aplicable, validado por responsable contable; no inventar un plazo en esta propuesta. Eliminar copias temporales al terminar emisión |
| ID/folio, fecha, total, estado y PDF de documento tributario | Historial y descarga de factura propia | Financiero y personal/restringido | Servicio tributario/facturación (pendiente) | Titular; facturación autorizada | Resumen mínimo; PDF solo tras verificación de titular; `private, no-store` | Autorización por documento, descarga directa HTTPS, almacenamiento cifrado y registro de acceso sin incluir contenido | Plazo legal contable a definir con responsable; conservar documento oficial y eliminar temporales según política |
| ID de pedido, artículos, snapshot de nombre/precio, total, estado y timeline | Comprar y seguir un pedido; resolver soporte | Compra personal/restringida | `orders` | Titular solo para pedido propio; `operations` para estados; `payments` consulta campos mínimos | Resumen de compra propio; ocultar pedidos ajenos con 404 | `X-Client-Id` solo desde sesión verificada; Orders verifica propietario; integraciones usan token específico; TLS; almacenamiento protegido | Propuesta: conservar mientras sea necesario para operación, reclamos y obligación contable; anonimizar datos personales al terminar esos fines y preservar el mínimo de auditoría requerido |
| Mensaje de contacto, nombre y correo | Responder consulta del cliente | Personal/restringido, contenido puede ser sensible | Servicio de contacto (S04 pendiente) | Cliente que lo envía y atención autorizada | Mostrar confirmación; no devolver otros mensajes | TLS, antiabuso, cifrado en reposo, acceso por caso; no enviar contenido a logs | 12 meses después de cerrar consulta, salvo disputa activa; luego eliminar o anonimizar |
| ID de pago, estado, importe, moneda, IDs de evento | Relacionar pago y pedido y procesar evento | Financiero/restringido; ID de proveedor no es por sí solo secreto | `payments`; `orders` guarda relación y estado oficial del pedido | Titular ve resumen; Payments y Orders procesan lo mínimo; personal de soporte autorizado según rol | Solo estado/importe de pago propio; nunca controles de administración | No confiar en datos del frontend; webhook HMAC + anti-replay + deduplicación; identidad servicio M6; TLS; registros sin datos de tarjeta | Mantener la referencia necesaria para reconciliación y obligaciones contables; eliminar tokens temporales y datos no necesarios al terminar su fin |
| Número completo de tarjeta, CVV, PIN | No es necesario: checkout alojado externo | Dato financiero altamente sensible | No lo custodia Tokyo Noodles | Proveedor externo autorizado en su checkout | No se captura ni se muestra en páginas propias | No recibir ni registrar; si integración futura lo exige, cambiar arquitectura y evaluación | No aplica: no recopilar |
| Clave HMAC `PAYMENT_WEBHOOK_SECRET` y tokens M6 (`*_TOKEN`) | Verificar proveedor y autorizar llamadas sistema a sistema | Secretos de integración | Payments y cada consumidor/receptor según M6 | Solo procesos emisor/receptor y gestor de secretos | Nunca en HTML, JavaScript, API pública, URL, query, captura o log | `.env` local únicamente para prototipo; producción Vault/Secret Manager, TLS/mTLS, mínimo privilegio, rotación y revocación | Rotar según política operacional y de inmediato ante fuga; retirar valor anterior y auditar uso |
| Logs técnicos (routeId, requestId, método, estado, duración) | Diagnóstico y auditoría de disponibilidad | Interno; sin contenido personal previsto | Servicio que registra / plataforma de logs | Operación y seguridad | No visibles a clientes | Allowlist de campos; excluir body, correo, cookies, tokens, dirección, query, firma y secretos | 30 días propuestos para logs técnicos; acceso auditado. Eventos de seguridad pueden requerir periodo diferenciado definido por seguridad |

**Nota de retención:** los periodos anteriores son una propuesta de minimización del caso. Los documentos tributarios y registros sujetos a obligación contable deben conservarse según el plazo aplicable que valide la administración/contador antes de desplegar. Los datos JSON actuales no tienen eliminación automatizada ni son un archivo de producción.

## 3. Decisión explícita sobre secretos asociados al cliente

**Sí, de forma limitada.** La propuesta autentica cuentas y por ello debe manejar la contraseña durante el login y conservar un verificador de contraseña no reversible en un sistema de identidad de producción. El navegador nunca guarda una contraseña en código o almacenamiento persistente; el backend no debe poder recuperar el texto original. La sesión firmada es otra credencial, con expiración y revocación; `SESSION_SECRET` es un secreto interno compartido del Auth Service, no un secreto personal de cada cliente.

Tokyo Noodles **no necesita custodiar el secreto de tarjeta**: el pago propuesto usa checkout alojado y la aplicación recibe solo identificadores/estado/importe del proveedor. Una tarjeta publicable (si el proveedor ofrece una) no equivale a una clave secreta y su uso debe seguir el contrato del proveedor; no hay una configurada en este proyecto. Los tokens técnicos y `PAYMENT_WEBHOOK_SECRET` son secretos de integración, nunca secretos del cliente.

**Estado actualizado en M10:** las cuentas registradas se persisten en `clients.json` con scrypt y salt aleatorio; las cuentas demo del equipo siguen configuradas en `.env` local para facilitar pruebas y no deben reutilizarse. La sesión es HMAC firmada y expira en una hora; el logout elimina la cookie, pero no tiene revocación individual persistente. Recuperación de cuenta, MFA y controles de producción requieren implementación adicional.

## 4. Cómo limitar el acceso a datos propios

1. El usuario autentica con cookie de sesión y el Gateway verifica su firma/expiración con `clients`.
2. El Gateway deriva `clientId` y rol solo de esa sesión; ignora cualquier `clientId`, rol o actor enviado por el frontend.
3. El Gateway envía contexto de identidad con la credencial técnica apropiada del M6.
4. El servicio dueño busca el recurso y compara titularidad en la misma operación. Orders no filtra por `clientId` enviado como query; el ID interno que recibe debe corresponder a la identidad verificada.
5. Un ID ajeno se responde como 404 equivalente a inexistente, para no confirmar que existe. Un usuario con sesión pero rol insuficiente recibe 403; sin sesión válida, 401.
6. Proyectar una lista explícita de campos de respuesta; no serializar el registro completo ni revelar stock interno, hash, secretos, dirección no requerida o notas internas.

## 5. Recorrido de un dato restringido: dirección de despacho

1. **Captura:** el cliente autenticado ingresa dirección y destinatario para un pedido con modalidad delivery. El formulario explica que se usará para entregar ese pedido y valida formato/tamaño.
2. **Transporte al Gateway:** navegador → Gateway por HTTPS en producción. La dirección va en el cuerpo POST, nunca URL/query. El log técnico registra routeId/estado/duración, no el cuerpo.
3. **Validación de autoridad:** Gateway autentica sesión y deriva titular; agrega identidad interna de confianza. El cliente no decide el ID propietario.
4. **Almacenamiento:** Orders guarda dirección asociada solo a ese pedido para coordinar despacho. No es accesible desde catálogo ni desde pedido de otra persona. Acceso de Operations/Despacho se limita a pedidos que necesita procesar.
5. **Respuesta:** el cliente recibe solo el resumen de su pedido; dirección completa puede omitirse en la respuesta de seguimiento si no es necesaria. El personal ve los campos mínimos para entregar.
6. **Conservación y eliminación:** al cerrar la entrega, eliminar o anonimizar dirección después del plazo operativo propuesto de 24 meses, excepto si sigue una disputa o existe obligación validada que requiera conservarla. Los datos JSON de demo no implementan esta depuración; producción debe automatizarla y cubrir backups.

## 6. Manejo de credenciales, sesiones y transporte

- Password solo por HTTPS desde el formulario, sin query, sin consola/logs, sin `localStorage` o `sessionStorage`; validar en Auth y nunca devolverla.
- Persistir únicamente hash adaptativo con sal única; preferencia Argon2id. No cifrado reversible ni hash rápido simple.
- Cookie de sesión `HttpOnly`, `Secure` en HTTPS, `SameSite=Lax`, alcance `Path=/`, `Max-Age=3600`. Hoy el token es HMAC y stateless; cambiar `SESSION_SECRET` invalida las sesiones emitidas con la clave anterior.
- Añadir en producción revocación por sesión/dispositivo o refresh token rotatorio con detección de reutilización. Al logout revocar del lado servidor y borrar cookie; hoy solo se borra cookie.
- Tokens M6, claves webhook y secretos de DB permanecen en servicios/secret manager; jamás empacarlos en `docs/`, HTML/JS, repositorio o configuración de navegador. `.env` local no se publica.
- Transporte: HTTPS desde navegador y proveedor; TLS/mTLS entre sistemas privados según soporte. El prototipo usa HTTP solo en loopback `127.0.0.1`; no exponer puertos 4101–4104 a Internet.
- Almacenamiento productivo: cifrado en reposo/backup, roles de lectura mínimos, auditoría, rotación, copias restaurables y procedimiento de borrado. Hoy la persistencia JSON local no cifra archivos.
- Logs: en M5 se registran metadatos mínimos (requestId, routeId, método, status, duración); excluir password, cookies, cabeceras de identidad, cuerpo, dirección, email, query, token y firma. Redactar también errores/excepciones.

## 7. Casos de validación solicitados

Los seis casos se ejecutaron contra el backend local M3 con credenciales aleatorias temporales y cuentas demo. Además, se verificó la proyección mínima de campos de catálogo, login, seguimiento y ajuste de inventario. Las respuestas reales y comprobaciones están en [Validacion-backend.md](Validacion-backend.md). El caso de “confirmación de pago con datos alterados” cubre: el cliente envía `status=succeeded` por S08, intenta el cambio operativo S13 y simula un webhook S09 sin firma válida; se comprueba que el pedido permanece `pending_payment`.

## 8. Control del módulo

| Pregunta | Resultado | Evidencia |
|---|---|---|
| ¿Se separan dato personal, credencial de usuario y secreto de integración? | Sí. | Matriz y decisión explícita; credenciales de usuario están distinguidas de `*_TOKEN`/HMAC. |
| ¿Se decide qué secretos del cliente necesita custodiar la solución? | Sí, limitados. | Verificador de password y sesión, con limitaciones reales del prototipo explicadas; no se guarda tarjeta/CVV. |
| ¿Cada servicio limita acceso a registros y campos propios? | Sí para pedido/documento interno; límites y brechas descritos. | Orders revalida titularidad; S04 persiste contacto y S05 lista documentos internos propios. S06 PDF fiscal continúa sin implementar. |
| ¿Se proponen almacenamiento, transporte, retención, borrado y logs? | Sí como política; varios controles productivos pendientes. | Matriz, ciclo de dirección de despacho, transporte TLS, retención y exclusión de logs. |
| ¿Se manejan expiración y revocación de sesiones? | Expiración actual sí; revocación persistente pendiente. | Cookie/tokens duran 1 hora; logout hoy solo elimina cookie. |
| ¿Se ejecutaron los seis casos? | Sí, en backend local. | Resultados verificables por status, cuerpo y estado final en `Validacion-backend.md`. |

**Conclusión:** Módulo 7 queda documentado y validado funcionalmente en el entorno local. Las credenciales de cuentas demo viven en `.env`, los archivos JSON no están cifrados y no existe revocación persistente; son brechas conocidas y el prototipo no se presenta como apto para información real.

### Referencia técnica

Para la propuesta de hash de contraseñas se sigue la guía de [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html): algoritmo adaptativo con sal única (Argon2id como primera opción; alternativas según plataforma). La configuración productiva se debe ajustar y verificar en el servidor real.
