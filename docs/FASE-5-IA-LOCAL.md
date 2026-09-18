# Fase 5 — IA local con Ollama, sin backend

**Fecha:** 18/09/2026 · Implementa PLAN4.md sección 5 y cierra la Fase 1 (que había dejado el
asistente en "IA no configurada" al sacar el backend remoto).

## Qué se agregó

| Archivo | Qué hace |
|---|---|
| `js/ai/ollama.js` | Adaptador: `isAvailable()`, `listModels()`, `chat()`, config en `localStorage` |
| `js/ai/chat.js` | Reescrito para usar el adaptador: system prompt con el resumen de la flota, loop de tool-calling, badge de estado |
| `js/ui/config.js` | Sección "Asistente IA — Ollama": URL, detectar modelos, elegir y guardar |
| `index.html` | Badge de estado (`ai-status-badge`) en el header del panel de IA |
| `styles/components.css` | Estilos del badge (Local / No configurada / Verificando) |

## Cómo funciona

El navegador llama **directo** a `http://127.0.0.1:11434` (u otra URL configurada) — no hay
ningún servidor intermedio. Cada mensaje:

1. Verifica disponibilidad (`GET /api/tags`, con timeout de 2,5 s) y actualiza el badge.
2. Si no hay modelo elegido, lista los descargados y usa el primero (lo recuerda para la
   próxima vez).
3. Arma un mensaje `system` con un resumen de la flota (igual que antes, `buildContextSummary()`
   sin cambios) y lo antepone a la conversación — se recalcula en cada mensaje, así refleja los
   datos actuales, no una foto de cuando arrancó el chat.
4. Llama a `POST /api/chat` con la tool `get_equipo_detalle`. Si el modelo la pide, se resuelve
   contra el IndexedDB local (`resolveEquipoDetalleTool()`, sin cambios) y se le devuelve el
   resultado para que siga, hasta 8 rondas.
5. Sin streaming: cada ronda reemplaza el texto mostrado entero. Se eligió así porque ya era el
   comportamiento visible (el loop de tool-calling reemplaza el texto en cada vuelta) y evita
   ensamblar chunks de un protocolo distinto al de Anthropic.

**Sin búsqueda web**: un modelo local no sale a internet por su cuenta, y agregarla necesitaría
un backend con su propia clave — lo que esta fase evita a propósito (ver PLAN3, "el primer
release debe arrancar con IA local opcional y búsqueda web deshabilitada").

## Diferencias con el backend viejo (`extras/remote-chat/`)

| | Backend remoto (Anthropic) | Ollama (esta fase) |
|---|---|---|
| Dónde corre | Servidor (Vercel u otro) | La computadora del usuario |
| Autenticación | Secreto en el frontend (no protegía nada) | Ninguna necesaria — no sale de la red local |
| Formato de mensajes | Bloques de contenido (`text`/`tool_use`/`tool_result`) | Texto plano + `tool_calls` |
| Búsqueda web | Sí (con costo aparte) | No |
| Costo | Por token, facturado | Ninguno |

## Verificación (18/09/2026)

Sin una instalación real de Ollama disponible en el entorno de pruebas, se verificó:

| Prueba | Resultado |
|---|---|
| Sin Ollama corriendo: badge | "No configurada", sin errores no controlados en consola |
| Sin Ollama corriendo: enviar un mensaje | Mensaje con instrucciones (instalar, `ollama pull`, link a docs/DEPLOYMENT.md) |
| Modal Configuración → Detectar (sin Ollama) | "No respondió nada en `http://127.0.0.1:11434`. ¿Está instalado y corriendo?" |
| **Round-trip completo con Ollama simulado** (`fetch` interceptado en la página, simulando `/api/tags` y dos rondas de `/api/chat`) | Selecciona el modelo detectado, pide la tool `get_equipo_detalle` con el `interno` correcto, la resuelve contra un equipo real insertado en IndexedDB, le devuelve el resultado al "modelo" y renderiza la respuesta final. Badge pasa a "Local". |

Pendiente para la Fase 6: probar contra una instalación real de Ollama (esta sesión no tiene
una disponible) y confirmar el modelo recomendado (`qwen2.5:7b` u otro) da buenas respuestas de
tool-calling con datos reales de la flota.
