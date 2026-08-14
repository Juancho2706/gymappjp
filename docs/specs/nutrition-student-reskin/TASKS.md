# TASKS — T2.7 Re-skin del alumno + paleta fija

Convenciones: `[ ]` pendiente · `[~]` en curso · `[x]` hecho con gates verdes (se anota commit) ·
`[!]` bloqueado (se anota por que).

## F0 — Auditoria y documentos

- [x] Auditoria contra HEAD (2026-08-13): inventario completo de la paleta (design.ts + 6 grupos
      de hardcodes + tokens web ya en `@theme` + RN sin tokens) y estado por decision del catalogo
      (tabla en SPEC). Hallazgos clave: "Lo comi" sigue vivo web+RN; racha semanal no existe;
      el rango ya es semantica del AuraHero pero el visual es anillo (conflicto D-A); comida libre
      es feature nueva, no re-skin (D-B).
- [x] SPEC / PLAN / TASKS (este commit)
- [x] Decisiones del owner (2026-08-13 noche, por chat): **D-A = BANDA con rango sombreado**
      (reemplaza al anillo grande del Hoy; los mini-anillos de macros se conservan) ·
      **D-B = DIFERIR el cupo de comida libre a T3.6** · **D-C = SI, checkbox primario**
      (muere el boton "Lo comi" en web y RN)

## F1 — Paleta trio fijo (sin dependencias) — **CERRADA 2026-08-13**

- [x] `NUTRITION_MACROS` a tokens canonicos (web + native classes)
- [x] Tokens RN: canales en `global.css` + `macro.*` en `tailwind.config.js`
- [x] `resolveNutritionMacroColors()` fija y sin `brandColor` (+ caller AuraHero RN, que ademas
      suelta `branding` — el hero ya no depende de la marca para los macros)
- [x] Hardcodes → tokens: `NutritionV2Overrides` · AuraHero web · `DayTotalsBar` ·
      `AddFoodSheet` web · AuraHero RN · `NutritionV2Kit`
- [x] Bonus V1 RN (la spec pide V1 alineada): `MACRO_COLORS` de `MacroRingSummary.tsx` (fuente
      unica de FoodItemRow / NutritionDailySummaryWidget / MealCardExpandable) pasa P/C/G al trio;
      `kcal` se queda (no es un macro)
- [x] Tests: `mobile-aura-theme.test.ts` invertido (ningun macro sigue la marca);
      `white-label-tokens.test.ts` verde sin tocar
- [x] Gates: tsc web 0 · tsc mobile 0 · eslint tocados limpio · vitest 10/10 · boundaries 340 ·
      docs:check OK. NO corridos: `expo export` ni suite completa (CPU del owner en uso)
- Gotcha de extraccion: `design.ts` vive en `packages/` (fuera del scan de Tailwind/NativeWind);
  las clases `bg-macro-*`/`text-macro-*` DEBEN aparecer literales en algun archivo escaneado —
  hoy las anclan los mapas locales de `NutritionV2Kit` (RN) y `NutritionV2Overrides` (web). Si
  esos mapas se refactorizan, agregar safelist.
- Deuda declarada: los PDF de exportacion (web y `nutrition-day-export.ts` RN) usan una paleta
  propia espejada entre si (blue/emerald/purple 600) — alinearlos es un cambio a DOS lados y
  queda para F5 con decision explicita.

## F2 — Jerarquia del Hoy — desbloqueada (D-A banda · D-C checkbox)

- [x] Banda de energia con rango sombreado (web + RN, 2026-08-13): `energyBandGeometry` puro en
      el paquete (riel 0→115% de la meta, zona ±10% adentro; 3 tests nuevos) + AuraHero web y RN
      reemplazan el anillo grande por la banda. Encabezado "ENERGIA · RANGO A–B" + kcal grande a
      la derecha + linea de estado (verde en rango / ambar sobre — nunca rojo). El aura glow se
      conserva (achatado detras del bloque); los mini-anillos de macros se conservan. RN anima el
      fill en pixeles (onLayout: reanimated no interpola porcentajes).
- [x] Checkbox primario; muere "Lo comi" (web + RN, 2026-08-13): `leading` nuevo en
      `NutritionFoodRow` (web) y `FoodRow` (RN Kit); `EatCheckbox` 22px con area tactil de 44px.
      Tap en vacio = registra (mismo camino `onEat`/`onAte`, idempotencia intacta); tap en marcado
      = abre "Retirar registro" (el dialogo/sheet con motivo — des-registrar nunca es accidental);
      en cola (RN) = marcado pero inerte. El lapiz y el tacho de la fila se conservan (NUT-009).
      El testid web `nutrition-v2-lo-comi` vive SOLO en el estado pendiente: el spec E2E
      `alumno-hoy.spec.ts` sigue valido sin tocarse.
- [x] Nota del coach expandida en RN — YA CUMPLIDO antes de esta fase: `CoachNoteCard` arranca
      con `open = true` (el colapso es opt-in del alumno). El catalogo auditaba un estado viejo.
- [x] "⇄ N equivalentes" literal en la fila — YA CUMPLIDO por T2.5: `ItemExchangeTrigger`
      (web y RN) pinta la pill "⇄ N equivalentes" bajo el item.
- [x] Racha semanal "N de 7 en rango" en el Hoy (2026-08-13, web + RN): chip junto al saludo del
      AuraHero. Helpers compartidos en el paquete (`energyDayInRange` ±10% · `countEnergyDaysInRange`
      · `countEnergyDaysEvaluable`, +4 tests). Reglas de honestidad: cuentan solo los dias CERRADOS
      de la semana (hoy a media mañana "fuera de rango" seria mentira) y sin dias evaluables el chip
      NO se pinta (nada de "0 de 7" un lunes). Cero fetch nuevo: web lo computa de la pagina de
      historial que el Hoy ya carga; RN de `useNutritionWeekHistory` que el TodayTab ya usa.
- [x] Celebracion dia completo: paridad web — YA CUMPLIDO antes de esta fase: el AuraHero web
      tiene confetti tintado al primario + ilustracion "dia-completado" 1x/dia (sessionStorage).

## F3 — Plan + Historial — **CERRADA 2026-08-13**

- [x] Tendencia 4 barras semanales arriba del historial (web + RN): card "Ultimas N semanas" con
      barras = dias en rango por semana (vieja→reciente), chip "tendencia ↑/→/↓"
      (`energyTrendDirection`: compara la mas reciente contra la mas vieja; con <2 semanas
      cerradas la card no se pinta) y fechas en los extremos. Las cards de semana cambian su
      metrica: pill "N/7 en rango" (verde con ≥5) en vez de "n/7 dias · %" — los puntos del strip
      ya dicen que dias tienen registro. `HistoryWeekBucket` (web) y `NutritionHistoryWeek` (RN)
      ganan `inRangeCount` computado de las filas crudas con el helper compartido.
- [x] Dias con nombre del coach — YA CUMPLIDO antes de esta fase: `variant.label` es el titulo de
      la card del Plan en web (`PlanVariantCard`) y RN; el chip "Por defecto" web ya habia muerto.
- [x] Semana actual solo en Hoy — YA CUMPLIDO antes de esta fase (paridad RN T1.3):
      `groupHistoryDaysByWeek` web y el agrupador RN EXCLUYEN la semana en curso, con el caption
      "la semana en curso vive en el tab Hoy" en ambos.
- [x] Poda de chips de permisos en RN — YA CUMPLIDO antes de esta fase: `PlanRulesCard` RN solo
      pinta registro libre y ajuste de cantidad (con %); `canSubstitute` no se pinta.
- Deuda declarada (polish para F5 si el owner lo quiere): los puntos del mini-strip semanal siguen
  siendo "con registro / sin registro"; el catalogo los pinta por RANGO (verde/ambar/apagado), lo
  que exigiria bajar kcal+meta a cada celda de `buildNutritionWeek`.

## F4 — Correccion (verificacion visual contra el mock)

- [ ] Stepper hibrido + chips de razon + "Otra…" — deltas menores si los hay

## F5 — Cierre

- [ ] Re-QA visual completa: preview web (claro/oscuro/marca custom) + device Android
- [ ] Paridad declarada en `docs/status/MOBILE_PARITY.md`
- [ ] OTA android propuesto al owner (cierre O2)

## Registro de cierres

| Fecha | Fase | Commit | Gates | Notas |
|-------|------|--------|-------|-------|
| 2026-08-13 | F0 | (este commit) | docs:check | Auditoria + los tres documentos. Tres decisiones del owner quedan abiertas (D-A/D-B/D-C); F1 no depende de ninguna. |
| 2026-08-13 | F1 | (este commit) | tsc web+mobile 0 · vitest 10/10 · eslint ✓ · boundaries 340 ✓ | Trio fijo en design.ts + tokens RN + 6 grupos de hardcodes + V1 RN (MACRO_COLORS). Sin QA visual todavia: la re-QA completa es F5. |
| 2026-08-13 | F2 (parcial) | (este commit) | tsc web+mobile 0 · vitest banda 4/4 + aura ✓ · eslint tocados sin errores nuevos | Banda de energia (D-A) y checkbox de registro (D-C) en web y RN; nota RN, "⇄ N equivalentes" y celebracion web verificados como YA cumplidos. Queda SOLO la racha semanal. Sin QA visual (F5). NO corridos: expo export ni suite completa. |
| 2026-08-13 | F2 (cierre) + F3 | (este commit) | tsc web+mobile 0 · vitest 26/26 (energy-range 4 nuevos + week-nav + banda) · eslint tocados sin errores nuevos · boundaries 342 ✓ | Racha "N de 7 en rango" en el Hoy + trend card y pills "en rango" en el historial, web y RN con los mismos helpers del paquete. F3 items 2/3/4 verificados como YA cumplidos. Sin QA visual (F5). NO corridos: expo export ni suite completa. |
