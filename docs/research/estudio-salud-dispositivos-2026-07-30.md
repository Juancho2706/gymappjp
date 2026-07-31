# Estudio de conectividad con dispositivos y apps de salud (EVA RN, Expo SDK 54)

Hallazgos 6 (BLE pulsometros) y 19 (Conectar Salud) — parte RESEARCH INTERNET + auditoria de codigo.
Fecha: 2026-07-30. Autor: worker QA4 (read-only, no se toco ningun archivo del repo).

---

## 0. Resumen ejecutivo (para el CEO)

EVA ya tiene TODO el codigo JS de salud escrito y bien pensado (BLE GATT 0x180D, HealthKit,
Health Connect, degradacion honesta, permisos just-in-time). **Los dos hallazgos NO son bugs de
producto: son dos agujeros de CONFIGURACION NATIVA que solo aparecen en build EAS real.**

| # | Sintoma reportado | Root cause verificado | Severidad |
|---|---|---|---|
| 6 | "El scan BLE no encuentra nada y no pide nada" | El flag `neverForLocation` NUNCA llega al manifest (colision entre `android.permissions` de app.json y el config plugin de ble-plx). En Android 12+ el scan devuelve 0 resultados y 0 errores. | **P0 bloqueante** |
| 6b | "A veces tira error raro apenas abro" | `startScan` no espera a que el adaptador BLE este en `PoweredOn` (iOS arranca en `Unknown`); y `new BleManager()` corre al IMPORTAR el modulo → prompt de Bluetooth iOS sin que el usuario toque nada. | P1 |
| 19 | "Conectar Salud saca de la app" | En Android, `HealthConnectPermissionDelegate.setPermissionDelegate()` NUNCA se llama. `requestPermission()` revienta con `UninitializedPropertyAccessException` dentro de una corrutina SIN handler → **crash nativo del proceso**, imposible de atrapar desde JS. | **P0 crash** |
| 19b | Riesgo de rechazo en Play/Health Connect | Falta el `activity-alias ViewPermissionUsageActivity` que Android 14+ exige para el link de politica de privacidad. Falta tambien el formulario "Health apps declaration" en Play Console (obligatorio desde 2025-01-22, endurecido en 2026-01). | **P0 de release** |
| 19c | iOS: HealthKit no va a funcionar en el build | `eas.json` usa `credentialsSource: "local"` con un `.mobileprovision` viejo (`evaapp_production.mobileprovision`) que NO tiene la capability HealthKit. EAS no puede auto-sincronizar capabilities con credenciales locales. | **P0 de build** |

Ademas: **Apple Watch y Galaxy Watch NO pueden dar pulso EN VIVO a EVA.** No es una limitacion de
EVA, es una limitacion de plataforma. Ver §5. El texto "honesto" que ya esta en
`ConnectSensorSheet.tsx:16` es tecnicamente correcto y hay que mantenerlo.

---

## 1. Estado del proyecto (lo que ya esta elegido y instalado)

Leido de `apps/mobile/package.json` y `apps/mobile/app.json`:

| Cosa | Valor | Nota |
|---|---|---|
| Expo SDK | `expo ~54.0.36` | RN 0.81.5, `newArchEnabled: true` |
| BLE | `react-native-ble-plx ^3.5.1` | Config plugin PROPIO de la lib (ya no `@config-plugins/...`) |
| iOS Salud | `react-native-health ^1.19.0` (agencyenterprise) | Modulo legacy ObjC, corre por interop layer |
| Android Salud | `react-native-health-connect ^3.5.3` (matinzd) | Instalado como plugin string `"react-native-health-connect"` |
| Health Connect alt | — | NO se usa `expo-health-connect` (es otro paquete, ver §3.2) |
| minSdkVersion | 26 (`expo-build-properties`) | Correcto para Health Connect |
| Bundle iOS | `cl.evaapp.eva`, team `5GKWMMZ46Q` | |

Codigo propio de EVA (todo bien escrito, la falla no esta aca):
- `apps/mobile/lib/ble-hr.ts` — controlador BLE + `useBleHr()`
- `apps/mobile/lib/ble-hr-parse.ts` — parser puro 0x2A37
- `apps/mobile/lib/health-aggregators.ts` — HealthKit + Health Connect unificados
- `apps/mobile/components/alumno/workout/v3/ConnectSensorSheet.tsx` — UI del sensor
- `apps/mobile/components/alumno/workout/v3/CardioScreenV3.tsx:117-118` — consumo
- `apps/mobile/components/alumno/home/HabitsCard.tsx:105-148` — flujo "Conectar Salud"

---

## 2. HALLAZGO 6 — BLE pulsometros (cintas / relojes en modo broadcast)

### 2.1 Como funciona el perfil BLE Heart Rate (contexto)

El estandar GATT define el **Heart Rate Service `0x180D`** con la caracteristica
**Heart Rate Measurement `0x2A37`** (notify). Cualquier cinta de pecho o brazalete optico del
mercado (Polar H9/H10/Verity, Garmin HRM, Wahoo TICKR, Coospo, Magene, Scosche Rhythm, Decathlon)
lo implementa. Con UNA sola integracion se leen todos. EVA ya lo hace bien:
`ble-hr.ts:186` filtra el scan por `HR_SERVICE_UUID`, y `ble-hr.ts:260-277` se suscribe a `0x2A37`.

El parser de `0x2A37` de EVA (`ble-hr-parse.ts`) maneja el bit 0 del flags byte (uint8 vs uint16),
que es lo correcto.

### 2.2 ROOT CAUSE P0 — el flag `neverForLocation` nunca llega al manifest

**Esto es lo que hace que el scan falle "sin pedir nada".**

Android 12 (API 31) partio los permisos de Bluetooth. Hay dos caminos legales para escanear:

- **Camino A (legacy):** declarar `BLUETOOTH_SCAN` "a secas" ⇒ el sistema asume que los resultados
  del scan PUEDEN usarse para derivar ubicacion ⇒ **exige tambien `ACCESS_FINE_LOCATION` concedido
  en runtime**. Si no esta, el `ScanCallback` **no recibe NADA y NO reporta error**.
- **Camino B (moderno):** declarar
  `<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" tools:targetApi="31"/>`
  ⇒ ya no hace falta ubicacion. Es el camino que EVA quiere (`app.json:150` tiene
  `"neverForLocation": true`).

**Lo que realmente pasa en el prebuild de EVA:**

1. `app.json:46-47` declara a mano en `android.permissions`:
   ```json
   "android.permission.BLUETOOTH_SCAN",
   "android.permission.BLUETOOTH_CONNECT",
   ```
   Expo aplica `AndroidConfig.Permissions.withPermissions` y escribe
   `<uses-permission android:name="android.permission.BLUETOOTH_SCAN"/>` **sin ningun flag**.

2. Despues corre el config plugin de la libreria. Su codigo
   (`apps/mobile/node_modules/react-native-ble-plx/plugin/build/withBLEAndroidManifest.js`,
   funcion `addScanPermissionToManifest`) es:
   ```js
   if (!androidManifest.manifest['uses-permission'].find(
         item => item.$['android:name'] === 'android.permission.BLUETOOTH_SCAN')) {
     // ...aca recien agrega usesPermissionFlags: 'neverForLocation'
   }
   ```
   Como el permiso **ya existe** (paso 1), el `if` es falso y el plugin **hace early-exit**.
   El flag `neverForLocation` **jamas se escribe**.

3. En cambio `addLocationPermissionToManifest` SI corre completo (nadie declaro location en
   app.json) y escribe:
   ```xml
   <uses-permission-sdk-23 android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30"/>
   ```
   O sea: **ubicacion topeada en API 30**.

**Resultado combinado en Android 12+:** el sistema pide `ACCESS_FINE_LOCATION` para entregar
resultados de scan (camino A), pero ese permiso ni siquiera esta declarado para API 31+
(`maxSdkVersion=30`), asi que es **imposible de conceder**. El scan arranca, no falla, y no
entrega ningun dispositivo. Nunca.

**VERIFICACION EMPIRICA** — manifest generado por el prebuild local
(`apps/mobile/android/app/src/main/AndroidManifest.xml`, gitignored pero es la salida real del
config actual):
```xml
<uses-permission-sdk-23 android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30"/>
...
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"/>   <!-- SIN usesPermissionFlags -->
```
Confirmado: falta el flag y falta el `tools:targetApi="31"`.

**Como se ve para el alumno:** toca "Conectar sensor" → `PermissionsAndroid.requestMultiple`
(`ble-hr.ts:117-120`) concede BLUETOOTH_SCAN/CONNECT sin drama (por eso "no pide nada raro") →
`startDeviceScan` (`ble-hr.ts:186`) → radar girando 15 s → timeout de `SCAN_TIMEOUT_MS`
(`ble-hr.ts:205-207`) → vuelve a `idle` con la lista vacia y **cero explicacion**.

### 2.3 SPEC DE FIX 6.1 (P0)

**Opcion recomendada (A): sacar los permisos BLE de `app.json` y dejar que el plugin los ponga.**

`apps/mobile/app.json` — borrar de `android.permissions` (lineas 46-47):
```diff
-        "android.permission.BLUETOOTH_SCAN",
-        "android.permission.BLUETOOTH_CONNECT",
```
El plugin `react-native-ble-plx` (ya declarado en `app.json:145-153`) agrega por su cuenta
`BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT` y `BLUETOOTH_SCAN + neverForLocation`.

**Opcion defensiva (B), recomendada ADEMAS de A porque el orden de mods de Expo puede volver a
morder:** un config plugin propio que fuerce el atributo al final del pipeline.

Nuevo archivo `apps/mobile/plugins/with-ble-never-for-location.js`:
```js
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins')

/**
 * Blindaje: garantiza que BLUETOOTH_SCAN lleve `usesPermissionFlags="neverForLocation"`.
 * Sin este flag, en Android 12+ el scan BLE no devuelve NADA y tampoco reporta error,
 * porque el sistema exige ACCESS_FINE_LOCATION (que el plugin de ble-plx topea en API 30).
 * El plugin de la lib hace early-exit si el permiso ya existe (lo declara app.json), asi que
 * el flag se pierde. Este mod corre al final y lo repone.
 */
module.exports = function withBleNeverForLocation(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest
    AndroidConfig.Manifest.ensureToolsAvailable(cfg.modResults)
    manifest['uses-permission'] = manifest['uses-permission'] || []
    const scan = manifest['uses-permission'].find(
      (p) => p.$['android:name'] === 'android.permission.BLUETOOTH_SCAN',
    )
    if (scan) {
      scan.$['android:usesPermissionFlags'] = 'neverForLocation'
      scan.$['tools:targetApi'] = '31'
    }
    // Permisos legacy: topearlos en 30 evita el warning de Play Console.
    for (const legacy of ['android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_ADMIN']) {
      const p = manifest['uses-permission'].find((x) => x.$['android:name'] === legacy)
      if (p) p.$['android:maxSdkVersion'] = '30'
    }
    // BLE opcional: sin esto Play puede filtrar dispositivos sin BLE del listado.
    manifest['uses-feature'] = manifest['uses-feature'] || []
    if (!manifest['uses-feature'].find((f) => f.$['android:name'] === 'android.hardware.bluetooth_le')) {
      manifest['uses-feature'].push({
        $: { 'android:name': 'android.hardware.bluetooth_le', 'android:required': 'false' },
      })
    }
    return cfg
  })
}
```
Registrarlo en `app.json` **despues** de `"react-native-ble-plx"`:
```json
"./plugins/with-ble-never-for-location",
```

**Validacion obligatoria antes del build EAS:**
```
npx expo prebuild --platform android --clean
```
y grepear el manifest generado buscando `usesPermissionFlags="neverForLocation"`. Si no aparece,
el fix no quedo.

### 2.4 ROOT CAUSE P1 — no se espera el estado del adaptador (iOS y Android)

`ble-hr.ts:173-211` `startScan()` va directo a `manager.startDeviceScan(...)` sin consultar
`manager.state()`.

- **iOS:** `CBCentralManager` arranca en estado `Unknown` y tarda 100-500 ms en resolver a
  `PoweredOn`. Escanear en `Unknown` falla (`BluetoothLE is powered off` / `BluetoothUnsupported`).
  La doc de ble-plx es explicita: hay que usar `onStateChange(listener, true)` y escanear recien
  cuando llega `PoweredOn`.
- **Android con Bluetooth apagado:** el listener recibe error y EVA muestra
  `'No se pudo buscar sensores'` (`ble-hr.ts:188`), un mensaje que no le dice al alumno que tiene
  que prender el Bluetooth.

**Sobre "pedir encender Bluetooth":**
- `manager.enable()` de ble-plx esta **DEPRECADO y no funciona**. Textual en
  `node_modules/react-native-ble-plx/src/BleManager.js:36-37`:
  > *"The enable and disable feature is no longer supported. In Android SDK 31+ there were major
  > changes in permissions... and in SDK 33+ they were completely removed."*
- **Android:** el camino soportado es mandar al usuario a ajustes. Sin agregar dependencias:
  `Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')`. (La alternativa
  `BluetoothAdapter.ACTION_REQUEST_ENABLE` via `expo-intent-launcher` muestra el dialogo modal
  lindo, pero suma una dependencia y una build nativa mas.)
- **iOS:** **no existe API para prender el Bluetooth ni para abrir el toggle**. Apple lo prohibe.
  Lo unico legal es texto: "Prende el Bluetooth desde el Centro de Control". `Linking.openURL('App-Prefs:Bluetooth')`
  es un URL scheme privado → **rechazo seguro en review**. NO usarlo.

### 2.5 SPEC DE FIX 6.2 (P1)

En `apps/mobile/lib/ble-hr.ts`:

1. Agregar `'bluetooth-off'` al union `BleStatus` (linea 36).
2. Nuevo helper antes de escanear:
```ts
/** Espera a que el adaptador este PoweredOn. En iOS el manager arranca en 'Unknown'. */
function waitForPoweredOn(manager: MinimalManager, timeoutMs = 4000): Promise<string> {
  return new Promise((resolve) => {
    let done = false
    const finish = (s: string) => { if (!done) { done = true; sub?.remove(); resolve(s) } }
    const sub = manager.onStateChange((state) => {
      if (state === 'PoweredOn' || state === 'PoweredOff' || state === 'Unauthorized' ||
          state === 'Unsupported') finish(state)
    }, true) // <- emitCurrentState = true
    setTimeout(() => finish('Unknown'), timeoutMs)
  })
}
```
   (hay que sumar `onStateChange` y `state` al type `MinimalManager` de `ble-hr.ts:78-87`).
3. En `startScan()`, despues de `ensureBlePermissions()`:
```ts
const btState = await waitForPoweredOn(manager)
if (btState !== 'PoweredOn') {
  this.set({
    status: 'bluetooth-off',
    error: btState === 'Unauthorized'
      ? 'EVA no tiene permiso de Bluetooth. Activalo en Ajustes.'
      : 'Prende el Bluetooth para buscar tu sensor.',
  })
  return
}
```
4. En `ConnectSensorSheet.tsx`, para `status === 'bluetooth-off'` mostrar el mensaje + un CTA:
   - Android: `Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')`
   - iOS: sin CTA, solo el texto ("Centro de Control → Bluetooth").
   Y al volver a foco (`AppState` 'active') reintentar `startScan()` automaticamente.

### 2.6 ROOT CAUSE P1 — el `BleManager` se instancia al IMPORTAR el modulo

`ble-hr.ts:317` `const controller = new BleHrController()` corre en tiempo de modulo, y el
inicializador de campo `ble-hr.ts:142` llama `isBleAvailable()` → `loadManager()` → `new mod.BleManager()`.

`CardioScreenV3.tsx:20` importa el modulo ⇒ **con solo abrir cardio se crea el `CBCentralManager`
en iOS**, lo cual dispara el alert de permiso de Bluetooth del sistema **antes de que el alumno
toque "Conectar sensor"**. Contradice la propia regla del archivo ("permisos JUST-IN-TIME, al
tocar Conectar, nunca al abrir la app", `ble-hr.ts:110`). Ademas enciende la radio BLE y consume
bateria en toda sesion de cardio aunque nadie use sensor.

**Fix:** separar "¿existe la libreria?" de "¿instanciar el manager?":
```ts
let libAvailable: boolean | null = null
/** ¿Existe el binding nativo? NO instancia el manager (eso dispara el prompt iOS). */
export function isBleAvailable(): boolean {
  if (libAvailable === null) {
    try { require('react-native-ble-plx'); libAvailable = true } catch { libAvailable = false }
  }
  return libAvailable
}
// loadManager() sigue igual pero SOLO se llama desde startScan()/connect()/stopScan().
```
y cambiar `ble-hr.ts:142` a `status: isBleAvailable() ? 'idle' : 'unavailable'` usando la version
liviana. El `new BleManager()` queda dentro de `startScan()`.

### 2.7 Comparacion con la web PWA

**No hay paridad posible ni deseable.** La web usa Web Bluetooth
(`navigator.bluetooth.requestDevice`), que en el stack de EVA no existe: iOS Safari **no
implementa Web Bluetooth** (Apple lo rechazo explicitamente por privacidad) y en Android Chrome
exige un gesto del usuario + HTTPS y no reconecta en background. Es decir: **el pulso en vivo es
una feature exclusiva de la app nativa**, y eso es un argumento de venta, no una deuda de paridad.
La web debe limitarse a mostrar el `actual_avg_hr` que la app ya guarda (que es exactamente lo que
hace hoy).

---

## 3. HALLAZGO 19 — "Conectar Salud" (HealthKit + Health Connect)

### 3.1 Health Connect en 2026: por que aparece Play Store

Estado verificado en `developer.android.com/health-and-fitness/health-connect/get-started`:

| Version de Android | Donde vive Health Connect | Que tiene que hacer el alumno |
|---|---|---|
| **Android 14+ (API 34+)** | **Modulo del framework**, viene con el sistema | Nada. Ajustes → Seguridad y privacidad → Controles de privacidad → Health Connect |
| **Android 9-13 (API 28-33)** | **App de Google Play** (`com.google.android.apps.healthdata`) | **Instalarla desde Play Store** |
| Android 8 (API 26-27) | No disponible | Health Connect no soporta |

**Esto es exactamente lo que explica "el salto a Play Store"** que se vio en QA: en un telefono
Android 13 o menor sin la app instalada, el flujo correcto es mandarlo a Play. El codigo de EVA ya
lo contempla (`health-aggregators.ts:146-171` `getAndroidHealthAvailability()` +
`HabitsCard.tsx:123-133` con el toast "Instala/Actualiza Health Connect desde Google Play"), pero
hoy **solo muestra un toast; no abre Play**. Ver fix 19.4.

Contexto adicional: **Google Fit APIs quedan fuera de servicio a fines de 2026** y desde
2024-05-01 no se aceptan altas nuevas. Health Connect es el unico camino. La eleccion de
`react-native-health-connect` es correcta y esta bien temporizada.

Requisito de dispositivo poco conocido: **Health Connect exige bloqueo de pantalla activo**
(PIN / patron / contrasena). En un telefono QA sin bloqueo, Health Connect rechaza el acceso. Vale
la pena revisarlo antes de culpar al codigo.

### 3.2 ROOT CAUSE P0 — CRASH NATIVO: el permission delegate nunca se registra

**Este es el "Conectar Salud te saca de la app".** Cadena verificada linea por linea:

1. `health-aggregators.ts:180` llama `hc.requestPermission(ANDROID_READ_PERMS)`.
2. Eso entra a
   `node_modules/react-native-health-connect/android/src/main/java/dev/matinzd/healthconnect/HealthConnectManager.kt:66-76`:
   ```kotlin
   fun requestPermission(reactPermissions: ReadableArray, promise: Promise) {
     throwUnlessClientIsAvailable(promise) {
       coroutineScope.launch {                                  // Dispatchers.IO, SIN handler
         val granted = HealthConnectPermissionDelegate.launchPermissionsDialog(...)
         promise.resolve(...)
       }
     }
   }
   ```
   **No hay `try/catch` adentro de la corrutina** (comparar con `revokeAllPermissions`, que si lo
   tiene).
3. `HealthConnectPermissionDelegate.kt:19-20` declara:
   ```kotlin
   private lateinit var requestPermission: ActivityResultLauncher<Set<String>>
   ```
   y solo se inicializa en `setPermissionDelegate(activity)` (linea 22).
4. **`setPermissionDelegate` NO se llama en ningun lado.** Verificado con grep sobre todo el
   modulo nativo: las unicas apariciones son la definicion y los dos `launch*Dialog`. No hay
   auto-registro en `HealthConnectPackage.kt` ni en `HealthConnectModule.kt`.
5. El config plugin que trae la libreria
   (`node_modules/react-native-health-connect/app.plugin.js`) hace **una sola cosa**: empujar el
   `intent-filter` de `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` a la MainActivity. **No
   toca MainActivity.kt.** La doc oficial de la lib dice que hay que agregar a mano en
   `MainActivity.onCreate`:
   ```kotlin
   HealthConnectPermissionDelegate.setPermissionDelegate(this)
   ```
   En un proyecto Expo CNG (prebuild sin `android/` versionado, que es el caso de EVA —
   `apps/mobile/.gitignore:47` ignora `/android`) **ese paso manual se pierde en cada prebuild**.

**Consecuencia exacta:** `requestPermission.launch(...)` lanza
`kotlin.UninitializedPropertyAccessException: lateinit property requestPermission has not been
initialized` **dentro de una corrutina sin `CoroutineExceptionHandler`** ⇒ excepcion no capturada
⇒ el handler por defecto de la JVM **mata el proceso**. La app se cierra.

Y es **imposible de mitigar desde JS**: el `try/catch` de `health-aggregators.ts:173-185` y el de
`HabitsCard.tsx:142-144` nunca ven nada porque la excepcion no viaja por el puente; la Promise ni
siquiera se rechaza (queda colgada para siempre — de hecho, si no crasheara, el spinner
"Conectando..." quedaria pegado, que es el otro sintoma clasico de este mismo bug).

### 3.3 SPEC DE FIX 19.1 (P0) — config plugin propio que inyecta el delegate

Nuevo archivo `apps/mobile/plugins/with-health-connect-delegate.js`:
```js
const { withMainActivity } = require('expo/config-plugins')

/**
 * react-native-health-connect exige que MainActivity registre el ActivityResultLauncher
 * en onCreate. Su config plugin NO lo hace (solo agrega el intent-filter de rationale), y
 * como EVA usa CNG (android/ es gitignored) el paso manual se pierde en cada prebuild.
 * Sin esto, requestPermission() lanza UninitializedPropertyAccessException dentro de una
 * corrutina sin handler => CRASH NATIVO no atrapable desde JS ("Conectar Salud saca de la app").
 */
const IMPORT_LINE = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate'
const CALL_LINE = '    HealthConnectPermissionDelegate.setPermissionDelegate(this)'

module.exports = function withHealthConnectDelegate(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('with-health-connect-delegate: MainActivity debe ser Kotlin')
    }
    let src = cfg.modResults.contents
    if (!src.includes(IMPORT_LINE)) {
      src = src.replace(/^(package .*\n)/m, `$1\n${IMPORT_LINE}\n`)
    }
    if (!src.includes('setPermissionDelegate')) {
      // Insertar JUSTO DESPUES del super.onCreate(...) de MainActivity.
      src = src.replace(
        /(super\.onCreate\([^)]*\))/,
        `$1\n${CALL_LINE}`,
      )
    }
    if (!src.includes('setPermissionDelegate')) {
      throw new Error('with-health-connect-delegate: no se pudo inyectar en onCreate')
    }
    cfg.modResults.contents = src
    return cfg
  })
}
```

Ojo con la MainActivity que genera Expo SDK 54: el `onCreate` es
```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
  setTheme(R.style.AppTheme)
  super.onCreate(null)
}
```
(el `super.onCreate(null)` con `null` es intencional de Expo). El regex de arriba lo cubre.
`registerForActivityResult` **debe** llamarse antes de que la Activity llegue a `STARTED`, o sea
dentro de `onCreate` — por eso va inmediatamente despues del `super.onCreate`.

Registrarlo en `app.json`, **despues** de `"react-native-health-connect"`:
```json
"react-native-health-connect",
"./plugins/with-health-connect-delegate",
```

**Validacion:** `npx expo prebuild --platform android --clean` y confirmar que
`apps/mobile/android/app/src/main/java/cl/evaapp/eva/MainActivity.kt` contiene
`HealthConnectPermissionDelegate.setPermissionDelegate(this)`.

### 3.4 ROOT CAUSE P0 de release — falta el `activity-alias` de Android 14+

Health Connect obliga a exponer una pantalla de politica de privacidad, y **el mecanismo cambia
segun la version**:

- **Android <= 13:** `intent-filter` con `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` en
  una Activity. ✅ **EVA lo tiene** (lo pone el plugin de la lib; verificado en el manifest
  generado, ultimo `intent-filter` de `.MainActivity`).
- **Android 14+ (API 34+):** hace falta ADEMAS un `activity-alias`:
  ```xml
  <activity-alias
      android:name="ViewPermissionUsageActivity"
      android:exported="true"
      android:targetActivity=".MainActivity"
      android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
    <intent-filter>
      <action android:name="android.intent.action.VIEW_PERMISSION_USAGE"/>
      <category android:name="android.intent.category.HEALTH_PERMISSIONS"/>
    </intent-filter>
  </activity-alias>
  ```
  ❌ **EVA NO lo tiene.** Verificado por ausencia en
  `apps/mobile/android/app/src/main/AndroidManifest.xml`.

Impacto: en Android 14/15/16 (que es la mayoria del parque hoy), el link "Politica de privacidad"
dentro de Health Connect no lleva a ningun lado, y **la revision de Google Play para apps con
permisos `android.permission.health.*` valida justamente eso**.

**Fix (agregar al mismo plugin o a uno nuevo `plugins/with-health-connect-manifest.js`):**
```js
const { withAndroidManifest } = require('expo/config-plugins')

module.exports = function withHealthConnectManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0]
    app['activity-alias'] = app['activity-alias'] || []
    const NAME = 'ViewPermissionUsageActivity'
    if (!app['activity-alias'].find((a) => a.$['android:name'] === NAME)) {
      app['activity-alias'].push({
        $: {
          'android:name': NAME,
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        }],
      })
    }
    return cfg
  })
}
```

**Ademas, del lado del producto:** cuando Android abre EVA por esa via, la app tiene que MOSTRAR
la politica de privacidad, no el dashboard. Como el alias apunta a `.MainActivity` y EVA usa
expo-router, se resuelve leyendo el intent en el arranque:
```ts
// en app/_layout.tsx o similar
import * as IntentLauncher from 'expo-intent-launcher' // o Linking.getInitialURL + expo-linking
// Simple y suficiente: si el intent de arranque tiene action VIEW_PERMISSION_USAGE
// o ACTION_SHOW_PERMISSIONS_RATIONALE, redirigir a la pantalla de privacidad.
```
Camino minimo sin dependencias nuevas: agregar un `data` scheme propio no sirve (el intent no trae
URI). Lo pragmatico es registrar el alias apuntando a una ruta dedicada via un
`android:targetActivity` distinto, o —mas simple para V1— dejar que abra la app y que el link
"Politica de privacidad" viva en Ajustes de EVA, apuntando a la MISMA URL que se declara en Play
Console. Google valida sobre todo que la URL de la politica sea **identica** en Play Console, en
la app y en el sitio web.

### 3.5 ROOT CAUSE P0 de release — formulario "Health apps declaration" en Play Console

Verificado en `developer.android.com/health-and-fitness/health-connect/publish` y en la ayuda de
Play Console:

- Toda app que declare permisos `android.permission.health.*` **debe** completar el
  **Health apps declaration form** en Play Console, declarando **cada tipo de dato** que lee o
  escribe, con su justificacion.
- Fechas: obligatorio desde **2025-01-22**, con enforcement desde **2025-03-05**. La actualizacion
  de politica de **enero 2026** endurecio las justificaciones de tipos de dato y agrego etiquetado
  de "Medical Device".
- La aprobacion tarda **~7 dias**, y la propagacion del whitelisting **5-7 dias habiles mas**
  (se actualiza los lunes). **Total realista: 2 semanas.**
- La **politica de privacidad debe ser la MISMA URL** en tres lugares: ficha de Play Console,
  dentro de la app, y en el sitio.

Para EVA los tipos son solo dos: `READ_STEPS` y `READ_SLEEP` (`app.json:48-49`). Es la
declaracion mas simple posible, pero **hay que hacerla igual y hay que hacerla YA** porque el
plazo de 2 semanas es camino critico del lanzamiento en Play.

**Riesgo si no se hace:** el APK/AAB con `android.permission.health.*` es rechazado o la app pierde
acceso a Health Connect en produccion.

### 3.6 iOS / HealthKit — que falta

**Lo que YA esta bien:**
- `NSHealthShareUsageDescription` y `NSHealthUpdateUsageDescription` en `app.json:23-24`, en
  espanol y explicando el uso concreto. ✅ Apple exige ambas si se linkea HealthKit (aunque solo
  se lea).
- El plugin `react-native-health` (`node_modules/react-native-health/app.plugin.js`) inyecta el
  entitlement:
  ```js
  config.modResults['com.apple.developer.healthkit'] = true
  config.modResults['com.apple.developer.healthkit.access'] = []
  ```
  ✅ Correcto. `isClinicalDataEnabled: false` en `app.json:157` evita el entitlement
  `health-records`, que dispara una revision MUCHO mas dura de Apple. Bien decidido.

**ROOT CAUSE P0 — el provisioning profile no tiene la capability HealthKit:**

`apps/mobile/eas.json` usa `"credentialsSource": "local"` en los perfiles `prodpreview`,
`previewv2`, `staging` y `production` (iOS). Y `apps/mobile/credentials.json` apunta a:
```json
"provisioningProfilePath": "C:\\Users\\juanm\\Downloads\\EvaCoach (1)\\EvaCoach\\evaapp_production.mobileprovision"
```
Ese `.mobileprovision` se genero **antes** de que existiera el entitlement de HealthKit.

**Por que importa:** EAS Build sincroniza capabilities en el Apple Developer Portal
**automaticamente solo cuando usa credenciales remotas/administradas**. Con
`credentialsSource: "local"` **no hay sincronizacion**: EAS firma con el profile del disco tal
cual. Resultado esperado: falla de firma
> *"Provisioning profile ... doesn't support the HealthKit capability"* / *"doesn't include the
> com.apple.developer.healthkit entitlement"*

Esto confirma la nota de memoria **MOB-01 "iOS build roto = profile sin HealthKit"**.

**FIX 19.2 (P0), en orden:**
1. En developer.apple.com → Certificates, Identifiers & Profiles → Identifiers →
   `cl.evaapp.eva` → habilitar **HealthKit**. (Dejar "Clinical Health Records" APAGADO.)
2. Regenerar el provisioning profile de distribucion (App Store) para ese App ID.
3. Reemplazar el archivo apuntado por `credentials.json`, **o mejor**: migrar iOS a credenciales
   administradas por Expo, que es lo que evita que esto vuelva a pasar:
   ```
   cd apps/mobile && eas credentials -p ios
   ```
   y en `eas.json` cambiar en los perfiles iOS `"credentialsSource": "local"` →
   `"credentialsSource": "remote"`. Con remote, `eas build` sincroniza las capabilities solo.
4. Verificar antes del submit: `eas build:inspect` o abrir el `.ipa` y confirmar que
   `Payload/EVA.app/embedded.mobileprovision` lista `com.apple.developer.healthkit`.

**FIX 19.3 (P1) — App Store review.** Guideline 5.1.3 (Health and Health Research). Preparar:
- **Privacy Policy URL** publica que mencione explicitamente los datos de HealthKit (pasos, sueno)
  y diga que **no se venden ni se usan para publicidad ni para data mining**. Apple rechaza si la
  politica no nombra HealthKit.
- **App Privacy** en App Store Connect: declarar "Health & Fitness" → Fitness, sin tracking.
- **Notas para el revisor** con instrucciones de cuenta demo y donde esta el boton "Conectar Salud"
  (Home → tarjeta de habitos). Los revisores rechazan por "no pudimos encontrar la funcionalidad
  de HealthKit".
- Apple prohibe escribir a HealthKit datos falsos/derivados — EVA no escribe nada
  (`health-aggregators.ts:88` `write: []`). ✅ Perfecto, y el copy de
  `NSHealthUpdateUsageDescription` lo dice ("EVA no escribe datos en Salud"). Buen detalle.

**Nota de mantenimiento (P3, no bloquea):** `react-native-health@1.19.0` es un modulo ObjC legacy
(`s.dependency 'React'`, `swift_version 4.2`, deployment target 9.0). Con `newArchEnabled: true`
funciona por la **interop layer** de RN 0.81, pero RN 0.82+ ya no permite desactivar New
Architecture y la interop layer tiene fecha de vencimiento. La alternativa madura es
**`@kingstinct/react-native-healthkit`** (v13.x, migrado a **Nitro Modules**, TypeScript nativo,
config plugin propio, mantenimiento activo en 2026). **Recomendacion: NO migrar ahora** (el
alcance de EVA es pasos + sueno, funciona, y migrar en pleno lanzamiento es riesgo puro).
Agendarlo para cuando se salte a Expo SDK 55/56.

### 3.7 SPEC DE FIX 19.4 (P2) — UX: abrir Play Store en vez de solo toastear

`HabitsCard.tsx:123-133` detecta bien `not-installed` / `update-required` pero solo muestra un
toast. El alumno no sabe que hacer. Cambiar a un `Alert` con accion:
```ts
if (availability !== 'available') {
  Alert.alert(
    availability === 'update-required' ? 'Actualiza Health Connect' : 'Instala Health Connect',
    'Android guarda tus pasos y sueno en Health Connect. Es gratis y lo instalas desde Google Play.',
    [
      { text: 'Ahora no', style: 'cancel' },
      {
        text: 'Abrir Google Play',
        onPress: () =>
          Linking.openURL('market://details?id=com.google.android.apps.healthdata')
            .catch(() => Linking.openURL(
              'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata')),
      },
    ],
  )
  return
}
```
El `<queries><package android:name="com.google.android.apps.healthdata"/></queries>` necesario
para la visibilidad de paquetes en Android 11+ **ya viene mergeado** desde el manifest de la
libreria (`node_modules/react-native-health-connect/android/src/main/AndroidManifest.xml`). ✅

**Fix 19.5 (P2) — permiso denegado dos veces.** Health Connect bloquea permanentemente el dialogo
si el usuario lo rechaza dos veces (mismo comportamiento que los runtime permissions de Android).
Detectarlo con `getGrantedPermissions()` despues de `requestPermission()`: si sigue vacio en el
segundo intento, en vez de "No se pudo conectar con Salud" ofrecer
`openHealthConnectSettings()` (la lib lo exporta) para que lo habilite a mano.

### 3.8 Comparacion con la web PWA

La web PWA **no tiene ni puede tener** acceso a HealthKit ni a Health Connect: no hay API web para
ninguno de los dos. En la web `HabitsCard` los pasos y el sueno son **100% manuales**. La app RN
es un **superset**: los mismos campos manuales + el auto-relleno opcional desde el agregador,
guardado por el mismo flujo tipado (`health-aggregators.ts:11-13` documenta bien la regla de "solo
pre-llena si el campo esta vacio"). **No hay deuda de paridad: hay ventaja.** El mensaje comercial
es "en la app tus pasos se llenan solos".

---

## 4. Que se obtiene realmente de Apple Watch y Galaxy Watch

Esta es la pregunta que mas confusion genera. Respuesta clara:

### 4.1 Lo que SI llega, sin escribir una app de reloj

Via **HealthKit** (iOS) y **Health Connect** (Android), de forma **historica / agregada**, con
minutos u horas de retraso:

| Dato | Apple Watch → HealthKit | Galaxy Watch / Amazfit / Fitbit / Xiaomi → Health Connect |
|---|---|---|
| Pasos del dia | ✅ | ✅ (si la app del fabricante escribe a HC) |
| Sueno de anoche (etapas) | ✅ | ✅ |
| Entrenamientos cerrados (tipo, duracion, calorias, FC media/max) | ✅ `HKWorkout` | ✅ `ExerciseSession` + `HeartRate` |
| Serie de FC de un entrenamiento **ya terminado** | ✅ | ✅ |
| Calorias activas, distancia, pisos | ✅ | ✅ |
| VO2max, HRV, FC en reposo | ✅ | ✅ (segun fabricante) |

Caveat Android: Health Connect **no genera datos**, solo agrega lo que otras apps escriben. Samsung
Health, Zepp, Fitbit, Google Fit y Garmin Connect escriben a HC (Garmin lo hizo tarde y de forma
parcial). Si el alumno no habilito la sincronizacion en la app del fabricante, HC devuelve vacio y
**no es culpa de EVA**. El copy tiene que decirlo.

### 4.2 Lo que NO llega: FC EN VIVO durante el entrenamiento

**Apple Watch:** el reloj **no transmite** un stream continuo de pulso al iPhone. HealthKit se
sincroniza en lotes al terminar el workout. La unica forma de tener FC en vivo desde un Apple Watch
es **una app watchOS propia** que abra una `HKWorkoutSession` y empuje las muestras al iPhone por
`WCSession`. Eso significa: target watchOS nuevo en el proyecto, otra build, otra review, y en
Expo/RN **no hay soporte** (habria que escribir SwiftUI a mano). Fuera de alcance para EVA V1, sin
discusion.

**Galaxy Watch (Wear OS):** mismo problema — haria falta una app Wear OS propia (Health Services
API). Samsung **no** implementa broadcast BLE de FC de forma nativa; existe un feature request
publico de la comunidad, no una feature.

### 4.3 Alternativas reales (ordenadas por lo que le sirve a EVA)

1. **Cinta/brazalete BLE (LO QUE EVA YA HACE).** Cualquier sensor GATT 0x180D. Es el camino
   correcto, el mas preciso para fuerza/cardio, y ya esta implementado. Solo hay que arreglar el
   manifest (§2.3).
2. **Reloj deportivo en "modo broadcast".** Garmin (Forerunner/Fenix/Venu: "Difundir FC"), Coros,
   Suunto, Polar Vantage y Whoop pueden **emitir como si fueran una cinta**. EVA los toma sin
   ningun cambio de codigo — es solo un instructivo. **Alto valor, costo cero.** Vale la pena
   ponerlo en el sheet: *"¿Tenes Garmin/Coros/Polar? Activa 'Difundir frecuencia cardiaca' en el
   reloj y aparece aca como si fuera una cinta."*
3. **Apple Watch via app puente de terceros.** `HeartCast`, `BlueHeart`, `HeartBLE`, `Pulsoid`:
   son apps con componente watchOS que **reemiten** la FC del Apple Watch por BLE estandar. Si el
   alumno instala una de esas y la deja corriendo, **EVA la ve como un sensor mas, sin cambios de
   codigo**. Contras: son de pago, hay que tener el reloj + la app abierta, y **no se puede
   recomendar por nombre dentro de la app** (Apple penaliza mencionar apps de terceros en la UI).
   Sugerencia: mencionarlo en el blog / soporte, no en la app.
4. **App watchOS + Wear OS propias.** El camino "de verdad", pero es un proyecto entero. Backlog
   post-lanzamiento.

### 4.4 Copy honesto recomendado para `ConnectSensorSheet.tsx`

El sheet ya tiene una nota honesta (`ConnectSensorSheet.tsx:16`). Propuesta de texto final:

> **Cintas y brazaletes:** Polar, Garmin, Wahoo, Coospo, Magene, Scosche y cualquier sensor
> Bluetooth de pulso.
>
> **Relojes deportivos:** Garmin, Coros, Polar y Suunto funcionan si activas *"Difundir frecuencia
> cardiaca"* en el reloj.
>
> **Apple Watch y Galaxy Watch:** no pueden transmitir el pulso en vivo a otras apps. Igual
> conectalos en Inicio → *Conectar con Salud* y EVA lee tus pasos, tu sueno y tus entrenamientos.

Esto convierte una limitacion en una derivacion util hacia el hallazgo 19.

---

## 5. Plan recomendado para EVA

### 5.1 AHORA (bloqueante del build EAS pendiente)

| # | Accion | Archivo | Riesgo si no se hace |
|---|---|---|---|
| 1 | Sacar `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` de `android.permissions` | `apps/mobile/app.json:46-47` | Scan BLE **muerto** en todo Android 12+ |
| 2 | Crear `with-ble-never-for-location.js` y registrarlo | `apps/mobile/plugins/` + `app.json` | idem (blindaje) |
| 3 | Crear `with-health-connect-delegate.js` y registrarlo | `apps/mobile/plugins/` + `app.json` | **Crash nativo** al tocar Conectar Salud |
| 4 | Agregar el `activity-alias ViewPermissionUsageActivity` | plugin de manifest | Rechazo de Play / link de privacidad roto en Android 14+ |
| 5 | Habilitar HealthKit en el App ID + regenerar provisioning | Apple Developer Portal + `credentials.json` | **Build iOS falla** al firmar |
| 6 | Completar el **Health apps declaration form** en Play Console (READ_STEPS, READ_SLEEP) | Play Console | Rechazo. **~2 semanas de plazo: empezar YA** |
| 7 | Publicar/actualizar la Privacy Policy con HealthKit + Health Connect, MISMA URL en los 3 lugares | web + stores | Rechazo en ambas tiendas |

Verificacion obligatoria post-prebuild (`npx expo prebuild -p android --clean`):
```
grep -n 'neverForLocation'            android/app/src/main/AndroidManifest.xml
grep -n 'ViewPermissionUsageActivity' android/app/src/main/AndroidManifest.xml
grep -n 'setPermissionDelegate'       android/app/src/main/java/cl/evaapp/eva/MainActivity.kt
```
Los tres tienen que dar match. Si alguno no, **el build no sirve**.

### 5.2 EN EL MISMO BUILD, si entra (P1, solo JS → tambien sirve por OTA despues)

8. `waitForPoweredOn` + estado `bluetooth-off` + CTA a ajustes Bluetooth (§2.5).
9. Lazy-load del `BleManager` para no disparar el prompt iOS al abrir cardio (§2.6).
10. Alert con boton "Abrir Google Play" cuando falta Health Connect (§3.7).
11. Copy honesto del sheet (§4.4) + nota "Health Connect necesita bloqueo de pantalla".

### 5.3 DESPUES (backlog, ninguno bloquea el lanzamiento)

12. Leer `HKWorkout` / `ExerciseSession` para reconciliar entrenamientos hechos fuera de EVA.
13. Serie de FC historica de workouts del reloj → grafico post-sesion sin sensor BLE.
14. Health Connect **background read** (permiso aparte, `BackgroundAccessPermission`) para
    autocompletar habitos sin abrir la app.
15. Migrar `react-native-health` → `@kingstinct/react-native-healthkit` (Nitro) al saltar a Expo
    SDK 55/56.
16. Apps companion watchOS / Wear OS para FC en vivo (proyecto grande).

### 5.4 UX de onboarding de permisos, por plataforma

Regla general que EVA ya respeta y hay que sostener: **permisos JUST-IN-TIME**, nunca al abrir la
app, siempre con una pantalla propia que explique ANTES de que salte el dialogo del sistema (el
usuario solo tiene un tiro por permiso).

**Bluetooth (sensor de pulso)** — disparado al tocar "Conectar sensor" en cardio:
1. Sheet de EVA con el radar y el texto de §4.4. *(el pre-aviso ya es la propia UI)*
2. **Android 12+:** `PermissionsAndroid.requestMultiple([BLUETOOTH_SCAN, BLUETOOTH_CONNECT])`
   (ya en `ble-hr.ts:117-120`). **Android <12:** `ACCESS_FINE_LOCATION` con un texto que explique
   por que ("Android antiguo exige el permiso de ubicacion para buscar dispositivos Bluetooth; EVA
   no usa tu ubicacion"). Este copy **falta hoy** y es la causa clasica de denegaciones.
3. Chequear adaptador → si esta apagado, CTA a ajustes (Android) o texto (iOS).
4. Escanear. **iOS pide el permiso solo, en el primer scan** — por eso el lazy-load de §2.6 es
   importante: el prompt tiene que salir con el sheet abierto, no al entrar a cardio.

**Salud** — disparado al tocar "Conectar con Salud" en la tarjeta de habitos:
1. `Alert` de pre-aviso "Te vamos a llevar a Salud/Health Connect y volves a EVA".
   ✅ **Ya implementado** en `HabitsCard.tsx:108-118`. Muy bien: es exactamente lo que evita la
   sensacion de "me expulso la app".
2. **Android:** `getSdkStatus` ANTES de todo (`health-aggregators.ts:177`) → si falta, Alert con
   "Abrir Google Play" (§3.7). Si esta → `initialize()` → `requestPermission()` → salta la
   pantalla de Health Connect → vuelve.
3. **iOS:** `initHealthKit` → hoja de HealthKit con los toggles de Pasos y Sueno. **Gotcha de
   iOS que hay que manejar:** HealthKit **nunca revela si el usuario denego la lectura** (por
   privacidad, leer sin permiso devuelve vacio, no error). Por eso `iosInit` devolviendo `true`
   **no garantiza** que haya datos. Fix de UX: si tras conectar `readTodaySteps()` devuelve `null`
   o `0`, mostrar "No vemos datos en Salud. Revisa Ajustes → Salud → Acceso a datos → EVA" en vez
   de asumir que el alumno no camino.
4. Post-conexion: pre-llenar solo campos vacios (ya es la regla, `health-aggregators.ts:11-13`) y
   marcar visualmente "desde tu telefono" (`fromPhone`, ya existe en `HabitsCard`).
5. Ofrecer siempre **desconectar** (`disconnectHealth`, `HabitsCard.tsx:150-154`). ✅ Ya esta, y es
   requisito de politica de ambas tiendas.

---

## 6. Riesgos y regresiones

| Riesgo | Probabilidad | Mitigacion |
|---|---|---|
| Sacar BLUETOOTH_SCAN/CONNECT de `app.json` y que el plugin no los reponga (orden de mods) | Baja | Por eso va TAMBIEN el plugin defensivo. Verificar el manifest generado. **Nunca confiar sin grepear.** |
| El regex de `with-health-connect-delegate` no matchea si Expo cambia el template de MainActivity en un SDK futuro | Media (en upgrades) | El plugin **tira error explicito** si no logra inyectar → el build falla ruidosamente en vez de generar un APK que crashea. Es el comportamiento correcto. |
| `activity-alias` apuntando a `.MainActivity` abre el dashboard en vez de la politica | Alta | Aceptable para V1 (Google valida sobre todo la URL). Si Play lo objeta, resolver con deep link dedicado. |
| Migrar iOS a `credentialsSource: "remote"` rompe el pipeline actual de submit | Media | Hacer un build `prodpreview` de prueba ANTES de tocar `production`. Guardar el `.mobileprovision` viejo. |
| `neverForLocation` filtra beacons del scan | N/A para EVA | Solo afecta beacons iBeacon/Eddystone. EVA filtra por servicio 0x180D, no le afecta. |
| El scan BLE sigue vacio despues del fix | Baja | Descartar en este orden: (1) Bluetooth apagado, (2) el sensor esta emparejado/conectado a OTRA app (Polar Flow, Garmin Connect) — un sensor GATT admite **una sola conexion central**, (3) sensor sin humedad en los electrodos. Ponerlo en el empty-state del sheet. |
| Health Connect vacio en un telefono real | **Alta** | El fabricante no sincroniza a HC. Copy: "Abri Samsung Health / Zepp / Fitbit y activa la sincronizacion con Health Connect". |
| Rechazo de Apple por Privacy Policy sin mencionar HealthKit | Media | Redactar la politica ANTES de submitear. Es el motivo #1 de rechazo 5.1.3. |
| El plazo de la declaracion de Play (~2 semanas) se come la fecha de lanzamiento | **Alta** | **Enviar el formulario hoy**, en paralelo al desarrollo. No depende del codigo. |
| Interop layer de New Architecture con `react-native-health` deja de existir en RN 0.82+ | Media (futuro) | Migrar a `@kingstinct/react-native-healthkit` en el salto de SDK, no ahora. |

---

## 7. Fuentes

- [react-native-ble-plx — README (config plugin oficial)](https://github.com/dotintent/react-native-ble-plx/blob/master/README.md)
- [@config-plugins/react-native-ble-plx — README (neverForLocation)](https://github.com/expo/config-plugins/blob/main/packages/react-native-ble-plx/README.md)
- [react-native-ble-plx — npm](https://www.npmjs.com/package/react-native-ble-plx)
- [React Native Health Connect — Get started](https://matinzd.github.io/react-native-health-connect/docs/get-started/)
- [React Native Health Connect — Permissions](https://matinzd.github.io/react-native-health-connect/docs/permissions/)
- [matinzd/react-native-health-connect — GitHub](https://github.com/matinzd/react-native-health-connect)
- [Android Developers — Get started with Health Connect](https://developer.android.com/health-and-fitness/health-connect/get-started)
- [Android Developers — Publish your health app on Google Play](https://developer.android.com/health-and-fitness/health-connect/publish)
- [Play Console Help — Health apps declaration form](https://support.google.com/googleplay/android-developer/answer/14738291)
- [Play Console Help — Health app categories and additional information](https://support.google.com/googleplay/android-developer/answer/13996367)
- [Google Play Health Apps Update — requisitos enero 2026](https://myappmonitor.com/blog/google-play-health-apps-update-2026-requirements)
- [Google Fit API deprecation / migracion a Health Connect](https://developer.android.com/health-and-fitness/health-connect/migration/fit/faq)
- [Expo Docs — iOS capabilities](https://docs.expo.dev/build-reference/ios-capabilities/)
- [Expo FYI — provisioning profile missing capabilities](https://github.com/expo/fyi/blob/main/provisioning-profile-missing-capabilities.md)
- [eas-cli #2117 — Out of sync entitlements for HealthKit](https://github.com/expo/eas-cli/issues/2117)
- [react-native-health — Expo docs](https://github.com/agencyenterprise/react-native-health/blob/master/docs/Expo.md)
- [@kingstinct/react-native-healthkit (Nitro Modules)](https://github.com/kingstinct/react-native-healthkit)
- [HeartCast — broadcast de FC desde Apple Watch](https://www.heartcast.app/)
- [BlueHeart — guia de broadcast BLE desde Apple Watch](https://www.pelobuddy.com/demo-guide-blueheart-broadcast-heart-rate-hr-from-apple-watch-to-peloton-bike-or-tread-via-bluetooth-ble/)
- [HeartBLE — App Store](https://apps.apple.com/us/app/heartble-heart-rate-bluetooth/id6758879454)
- [Samsung Community — feature request: HR broadcasting via BLE en Galaxy Watch](https://us.community.samsung.com/t5/Galaxy-Watch/Feature-Request-Heart-Rate-Broadcasting-via-BLE-for-Galaxy-Watch/td-p/3314341)
- [Expo Docs — React Native New Architecture](https://docs.expo.dev/guides/new-architecture/)
