# PLAN3 — FlotaControl local-first, IA local y release seguro

**Fecha de referencia:** 15/09/2026  
**Objetivo:** construir una herramienta de productividad confiable, recuperable y de bajo costo, sin depender de una suscripción paga de GitHub, Vercel o Claude.  
**Regla de trabajo:** primero se muestra y valida el diseño visual; después se implementa el frontend.

## 1. Qué tipo de aplicación es

FlotaControl debe ser una **aplicación web local-first**.

Esto significa:

- La interfaz es una aplicación web que corre en el navegador.
- Las planillas Excel se procesan localmente en el equipo del usuario.
- Los datos de trabajo se guardan en IndexedDB, dentro del navegador.
- El núcleo de cálculo no necesita un backend ni una base de datos online.
- Puede funcionar desde un servidor local o desde un hosting de archivos estáticos.
- La IA remota y la autenticación son servicios opcionales, no el núcleo del producto.

No es necesario convertirla ahora en una aplicación React, móvil nativa o SaaS. El código actual es una SPA sin framework y esa decisión es válida mientras el volumen y la complejidad sigan siendo manejables.

### Arquitectura recomendada

```text
Navegador del usuario
├── Frontend HTML/CSS/ES modules
├── Procesamiento de Excel local
├── Cálculos de consumo local
├── IndexedDB local
├── Exportación y backup local
└── Adaptador de IA opcional
    ├── Ollama o LM Studio local: recomendado para uso sin cuota de proveedor
    ├── API remota propia: opcional, requiere backend y control de costos
    └── Anthropic API: opcional, facturada por uso; la suscripción Claude no la reemplaza
```

### Qué es cada concepto

| Concepto | Función en este proyecto | ¿Es obligatorio? |
|---|---|---:|
| Frontend | Pantallas, filtros, tarjetas, tablas y acciones del usuario | Sí |
| Backend | Servicio que protege secretos, autentica o conecta con una API remota | No para el núcleo; sí para IA remota segura |
| GitHub | Guarda el código, historial, issues y versiones | No para ejecutar la app |
| Vercel | Aloja el frontend y puede ejecutar funciones serverless | No; es una opción de despliegue |
| IndexedDB | Base de datos local del navegador | Sí para el diseño actual |
| Ollama/LM Studio | Ejecuta modelos de IA en la computadora del usuario | Opcional; recomendado para IA sin cuota remota |

## 2. Restricciones reales del proyecto

- No se dispone actualmente de una suscripción paga de Vercel.
- No se dispone actualmente de una suscripción paga de GitHub.
- La suscripción de Claude está pausada.
- Una suscripción de Claude no incluye automáticamente una API para una aplicación externa.
- La API de Anthropic se factura por uso y no debe considerarse incluida en Claude.ai.
- Un modelo remoto gratuito siempre tiene límites, aunque se cambie de modelo automáticamente.
- Rotar modelos o cuentas para evitar cuotas puede incumplir términos del proveedor y no garantiza continuidad.
- “IA sin límites” solo es una promesa razonable si el modelo se ejecuta localmente o se administra infraestructura propia.
- El código puede ser abierto, pero los datos reales de HSV, reglas internas y archivos Excel no deben publicarse.
- La licencia actual del repositorio dice “Uso interno — HSV Logística”; para hacerlo full open source habrá que separar código genérico, datos y reglas propietarias.

## 3. Decisión de IA

### Opción recomendada: IA local

La aplicación debe soportar un proveedor local como primera opción:

- Ollama para ejecutar modelos locales.
- LM Studio como alternativa con interfaz gráfica.
- Endpoint configurable en la aplicación.
- Selección automática entre modelos instalados según disponibilidad y capacidad.
- Sin costo por token ni cuota de Anthropic.
- Sin enviar datos de la flota a un proveedor externo.

La selección automática puede cambiar de modelo cuando un modelo local no está instalado, falla o no tiene capacidad suficiente. No debe presentarse como una forma de esquivar límites de servicios gratuitos.

### Opción secundaria: proveedores remotos

Se puede conservar un adaptador para Anthropic u otro proveedor remoto, pero debe cumplir estas reglas:

- La clave nunca se guarda en el frontend.
- La clave solo vive en un backend controlado por el propietario.
- Cada proveedor tiene límites y costos visibles.
- El usuario ve qué datos se enviarán.
- El sistema funciona aunque el proveedor no esté disponible.
- El cambio automático de modelo solo ocurre entre modelos autorizados y configurados.

### Estado inicial de IA

El primer release debe arrancar con IA local opcional y búsqueda web deshabilitada. Si no hay Ollama, LM Studio ni backend remoto configurado, la aplicación debe informar “IA no configurada” y funcionar normalmente.

## 4. Estado técnico verificado

Se ejecutaron los tres arneses del repositorio el 15/09/2026:

| Comando | Resultado | Observación |
|---|---:|---|
| `npm run declarados` | OK | 101 chequeos |
| `npm run verificar` | FALLA | La referencia privada no coincide con el dataset actual |
| `npm run auditar` | OK | Las fórmulas son coherentes |

La diferencia de filas y litros es un bloqueo de datos. No se debe ejecutar `verificar:actualizar` hasta comparar hashes, archivos y causa de la diferencia.

Pista encontrada durante la primera fase: la referencia privada es anterior a la modificación de la planilla de cargas. Es compatible con una planilla actualizada, pero todavía hay que identificar las filas y litros modificados antes de cambiar la referencia.

## 5. Fases

### Fase 1 — Base segura y definición de arquitectura

**Estado:** ejecutada parcialmente en esta revisión.

Acciones:

- Crear este plan como fuente única de trabajo.
- Declarar FlotaControl como aplicación local-first.
- Separar núcleo local, IA opcional y hosting.
- Corregir el valor `ANTHROPIC_MAX_WEB_SEARCHES=0` para que no se transforme accidentalmente en 3.
- Documentar `APP_SHARED_SECRET` en `.env.example` sin tratarlo como autenticación.
- Incluir `referentesMeta` en la limpieza total de IndexedDB.
- Ejecutar los tres arneses y conservar la evidencia.
- No actualizar invariantes para ocultar la diferencia de datos.

Criterio de salida:

- La arquitectura está decidida.
- Los bloqueos conocidos están documentados.
- Las correcciones pequeñas no rompen los arneses.
- La discrepancia de datos tiene responsable y próxima acción.

### Fase 2 — Prototipo visual antes del frontend

**Estado:** pendiente; no implementar todavía las pantallas definitivas.

Antes de tocar el frontend se debe aprobar visualmente un prototipo de:

- Panel principal.
- Carga de archivos.
- Tarjeta de equipo.
- Detalle de cálculo.
- Seguimiento de hallazgos.
- Base de datos.
- Backup y restauración.
- Estado de IA local/remota/no configurada.
- Vista móvil.

El prototipo puede ser HTML estático, imagen o wireframe. No debe tener lógica de negocio. Su objetivo es validar jerarquía, textos y flujo de trabajo antes de escribir código UI.

### Fase 3 — Datos recuperables

Implementar:

- Exportación versionada de IndexedDB.
- Restauración transaccional.
- Validación de formato y versión.
- Backup de maestro, metas, correcciones, seguimiento, referentes, configuración, mapeos y disponibilidad.
- Decisión explícita sobre incluir o excluir movimientos.
- Mensaje visible de qué se limpia al iniciar una sesión.
- Prueba de restauración en un navegador limpio.
- Prueba de migración desde DB v14.

Formato mínimo:

```json
{
  "formatVersion": 1,
  "dbVersion": 14,
  "appVersion": "release",
  "exportedAt": "ISO-8601",
  "stores": {}
}
```

### Fase 4 — IA local y adaptadores

Implementar una interfaz común de proveedores:

```text
AIProvider
├── isAvailable()
├── listModels()
├── chat(messages, context)
└── capabilities()
```

Orden de selección:

1. Ollama local.
2. LM Studio local.
3. Backend remoto configurado por el propietario.
4. IA deshabilitada con mensaje claro.

La aplicación no debe enviar archivos completos a la IA. Debe enviar solo el contexto necesario para una pregunta.

### Fase 5 — Seguridad sin servicios pagos obligatorios

Para el núcleo local:

- CSP compatible.
- Sin secretos en el frontend.
- Escaping de valores Excel.
- Validación de URLs externas.
- Exportación y restauración locales.
- No enviar datos a servidores por defecto.

Para IA remota:

- Backend con secreto de servidor.
- Autenticación real si se expone públicamente.
- Rate limit distribuido si existe tráfico externo.
- Presupuesto y alertas del proveedor.

El `X-App-Secret` público se mantiene únicamente como filtro básico anti-bot hasta implementar autenticación real.

### Fase 6 — Verificación y release

Antes de publicar:

- `npm run declarados` en verde.
- `npm run verificar` en verde con dataset identificado.
- `npm run auditar` en verde.
- Prueba de backup y restauración.
- Smoke test de escritorio y celular.
- Prueba con IA apagada.
- Prueba con IA local.
- Prueba de reimportación sin duplicados.
- Rollback documentado.

## 6. Propuesta visual antes de implementar

### Panel de escritorio

```text
┌────────────────────────────────────────────────────────────┐
│ FlotaControl   Panel  Seguimiento  Base de Datos       ⚙   │
│ Datos locales · actualizado hoy       Backup  Re-analizar  │
├────────────────────────────────────────────────────────────┤
│ Período: 01/01/2026 → 31/08/2026 · 6/8 meses              │
│ Fuentes: Equipos ✓  Cargas ✓  GPS ✓  Metas ✓              │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ 720.231 L   │ Costo       │ 69 medidos  │ 20 hallazgos     │
│ Combustible │ $...        │ de 189      │ Revisar          │
├─────────────┴─────────────┴─────────────┴──────────────────┤
│ Calidad: GPS 63% · cobertura media · 29 períodos parciales │
├────────────────────────────────────────────────────────────┤
│ Buscar equipo...       Filtros (3)       Ordenar por...     │
├────────────────────────────┬───────────────────────────────┤
│ TR20 · dominio              │ CM43 · dominio                │
│ 6 de 8 meses                │ Sin GPS · estimado por grupo  │
│ 10,8 L/h vs meta 9,5        │ Sin medición confiable         │
│ Cargas ✓ GPS ✓ Meta ✓       │ Cargas ✓ Meta ?                │
│ [Ver cálculo] [Editar]      │ [Ver cálculo] [Seguimiento]    │
└────────────────────────────┴───────────────────────────────┘
```

### Detalle de equipo

```text
TR20 · Dominio ABC123
Período común: 6 de 8 meses

Resultado       10,8 L/hora     Meta 9,5 L/hora     Desvío +13,7%
Confiabilidad   42/120 días     GPS 6/8 meses

Cómo se calculó
Litros alineados ÷ horas alineadas
8.240 L ÷ 762 h = 10,8 L/h

Fuentes: Cargas · GPS · Consumos Estimados
[Editar equipo] [Ver cargas] [Seguimiento] [Consultar IA]
```

### IA

```text
Asistente de Flota                         [Estado: Local]
Modelo: llama3.1:8b                         [Cambiar]
────────────────────────────────────────────────────────────
La IA local no envía datos a internet.
                                                         
¿Qué querés analizar?                         [Enviar]
```

Si se usa IA remota, el mensaje cambia a:

```text
Esta consulta enviará el resumen necesario a un proveedor externo.
No se enviarán los archivos Excel completos.
```

### Vista móvil

En teléfono, los filtros pasan a un botón `Filtros (3)` y la IA se convierte en una hoja inferior. El panel no debe tener un ancho fijo de 350px ni tapar la última fila de tarjetas.

## 7. Decisión de despliegue

### Desarrollo local recomendado

```bash
python -m http.server 8080
```

Para IA local se agrega Ollama o LM Studio en la misma computadora. El núcleo de FlotaControl sigue funcionando aunque ninguno esté instalado.

### GitHub gratuito

GitHub puede utilizarse para:

- Guardar el código.
- Mantener historial.
- Trabajar con branches.
- Registrar issues.
- Publicar un repositorio privado o público según las condiciones vigentes.

No es el backend de la aplicación y no es necesario para abrirla localmente.

### Vercel gratuito

Vercel puede servir el frontend y ejecutar `/api/chat`, pero el plan gratuito tiene límites y algunas funciones de protección pueden requerir un plan superior o una configuración externa. No se debe diseñar la seguridad suponiendo que Vercel bloqueará automáticamente el endpoint.

Para el primer release sin costo:

- Priorizar ejecución local.
- Usar hosting estático solo para el núcleo.
- No depender de IA remota para operar.
- Considerar Vercel como opción, no como requisito.

## 8. Mejoras de producto posteriores

- Asociación persistente dominio-interno.
- Días trabajados con rangos.
- Motivo por fila en hallazgos.
- Tramo visible como `6 de 7 meses`.
- Badges de aporte de cada fuente.
- Tabulator solo en una vista piloto.
- Chart.js solo si mejora una decisión operativa concreta.

## 9. Definición final de listo

FlotaControl estará lista cuando:

- Funcione sin backend.
- Funcione sin IA.
- Pueda exportar y restaurar sus datos.
- Los tres arneses pasen con archivos identificados.
- No pierda correcciones al recargar o migrar.
- El usuario entienda qué datos son locales y cuáles salen del equipo.
- El diseño visual haya sido revisado antes de implementar el frontend definitivo.
- La IA local sea opcional y la IA remota no sea necesaria para usar el producto.

## 10. Registro de ejecución de la Fase 1

**Fecha:** 15/09/2026  
**Resultado:** parcialmente completada; queda bloqueada la reconciliación del dataset.

Cambios aplicados:

- Se creó este `PLAN3.md`.
- Se corrigió el tratamiento de `ANTHROPIC_MAX_WEB_SEARCHES=0`.
- La herramienta `web_search` ya no se envía a Anthropic cuando está deshabilitada.
- Se agregó `APP_SHARED_SECRET` a `.env.example`.
- El valor por defecto de búsquedas web quedó en `0`.
- `clearAllData()` ahora incluye el store `referentesMeta`.

Verificación:

- `npm run declarados`: OK.
- `npm run auditar`: OK.
- `npm run verificar`: FALLA porque la referencia privada no coincide con el dataset actual.
- `npm exec -- node --check api/chat.js`: OK.
- `npm exec -- node --check js/data/database.js`: OK.

No se ejecutó `verificar:actualizar`. El próximo trabajo obligatorio es identificar la causa de la diferencia de datos antes de pasar al prototipo visual de la Fase 2.
