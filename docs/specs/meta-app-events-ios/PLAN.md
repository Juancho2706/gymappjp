---
status: active
owner: product-engineering
last_verified: "2026-09-15"
canonical: false
---

# PLAN — Eventos de app de Meta (iOS)

Ejecución del [SPEC](SPEC.md). Tareas con checkbox en [TASKS.md](TASKS.md). Todo lo verificado
contra HEAD `55c3568e`.

## 1. Arquitectura por capa

```text
app.json  +  plugins/with-privacy-manifest.js          (W0 · configuración nativa)
  plugin de fbsdk (appID/clientToken/scheme/SKAdNetwork)
  plugin de ATT (userTrackingPermission)
  version 1.1.2 → 1.1.3   ⇒ runtime nuevo, NO viaja por OTA
  NSPrivacyTracking true + DeviceID + ProductInteraction
        │
        └─► lib/meta-sdk.ts                            (W1 · JS)
              bootMetaSdk()             ──► app/_layout.tsx (nivel de módulo)
              syncMetaTrackingConsent() ──► app/_layout.tsx (handleRootLayout + 800 ms)
              trackMetaCoachRegistered()──► app/(auth)/register.tsx (los dos caminos)
```

**Qué NO se toca**: `extra.facebookAppId` (lo usa el share a Stories), `buildNumber`/`versionCode`
(los autoincrementa EAS), los endpoints de alta de `apps/web`, el píxel y el CAPI de la web, y
`lib/analytics.ts` (se **usa** `captureAppEvent`, no se modifica).

**Orden duro**: W0 → W1 → W2 → W3 → W4 → W5.

## 2. Reparto de archivos

### W0 · Configuración nativa

| Archivo | Cambio |
|---|---|
| `apps/mobile/app.json` | Entradas de plugin peladas → con config (`react-native-fbsdk-next`, `expo-tracking-transparency`); `version` `1.1.2` → `1.1.3`; restaurar `com.apple.security.application-groups` a una línea (lo reformateó `expo install`) |
| `apps/mobile/plugins/with-privacy-manifest.js` | `NSPrivacyTracking` → `true`; dos dicts nuevos en `NSPrivacyCollectedDataTypes`; comentario de cabecera con el porqué |

### W1 · JS

| Archivo | Cambio |
|---|---|
| `apps/mobile/lib/meta-sdk.ts` | **Nuevo.** `bootMetaSdk`, `syncMetaTrackingConsent`, `trackMetaCoachRegistered`, `isMetaSdkEnabled`; gate `!__DEV__`; todo en try/catch |
| `apps/mobile/app/_layout.tsx` | `bootMetaSdk()` a nivel de módulo tras el `preventAutoHideAsync`; `setTimeout(() => void syncMetaTrackingConsent(), 800)` dentro de `handleRootLayout`, después del `hideAsync` |
| `apps/mobile/app/(auth)/register.tsx` | `trackMetaCoachRegistered('google'\|'email')` + `captureAppEvent('coach_registered', …)` en los dos caminos, sin `await` |

### W2 · Documentación

| Archivo | Cambio |
|---|---|
| `docs/specs/meta-app-events-ios/{SPEC,PLAN,TASKS}.md` | Este paquete SDD |
| `docs/operations/MANUAL_TASKS.md` | Bloque «Meta SDK iOS (2026-09-15)» con los 6 pasos del owner |
| `docs/status/MOBILE_PARITY.md` | Nota del tren EN CÓDIGO (sin build) |

### W3 · Gates (los corre el worker)

```bash
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm lint:mobile
pnpm docs:check
cd apps/mobile && pnpm exec expo config --type introspect
```

Del `introspect` tienen que aparecer: `version: '1.1.3'`, `FacebookAppID`, `FacebookClientToken`,
`FacebookDisplayName`, `NSUserTrackingUsageDescription`, `SKAdNetworkItems` con **exactamente dos**
identificadores y `CFBundleURLSchemes` con `fb28862306396704276`.

**Lo que estos gates NO cubren**: la compilación nativa. `tsc` y `expo config` no tocan Xcode, así
que el riesgo de la nueva arquitectura (SPEC §7) se resuelve recién en W4.

### W4 · Build y QA

1. Build EAS iOS **producción** 1.1.3 (`buildNumber` autoincrementado por EAS).
2. Subir a TestFlight.
3. QA del owner: los 7 puntos del [SPEC §8](SPEC.md#8-qa-después-del-build-113).

### W5 · Pasos manuales del owner (Meta y Apple)

Los seis del bloque «Meta SDK iOS (2026-09-15)» en
[MANUAL_TASKS](../../operations/MANUAL_TASKS.md): app en modo Activo, app asignada a la cuenta
publicitaria, origen de datos de app conectado al dataset, Medición de eventos agregados con
`CompleteRegistration` en prioridad 1, declaración de privacidad en App Store Connect y verificación
en «Probar eventos».

Los de Meta (a)-(d) se pueden hacer **antes** del build; (f) exige el build en el device.

## 3. Dependencias entre workers

W1 no arranca sin W0 (el plugin pelado hace fallar cualquier `expo config`). W2 es independiente de
W1 pero cita sus archivos, así que va después. W4 depende de W0+W1. W5 solo depende de que el owner
tenga tiempo, salvo (f).
