---
status: active
owner: product-engineering
last_verified: "2026-09-15"
canonical: false
---

# SPEC — Eventos de app de Meta (iOS)

> El SDK de Meta entra al binario para que las campañas puedan atribuir **instalaciones** y
> **registros de coach** hechos desde el celular. Un evento de negocio
> (`CompletedRegistration`), el permiso ATT tras el splash y el manifiesto de privacidad al día.
>
> Origen: mensaje del owner del 2026-09-15 (§2). Plan en [PLAN.md](PLAN.md); tareas en
> [TASKS.md](TASKS.md).

Un solo tren. **Cero migraciones, cero RPC, cero cambios en la web.** El runtime pasa a **1.1.3**:
hay módulo nativo nuevo, así que **no viaja por OTA** (§4.6).

---

## 1. El problema, con evidencia

Meta no ve la app. Verificado el 15-09 en el portfolio del owner y en el código:

| Hecho | Dónde se comprueba | Consecuencia |
|---|---|---|
| El Administrador de eventos tiene **un solo origen**: «EVA Web», píxel `1586483219694806` | Portfolio de Meta; en código `META_PIXEL_ID` (`apps/web/src/lib/meta/pixel.ts:16`) sale de `NEXT_PUBLIC_FB_PIXEL_ID` | Toda la medición es web; la app no existe para el optimizador |
| El portfolio **no tenía ninguna app registrada** hasta el 15-09 | Business Settings → Cuentas → Aplicaciones (vacío) | Sin app no hay dataset de app, ni SKAdNetwork, ni Medición de eventos agregados |
| Los endpoints móviles de alta **no mandan CAPI** | `apps/web/src/app/api/mobile/auth/register-coach-free/route.ts` (290 líneas) y `complete-coach-onboarding/route.ts` (204): **cero** ocurrencias de `meta`/`capi` | Un coach que se registra en la app no genera ninguna señal para Meta — ni por el device ni por el servidor |
| El alta **web** sí viaja doble | `register.actions.ts:329-335` (CAPI `CompleteRegistration` con `event_id` compartido) + espejo browser en `VerifyEmailContent.tsx:137` y `RegistrationMirror.tsx:32` | La brecha es exclusivamente móvil |
| `extra.facebookAppId` ya existía en `app.json` | consumido por `apps/mobile/components/alumno/share/share-targets.ts:86-94` | Es el App ID para **compartir a Stories**, no un SDK de medición: no emite ni un evento |

Las campañas nuevas que arranca marketing el 15-09 miden **cero** de lo que pasa en el celular: una
instalación desde un anuncio y el registro que la sigue son invisibles. La campaña 1 ya se pausó el
12-09 con CPL real ≈2.140 CLP calculado **solo** con altas web.

---

## 2. Decisiones del owner (15-09, no se reabren)

1. > «dame el paso a paso para que continúes tú».
2. Ese mismo día el owner creó en developers.facebook.com la app **EVA `28862306396704276`** y le
   registró la plataforma iOS: Bundle ID `cl.evaapp.eva`, App Store ID `6770426633`.
3. El **client token** (`676a3d…`) es un identificador **público por diseño** —Meta lo documenta como
   tal y tiene que viajar en el binario—, así que va en `app.json` y no es un secreto que proteger.
   No confundirlo con el App Secret, que **nunca** entra al repo ni al bundle.
4. Android queda fuera hasta que la app esté publicada en Play (§6).

---

## 3. Lo que ya existe (verificado en HEAD `55c3568e`)

| Pieza | Archivo | Qué hace hoy |
|---|---|---|
| Analytics de producto | [`apps/mobile/lib/analytics.ts`](../../../apps/mobile/lib/analytics.ts) | PostHog con alcance mínimo, sin `identify()`, fail-open, lifecycle events ON. **Es el modelo de estilo de este tren** |
| Telemetría de errores | [`apps/mobile/lib/sentry-boot.ts`](../../../apps/mobile/lib/sentry-boot.ts) | `Sentry.init` con `enabled: !__DEV__`. De ahí sale el gate de §4.5 |
| Manifiesto de privacidad | [`apps/mobile/plugins/with-privacy-manifest.js`](../../../apps/mobile/plugins/with-privacy-manifest.js) | Escribe `PrivacyInfo.xcprivacy` con 5 tipos de dato, todos `Tracking: false`, y `NSPrivacyTracking: false` |
| App ID de Facebook para share | `app.json` `extra.facebookAppId` | Solo para «compartir a Stories». **No se toca** |
| Alta de coach en RN | [`apps/mobile/app/(auth)/register.tsx`](<../../../apps/mobile/app/(auth)/register.tsx>) | Dos caminos: Google (`completeCoachOnboarding`) y correo (`registerCoachFree`) |
| Regla de tiendas | `apps/mobile/AGENTS.md` §«Pagos y tiendas» | El rail de cobro es la web. Por eso acá **no** hay evento de compra (§6) |

---

## 4. Diseño

### 4.1 Configuración (`app.json`)

La entrada del plugin deja de estar pelada —así lanza, porque exige `appID`, `displayName` y
`scheme`— y pasa a llevar la config completa:

```json
["react-native-fbsdk-next", {
  "appID": "28862306396704276",
  "displayName": "EVA",
  "scheme": "fb28862306396704276",
  "isAutoInitEnabled": true,
  "autoLogAppEventsEnabled": true,
  "advertiserIDCollectionEnabled": true
}]
```

(más `clientToken`, el identificador público de §2.3). `expo-tracking-transparency` recibe el
`userTrackingPermission`, que es literalmente el texto que lee el usuario en la hoja del sistema:

> «EVA usa este permiso solo para saber si los anuncios que te trajeron funcionan. No vende tus
> datos ni los usa para perfilarte.»

**SKAdNetwork**: el plugin agrega **exactamente dos** identificadores
(`v9wttpbfk9.skadnetwork` y `n38lu8286q.skadnetwork`, `plugin/build/withFacebook.js:54-55`, vía
`withSKAdNetworkIdentifiers`). No se agrega ninguno a mano: una lista escrita a dedo se desactualiza
y nadie se entera.

### 4.2 `lib/meta-sdk.ts`

Un módulo nuevo, mismo espíritu que `analytics.ts` (cabecera con el porqué, alcance mínimo, 21.719,
fail-open). Tres funciones y nada más:

| Función | Qué hace |
|---|---|
| `bootMetaSdk()` | `Settings.initializeSDK()`. **No es redundante en iOS**: el config plugin escribe el Info.plist pero no toca el AppDelegate, así que sin esta llamada el SDK de iOS queda dormido y no sale ni un `fb_mobile_activate_app`. En Android `isAutoInitEnabled` ya lo arranca; llamarlo igual es idempotente |
| `syncMetaTrackingConsent()` | Solo iOS. Pide ATT y pasa la respuesta a `Settings.setAdvertiserTrackingEnabled(...)` |
| `trackMetaCoachRegistered(method)` | `AppEventsLogger.logEvent(AppEvents.CompletedRegistration, { [AppEventParams.RegistrationMethod]: method })` |
| `isMetaSdkEnabled()` | Diagnóstico/tests |

Todo en try/catch, nada lanza, nada se espera con `await` desde la UI.

### 4.3 ATT después del splash

`syncMetaTrackingConsent()` se dispara en `handleRootLayout`, **después** de
`SplashScreen.hideAsync()` y con `setTimeout(..., 800)`. Las dos razones son la misma cara de una
moneda: encima del splash Apple lo rechaza (5.1.2) y el usuario lo cierra sin leer.

Sin flag propio de «ya se preguntó»: el sistema muestra la hoja **una sola vez por instalación** y
las llamadas siguientes devuelven el estado guardado. Llamarla en cada arranque es lo correcto —y es
lo que mantiene al SDK sincronizado si el usuario cambia el permiso desde Ajustes—.

Con ATT denegado el evento **igual se manda**, sin IDFA: Meta lo atribuye por SKAdNetwork
(modelado). Denegar no apaga la medición, la degrada.

### 4.4 El evento

Uno solo: `CompletedRegistration` (`fb_mobile_complete_registration`), en los **dos** caminos del
alta de coach, disparado cuando el endpoint **ya resolvió** —la cuenta existe— y nunca al tocar el
botón: un registro que se emite antes del 200 mide intenciones, no altas.

| Camino | Punto exacto |
|---|---|
| Google | tras `await completeCoachOnboarding({...})`, antes del `AsyncStorage.setItem` |
| Correo | tras `const created = await registerCoachFree({...})`, antes de `rememberPendingSignup`; **una sola vez**, antes de la bifurcación por `status` |

Junto a cada uno viaja el espejo de producto en PostHog:
`captureAppEvent('coach_registered', { platform: 'rn', method })`, con el mismo nombre de evento que
usa la web.

### 4.5 Gate `!__DEV__`

Mismo criterio que Sentry: un build de desarrollo no ensucia el dataset de producción ni infla el
conteo de instalaciones con cada recarga de Metro. En Expo Go el módulo nativo ni existe, y para eso
está además el try/catch.

### 4.6 Runtime 1.1.3

`runtimeVersion.policy` es `appVersion`, así que subir `expo.version` de `1.1.2` a `1.1.3` **parte
en dos el canal de OTA**: los updates de 1.1.2 no le llegan a un binario que ya trae el módulo
nativo, ni al revés. Es exactamente lo que queremos. `buildNumber` y `versionCode` **no se tocan**:
los autoincrementa EAS.

---

## 5. Privacidad

- **Ley 21.719.** En las props del evento no va ningún dato de salud, ni correo, ni nombre, ni uid,
  ni el código del coach: el único parámetro es `registration_method` ('email' | 'google'), que
  describe el **botón** que se tocó, no a la persona. Los **alumnos no emiten ni un evento de Meta**.
  Tampoco se usa `setUserID` ni `setUserData` (advanced matching): el hash del correo se manda desde
  la web por CAPI, con consentimiento, y no hace falta repetirlo desde el device.
- **ATT.** El texto de la hoja dice para qué es y qué no se hace (§4.1). Es la decisión del usuario,
  no un default nuestro.
- **Manifiesto** (`with-privacy-manifest.js`): `NSPrivacyTracking` pasa a `true` —con el SDK adentro,
  declararlo `false` es un rechazo seguro— y se agregan dos tipos, ambos `Linked: false` (EVA no los
  cruza con la cuenta) y `Tracking: true`, con los propósitos `DeveloperAdvertising` y `Analytics`:
  - `NSPrivacyCollectedDataTypeDeviceID` (IDFA/IDFV),
  - `NSPrivacyCollectedDataTypeProductInteraction` (`fb_mobile_activate_app`,
    `fb_mobile_complete_registration`).

  `NSPrivacyTrackingDomains` **no** va ahí: los dominios los declara el manifiesto propio de
  FBSDKCoreKit, que Apple suma al del binario en el build.
- **App Store Connect.** Hay que declarar a mano, en «Privacidad de la app», la sección **«Datos
  usados para rastrearte»** con *Identificadores del dispositivo* e *Interacción con el producto*.
  Es el paso (e) de [MANUAL_TASKS](../../operations/MANUAL_TASKS.md); sin él la declaración y el
  manifiesto se contradicen y el review lo marca.

---

## 6. Fuera de alcance

| Qué | Por qué |
|---|---|
| Android | La app todavía no está publicada en Play (borrador 86 en revisión). Sin instalaciones desde Play no hay nada que atribuir; el SDK ya queda configurado y se enciende cuando corresponda |
| Evento de compra (`Purchased` / `Subscribe`) | EVA cobra **en la web** por Flow/MP. Dentro de la app no existe ningún camino a pagar (regla de tiendas de `apps/mobile/AGENTS.md`), así que un evento de compra en el device sería mentira |
| Login con Facebook | No se agrega un método de autenticación por una razón de medición |
| CAPI desde los endpoints móviles | Duplicaría el evento del device sin `event_id` compartido. Si algún día hace falta deduplicar, es otro tren |
| Advanced matching (`setUserData`) | §5 |
| Deep links `fb<appid>://` | El `scheme` lo exige el SDK, pero la app no abre ningún flujo de Facebook |

---

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Nueva arquitectura.** `newArchEnabled: true` y `react-native-fbsdk-next` es un módulo legacy (`NativeModules.FBAppEventsLogger`), que corre por la capa de interop | Se valida en el **build de EAS**, no acá: `tsc` y `expo config` no compilan nativo. Si el build rompe, el tren se detiene ahí y no llega a TestFlight |
| **Opt-in de ATT bajo** (20-30 % es lo típico del mercado) | Es el piso del canal, no un defecto: con ATT denegado el evento igual llega y se atribuye por SKAdNetwork |
| **Review de Apple** por tracking | El manifiesto, el copy de la hoja y la declaración de App Store Connect tienen que decir lo mismo (§5). El diálogo aparece después del splash (§4.3) |
| **Doble conteo** con el alta web | No lo hay: los endpoints móviles no mandan CAPI (§1) |
| El SDK dispara `fb_mobile_activate_app` en **cada** arranque | Es el comportamiento estándar y es lo que Meta usa para instalaciones y sesiones. No se cuenta como registro |

---

## 8. QA (después del build 1.1.3)

Con un build de **TestFlight** (nunca Expo Go: sin módulo nativo no hay nada que ver, y el gate
`!__DEV__` lo apaga igual):

1. Primer arranque: aparece la hoja de ATT **después** del splash, no encima. Leer el texto completo.
2. Events Manager → dataset **EVA Web** → **«Probar eventos»** → pestaña de app, con el device
   asociado: al abrir la app tiene que llegar `fb_mobile_activate_app`.
3. Registrar un coach de prueba **por correo**: llega `fb_mobile_complete_registration` con
   `fb_registration_method = email`.
4. Repetir con **Google**: mismo evento, `fb_registration_method = google`.
5. Aceptar ATT en una instalación y **denegarlo** en otra: los eventos llegan en las dos; solo
   cambia si viene el IDFA.
6. PostHog: `coach_registered` con `platform: 'rn'` y el `method` correcto en los dos caminos.
7. Ningún evento lleva correo, nombre ni uid (mirar el payload en «Probar eventos»).
