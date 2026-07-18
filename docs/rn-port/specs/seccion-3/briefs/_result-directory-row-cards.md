# Resultado — unidad `directory-row-cards`

GATE: `npx tsc --noEmit` (apps/mobile) = **EXIT 0** (limpio).

Archivos PROPIOS editados (2, disjuntos): `apps/mobile/components/coach/directory/DirRowCard.tsx`, `apps/mobile/components/coach/ClientCard.tsx`. Cero archivos ajenos tocados.

## DirRowCard.tsx — divergencias remediadas (1:1 web `coach/clients/DirRowCard.tsx`)

- **P1-a Anillo/badge INVERTIDO (Ola0 L6621-6625):** `adherence = pulse?.percentage ?? 0` (antes `?? null`) → el `%` + separador `·` se muestran SIEMPRE (web L139-141). Anillo `ringColor` sin rama `== null ? theme.border` → 0 pinta danger (web L99-107). Badge de severidad ahora condicionado a `{pulse ? … : null}` (web L126); score = `pulse?.attentionScore ?? 0` (sin fallback a `item`, 1:1 web L70).
- **P1-b Dot/label sin entreno (Ola0 L6628-6632):** override local `lastWorkout ? lastInfo(lastWorkout) : { label: '—', dot: DANGER }` → sin fecha = "—" + dot danger (web `lastLabel(null)`='—' / `lastDot(999)`=danger-500). No se toca `lastInfo()` (READ-ONLY, owner directory-screen; otros consumidores conservan "Sin entrenos"/gris).
- **P1-c Nutricion color/peso (Ola0 L6635-6639):** icono+texto ahora `emberFg` (ember-700 scheme-aware `#C23E14` light / `#FFB79E` dark, mismo patron inline que `sepColor`; espejo globals.css :357/:631) + peso `FONT.uiSemibold`(600) via nuevo `styles.metricNutri` (web `font-semibold text-[var(--ember-700)]` L145). Se elimino el uso de `EMBER`(ember-500) y su import.
- **P2-d Visibilidad nutricion pct=0 con flag (Ola0 L6642-6646):** `nutriRisk = flags.includes('NUTRICION_RIESGO') || nutritionPct < 60` + gate `{hasNutritionData && nutriRisk}` con `hasNutritionData = nutritionPct > 0` (1:1 web L80-82,142). Ya no muestra " 0%".
- **P2-h Sombra ausente (Ola0 L6670-6674):** card ahora aplica `shadow('xs', theme.scheme)` (token DS lib/shadows) = web `shadow-[var(--shadow-xs)]`.
- **P2-j Gaps internos (Ola0 L6684-6688):** nameRow gap 7→6 (web gap-1.5), metricsRow gap 5→8 (web gap-2).
- **P2-k letterSpacing + fallback inicial (Ola0 L6691-6695):** name `letterSpacing -0.155 → -0.39` (web tracking-tight ≈ -0.025em @15.5); inicial `(item.fullName?.[0] ?? '?').toUpperCase()` (web `?? '?'`).

## ClientCard.tsx — divergencias remediadas (ref web `ClientCardV2.tsx`, dead code = diseño-fuente)

- **Badge de atencion:** copy `'Urgente' → 'Atención urgente'` (web L112); "Destacado" tone `ember → success` + icono `Star` (web L125-136, `icon={att.icon ? <att.icon size={11} color={SUCCESS}/> : undefined}`).
- **Nutricion no-riesgo color:** `SUCCESS → EMBER` (bg/border/icono/barra) = web bg-ember-100/border-ember-500/bar-ember-500 (§2.4). Riesgo sigue DANGER.
- **Suscripcion:** copy `'{n}d restantes'/'vencida' → '{n} días'/'Vencida'` (web §2.6); split en 2 Text: label muted + valor coloreado `<=5 ? DANGER : theme.primary` (web text-danger-600 / text-sport-600).
- **Footer:** label `'Entreno' → 'Workout'` (web L525).

## Divergencias NO remediadas (fuera de propiedad / documentadas)

- **P2-e/P2-f Badge severidad geometria + icono/texto -700 vs -500/-600 (Ola0 L6649-6660):** provienen del componente DS `Badge.tsx` (READ-ONLY) y del hex de icono `SEV_HEX` (directory-shared, READ-ONLY). Adaptacion al Badge canonico DS — sin canon pixel vivo (web usa spans crudos). Sin accion en esta unidad.
- **P2-g Archivado vs Pausado indistinguibles + Pend.sync tone (Ola0 L6663-6667):** `statusMeta()` vive en `directory-shared.ts` (READ-ONLY, owner directory-screen): ambos `tone:'neutral'`, pend-sync `tone:'info'`(-600) vs web info-700. Requiere cambio en directory-shared → cambiosShell.
- **P2-i Kebab color/footprint (Ola0 L6677-6681):** `MoreVertical color=mutedForeground` ~22px vs web IconButton ghost ink-700 36x36. No hay token `ink-700` imperativo en el shim `theme`; cambiarlo exigiria valor crudo o exponer token → diferido/documentado.

## Gotchas de clase
- 6a (@gorhom -999): N/A (cards no usan @gorhom; el `ClientActionsSheet` y el Modal inline son `Modal` RN nativo).
- 6b (fetch congelado): N/A (cards presentacionales, sin fetch propio).
- 6c (Fabric 45798 TextInput): N/A (sin TextInput).
- 6d (dia Santiago): los deltas de dia usan `Date.now()-new Date(date)` local — **paridad exacta con web** (`differenceInDays`); documentado §4, sin accion.
- 6e (notificaciones): N/A.

## Decisiones CEO: NINGUNA
Sin cambios de GESTO: cuerpo→ficha y kebab→menu preservados en ambas cards; el DirRowCard sigue invocando `ClientActionsSheet` (READ-ONLY). Todas las adaptaciones preservan lo que el usuario ve/hace.
