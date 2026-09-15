---
status: active
owner: product-engineering
last_verified: "2026-09-15"
canonical: false
---

# TASKS — Eventos de app de Meta (iOS)

Ver [SPEC](SPEC.md) y [PLAN](PLAN.md). **Ningún checkbox se marca sin gate real o QA del owner.**

Orden duro: **W0 → W1 → W2 → W3 → W4 → W5**.

---

## W0 · Configuración nativa

- [x] **W0.1 Plugin de `react-native-fbsdk-next` con config.** La entrada pelada que dejó
      `expo install` lanzaba (exige `appID`, `displayName` y `scheme`). Ahora lleva `appID`,
      `clientToken`, `displayName`, `scheme` `fb28862306396704276`, `isAutoInitEnabled`,
      `autoLogAppEventsEnabled` y `advertiserIDCollectionEnabled`.
      **Done:** `expo config --type introspect` imprime `FacebookAppID`, `FacebookClientToken` y
      `FacebookDisplayName` en `ios.infoPlist`.
- [x] **W0.2 Plugin de `expo-tracking-transparency` con el copy de la hoja.**
      **Done:** el introspect imprime `NSUserTrackingUsageDescription` con el texto del SPEC §4.1.
- [x] **W0.3 `expo.version` 1.1.2 → 1.1.3.** Módulo nativo nuevo ⇒ runtime nuevo; con
      `runtimeVersion.policy: appVersion` las OTA de 1.1.2 no cruzan (SPEC §4.6). `buildNumber` y
      `versionCode` intactos.
      **Done:** el introspect imprime `version: '1.1.3'` y el diff no toca `buildNumber` ni
      `versionCode`.
- [x] **W0.4 `application-groups` restaurado a una línea.** `expo install` lo había reformateado a
      tres.
      **Done:** el diff de `app.json` no muestra ese bloque.
- [x] **W0.5 SKAdNetwork verificado, no escrito a mano.** Los dos identificadores los agrega el
      plugin (`plugin/build/withFacebook.js:54-55`).
      **Done:** el introspect muestra `SKAdNetworkItems` con exactamente `v9wttpbfk9.skadnetwork` y
      `n38lu8286q.skadnetwork`; `app.json` no declara ninguno.
- [x] **W0.6 Manifiesto de privacidad al día.** `NSPrivacyTracking` → `true` y dos dicts nuevos
      (`NSPrivacyCollectedDataTypeDeviceID`, `NSPrivacyCollectedDataTypeProductInteraction`), ambos
      `Linked: false` / `Tracking: true`, con los propósitos `DeveloperAdvertising` y `Analytics`.
      Comentario de cabecera con el porqué y con la razón de que `NSPrivacyTrackingDomains` no vaya.
      **Done:** `node -e "require('./apps/mobile/plugins/with-privacy-manifest.js')"` sale limpio y
      el template contiene los dos tipos.

## W1 · JS

- [x] **W1.1 `lib/meta-sdk.ts`.** `bootMetaSdk()`, `syncMetaTrackingConsent()`,
      `trackMetaCoachRegistered(method)` e `isMetaSdkEnabled()`. Gate `!__DEV__`, todo en try/catch,
      cabecera con el porqué, el alcance mínimo, la 21.719 y el fail-open.
      **Done:** `tsc --noEmit` verde y ninguna función puede lanzar.
- [x] **W1.2 Boot en `app/_layout.tsx`.** `bootMetaSdk()` a nivel de módulo, justo después del
      `SplashScreen.preventAutoHideAsync()`.
      **Done:** está antes de cualquier componente y fuera de todo hook.
- [x] **W1.3 ATT después del splash.** `setTimeout(() => void syncMetaTrackingConsent(), 800)` dentro
      de `handleRootLayout`, después del `SplashScreen.hideAsync()`.
      **Done:** el diálogo no puede aparecer sobre el splash (SPEC §4.3).
- [x] **W1.4 `CompletedRegistration` en los dos caminos del alta.** Google: tras
      `completeCoachOnboarding`, antes del `AsyncStorage.setItem`. Correo: tras `registerCoachFree`,
      antes de `rememberPendingSignup`, **una sola vez** y antes de la bifurcación por `status`. Sin
      `await` en ninguno.
      **Done:** el diff muestra las dos llamadas en esos puntos exactos.
- [x] **W1.5 Espejo en PostHog.** `captureAppEvent('coach_registered', { platform: 'rn', method })`
      junto a cada evento de Meta.
      **Done:** mismo nombre de evento que usa la web.

## W2 · Documentación

- [x] **W2.1 SDD.** `docs/specs/meta-app-events-ios/SPEC.md`, `PLAN.md` y `TASKS.md`.
      **Done:** los tres existen, con frontmatter y sin enlaces rotos (`pnpm docs:check`).
- [x] **W2.2 `docs/operations/MANUAL_TASKS.md`.** Bloque «Meta SDK iOS (2026-09-15)» con los seis
      pasos del owner.
      **Done:** aparece bajo `## P1 — Cierre del build y QA móvil`.
- [x] **W2.3 `docs/status/MOBILE_PARITY.md`.** Nota nueva arriba de todo: tren EN CÓDIGO, paridad de
      medición nueva, runtime 1.1.3 ⇒ build, link al SDD.
      **Done:** es la primera nota del archivo.

## W3 · Gates

- [x] **W3.1 `pnpm --filter @eva/mobile exec tsc --noEmit`.** Verde (exit 0, sin salida).
- [x] **W3.2 `pnpm lint:mobile`.** Verde (exit 0, sin hallazgos).
- [x] **W3.3 `pnpm docs:check`.** Verde.
- [x] **W3.4 `expo config --type introspect`.** `version: '1.1.3'`, `FacebookAppID`,
      `FacebookClientToken`, `FacebookDisplayName`, `NSUserTrackingUsageDescription`,
      `SKAdNetworkItems` con los dos ids y `CFBundleURLSchemes` con `fb28862306396704276`.

## W4 · Build y QA del owner

- [ ] **W4.1 Build EAS iOS producción 1.1.3.** Es el primer lugar donde se compila el módulo nativo:
      valida el riesgo de la nueva arquitectura (SPEC §7).
- [ ] **W4.2 Subir a TestFlight.**
- [ ] **W4.3 QA del owner en device**, los 7 puntos del [SPEC §8](SPEC.md).
- [ ] **W4.4 Android:** decidir si el mismo build sube a Play o espera (SPEC §6).

## W5 · Pasos manuales del owner (Meta y Apple)

Detalle en [MANUAL_TASKS](../../operations/MANUAL_TASKS.md), bloque «Meta SDK iOS (2026-09-15)».

- [ ] **W5.1** App EVA en modo **Activo** en developers.facebook.com.
- [ ] **W5.2** App `28862306396704276` añadida al Business Portfolio y asignada a la cuenta
      publicitaria `260969077862943`.
- [ ] **W5.3** Origen de datos de app conectado (Administrador de eventos → Conectar datos → App →
      SDK de Meta), unido al dataset «EVA Web» si la consola lo ofrece.
- [ ] **W5.4** Medición de eventos agregados con `CompleteRegistration` en **prioridad 1**.
- [ ] **W5.5** App Store Connect → Privacidad de la app → «Datos usados para rastrearte»:
      Identificadores del dispositivo e Interacción con el producto.
- [ ] **W5.6** «Probar eventos» con el build 1.1.3: llegan `fb_mobile_activate_app` y
      `fb_mobile_complete_registration`.
