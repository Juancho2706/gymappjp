---
status: done
owner: product-engineering
last_verified: "2026-09-02"
canonical: false
---

# PLAN — QA del owner 02-09: ejecutor, Share Entreno y accesos (A–J)

Ver [SPEC](SPEC.md). **Sin DDL, sin RLS nueva, sin migraciones y sin dependencias nuevas** (la única
dependencia posible está aislada en la decisión abierta 6 de la SPEC y no se toma en esta tanda).
Esfuerzo total estimado: **44–60 h-agente**, ejecutadas por nueve workers en paralelo sobre el mismo
árbol, con pasada de juicio del jefe entre olas.

## Arquitectura de la tanda

La regla que ordena los diez hallazgos: **la decisión y la aritmética viven en `packages/*`, puras y
testeadas una sola vez; cada plataforma solo pinta y cablea.** No es estética: `apps/mobile` no
tiene runner de tests (`vitest.config.ts` no incluye `apps/mobile/**`, y meterlo arrastraría el
runtime RN a la suite raíz), así que **lo único que se puede cubrir de RN es lo que se baja a un
paquete**.

```text
packages/schemas/coach-identifier.ts        A · parser único de código/slug/enlace (web + RN)
packages/workout-engine/cardio-autolog.ts   E · decisión de auto-registro + acumulador + rondas
packages/workout-engine/notif-permission.ts D · estado del permiso → copy y acción (web + RN)
packages/workout-engine/muscle-catalog.ts   H · catálogo único de músculos, secciones y equipo
packages/plan-builder/exit-guard.ts         I · shouldConfirmExit + copy + href de salida
apps/web/src/lib/coach-og-image.ts          B · composición y respuesta del OG (pura + helper)
apps/web/src/lib/deploy-skew.ts             J · reconocimiento del skew + guard de recarga
        ↑ testeados desde la raíz con vitest; las apps importan, no reimplementan
```

Orden de ejecución sugerido (por daño y por dependencia): **I** (pierde trabajo del coach) → **A**
(rompe el alta del alumno) → **D/E** (ejecutor) → **B/C/J** (web, independientes) → **H** (catálogo
compartido primero, UI después) → **F/G** (Share, el más visual y el que más QA de device pide).

---

## A · `/join/<CÓDIGO>` en el parser de identificador

| # | Archivo | Cambio |
|---|---|---|
| A1 | `packages/schemas/coach-identifier.ts` | `IDENTIFIER_ROUTES = new Set(['c','invite','join'])` reemplaza la comparación en línea de `candidateFromPath`; nuevo `candidateFromQuery(search)` con las claves `identifier`, `code`, `invite`, `invite_code`; las dos ramas de `extractCandidate` que construyen un `URL` devuelven `candidateFromPath(...) ?? candidateFromQuery(url.search)`. **No** se filtra el host (queda comentado por qué: `previewv2` y el QA local sirven otros orígenes, y el valor se valida igual contra la DB). |
| A2 | `apps/mobile/lib/coach-identifier-form.ts` | Nuevo kind `'clipboard'` en `CoachIdentifierErrorKind` con su copy propio; nueva `resolveClipboardIdentifier(clip)` que devuelve `{ok:true,value}` con el identificador **ya normalizado** o `{ok:false, reason:'empty'|'unparsable'}`. Módulo RN-free a propósito (su header ya lo advierte): sin un solo import de React Native. |
| A3 | `apps/mobile/components/entry/CoachIdentifierForm.tsx` | `openInvitationLink` extrae antes de escribir y falla con `'clipboard'`; el chip «Pegar» escribe el valor extraído si resuelve y el clip crudo si no (nadie merece un error mientras tipea); la etiqueta pasa a «Pegar mi enlace de invitación»; `testID` y estilos **sin cambios** (la spec visual de `entrada-dark-v1` sigue cumplida). |

**Tests.** `packages/schemas/coach-identifier.test.ts`: +9 casos válidos (el caso exacto del owner
con `?ref&src&k`, minúsculas, sin esquema, path pelado, `eva://join/`, slug por `/join`, decodificado,
`?identifier=`, y el `/c/<code>/login` como no-regresión) y +7 inválidos (`/join` sin segundo
segmento, `/t/`, `/org/`, ruta interna, 2 caracteres, query basura).
**Nuevo** `tests/mobile/coach-identifier-form.test.ts` con `resolveClipboardIdentifier`, los copys y
un **test de contrato emisor↔parser**: `parseCoachIdentifier(studentJoinUrl('CRDZ9') + '?ref=…')`
debe devolver el código, para que nadie cambie el emisor sin el parser.
`tests/mobile/native-intent.test.ts` y `tests/mobile/applinks-claims.test.ts` deben seguir verdes
**sin tocarlos**.

**Gate.** `pnpm exec vitest run packages/schemas/coach-identifier.test.ts tests/mobile/coach-identifier-form.test.ts tests/mobile/native-intent.test.ts tests/mobile/applinks-claims.test.ts` ·
`pnpm --filter @eva/mobile exec tsc --noEmit`.

**Tamaño.** 3–4 h. OTA sobre 1.1.2.

---

## B · Preview de WhatsApp: `Content-Length`, arte nuevo y versión

| # | Archivo | Cambio |
|---|---|---|
| B1 | `apps/web/src/lib/coach-og-image.ts` | Deja de ser solo dos constantes: pasa a ser la pieza **pura** del OG. `resolveCoachOgArtwork({primaryColor, logoUrl, logoUrlDark, brandName, brandingAllowed})` decide qué se dibuja (logo del coach sobre su color · nombre de la marca · figura EVA sobre azul EVA); `coachOgFallbackArtwork` degrada cuando el logo no se puede dibujar; `safeHexColor` / `isDarkBackground` deciden el contraste; `coachOgBrandNameFontSize` ajusta el cuerpo al largo del nombre; `coachOgImageVersion(...)` hashea logo, logo dark, color y nombre; `buildCoachOgPngResponse(bytes)` arma la `Response` con `Content-Type`, **`Content-Length`** y `COACH_OG_CACHE_CONTROL`. |
| B2 | `apps/web/src/app/api/og/[coach_slug]/route.tsx` | El route solo dibuja: llama a `resolveCoachOgArtwork`, `await`-ea el `arrayBuffer()` del `ImageResponse` y devuelve `buildCoachOgPngResponse(...)`. Al esperar el buffer, el `catch` del fallback **por fin corre de verdad** (antes el error del logo remoto ocurría al consumir el stream, fuera del `try`). Se conserva `runtime = 'nodejs'` y la URL absoluta del ícono EVA (satori la necesita), y **no** se agrega `dynamic`. |
| B3 | `apps/web/src/app/c/[coach_slug]/layout.tsx` | `generateMetadata` lee también `x-coach-logo-url-dark` y `x-coach-primary-color`, arma `?v=<coachOgImageVersion(...)>` y agrega `secureUrl` al `openGraph.images`. **No** se declara un `openGraph` parcial en `login/page.tsx`: el merge de metadata de Next es por clave de primer nivel y perder `og:image` sería peor que el bug original. |

**Tests.** **Nuevo** `apps/web/src/lib/coach-og-image.test.ts`: la respuesta trae `Content-Length`
numérico **igual** al largo real del cuerpo (es el test que evita la regresión), el `Cache-Control`
conserva `s-maxage=86400`, la elección de arte cubre las tres ramas (logo · nombre · figura EVA), el
contraste sigue a la luminancia del color y la versión cambia solo cuando cambia la marca. No se
ejerce `ImageResponse` bajo vitest (satori pide fuentes y red): lo que se blinda es el header y la
decisión, y el pixel se verifica por `curl` y por ojo.

**Gate.** `pnpm exec vitest run apps/web/src/lib/coach-og-image.test.ts` ·
`pnpm --filter @eva/web exec eslint src/lib/coach-og-image.ts src/lib/coach-og-image.test.ts 'src/app/api/og/[coach_slug]/route.tsx' 'src/app/c/[coach_slug]/layout.tsx'` ·
tsc web.
**Verificación post-deploy obligatoria** (va en el reporte, no es opcional):
`curl -s -A "WhatsApp/2.24.17.79 A" -I "https://www.eva-app.cl/api/og/josefit"` debe mostrar
`Content-Length` y **no** `Transfer-Encoding: chunked`; el HTML del login debe seguir emitiendo todos
los `og:*`; y la prueba con el teléfono tiene que hacerse con una URL **nunca compartida** (WhatsApp
cachea por URL, 72 h+, sin forma oficial de limpiar).

**Tamaño.** 2,5–3,5 h. Deploy de Vercel, sin OTA.

---

## C · El Despegue pierde el logo cuando el trigger está en un portal

| # | Archivo | Cambio |
|---|---|---|
| C1 | `apps/web/src/lib/workout/exec-launch-brand.ts` | `resolveLaunchBrand` cae a `ownerDocument.querySelector('[data-primary-color]')` cuando `closest` devuelve `null`; `closest` conserva la prioridad y el fallback queda comentado (incluido el residual: si algún día hubiera dos wrappers, se tomaría el primero). Se exporta `LAUNCH_BRAND_FALLBACK_LOGO` (el ícono EVA) como **decisión de render**, no como campo de `LaunchBrand`: el splash comparte el módulo y su avatar de 116 px se queda en la inicial. `ownLogo` no cambia de semántica. |
| C2 | `.../dashboard/_components/launch/WorkoutLaunchMorph.tsx` | El tercer ramo del círculo pasa de `<PlayIcon size={38} />` a una `<img>` con el ícono EVA. Cadena final `logo → inicial → ícono EVA`. Opcional en el mismo diff: borrar la escritura muerta de `sessionStorage['eva:exec-v3-morph-logo']` (cero lectores). |

**Tests.** **Nuevo** `tests/exec-launch-brand.test.ts` (jsdom, DOM armado a mano), 5 casos: logo dark;
logo claro; el ícono EVA como `data-logo-url` sigue **sin** contar como logo propio; **trigger montado
fuera del wrapper (regresión del portal): hoy falla, con el fix pasa**; y sin wrapper devuelve todo
`null` sin lanzar. No se testea el render del overlay (framer-motion + WAAPI + portal en jsdom es
frágil y no hay precedente en la suite).

**Gate.** `pnpm exec vitest run tests/exec-launch-brand.test.ts` · eslint sobre los dos archivos ·
tsc web.

**Tamaño.** 2–3 h. Deploy de Vercel.

---

## D · Permiso de notificaciones recuperable desde el ejecutor v3

| # | Archivo | Cambio |
|---|---|---|
| D1 | `packages/workout-engine/notif-permission.ts` (**nuevo**) | `describeNotifPermission(state, surface)` traduce `granted / default / denied / unsupported` × `mobile / web` a la fila que se pinta: `visible`, `label`, `status`, `on`, `interactive`, `action` (`none` / `request` / `open-settings`) y `blocked`. Puro a propósito (cero imports): el estado real lo leen `expo-notifications` en RN y `Notification.permission` en web, y así las dos plataformas comparten la máquina de estados y los tests corren sin mocks nativos. El copy de `mobile` nombra «No molestar» en el estado concedido, porque es la causa nº 1 de que aun con permiso no se vea nada. Export en `packages/workout-engine/index.ts`. |
| D2 | `apps/web/src/lib/client/use-notification-permission.ts` (**nuevo**) | Hook cliente: lee `Notification.permission` (o `unsupported`), relee al volver a la pestaña, y `request()` promptea y confirma con `registration.showNotification` vía service worker — nunca `new Notification()` («Illegal constructor» en PWA Android). Arranca en `null` = cargando, para no pintar «Sin permiso» antes de leer el estado real. |
| D3 | `.../workout/[planId]/v3/ExecSettingsSheet.tsx` | Fila «Avisarme al terminar el descanso» entre «Vibración» y «Sonidos de celebración», alimentada por D1+D2. `Toggle` gana prop `disabled` (permiso ya concedido, o bloqueado por el navegador). **No se toca** `RestTimer.tsx`: su bloque ya funciona en cuanto hay permiso. |
| D4 | `apps/mobile/components/alumno/workout/v3/ExecSettingsSheet.tsx` | Fila «Temporizador en la pantalla bloqueada» con el mismo mapa: pide el permiso con `requestRestNotifPermission()` y, si el sistema ya no re-pregunta, ofrece «Abrir ajustes» (`Linking.openSettings()`). El estado se relee al abrir el sheet y en cada `AppState` `active` (volver de los ajustes del SO actualiza la fila sola). |

**Tests.** **Nuevo** `packages/workout-engine/notif-permission.test.ts`: la matriz completa 4 estados
× 2 superficies, con las invariantes que importan (no soportado ⇒ invisible; concedido ⇒ encendido y
no interactivo; bloqueado ⇒ `open-settings` solo en mobile, `none` en web; los copys de las dos
superficies son distintos y no vacíos). **Nuevo**
`apps/web/src/lib/client/use-notification-permission.test.ts` (mockeando `window.Notification` y
`navigator.serviceWorker`): `unsupported`, `default → granted`, `default → denied`, y que concedido
no vuelve a preguntar.

**Gate.** `pnpm exec vitest run packages/workout-engine/notif-permission.test.ts apps/web/src/lib/client/use-notification-permission.test.ts` ·
eslint web sobre el hook y el sheet · tsc web · `pnpm --filter @eva/mobile exec tsc --noEmit`.

**Tamaño.** 3–4 h (2–3 h la fila web + 1–1,5 h la fila RN). Deploy + OTA.

---

## E · Cardio: auto-relleno de MIN y auto-registro al terminar

| # | Archivo | Cambio |
|---|---|---|
| E1 | `packages/workout-engine/cardio-autolog.ts` (**nuevo**) | Motor puro y única fuente de la decisión: `decideCardioAutolog({reason, elapsedSec, closesRound})` → `{fillSeconds, submit, resetElapsed}` según la tabla de la SPEC; acumulador de reloj de pared (`createCardioElapsed` / `start` / `pause` / `read` / `reset`), que es lo que hace correcto el número con pausas y con fases por distancia (`durationSec: 0`); `intervalRoundOfPhase` y `intervalPhaseClosesRound` traducen fases a rondas de captura (`ronda = ceil(repeat / repeats)`, warmup ⇒ 1, cooldown ⇒ última); `cardioMinutesFromSeconds` y `cardioMinSeedValue` formatean la caja (coma decimal para el keypad es-CL). Export en `index.ts`. |
| E2 | `.../v3/useExecCountdown.ts` | Expone `elapsedSec` derivado y agrega listener de `visibilitychange`: al volver a la pestaña relee el fin absoluto y dispara `triggerDone()` si ya venció — espejo del re-sync por `AppState` de RN. `onDone` (que ya existía) no cambia de contrato. |
| E3 | `.../v3/useIntervalRunner.ts` | `advance(reason)` emite `onSegmentEnd({reason, phaseIndex})` **antes** de mover el índice y una sola vez por avance, también en la rama de fin de secuencia. Llamadores: tick ⇒ `expired`, `skip()` ⇒ `skipped`, `next()` ⇒ `manual-next`. El callback va por ref (patrón `onDoneRef`) para no re-armar el intervalo. |
| E4 | `.../v3/CardioStepV3.tsx` | El estado del auto-log sube al componente raíz: acumulador, conjunto de series ya enviadas y `{minutesSec, submit, nonce}`. Un único `handleSegment` consulta el motor; las caras solo avisan (`onSegment`, `onRunningChange`). `ContinuousFace` pasa `onDone` y `resetKey` por ronda (arregla de paso que la ronda 2 heredaba el «¡Listo!»); `IntervalFace` traduce el `phaseIndex` con `intervalPhaseClosesRound` y se remonta por ronda. |
| E5 | `.../workout/[planId]/LogSetForm.tsx` | Prop nueva `cardioAutolog?: {minutesSec, submit, nonce}`, documentada al lado de `holdPrefill`, con el **mismo** patrón uncontrolled: al cambiar el nonce escribe `cardio_min` y, si `submit`, dispara `formRef.current?.requestSubmit()`. No se toca `normalizeFormData`, ni `handleSubmit`, ni la cola offline, ni la reconciliación. |
| E6 | `apps/mobile/.../v3/timing.ts` | `useIntervalRunner` gana el mismo `onSegmentEnd`; `useCountdown` gana un `reset(seconds?)` que deja el reloj en el objetivo **detenido** (hoy solo hay `restart()`, que deja corriendo). |
| E7 | `apps/mobile/.../v3/CardioScreenV3.tsx` | Mismo `handleSegment` con el motor; siembra `cardio_min` mezclando el draft en vuelo (el remonte de la fila lo perdería) y, cuando corresponde enviar, arma el payload con `buildTypedPayload` + metadata de FC y llama al commit existente. Los tres heroes envuelven su `toggle`/`skip` y **esos mismos wrappers** se pasan como `controls` del timer vivo, así que los botones de la notificación entran por el mismo camino sin tocar el puente headless. |

**Tests.** **Nuevo** `packages/workout-engine/cardio-autolog.test.ts`, cubriendo la tabla completa:
las cinco razones × `closesRound`; `elapsed` 0 y negativo ⇒ no escribe ni envía; `restart` ⇒ resetea;
el acumulador (arranque, pausa, tramos sumados, reset, lectura sin arrancar); rondas sobre secuencias
reales de `buildIntervalSequence` (1×3, 4×2, con warmup y cooldown, y con fase por distancia); y el
formato de la caja con y sin coma decimal. Los hooks web se cubren con `renderHook` + timers falsos.
RN no lleva tests: toda su lógica nueva son llamadas al motor ya cubierto (y su QA es de device).

**Gate.** `pnpm exec vitest run packages/workout-engine/cardio-autolog.test.ts` + los tests de hook ·
eslint web sobre los archivos tocados · tsc web · tsc mobile.

**Tamaño.** 13,5–18,5 h (motor 2,5–3,5 · web 4,5–6 · RN 4,5–6 · QA 2–3). Deploy + OTA.

---

## F · Tarjeta de Share sin fondos, con contorno

| # | Archivo | Cambio |
|---|---|---|
| F1 | `apps/mobile/.../share/stickers/StrokedText.tsx` (**nuevo**) | Primitiva de contorno por copias apiladas: texto en flujo invisible que reserva la caja, ocho copias negras absolutas desplazadas por `transform` (nunca `left/top`: no re-dispara layout) y la copia blanca encima. Propaga `numberOfLines`, `ellipsizeMode` y `adjustsFontSizeToFit` a todas las copias (si difieren, el contorno se desalinea al truncar), fuerza `allowFontScaling={false}` (la tarjeta es una imagen de tamaño fijo) y oculta las copias de la accesibilidad. |
| F2 | `apps/mobile/.../share/stickers/sticker-kit.ts` | `OUTLINE_COLOR` compartido (negro al 92 %, no absoluto: un negro puro sobre foto oscura recorta la letra como calcomanía). Los neutros `W*` quedan documentados como paleta espejo aunque ningún sticker los use ya. |
| F3 | Los 9 stickers de datos | Fuera `backgroundColor`, `borderWidth`, `borderColor`, paddings de caja, separadores verticales, divisorias y la barra lateral de acento del set-list; todo texto a `#FFFFFF` + contorno escalado con `s()` (4 en la cifra héroe, 3 en texto grande, 2 en texto medio y chico). En el set-list —el más denso, 8 filas × 3 textos— las filas usan la variante barata (`Text` + sombra dura) y el contorno queda para título y totales: nueve copias por texto son ~225 nodos y no valen la pena ahí. Los emojis no llevan contorno. Se limpian los imports que quedan huérfanos. |
| F4 | `apps/mobile/.../share/share-presets.ts` | Reajuste de las posiciones normalizadas: cada sticker cambió de tamaño y el lienzo ancla por centro medido, así que los presets que usaban pills (`sello`, `setlist`) son los que más se mueven. |

**Sin cambios.** `MuscleBodySvg.tsx` (la silueta, único lugar donde vive el color del coach), el velo
inferior de la foto y los fondos de los modos `brand` y `transparent` (son el fondo de la tarjeta, no
de un dato), el fondo blanco del QR y el `collapsable={false}` del lienzo (sin él Android fusiona el
nodo y `captureRef` se queda sin qué rasterizar).

**Tests.** Ninguno unitario: es un cambio visual y `apps/mobile` no tiene runner. La verificación es
el harness `/dev-harness/share-canvas` (6 presets × 3 fondos) y el **PNG capturado** en device, con
una foto muy clara y una muy oscura. Si hace falta, se enriquece el mock del harness con un caso
extremo (nombre larguísimo, 8 ejercicios) para ver el contorno en truncado.

**Gate.** `pnpm --filter @eva/mobile exec tsc --noEmit` (el único gate que ve `apps/mobile`) ·
`pnpm check:tokens` (toca colores) · `pnpm test` para confirmar que no se movió nada más.

**Tamaño.** 5–7 h (3 h primitiva + stickers · 2 h presets · 1–2 h QA de device). OTA.

---

## G · Destinos de Share en Android: avisos visibles y sin pre-gate

| # | Archivo | Cambio |
|---|---|---|
| G1 | `apps/mobile/.../share/WorkoutShareComposer.tsx` | Banner de aviso **dentro** de la ventana del composer (absoluto sobre la barra de destinos, auto-dismiss ~4 s, iconos del DS). Es la pieza que desbloquea el diagnóstico de todo lo demás: hoy cada `toast` se pinta en la ventana raíz, detrás del Modal del host. |
| G2 | `apps/mobile/.../share/share-targets.ts` | `ShareTargetResult` gana `notice?: {kind, text}` y las funciones dejan de llamar al singleton de toast: la UI decide qué mostrar, que es el contrato que el archivo ya declara en su header. Se borran los tres pre-gates `isTargetInstalled` (y la función, que queda huérfana): el único camino de decisión pasa a ser el `try { shareSingle } catch { shareToSheet }` que ya existía. Cada `fallback` devuelve su aviso honesto («No pudimos abrir Instagram — te abrimos las opciones de compartir»). |
| G3 | `share-targets.ts` · `saveToGallery` | El éxito viaja como `notice` visible; el rechazo distingue «se puede volver a pedir» de «bloqueado» (con salida a ajustes) y conserva el `Alert.alert`; el `catch` deja de tragar el error y, si `saveToLibraryAsync` falla, reintenta con `createAssetAsync` antes de declarar error (hay OEM con rutas distintas). |

**Verificación previa que hay que hacer y reportar.** (i) ¿«Guardar» ya funcionaba y el único bug era
el aviso invisible? (ii) ¿El `<queries>` de `react-native-share` está en el binario 1.1.2
(`adb shell dumpsys package cl.evaapp.eva | grep -i queries`)? El `/android` local es un artefacto de
prebuild viejo y **no** sirve como evidencia. En cualquier caso, quitar el pre-gate hace que la
respuesta deje de importar para abrir Instagram o WhatsApp ⇒ **no se necesita build 1.1.3**.

**Tests.** Ninguno unitario (misma razón que F). QA de device Android con y sin Instagram/WhatsApp
instalados, más «Guardar» abriendo la galería después.

**Gate.** tsc mobile · `pnpm test` de control.

**Tamaño.** 4–6 h. OTA.

---

## H · Catálogo compartido + selector por región en RN

| # | Archivo | Cambio |
|---|---|---|
| H1 | `packages/workout-engine/muscle-catalog.ts` (**nuevo**) | Fuente única: `MUSCLE_SECTIONS` (empuje · tirón · core · tren inferior · cardio · movilidad, más `Rehabilitación`), `MUSCLE_GROUPS_FLAT` derivada, `muscleSectionFor(group)` y el catálogo de equipo con los valores en inglés del sistema. Export en `index.ts`. |
| H2 | `apps/web/src/lib/constants.ts` · `apps/mobile/lib/exercises.ts` | Pasan a **re-exportar** de `@eva/workout-engine` (mismo patrón que ya usan con `@eva/tiers`), sin tocar los ~10 call sites. Con esto `Movilidad` aparece en RN. **No** se borra `MUSCLE_MAPPING` de `constants.ts` (lo usa otra lógica). |
| H3 | `apps/mobile/components/coach/ExerciseFormSheet.tsx` | El campo «Grupo muscular» deja de ser la nube de `Chips`: pestañas de región + pills de la región activa (opción B del mockup `c4a77ab0`), con la región del valor guardado preseleccionada. «Equipo» pasa al catálogo compartido. Se mantiene todo dentro del `BottomSheetScrollView` de la hoja: no se anida un `Modal` de RN dentro del `BottomSheetModal` de gorhom (no hay precedente en el repo y el riesgo es que se cierre la hoja al cerrar el picker). |
| H4 | Regla de valor legado (RN + web) | Si el valor guardado no está en el catálogo, se inyecta como opción extra al final y queda seleccionado. Cubre `Rehabilitación` y los `equipment` en inglés, y evita corromper en silencio filas de sistema al editarlas. |
| H5 | `apps/web/.../exercises/_components/ExerciseFormModal.tsx` (opcional) | Agrupar los `SelectItem` por región con `SelectGroup` + `SelectLabel`, sin cambiar el `name` ni el valor enviado. Cosmético; va al final. |

**Tests.** **Nuevo** `packages/workout-engine/muscle-catalog.test.ts`: `MUSCLE_GROUPS_FLAT` sin
duplicados; partición exacta entre secciones y lista plana; los valores de fuerza siguen mapeando a
una región vía `muscleGroupToRegion` (guardia contra `muscle-map.ts`); y el catálogo de equipo
contiene los valores que la DB realmente guarda. Verificar que
`apps/web/src/app/c/[coach_slug]/workout/[planId]/muscle-map.test.ts` no asuma un largo fijo de la
lista. En las actions web, un caso de que un valor fuera de catálogo pasa la validación.

**Gate.** `pnpm exec vitest run packages/workout-engine apps/web/src/app/coach/exercises` · eslint ·
tsc web · tsc mobile · `pnpm check:tokens` si se tocan estilos del DS.

**Tamaño.** 6–8 h (catálogo 2–3 · selector RN 3 · equipo y valor legado 1 · web opcional 0,75 ·
tests 1,5). OTA (+ deploy si se hace H5).

---

## I · Guard de salida del builder

| # | Archivo | Cambio |
|---|---|---|
| I1 | `packages/plan-builder/exit-guard.ts` (**nuevo**) | `shouldConfirmExit({dirty, saving})` (guardando **no** se pregunta), `builderBackHref(clientId)` y los cuatro copys (`EXIT_GUARD_TITLE` / `BODY` / `STAY` / `LEAVE`). El cuerpo dice la verdad sobre el autosave: «Se conservan como borrador en este dispositivo, pero no quedan en el programa». Voz en tuteo, como el resto del builder. Export en `packages/plan-builder/index.ts`. |
| I2 | `apps/mobile/app/coach/program-builder.tsx` | `requestExit()` consulta el motor y, si hay que preguntar, abre el `Alert.alert` con los copys compartidos; la flecha ← lo usa; el back de hardware se engancha con `BackHandler` dentro de `useFocusEffect` (los listeners son globales y LIFO: uno vivo sin foco se comería el back de la pantalla de encima); el gesto de swipe-back de iOS se desactiva mientras haya cambios (`navigation.setOptions({gestureEnabled})`), degradación explícita y comentada. **No** se toca `closeSavedOverlay` ni las salidas de error (ahí no hay nada que perder). |
| I3 | `apps/web/.../builder/[clientId]/WeeklyPlanBuilder.tsx` | `beforeunload` gateado por el mismo motor; la flecha ← deja de ser un `<Link>` y pasa por el `AlertDialog` del DS con el href pendiente en estado. Cubre las **dos** rutas (builder por alumno y builder de plantillas) porque es el mismo componente. La no-intercepción del «atrás» del navegador queda escrita como limitación aceptada, con el autosave como respaldo real. |

**Tests.** **Nuevo** `packages/plan-builder/exit-guard.test.ts`: `dirty=false` ⇒ no confirma;
`dirty=true` ⇒ confirma; `saving=true` ⇒ no confirma; href con y sin alumno; y los copys no vacíos y
distintos entre sí. Un solo test cubre las dos plataformas, que es el punto de bajarlo al paquete.
No se testea `beforeunload` en jsdom (no dispara el diálogo): alcanza con verificar el alta y la baja
del listener. **Sin** spec de Playwright contra producción para esto.

**Gate.** `pnpm exec vitest run packages/plan-builder` · eslint web sobre el builder · tsc web ·
tsc mobile.

**Tamaño.** 5–6 h. Deploy + OTA.

---

## J · Guardián de deploy skew

| # | Archivo | Cambio |
|---|---|---|
| J1 | `apps/web/src/lib/deploy-skew.ts` (**nuevo**) | `isDeploySkewError(value)` reconoce los patrones de texto **y** el marcador interno `__NEXT_ERROR_CODE === 'E394'` (señal independiente del texto, que cambia entre versiones de Next; `E715` no matchea, con test explícito). `shouldReload(now, storage)` **marca y decide en el mismo paso**: los dos listeners pueden ver el mismo fallo y sin marca atómica se agendaban dos recargas. Sin storage ⇒ `false`. Ventana de 2 min. Marca en el futuro (reloj movido) cuenta como reciente ⇒ no recarga; marca corrupta ⇒ recarga. |
| J2 | `apps/web/instrumentation-client.ts` | El handler viejo se consolida sobre el motor nuevo en vez de convivir con él: un solo `recoverFromDeploySkew` alimenta los tres caminos (`error`, `unhandledrejection` con `preventDefault` solo cuando efectivamente agenda, y `beforeSend`, que es el único que ve los errores atrapados por un error boundary). Agenda la recarga con 300 ms de gracia para que el evento salga, deja breadcrumb y `captureMessage('deploy_skew_reload', level info, fingerprint fijo)`, y **devuelve `null` en `beforeSend`** cuando recuperó: el skew recuperado deja de contar como error del producto. Si **no** recupera (segunda vez en la ventana = deploy roto de verdad, o storage bloqueado), se reporta como siempre. |

**Tests.** `apps/web/src/lib/deploy-skew.test.ts` (12 casos): los tres patrones de texto, el marcador
`E394`, `E715` negativo, valores no-error, primera recarga, segunda dentro de la ventana, fuera de la
ventana, sin storage, marca corrupta y marca en el futuro.

**Gate.** `pnpm exec vitest run apps/web/src/lib/deploy-skew.test.ts` (12/12 verdes en la corrida
real) · eslint web · tsc web.
**Verificación post-deploy:** que `EVA-NEXTJS-3` / `-19` bajen y que aparezca el issue `info`
`deploy_skew_reload`.

**Tamaño.** 2–3 h. Deploy de Vercel.

---

## Gates de la tanda

Proporcionales por hallazgo (los de arriba) y **una sola pasada completa antes de cualquier push**:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm check:tokens
pnpm docs:check
pnpm build          # una vez, antes de entregar
```

No se corren gates de `apps/enterprise` (congelada). **Nada se declara verde sin ejecución real.**

## Riesgos

- **R1 · Nueve workers sobre el mismo árbol.** Cada uno toca solo sus archivos y anota los ajenos; el
  jefe hace la pasada de juicio y los merges. Ningún worker commitea, pushea ni lanza OTA.
- **R2 · B puede romper los `og:*`.** Declarar un `openGraph` parcial en una page reemplaza el del
  layout en vez de mezclarse. Por eso el fix vive en el layout y la verificación por `curl` de que
  siguen estando **todos** los tags es obligatoria.
- **R3 · E · envío involuntario.** El auto-envío escribe en la base sin confirmación. Mitigación:
  guard por serie activa, conjunto de enviadas y `elapsed > 0`; el alumno siempre puede corregir la
  serie después por el camino existente. **No** se agrega un «deshacer» nuevo: en v3 la snackbar se
  eliminó a propósito.
- **R4 · E · remonte de la fila en RN.** Sembrar la caja remonta la fila y se lleva lo que el alumno
  estuviera tipeando: por eso la semilla mezcla el draft en vuelo. Verificar explícitamente en QA.
- **R5 · F · los presets se descolocan.** Es consecuencia mecánica de quitar paddings y bordes con
  anclaje por centro medido; el reajuste en el harness no es opcional.
- **R6 · G · el `<queries>` del binario no se puede probar desde el repo.** Se verifica en device; el
  fix está diseñado para que la respuesta no cambie el plan.
- **R7 · H · anidar el picker en la hoja.** No hay precedente de un `Modal` de RN dentro de un
  `BottomSheetModal` de gorhom: por eso el selector se resuelve in-place, sin ventana nueva.
- **R8 · J · `preventDefault` no calla a Sentry.** Sentry engancha su propio `unhandledrejection`; lo
  que evita el ruido es el `return null` del `beforeSend` cuando ya se agendó la recarga.
- **R9 · WhatsApp cachea la preview 72 h+ por URL en el teléfono.** Cualquier QA de B con la misma URL
  da falso negativo: hay que compartir una URL nueva.
