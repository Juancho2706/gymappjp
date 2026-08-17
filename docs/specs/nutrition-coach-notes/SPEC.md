# SPEC — Notas del coach por franja y por grupo («el globito»)

- **Origen:** feedback de un nutricionista en prueba (audios 2026-08-17) + decisión del
  dueño («dale full»). Artifact de diseño aprobado: `ea0d7728` (Notas del Coach).
- **Rama:** `rnmobiledenuevo`. **Cero DDL, cero backend nuevo**: los campos YA existen en el
  contrato y la DB — `NutritionMealSlotSchema.instructions` (≤2000), `notes` del grupo de
  porciones (≤1000) y `notes` del item (≤1000) viajan por el publish desde el día uno.
  Esta feature es SUPERFICIE pura (editor + vista del alumno), OTA-able.

## Decisiones

**N1 — Alcance v1: franja + grupo.** El editor único (web y RN) gana el botón de nota 📝
en (a) el header de cada franja → edita `slot.instructions`, y (b) cada fila de grupo de
porciones → edita `group.notes`. La nota por ITEM queda para v2 (el campo existe; no se
expone aún).

**N2 — El botón:** discreto (mismo tamaño/trato que los controles del header, 
estilo del chevron); SIN nota = neutro apagado; CON nota = teñido de marca (mismo patrón
de contraste de Familia N). Abre `QeBottomSheet` (web) / sheet RN con textarea + contador
de caracteres + botón limpiar. Cero popovers nuevos.

**N3 — El alumno la VE** (si no la ve, la feature no existe): banda tenue bajo el título
de la franja y bajo el grupo en el «Hoy» del alumno (web/PWA y RN) — estilo nota de marca
(fondo primario ~8%, borde suave), icono 💬, texto plano (sin markdown). Verificar que el
RPC/fetch del Hoy ya devuelva `instructions`/`notes`; si no los trae, sumarlos al SELECT
(aditivo, sin DDL).

**N4 — NO es mensajería** (regla vigente: el canal de conversación es WhatsApp): la nota
es parte del PLAN, se versiona y llega al publicar. Sin respuestas, sin hilos, sin push.

**N5 — Ediciones y publish:** las notas entran a la MISMA gramática del editor
(dispatch/undo/draft/publish como cualquier campo); cuentan como cambio sin publicar.

## Invariantes

- Cero solapes nuevos: el 📝 vive en la fila de controles existente (D2-style).
- Con nota vacía/whitespace ⇒ se guarda `null` (nunca strings vacíos).
- El quick-edit clásico y el wizard NO se tocan (están en retiro).
- Guía Viva intacta (si un target del tour comparte fila, el ancla no se mueve).

## Criterios de aceptación

- Editor web y RN: escribir/editar/limpiar nota de franja y de grupo; sobrevive draft y
  publish; undo la revierte.
- Alumno web y RN: la nota publicada se ve bajo franja/grupo; sin nota, cero ruido.
- Tests del reducer (set/clear/publish payload) + tests de render del Hoy.
- Gates completos verdes; visual check sin regresiones (308+).
