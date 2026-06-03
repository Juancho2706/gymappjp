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
- `Nueva plantilla`, editar plantilla directa, asignar plantilla y acciones avanzadas quedan como siguiente bloque porque el builder RN todavia no soporta template mode completo.
- Validado: `npx tsc --noEmit` PASS y `npx expo export --platform android` PASS.
