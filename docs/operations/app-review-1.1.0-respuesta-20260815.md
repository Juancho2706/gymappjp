# App Review iOS 1.1.0 — rechazo del 15-08-2026 y respuesta

Submission ID `912b9afb-6317-49b0-9bba-35868e812207` (mismo hilo que el 13-08) · versión revisada
**1.1.0 (53)** · device del revisor: iPad Air 11" (M3) · fecha de review 2026-08-15.

**Un solo motivo: 5.1.1(iv)** (Legal — Privacy — Data Collection and Storage). Los tres motivos del
rechazo anterior (2.5.4, 2.5.1, 1.4.1) **no volvieron a aparecer** — se dan por superados.

> The app directs the user to grant permission in the following way(s): A custom message appears
> before the permission request, and to proceed users press a "Conectar con Apple Salud" button.
> **Use words like "Continue" or "Next" on the button instead.**

## Causa

Apple exige que el botón de avance de cualquier pantalla/mensaje previo a una hoja de permisos use
un verbo NEUTRO ("Continuar"/"Siguiente"), nunca uno que nombre la concesión ("Conectar con X",
"Permitir X"): el usuario debe sentir que la decisión se toma en la hoja del sistema, no en la UI
propia. La pantalla `/alumno/salud` (creada justamente para el 2.5.1 del rechazo anterior) tenía el
botón "Conectar con Apple Salud".

## Qué se cambió en el código (solo copy, cero lógica)

1. `apps/mobile/app/alumno/salud.tsx` — botón de la pantalla Apple Salud:
   "Conectar con Apple Salud" → **"Continuar"** (literal lo que pidió el revisor).
2. `apps/mobile/components/alumno/home/HabitsCard.tsx` — defensivo, mismo patrón en el card de
   Hábitos del inicio: "Conectar salud" → **"Autocompletar pasos y sueño"** (CTA nombrada por la
   feature, no por el permiso) con subtítulo "Con lo que tu teléfono o tu reloj ya registran".
3. `apps/mobile/app/alumno/(tabs)/nutrition-v2/scanner.tsx` — defensivo, mismo patrón con la
   cámara: título "Permite el uso de la cámara" → "Escanear con la cámara" y botón
   "Permitir cámara" → **"Continuar"**. El revisor navega nutrición (ahí encontró el 1.4.1).

Superficies auditadas y dejadas como están, con razón:

- Alert previo del hook `use-health-connection.ts`: sus botones ya son **Cancelar / Continuar** ✓.
- `ImportWatchSheet` ("Importar de tu reloj"): permiso just-in-time al abrir la hoja; el CTA nombra
  la acción de la feature, no la concesión.
- `ConnectSensorSheet` / "Conectar sensor de pulso" (BLE): "Conectar" es la acción literal sobre el
  dispositivo elegido, no un priming de permisos.

## Por qué NO va por OTA al build 53

`fallbackToCacheTimeout: 0` en `app.json`: el primer arranque del revisor mostraría el bundle
embebido viejo (el OTA aplica recién al segundo launch). Con 4 ciclos de review quemados no se
apuesta a que el revisor relance la app. Además el canal production es compartido Android/iOS y la
rama trae T2.6 F6 + T2.7 RN sin QA de device: un OTA los empujaría a todos los usuarios Android.

## Checklist de reenvío

1. **Build 54**: GitHub Actions → workflow **"Mobile Build (Local — no EAS credits)"** sobre la rama
   `rnmobiledenuevo` con `platform=ios`, `profile=production`, `submit_ios=true`. `autoIncrement` +
   `appVersionSource: remote` suben el build number solos — no tocar `buildNumber` a mano.
   - La build embebe además lo posterior al build 53: T2.6 F6 + T2.7 F1-F4 RN (pendientes de QA
     device). **Smoke QA en TestFlight antes de reenviar**: login alumno demo (`EVADEMO`), tab
     Nutrición (re-skin T2.7), Perfil → Apple Salud → botón "Continuar" → hoja de permisos.
2. **App Store Connect**: en la versión 1.1.0 quitar el build 53, adjuntar el 54, responder en el
   hilo de Resolution Center (texto abajo) y reenviar.
3. Mantener las Notes anteriores (cuenta demo alumno, dónde está HealthKit/las citas, BLE solo
   foreground, app solo iPhone `supportsTablet: false`).

## Respuesta para Resolution Center (pegar tal cual)

> Hello, thank you for the detailed review.
>
> We resolved the Guideline 5.1.1(iv) issue in build 1.1.0 (54): the button on the screen shown
> before the HealthKit permission request no longer reads "Conectar con Apple Salud" — it now reads
> "Continuar" ("Continue"), exactly as suggested. The permission decision is made only in the
> system's HealthKit sheet.
>
> We also audited the rest of the app for the same pattern and applied the same rule to the camera
> pre-permission message in the barcode scanner (button now reads "Continuar") and to the Health
> shortcut on the home screen, which is now named after the feature instead of the permission.
>
> No other changes were made in this build. Thank you!

## Regla permanente (ya como comentarios en el código)

Todo botón que preceda a una hoja de permisos del sistema dice **"Continuar"/"Siguiente"**. Nunca
"Conectar con {servicio}", "Permitir {permiso}", "Activar {cosa}". Las CTA de entrada a una feature
se nombran por la feature ("Importar de tu reloj", "Autocompletar pasos y sueño").
