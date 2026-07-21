# SPEC — "Comí toda esta comida" (bulk-mark de franja) · Nutrición V2 alumno

## Problema
Hoy el alumno marca cada alimento prescrito con "Lo comí" **uno por uno**. En comidas de 4-6
alimentos es tedioso. El CEO pide un botón por comida/franja que registre de una toda la tanda.

## Objetivo
Un control por franja que marque como consumidos, en una sola acción, todos los alimentos
prescritos **obligatorios** de esa franja que aún no estén registrados.

## Decisiones (CEO 2026-07-21)
- **Excluir opcionales**: el bulk marca solo los items NO opcionales. Los opcionales conservan su
  botón individual "Lo comí". (Evita inflar el consumo con comida que el alumno pudo no comer.)
- Sin migración de base: se reusa el RPC idempotente `record_nutrition_intake_v2`.

## Alcance
- Superficies: web PWA (`/c/[coach_slug]/nutrition-v2`) + RN (`apps/mobile/app/alumno/(tabs)/nutrition-v2`).
- Solo la sección "Tu plan de hoy" (items fijos de cada franja). NO toca porciones/intercambios
  (`exchangeTargets`), que tienen su propio flujo (+1 / +0,5).

## Comportamiento
Por cada franja con items fijos:
- **Elegibles** = items prescritos `!optional` y NO consumidos aún.
- **Requeridos** = items prescritos `!optional` (consumidos + no consumidos).
- Estados del control (derivados por el helper puro):
  - `all-open` (0 requeridos consumidos) → CTA **"Comí toda esta comida"**.
  - `partial` (algunos requeridos consumidos, quedan N) → **"Comer lo que falta (N)"**.
  - `complete` (todos los requeridos consumidos) → sin CTA; chip **"Comida completa"**.
  - `none-required` (la franja solo tiene opcionales/porciones) → sin control bulk.
- Acción: registra cada elegible con su propia idempotency key (paridad 1:1 con el "Lo comí"
  individual: mismo payload prescrito y source `prescription`). Web agrupa los RPC tras una sola
  autorización; RN reusa secuencialmente el runner individual existente.
- **Idempotencia / parcial**: cada item lleva su key; los ya consumidos se saltan. Si algún item
  falla (rate-limit, red), se registran los que pudieron y se informa "quedaron N sin registrar";
  el reintento solo toca los faltantes (idempotente).
- **Undo transitorio**: tras el éxito, toast/snackbar "Registraste tu {franja} · Deshacer" que
  anula (void de contribución cero, camino existente) los N registros recién creados. Si se
  descarta, el undo por-item sigue disponible en "Consumido hoy" / retirar.
- **Feedback**: UNA sola celebración por tanda (no N). Progreso por franja visible en el header.

## Backend
- Web: nueva server action `recordSlotIntakeBatchAction({ payloads[], revalidatePath })`:
  1 solo `authorizeStudentWrite` (1 cargo de rate-limit `nutritionIntake`) → itera el RPC
  server-side → devuelve `{ ok, ids, failed }`. `voidSlotIntakeBatchAction` simétrico para el undo.
- Mobile: no añade acciones ni gateway nuevos. `TodaySlotCard` itera `submitRecordIntake` y el
  runner de corrección existentes; online realiza N requests y offline encola N operaciones con
  keys estables. Esta divergencia conserva idempotencia, optimismo, undo y reintentos ya probados,
  a costa de no reducir los round-trips online.

## No-objetivos
- No atomicidad todo-o-nada (el intake es self-report; el estado parcial es la norma).
- No tocar el RPC ni el esquema. No un botón "día completo" global (fuera de alcance).

## Métrica de éxito
Marcar una comida de N items pasa de N taps a **1 tap** en ambas superficies. Web también baja a
1 round-trip; RN conserva N round-trips online hasta que exista evidencia que justifique un batch
server-side sin duplicar el pipeline offline.
