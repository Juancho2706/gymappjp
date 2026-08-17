# SPEC — T2.7 Re-skin del alumno + paleta de macros fija

> **CERRADA — 2026-08-17.** Implementación verificada en el árbol (auditoría specs-vs-código);
> evidencia clave: en producción web `ad08e319..5175de5b` + `MOBILE_PARITY.md:213`.

- **Programa padre:** [nutrition-flows-redesign](../nutrition-flows-redesign/TASKS.md) (item T2.7, Ola 2).
- **Rama:** `rnmobiledenuevo`. Web a prod = merge a master con OK del owner.
- **Fuente visual canonica:** [catalogo de pantallas](https://claude.ai/code/artifact/1333da4a-a9f2-4acc-9f82-952aa936d3eb) (2026-08-06), secciones Alumno 01 (Hoy), 03 (Correccion) y 05 (Plan + Historial).
- **Decisiones del owner ya tomadas:** re-skin va al cierre de O2, antes del OTA unico (06-08) ·
  paleta de macros al **trio fijo** P `#5E9FD6` / C `#FFB74D` / G `#81C784`, opcion 2 (07-08).

## Objetivo

Que las pantallas del alumno queden como el catalogo — jerarquia banda → nota → franjas, registrar
= confirmar — y que los colores de macros sean UNA sola paleta fija en web y RN, sin white-label.
Sin perder ninguna funcion existente (todo lo de O1/T2.x se conserva; cambia la piel y la jerarquia).

## Alcance

| Pieza del catalogo | Entra | Nota |
|---|---|---|
| Alumno 01 — Hoy plan-first | ✅ | El corazon del re-skin |
| Alumno 02 — Intercambio | ❌ ya SHIPPED | T2.5 (swipe + sheet 2 bloques + D5 pista) |
| Alumno 03 — Correccion | ✅ parcial | Solo lo visual que falte (stepper/chips ya existen — verificar) |
| Alumno 04 — Registro texto | ❌ | Es T3.5 (el propio catalogo lo marca F3) |
| Alumno 05 — Plan + Historial | ✅ | 4 decisiones |
| Paleta macros trio fijo | ✅ | Web + RN + superficies V1 alineadas |
| Coach (editor, plantillas, alimentos, roster) | ❌ | T3.x editor unico |

## Auditoria contra HEAD (2026-08-13)

### Paleta (F1) — estado real

- `packages/nutrition-v2/design.ts` `NUTRITION_MACROS`: P=`ember` (naranja) · C=`sport`
  (**rampa white-label**: el color de carbos cambia con la marca del coach) · G=`aqua`.
- RN `apps/mobile/lib/theme.ts` `resolveNutritionMacroColors(brandColor)`: mismo trio ember/sport/aqua,
  carbs sigue `resolveSportRamp(brandColor)`. Unico caller: `AuraHero.tsx` RN.
- Web `globals.css` YA tiene los tokens canonicos `--color-macro-protein/carbs/fats` = trio fijo
  (lineas 71-73) **dentro de `@theme inline`** ⇒ las utilidades `bg-macro-*` / `text-macro-*` ya se
  generan; las superficies V1 (`/c/[slug]/nutrition/**`, dashboard) las usan via
  `var(--color-macro-*)` desde el overhaul. Las variantes `-dark` (76-78) NO se usan en ningun
  componente: la practica de prod es el trio base en ambos esquemas. F1 replica esa practica.
- Hardcodes de macro fuera de `NUTRITION_MACROS` (inventario completo):
  web `NutritionV2Overrides.tsx:19-27` · web `c/…/AuraHero.tsx:300-302` (mapa local de texto) ·
  web builder `DayTotalsBar.tsx:39-41` · web coach `AddFoodSheet.tsx:268-270` ·
  RN `AuraHero.tsx:59-62` · RN `NutritionV2Kit.tsx:125-133`.
- RN no tiene tokens macro: se agregan canales a `apps/mobile/global.css` + colores a
  `tailwind.config.js` (`bg-macro-*`, `text-macro-*`), espejo de los canonicos web.
- Tests que fijan el comportamiento viejo: `tests/mobile-aura-theme.test.ts` ("solo carbohidratos
  sigue la rampa sport") — se invierte: NINGUN macro sigue la marca.
  `white-label-tokens.test.ts` es agnostico de paleta (3 hues distintos) y sigue verde.
- El acento del coach en `NotesThread` (#5E9FD6 coincidente) NO es un color de macro: fuera.

### Hoy (catalogo Alumno 01) — estado por decision

| # | Decision del catalogo | Estado en HEAD |
|---|---|---|
| 1 | Banda con rango sombreado, no numero-anillo | ⚠️ CONFLICTO: la semantica de rango YA vive en `AuraHero` (copy por tramo bajo/en/sobre el rango) pero el visual es aura + **anillo de energia** — recien pintado en el OTA `12a32906` (12-08) y el owner dijo que la rueda "se ve fea". **Decision owner pendiente: banda (catalogo) vs anillo actual** |
| 2 | Nota del coach siempre expandida | Web ya; RN verificar (el catalogo dice que RN la colapsa a 1 linea) |
| 3 | Checkbox primario 22px a la izquierda; muere el boton verde "Lo comi" | ❌ PENDIENTE: "Lo comi" vivo en `TodayExperience.tsx` web y `alumno/(tabs)/nutrition-v2/index.tsx` RN |
| 4 | "⇄ N equivalentes" visible en la fila | Parcial: swipe + D5 (pista one-shot) shipped en T2.5; el conteo literal en la fila — verificar |
| 5 | Porciones dentro de su franja | ✅ shipped (PortionSlotSection) |
| 6 | Comida libre como recurso (cupo del coach) | ❌ NO existe y NO es re-skin: exige dato nuevo otorgado por el coach ⇒ **proponer diferir a T3.6 (presupuesto/libres presupuestadas)** |
| 7 | Racha honesta semanal "4 de 7 en rango" | ❌ PENDIENTE (no hay agregado semanal en el Hoy) |
| 8 | Pasarse del 100% sin drama (verde dentro del rango) | ✅ semantica ya en AuraHero; revisar copy |
| 9 | Compartir se mantiene | ✅ existe |

### Plan + Historial (catalogo Alumno 05)

| # | Decision | Estado |
|---|---|---|
| 1 | Reglas reales, no chips decorativos (poda de permisos) | Web podado (T2.4: canSubstitute ya no se pinta); RN alinear — verificar |
| 2 | Dias con nombre (label del coach visible al alumno) | Verificar (los labels existen en el contrato) |
| 3 | Tendencia arriba: 4 barras semanales antes de las cards del historial | ❌ PENDIENTE |
| 4 | Semana actual SOLO en Hoy (web mata el duplicado) | Verificar en web |

### Correccion (catalogo Alumno 03)

Stepper hibrido + chips de razon + append-only: shipped en O1/T2.x (sheet de correccion con chips,
QA 06/07-08). F4 = verificacion visual contra el mock y deltas menores, no reconstruccion.

## Decisiones abiertas (owner) — NO bloquean F1

1. **D-A: banda vs anillo** (Hoy #1). El catalogo pide banda con rango sombreado; el anillo se
   pinto hace 1 dia y no gusto ("se ve fea"). Recomendacion: banda del catalogo (resuelve la queja
   y es la decision documentada del 06-08).
2. **D-B: cupo de comida libre** (Hoy #6): diferir a T3.6. Es una feature con dato nuevo, no piel.
3. **D-C: matar "Lo comi" por el checkbox** (Hoy #3): el catalogo ya lo decide; confirmar porque
   cambia el gesto mas usado del producto.

## Fuera de alcance

Registro por texto (T3.5) · pantallas del coach (T3.x) · cupo de comida libre (T3.6 propuesto) ·
V1 (congelada; ya alineada por tokens) · micros avanzados.

## Gates

Por fase: tsc web+mobile · eslint tocados · vitest focalizado · boundaries · docs:check.
Cierre: re-QA visual completa de las superficies tocadas (anillos, chips y barras QA-eadas en O1
cambian de color TODAS a la vez) en preview + device, y paridad RN declarada en MOBILE_PARITY.
