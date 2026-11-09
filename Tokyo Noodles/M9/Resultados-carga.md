# M9 — Resultados de la prueba de carga

**Fecha:** 9 de noviembre de 2026.  
**Tipo de resultado:** medición del prototipo local, no proyección ni prueba de producción.  
**Evidencia estructurada:** [`evidencia-carga.json`](evidencia-carga.json).

## Escenario medido

Se autenticó una cuenta local ficticia y se creó un pedido de demostración con un producto. Luego se ejecutaron 20 consultas `M9Load` de Seguimiento, por `POST /api/v1/graphql` del API Gateway, con cuatro trabajadores concurrentes. Cada respuesta agrega el pedido propio desde Orders y la ficha pública del producto desde Inventory. Se midió solo la ráfaga GraphQL; el inicio de sesión y la creación del pedido preparan los datos y no forman parte de las latencias reportadas.

El cuerpo GraphQL tuvo 325 bytes en cada solicitud y la respuesta promedió 209 bytes. Los valores describen esta selección concreta de campos y el pedido ficticio de una línea.

## Entorno

| Elemento | Registro |
|---|---|
| Sistema operativo | Windows, versión de kernel reportada `10.0.19045.0` |
| Node.js | `v24.22.1` |
| Procesadores lógicos | 12 |
| Procesos incluidos | 7 procesos Node del backend: supervisor, cuatro subsistemas, API Gateway y GraphQL Gateway |
| Modelo de CPU / RAM física | No disponibles en el entorno restringido; no se infieren |
| Duración de la ráfaga | 0,1611 s |
| Duración de la ventana de recursos | 0,4721 s |

## Resultados

| Métrica | Observación | Objetivo de diseño local | Evaluación |
|---|---:|---:|---|
| Solicitudes completadas | 20/20 | 20/20 | Cumple |
| Concurrencia | 4 | 4 | Perfil aplicado |
| HTTP | 20 respuestas `200` | Sin `429` ni errores HTTP | Cumple |
| Errores GraphQL / otras fallas | 0 / 0 | 0 | Cumple |
| Tasa de error | 0 % | 0 % | Cumple |
| Latencia p50 | 18,07 ms | Informativa | — |
| Latencia p95 | 82,16 ms | ≤ 500 ms | Cumple en esta ejecución local |
| Latencia p99 / máxima | 83,41 / 83,41 ms | Informativa | — |
| Throughput observado | 124,11 solicitudes/s | Informativo; carga pequeña | — |
| CPU acumulada de procesos backend | 0,6406 segundos de CPU | Registrar, sin umbral productivo | Medida |
| Uso promedio de CPU relativo a 12 procesadores | 11,31 % durante la ventana de recursos | Registrar, sin umbral productivo | Medida |
| Working set inicial / máximo muestreado | 325,84 / 348,48 MB | Registrar, sin umbral productivo | Medida; máximo aproximado |
| Crecimiento del working set sobre la muestra inicial | 22,64 MB | Registrar, sin umbral productivo | Medida; máximo aproximado |

## Interpretación y límites

El p95 queda bajo la meta inicial de 500 ms en esta ejecución y no hubo errores bajo cuatro solicitudes concurrentes. Esto solo confirma que el flujo funciona para una carga pequeña en este equipo. El throughput no es una promesa de capacidad: la muestra es de 20 consultas, la persistencia es JSON local, la red usa loopback y el rate limit se reinicia al levantar el Gateway.

La ventana de recursos duró menos de medio segundo y reunió solo tres muestras de memoria a intervalos nominales de 10 ms. El working set máximo puede perder picos breves; CPU y memoria son una referencia básica del prototipo, no una comparación entre transportes ni una evidencia de que gRPC mejore el rendimiento. El modelo de CPU y RAM física no se pudieron leer por las restricciones del entorno.

La carga no prueba pagos, escritura concurrente, recuperación de desconexiones, crecimiento histórico, privacidad con datos reales ni comportamiento multiusuario de producción. No incluye los intercambios de inicio de sesión y creación del pedido en la latencia GraphQL medida.

## Repetición

Desde la raíz del proyecto, con las credenciales locales configuradas en `MODULO 3/backend/.env`, ejecutar:

```powershell
powershell -ExecutionPolicy Bypass -File .\M9\medir-carga.ps1
```

El wrapper levanta un backend nuevo, genera un pedido ficticio, ejecuta la carga a través del API Gateway, registra las métricas en `evidencia-carga.json` y detiene los procesos que inició. Reemplaza la evidencia con los valores de la nueva ejecución.
