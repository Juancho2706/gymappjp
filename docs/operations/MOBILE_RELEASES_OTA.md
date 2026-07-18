# Mobile — Estrategia de releases + EAS/OTA

> Fuente de verdad: `specs/rn-mobile-parity-redesign/PLAN.md` §"Estrategia de releases + EAS/OTA".
> Esta página resume la política operativa para la app RN (`apps/mobile`).

## Política

- **SDK 54 congelado** para todo el proyecto de paridad (SPEC Non-Goal). EAS CLI pineado en `eas.json`/CI.
- **OTA (`expo-updates`) = solo cambios JS-only** entre releases de store. `runtimeVersion: appVersion`
  ya está configurado en `app.json` → un OTA solo aplica a binarios cuya `version` coincide.
- **Libs nativas fuerzan build EAS + submit** (no viajan por OTA). Se agregan en **batch al inicio**
  de la etapa que las necesita — nunca a goteo mid-etapa (fragmenta versiones en campo):
  - E0 (etapa actual): **Sentry** (`@sentry/react-native`), view-shot, tooling Maestro-friendly.
  - E5: Google Sign-In.
  - notifee: solo si el badging nativo lo exige (evaluar).
- **Release a stores solo al cierre de etapa** (estado consistente). Sin congelar stores: hotfixes de
  la app actual siguen saliendo por OTA/build según corresponda.
- **Flags locales** (`lib/flags.ts`) ocultan pantallas incompletas dentro de una etapa; se borran al
  cerrar la etapa (no acumular flags muertos).

## OTA en runtime (E0-G6)

- `apps/mobile/lib/ota.ts` (`checkForOtaUpdate`): `checkForUpdateAsync` + `fetchUpdateAsync` +
  prompt suave de reinicio (`Alert`). Invocado en `app/_layout.tsx` al abrir la app y al volver de
  background (`AppState` → `active`).
- **Gating:** no-op total en `__DEV__` y si `Updates.isEnabled` es `false`. Throttle: máx 1 check por
  hora. Best-effort: cualquier error se traga en silencio (el update se aplicará en el próximo
  lanzamiento vía el fetch-on-launch por defecto).

## Rollback

- Rollback JS-only = re-release del OTA anterior (compatible por `runtimeVersion`).
- Rollback nativo = el binario anterior sigue en stores → detener el phased rollout.
- Migraciones DB del plan son aditivas (GRANTs) → reversa = REVOKE documentado en la migración.
