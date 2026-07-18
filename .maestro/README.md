# Maestro — flows E2E mobile (alumno)

Flows declarativos para el flujo alumno de `apps/mobile` (Expo, `appId: cl.evaapp.eva`,
ver `apps/mobile/app.json`). Parte del proyecto de paridad RN mobile
(`specs/rn-mobile-parity-redesign/`, hito E0-G2).

## Estado actual (2026-07-08)

Los 4 flows están **escritos pero SIN correr** — bloqueado en este audit por falta de
`testID` en las pantallas del alumno (login, código, home, workout, nutrición, check-in).
Cada flow usa selectores por texto visible como fallback y documenta en comentarios los
`testID` que faltan agregar. Antes de la primera corrida real:

1. Agregar los `testID` listados en los comentarios de cada `.yaml` (PR aparte de mobile,
   fuera de alcance de este audit — NO se tocan las pantallas acá).
2. Reemplazar los selectores por texto por selectores `id:` una vez existan los `testID`
   (más robustos ante cambios de copy/idioma).
3. Correr contra una cuenta de alumno de prueba real (ver `MEMORY.md` →
   "Cuentas de prueba permanentes" — usar una de esas, NUNCA una cuenta real de coach/alumno).

## Requisitos

- [Maestro CLI](https://maestro.mobile.dev/getting-started/installing-maestro) instalado
  (`curl -Ls "https://get.maestro.mobile.dev" | bash`, o vía Homebrew en macOS).
- Build de `apps/mobile` instalada en un simulador/emulador o dispositivo conectado
  (`cd apps/mobile && npx expo run:ios` / `run:android`, o un build de EAS).
- Variables de entorno con credenciales de una cuenta de alumno de prueba (NUNCA
  hardcodear credenciales reales en los `.yaml`):
  ```bash
  export EVA_COACH_CODE="<código o link corto del coach de prueba>"
  export EVA_ALUMNO_EMAIL="<email de la cuenta de alumno de prueba>"
  export EVA_ALUMNO_PASSWORD="<password de la cuenta de alumno de prueba>"
  ```

## Correr los flows

Un flow individual:
```bash
maestro test .maestro/alumno-login.yaml
```

Todos los flows del alumno en orden (login primero, deja sesión persistida para el resto):
```bash
maestro test .maestro/alumno-login.yaml .maestro/alumno-workout.yaml .maestro/alumno-comida.yaml .maestro/alumno-checkin.yaml
```

Modo interactivo (Maestro Studio, útil para descubrir selectores reales en el simulador):
```bash
maestro studio
```

## Convenciones de este set de flows

- `appId: cl.evaapp.eva` en cada flow (mismo bundle ID iOS/Android, ver `apps/mobile/app.json`).
- `alumno-login.yaml` usa `clearState: true` (arranque limpio); los otros 3 usan
  `clearState: false` para reusar la sesión dejada por login — correrlos sueltos sin login
  previo fallará.
- Los textos usados como selector son literales de UI capturados en este audit — si cambia
  el copy de una pantalla, el flow correspondiente rompe y hay que actualizarlo junto con
  el cambio de copy (mismo PR).
- Comentarios `# testIDs faltantes` en cada flow: lista viva, se va vaciando a medida que
  mobile agrega los `testID`. No borrar la sección hasta que el flow use `id:` en el 100%
  de sus pasos interactivos.

## Relación con `docs/audits/rn-parity-qa/`

Estos flows son para regresión funcional (¿el flujo completa sin romperse?), no para
paridad visual. Las capturas de pantalla comparativas web/RN viven en
`docs/audits/rn-parity-qa/` — Maestro puede generar capturas con el comando `takeScreenshot`
dentro de un flow si se quiere automatizar esa carpeta a futuro (no implementado en esta
ronda).
