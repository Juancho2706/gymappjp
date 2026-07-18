# Fix verif adversarial — unidad `ficha-shell-hero` (Seccion 3)

GATE: `npx tsc --noEmit` (apps/mobile) = **EXIT 0 limpio**.
Archivo tocado (propio de la unidad): `apps/mobile/app/coach/cliente/[clientId].tsx`.
NO se commiteo. NO se toco global.css/tailwind ni arbol alumno/ejecutor.

## P0
Ninguno. (Verificador: RESUELTO — spec §12.6 useFocusEffect ya en `[clientId].tsx:98-102`; spec §2.3 hero dark plomo ya via `mixSurfaces` `ClientHero.tsx:77-82,115`.)

## P1 corregido

### Finding 2 — Chip "% plan" leia ventana equivocada (FIX APLICADO)
- **Antes:** `[clientId].tsx:230` → `nutritionPct: data.compliance?.nutritionWeeklyAvgPct ?? 0` (promedio SEMANAL).
- **Web (fuente de verdad):** `ClientProfileHero.tsx:124` `nutritionPct = compliance.nutritionCompliancePercent`; chip render `:331-338` value=`${mealsDone}/${mealsTotal}` (HOY) + sub `${nutritionPct}% plan`. El valor `nutritionCompliancePercent` = `client-detail.service.ts:354` = `Math.min(100, Math.round((mealsDoneToday / todayMealsTotal) * 100))` (con piso 1 en total, `:350-351`). Es cumplimiento de HOY, la misma ventana que el conteo `mealsDone/mealsTotal` del chip.
- **Bug:** RN mostraba `2/3` (hoy) con `%` semanal → numero y color (umbral ≥80 → success/warning) divergian del web y eran internamente inconsistentes (conteo de hoy, % de la semana).
- **Fix:** calculo espejo del web con la ventana de HOY:
  ```
  const mealsDoneToday = derived.today?.mealsDone ?? 0
  const mealsTotalToday = Math.max(1, derived.today?.mealsTotal ?? 1)
  ...
  nutritionPct: Math.min(100, Math.round((mealsDoneToday / mealsTotalToday) * 100)),
  ```
  Reusa `derived.today.mealsDone/mealsTotal` (los MISMOS valores que ya alimentan el value del chip `:228-229`), asi el numerador/denominador del % y el conteo mostrado coinciden 1:1 con `ClientProfileHero`. Umbral de color (`chips.nutritionPct >= 80 ? success : WARNING`, `ClientHero.tsx:185`) ya coincidia con web `:335`.
- Pura paridad de dato/color, sin cambio de gesto ni de flujo.

## P1 NO auto-sancionado → PENDIENTE-DECISION-CEO (regla global 8 + clasificacion del verificador, spec §15)
Estos tres cambian LOGICA/GESTO/ALCANCE (no son swaps de dato), por lo que la regla 8 prohibe auto-sancionarlos. Evidencia file:linea para la decision:

### Finding 1 — Status nunca "Urgente" + estados extra neutral/Archivado/Inactivo (DECISION-CEO)
- RN: `[clientId].tsx:213-218` computa el status inline con solo `ok`/`attention`/`neutral`:
  - `neutral` + label "Archivado" si `is_archived` (`:216`), "Inactivo" si `!is_active` (`:217`) — estados que el **web nunca** pinta.
  - `attention` si `derived.attention` (`:218`), else `ok` "Al dia" (`:214`).
- Web: `ClientProfileHero.tsx:141-150` usa `deriveClientStatus` (de `@eva/profile-analytics`, re-export `clientStatusUtils.ts:4`) → niveles `urgent`/`attention`/`ok`; `urgent`→tono `danger` (`STATUS_TONE :58`) por 14d-inactivo / ciclo vencido. RN da esos casos como `ok` "Al dia" verde (falso positivo de tranquilidad).
- **Por que es decision CEO:** (a) portar `urgent` fielmente exige alimentar `deriveClientStatus` con senales crudas (`daysSinceCheckin`, `daysSinceWorkout`, `planDaysRemaining`) que el modelo mobile hoy NO expone en `data.compliance` (solo `checkInCompliancePercent`, `nutritionWeeklyAvgPct`); (b) los estados `neutral`/Archivado/Inactivo son FUNCIONALIDAD RN existente (regla 2: no eliminar sin anotar) que el web no tiene — unificar a la funcion pura del package elimina esos labels. Cambio de logica de negocio + de UX de estados → CEO.

### Finding 3 — WhatsApp: gate de digitos y texto prellenado (DECISION-CEO, cambia gesto)
- RN: `[clientId].tsx:118-123` `openWhatsApp` abre con CUALQUIER digito (`replace(/\D/g,'')` sin minimo) y con texto prellenado `Hola {nombre}! Te escribo desde EVA.`; sin telefono → `Alert.alert('Sin telefono', ...)`. El boton flotante (`ProfileFloatingActions.tsx:44-56`) SIEMPRE se renderiza tappable.
- Web: `ProfileFloatingActions.tsx:5-9,63-64` exige `digits.length >= 10` (`digitsForWhatsApp`), si no hay valido el boton se renderiza **disabled** (`:124-152`, `cursor:not-allowed`), y `waHref = wa.me/${digits}` **SIN** `?text=` (`:64`).
- **Por que es decision CEO:** dos cambios de flujo/gesto — (a) disabled-button vs alert (el FAB RN siempre invita al tap; alinear exige propagar un `disabled` a `ProfileFloatingActions`), (b) quitar el texto prellenado (nicety agregada por RN; regla 2/8). Ambos alteran lo que el coach ve y puede hacer → CEO. (El `ClientActionsSheet` web ademas si prellena texto con el loginUrl `ClientActionsSheet.tsx:141-145`, distinto del FAB — ver finding 4.)

### Finding 4 — Menu ⋮: 2 acciones vs 6 del web (DECISION-CEO, cambia alcance)
- RN: `[clientId].tsx:319-328` `ActionSheet` = 2 acciones (Editar datos, Archivar/Reactivar).
- Web: el hero abre `ClientActionsSheet` (`ClientProfileHero.tsx:350-368`) con **6** acciones + `loginUrl` (`ClientActionsSheet.tsx:172-235`): Ver ficha completa, Enviar WhatsApp (con loginUrl prellenado), Editar datos, Resetear contrasena (genera clave temporal, `:238-272`), Pausar/Reactivar acceso (`:216-221`), Archivar/Desarchivar, Eliminar alumno (con confirmacion por nombre, `:325-339`).
- **Por que es decision CEO:** faltan reset-password, pausar-acceso y eliminar-alumno — cada una requiere accion server nueva en el cliente RN + su flujo nativo de confirmacion (dialogo de clave temporal con copiar, confirm-por-nombre para borrado). Es ampliacion de ALCANCE, no un swap. → CEO.

## Notas
- No se toco ningun archivo READ-ONLY de unidades hermanas ni del arbol alumno/ejecutor.
- El badge '!' de la pestana Nutricion (`[clientId].tsx:240`) sigue usando `nutritionWeeklyAvgPct < 60` (riesgo semanal) — fuera del alcance del finding 2 (que es el chip "% plan" del hero) y coherente con el "at risk" semanal del web.
