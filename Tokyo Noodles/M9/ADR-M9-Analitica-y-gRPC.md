# ADR M9 — No separar analítica ni añadir gRPC en esta etapa

**Estado:** aceptado para el prototipo académico local.  
**Caso:** Tokyo Noodles.  
**Fecha:** 9 de noviembre de 2026.  
**Contexto de módulos:** M1 define consultas de catálogo, seguimiento y documentos; M3 separa inventory/orders/clients/payments; M8 agrega un resumen de un pedido propio con GraphQL privado. El backend sigue siendo obligatorio aunque no se agreguen Analytics o gRPC.

## Contexto y necesidades observadas

El caso modela un solo restaurante, un catálogo de seis productos de demostración y pedidos pequeños. La pantalla activa que combina sistemas es Seguimiento: solicita el pedido de una cuenta autenticada, con sus líneas e hitos, y agrega descripciones públicas de Inventory. La respuesta esperada tiene decenas de campos y un número acotado de líneas; M8 limita el pedido a 30 líneas, la página GraphQL a 20 y pide cinco por página desde la interfaz. El cliente consulta a demanda, no mantiene una suscripción.

No hay una pantalla que pregunte por ventas históricas globales, cohortes, tendencias, demanda por hora o exportaciones analíticas. Las facturas propias son una consulta documental por titular, no un requisito de big data. Tampoco hay evento de despacho de alta frecuencia, dispositivo conectado, seguimiento GPS ni consumo interno que requiera un stream. El camino de negocio actual es request/response y la consulta GraphQL hace una lectura de Orders más una petición batch de Inventory.

## Caracterización de carga

| Magnitud | Caracterización de diseño (proyección, no medición) | Perfil medido en `prueba-carga.mjs` |
|---|---|---|
| Volumen almacenado | Catálogo demo: 6 productos; pedidos pequeños, máximo actual de 30 líneas por pedido. No existe histórico masivo en el prototipo. | 1 pedido ficticio de 1 línea, 1 ficha pública agregada. |
| Tamaño por solicitud/respuesta | Solicitud GraphQL menor a 8 KiB y body menor a 16 KiB; salida de un resumen propio acotado, típicamente unos pocos KiB. | 325 bytes por solicitud GraphQL; 209 bytes promedio por respuesta en esta selección de campos. |
| Concurrencia | En la primera etapa se planifica una carga baja: hasta 4 lecturas concurrentes; no hay estimación de mercado/usuarios reales. | 4 trabajadores concurrentes, 5 solicitudes cada uno, 20 en total. |
| Frecuencia | Lectura al abrir o refrescar Seguimiento; no hay sondeo automático. | Una ráfaga de 20 solicitudes, una sola vez. |
| Latencia esperada | Meta local inicial: p95 ≤ 500 ms para la operación GraphQL completa, sin afirmar una garantía productiva. | Medición: p50 18,07 ms; p95 82,16 ms; p99 83,41 ms; máximo 83,41 ms. |
| Errores/limitación | Meta del perfil: 20/20 respuestas HTTP 200 sin GraphQL errors ni 429, bajo el límite M8 de 30/min/IP. | Medición: 20/20 HTTP 200, cero errores GraphQL/HTTP, cero 429. Throughput observado: 124,11 solicitudes/s durante una ráfaga pequeña. |
| CPU y memoria | No se presupone procesamiento intensivo; se reporta consumo de procesos del backend local como línea base, no como mejora. | Medición de 7 procesos: 0,6406 CPU-s; 11,31 % del total de 12 procesadores lógicos durante la ventana medida; working set máximo muestreado 348,48 MB. Ventana corta: 3 muestras a 10 ms. |
| Streaming | No requerido: no hay actualizaciones continuas ni relación bidireccional navegador-servidor. | No aplica en esta carga. |

La caracterización es una **proyección de diseño** basada en los contratos/semillas actuales. Los valores que aparecen en el reporte de carga son una **medición real del prototipo en este equipo local**, no una proyección de producción ni datos de uso de clientes.

El detalle del entorno, los objetivos comparados, la interpretación y los límites está en [`Resultados-carga.md`](Resultados-carga.md); los valores completos y la marca de tiempo están en [`evidencia-carga.json`](evidencia-carga.json).

## Alternativas consideradas

1. **Agregar Analytics privado con un read model/eventos:** permitiría informes agregados futuros, pero hoy no hay pregunta de negocio, volumen, política de actualización ni pantalla que los consuma. Copiar pedidos/clientes aumentaría superficie de privacidad y riesgo de divergencia.
2. **Cambiar Orders/Inventory a gRPC unary:** tiparía mensajes internos, pero los intercambios actuales son simples y pequeños, cada integración hace una llamada HTTP/JSON acotada, y la agregación M8 ya funciona por contrato explícito. Un `.proto`, canal, certificado y manejo de estados añadirían operación sin una necesidad medida.
3. **Usar gRPC streaming para estados/eventos:** no hay productor/consumidor de eventos de alta frecuencia ni requisito de continuidad/reanudación. El frontend web no consumiría directamente una RPC gRPC estándar; haría falta un adaptador browser-compatible.
4. **Conservar HTTP/JSON privado, GraphQL para la lectura de pantalla y stores de autoridad:** mantiene las operaciones actuales, minimiza nuevas dependencias y permite medir el endpoint real. Si la necesidad o la medición cambia, se reabre este ADR con datos del negocio.

## Decisión

Se elige la alternativa 4:

- No crear un servicio Analytics en este módulo. No hay origen analítico nuevo, pipeline, agregación necesaria ni demora aceptable que definir para un caso de uso presente.
- No crear contrato `.proto`, cliente ni servidor gRPC. Ninguna colaboración actual exige streaming o volumen/mensajes que lo justifique. Orders y Inventory conservan sus contratos HTTP/JSON privados; el GraphQL Gateway de M8 puede continuar componiendo esas respuestas.
- Mantener la solicitud de navegador a través del API Gateway. No exponer puertos internos ni transmitir gRPC al frontend.
- Ejecutar la prueba pequeña reproducible sobre la ruta real de Seguimiento y reportar latencia, throughput, errores, CPU y memoria sin declarar que gRPC mejoraría el rendimiento.

## Consecuencias

**Beneficios:** no se duplican pedidos ni clientes en un almacén analítico innecesario; cada sistema conserva autoridad; no se añade infraestructura, certificación gRPC, gestión de streaming, replay ni una segunda fuente de verdad; la respuesta del browser permanece HTTP/GraphQL.

**Límites:** no se ofrecen dashboards históricos ni suscripciones a eventos. La medición local con pocos usuarios no representa carga de producción ni permite extrapolar capacidad. El prototipo usa archivos JSON, loopback y una cuota por IP en memoria.

**Reapertura del ADR:** reconsiderar Analytics si se acuerdan preguntas de reporte globales con frecuencia, retención, retraso y roles concretos; reconsiderar gRPC si una integración interna medida necesita alto volumen, baja latencia o streaming. Cualquier propuesta debe probarse y compararse contra el transporte actual; no asumir una mejora por cambiar de protocolo.

## Trazabilidad con código

M8 mantiene `POST /api/v1/graphql` en el API Gateway y consulta Orders + Inventory por HTTP interno. La prueba de carga usa esa misma ruta, cookie de sesión e identidad titular; no llama directamente a bases o puertos de subsistemas. No se agrega resolver analítico porque no hay resultado analítico requerido. La prueba y el reporte están en `prueba-carga.mjs`, `medir-carga.ps1`, `evidencia-carga.json` y `Resultados-carga.md`.

## Control antes de avanzar

| Pregunta | Respuesta |
|---|---|
| ¿Analytics es necesario para un informe o volumen que el caso realmente tiene? | No en la etapa actual; el único agregado es un resumen propio de baja cardinalidad ya resuelto en M8. |
| ¿Una operación interna requiere gRPC o streaming? | No; las llamadas observadas son puntuales y pequeñas, sin stream o alta frecuencia. |
| ¿La decisión se basa en datos o proyección? | La necesidad de sistemas nuevos parte de la proyección modesta del caso; además, una prueba local midió 20/20 respuestas HTTP 200, p95 82,16 ms y cero errores. El tamaño de muestra no permite extrapolar a producción. |
| ¿Se conservan el backend obligatorio y el agregado GraphQL M8? | Sí. La decisión excluye únicamente componentes adicionales no justificados. |
