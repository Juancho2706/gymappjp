# R4 — Auditoría pixel: RESTO del árbol ALUMNO (home / nutrición / check-in / historial / Aprender / perfil / onboarding / código)

Fecha 2026-07-10 · Auditor pixel (solo lectura). Vara: 1:1 con la PWA md (`apps/web/src/app/c/[coach_slug]/**`). **Regla de copy de esta ronda:** el copy WEB es la fuente de verdad → copiar VERBATIM. Donde RN metió voseo y la web es neutra, se REVIERTE al neutro de la web.

Leyenda severidad: **P1** = el CEO lo nota a ojo · **P2** = visible comparando lado a lado · **P3** = fino/opcional.

---

## Hallazgos transversales (afectan varias pantallas)

| # | Qué | Web | RN | DIFF | Sev |
|---|---|---|---|---|---|
| T1 | Fuente de títulos de cards de nutrición | Web usa la fuente **UI (Hanken) con `font-black`** (900) para nombres de comida y títulos de racha | RN usa **Archivo (`FONT.displayBold`/`displayBlack`)** | Familia + peso distintos (Hanken 900 → Archivo 700/900). Afecta `MealCardExpandable`, `NutritionStreakBanner`, `NutritionHeader` | P2 |
| T2 | `ScreenHeader` (componente compartido) | Headers móviles web = **21–22px `font-display font-black`** (Archivo 900) | `ScreenHeader` fuerza **28px `Archivo_700Bold`** | Título +6px y más liviano (700 vs 900) en TODA pantalla que lo use (Historial, y bodycomp/movement) | P2 |
| T3 | Voseo introducido por RN donde la web es NEUTRA | Neutro | Voseo | Revertir al copy web verbatim (detalle por archivo abajo) | P1 |

---

## `components/alumno/home/DashboardHeader.tsx` (§2 header)

| Elemento | Web (`ClientGreeting`) | RN | DIFF | Sev |
|---|---|---|---|---|
| Saludo "Buenas noches, X" | `font-display text-[25px] font-black tracking-[-0.03em]` (2xl=25) | `textStyle('xl'…)` = **21px**, ls tight (−0.015) | Saludo 4px más chico y tracking menos apretado | P2 |
| Fecha larga | Va **ARRIBA** del saludo, como eyebrow `text-[10px] font-semibold uppercase tracking-widest` | Va **DEBAJO** del saludo, `TYPE.caption` = 13px, **no uppercase**, capitalizada | Orden invertido + estilo distinto (13px capitalizado vs 10px uppercase) | P2 |
| brandName eyebrow | `text-[10px] font-bold uppercase tracking-widest` | 10px uiBold uppercase ls 1.4 | OK | — |

Nota: hallazgo CEO #1 (header sticky) es de Fixer A4, no de esta tabla.

## `components/alumno/home/HeroSection.tsx` (§5 Hero)

| Elemento | Web (`WorkoutHeroCard`/`RestDayCard`) | RN | DIFF | Sev |
|---|---|---|---|---|
| Eyebrow "Hoy entrena(s)" | **"Hoy entrenas"** (neutro) | **"Hoy entrenás"** (voseo) | Copy → revertir a "Hoy entrenas" | P1 |
| Título del plan (h2) | `font-display text-[23px] font-black` | `textStyle('2xl'…)` = **25px**, displayBlack | +2px | P3 |
| InfoTooltip junto al eyebrow | Presente | Ausente | Falta el ícono (i) | P3 |
| RestDay "Próximo: X" | `Próximo: **{título}** · {díaLabel}` (título en negrita + día) | `Próximo: {título}.` (sin negrita, sin día, con punto) | Copy y énfasis distintos | P2 |
| RestDay ícono luna | `bg-aqua-100 text-aqua-700` | `theme.cyan+'22'` / `theme.cyan` | Color aqua vs cyan | P3 |

## `components/alumno/home/MomentumCard.tsx` (§7)

| Elemento | Web (`ComplianceRing`) | RN (`ComplianceItem`) | DIFF | Sev |
|---|---|---|---|---|
| Número del anillo | `72` **`%`** (símbolo % en `text-[11px]`) | `72` **sin `%`** | Falta el `%` en los 3 anillos de cumplimiento | **P1** |
| Sub-línea bajo la etiqueta | La web **omite** sublíneas (solo "Sin datos" en empty) | RN muestra "`N días`" / "`N de 4`" siempre | RN agrega texto que la web no tiene | P2 |
| Tamaño anillo | `size={76}` | `size={74}` | −2px | P3 |
| Letra días (week strip) | `font-display text-xs font-extrabold` (Archivo 800) | `FONT.displayBold` (Archivo 700) | Peso 800 vs 700 | P3 |

## `components/alumno/home/StreakRibbon.tsx` (§3)

| Elemento | Web | RN | DIFF | Sev |
|---|---|---|---|---|
| Copy hito alcanzado | "¡Alcanzaste el hito! **Sigue** así." | "¡Alcanzaste el hito! **Seguí** así." | Voseo → revertir a "Sigue así." | P1 |
| Fondo del ribbon | `linear-gradient(118deg, ember-100 …)` | Plano `EMBER_500+'1A'` | Web tiene degradé, RN plano | P3 |

## `components/alumno/home/ActiveProgramSection.tsx` (§8)

| Elemento | Web | RN | DIFF | Sev |
|---|---|---|---|---|
| Copy pendientes | "**Tienes** 1 día pendiente" / "**Tienes** N días pendientes" | "**Tenés** 1 día pendiente" / "**Tenés** N días pendientes" | Voseo → revertir a "Tienes" | P1 |

## `components/alumno/home/NutritionDailySummary.tsx` (§12)

| Elemento | Web | RN | DIFF | Sev |
|---|---|---|---|---|
| Aviso "primera comida" | Muestra "¡Registra tu primera comida desde nutrición!" cuando no hay log y hay comidas | No lo renderiza | Falta la línea | P3 |
| Resto (hero kcal 27px, macros, "Ver todo →", "Hoy") | — | — | OK | — |

## `components/alumno/home/RecentWorkouts.tsx` (§11) — OK

Web `WorkoutLogItem` usa `text-xs font-bold text-subtle` (sans, sin mono, sin pill) para "N series"; RN usa `FONT.uiBold` 12px. **Coincide.** (Ojo: NO es como el Historial dedicado, que sí usa mono — ver abajo.)

---

## `app/alumno/(tabs)/nutricion.tsx` + `components/MealCardExpandable.tsx`

| Elemento | Web (`NutritionShell`/`MealCard`) | RN | DIFF | Sev |
|---|---|---|---|---|
| `NutritionHeader` título "Plan Nutricional" | `text-lg font-black` = **18px, fuente UI (Hanken)** | `textStyle('xl'…)` = **21px, Archivo displayBlack** | Familia + tamaño (Hanken 18 → Archivo 21) | P2 |
| `NutritionHeader` subtítulo (nombre plan) | `text-[10px] … font-medium` | `fontSize: 13` uiMedium | **13px vs 10px** (subtítulo muy grande en RN) | P2 |
| MealCard nombre comida | `font-black text-base tracking-tight` = **16px Hanken 900** | `FONT.displayBold` (Archivo 700) 16px | Familia + peso (Hanken 900 → Archivo 700) | P2 |
| MealCard pill kcal | `text-xs font-black` (12px/900) | `FONT.uiExtra` 11px (800) | −1px, peso 800 vs 900 | P3 |
| MealCard descripción | Renderiza `desc` (truncado colapsado + itálica expandido) | No renderiza `description` nunca | Falta descripción de comida | P3 |
| MealCard porción — texto ayuda | «Plan completo» usa el 100% de macros… | Omitido | Falta la línea de ayuda | P3 |
| Macros P/C/G, labels "PORCIÓN DEL PLAN" / "¿CÓMO ESTUVO?", botones 25/50/75/100 + Plan completo | — | — | OK (verbatim) | — |

## `components/alumno/nutrition/NutritionStreakBanner.tsx`

| Elemento | Web | RN | DIFF | Sev |
|---|---|---|---|---|
| Título "N de racha" / "Tu racha sigue viva" | `text-sm font-black` = 14px **Hanken 900** | `FONT.displayBold` (Archivo 700) 14px | Familia + peso | P2 |
| Copy subs ("¡Semana perfecta! Sigue así.", "Vas muy bien, sigue así.", etc.) | — | — | OK (verbatim, neutro) | — |

---

## `app/alumno/(tabs)/check-in.tsx` (3 pasos)

| Elemento | Web (`CheckInForm`) | RN | DIFF | Sev |
|---|---|---|---|---|
| Título "Check-in mensual" | `font-display text-[26px] font-black` (Archivo 900) | `textStyle('2xl'…)` = 25px **displayBold (700)** | Peso 700 vs 900 | P2 |
| Intro paso 2 ("Las fotos son opcionales…") | `text-[13.5px]` | `TYPE.body` = **16px** | +2.5px, texto notablemente más grande | P2 |
| Pantalla de éxito — título | `font-display text-[27px] font-black` | `TYPE.h2` = **31px displayBold** | +4px y peso 700 vs 900 | P2 |
| Pantalla de éxito — mensaje | "Tu coach recibió tu actualización **mensual**." | "Tu coach recibió tu actualización." | RN omite "mensual" | P3 |
| Peso 49px (`text-5xl`), eyebrow "Paso X de 3", disclaimer, "Continuar/Atrás/Enviar check-in" | — | — | OK | — |
| Alerts nativas ("¿Cómo querés agregarla?", "Seleccioná una imagen", "Podés volver a intentarlo") | (sin equivalente web) | Voseo | Neutralizar por consistencia (querés→quieres, Seleccioná→Selecciona, Podés→Puedes) | P3 |

---

## `app/alumno/(tabs)/history.tsx`

| Elemento | Web (`workout-history/page` + `WorkoutHistoryList`) | RN | DIFF | Sev |
|---|---|---|---|---|
| Título "Historial de entrenos" | `font-display text-[21px] font-black` (Archivo 900, 21px) | `ScreenHeader` = **28px `Archivo_700Bold`** | Título +7px y peso 700 vs 900 (ver T2) | **P2** |
| Pill "N series" | `font-mono text-[12.5px] font-bold` (**mono a propósito**) | `FONT_MONO` (JetBrains 700) 12px | **Coincide** — la web SÍ usa mono acá | — |
| Estado error (RN-only) | (server component, sin error UI) | "Revisá tu conexión e **intentá** de nuevo…" | Voseo → neutralizar (Revisá→Revisa, intentá→intenta) | P3 |
| Subtítulo, "Ver últimos 6 meses", disclaimer | — | — | OK | — |

---

## `app/alumno/(tabs)/exercises.tsx` (Aprender)

| Elemento | Web (`exercises/page`) | RN | DIFF | Sev |
|---|---|---|---|---|
| Header "Aprender" | `font-display text-[22px] font-black` (Archivo 900) | `TYPE.h3` = **25px display (700)** | +3px, peso 700 vs 900 | P3 |
| Ícono header | `bg-sport-100 text-sport-600`, 38px | `theme.primary+1A`, 44px | +6px y tono | P3 |
| Subtítulo "Técnica de cada ejercicio" | `text-[12.5px]` | `TYPE.caption` (13px) | OK | — |
| Grilla, "Destacado", detalle, instrucciones | — | Sin mono; usa tokens TYPE | OK | — |

---

## `app/alumno/(tabs)/perfil.tsx`

Copy VOSEO (revertir al neutro de la web `ProfileClient.tsx`):

| RN (voseo) | Web (fuente de verdad) | Sev |
|---|---|---|
| "**Compartí** tu logro" (CTA + título sheet) | "Comparte tu logro" | **P1** |
| "**Elegí** una tarjeta con la marca de tu coach" | "Elige una tarjeta con la marca de tu coach" | **P1** |
| Sheet desc "…**Elegí** cuál compartir:" | "…Elige cuál compartir:" | P1 |
| "**Encendé** tu racha" | "Enciende tu racha" | P2 |
| "**Pedí** la eliminación de tus datos (derechos ARCO)" | "Pide la eliminación de tus datos (derechos ARCO)" | P2 |
| streak subtitle "N día**s** seguido**s** activo" (usa seguido/seguidos) | web usa "seguidos" siempre | P3 |
| Prompt biométrico "**Confirmá** para activar el bloqueo" (nativo) | — | P3 |

Tipografía perfil (OK en general): "Mi perfil" `font-display text-[22px] font-black` = RN `font-display-black` 22px **coincide**; hero name 22px coincide; SectionTitle 11px extrabold coincide; danger zone label coincide.

---

## `app/alumno/onboarding.tsx` — casi 1:1

| Elemento | Web (`OnboardingForm`) | RN | DIFF | Sev |
|---|---|---|---|---|
| Headings de paso "Tus datos"/"Tus metas"/"Salud y seguridad" | `font-display text-2xl font-black` (Archivo 900) | `TYPE.h3` = 25px `FONT.display` (700) | Peso 700 vs 900 | P3 |
| Copy (Empecemos…, disclaimer, "Confirmo que tengo 14 años…", "Debes confirmar tu edad…", "Siguiente", "Finalizar registro") | — | — | OK (verbatim, neutro) | — |

---

## `app/alumno/codigo.tsx` — PENDIENTE rework (Lote B #15)

La pantalla actual (ícono Hash en tile sport-100, título "Ingresa tu código" 28px, un solo `TextInput` central) **no** corresponde al mockup nuevo del CEO (tema claro forzado, back arriba-izq, tile azul con ícono ticket, título "Entra con tu coach", subtítulo "Ingresa el código de 5 dígitos…", **OTP de 5 celdas**). Es rework asignado a Lote B — no se audita pixel-vs-web porque el código no tiene equivalente web (la web usa slugs). Solo se deja constancia de que sigue en el diseño viejo.

---

## Prioridad sugerida para los fixers (lo que el CEO nota primero)

1. **MomentumCard: falta el `%`** en los 3 anillos (P1, muy visible).
2. **Voseo → neutro** en Hero ("Hoy entrenas"), StreakRibbon ("Sigue así"), ActiveProgram ("Tienes"), y **perfil** (Comparte/Elige/Enciende/Pide) — P1.
3. **DashboardHeader**: saludo a 25px y fecha como eyebrow uppercase ARRIBA del saludo (P2).
4. **NutritionHeader/MealCard/StreakBanner**: familia Hanken-black donde RN puso Archivo (T1) + subtítulo del header a 10px (P2).
5. **ScreenHeader** (Historial): bajar título de 28px/700 a ~21px/900 (T2, P2).
6. Check-in: intro paso 2 a 13.5px, título éxito a 27px, "actualización mensual" (P2/P3).
