---
status: done
owner: product-engineering
last_verified: "2026-09-02"
canonical: false
---

# SPEC — QA del owner 02-09: ejecutor, Share Entreno y accesos (A–J)

> **CERRADA — 2026-09-02.** Las dos rondas están en producción (web `ad6886bf`, OTA 1.1.2 android
> `fc78e1c8` / ios `c46d4eed`) y el owner dio el QA verde en device, incluida la re-verificación
> del pellizco de stickers y del login del alumno sin loader (P4). Quedan el backlog B2–B9 del QA
> automatizado (auditado contra HEAD el 02-09, ver TASKS) y las seis decisiones abiertas de abajo.
> Lo que sigue es el texto original de la tanda.
>
> **EN CURSO — 2026-09-02.** Diez hallazgos del QA del owner sobre producción (`master` =
> `rnmobiledenuevo`, HEAD del análisis `bd29a76d`), investigados en ocho briefs read-only y
> ejecutados por nueve workers en paralelo sobre el mismo árbol. Nada está cerrado ni desplegado:
> los checkboxes de [TASKS](TASKS.md) los marca el jefe recién con los gates reales y el QA del
> owner en device. Mockup aprobado del selector de grupo muscular RN: artifact `c4a77ab0`.
> Todo es JS/TS: la web sale por deploy de Vercel y RN por **OTA sobre el runtime 1.1.2**
> (ningún hallazgo exige build nativo 1.1.3).

## Problema

El QA del owner del 02-09 recorrió el camino completo del alumno (entrar con el enlace del coach →
despegue → ejecutor v3 → cardio → resumen → compartir) y el del coach (builder, ejercicios propios).
Salieron diez fallas de distinta naturaleza que comparten un patrón: **el flujo feliz funciona y los
caminos laterales —el que llega por un link, el que abre desde una hoja, el que pausa el timer, el
que sale sin guardar— caen en un fallback mudo**. Ninguna es un crash: por eso ninguna estaba en
Sentry, y por eso todas se ven como «no hace nada».

| # | Hallazgo | Superficie | Síntoma en una línea | Sale por |
|---|---|---|---|---|
| A | Enlace `/join/<CÓDIGO>` | RN + `packages/schemas` | Pegar el link que el coach reparte da «Revisa el dato» | OTA |
| B | Preview de WhatsApp | web | El link del alumno se comparte sin miniatura | deploy |
| C | Despegue sin logo | web | Desde la hoja «Repetir hoy» sale un ▶ genérico en vez del logo | deploy |
| D | Notificaciones del descanso | RN + web | «No hay notificaciones»: permiso negado y sin forma de recuperarlo | OTA + deploy |
| E | Cardio: auto-relleno y auto-registro | RN + web | El timer termina y hay que escribir a mano los minutos ya medidos | OTA + deploy |
| F | Tarjeta de Share con fondos | RN | Cajas y pills tapan la foto; el color del coach está por todos lados | OTA |
| G | Destinos de Share en Android | RN | «Stories», «WhatsApp» y «Guardar» parecen no hacer nada | OTA |
| H | Grupo muscular en RN | RN + `packages/workout-engine` | Nube de ~17 pills; «Movilidad» ni siquiera aparece | OTA |
| I | Salir del builder | RN + web | Se sale con cambios sin guardar y sin preguntar | OTA + deploy |
| J | Deploy skew (E394) | web | La pestaña abierta durante un deploy pierde la acción con un error opaco | deploy |

---

## A · El parser de identificador de coach no entiende `/join/<CÓDIGO>`

**Síntoma.** Un alumno pega en «Código de tu coach»
`https://www.eva-app.cl/join/CRDZ9?ref=…&src=share_card&k=placa` —el link que su coach le mandó por
WhatsApp— y recibe «Revisa el dato. El código tiene 5 caracteres; también puedes pegar el enlace
completo.» La segunda mitad de ese mensaje es falsa para el enlace más repartido del producto.
Además el botón «Abrir mi enlace de invitación» no abre nada: pega el portapapeles crudo en un input
mono de 19 pt con `letterSpacing 2.47`, así que el owner solo vio la cola de la URL
(«…are_card&k=placa»).

**Causa raíz.** `packages/schemas/coach-identifier.ts:79-88` (`candidateFromPath`) tiene una
allowlist de rutas de dos entradas:
`if ((route !== 'c' && route !== 'invite') || !segments[1]) return null`. `/join` cae en `null` ⇒
`{ type: 'invalid' }` ⇒ `fail('format')` con el copy de `apps/mobile/lib/coach-identifier-form.ts:25`.
Pero `/join/<CÓDIGO>` es exactamente lo que EVA reparte:
`apps/mobile/lib/student-links.ts:60-62` (`studentJoinUrl`),
`apps/mobile/components/alumno/share/build-share-data.ts:168-171`,
`apps/mobile/components/alumno/share/share-targets.ts:150` (copia al portapapeles con `&k=`),
`apps/web/src/app/coach/team/_components/TeamShareLink.tsx:58` y
`apps/web/src/app/org/[slug]/coaches/_components/CoachQRButton.tsx:16` (QR del coach). El deep link
interno de la propia app viaja como `?identifier=` (`apps/mobile/app/+native-intent.ts:16,29`) y
tampoco parseaba. El botón fantasma es
`apps/mobile/components/entry/CoachIdentifierForm.tsx:196-205` (`setValue(clip)` + `submit(clip)`,
sin extraer nada del clip).

**Criterios de aceptación.**

- AC-A1 `parseCoachIdentifier` acepta `/join/<código>` con y sin esquema, con y sin `www`, en
  mayúsculas o minúsculas, con query y fragment, y con esquema `eva://`.
- AC-A2 Un `/join/<slug>` sigue resolviendo como slug; `?identifier=` / `?code=` resuelven por query.
- AC-A3 `/join` sin segundo segmento, `/t/<equipo>`, `/org/<slug>` y las rutas internas siguen
  inválidos: la allowlist se abre en una sola ruta, no en un comodín.
- AC-A4 El botón escribe en el campo el identificador **ya extraído y normalizado** (`CRDZ9`), nunca
  la URL entera; el portapapeles vacío o sin enlace EVA da un mensaje propio, distinto del de formato.
- AC-A5 Un código de equipo u organización sigue cayendo en `not-found` («No encontramos ese
  coach…»), que es un error honesto: el cliente no resuelve scopes.

---

## B · La preview de WhatsApp del link del alumno sale sin imagen

**Síntoma.** Compartir `https://www.eva-app.cl/c/josefit/login` por WhatsApp Android muestra título
(«Jose Fit»), descripción y dominio, pero **sin miniatura**. WhatsApp sí bajó y parseó el HTML: falló
solo al traer o aceptar la imagen.

**Causa raíz.** Medido con `curl` y UA de WhatsApp contra producción el 02-09:
`/api/og/josefit` responde `200`, `image/png`, 73.600 B **sin `Content-Length` y con
`Transfer-Encoding: chunked`** — tampoco en `HEAD`. El og estático de la raíz
(`apps/web/src/app/opengraph-image.tsx:19`, `export const dynamic = 'force-static'`) pesa **más**
(114.912 B), sí trae `Content-Length` y **sí se ve**. Esa es la única diferencia estructural entre
los dos: `apps/web/src/app/api/og/[coach_slug]/route.tsx:118-126` devolvía el `ImageResponse` (un
stream) tal cual. El cliente Android genera la preview en el teléfono y necesita el peso antes de
bajar la imagen para aplicar su límite (~300 KB); sin longitud, descarta la miniatura.
Descartados con evidencia: tamaño, formato, HTTPS, redirects, relación de aspecto, timeout, WAF de
Cloudflare y posición del `og:image` en el head (byte 7.402).

**Segundo defecto en el mismo archivo.** El `try { render(true) } catch { render(false) }` de las
líneas 121-126 es código muerto: `new ImageResponse(...)` no lanza de forma síncrona, el error del
logo remoto ocurre al consumir el stream, fuera del `try` ⇒ un coach con logo que satori no soporta
recibía un **PNG truncado**, con el mismo síntoma.

**Agravante estructural.** WhatsApp cachea la preview **por URL, en el teléfono del que comparte,
72 h o más**, y no existe herramienta oficial para limpiarla (el Sharing Debugger de Meta es otro
caché). Sin versionar la URL, cualquier verificación da falso negativo.

**Decisión del owner (02-09, reemplaza la del 22-08).** La imagen es **solo el logo del coach
centrado sobre su color de marca**. Sin nombre, sin tagline y sin sello EVA adentro: la tarjeta de
WhatsApp ya trae título y descripción, repetirlos dentro de la imagen era ruido.

**Criterios de aceptación.**

- AC-B1 `GET /api/og/<slug>` responde `200`, `image/png`, con `Content-Length` numérico igual al
  largo real del cuerpo y **sin** `Transfer-Encoding: chunked`.
- AC-B2 Un logo remoto que no se puede dibujar cae en la variante sin logo con un PNG **completo**,
  nunca truncado, y sigue respondiendo `200`.
- AC-B3 La imagen es el logo del coach sobre su color; sin logo, el nombre de la marca; sin nada, la
  figura EVA sobre azul EVA. El contraste del texto lo decide la luminancia del fondo.
- AC-B4 `og:image` viaja con `?v=<versión>` derivada de logo, logo dark, color y nombre: cambia
  cuando el coach cambia su marca y no antes. El route ignora el query.
- AC-B5 El HTML sigue emitiendo **todos** los `og:*` de hoy más `og:image:secure_url`; ninguno se
  pierde.
- AC-B6 El `Cache-Control` con `s-maxage=86400` se conserva (Vercel ya cachea en el edge).

---

## C · El «Despegue» de la web sale sin el logo del coach

**Síntoma.** Al lanzar el entreno desde la hoja de un día ya entrenado («Repetir hoy» / «Revisar y
editar»), el círculo central del Despegue muestra un triángulo ▶ genérico en vez del logo del coach.
Desde el CTA del hero o desde la tarjeta de un día no hecho, el logo aparece bien.

**Causa raíz.** `apps/web/src/lib/workout/exec-launch-brand.ts:29` resolvía la marca por
**proximidad en el DOM**: `el.closest('[data-primary-color]')`, con `el` = el elemento tocado. Los
triggers de la hoja viven dentro de un portal —
`apps/web/src/app/c/[coach_slug]/dashboard/_components/program/WorkoutDoneSheet.tsx:52-57` pasa
`e.currentTarget`, y `apps/web/src/components/ui/sheet.tsx:22-24,52` monta el contenido con
`SheetPortal` (Base UI) en `document.body`, **hermano** del wrapper `/c` que emite los datasets
(`apps/web/src/app/c/[coach_slug]/layout.tsx:385-393`). `closest` devuelve `null` ⇒ `logoUrl` **e**
`initial` quedan en `null` ⇒ cae al tercer fallback, el `PlayIcon` de
`.../launch/WorkoutLaunchMorph.tsx:444-454` (`:452`). Los dos caminos rotos son
`.../program/WorkoutPlanCard.tsx:233` y `.../hero/WorkoutHeroCard.tsx:178`.

RN no tiene el bug porque no scrapea el DOM: lee el branding del contexto de tema
(`apps/mobile/components/alumno/workout/v3/session-morph.tsx:274-275`, cadena
`logoDark → logo → inicial`).

Descartados con evidencia: el coach sí tiene logo y logo dark en Storage; el gate por tier no aplica
(white-label en todos los planes); el service worker no intercepta cross-origin
(`apps/web/public/sw.js:67`); no hay `img-src` en CSP; el overlay portaleado **sí** hereda el color
de marca (por eso el fondo azul se ve bien).

**Criterios de aceptación.**

- AC-C1 El Despegue muestra el logo del coach también cuando el lanzamiento sale de la hoja
  portaleada, en sus dos entradas (tarjeta del plan y hero con el día completado).
- AC-C2 La cadena de fallback queda `logo del coach → inicial de la marca → ícono EVA`: nunca más un
  glifo sin identidad.
- AC-C3 `resolveLaunchBrand` sigue descartando el ícono EVA como «logo propio» (criterio compartido
  con el splash y la tarjeta de PR) y sigue devolviendo todo en `null` sin lanzar cuando no hay
  wrapper (SSR o fuera de `/c`).
- AC-C4 Los caminos que hoy funcionan devuelven exactamente el mismo valor que antes.

---

## D · Android: «No hay notificaciones» durante el descanso y el cardio

**Síntoma.** Con un descanso corriendo (2:27) y con un cardio corriendo (29:45), el panel de
notificaciones del Android del owner decía «No hay notificaciones». En iPhone el timer sí se ve
(Live Activity, que vive fuera del stack de notificaciones).

**Causa raíz — confirmada por el owner.** Era la **app instalada** y el **permiso de notificaciones
estaba negado**. El permiso se pide una sola vez y de forma lazy:
`apps/mobile/components/alumno/workout/timers/useRestTimerEngine.ts:252` llama
`ensureRestNotifPermission()` (`.../timers/rest-notification.ts:136-145`) al montar el motor del
descanso, y `.../v3/use-cardio-live-timer.ts` hace lo propio para cardio. **Si el alumno lo negó, el
ejecutor v3 no tenía ninguna forma de recuperarlo**: el card de permiso vive en
`WorkoutSettingsSheet`, que v3 no monta, y el sheet de v3
(`apps/mobile/components/alumno/workout/v3/ExecSettingsSheet.tsx`) no tenía ninguna fila de
notificaciones.

La web tiene el mismo hueco por otra vía: el único botón del ejecutor que llama
`Notification.requestPermission()` está en
`apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutTimerSettingsPanel.tsx:36-54`, y su
disparador (`setShowTimerSettings(true)`, `WorkoutExecutionClient.tsx:2747`) cuelga del header
legacy que v3 oculta (`WorkoutExecutionClient.tsx:2684-2692`) ⇒ un alumno que entra directo a v3 no
puede conceder el permiso. La alerta final de `RestTimer.tsx:164-180` existe y funciona, pero está
gateada por `Notification.permission === 'granted'` y nunca promptea en medio del entreno: eso es
deliberado y **no se toca**.

**Limitaciones documentadas, no bugs.**

- **«No molestar» del sistema puede ocultar la notificación** del panel y de la pantalla bloqueada
  aunque el permiso esté concedido (`SUPPRESSED_EFFECT_NOTIFICATION_LIST` de AOSP, más las capas
  propias de HyperOS). `ongoing: true` no exime de DND; lo único que eximiría es `canBypassDnd`, que
  **solo lo concede el usuario** y que la app no debe pedir: sería pasar por encima de una decisión
  explícita.
- **La PWA no tiene cronómetro vivo y no lo va a tener**: `showTrigger`/`TimestampTrigger` nunca
  llegó a Chrome estable y no existe API web equivalente a un ongoing con `chronometer`. En web solo
  existe la alerta final del descanso; el cardio no tiene ninguna notificación.
- Los canales v2 con `importance` DEFAULT están en cualquier binario 1.1.2 (`64fc30df` es ancestro
  de `b5b91caa` y de `eb665848`), así que el bug viejo de lockscreen no es este caso.

**Criterios de aceptación.**

- AC-D1 El sheet de ajustes del ejecutor v3 tiene una fila de notificaciones en **RN y web**, con el
  mismo mapa de estados (concedido / sin permiso / bloqueado / no soportado).
- AC-D2 Sin soporte, la fila **no se pinta**: prometer algo que no existe es peor que no ofrecerlo.
- AC-D3 Concedido ⇒ interruptor encendido y sin acción (revocar es cosa del sistema). Sin permiso ⇒
  el toque dispara el prompt real. Bloqueado duro ⇒ estado de advertencia; en RN abre los ajustes de
  la app, en web solo explica dónde están (el navegador no los abre por código).
- AC-D4 El estado se relee al abrir el sheet y al volver de background o de otra pestaña: si el
  alumno concedió el permiso en los ajustes del sistema, la fila se actualiza sola.
- AC-D5 En web el permiso se confirma vía service worker (`registration.showNotification`), nunca con
  `new Notification()` (lanza «Illegal constructor» en PWA Android).
- AC-D6 El copy de RN nombra «No molestar» como causa posible cuando el permiso ya está concedido.
- AC-D7 No se toca `live-timer-notification.ts` ni ningún id de canal: un canal Android es inmutable
  post-creación y cambiar su importancia con el mismo id es un no-op silencioso.

---

## E · Cardio: el timer mide y el alumno igual tiene que escribir los minutos

**Síntoma.** En un bloque de cardio con timer, el reloj llega a 0 y no pasa nada: los inputs
MIN/METROS/FC siguen vacíos, la serie sigue sin registrar y el ejecutor no avanza. El alumno tiene
que tipear a mano un número que la app acaba de medir.

**Pedido del owner.** (a) El timer **termina solo** ⇒ rellenar MIN con el tiempo hecho, **enviar** el
registro, marcar la serie ✓ y **avanzar**. (b) El alumno lo **pausa o detiene** antes ⇒ poner en MIN
el tiempo transcurrido, **sin enviar y sin avanzar**: decide él. (c) Aplica a cardio **continuo** y a
**intervalos**, en **web y RN**.

**Causa raíz.** No es una regresión: la pieza nunca existió. En web,
`.../workout/[planId]/v3/CardioStepV3.tsx:308` monta
`useExecCountdown(durationSec, { autoStart: false })` **sin pasar `onDone`** —el hook ya lo soporta
(`v3/useExecCountdown.ts:36,49-58`) y nadie lo usa en cardio— y `v3/useIntervalRunner.ts:54-69`
(`advance`) **no emite ningún evento hacia afuera**. Al llegar a 0 solo se pinta «¡Listo! · Registra
abajo» (`CardioStepV3.tsx:353-362`). En RN, `.../v3/CardioScreenV3.tsx:659` usa
`useCountdown(..., () => timerHaptics.holdDone(), false)` (el `onDone` solo vibra) y `:812-815` usa
`onFinish` solo para el flash y el háptico.

El precedente exacto del caso (b) ya existe y está probado en **movilidad**:
`v3/MobilityStepV3.tsx:89-101` vuelca los segundos del hold a la caja con el patrón uncontrolled de
`LogSetForm.tsx:1626-1638`, y su espejo RN es `v3/MobilityScreenV3.tsx:118-141`. **Lo que no existe
en ninguna parte es el envío automático.** El auto-avance de paso, en cambio, ya existe en las dos
plataformas y sale gratis con solo enviar la serie: web `WorkoutExecutionClient.tsx:1863-1886`, RN
`ExecutorV3.tsx:1774-1787`.

**Contrato de decisión (tabla única de verdad).**

| Disparo | Modo | Rellena MIN | Envía |
|---|---|---|---|
| Countdown llega a 0 | continuo | sí | **sí** |
| Última fase de la ronda vence sola | intervalos | sí | **sí** |
| Fase intermedia vence | intervalos | no | no |
| «Fase siguiente» que cierra la ronda | intervalos | sí | **sí** |
| «Fase siguiente» intermedio | intervalos | no | no |
| Pausar (botón, anillo o botón de la notificación) | todos | sí | no |
| «Saltar fase» | intervalos | sí | no |
| «Reiniciar» | todos | limpia el acumulador, no reescribe MIN | no |
| Pausar el cronómetro (bloque por distancia) | stopwatch | sí | no |

**Criterios de aceptación.**

- AC-E1 El auto-envío pasa por el **mismo** pipeline del botón ✓ (cola offline, descanso, `onLogged`,
  auto-avance): no se duplica ni una línea del motor de guardado.
- AC-E2 Pausar o saltar rellena y **nada** se envía.
- AC-E3 Una fase intermedia que vence no ensucia la caja ni envía.
- AC-E4 «Reiniciar» pone el acumulador a 0 y no reescribe MIN.
- AC-E5 `elapsed <= 0` nunca escribe ni envía: jamás se manda una serie de 0 minutos.
- AC-E6 Nunca se envía dos veces la misma serie (guard por serie activa + conjunto de ya enviadas).
- AC-E7 MIN se escribe siempre desde el timer (es su caja); **METROS, FC y conteo no se tocan
  nunca**, ni aunque vinieran del sensor BLE, de un draft restaurado o de «repetir el día».
- AC-E8 Tras un auto-envío el timer de la ronda siguiente queda en su valor prescrito y **detenido**
  (regla vigente: nada arranca solo).
- AC-E9 El tiempo se mide con **reloj de pared acumulado**, no con la suma de duraciones prescritas:
  con pausas o con fases por distancia (`durationSec: 0`) el número sigue siendo correcto.
- AC-E10 Con la app en background (RN) o la pestaña oculta (web), al volver el timer vencido cierra
  el tramo y registra con el MIN correcto.
- AC-E11 Movilidad (hold), roller y fuerza siguen idénticos; una serie de cardio editada a mano sigue
  funcionando.

---

## F · La tarjeta de Share tiene fondos que tapan la foto

**Síntoma.** Los datos de la tarjeta de Share Entreno van dentro de cajas y pills con fondo, borde y
separadores, y el color del coach aparece en textos, barras y tintes por toda la tarjeta. Sobre una
foto, la tarjeta se lee como una interfaz pegada encima, no como una tarjeta.

**Pedido del owner.** Cero fondos, bordes y separadores detrás de los datos; texto blanco `#FFFFFF`
con **contorno negro muy fino** (contorno, no sombra difusa) para que se lea sobre cualquier foto; el
**color del coach queda solo en la silueta**; la silueta no se toca.

**Causa raíz.** No es un bug: es el diseño vigente, y vive todo en RN
(`apps/mobile/components/alumno/share/`, 13 archivos, 4.363 líneas; en web esta tarjeta no existe).
Los fondos están en `stickers/MuscleFigureSticker.tsx:52-93` (chips con `accentTint` y borde de
acento), `stickers/SetlistSticker.tsx:40-111` (caja `W08`, borde, barra lateral de acento y
divisoria), `stickers/StatsRowSticker.tsx:22-69` (caja y separadores verticales),
`stickers/VolumenHeroSticker.tsx:36-47` (eyebrow en acento),
`stickers/BrandFooterSticker.tsx:65-72` (`@handle` en acento),
`stickers/StreakChipSticker.tsx:19-42`, `stickers/DateChipSticker.tsx:19-44` y
`stickers/RecordsBandSticker.tsx:24-57` (pills con fondo y borde).

RN **no tiene stroke de texto**: `textShadow` da halo difuso, `react-native-svg` no soporta
`paint-order` (el stroke se pinta centrado y se come la mitad del glifo) y Skia exigiría
reimplementar el layout de texto con `useFont()` y arriesga la captura en Android. La técnica viable
es **copias apiladas** del mismo texto.

**Criterios de aceptación.**

- AC-F1 Ningún sticker de datos tiene `backgroundColor`, `borderWidth`, `borderColor`, separador ni
  divisoria. Excepciones que **sí** se quedan: el backplate blanco del logo del coach y el fondo
  blanco del QR (sin él ninguna cámara lo lee).
- AC-F2 Los datos son `#FFFFFF` con contorno negro fino, escalado con `s()` como todo el resto: si el
  grosor no pasa por el escalador, el preview y el PNG de 1080 no coinciden.
- AC-F3 El color del coach solo aparece en la silueta (`MuscleBodySvg.tsx`, sin cambios) y en el
  círculo de fallback del logo, que **es** el logo.
- AC-F4 El texto se lee sobre una foto muy clara y sobre una muy oscura; el modo `transparent`
  conserva el alfa del PNG.
- AC-F5 Los 6 presets × 3 fondos quedan sin solapes ni recortes: al quitar paddings y bordes cada
  sticker cambia de tamaño y su centro medido se mueve, así que hay que reajustar `share-presets.ts`.
- AC-F6 Lo que se juzga es la captura (`captureRef`, 1080×1920), no el preview en pantalla.
- AC-F7 El contorno no se aplica a emojis (las copias negras los ensucian) y no lee nueve veces el
  mismo texto con TalkBack.

---

## G · Android: «Stories», «WhatsApp» y «Guardar» parecen no hacer nada

**Síntoma.** En el composer de Share Entreno, «Stories» y «WhatsApp» no hacen lo esperado o dan
error sin que se vea el error, y «Guardar» no avisa nada. «Más…» funciona bien.

**Causa raíz probada.** El composer se monta **dentro de una ventana nativa `<Modal>` ajena**
(`SessionCompleteV3.tsx:422` abre el Modal y `:699-703` monta el composer con `embedded`), y el
`<Toaster />` está montado una sola vez en el root (`apps/mobile/app/_layout.tsx:379`), que **no
alcanza esa ventana** — lo dice el propio archivo en `WorkoutShareComposer.tsx:620-624`. ⇒ **todos
los avisos del flujo son invisibles**: `share-targets.ts:319` («Guardada en tu galería», que es
literalmente el hallazgo del owner), `share-targets.ts:220,253` («Link copiado…») y
`WorkoutShareComposer.tsx:470,483` (los dos errores). El único aviso visible hoy es un `Alert.alert`
(`share-targets.ts:315`), porque es un diálogo nativo del sistema y no depende del árbol React.

**Causa probable del segundo síntoma.** El pre-gate `isTargetInstalled`
(`share-targets.ts:118-130`, consultado en `:213`, `:247`, `:278`) usa
`RNShare.isPackageInstalled` → `pm.getPackageInfo(...)`, que en Android 11+ lanza
`NameNotFoundException` para cualquier paquete fuera de `<queries>` **aunque la app esté
instalada** ⇒ `false` ⇒ fallback silencioso a la hoja genérica; y `outcome: 'fallback'` **no muestra
nada** (`WorkoutShareComposer.tsx:482-484` solo avisa en `'error'`). Lanzar sí funciona aunque la
consulta mienta: la limitación de package visibility es de *consulta*, no de *lanzamiento*.

**Criterios de aceptación.**

- AC-G1 Todo aviso del flujo de compartir se pinta **dentro de la ventana del composer**; ningún
  camino queda mudo.
- AC-G2 Los destinos se intentan directo y caen a la hoja **solo si el intento lanza**.
- AC-G3 Cada caída a la hoja explica por qué, con un aviso visible y honesto.
- AC-G4 «Guardar» avisa el éxito, distingue el permiso denegado del bloqueo duro (con salida a
  ajustes) y no se traga el error del `catch`.
- AC-G5 «Más…» sigue funcionando exactamente igual: es la referencia sana.
- AC-G6 Nada de esto exige build nativo: quitar el pre-gate hace irrelevante que `<queries>` esté o
  no en el binario 1.1.2.
- AC-G7 Se conserva el guard de `FACEBOOK_APP_ID`: Meta exige el appId para el intent de Stories y
  sin él Instagram descarta el asset en silencio, que es peor.

---

## H · El selector «Grupo muscular» en RN es una nube de ~17 pills

**Síntoma.** La hoja «Nuevo ejercicio» / «Editar ejercicio» de RN pinta el campo obligatorio «Grupo
muscular» como ~5 filas de pills amontonadas dentro de una hoja que ya tiene 5 secciones. En web no
pasa: ahí es un `Select`.

**Causa raíz.** `apps/mobile/components/coach/ExerciseFormSheet.tsx:369-370` usa el componente local
`Chips` (`:628-651`: `flexWrap`, sin scroll, sin agrupación, sin búsqueda) sobre `MUSCLE_GROUPS`;
web usa `<Select>` en
`apps/web/src/app/coach/exercises/_components/ExerciseFormModal.tsx:289-303`. Detrás hay una
duplicación real: **dos catálogos divergentes**, `apps/mobile/lib/exercises.ts:21-39` (17 valores) y
`apps/web/src/lib/constants.ts:9-28` (18, con `Movilidad`), sin nada compartido en `packages/*`.

**Dos bugs de datos que salen de ahí** (conteos reales en LIVE): `Movilidad` tiene 31 filas y **no
está en la lista de RN** ⇒ un coach que edita en la app un ejercicio de movilidad ve la nube sin
ninguna pill activa y no puede volver a elegirlo; `Rehabilitación` tiene 24 filas y **no está en
ninguna de las dos listas**. En «Equipo» el problema es peor y de otro tipo: los 7 valores en
español que se ofrecen casi nunca coinciden con lo que la DB guarda, que son los valores **en
inglés** del import original (`dumbbell` 180, `body weight` 141, `cable` 133, `barbell` 104,
`leverage machine` 76…), así que al editar un ejercicio de sistema no queda marcada ninguna opción.

La taxonomía de regiones **ya existe** y no hay que inventarla:
`packages/workout-engine/muscle-map.ts:16-26,56-114,117-120` (`MuscleRegion`, `SYNONYM_TO_REGION`,
`muscleGroupToRegion`). La columna `exercises.muscle_group` es texto libre: **no hay CHECK
constraint** (verificado con `pg_get_constraintdef`), así que reordenar o ampliar la lista no exige
migración. `equipment` tampoco tiene constraint.

**Decisión del owner (02-09, sobre el mockup `c4a77ab0`).** **Opción B: pestañas de región +
pills.** El campo se resuelve con una fila de pestañas de región y las pills del grupo dentro de la
región elegida, no con un dropdown. Las listas de músculo se unifican en un catálogo compartido que
**incluye `Movilidad` y `Rehabilitación`**, y «Equipo» resuelve el desajuste con la DB **mapeando**
los valores en inglés que guarda el catálogo de sistema a las opciones en español que se ofrecen.
(Revisión del jefe, 02-09: la primera redacción decía «ofrecer los valores en inglés»; la UI del
coach es en español de punta a punta y meter `dumbbell` en el desplegable trasladaba el vocabulario
del import de ExerciseDB a la única pantalla donde el coach elige. Se ofrecen las 7 etiquetas en
español y `EQUIPMENT_SYNONYMS` reconoce lo guardado.)

**Criterios de aceptación.**

- AC-H1 Existe **una sola** fuente compartida del catálogo (músculos, secciones y equipo) en
  `packages/*`; web y RN la re-exportan. Ninguna lista se define dos veces.
- AC-H2 El selector RN son pestañas de región + pills de la región activa: se ve el grupo elegido sin
  scrollear cinco filas.
- AC-H3 `Movilidad` y `Rehabilitación` se pueden elegir en RN y en web.
- AC-H4 «Equipo» ofrece las 7 etiquetas en español y **reconoce** los valores en inglés que guarda el
  catálogo de sistema (`dumbbell`, `cable`, `body weight`…): al editar uno de esos ejercicios queda
  marcada la opción equivalente, sin pintar dos ítems con el mismo rótulo.
- AC-H5 Un valor guardado **fuera** del catálogo se inyecta como opción extra y queda seleccionado:
  editar un ejercicio nunca corrompe su grupo ni su equipo en silencio.
- AC-H6 El contrato del servidor no cambia (`muscle_group` sigue validándose como texto no vacío) y
  no hay ninguna migración.
- AC-H7 El picker convive con el `BottomSheetModal` de la hoja en Android e iOS, con teclado abierto
  y cerrado, sin cerrar la hoja al cerrarse él.

---

## I · Salir del builder con cambios sin guardar no pregunta nada

**Síntoma.** En el builder de programas, tocar la flecha ← (o el back de Android, o el swipe de iOS,
o recargar la pestaña) sale sin preguntar, con cambios sin guardar y con el badge «Sin guardar»
pintado en la barra.

**Causa raíz.** El estado sucio existe y es confiable en las dos plataformas —RN
`apps/mobile/app/coach/program-builder.tsx:840` (`dirty`, badge en `:1862-1867`), web
`apps/web/src/app/coach/builder/[clientId]/WeeklyPlanBuilder.tsx:230` (`hasUnsavedChanges`, badge en
`:1051,1089-1093`)— pero **nadie lo consulta al salir**: RN `program-builder.tsx:1847` es
`onPress={() => router.back()}` pelado, sin `BackHandler` (grep = 0 resultados) y con el gesto de
swipe nativo activo por default; web `WeeklyPlanBuilder.tsx:1039-1043` es un `<Link>` de Next y el
archivo no tiene **ningún** `beforeunload`. El mismo componente sirve al builder por alumno y al de
plantillas, así que arreglarlo cubre las dos rutas.

Matiz que cambia el copy: **hay autosave local del borrador en las dos plataformas** (RN
AsyncStorage con debounce 2500 ms, `program-builder.tsx:1216-1255`; web localStorage con debounce
3000 ms, `WeeklyPlanBuilder.tsx:392-405`), así que «perdés todo» sería mentira.

Precedentes a copiar, no a inventar:
`apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx:1511-1525` y
`apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/PlanBuilderClient.tsx:377-387`.

**Criterios de aceptación.**

- AC-I1 Con cambios sin guardar, la flecha ← pregunta antes de salir en **RN y web**; sin cambios,
  sale directo.
- AC-I2 El back de hardware / gesto de Android pregunta lo mismo, y el listener no se come el back de
  las pantallas u hojas que estén encima.
- AC-I3 Recargar o cerrar la pestaña en web dispara el aviso del navegador.
- AC-I4 Guardando **no** se pregunta: el guardado en vuelo va a limpiar el estado sucio solo.
- AC-I5 Después de guardar, volver no pregunta nada.
- AC-I6 El copy es honesto sobre el autosave: el borrador queda en el dispositivo, lo que no queda es
  el programa persistido en el servidor.
- AC-I7 El destino de la flecha no cambia (ficha del alumno, o biblioteca de plantillas sin alumno).
- AC-I8 Web usa el `AlertDialog` del DS, nunca `window.confirm` (rompe el look en la PWA).
- AC-I9 **Limitación aceptada y documentada**: el botón «atrás» del navegador no se intercepta (App
  Router no expone guard de navegación y el truco de `pushState` + `popstate` deja la barra de
  direcciones inconsistente); en iOS el swipe-back queda inerte mientras haya cambios, en vez de
  preguntar.

---

## J · Guardián de deploy skew (E394) en web

**Síntoma.** La pestaña que estaba abierta cuando salió un deploy pierde su siguiente Server Action
con un error opaco: «An unexpected response was received from the server». En `/register` —la
pantalla con más tráfico pagado— el coach que llegó del ad pierde el alta entera.

**Causa raíz.** El bundle de la pestaña es de un deploy y el POST cae en el siguiente, que ya no
conoce ese id de acción (Sentry `EVA-NEXTJS-3` / `-19`; el plan de Vercel no tiene Skew Protection).
El handler que ya existía en `apps/web/instrumentation-client.ts` (FCN W3.12) matcheaba **solo**
`/Failed to find Server Action/i`, con un guard permanente por pestaña; **no cubría E394**, que es
justo el que domina los dos issues (12 eventos en 7 días, en todas las releases) y que llega casi
siempre por `onunhandledrejection`.

**Criterios de aceptación.**

- AC-J1 Se reconocen las dos formas del skew, incluido el marcador interno `__NEXT_ERROR_CODE` con
  valor `E394` (señal independiente del texto, que cambia entre versiones de Next). `E715` **no**
  matchea.
- AC-J2 La pestaña recarga **una sola vez** por ventana corta: un deploy realmente roto no puede
  producir un bucle de recargas.
- AC-J3 Sin `sessionStorage` (Safari privado, cookies de terceros) **no** se recarga: una acción
  perdida es reparable, un bucle no.
- AC-J4 La recarga se cuenta en Sentry como mensaje `info` con fingerprint fijo, y el error de skew
  ya recuperado deja de reportarse como error del producto.
- AC-J5 Los tres caminos quedan cubiertos por un único mecanismo: `error`, `unhandledrejection` y los
  errores atrapados por un error boundary de React, que solo pasan por `beforeSend`.
- AC-J6 No se toca `ignoreErrors`, `denyUrls` ni el resto del `beforeSend`.

---

## No alcance

- Web Push programado (VAPID) para que la alerta del descanso llegue con la pantalla apagada: 12–20 h,
  infraestructura propia y riesgo alto de push atrasados. Se decide aparte.
- Detectar «No molestar» dentro de la app: Android no lo expone por RN/Expo ⇒ módulo nativo ⇒ build
  1.1.3, que hoy no existe.
- Notificación ongoing con contador en la PWA: no existe API web.
- Reclamar `/join` como App Link de Android o en el AASA: rompería el alta web, exigiría build nativo
  y haría fallar `tests/mobile/applinks-claims.test.ts`.
- Interceptar el botón «atrás» del navegador en la web.
- Normalizar los valores de `exercises.equipment` en LIVE (inglés vs. español): saneo de datos, con su
  propia tanda y su propio SQL.
- Paridad web de la tarjeta de Share Entreno (hoy no existe en web; crearla no es este trabajo) y el
  endurecimiento de las share-cards web (`PRShareCardModal`, `web-share.ts`).
- Los otros endpoints que también transmiten sin longitud (`api/splash`, `api/pwa-screenshot`,
  `api/pr-card`): ninguno se usa como `og:image`.
- El catch-up de fases de intervalo tras un congelamiento largo de la pestaña (bug preexistente de
  `useIntervalRunner`).
- Tocar Enterprise (congelada), DDL, RLS o migraciones: **esta tanda no toca la base**.

## Decisiones del owner ya tomadas (no reabrir)

1. **B**: la preview es solo el logo del coach sobre su color; sin nombre, sin tagline, sin sello EVA.
2. **D**: la causa fue el permiso negado; DND queda como limitación documentada y no se pide bypass.
3. **E**: termina solo ⇒ envía y avanza; pausa o salto ⇒ solo rellena. La ronda siguiente **no**
   auto-arranca.
4. **F**: contorno en vez de fondos; el color del coach solo en la silueta.
5. **H**: opción B (pestañas de región + pills) sobre el mockup `c4a77ab0`; listas unificadas con
   `Movilidad` y `Rehabilitación`; «Equipo» en español, mapeando los valores en inglés de la DB.
6. **I**: se pregunta al salir en las dos plataformas, con copy honesto sobre el autosave.

## Decisiones abiertas para el owner — respondidas el 2026-09-02

1. **F · colores de sistema en la tarjeta** — **DECIDIDO: queda todo en blanco + contorno** (como está en
   producción). Sin trabajo.
2. **F · velo inferior de la foto** (`ShareCanvas`) — **DECIDIDO: se saca.** En producción `bbfc5136`
   (tren `794aee52`, OTA 1.1.2 `01a063b0`); **QA del owner en device VERDE 02-09**.
3. **E · descanso entre rondas en cardio** — **DECIDIDO: se confirma** el comportamiento actual (completar ⇒
   auto-envío; pausar ⇒ solo rellena MIN). Sin trabajo.
4. **E · MIN pisa lo tipeado** — **DECIDIDO: queda como está** (MIN solo al pausar, que es lo que el owner
   validó en device). Sin trabajo.
5. **C · orden del fallback del Despegue sin logo** — el owner pidió explicación en humano; hasta que decida,
   queda como está (inicial del coach antes que el ícono EVA, espejo de RN).
6. **I · gesto de back en el builder con cambios sin guardar** — **DECIDIDO: debe preguntar SIEMPRE**, en iOS
   (swipe-back) y Android (back físico), mientras se edita la rutina de un alumno. En producción
   `c57c7406` (`@react-navigation/native` como dependencia directa) + `ba074a92` (tren `794aee52`, OTA 1.1.2
   `01a063b0`); **QA del owner en device VERDE 02-09** (pregunta una sola vez, la pantalla no se anima hacia
   afuera; las hojas con `nativeModal` siguen cerrando con swipe-down).
