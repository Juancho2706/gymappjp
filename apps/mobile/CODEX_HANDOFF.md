# EVA RN — Handoff para continuar en Codex

> Continuación del trabajo en la app **`apps/mobile`** (EVA coach/alumno). Branch **`v2/enterprise`**. Pegale este archivo a Codex + los que se listan abajo.

## Qué es
App React Native (Expo SDK 54 · expo-router v6 · RN 0.81 · New Arch) que **porta 1:1 la web** (`apps/web`) a nativo para coach y alumno standalone. El coach enterprise también loguea acá (guardas de org). Es white-label: color/loader/logo por coach.

## Stack (NO cambiar sin avisar)
- **NativeWind v4** (clases Tailwind) + tokens `@eva/brand-kit` (acento inyectado en runtime con `vars()` en `context/ThemeContext.tsx`).
- Animaciones: NativeWind (simple) + **Moti** (UI) + **Reanimated** (gestos). Charts: **victory-native ^41** (Skia) → tooltips con `useChartPressState`.
- **safe-area-context** SIEMPRE (NUNCA `SafeAreaView` de `react-native`).
- Libs: `@gorhom/bottom-sheet`, `expo-blur`, `expo-image`, `expo-image-picker/-manipulator`, `react-native-svg`, `@shopify/flash-list`, `react-native-gesture-handler` (Swipeable), `lucide-react-native`, `base64-arraybuffer`.

## REGLAS (obligatorias)
1. **Solo `apps/mobile`** (excepción ya autorizada: `apps/web/public/.well-known/*` para deep links). NO master/prod. NO `apps/web` salvo `.well-known`.
2. **Sin cambios de BD** — todas las tablas ya existen. Mutations bajo sesión del coach (RLS `*_coach_all`, `coaches_update_own`). Service-role NUNCA en RN.
3. **Validar cada cambio:** `cd apps/mobile && npx tsc --noEmit && npx expo export --platform android`. Ambos deben pasar. Bundle Hermes ~11.3 MB.
4. **Investigar en web (fechado 2026) antes de implementar y reportar hallazgos** (preferencia del usuario).
5. **pnpm** exclusivo. Builds reales = GitHub Actions (`eas build --local`), tardan ~30 min.
6. El usuario hace los commits. NO commitear salvo que lo pida.

## Convención de pantallas (importante)
- **Tabs coach** (`app/coach/(tabs)/*`): hay un header propio `CoachMobileHeader` arriba (paga `insets.top`) → las pantallas usan `<SafeAreaView edges={[]}>` (NO `['top']`, da doble espacio).
- **Tabs alumno** (`app/alumno/(tabs)/*`): NO hay header global → `SafeAreaView` default (todas las edges).
- **Pantallas pusheadas** (ej. `app/coach/cliente/[clientId].tsx`, `program-builder`, `nutrition-builder`): `edges={['top']}` correcto.
- Fondo lindo (grid + washes de marca): `components/AppBackground.tsx` — ponelo como primer hijo absoluto detrás del contenido. Ya está en dashboard coach (vía `CoachMainWrapper`), alumnos (clientes) y alumno home + detalle alumno.
- Loader de marca: `components/EvaLoader.tsx` (`EvaLoader`, `EvaLoaderScreen`) en TODAS las cargas.

## ✅ HECHO (validado tsc + bundle android)
- EvaLoader en todas las cargas (coach + alumno).
- Coach: dashboard (charts con tooltip + fondo grid/washes), **alumnos** (lista cards compactas + alerts swipe-dismiss persistentes + **detalle v2**: hero + stat strip peso/Δ/sesiones30d/check-ins, programa+nutrición activos, check-ins con energía/notas/fotos, pagos), **builder workout** (paridad), **Ejercicios** (CRUD), **Nutrición builder** (plan/comidas/foods/macros vivos/crear alimento/activar/eliminar — paridad web), **Mi Marca v2** (logo upload, color+presets, loader icon mode + estilo gradiente/sólido, brand score, compartir, preview), Suscripción, Soporte, check-ins.
- Alumno: home/workout/[planId]/check-in/nutrición/historial/perfil/código/suspended (construido).
- Login arreglado (GlassCard esquinas, botón legible, gradiente suave). GlassCard reescrito (borde+radio+clip en una vista).
- Safe-area sweep (18 archivos) + doble-inset coach corregido.
- W5 deep links: `app.json` iOS `associatedDomains` + Android intentFilters (`/c/ /invite/ /reset-password`). `apps/web/public/.well-known/apple-app-site-association` ya con Team ID real.

## 🔜 PENDIENTE (priorizado para Codex)
1. **Visual lote 2** (según feedback APK del usuario): seguir igualando estética web por pantalla. Aplicar `AppBackground` a las tabs coach restantes (ejercicios/nutricion/settings/subscription/support) y tabs alumno restantes (nutricion/workout/exercises/history/perfil) — mismo patrón que home.
2. **Detalle alumno**: acercar más a la web (`apps/web/src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx`): drill-down por fecha (workout/nutrición/hábitos del día), compliance semanal, marcar check-in revisado (`markCheckInReviewed`), editar peso objetivo inline, export. Data ya parcial en `lib/coach-client-detail.ts`.
3. **Mi Marca**: welcome_modal (texto/video al entrar al dashboard del alumno — ya hay `components/WelcomeModal.tsx`); QR del link (falta lib qrcode).
4. **Nutrición**: plantillas (propagar a varios alumnos) + ciclos (power-web).
5. **Deep links routing interno**: `/c/<slug>` no tiene ruta espejo en la app → agregar `app/+native-intent.ts` que mapee a branding+login del alumno. Ver `lib/branding.ts` (`fetchBrandingByCoachIdentifier`).
6. **Android assetlinks SHA256**: el usuario corre `eas credentials` y pega el fingerprint en `apps/web/public/.well-known/assetlinks.json` (placeholder actual).
7. Store prep (iconos, perfiles EAS, TestFlight/Play).

## Limitación conocida
- **Ícono de app instalada = EVA** (no por-coach). La PWA web sí muestra logo del coach. Coaches avisados/OK. Resto del white-label (color/loader/logo en-app) sí funciona.

## Archivos clave
- Plan vivo: `C:\Users\juanm\.claude\plans\dynamic-churning-bonbon.md`
- Stack/AGENTS: `apps/mobile/AGENTS.md`
- Theming/branding: `apps/mobile/context/ThemeContext.tsx`, `apps/mobile/lib/theme.ts`, `apps/mobile/lib/branding.ts`, `apps/mobile/lib/coach-brand.ts`
- Backdrop/loader/glass: `apps/mobile/components/AppBackground.tsx`, `EvaLoader.tsx`, `GlassCard.tsx`
- Builders: `apps/mobile/lib/plan-builder/*`, `apps/mobile/lib/nutrition-builder.ts`, `apps/mobile/app/coach/program-builder.tsx`, `apps/mobile/app/coach/nutrition-builder.tsx`
- Detalle alumno: `apps/mobile/app/coach/cliente/[clientId].tsx` + `apps/mobile/lib/coach-client-detail.ts`
- Dashboard coach: `apps/mobile/components/coach/CoachDashboardSections.tsx`, `CoachMainWrapper.tsx`, `CoachMobileChrome.tsx`
- Referencia web (paridad): `apps/web/src/app/coach/**`

## Validación rápida
```bash
cd apps/mobile
npx tsc --noEmit
npx expo export --platform android   # debe terminar en "Exported: dist"
```

## Codex update - 2026-06-02
- Backlog #1 visual lote 2 aplicado: `AppBackground` en tabs coach restantes y tabs alumno restantes, incluyendo `check-in`.
- Spinners full-screen restantes en coach `builder`, `check-ins` y `perfil` cambiados a `EvaLoaderScreen`.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Codex update - 2026-06-02 - coach detail parity
- Detalle alumno RN acercado a web/PWA overview: `Cumplimiento semanal` con rings (entreno/nutricion/check-in), peso objetivo inline, tab `Actividad`, strip de 30 dias y drill-down por fecha.
- Drill-down por fecha trae sets de entrenamiento, comidas de nutricion y habitos del dia. Usa bounds Santiago portados desde web (`getSantiagoUtcBoundsForDay`) para no cortar logs por UTC.
- Check-ins coach ahora muestran estado `Pendiente de revision` / `Revisado` y permiten marcar revision via Supabase/RLS.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Codex update - 2026-06-02 - coach detail training/program
- Detalle alumno RN suma paridad con `TrainingTabB4Panels` / `ProgramTabB7`: microciclo del programa activo, semana del ciclo, chips de estructura/A-B, dias con ejercicios y primeros bloques por dia.
- Tab `Actividad` suma analitica de entrenamiento: records de peso y volumen por grupo muscular 30d, derivados desde `workout_logs` como en la web.
- Sin deps nuevas y sin cambios BD. Todo por Supabase client + RLS.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Codex update - 2026-06-02 - coach detail nutrition
- Detalle alumno RN suma panel de nutricion coach inspirado en `NutritionTabB5`: macros del plan activo, promedio 7d, racha, heat strip 30d, kcal 7d, comidas completas del plan y alimentos favoritos del alumno.
- `lib/coach-client-detail.ts` ahora trae timeline nutricional 30d, macros por comida desde `food_items`, favoritos desde `client_food_preferences`, y calcula kcal consumidas con fallback por cumplimiento cuando no hay macro data.
- Sin deps nuevas y sin cambios BD. Todo por Supabase client + RLS.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Codex update - 2026-06-02 - coach detail export
- Detalle alumno RN suma `Exportar resumen` con `Share.share()` nativo: reporte texto con datos alumno, peso/check-in, programa, sesiones, nutricion y pagos.
- Se eligio export texto v1 para no sumar deps (`expo-print`, `expo-sharing` o `react-native-share`) antes del APK feedback.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Codex update - 2026-06-02 - workout program library mobile
- Tab coach `Programas` dejo de ser selector por alumno y ahora es hub/biblioteca: plantillas, programas asignados, activos, alumnos sin plan, busqueda, tabs Todos/Plantillas/En curso, filtros por estado/estructura/fases, vista compacta/comoda.
- Cards muestran estado, alumno asignado, dias con bloques, ejercicios principales, A/B, fases, flexible/vinculado y preview modal con estructura por dia/bloques.
- Acciones reales agregadas: duplicar cualquier programa como plantilla, asignar plantilla a multiples alumnos y eliminar con confirmacion. La asignacion crea copia inactiva, copia dias/bloques y recien ahi cambia el activo para no dejar al alumno sin plan si falla.
- `Nueva plantilla`, editar plantilla directa y sync con overrides quedan como siguiente bloque porque el builder RN todavia no soporta template mode completo.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Claude update - 2026-06-02 - deep links + welcome modal + workout templates
- **Deep-link routing**: `app/+native-intent.ts` creado. Mapea `/c/<slug>` y `/invite/<code>` → resuelve branding (`fetchBrandingByCoachIdentifier`, cachea AsyncStorage) → `/(auth)/login?role=alumno`. `/reset-password` ya mapea solo.
- **Welcome modal (Mi Marca)**: `coach-brand.ts` lee/escribe `welcome_modal_enabled/content/type` + bump `welcome_modal_version` cuando cambia (paridad web). `settings.tsx` suma sección "Mensaje al entrar al dashboard" (toggle + Texto/Video + contenido). `components/WelcomeModal.tsx` ahora normaliza YouTube/Vimeo a embed. Alumno home ya lo renderiza.
- **Workout template mode**: `program-builder.tsx` acepta params `mode=template` (nueva plantilla, `client_id` null) y `templateId` (editar plantilla). Save usa `client_id null` + `is_active false` en modo plantilla. `builder.tsx` `openNewTemplate`/`editProgram` ya rutean (antes eran stubs con Alert). Crear/editar/asignar/duplicar plantilla = completo.
- **Nutrición copiar-plan**: `lib/nutrition-builder.ts` suma `duplicatePlanToClient(sourcePlanId, targetClientId)` (mismo schema `nutrition_plans/nutrition_meals/food_items`, NO toca tablas template) + `listCoachClients`. `nutricion.tsx` cards suman acción "Copiar" + modal selector de alumno. Da reuse de plan entre alumnos sin la maquinaria template.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.
- **Quedan**:
  - **Nutrición plantillas reales** (tablas `nutrition_plan_templates` + `template_meals` + `saved_meals` + `template_meal_groups`) + propagación: NO portado — es ~530 líneas (`apps/web/src/services/nutrition.service.ts`: `createOrUpdateTemplateFromJson`, `propagateTemplateChanges`, `duplicateTemplate`) con schema distinto al builder mobile. Requiere pasada dedicada + testing en device (riesgo de huérfanos/RLS). El `copiar-plan` cubre el 80% del valor mientras tanto.
  - **Nutrición ciclos** (`nutrition_plan_cycles`) — power-web, pendiente.
  - SHA256 Android en `assetlinks.json` (manual via `eas credentials`); store prep (iconos/EAS/TestFlight-Play).

## Claude update - 2026-06-02 - APK fixes (scroll/logo/chart) + auditoría
- **Scroll biblioteca planes**: `builder.tsx` hero+toolbar pasaron a `ListHeaderComponent` del FlashList (antes fijos arriba → lista "pegada"). FlashList `flex:1`.
- **Logo coach**: `getCoachProfile` ahora devuelve `logoUrl`. Se muestra en header (`CoachMobileChrome` brandMark), perfil coach (avatar) y Mi Marca (ya estaba). Si no aparece en device → revisar `coaches.logo_url` del coach de prueba + acceso al bucket `logos`.
- **Detalle alumno**: gráfica de peso interactiva nueva (`components/coach/WeightTrendChart.tsx`, victory + tooltip) reemplaza el Sparkline en Progreso; check-ins subidos a 200.
- **Auditoría RN vs web**: ver `apps/mobile/AUDIT_RN_vs_WEB.md` (pantalla por pantalla, gaps priorizados).
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Claude update - 2026-06-02 - onboarding alumno + change-password
- **Onboarding/intake alumno**: `app/alumno/onboarding.tsx` (peso/altura/objetivo/experiencia/días/lesiones/condiciones + confirmación 14+). `lib/alumno-onboarding.ts` (`getOnboardingStatus`, `submitIntake` → `client_intake` + `clients.onboarding_completed`/`age_confirmed_at`). **Gate** en `alumno/(tabs)/home`: si no completó → `router.replace('/alumno/onboarding')`. Opciones espejan el form web.
- **Change-password coach**: `app/change-password.tsx` (nativo, `supabase.auth.updateUser`). Coach perfil ahora rutea ahí (antes link web). Alumno perfil ya tenía modal nativo.
- Auditoría completa en `apps/mobile/AUDIT_RN_vs_WEB.md`.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Claude update - 2026-06-02 - foods management
- **Foods coach CRUD**: `app/coach/foods.tsx` (listar/buscar/crear/editar/eliminar alimentos propios) + entry "Mis alimentos" en coach perfil. `lib/nutrition-builder.ts` suma `listCoachFoods`, `updateFood`, `deleteFood` (RLS coach; delete falla con mensaje si el food está en uso por FK).
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Claude update - 2026-06-02 - nutrición plantillas (reales)
- **Plantillas de nutrición** portadas de `nutrition.service.ts` (tablas ya existen, cero cambios BD). `lib/nutrition-templates.ts`: `listTemplates`, `getTemplateDraft`, `saveTemplate` (= `createOrUpdateTemplateFromJson`: `nutrition_plan_templates` + `template_meals` + `saved_meals`/`saved_meal_items`/`template_meal_groups`, 1 grupo/comida), `deleteTemplate`, `assignTemplateToClients`.
- **assignTemplateToClients** = versión simplificada y segura de `propagateTemplateChanges`: por alumno desactiva el plan activo y crea uno nuevo `nutrition_plans` (template_id, is_custom false, is_active true) + meals + food_items. NO hace update in-place (la web preserva plan_id para logs; acá se crea nuevo y el viejo queda inactivo, logs intactos). **Falta vs web:** preservación in-place de logs + swap groups múltiples + ciclos (`nutrition_plan_cycles`).
- **UI**: `nutrition-builder.tsx` ahora es template-aware (`mode=template`/`templateId`, reusa PlanDraft, guarda con `saveTemplate`). `nutricion.tsx` suma botón "Plantillas" (header) → modal listar/nueva/editar/asignar(multi-select alumnos)/borrar.
- ⚠️ **Necesita verificación en device**: la propagación escribe en varias tablas; probar crear plantilla → asignar a alumno → ver plan en web.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Claude update - 2026-06-03 - FIX build iOS (associated-domains)
- **iOS archive fallaba**: `Provisioning profile "evaapp_production" doesn't include the Associated Domains capability`. Causa: `ios.associatedDomains` (agregado en W5) inyecta el entitlement `com.apple.developer.associated-domains`, pero el App ID `cl.evaapp.eva` + profile `evaapp_production` NO tienen esa capability habilitada en Apple Developer.
- **Fix**: removido `ios.associatedDomains` de `app.json` → iOS buildea. Android App Links (intentFilters) + scheme `eva://` siguen funcionando; solo se pierden los **universal links iOS** (no críticos aún).
- **Para re-activar universal links iOS** (antes del launch): en developer.apple.com activar "Associated Domains" en App ID `cl.evaapp.eva`, regenerar profile `evaapp_production`, y volver a poner `"associatedDomains": ["applinks:eva-app.cl", "webcredentials:eva-app.cl"]` en `app.json` ios. (O usar `eas credentials` para que EAS lo gestione.)
- Aviso menor no-fatal del log: `eas.json` profile sin `channel` → EAS Update OTA deshabilitado para ese build (no rompe). Configurar con `eas update:configure` si se quiere OTA.

## Claude update - 2026-06-03 - gráfica energía + nota onboarding coach
- **Detalle alumno**: `components/coach/TrendChart.tsx` (genérico: line+area+tooltip). Progreso ahora tiene gráfica de **peso** (kg) **y de energía** (/10). `WeightTrendChart.tsx` quedó superseded (no se importa).
- **Onboarding coach** = **web-only por diseño**, NO portar: usa service-role + selección de tier pago + MercadoPago (`coach/onboarding/complete`). El signup RN del coach es free-tier / o se registra en web. Quitar del backlog mobile.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Claude update - 2026-06-03 - fixes feedback device (APK)
- **Loading infinito en detalle alumno**: `load()` en `cliente/[clientId].tsx` no tenía try/finally → si `getCoachClientDetail` rechazaba (alguna query falla en DB live), `setLoading(false)` nunca corría. Envuelto en try/catch/finally. (Si tras esto el detalle sale vacío en device, mandar logs: alguna query de la lib 677-líneas rechaza con datos live.)
- **Fondo muy iluminado**: bajé alphas en `AppBackground` (~40-45%): topWash 0.18→0.10, side 0.09→0.05, grid 0.04→0.035 (dark).
- **Cards dashboard coach**: `useGlassStyle` usaba fondo semi-transparente hardcoded + detección light frágil (`theme.card==='#FFFFFF'`) → cards "despegadas". Ahora = `theme.card` + `theme.border` + sombra (consistente con el resto de la app). Afecta KPIs, charts y secciones del dashboard.
- **Nombres cortados al asignar nutrición**: rows de cliente a 2 líneas (eran 1).
- **Splash** (`EvaSplash.tsx`): rework limpio — wordmark EVA multicolor con reveal staggered + glow + underline (sin logo blanco/corners/pill). Research 2026: minimal, motion-forward.
- **Selector coach/alumno** (`app/index.tsx`): rework — wordmark EVA + 2 cards premium (coach filled, alumno glass) con eyebrow/título/desc/chevron + AppBackground.
- **Código alumno** (`alumno/codigo.tsx`): AppBackground + hero centrado.
- Pendiente del feedback: **flujo de asignar plantillas** (UX, falta detalle de qué confunde) + fine-tune visual cards (falta screenshot).
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.

## Codex update - 2026-06-02 - APK visual/nutrition fixes
- Nutrition builder RN ahora respeta `foods.is_liquid` / `serving_unit`: alimentos solidos muestran `g/un`, liquidos `ml/un`, manteniendo la unidad actual si un plan viejo trae otra.
- Input de cantidad en comidas ajustado para Android: altura/lineHeight/padding centrados para evitar que numeros como `50` se corten arriba.
- `AppBackground` cambia washes lineales por radiales SVG para eliminar el corte vertical duro en dark mode y los bloques claros visibles detras de cards translucidas.
- Dashboard coach sube opacidad/control de borde en glass cards y quick actions para modo claro, manteniendo fondo EVA sin cuadrados internos.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.
