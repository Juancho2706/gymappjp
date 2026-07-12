# Unidad: ficha-shell-hero (key: `ficha-shell-hero`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = el ARMAZON de la ficha del cliente: pantalla, fetch, hero, tab bar sticky, acciones flotantes, export dossier PDF, helpers compartidos. El CONTENIDO de cada uno de los 5 tabs vive en unidades hermanas.

## Alcance exacto
- `apps/mobile/app/coach/cliente/[clientId].tsx` (381 L): fetch de la ficha, estados, definicion de los 5 tabs (`tabs` L221-228: Resumen/Progreso/Entreno/Programa/Nutricion), `heroChips` (L~231-240), `handleExportPdf` (dossier PDF, L~247-265), `ScrollView stickyHeaderIndices={[1]}` (tab bar sticky), lightbox de fotos, `TopBar back`.
- `apps/mobile/components/coach/clientDetail/ClientHero.tsx` (249 L): hero (nombre, iniciales, racha, delta peso, barra adherencia).
- `apps/mobile/components/coach/clientDetail/ClientTabBar.tsx` (115 L): pill tabs stickies.
- `apps/mobile/components/coach/clientDetail/ProfileFloatingActions.tsx` (91 L): FABs WhatsApp/acciones.
- `apps/mobile/components/coach/clientDetail/shared.tsx` (105 L): helpers/primitivos compartidos por los tabs. **Owner = esta unidad**; los tabs lo importan read-only.

## webFiles (verdad web, paths verificados)
- `apps/web/src/app/coach/clients/[clientId]/page.tsx` — RSC de la ficha.
- `apps/web/src/app/coach/clients/[clientId]/ClientProfileHero.tsx` (442 L) — hero.
- `apps/web/src/app/coach/clients/[clientId]/ProfileTabNav.tsx` (171 L) — tab nav (fondo glass/blur).
- `apps/web/src/app/coach/clients/[clientId]/ProfileFloatingActions.tsx` (171 L) — acciones flotantes.
- `apps/web/src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx`, `ProfileTopAlertBanner.tsx`, `getProfileTopAlert.ts`, `clientStatusUtils.ts`, `_components/SectionTitle.tsx`.

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/app/coach/cliente/[clientId].tsx`
- `apps/mobile/components/coach/clientDetail/ClientHero.tsx`
- `apps/mobile/components/coach/clientDetail/ClientTabBar.tsx`
- `apps/mobile/components/coach/clientDetail/ProfileFloatingActions.tsx`
- `apps/mobile/components/coach/clientDetail/shared.tsx`

## READ-ONLY (de otras unidades — NO tocar)
- `clientDetail/OverviewTab.tsx`, `ProgresoTab.tsx`, `WeeklyPRBanner.tsx` → `ficha-overview-progreso`.
- `clientDetail/AnalisisTab.tsx`, `PlanTab.tsx` → `ficha-analisis-plan`.
- `clientDetail/NutricionTab.tsx`, `FacturacionTab.tsx` → `ficha-nutricion-facturacion`.
([clientId].tsx importa y monta los 5 tabs; solo coordinar por props.)

## P0 / riesgos conocidos (audit R5 §3 `r5-audit-coach-core.md`)
- **§3.1 ClientHero (PX):** nombre 25/black ls-0.6 vs web 24/black ls≈-1.2; iniciales 22 vs 20; copy racha "N d de racha" → falta "de actividad"; iconos meta 13 vs 14; delta peso crudo "+2 kg" vs `.toFixed(1)` "+1.5 kg"; barra adherencia track rgba-white/fill primary vs `border-inverse`/`sport-500`; icono Activity brand vs `sport-400`.
- **§3.2 ClientTabBar (PX):** set+estilo de pill COINCIDEN (5 tabs, sin Facturacion — RULING D2). UNICO diff: fondo contenedor sticky — web `color-mix(surface-app 80%) backdrop-blur(12px)` (glass) vs RN `bg-surface-app` solido sin blur (RN L36). Portar glass/blur (expo-blur; **gotcha: en Android exige `experimentalBlurMethod` o el velo sale sin blur**).
- **§3.3 ProfileFloatingActions:** COINCIDE (WhatsApp #16A34A, alturas, gutter, radius, glifo, sombra). Sin diffs — verificar y no regresionar.
- **Congelamiento (gotcha 6b):** [clientId].tsx hace fetch propio de la ficha. NO vive en un tab persistente (es una ruta stack push), pero al volver de editar (ej. tras cambiar el plan en PlanTab) puede quedar stale → verificar recarga on-focus / señal de refresh. Menos critico que el directorio pero anotar.
- **Facturacion oculta (regla 2):** el tab bar RN NO incluye Facturacion (5 tabs, no 6; comentario L219-220). `FacturacionTab.tsx` existe pero no se monta desde aqui — es divergencia documentada (RULING D2). No borrar.
- **Claves de dia (gotcha 6d):** racha, lastActivity, planCurrentWeek, adherencia — dia calendario Santiago.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"ProfileOverviewB3"` (14 hits, L~7060) toca el shell/overview; `"ClientProfileHero"`/`"ProfileTabNav"` = 0 hits (usar R5 §3.1/§3.2). El hero/tabbar se basan en R5.

## Notas de datos (queries/RPC, claves de dia)
- Fetch unico de la ficha (perfil, compliance, checkIns, activeProgram, activeNutrition, weeklyPRs) — espejo mobile de `ficha-panel.data.ts` / `_data/*.queries.ts`.
- `heroChips` derivados: `adherencePct = min(100, round(workoutsThisWeek/workoutsTarget*100))` ([clientId].tsx L237). `handleExportPdf` → `exportClientDossierPdf` (dossier jsPDF, PR #106, logica compartida).
