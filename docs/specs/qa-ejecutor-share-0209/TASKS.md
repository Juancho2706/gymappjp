---
status: implemented-pending-qa
owner: product-engineering
last_verified: "2026-09-02"
canonical: false
---

# TASKS — QA del owner 02-09: ejecutor, Share Entreno y accesos (A–J)

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md). Estado: **EN CURSO** — nueve workers en paralelo sobre el
mismo árbol, con pasada de juicio del jefe entre olas. **Ningún checkbox se marca solo**: los marca
el jefe cuando el gate corrió de verdad y el owner dio su QA. Nada de esto está commiteado, pusheado
ni desplegado.

## W0 · Decisiones del owner (2026-09-02)

- [x] W0.1 Mockup del selector de grupo muscular RN aprobado: artifact `c4a77ab0`, **opción B**
      (pestañas de región + pills), no dropdown.
- [x] W0.2 Preview de WhatsApp: **solo el logo del coach sobre su color**, sin nombre, sin tagline y
      sin sello EVA dentro de la imagen (reemplaza la decisión del 22-08).
- [x] W0.3 Notificaciones: la causa fue el **permiso negado**, confirmado por el owner. «No molestar»
      queda como limitación documentada; no se pide bypass de DND.
- [x] W0.4 Cardio: termina solo ⇒ rellena, envía y avanza; pausa o salto ⇒ solo rellena. La ronda
      siguiente **no** auto-arranca.
- [x] W0.5 Tarjeta de Share: contorno en vez de fondos; el color del coach solo en la silueta.
- [x] W0.6 Builder: se pregunta al salir en las dos plataformas, con copy honesto sobre el autosave.
- [x] W0.7 Listas de ejercicios unificadas con `Movilidad` y `Rehabilitación`; «Equipo» en inglés.

## A · `/join/<CÓDIGO>` en el parser

- [x] A1 `packages/schemas/coach-identifier.ts`: `IDENTIFIER_ROUTES` con `join`, `candidateFromQuery`
      y su uso en las dos ramas URL de `extractCandidate`. Sin filtrar host (comentado por qué).
- [x] A2 `apps/mobile/lib/coach-identifier-form.ts`: kind `'clipboard'` con copy propio +
      `resolveClipboardIdentifier`. Cero imports de React Native en el módulo.
- [x] A3 `apps/mobile/components/entry/CoachIdentifierForm.tsx`: el botón escribe el identificador
      extraído (no la URL), el chip «Pegar» no castiga al que tipea, etiqueta «Pegar mi enlace de
      invitación», `testID` y estilos intactos.
- [x] A4 Tests: +9 válidos y +7 inválidos en `coach-identifier.test.ts`; **nuevo**
      `tests/mobile/coach-identifier-form.test.ts` con el caso exacto del owner y el test de contrato
      emisor↔parser (`studentJoinUrl` ↔ `parseCoachIdentifier`).
- [x] A5 `native-intent.test.ts` y `applinks-claims.test.ts` verdes **sin tocarlos**.
- [ ] A6 Rama opcional `eva://join/<código>` en `+native-intent.ts` (si no se hace, queda anotada).

## B · Preview de WhatsApp

- [x] B1 `apps/web/src/lib/coach-og-image.ts`: composición pura (`resolveCoachOgArtwork`,
      `coachOgFallbackArtwork`, `safeHexColor`, `isDarkBackground`, `coachOgBrandNameFontSize`),
      `coachOgImageVersion` y `buildCoachOgPngResponse` con `Content-Length`.
- [x] B2 `api/og/[coach_slug]/route.tsx`: dibuja y `await`-ea el buffer ⇒ el fallback sin logo **corre
      de verdad**; se conservan `runtime = 'nodejs'` y la URL absoluta del ícono EVA.
- [x] B3 `c/[coach_slug]/layout.tsx`: `?v=` derivado de logo/logo dark/color/nombre + `secureUrl`.
      **No** se declara `openGraph` parcial en `login/page.tsx`.
- [x] B4 **Nuevo** `apps/web/src/lib/coach-og-image.test.ts` (el caso que blinda el header es el que
      compara `Content-Length` con el largo real del cuerpo).
- [ ] B5 Verificación post-deploy: `curl -I` con UA de WhatsApp trae `Content-Length` y no `chunked`;
      el HTML del login conserva **todos** los `og:*`; prueba en teléfono con una URL nunca compartida.
- [ ] B6 Probar un coach con logo y otro sin logo (las dos ramas del arte).

## C · Despegue sin logo

- [x] C1 `apps/web/src/lib/workout/exec-launch-brand.ts`: fallback a nivel documento cuando el
      trigger vive en un portal; `LAUNCH_BRAND_FALLBACK_LOGO` exportado; `ownLogo` sin cambios de
      semántica.
- [x] C2 `WorkoutLaunchMorph.tsx`: cadena `logo → inicial → ícono EVA`, fuera el ▶.
- [x] C3 **Nuevo** `tests/exec-launch-brand.test.ts`, 5 casos con la regresión del portal (falla hoy,
      pasa con el fix).
- [x] C4 Verificar que `SessionIntro` sigue compilando y que no se le mete el ícono EVA a su avatar.
- [ ] C5 Limpieza opcional: borrar la escritura muerta de `eva:exec-v3-morph-logo`.

## D · Permiso de notificaciones en el ejecutor v3

- [x] D1 **Nuevo** `packages/workout-engine/notif-permission.ts` + export en `index.ts`.
- [x] D2 **Nuevo** `apps/web/src/lib/client/use-notification-permission.ts` (confirmación por service
      worker, nunca `new Notification()`).
- [x] D3 Fila «Avisarme al terminar el descanso» en el `ExecSettingsSheet` **web**, con `Toggle`
      deshabilitado cuando no hay acción posible.
- [x] D4 Fila «Temporizador en la pantalla bloqueada» en el `ExecSettingsSheet` **RN**, con «Abrir
      ajustes» en el bloqueo duro y relectura en `AppState` `active`.
- [x] D5 Tests: `notif-permission.test.ts` (4 estados × 2 superficies) y
      `use-notification-permission.test.ts`.
- [x] D6 No se toca `RestTimer.tsx`, ni `live-timer-notification.ts`, ni ningún id de canal.
- [ ] D7 Documentar la limitación de DND (y la de la PWA sin cronómetro vivo) donde el owner la vea.

## E · Cardio: auto-relleno y auto-registro

- [x] E1 **Nuevo** `packages/workout-engine/cardio-autolog.ts` + export en `index.ts`.
- [x] E2 `useExecCountdown`: `elapsedSec` + re-sync por `visibilitychange`.
- [x] E3 `useIntervalRunner` (web): `onSegmentEnd({reason, phaseIndex})` emitido una vez por avance,
      antes de mover el índice, también al terminar la secuencia.
- [x] E4 `CardioStepV3`: estado del auto-log en el raíz, `handleSegment` único, `resetKey` por ronda
      y remonte del runner por ronda.
- [x] E5 `LogSetForm`: prop `cardioAutolog` con el patrón uncontrolled de `holdPrefill` +
      `requestSubmit()`; nada del motor de guardado se duplica.
- [x] E6 `timing.ts` (RN): `onSegmentEnd` en el runner y `reset(seconds?)` en el countdown.
- [x] E7 `CardioScreenV3`: acumulador, semilla con el draft en vuelo, commit con `buildTypedPayload`
      y los tres heroes envolviendo `toggle`/`skip` (los mismos wrappers van como `controls` del
      timer vivo ⇒ los botones de la notificación quedan cubiertos sin tocar el puente).
- [x] E8 **Nuevo** `packages/workout-engine/cardio-autolog.test.ts` (tabla completa + acumulador +
      rondas sobre secuencias reales + formato de la caja).
- [x] E9 Tests de hook web (`useExecCountdown`, `useIntervalRunner`) con timers falsos.
- [ ] E10 QA: continuo 3 rondas (termina sola ⇒ ✓ y ronda 2 en 30:00 detenido; pausa a los ~40 s ⇒
      rellena y no envía); intervalos 4×(1:00/0:30) con 2 rondas; última ronda ⇒ avanza de ejercicio;
      bloque por distancia; RN en background; pausa desde la notificación; regresión de movilidad,
      roller y fuerza.

## F · Tarjeta de Share sin fondos

- [x] F1 **Nuevo** `StrokedText.tsx` (copias apiladas, `transform`, props propagadas a todas las
      copias, sin font scaling, fuera de la accesibilidad).
- [x] F2 `sticker-kit.ts`: `OUTLINE_COLOR` y neutros documentados.
- [x] F3 Los 9 stickers de datos sin fondos, bordes, separadores ni divisorias; todo blanco +
      contorno escalado; emojis sin contorno; imports huérfanos limpiados.
- [x] F4 El acento sale de todo lo que no sea la silueta (chips, título del set-list, barra lateral,
      eyebrow del volumen, `@handle`).
- [x] F5 `share-presets.ts` reajustado: 6 presets × 3 fondos sin solapes ni recortes.
- [ ] F6 QA en `/dev-harness/share-canvas` + entreno real con foto clara y foto oscura, mirando el
      **PNG capturado**, no el preview.
- [ ] F7 Reportar las tres decisiones abiertas (ámbar del récord, ember de la racha, halo del fondo
      `brand`) tal como quedaron.

## G · Destinos de Share en Android

- [x] G1 Banner de aviso dentro de la ventana del composer (los toasts del root son invisibles ahí).
- [x] G2 `ShareTargetResult.notice` + `share-targets.ts` deja de llamar al singleton de toast.
- [x] G3 Fuera los tres pre-gates `isTargetInstalled` (y la función huérfana): el `catch` del intento
      directo es el único camino de decisión.
- [x] G4 Cada `fallback` devuelve su aviso honesto; el guard de `FACEBOOK_APP_ID` se conserva.
- [x] G5 `saveToGallery`: éxito visible, permiso denegado vs. bloqueo duro, `catch` que no se traga el
      error y reintento con `createAssetAsync`.
- [ ] G6 Verificar en device: ¿«Guardar» ya funcionaba? ¿está el `<queries>` en el binario 1.1.2?
- [ ] G7 QA con y sin Instagram/WhatsApp instalados; «Más…» debe seguir igual.

## H · Catálogo compartido y selector por región

- [x] H1 Taxonomía `MUSCLE_GROUP_REGIONS` + catálogo canónico en `packages/workout-engine/muscle-map.ts` (no archivo nuevo: `muscle-catalog` chocaba con `MUSCLE_REGIONS` de la silueta).
- [x] H2 `apps/web/src/lib/constants.ts` y `apps/mobile/lib/exercises.ts` re-exportan del paquete;
      `MUSCLE_MAPPING` intacto.
- [x] H3 `ExerciseFormSheet.tsx` (RN): pestañas de región + pills, resueltas in-place dentro de la
      hoja (sin anidar un `Modal` en el `BottomSheetModal`).
- [x] H4 «Equipo»: etiquetas en ESPAÑOL (la UI es en español) que marcan los valores en inglés del catálogo de sistema vía sinónimos (decisión del jefe 02-09; el AC se reescribió).
- [x] H5 Regla de valor legado (RN + web): lo guardado fuera de catálogo se ofrece y queda marcado.
- [x] H6 **Nuevo** `packages/workout-engine/muscle-catalog.test.ts` (sin duplicados, partición
      exacta, regiones intactas, equipo real).
- [x] H7 Opcional: agrupar por región el `Select` de web con `SelectGroup` + `SelectLabel`.
- [ ] H8 QA en device: Android e iOS, claro y oscuro, «Nuevo» y «Editar», con teclado abierto y
      cerrado; editar un ejercicio de `Movilidad` y uno de `Rehabilitación`.

## I · Guard de salida del builder

- [x] I1 **Nuevo** `packages/plan-builder/exit-guard.ts` (decisión + copys + href) y export.
- [x] I2 RN: `requestExit()`, flecha ←, `BackHandler` dentro de `useFocusEffect`, gesto de swipe
      desactivado mientras haya cambios. No se toca `closeSavedOverlay` ni las salidas de error.
- [x] I3 Web: `beforeunload` + `AlertDialog` del DS en la flecha (cubre builder por alumno y builder
      de plantillas: es el mismo componente). Limitación del «atrás» del navegador comentada.
- [x] I4 **Nuevo** `packages/plan-builder/exit-guard.test.ts` (un solo test cubre las dos
      plataformas).
- [ ] I5 QA: Android (flecha, hardware back, gesto), iOS (flecha, swipe inerte con cambios), web
      (flecha, F5, cerrar pestaña) y, en todos, que después de guardar no pregunte nada.

## J · Guardián de deploy skew

- [x] J1 **Nuevo** `apps/web/src/lib/deploy-skew.ts` (`isDeploySkewError` con `E394`, `shouldReload`
      que marca y decide en el mismo paso, ventana de 2 min, sin storage ⇒ no recarga).
- [x] J2 `instrumentation-client.ts` consolidado sobre el motor nuevo: un solo camino para `error`,
      `unhandledrejection` y `beforeSend`, con `return null` cuando ya recuperó.
- [x] J3 `apps/web/src/lib/deploy-skew.test.ts` (12 casos, incluido `E715` negativo).
- [ ] J4 Post-deploy: ver caer `EVA-NEXTJS-3` / `-19` y aparecer el issue `info`
      `deploy_skew_reload`.

## Gates (corridos 02-09 05:0xZ sobre `0f545926`: vitest 8622/8622 · tsc web y mobile 0 · eslint 0 errores nuevos (1 `react/display-name` preexistente en program-builder) · docs:check · tokens · boundaries — todos verdes)

| Gate | Estado |
|---|---|
| `pnpm exec vitest run` (suite completa) | verde 02-09 05:0xZ sobre `0f545926` (8622/8622) y 06:2xZ sobre `99f884f8` (8641/8641) |
| `pnpm lint` (eslint de los archivos tocados, web + mobile + packages) | 0 errores nuevos (1 `react/display-name` preexistente en `program-builder.tsx`) |
| `pnpm typecheck` (web) | verde (0) en ambas rondas |
| `pnpm --filter @eva/mobile exec tsc --noEmit` | verde (0) en ambas rondas |
| `pnpm check:tokens` · `pnpm check:nutrition-v2-boundaries` · `pnpm docs:check` | verdes |
| `pnpm build` | no corrido local: el deploy de Vercel (`dpl_35ZT6w7oLzBrnMEAsXjmVQVdCy2R` y el de `99f884f8`) construyó en verde |

## QA del owner (02-09, contra `0f545926` desplegado + OTA `bd2bc6e8`/`025d158f`)

- [x] Q1 Web: miniatura de WhatsApp con URL nueva (`?v=3`) ⇒ salió; el owner pidió **solo el logo, sin el
      color del coach** ⇒ ronda 2 (`0cc53f41`, fondo neutro).
- [x] Q2 Web: Despegue con logo desde «Repetir hoy» / «Revisar y editar» (owner). Además reportó el
      **loader naranja** al entrar al login del alumno ⇒ ronda 2 (`54c26ea4`): el login no muestra loader
      de marca y manifest/splash/theme-color usan el color efectivo del preset.
- [x] Q3 Device: fila de notificaciones en Ajustes del entreno («Activado» en el Xiaomi del owner).
- [x] Q4 Device: cardio continuo e intervalos, termina solo / pausa (owner: «pasó»).
- [x] Q5 Device: tarjeta de Share, Stories/WhatsApp/Guardar (owner: «pasó»); **pellizcar un sticker al
      máximo lo hacía desaparecer** ⇒ ronda 2 (`99f884f8`, OTA android `fc78e1c8` / ios `c46d4eed`) — **re-verificar en device**.
- [x] Q6 Device: hoja de ejercicio con el selector por región (owner: «pasó»).
- [x] Q7 Device + web: salir del builder con y sin cambios (owner: «pasó»; en Android el gesto de volver
      también pregunta — mismo evento que el botón).

### QA automatizado de las listas 5-7 (Playwright, 1 navegador, 02-09 06:0xZ)

Informe y 122 capturas en `C:/Users/juanm/.claude/jobs/c69fb9b6/tmp/qa0209/r2-qa-web.md` y `pw/`. 22 pasos OK, 2
fallas, 6 no cubiertos. Escrituras solo sobre un coach descartable `@evatest.cl` creado por
`register-coach-free` y borrado por Danger Zone (verificado por SQL: sin coach, alumno ni check-in); `evademo` solo
lectura. No cubierto: `/register` web (Turnstile fail-closed), workspace Team (no hay uno de prueba), «ESTO ESTÁ
TARDANDO» (flaky), lista 7 con `evademo` (sin contraseña a mano). Hallazgos (backlog, ninguno de esta tanda):

- B1 «apagar Nutrición en Funciones no le quita el tab al alumno» — **comportamiento esperado** desde la Ola de
  orden W1.10 (D9: siempre-on para el alumno); los comentarios de `ClientNavGates.tsx:42-50` quedaron viejos (XS).
- B2 Check-in web: al perder la red en el paso 3, la pantalla global «Sin conexión» reemplaza al asistente y al
  volver se pierden peso/foto/notas; el estado «No pudimos enviar / Reintentar» de `CheckInForm.tsx:763-791` es
  inalcanzable (M).
- B3 En 390×844 la barra flotante tapa el CTA «Eliminar cuenta» de Danger Zone (`elementFromPoint` = nav): falta
  padding inferior (XS).
- B4 Copy «Límite de 1 alumnos alcanzado» (`AddStudentStepper.tsx:400`, `CreateClientModal.tsx:207`) (XS).
- B5 Títulos «Alumnos | EVA | EVA», «Aprender | EVA | <marca>»: el `title` ya trae `| EVA` y el layout lo vuelve a
  aplicar (XS).
- B6 Switches de `DomainsCard.tsx:210-217` sin nombre accesible (label envolviendo un `button` de Radix) (XS).
- B7 Al borrar la cuenta quedan los 4 correos del drip `scheduled` en Resend (el QA suprimió las direcciones) (S).
- B8 `?status=archived` no filtra el directorio de alumnos (XS).
- B9 El banner «Verifica tu correo» es inalcanzable con `persona = null` (el gate redirige antes) (S).

## Pendientes declarados

- [x] P1 Docs canónicos: `MOBILE_PARITY.md`, `CURRENT.md`, `MOBILE_RELEASES_OTA.md` (02-09).
- [x] P2 Salida: commits por ítem, push a `rnmobiledenuevo` + `master`, deploy de Vercel y OTA android + iOS
      (`bd2bc6e8`/`025d158f` ronda 1, `fc78e1c8`/`c46d4eed` ronda 2).
- [ ] P3 Responder las seis decisiones abiertas de la [SPEC](SPEC.md).
- [ ] P4 Re-verificar en device el pellizco al máximo en Share (ronda 2) y, en web, que el login del alumno entre
      sin loader ni naranja ⇒ marcar la SDD `done`.
- [ ] P5 Superficies que aún leen `primary_color` crudo: `api/pwa-screenshot/[coach_slug]/route.tsx:74`,
      `pr-card` (`:134-141`), `nutrition-pdf-brand.ts:141` — pasarlas por `resolveEffectiveBrandColor` (S).
- [ ] P6 Backlog B2–B9 del QA automatizado (arriba).
