# G05 — Gaps de paridad RN: Alumno · Check-in + Historial + Perfil + Ejercicios (+ módulos read-only)

Fecha: 2026-07-08. Solo lectura. Fuente de verdad visual+funcional = comportamiento mobile (`md:hidden`) de `apps/web`.

Dominio asignado: check-in (incl. fotos direct-to-Storage y check-in P0 de PR #113), historial de entrenos, perfil (tema, sonido descanso, módulos, share-cards, push/biometría, logout), tab "Aprender" (catálogo de ejercicios del alumno) y vistas read-only de módulos de pago del alumno (movimiento / composición corporal). Cardio del alumno: la web NO expone pantalla dedicada de cardio para el alumno (el cardio es prescripción dentro del ejecutor de rutina y perfil de zonas FC; no hay `/c/[slug]/cardio`) — ver §6.

Archivos web de referencia (verificados):
- Check-in: `apps/web/src/app/c/[coach_slug]/check-in/{page.tsx,CheckInForm.tsx,_actions/check-in.actions.ts,_data/check-in.queries.ts}`
- Historial: `apps/web/src/app/c/[coach_slug]/workout-history/{page.tsx,_components,_data}`
- Perfil: `apps/web/src/app/c/[coach_slug]/perfil/{page.tsx,_components/ProfileClient.tsx,_data}` + `ProgressShareCardModal`/`StreakShareCardModal`/`MonthlySummaryShareCardModal`
- Ejercicios: `apps/web/src/app/c/[coach_slug]/exercises/{page.tsx,ClientExerciseCatalog.tsx,_actions,_data}`
- Módulos: `apps/web/src/components/movement/StudentMovementView.tsx`, `apps/web/src/components/bodycomp/StudentBodyCompositionView.tsx` (+ `StudentBia*`, `StudentIsak*`)

Archivos mobile de referencia (verificados):
- `apps/mobile/app/alumno/(tabs)/check-in.tsx` (657 L, patrón B)
- `apps/mobile/app/alumno/(tabs)/history.tsx` (181 L, patrón B)
- `apps/mobile/app/alumno/(tabs)/perfil.tsx` (419 L, patrón A parcial)
- `apps/mobile/app/alumno/(tabs)/exercises.tsx` (260 L, patrón B)
- `apps/mobile/components/alumno/AlumnoMobileChrome.tsx` (tab bar; NAV_META hardcodeado)
- Módulos movimiento/bodycomp: **NO EXISTEN en mobile** (confirmado por 07-shared-seams.md §C.7 y 06-mobile-inventory.md)

Nota transversal (de 02/06): mobile ya tiene los tokens EVA DS (`global.css`, `tailwind.config.js`) y las primitivas DS (`Button`, `Card`, `Input`, `ListRow`, `Avatar`, `Badge`, `BottomSheet`...), pero estas 4 pantallas están mayormente en "patrón B" (objeto `theme` legacy + `StyleSheet` + fuentes literales), salvo `perfil.tsx` que ya usa clases DS pero está incompleta de contenido. El re-skin es "adoptar clases/primitivas + transcribir layout web", no crear tokens.

---

## 1. GAPS VISUALES (pantalla por pantalla)

### 1.1 Check-in (`check-in.tsx`) — patrón B, layout divergente
Mobile ya replica la estructura de 3 pasos + stepper segmentado + bottom-nav, pero visualmente NO es EVA DS ni 1:1 con web:

- **Todo el estilado es patrón B**: `useTheme().theme` + `StyleSheet` + constantes de fuente literales (`FONT_BOLD='HankenGrotesk_700Bold'`, `FONT_MONO`, etc.) en vez de clases NativeWind / primitivas DS. Debe migrarse a `Card`/`Button`/`Input` + `className`.
- **Header**: mobile usa `ScreenHeader title="Check-in" subtitle="Registrá tu progreso semanal"`. Web usa TopBar con botón atrás (ChevronLeft → dashboard) + eyebrow "Paso X de 3" + H1 display "Check-in mensual" (`CheckInForm.tsx:361-378`). Mobile no tiene botón atrás explícito ni el título "Check-in mensual".
- **Disclaimer médico AUSENTE en mobile**: web muestra banner warning "EVA no es un dispositivo médico…" (`CheckInForm.tsx:396-401`, tokens `--warning-100/500/600` + icono ShieldAlert). Mobile no lo tiene. Es requisito legal repetido en onboarding/check-in.
- **Paso 1 — Peso**: web usa **stepper +/- 0.1 kg** con número display 5xl tabular-nums y botones circulares (`CheckInForm.tsx:443-471`); mobile usa un `TextInput` decimal plano (`check-in.tsx:400-410`). Falta el patrón stepper (número grande protagonista).
- **Paso 1 — Energía**: web usa **slider 1-10** con `accentColor` = color del coach y valor grande sport-600 (`CheckInForm.tsx:474-492`); mobile usa **10 botones** togglables (`check-in.tsx:412-433`). Divergencia de control (funcionalmente equivalente, visualmente distinto).
- **Paso 2 — Fotos**: layout de 2 slots aspect-3/4 es equivalente, pero mobile pinta con hex/theme (`#0B0E13` literal en `check-in.tsx:492`) y label "Foto espalda" vs web "Espalda o perfil". Falta el badge "Optimizando…" con spinner (web `CheckInForm.tsx:545-549`) y la nota de privacidad con icono Lock ("privadas, solo tu coach las ve").
- **Paso 3 — Resumen**: equivalente (peso/energía/fotos). OK conceptual; falta re-skin a `Card variant="sunken"`.
- **Éxito**: web muestra `SuccessWaveOverlay` brandeado + confetti + pantalla dedicada "¡Check-in enviado!" con CTA "Volver al inicio" (`CheckInForm.tsx:321-357`). Mobile solo muestra un `MotiView` "Check-in registrado" inline (`check-in.tsx:272-287`) y resetea al paso 1. **Falta la celebración full-screen + wave brandeada.**
- **Toasts**: web usa `sonner` (toast success/warning/error). Mobile usa `Alert.alert` nativo. No hay sistema de toast DS en RN (gap de fundación P0, ver 02-design-system §E).

### 1.2 Historial (`history.tsx`) — patrón B, layout casi 1:1
Buen estado funcional; visualmente patrón B:
- **Patrón B**: `theme.*` + `StyleSheet`. Filas de día (chip Dumbbell + fecha capitalizada + subtítulo + pill "N series") replican bien la web (`WorkoutHistoryList`). Bordes redondeados solo en primera/última fila (lista agrupada) = buen match.
- **Header**: mobile `ScreenHeader title="Historial" subtitle="{N} días de entrenamiento"`. Web: header inline con botón atrás + icono Dumbbell theme + "Historial de entrenos · Dias con series (últimos N meses)". Mobile no tiene botón atrás (es tab en overflow), aceptable.
- **Falta la animación `RevealStagger`/`RevealItem`** (fade-up al scroll) que tiene web; mobile usa FlatList plano.
- **Botón "Ver últimos 6 meses"** presente y correcto (90→180d). Disclaimer "Solo ves tus propios registros" presente. Buen match.
- Migrar a `Card`/`ListRow` DS + `className`.

### 1.3 Perfil (`perfil.tsx`) — patrón A pero CONTENIDO incompleto
Mobile ya usa clases DS (`font-display-black`, `text-strong`, `Card variant="inverse"`, `Avatar ring="sport"`, `ListRow`, `IconTile`). El hero de identidad y las secciones "Información/Apariencia/Cuenta/Seguridad" están re-skineadas. PERO faltan bloques enteros vs web (`ProfileClient.tsx`):
- **Stats grid 2-col (Entrenos + Racha)**: web tiene `StatCard` Dumbbell(sport) + Flame(ember "días") (`ProfileClient.tsx:266-270`). **Mobile NO los tiene** (no computa streak ni totalWorkouts en perfil).
- **CTA "Compartí tu logro" + selector de 3 share-cards**: web abre sheet con Progreso/Racha/Resumen mensual (`ProfileClient.tsx:272-290, 404-472`). **Mobile NO lo tiene** (gap funcional+visual, ver §2.3).
- **Preferencias → Alarma de descanso (Select de sonido)**: web expone Select Digital/Campana/Clásico/Boxeo con preview (`ProfileClient.tsx:301-322`). **Mobile NO lo tiene.**
- **Módulos (read-only) Movimiento/Composición**: web lista filas con badge "Ver" cuando el coach los habilitó (`ProfileClient.tsx:324-366`). **Mobile NO los tiene** (no hay entitlements en mobile, ver §2.4).
- **Zona de peligro "Solicitar baja de cuenta" (ARCO)**: web tiene card danger con mailto (`ProfileClient.tsx:378-400`). Mobile tiene solo "Privacidad · Derechos ARCO" como link a la web, no la card de baja. Parcial.
- **Diferencias que mobile SÍ tiene y web NO** (correctas, mantener): toggle biométrico (nativo, `perfil.tsx:335-363`), "Cambiar contraseña" inline (modal), bloque "Información" (teléfono/peso objetivo/miembro desde). El "Cambiar contraseña" y "Miembro desde" son extras razonables de mobile.
- Nota: web NO pone "Historial" ni "Instalar app" en perfil como filas destacadas del sheet — en web el sheet "Más" tiene Mi perfil + Historial + Instalar + Cerrar sesión, y /perfil tiene Cuenta→Historial. En mobile el historial es tab de overflow, así que la fila "Historial de entrenos" de la sección Cuenta podría añadirse por paridad (hoy ausente).

### 1.4 Ejercicios / "Aprender" (`exercises.tsx`) — patrón B, gaps de layout
- **Patrón B**: `theme.*` + `StyleSheet`. Header `ScreenHeader "Aprender Técnica" / "Catálogo de ejercicios"` (web mobile: header sticky branded icono Dumbbell sport + "Aprender · Técnica de cada ejercicio"). Barra de búsqueda (usa primitiva `Input` DS, bien) + chips de grupo muscular (scroll horizontal, activo = color coach) + grid 2-col de cards. Estructura general correcta.
- **Falta `FeaturedExerciseCard`** (banner de ejercicio destacado en vista default) que web muestra (`ClientExerciseCatalog`).
- **Cards**: mobile card con banner gif + play + chip músculo + nombre. Match razonable, pero pintado con hex literal (`#12161D` banner). Re-skin a `Card` + tokens.
- **Modal detalle (BottomSheet)**: mobile solo muestra `gif_url` o placeholder Play; **NO soporta video YouTube (`ExerciseVideo`) ni mp4** que web sí (`page.tsx` §8 del inventario). Instrucciones: mobile las carga upfront (split por `\n`); web las carga **on-demand** vía `getExerciseInstructions`. Gap de media playback.

### 1.5 Módulos read-only del alumno — NO EXISTEN en mobile
- **Movimiento** (`StudentMovementView`): header sticky + último `AssessmentReportCard` + `EvolutionCharts` (si ≥2) + `MovementDisclaimer`; empty state. **Mobile: 0 pantallas.**
- **Composición corporal** (`StudentBodyCompositionView`): switcher BIA/ISAK + summary + trend (si ≥2, si no `NeedTwo`) + disclaimer; count-up + draw-in charts. **Mobile: 0 pantallas.**
- Gap 100% (construir desde cero). Gated por entitlement del coach.

---

## 2. GAPS FUNCIONALES (incluye delta post-21-jun)

### 2.1 Check-in — fotos direct-to-Storage y resiliencia (delta PR #105 / #103 / #104)
- **Patrón de subida diverge (aceptable pero verificar)**: web usa **URL firmada** (`createCheckinUploadUrlsAction`) + PUT directo al bucket para **esquivar el WAF de Cloudflare y el límite 4.5MB de Vercel** (los bytes nunca pasan por eva-app.cl). Mobile sube **directo** al bucket privado `checkins` con el JWT del usuario vía `supabase.storage.upload` (base64 → `decode` a ArrayBuffer, `check-in.tsx:135-161`). En RN nativo NO hay WAF de Cloudflare ni límite de Vercel en el medio, así que el upload directo es válido; **no requiere portar el patrón de signed URL**, pero conviene confirmar que la RLS del bucket `checkins` permite INSERT al alumno dueño (path `{clientId}/...`). Documentar como excepción intencional justificada.
- **Best-effort presente en ambos**: mobile ya suelta la foto que no sube y avisa (`check-in.tsx:219-227`); web idem con toast. Paridad OK.
- **Compresión**: web comprime en la SELECCIÓN con **timeout de 15s** (browser-image-compression cuelga con ciertas fotos, incidente jul-2026) y convierte HEIC. Mobile comprime con `ImageManipulator` (resize 1920, JPEG 0.72) al elegir — HEIC se normaliza por el re-encode. Mobile **no tiene timeout guard** (ImageManipulator no cuelga como la lib web, riesgo menor). Paridad funcional OK.
- **Prefill de peso/energía**: web precarga `weight` con el último check-in (`lastCheckIn.weight.toFixed(1)` o '70.0') y `energyLevel` con el último (default 7) (`CheckInForm.tsx:68-71`). **Mobile arranca vacío** (weight '', energy null). Gap UX — replicar prefill.
- **Gate de continuación**: mobile exige peso en paso 1 (`canGoNext`); web permite continuar con default. Menor.

### 2.2 Check-in P0 post-workout + badge PWA (delta PR #113 / badging)
- El "check-in P0" de PR #113 se materializa como **CheckInBanner variant-aware en el dashboard** (sin/3-7d warning/>7d overdue) + `AppBadgeSync` (badge del ícono con count=1) + `clearAppBadge()` al abrir /check-in. El banner del dashboard es dominio del subagente de dashboard; **para ESTE dominio el gap es**: mobile no limpia el badge nativo al abrir check-in. Web hace `clearAppBadge()` en mount (`CheckInForm.tsx:88-90`). Mobile debe llamar `expo-notifications` `setBadgeCountAsync(0)` al abrir check-in (o al ver dashboard). Ver 01-web-delta §1.6 (Badging → equivalente nativo Notifee/expo-notifications).
- Verificar que el `CheckInBanner` de `home.tsx` (mobile) use la misma lógica de umbrales `daysSince` que web (3/7 días). No auditado en detalle acá (pertenece a dashboard), pero el link → /check-in debe existir.

### 2.3 Perfil — share-cards v2 con marca del coach (delta share-cards v2)
- Web tiene 3 plantillas de share-card brandeadas (Progreso/Racha/Resumen mensual) renderizadas a canvas con logo+nombre del coach (`ProgressShareCardModal`, `StreakShareCardModal`, `MonthlySummaryShareCardModal`; motor `lib/workout-pr-card-canvas.ts`). **Mobile no tiene NINGUNA** desde perfil. El audit previo notaba "share nativo" como ventaja mobile, pero las cards v2 brandeadas son nuevas. Construir con `react-native-view-shot` (capturar una View RN) o Skia + `expo-sharing`. Datos requeridos: streak (RPC `get_client_current_streak`), totalWorkouts (`getWorkoutHistoryDayCounts(365)`), monthlyRecap (`getMonthlyRecap`).

### 2.4 Perfil — módulos read-only + entitlements (gap total)
- Las filas "Movimiento"/"Composición" del perfil web se muestran solo si `showMovement`/`showBodyComposition` (`getStudentMovementNavEnabled()` / `getStudentBodyCompositionNavEnabled()`). **Mobile no tiene NADA del sistema de entitlements** (0 refs a `MODULE_KEYS`/`enabled_modules`, confirmado 07-shared-seams §C.4). Sin esto no se pueden gatear ni las filas del perfil ni las pantallas de módulo. Es prerequisito de §2.6.

### 2.5 Perfil — preferencia de sonido de descanso
- Web persiste `restTimerSound` en localStorage y hace preview con `playTimerSound` (`ProfileClient.tsx:216-226`). El ejecutor de rutina lo lee. Mobile debe persistir en AsyncStorage y que el `RestTimer` mobile (`components/workout/RestTimer.tsx`) lo consuma. Coordinar con el subagente de ejecución de rutina (la preferencia se define en perfil pero se consume en workout).

### 2.6 Módulos read-only del alumno (movimiento / composición) — gap 100% funcional
- **Movimiento**: mobile debe consumir `movement/*` (los endpoints `/api/mobile/movement/*` existen pero NO se consumen — 06-mobile-inventory §C). Vista read-only: último reporte final + evolución + disclaimer. Tipos en `@eva/schemas`/`domain/assessment`. Cómputo del semáforo en `@eva/calc` (hoy no importado por mobile).
- **Composición corporal**: consumir `bodycomp/{bia,isak,[id]}` (existen, no consumidos). Vista BIA/ISAK + trend + disclaimer. Cómputo en `apps/web/src/domain/bodycomp/*` (puro, listo para extraer a paquete).
- Ambas gated por entitlement (§2.4) — sin el gate server-side, un alumno sin módulo podría leer vía PostgREST directo si la RLS no lo cubre. El arquitecto debe confirmar que la RLS de las tablas de assessment/bodycomp ya aísla por `client_id` (self-select) — de ser así, el gate mobile es solo de UI/nav, no de seguridad.

### 2.7 Ejercicios — paginación server + video + on-demand + deep-link
- **Paginación**: web pagina server-side (primera página + "Ver más (N restantes)", `loadClientExercisesAction`). **Mobile trae TODOS los ejercicios de una** (`select().order('name')`, filtra en cliente). Con catálogos grandes esto es un problema de rendimiento/datos. Replicar paginación.
- **Video**: mobile no reproduce YouTube/mp4 (solo gif). Portar `ExerciseVideo` (WebView YouTube o `expo-video`).
- **Instrucciones on-demand**: web `getExerciseInstructions` bajo demanda; mobile las trae upfront. Alinear.
- **Deep-link `?q=`**: web precarga búsqueda desde los PRs del dashboard. En RN el equivalente sería navegar a la tab con param de búsqueda (los PRs del dashboard mobile deberían poder abrir "Aprender" con query). Gap menor.
- **Scope de query**: mobile filtra `coach_id.is.null OR coach_id.eq.{coachId}` (correcto, catálogo global + del coach). OK.

### 2.8 Historial — paridad alta, gaps menores
- Rango 90/180d, conteo de series por día vía RPC (`getWorkoutDaySummaries` → `get_client_workout_day_counts`) igual que web (`getWorkoutHistoryDayCounts`). Buen match funcional. Sin gaps funcionales relevantes (solo la animación reveal, §1.2).

---

## 3. COSTURAS (compartir vía packages/ o API, cita 07-shared-seams.md)

- **date-utils**: mobile tiene `lib/date-utils.ts` propio (Santiago tz) y web `lib/date-utils.ts`. `formatRelativeDate` se usa en ambos check-in/history. No es paquete compartido hoy; bajo riesgo, pero candidato a unificar si crece.
- **Entitlements / `MODULE_KEYS`** (07 §C.4): `@eva/feature-prefs` YA declara `ModuleKey` espejo de `entitlements.service`, pensado para RN, pero mobile no lo usa. Adoptarlo para gatear filas de perfil (§2.4) y nav. El fetch de `enabled_modules` desde `coaches`/`teams` se reimplementa en mobile vía PostgREST directo (patrón existente). El gate real de seguridad es server-side/RLS (confirmar §2.6).
- **`@eva/module-catalog`** (07 §C.4/A.4): copy comercial + `surfaces` por módulo (cardio/movement_assessment/body_composition/nutrition_exchanges). Útil para labels/pitch de las filas de módulo del perfil. No consumido por mobile.
- **`domain/bodycomp/*`** (07 §C.7): puro, con tests, listo para extraer a `packages/` (patrón `@eva/nutrition-engine`) y alimentar la vista de composición corporal del alumno. Mobile parte de cero → sin drift que limpiar.
- **`domain/assessment` + `@eva/calc`** (07 §C.2, C.7): `@eva/calc` computa el screening de movimiento (7 patrones + semáforo); mobile no lo importa. Para la vista read-only del alumno probablemente solo se necesita mostrar el reporte ya computado (los datos vienen del assessment guardado), pero si el semáforo se recalcula en cliente, usar `@eva/calc`. Tipos `MovementAssessmentWithItems` en `domain/assessment/types` (verificar si están en `@eva/schemas` "SAFE FOR MOBILE" o server-only, 07 §A.6).
- **`@eva/schemas`** (07 §A.6): `bodycomp.ts`, `screening.ts` están marcados "SERVER-ONLY" en el index pese a ser estructuralmente Zod puro. El arquitecto debe revisar si esa etiqueta bloquea su uso en RN para validar respuestas de los endpoints `/api/mobile/{bodycomp,movement}/*`.
- **Share-cards** (§2.3): el motor web es `lib/workout-pr-card-canvas.ts` (canvas del DOM, NO portable a RN). No hay costura; RN reimplementa con view-shot/Skia. Solo compartir los DATOS (streak/totalWorkouts/monthlyRecap) y el copy.
- **Audio de descanso** (§2.5): `lib/audioUtils.ts` (web) usa Web Audio API — no portable. RN usa `expo-av`/assets propios. Compartir solo la key de preferencia (`restTimerSound`) y el set de nombres.

---

## 4. TAREAS PROPUESTAS

### Ola A — Re-skin visual (adoptar DS, transcribir layout mobile de web)
1. **[VISUAL][S]** Fundación de toast DS en RN (provider + `useToast`) — bloquea reemplazar `Alert.alert` en check-in por toasts (paridad `sonner`). Dep: ninguna. (Compartida con otros dominios — coordinar; es P0 de 02-design-system §E.)
2. **[VISUAL][M]** Re-skin Check-in a EVA DS: migrar de patrón B a `Card`/`Button`/`Input` + `className`; añadir botón atrás + título "Check-in mensual" + eyebrow paso; disclaimer médico; stepper de peso +/- 0.1 con número display; slider de energía (o mantener botones pero con tokens); badge "Optimizando…" + nota privacidad Lock; celebración full-screen con wave brandeada + confetti (usar `react-native-fast-confetti` ya instalado). Dep: T1 (toast), primitiva SuccessWave (existe `EvaSplash`/`EvaLoader`, evaluar).
3. **[VISUAL][S]** Re-skin Historial a `Card`/`ListRow` DS + `className`; opcional animación reveal (Moti stagger). Dep: ninguna.
4. **[VISUAL][S]** Completar Perfil (ya patrón A): añadir stats grid (Entrenos/Racha), fila "Historial de entrenos" en Cuenta, card "Zona de peligro / Solicitar baja". Dep: datos de streak/totalWorkouts (RPC + `getWorkoutHistoryDayCounts`).
5. **[VISUAL][M]** Re-skin Ejercicios a DS + `Card` + tokens; añadir `FeaturedExerciseCard`. Dep: ninguna (la paginación/video van en ola funcional).

### Ola B — Funcional (post re-skin)
6. **[FUNCIONAL][S]** Check-in: prefill de peso/energía con el último check-in; limpiar badge nativo al abrir (expo-notifications `setBadgeCountAsync(0)`). Dep: T2.
7. **[FUNCIONAL][M]** Perfil: preferencia "Alarma de descanso" (AsyncStorage `restTimerSound` + preview con expo-av). Coordinar consumo con subagente de ejecución de rutina (RestTimer). Dep: T4.
8. **[SEAM][M]** Adoptar `@eva/feature-prefs` (`ModuleKey`) + fetch de `enabled_modules` (coaches/teams) vía PostgREST en mobile; helper `getStudentModuleNav`. Prerequisito de módulos y de las filas de perfil. Dep: confirmar RLS/gate server-side.
9. **[FUNCIONAL][M]** Perfil: filas read-only "Movimiento"/"Composición" gated por T8 (badge "Ver" → navegar a pantalla de módulo). Dep: T8.
10. **[SEAM+FUNCIONAL][L]** Vista Movimiento read-only del alumno (header + último reporte + evolución + disclaimer): consumir `/api/mobile/movement/*`; tipos de `domain/assessment`/`@eva/schemas`; charts con victory-native/Skia. Dep: T8.
11. **[SEAM+FUNCIONAL][L]** Vista Composición corporal read-only (BIA/ISAK switcher + summary + trend + disclaimer): consumir `/api/mobile/bodycomp/*`; extraer `domain/bodycomp` a paquete `@eva/*`. Dep: T8.
12. **[FUNCIONAL][L]** Ejercicios: paginación server-side (endpoint/patrón `loadClientExercises`), instrucciones on-demand, reproducción de video YouTube/mp4 (WebView/expo-video), deep-link de búsqueda desde PRs. Dep: T5.
13. **[FUNCIONAL][L]** Share-cards v2 desde perfil (Progreso/Racha/Resumen mensual brandeadas): render con `react-native-view-shot` o Skia + `expo-sharing`. Dep: T4 + datos (streak/monthlyRecap).

### Excepciones intencionales (NO replicar)
- Signed-URL de subida de check-in: mobile sube directo (sin WAF/Vercel en el medio) — mantener, documentar.
- Motor canvas de share-cards y Web Audio: reimplementar nativo, no portar.
- PWA install / badging API del navegador → equivalentes nativos (no la API web).

---

## 5. RIESGOS

- **Seguridad de módulos gated (§2.6/§2.4)**: si mobile expone movimiento/bodycomp sin el gate server-side y la RLS no aísla por `client_id`, un alumno sin el módulo podría leer vía PostgREST directo. Confirmar RLS de tablas de assessment/bodycomp ANTES de construir las pantallas. El gate de UI no es gate de seguridad.
- **Drift de entitlements**: mobile reimplementa el fetch de `enabled_modules` (no comparte el service). Si web cambia la forma del entitlement (kill-switch `EVA_DISABLED_MODULES`, fuentes coach vs team), mobile queda atrás. Mitigar consumiendo `@eva/feature-prefs` + endpoint `/api/mobile/config` (existe, no consumido).
- **RLS del bucket `checkins`**: el upload directo mobile depende de que el INSERT al bucket privado esté permitido al alumno dueño con path `{clientId}/`. Si la RLS del bucket asume solo service-role/signed-URL (patrón web), el upload mobile fallaría silenciosamente (best-effort lo suelta) → check-in sin fotos sin señal clara. Verificar policy de Storage.
- **Doble sistema de theming en mobile (02 §C)**: check-in/history/exercises usan `theme.*` (objeto legacy) que puede contradecir las clases DS al re-skinnear. Riesgo de colores white-label inconsistentes (algunos vía `theme.primary`, otros vía `bg-sport-500`). Definir frontera al migrar.
- **Media de ejercicios**: reproducir YouTube en RN (WebView) tiene costo de rendimiento y de permisos; validar que no rompa el catálogo. Fallback a gif si no hay video.
- **Fuentes legacy**: check-in/history usan `Inter_*` en el tab bar (`AlumnoMobileChrome`) y constantes de fuente — purgar Inter/Montserrat al migrar (02 §E deuda transversal).
- **Coordinación cruzada**: la preferencia de sonido (perfil) la consume el ejecutor (otro dominio); el CheckInBanner + umbrales viven en dashboard (otro dominio). Alinear con esos subagentes para no duplicar/contradecir.
