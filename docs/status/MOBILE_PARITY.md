---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-08-03"
canonical: true
source_of_truth: apps/web responsive + apps/mobile
---

# Paridad Web/PWA → React Native

Única fuente de verdad para saber qué está cerrado, qué falta y dónde retomar el port de React Native. Los detalles de ejecución viven en [`specs/rn-mobile-parity-redesign/TASKS.md`](../../specs/rn-mobile-parity-redesign/TASKS.md); este archivo prevalece ante cualquier auditoría, spec de unidad o informe histórico.

> **Preservación de funciones** (qué se movió de lugar, qué quedó **órfano** en el rediseño, y la deuda de paridad mobile): [`REDESIGN_FEATURE_MATRIX.md`](REDESIGN_FEATURE_MATRIX.md).

## Resumen ejecutivo

> **2026-07-31 (cierre de archivado + V2 canónica, en integración)**: RN/Web usan Nutrition V2 como
> entrada canónica para Standalone/Team; se retiró el filtro de ausencia de plan V2 y los aliases
> legacy quedan solo para compatibilidad hasta versión mínima. El directorio RN trata archivados como
> filas no navegables: su única acción es desarchivar cuando el workspace tiene cupo. El perfil directo
> queda suspendido, limpia sesión/caché/cola ante `CLIENT_BLOCKED` y no reactiva planes al volver.
> La migración forward-only de asignaciones y la guarda RLS/read-model histórico siguen **sin aplicar
> en producción**; falta entorno Supabase controlado, JWTs reales, Playwright y QA físico Android/iOS.
> El detalle de corte está en [`NUTRITION_V2_CUTOVER_RUNBOOK.md`](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md).

> **2026-08-04 (F4 ola 1 — porciones del coach en RN)**: la pestaña **Porciones** del hub V2
> (`apps/mobile/app/coach/nutrition-v2/portions.tsx`, deep link `?tab=portions`) espeja la sección
> Porciones de `/coach/foods` en web: buscador sobre TODO el catálogo, gramos sugeridos por el
> servidor, preview de la frase del alumno, y quitar/restaurar alimentos de la lista propia. Toda
> escritura pasa por `/api/mobile/nutrition/exchanges/group-foods` (NUT-005), que comparte servicio
> con la web para que no puedan divergir. **Sin QA en dispositivo ni build EAS todavía.**
>
> Deuda conocida de esta ola: la pantalla usa `style` inline con tokens de `theme` en vez de
> NativeWind; falta llevar a RN el "Duplicar y ajustar" con copia de lista y las plantillas de plan
> (F3), que en RN aún no se pueden aplicar desde el builder.

La paridad global **no está certificada todavía**.

| Bloque | Código y revisión estática | QA en dispositivo | Estado efectivo |
|---|---:|---:|---|
| Sección 1 — ejecutor del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Sección 2 — dashboard del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Sección 3 — coach (14 unidades) | Cerrado | Pendiente | Cerrado estático; no certificado |
| Ola 2R — residuos del alumno | Cerrado | Pendiente | Cerrado estático; no certificado |
| Ola 4A — nutrición del alumno | **12/12 aplicadas** | Pendiente | Cerrada estática; no certificada |
| Ola 4B — nutrición del coach y catálogos | **Cerrada: 15/15 unidades de rama** | Pendiente | Cerrada estática; no certificada |
| Experiencia de entrada — splash/onboarding/acceso | Cerrada estática | Pendiente | Código y exports verdes; requiere build nuevo + QA física |

“Cerrado estático” significa que código, spec y verificaciones automatizadas disponibles convergieron. No significa que el comportamiento visual, gestos, teclado, cámara, safe areas u offline estén aprobados en hardware real.

> **2026-07-31 (corte compliance stores + timers lockscreen)**: (a) **Purga anti-steering completa**
> (informe `docs/research/cta-pagos-externos-stores-2026-07-31.md`; Apple 3.1.1 + política de pagos de
> Play prohíben CTAs a pago externo): eliminados de verdad (sin flags ni `Platform.OS`) los ~25 puntos
> de venta de RN — tab Suscripción reconvertido a **"Mi plan"** solo-estado (sin precios, tarjeta ni
> historial de pagos), muro `/coach/reactivate` neutro ("Tu plan está inactivo" + estado, ya sin botón
> a la web), 9 banners del dashboard a "Ver mi plan" interno, registro reducido a 2 pasos SIN precios
> CLP ni "se activan en eva-app.cl", muros de límite/módulos/nutrición/marca/funciones/perfil a copy de
> estado, y normalización "incluido en planes pagos"→"no incluido en tu plan". Nuevo
> `components/coach/RefreshPlanButton.tsx` ("Actualizar estado") revalida entitlements por el camino
> canónico de `activate-free`. La venta vive en web/email/WhatsApp (correos Resend por evento = deuda
> abierta). NOTA: esto supersede el "pago sigue siendo link-out a la web" del corte anterior — ya no
> hay link-out; el pago es 100% fuera de la app sin mención in-app. (b) **Timers en lockscreen**:
> módulo genérico `timers/live-timer-notification.ts` (chronometer down/up/none, actions, largeIcon,
> smallIcon `notification_icon` con fallback), **cardio** ganó cronómetro vivo (countdown/fases/
> ascendente, color de zona, logo del coach, notif final "¡Cardio completo!" patrón QA-10) y el
> **descanso** ganó botones operables en background (`Pausar/+15 s/Saltar` + ficha de pausa con
> `Reanudar`) vía handler headless único (`timers/notification-events.ts`, despacho por prefijo —
> notify-kit admite UN solo `onBackgroundEvent`) + snapshot/cola anti doble-apply (57 tests nuevos).
> Gates del corte: tsc mobile 0, eslint tocados limpio, suite 5007 tests verdes, boundaries verde,
> `expo export` android verde. TODO exige la MISMA build EAS ya pendiente (notify-kit); QA física
> post-build: botones en MIUI/Pixel, +15 s sin doble-apply, huérfanas, "Mi plan"/muros en light/dark.
>
> **2026-07-31 (corte 2 — venta por email + deudas de timers cerradas)**: (a) **Canal de venta Resend**
> (reemplazo del CTA purgado; `apps/web`): 3 correos por el MISMO evento que pinta el muro — límite de
> alumnos (los 4 call sites de UPGRADE_REQUIRED: alta/import × web/móvil), "vence pronto" (ventana ≤3
> días, solo `canceled`/`paused` — `active` se auto-renueva y `past_due` ya recibe dunning) y "venció"
> (transición del cron paid-expiry). Dedupe SIN DDL vía `admin_audit_logs` como ledger (ancla
> `current_period_end` / cooldown 7 d), kill-switch `EVA_SALES_EMAILS_DISABLED`, templates en código
> sin precios (test lo pinnea), fail-open de lectura y ledger solo tras envío exitoso. Murió
> `buildUpgradeRequiredEmail` (precios hardcodeados stale). ⚠️ Requiere `EMAIL_FROM` + `RESEND_API_KEY`
> en Vercel prod. (b) **Deuda de pausa exacta CERRADA en los 3 modos de cardio**: `timing.ts` gana
> `useStopwatch.adopt()` y `useIntervalRunner.adoptRemaining()` (aditivos, respetan QA4 h5); el drenaje
> adopta exacto vía `cardio-adoption.ts` (módulo puro, 11 tests). (c) **Superserie**: la notif del
> descanso imprime "Ronda n de N" (discriminador `countKind` ExecutorV3→…→notif). Gates: tsc web+mobile
> 0, 5053 tests, export android verde. Cambios (b)/(c) son JS-only ⇒ viajan por OTA si la build ya corrió.
>
> **2026-07-31 (gate de acceso RN — corrección)**: los guards de suscripción vivían dentro de los layouts de **tabs**, así que no cubrían las rutas fuera de esos grupos. Coach: `app/coach/(tabs)/_layout.tsx` dejaba sin gate ~21 rutas (`cliente/[clientId]`, `program-builder`, `nutrition-v2/*`, `cardio/*`, `bodycomp`, `movement/*`, `settings/*`, `foods`, `tools`, …) y además se evaluaba una sola vez por arranque (el layout de tabs no se desmonta al cambiar de tab), de modo que un back-gesture devolvía al dashboard con el plan vencido. Alumno: mismo patrón dejaba fuera `workout/[planId]`, `exercise/[id]`, `add-food` y `onboarding`, alcanzables por deep link o por el tap de una notificación push. Corregido con layouts raíz `app/coach/_layout.tsx` y `app/alumno/_layout.tsx` — el del coach usa estado reactivo (`lib/coach-access.ts`, SWR + revalidación por foreground/navegación) en vez de un efecto de una pasada, y el del alumno absorbió el gate de montaje completo, incluido el consentimiento de pool (Ley 21.719), en el mismo orden que el proxy web. En el mismo corte, el muro `/coach/reactivate` de RN gana la salida **volver al plan gratuito** (panel de archivado/eliminación + `POST /api/mobile/coach/activate-free`, que comparte `services/billing/activate-free.service.ts` con la web): antes solo sabía link-outear al navegador, así que un coach vencido sin computador solo podía pagar. El camino de **pago** sigue siendo link-out exclusivo a la web. Requiere QA física + build/OTA.

> **2026-07-31 (Ola 7A — Live Activities de iOS; código completo, **Swift sin compilar hasta el build EAS #3**)**:
> el cronómetro vivo del descanso y de cardio llega al **lockscreen y la Dynamic Island de iOS**, espejo del
> sistema que Android ya tenía con el `chronometer` de notify-kit. Tres piezas nuevas: (a) **Widget Extension**
> `apps/mobile/targets/eva-timer-activity/` generada por `@bacons/apple-targets@5.0.0` (única dependencia nueva,
> `-D`) — tarjeta oscura con `Text(timerInterval:)` monoespaciado tintado con el acento de marca, figura EVA como
> imageset del target, isla compacta/mínima/expandida; (b) **módulo Expo local** `apps/mobile/modules/eva-live-activity/`
> (autolink por `modules/`) con `isSupported/start/update/end/drainCommands` y **una actividad por `kind`**, de modo
> que descanso y cardio coexisten; (c) **botones** `LiveActivityIntent` en `_shared/` (compilan en el target de la
> app y en el de la extensión, como exige Apple) con los **mismos action ids que Android** — descanso
> Pausar/+15 s/Saltar/Reanudar, cardio Pausar/Reanudar. Cada intent mueve la actividad al instante y deja el
> comando en el App Group `group.cl.evaapp.eva`; el JS lo drena al volver la app al frente
> (`timers/live-activity-commands.ts`, registrado a nivel de módulo en `app/_layout.tsx`) y reconstruye el snapshot
> con el **`atMs` del press**, no con la hora del drenaje. Todo el JS nuevo es **NO-OP seguro** con require
> guardado: **Android no cambia de comportamiento en nada** y en iOS < 16.2, sin el módulo nativo enlazado o con
> las Live Activities apagadas en Ajustes, no ocurre nada. Botones sólo iOS 17+ (`#available`), sin fila de botones
> en 16.2–16.x. DIFERIDOS conscientes: **logo del coach en iOS** (exigiría cachear la imagen dentro del App Group)
> y **"Fase siguiente"** de cardio (la secuencia vive en el componente). Riesgo abierto a validar en dispositivo:
> `EvaTimerAttributes` está **duplicado** entre el pod y el target porque son módulos Swift distintos, y ActivityKit
> machea por nombre de tipo. Gates reales: `tsc --noEmit` 0 errores, **325 tests** de `tests/mobile/` verdes
> (17 nuevos del drenaje), `expo config --type introspect` sin errores con el plugin y el App Group resueltos, y
> `expo export --platform ios` verde. **Swift NO se compila en Windows**: la verificación nativa (target, intents,
> provisioning del extension, `ios.appleTeamId`) queda para el **build EAS #3** + QA física.
>
> **2026-07-29 (rama `worktree-adelanto-qa-20260729`, sin merge)**: adelanto paralelo al QA del owner —
> (1) **QA F2** contadores del directorio coach espejados al pulse crudo de `CoachWarRoom.tsx:220-229`
> (Riesgo/Atención/Nutri. desde el array pulse; filtro `nutrition_low` solo por flag) + test
> `tests/mobile-directory-pulse-parity.test.ts`; (2) **QA F4/F6** safe area top en `builder.tsx` y
> `clientes.tsx` (`edges=['top']`) + clearance inset-aware (`COACH_TABBAR_CLEARANCE + insets.bottom`);
> (3) **consentimiento de pool Ley 21.719 en RN** (gap legal: la app no pasa por el proxy web que lo
> fuerza): endpoint `api/mobile/auth/pool-consent` (GET/POST/DELETE espejo de `consent.actions.ts`),
> pantalla `alumno/consent.tsx`, gate en `(tabs)/_layout` (orden blocked→password→consent, fail-open
> como el proxy) y revocación en el perfil del alumno; (4) **export PDF del reporte de Movimiento**
> (`movement-report-pdf.ts`, espejo del print web; delta aceptado: sin bitácora `pdf_generate`);
> (5) hallazgo transversal: la infra de push (`apps/web/src/lib/push.ts`) no tenía NINGÚN disparador
> nativo — corregido más abajo. F5 (anillo proteína) no reproducible en código actual — re-testear en
> device; F9 ("Z4") sin rastro en código — probable fix colateral. Todo pendiente de QA física.

> **2026-07-30 (misma rama, corte 3 — ronda QA-2 del owner, 14 hallazgos + 2 decisiones)**: (a) splash
> nativo → figura BLANCA `eva-icon.png` (era la variante negra sobre #07080C; config nativa = próximo
> build) y loader default RN → figura EVA respirando (muere el wordmark tricolor; custom del coach
> intacto); (b) **grano global** en `AppBackground` ambos temas (crosshatch sello de la entrada,
> decisión owner); (c) ficha de alumno coach: iconos lucide SIN `cssInterop` en todo el cluster
> (caían a negro en dark — registro sistémico via `themed-lucide.ts`), 5 KPI cards con contrato
> compartido web/RN (labels completos, tiles tonales), flash V1→V2 del tab Nutrición muerto
> (skeleton hasta asentar 4 señales async), backdrop de tabs con rampa de opacidad + fricción
> horizontal resuelta, fotos de check-in FIRMADAS en lote (bucket privado; antes pintaba paths
> crudos = recuadros vacíos); (d) editor nutrición V2: icono del alimento repuesto (el dato llegaba
> del read-model y se perdía en la hidratación), chip de grupo delega en `GroupDot` DS; (e) barrida
> de safe areas: 11 ramas en 8 archivos (ficha nutricional, quick-edit, 6 tabs coach con
> `edges=[]`); (f) `DateField` JS puro (día/mes/año) en perfil cardio; (g) avatar del hub Opciones
> muestra el LOGO del coach (fallback iniciales), espejo web en `IdentityHero` de settings;
> (h) retiro de las viñetas del directorio (patrón solo-RN); (i) builder workout: Guardar/FAB se
> ocultan con el catálogo abierto (espejo web), modo simple EXTIRPADO (−40 líneas), anatomía de
> filas espejada (trash rojo, link SS, volumen en línea) + bug real: `toggleSuperset` sin `intent`
> podía agregar en vez de quitar; (j) web: fondo del documento bajo el ejecutor dark-only
> (`html:has(.is-workout-page)` — mata el bloque blanco de iPhone) + fallback `100vh`, logo del
> coach en avatares web, mismas KPI cards. Gates del corte: tsc web+mobile 0, vitest 1115 verdes,
> lint 0 errores. TODO pendiente de QA física. Además aterrizó el **morph card→sheet de la
> entrada** (frame 4 del concepto C, decisión owner 2026-07-30): "Soy alumno" se expande EN LA
> MISMA pantalla hasta el sheet con el form del código (260ms, reversible con back, reduce-motion
> a fade 160ms); el form se extrajo a `CoachIdentifierForm` compartido y `/alumno/codigo` sigue
> intacta para deep links. Timings 1:1 con la spec del mockup; gates: tsc 0, vitest 1121, expo
> export android OK.

> **2026-07-30 (misma rama, corte 6 — Cardio Conectado F1+F2 + home Mock C + ronda QA-5 del owner,
> 10 hallazgos triados / 6 codificados)**: **Cardio Conectado** (SDD `specs/cardio-conectado/`) —
> F1: HUD BLE en vivo en `CardioScreenV3` (tiempo-en-zona mm:ss, `ZoneBar` 5 segmentos con marcador
> vivo + objetivo, avg/máx de sesión, háptica fuera-de-zona con debounce 10 s y rearme en pausa) con
> reducer puro `zone-session` en `@eva/cardio`; la curva de FC persiste SIN migración en
> `workout_logs.metadata.hr` (v1, serie downsampleada ≤360 pts) vía `ctx.hrMetadata` de
> `buildTypedPayload`. F2: `readHubWorkouts` en ambos hubs — iOS migrado de `react-native-health`
> (congelada por sus autores) a `@kingstinct/react-native-healthkit` v14 conservando la plomería de
> errores QA-4 (HealthConnectResult + scopes `habits|workouts` para no reportar 'denied' falso) —
> e `ImportWatchSheet` en el resumen: matching ≥50 % de solape con la ventana real de sesión,
> `hubImportPatch` solo ejes vacíos, precedencia BLE>hub, escritura por `logSet`. Permisos nuevos
> (`READ_EXERCISE/HEART_RATE/DISTANCE/ACTIVE_CALORIES_BURNED` + plugin kingstinct) **exigen build
> EAS y ampliar el form de Play Health**. **Home alumno Mock C** (decisión CEO, artifact de mocks) —
> header sin borde duro con wash de elevación del tema, marca↔fecha en una fila, mensaje del coach
> con su logo real (`BrandLogoCircle`, ex-BrandDot, ahora compartido); `WeekStrip` reemplaza a
> `StreakRibbon` (deprecated): 7 dots Lun→Dom con el MISMO estado greedy de las day-cards
> (`deriveWeeklyStreak`, cero regla duplicada) + chip de racha RPC con hito y singular corregido.
> **QA-5** — keypad "Listo" en hero SOLO cierra el teclado ("Aplastar serie" comitea; fuera de hero
> intacto); `VideoPlayer` resiliente (onError/onHttpError + puente postMessage porque el onLoadEnd
> del HTML local miente + watchdog 12 s → miniatura + reintento ×2, controles re-sincronizados);
> taps de day-cards/hero/pendientes garantizados en MIUI (`measureMorphOriginSafe`: rect ≤120 ms o
> fallback `null` — `startMorph` ya degradaba a origen sintético; deuda declarada: `workout.tsx`
> PlanCard usa el crudo); logo del coach en el hero de "Mi perfil" (`Avatar src` modo logo, fallback
> iniciales); atajo share 1-tap en cada tile de Records (`RecordShareCard` extraído de
> `PRDetailSheet`, overlay hermano — jamás Modal-en-Modal); splash como loader del dashboard
> (`DashboardReadyContext` + `DashboardSplashOverlay` hermano del Stack con handoff visual continuo
> desde `SplashGate`, fade 280 ms, tope 5 s, onboarding y flujo sin sesión intactos). Verificado en
> triaje sin tocar código: Aprender ya pagina server-side con taps vivos, "Comparte tu logro" ya
> existe desde jul-08 (view-shot nativa — exige binario ≥ jul-08), Jose Fit SÍ tiene logo en DB
> (avatar "JF" = bundle viejo). iOS Live Activities queda Ola 7A (diferida). Gates del corte: tsc
> mobile 0; vitest 1388 verdes (tests/mobile + packages cardio/workout-engine); export Android en
> curso al cierre. TODO pendiente de QA física en build EAS nueva.

> **2026-07-30 (misma rama, corte 5 — ronda QA-4 del owner, 19 hallazgos, 13 informes + 12 workers
> juzgados)**: **Ejecutor V3 RN** — cronómetro count-up arreglado (`useStopwatch` re-armaba el
> intervalo cada tick y quedaba 0:00↔0:01; roller guardaba 0-1s en `workout_logs`); ejercicios por
> tiempo YA NO auto-arrancan (paridad web: movilidad/cardio/intervalos con Iniciar/Pausar/Reanudar;
> el lado 2 per-side sí auto-continúa); registro SIEMPRE visible en movilidad (ActiveSetRow +
> historial bajo el anillo; muere "Registrar a mano", que desmontaba el anillo y mataba el timer);
> miniatura real en la card SIGUIENTE del descanso (`thumbnail_url` entra al select del plan +
> cadena thumb→gif→póster YT; las sustituciones propagan `thumbnail_url`); detector YouTube
> unificado (`youtube-nocookie.com` caía a 'image' y rompía 33 ejercicios del catálogo — helper
> `isYoutubeMediaUrl` RN+web, 6 clones muertos); video centrado llenando el marco + botón mute
> (default muteado) también para YouTube vía IFrame API sin recargar el WebView; ignition:
> `overflow hidden` (las 3 líneas ya no se ven antes de tiempo), `SessionMorphProvider` al layout
> RAÍZ (Android cerraba el Dialog en el `router.push` sin avisar a JS → ahora sí espera el "TOCA
> PARA COMENZAR"), LISTO centrado, logo con máscara circular; ejecutor forzado a DARK
> (`ForceScheme` + footer/título/descripción de `Sheet` gateados por `forceDark` — muere la barra
> blanca con cuenta en modo claro; sheets "Nota del coach" ×4 incluidos); rueda KG/REPS a 280ms
> (antes 400 + ~150 de `delaysContentTouches` iOS) + haptic Medium + rueda conectada en superserie
> + web a 280. **Días del programa** — la day-card de HOY completada abre "Ya hiciste este
> entrenamiento" (paridad web QA7); `?recuperar=` validado con `validateTargetDate` (adiós
> "Recuperando: Invalid date"); copy amigable para serie pasada sin registro (string compartido del
> engine). **Centro Nutrición coach** — SOLO las 3 tabs quedan sticky (overlay `translateY`;
> título/pill/+ scrollean); buscador de Alimentos dentro del scroll; la cápsula del coach por fin
> se minimiza en el hub V2. **Fichas coach** — muere el flash "No pudimos abrir la ficha"
> (`setLoading(false)` antes de tener `userId` + offline derivado del TTL de cache): máquina
> resolving|loading|blocked|ready|failed (`lib/coach-nutrition-detail-phase.ts` + 9 tests), error
> ámbar SOLO desde el catch, Reintentar + auto-retry al volver online, loader de marca; builder
> ídem. **Mi marca FULL en RN** — las 7 variantes de loader + compositor 8×4 portadas
> (`components/loaders/`, svg/moti, reduced-motion) y enchufadas vía `EvaLoaderScreen` (cubre las
> 68 pantallas de carga); Guardar ya no corrompe la cache (merge no destructivo); el coach carga SU
> PROPIA marca al entrar (antes solo el flujo alumno escribía cache → marca ajena en device
> compartido); editor completado: tema del ejecutor + compositor + previews con el render REAL;
> `use_brand_colors_coach` honrado solo por el camino autenticado (select anon intacto).
> **Salud/BLE** — estudio completo en `docs/research/estudio-salud-dispositivos-2026-07-30.md`
> (+ anexo de código). OTA: el scan espera `PoweredOn` + taxonomía de errores BLE con copy por
> causa y CTA a ajustes; `BleManager` lazy (muere el prompt BT al abrir cardio); `androidInit`
> verifica permisos realmente concedidos; `iosInit` propaga el error real; aviso ANTES de mandar a
> Play Store por Health Connect (Android ≤13). Config para la PRÓXIMA build: `BLUETOOTH_SCAN/
> CONNECT` fuera de `app.json` (habilita el `neverForLocation` del plugin ble-plx — sin él el scan
> Android 12+ da 0 resultados) + `plugins/with-health-connect.js` (`setPermissionDelegate` en
> MainActivity — sin esto `requestPermission` CRASHEA nativo — y `activity-alias` Android 14+).
> BLOQUEANTES de release (owner): capability HealthKit en el provisioning local (`credentialsSource:
> "local"` no sincroniza capabilities) y formulario "Health apps declaration" en Play Console
> (~2 semanas de aprobación — empezar YA). **Misc** — check-in: fotos arregladas
> (`expo-file-system/legacy`: el entry SDK 54 lanza siempre; try/catch con error visible; iOS sin
> crop 1:1 forzado); comparador de fotos del coach migrado a `Gesture.Pan` (usaba `locationX`
> relativo al view tocado = temblor frenético; sheet sin scroll); IMC sin desbordar; segmented
> "Lado" a ancho completo ("Alternado" ya no parte); iconos de Herramientas normalizados para
> Android (sizes pares, stroke 2, HW texture). Gates del corte: tsc web+mobile en 0; vitest 4843
> verdes (379 archivos). TODO pendiente de QA física; BLE/Health Connect/HealthKit y el form de
> Play exigen build EAS nueva + trámites del owner.

> **2026-07-30 (misma rama, corte 4 — ronda QA-3 del owner, ~26 hallazgos, 13 workers juzgados)**:
> **Ejecutor V3 RN** — (a) el keypad custom ya no se abre solo al entrar ni tras cada serie
> (lazy-init del nonce en `SetRow.tsx:880`); (b) descanso SIN flash de la serie siguiente (la
> decisión de descanso corre en el tick síncrono ANTES del `await logSet` en `handleCommit`);
> (c) la nota de serie queda visible sobre el teclado (KeyboardAvoidingView en pager + KeypadHost
> + contexto `useEnsureVisibleInStep`); (d) hairline blanca de los sheets dark muerta
> (`border-inverse/10` en la primitive `Sheet.tsx`) y GestureHandlerRootView dentro de
> `nativeModal` → el slider de volumen de Ajustes por fin arrastra; (e) la intro espera los datos
> (mínimo 1.4s, techo 4.5s) — el Inicio ya no "carga por partes"; la racha semanal cabe en 360px
> (grupo label/copy con shrink + dots 14px) y aterriza con fade sin salto; crossfade EMPEZAR→sesión
> 220ms; confetti final una sola pasada (`isInfinite={false}`, la lib venía en TRUE por default);
> prefetch del gif del primer ejercicio durante intro/Inicio; (f) superserie: glow del card activo
> por anillos internos (muere el `elevation` cortado de Android), miniaturas reales en filas B/C
> (gif/imagen/`mqdefault` de YouTube vía `execMediaKind`), bandas marquee "CONTINÚA SIN DESCANSO"
> arriba/abajo del card activo (RN **y web**, apagadas durante descanso y reduced-motion),
> `ExecMediaImage` nuevo con cache memory-disk + skeleton real + retry ×2 (compartido con
> `TypedMediaV3`), el lightbox de técnica ahora sí agranda (70% del alto para gif; 16:9 solo
> video), nombres a 2 líneas en "Plan completo" (sheet + peek del descanso).
> **Notificaciones Android** — plugin `expo-notifications` cableado (`notification-icon.png`
> reemplazado: era un PLACEHOLDER de plantilla, ahora la figura EVA blanca; color #0B0E13) +
> `visibility PUBLIC` del countdown (canal y notificación) — todo exige build EAS nueva.
> **Nutrición alumno RN** — sticky SOLO la tira de días (título+tabs scrollean; 3 tabs con
> `stickyHeaderIndices=[1]`); flash "Sin conexión" muerto (el `stale` del TTL de cache ya no se
> confunde con offline, 3 sitios); anillos macro con track limpio en dark (alpha .24) y "/ —"
> cuando falta meta; scanner con preview (CameraView con `style` imperativo — mismo gotcha
> cssInterop de los iconos); lightbox de la foto del alimento (fila de resultados + seleccionado).
> **Versiones fuera** — jerga "versión/vN" retirada de web+RN (el único número visible era el
> builder web; Borrador/Publicado funcional se conserva). **Modales** — "Registrar alimento" RN
> pasa de bottom-sheet a diálogo centrado (fade + KAV + autofocus, testIDs intactos); web
> `TodayModal` centrado en TODOS los viewports + `initialFocusRef` al input de búsqueda;
> `WelcomeModal` con spring suave (damping 22/stiffness 160) y clip extra `collapsable={false}`
> alrededor del video (WebView Android compone sobre el recorte del padre).
> **Arranque** — una sola identidad tras el splash nativo (la firma EVA no se monta cuando hay
> marca de coach cacheada; el crossfade arranca con AsyncStorage sin esperar red — la red solo
> define el destino); el saludo SIEMPRE nombra a quien entra (sin nombre queda la marca sola:
> "Hola de nuevo" pelado bajo el nombre del coach se leía como saludo AL coach); `/?pick=1`
> fuerza el selector con sesión viva y elegir rol cierra la sesión del OTRO rol (con veredicto y
> tope 1.2s). **Onboarding del alumno NUEVO** — 3 slides post-login primera vez en el dashboard
> (`eva_student_onboarding_v1`, skippable, marca del coach en el slide 1) encadenado ANTES del
> WelcomeModal. **Home/coach/misc** — bloque "día pendiente" pasa de ember a warning ámbar
> informativo (RN + web; mapeo `--color-warning-*` nuevo en el @theme web); la ficha de alumno
> del coach pinta el header superior con el MISMO glass que las tabs al quedar sticky (wrapper
> local, TopBar intacto); "Conectar Salud" avisa antes de saltar a Health Connect + `getSdkStatus`
> + try/catch/finally (mensajes instalar/actualizar); Aprender: chip de músculo legible (blanco
> sobre scrim .62); disclaimers médicos legibles en dark (`dark:bg-warning-100/[0.16]` en
> check-in + onboarding ×2 — quedan ~11 usos rotos del mismo patrón inventariados como deuda).
> Gates del corte: tsc web+mobile en 0. Pendientes de DATOS (no UI): `proteinG` llega null en el
> read-model de hoy aunque el plan lo define (290g) — revisar RPC; catálogo OFF con curación
> pendiente (Quaker categoría "bebida"/100 ml). TODO pendiente de QA física; icono de notif,
> countdown en lockscreen, sonido de fin de descanso (expo-audio) y Health Connect exigen la
> build EAS nueva.

> **2026-07-29 (misma rama, corte 2)**: (a) **push W1** (catálogo aprobado por el owner): payload dual
> `url`/`screen`, kill-switch `EVA_PUSH_DISABLED_EVENTS`, `meal_reminder` extendido a nativo (el cron
> pasa por `sendPushToClient`), `program_assigned` (web action + bridge RN), `checkin_received` al coach
> (action web + bridge nuevo `api/mobile/checkin-submitted`), `checkin_due` (cron nuevo, hitos día 8/15);
> (b) **QA F13** (decisión owner): la web arranca en el tema del sistema (`defaultTheme="system"`),
> toggles leen `resolvedTheme`; (c) limpieza de builds: perfiles `prodpreview`/`staging` y opción
> `enterprise` retirados; (d) **editor de día pasado RN** (cierra el gap P1 del informe de paridad):
> `validateTargetDate`/`resolveRepeatDate` promovidos a `@eva/workout-engine` (web importa del paquete),
> `useWorkoutSession(planId, repeatDate, editDate)` con modo solo-UPDATE client-side (paridad
> `workout-log.actions.ts:119-185` + fix `80995cae`: fecha=HOY se normaliza), ventana completa del día
> corrida a la fecha (logs/historial/máximos/última sesión), snapshot escopado por fecha, cola offline
> con `target_date` (dedup por día escrito, descarte permanente `past_set_not_found` + Sentry), sheet
> del home habilita "Revisar y editar" para días pasados (muere "Disponible pronto"). 47 tests nuevos.
> Todo pendiente de QA física.

> **2026-07-29 (rama `worktree-nutricion-ui-rescate`, sin merge)**: rescate UI de Nutrición V2 en olas 0-4 (poda de eco + permisos a 2 reales + wizard 2 pasos + selector por día) con paridad web/RN en el mismo corte — semana completa Lu-Do (`WeekDayNav` + `week-view.ts` compartidos), copia de franjas entre días (`COPY_SLOT_TO_VARIANTS` en los 4 reducers), carry-over de `visible_notes` también en el publish RN, y barrido de 677 clases muertas `text-text-*`/`border-border-*` de mobile (texto renderizaba negro incluso en dark). Las olas 4A/4B siguen "cerradas estáticas": este corte agrega superficies que requieren QA física propia. Spec: [`docs/specs/nutrition-week-view/`](../specs/nutrition-week-view/SPEC.md).

> **2026-07-25 (PR #170, `60090f90`)**: el ejecutor del alumno quedó rediseñado a **V3** — único camino en web y RN, flags eliminados — e integró **cardio fases A-D** (ejes de captura por modalidad, Escaladora, intervalos por distancia, coach ve los registros). La Sección 1 sigue “cerrada estática” sobre ese código nuevo; la deuda cardio priorizada vive en [`specs/cardio-ejes-y-fixes/TASKS.md`](../../specs/cardio-ejes-y-fixes/TASKS.md) y la cola del ejecutor en [`specs/executor-v3/TASKS.md`](../../specs/executor-v3/TASKS.md).

## Ola 4A (cerrada estática)

Fuente funcional/visual: `apps/web/src/app/c/[coach_slug]/nutrition-v2/**` y `apps/web/src/components/nutrition-v2/**` en viewport móvil. Specs vigentes: [`docs/rn-port/specs/seccion-4a/`](../rn-port/specs/seccion-4a/).

| Unidad | Alcance | Código | QA device |
|---|---|---:|---:|
| 4A-01 | Ruteo y chrome | Aplicado | Pendiente |
| 4A-02 | Vista Hoy: estructura | Aplicado | Pendiente |
| 4A-03 | Vista Plan | Aplicado | Pendiente |
| 4A-04 | Historial | Aplicado | Pendiente |
| 4A-05 | Shell y tab bar | Aplicado | Pendiente |
| 4A-06 | Editar y retirar registros | Aplicado | Pendiente |
| 4A-07 | Kit e ilustraciones | Aplicado | Pendiente |
| 4A-08 | AuraHero y colores white-label | Aplicado | Pendiente |
| 4A-09 | Porciones | Aplicado | Pendiente |
| 4A-10 | Registro y buscador | Aplicado | Pendiente |
| 4A-11 | Scanner | Aplicado | Pendiente |
| 4A-12 | Celebraciones y residuos | Aplicado | Pendiente |

Aplicadas: **las 12** (wave C en `73f6aa82`; wave D en `3efa1a75`; wave E en `7c6684fa`). Código de la ola completo; falta QA device.

## Ola 4B (cerrada estática)

Fuente funcional/visual: superficie V2 VIVA del coach (`apps/web/src/app/coach/nutrition-v2/**` +
catálogos vivos). Specs vigentes: [`docs/rn-port/specs/seccion-4b/`](../rn-port/specs/seccion-4b/)
(INVENTARIO, RANKING con las 16 unidades y 6 waves, DECISIONES-OWNER: **V1 al olvido**, recetas
fuera, RN-extras estricto).

| Estado | Unidades |
|---|---|
| Aplicadas (wave 4B.1, `bce2eb3b`) | 4B-01 macros meal-groups (P0 datos), 4B-02 scope org foods, 4B-03 quick-edit notas+permisos |
| Aplicada (wave 4B.2, `76d8ea2f`) | 4B-04 SWAP tab coach→Centro V2 (inline, cápsula intacta; V1 = rollback tras flag) |
| Aplicadas (wave 4B.3, `8f8161cb`) | 4B-05 HUB, 4B-06 Catálogo V2 + ficha, 4B-08 Detalle asignar/archivar, 4B-10 Builder F-02 reemplazos (cierra TODO F-02 P3), 4B-15 MG editor |
| Aplicadas (wave 4B.4, `2cdc0c79`) | 4B-07 Curación, 4B-17 Tablist hub (Alumnos/Alimentos/Curación cableado), 4B-09 Detalle copy+banner convertido, 4B-11 Builder porciones (write-path nuevo), 4B-14 Quick-edit drafts |
| Aplicada (wave 4B.5, `a9b8958e`) | 4B-12 Builder permisos del alumno + guardar-en-catálogo + archivar-y-reemplazar (idempotencia estable) |
| Aplicada (wave 4B.6, `6338f4a4`) | 4B-13 Builder drafts (autosave + Restaurar + guard warn-only; cierra la ola) |
| Fuera de rama | 4B-16 deuda transversal nutrition-pro (toca web+packages; abrir en rama de web) |

> **2026-07-26 (`c159d67a`)**: 4B-03 evolucionó en paridad — las notas visibles (`visible_notes`)
> pasaron de read-only a **editables** en el quick-edit de AMBAS plataformas (misma acción,
> normalización, tope 8000 y microcopy espejo). Detalle en
> [`u03-quickedit-notas-permisos.md`](../rn-port/specs/seccion-4b/u03-quickedit-notas-permisos.md).

## Estado "En progreso" del día (O2, cerrado estático 2026-07-26)

SDD: [`docs/specs/workout-day-in-progress/`](../specs/workout-day-in-progress/SPEC.md). Regla única
`deriveDayCompletion` en `@eva/workout-engine` (done = 100% de series; cardio sin `sets` = 1 unidad)
con 12 fixtures de paridad consumidos por los tests de AMBAS plataformas. Web y RN comparten visual
(`CircleDashed` + "En progreso") y copy del sheet ("Entrenamiento incompleto"). La racha del RPC no
se tocó (decisión CEO). Falta QA device (4 escenarios del PLAN).

## Experiencia de entrada (cerrada estática 2026-07-26)

Fuente: [`specs/mobile-entry-experience/`](../../specs/mobile-entry-experience/SPEC.md).

El owner aprobó las cuatro decisiones de la SPEC y el frente quedó aplicado sobre
`rnmobiledenuevo`:

- `expo-splash-screen` gobierna un único launch nativo continuo, sin espera React artificial; se
  retiraron tres componentes splash sin importadores;
- walkthrough de tres escenas locales 1×/2× con `coach-plan`, `alumno-scan`, `progreso` y `logro`
  como acento, preload, reduce motion, safe areas y adaptación a 320×568/texto ampliado;
- selector compacto y un solo campo accesible para código, slug o enlace, con submit explícito,
  errores diferenciados y protección contra doble envío;
- parser compartido en `@eva/schemas`, intents sin fetch fuera de React y branding vivo antes de la
  persistencia;
- login alumno fail-closed sin coach y endpoint autenticado que deriva identidad del bearer,
  valida el workspace exacto con la misma fuente canónica de web y solo después persiste el último
  workspace. La caché y el `coachId` del body no autorizan.

Evidencia estática: 61 tests focalizados y suite completa de 4130 tests verdes, typecheck
web/mobile, ESLint afectado sin warnings, tokens `86/86`, docs y exports Expo Android/iOS verdes.
No hubo cambio de schema, RLS ni dependencias. Como `app.json` cambió configuración nativa, falta
un build EAS nuevo y QA física; no es un cambio certificable por OTA.

### Dónde retomar

1. Generar build EAS Android/iOS del corte con la nueva configuración de splash.
2. Ejecutar matriz de entrada en hardware: cold/warm start, primer/segundo uso, sesión, teclado,
   código/slug/links, cuatro presets, EVA/custom, light/dark, red/offline y VoiceOver/TalkBack.
3. Corregir cualquier P0/P1/P2 y solo entonces certificar la entrada.
4. Abrir la ola 5 (builder y programas de entrenamiento del coach) con inventario contra código.
5. Completar matriz device de 4A/4B y regresión dirigida de Secciones 1–3/2R.
6. Deuda 4B-16 (consolidar nutrition-pro puro en `@eva/nutrition-v2`) en rama de web.

## Builds móviles

| Plataforma | Profile | Resultado conocido | Qué significa |
|---|---|---|---|
| Android | `production` | Build + **Submit a Play internal testing** verdes en el [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa` (2026-07-25, corte con deuda cardio + universal links); previos `4382ff6c`/`335c88da` también verdes | Vía completa funcionando sobre el corte actual; retener artefacto (1 día) |
| iOS | `production` | Build + **Submit a TestFlight** verdes en el [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa`, con el profile regenerado (HealthKit + Associated Domains; la falla de capability de los runs 07-23/24 quedó cerrada) | Binario del corte actual existe y fue enviado; falta verificación en App Store Connect y QA device |

Un build/submit verde no sustituye la verificación manual en App Store Connect/Play Console ni el QA en dispositivo (universal links incluidos — el CDN del AASA de Apple puede tardar horas).

## Siguiente horizonte

Después de cerrar la experiencia de entrada y certificar el trabajo acumulado:

1. 5 — builder y programas del coach.
2. 6 — dominios restantes, inventariados en lotes pequeños.
3. 7 — certificación transversal de rutas, estados, branding, accesibilidad y ambos sistemas operativos.

El alcance exacto se confirma contra código antes de abrir cada ola; no se reactiva automáticamente un checklist histórico.

## Contrato de actualización

Actualizar este archivo en el mismo cambio que:

- aplique o revierta una unidad de paridad;
- cambie la ola activa o el orden de ejecución;
- obtenga un resultado nuevo de build o QA device;
- acepte una divergencia nativa;
- descubra un bloqueo que cambie el siguiente paso.

Cada actualización debe cambiar `last_verified` con fecha y commit. Evidencia extensa pertenece a la spec de unidad o a auditorías fechadas, nunca a este resumen.
