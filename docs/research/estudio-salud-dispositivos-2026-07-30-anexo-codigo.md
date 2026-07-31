# QA-4 · Hallazgos 6 y 19 (CODIGO) — Sensor de pulso BLE + "Conectar salud"

Auditoria read-only sobre el worktree `adelanto-qa-20260729` (HEAD `22ec27f6`, rama `worktree-adelanto-qa-20260729`).
Rutas relativas a `D:/Proyectos/Antigravity/gymappjp/.claude/worktrees/adelanto-qa-20260729/`.

---

## 0. CORRECCION DE PREMISA (esto cambia todo el diagnostico)

El brief asume "los modulos nativos nuevos NO estan en el binario". **Para BLE y Salud eso es FALSO.**

Linea de tiempo verificada en git:

| commit | fecha | que hizo |
|---|---|---|
| `de3ce837` | 2026-07-22 | **Ola 6 wearables**: agrega `react-native-ble-plx`, `react-native-health`, `react-native-health-connect` a `apps/mobile/package.json`, sus plugins a `app.json`, y los permisos `BLUETOOTH_SCAN/CONNECT` + `health.READ_STEPS/READ_SLEEP` + `NSBluetoothAlwaysUsageDescription` + `NSHealthShare/UpdateUsageDescription` |
| `ff6b169c` | 2026-07-24 | `version 1.0.1 -> 1.1.0` ("nuevo runtimeVersion por modulos nativos") |
| `856829fa` | 2026-07-25 | repone associatedDomains; **profile iOS regenerado CON HealthKit** |

`app.json:178` → `runtimeVersion.policy = "appVersion"` → el OTA solo entra en binarios `1.1.0`.
`docs/status/CURRENT.md:58` y `docs/operations/MANUAL_TASKS.md:23` confirman que el binario vivo (Android AAB en Play internal + iOS IPA en TestFlight) sale del run **30185211552 sobre `856829fa` (2026-07-25)**, con el profile HealthKit ya arreglado (MOB-01 cerrado).

**Conclusion:** el binario que tiene QA **si contiene** `ble-plx`, `react-native-health` (con entitlement `com.apple.developer.healthkit`) y `react-native-health-connect`. Lo que falta en el binario viejo es lo posterior (icono de notificacion, expo-audio, notify-kit countdown, canal PUBLIC), **no** BLE/Salud.

Evidencia adicional desde el propio sintoma: el boton "Conectar sensor de pulso" **solo se pinta** si `isBleAvailable()` es true (`CardioScreenV3.tsx:117`, `:257`, `:343`), y `isBleAvailable()` construye un `BleManager` real (ver §1.1). Que QA lo haya visto y haya llegado al string "No se pudo buscar sensores" (que **solo** se emite desde el callback nativo del scan, `lib/ble-hr.ts:188`) prueba que el modulo nativo BLE respondio.

Corolario operativo duro: **la build EAS pendiente NO arregla sola ninguno de los dos flujos.** BLE se arregla 100% por OTA (es JS). Salud/Android exige un plugin nativo NUEVO que hoy no existe en el repo (§2.1) y por lo tanto exige compilar *despues* de agregarlo.

---

## 1. HALLAZGO 6 — "Conectar sensor de pulso" → "No se pudo buscar sensores"

### 1.1 ROOT CAUSE A (certera): el scan arranca sin mirar el estado del adaptador Bluetooth

`lib/ble-hr.ts:173-211` (`startScan`):

```
173  async startScan(): Promise<void> {
174    const manager = loadManager()
...
179    const granted = await ensureBlePermissions()
...
184    this.set({ status: 'scanning', devices: [], error: null })
186    manager.startDeviceScan([HR_SERVICE_UUID], null, (error, device) => {
187      if (error) {
188        this.set({ status: 'error', error: 'No se pudo buscar sensores' })
```

No hay **ninguna** consulta a `manager.state()` ni suscripcion a `manager.onStateChange(cb, true)` ni llamada a `manager.enable()` antes de escanear. El tipo `MinimalManager` (`lib/ble-hr.ts:78-87`) ni siquiera declara `state`, `onStateChange` ni `enable`: la superficie del adaptador esta amputada por diseno.

Con el adaptador apagado, `react-native-ble-plx` no pide nada al usuario: entrega un `BleError` por el callback del scan. Codigos posibles (`react-native-ble-plx/src/BleError.js:105-126, 253-257`):

| code | significado | causa real en device |
|---|---|---|
| 100 | `BluetoothUnsupported` | equipo sin BLE |
| 101 | `BluetoothUnauthorized` | iOS: usuario nego Bluetooth / Android 12+ sin `BLUETOOTH_SCAN` |
| 102 | `BluetoothPoweredOff` | **Bluetooth apagado — el caso de QA** |
| 105 | `BluetoothStateChangeFailed` | fallo al encender |
| 600 | `ScanStartFailed` | Android rechazo el scan (throttling, 5 scans/30s) |
| 601 | `LocationServicesDisabled` | Android <12 con GPS apagado |

Los **seis** colapsan al mismo string opaco en `:188`. Eso explica literalmente los dos sintomas reportados: "No se pudo buscar sensores" **y** "nunca pide activar Bluetooth".

### 1.2 ROOT CAUSE B (certera): el `BleManager` se instancia en tiempo de import

`lib/ble-hr.ts:92-108` + `:139-150` + `:317`:

```
 98      managerSingleton = new mod.BleManager()
106  export function isBleAvailable(): boolean { return loadManager() !== null }
142      status: isBleAvailable() ? 'idle' : 'unavailable',   // <-- inicializador de campo
317  const controller = new BleHrController()                 // <-- corre al importar el modulo
```

`new BleManager()` llama `BleModule.createClient(...)` (`react-native-ble-plx/src/BleManager.js:111`), es decir crea el `CBCentralManager` (iOS) / `BluetoothAdapter` client (Android) **al importar `ble-hr.ts`**, que ocurre al montar `CardioScreenV3`, no al tocar "Conectar". En iOS eso puede disparar el dialogo de permiso de Bluetooth del sistema sin contexto (y Apple lo mira feo en review). Ademas hace que el "feature detect" tenga efecto colateral.

### 1.3 Hallazgos menores pero reales

- `lib/ble-hr.ts:112-132` `ensureBlePermissions`: en Android <31 pide `ACCESS_FINE_LOCATION`. Esta OK porque el plugin de ble-plx la declara como `uses-permission-sdk-23` con `maxSdkVersion=30` (`react-native-ble-plx/plugin/build/withBLEAndroidManifest.js:23-49`), pero **no** verifica los servicios de ubicacion encendidos (error 601) ni ofrece salida cuando el usuario marco "no volver a preguntar" (queda `Permiso de Bluetooth denegado`, `:181`, sin CTA a Ajustes).
- `ConnectSensorSheet.tsx:45-49`: al abrir dispara `startScan()` si el status es `idle` o `error`; el scan muere por timeout a los 15 s (`ble-hr.ts:136`, `:205-207`) y el sheet **no dice nada**: se queda con el radar quieto y cero filas. Falta estado vacio ("no encontramos sensores").
- `ConnectSensorSheet.tsx:98-102`: el error se pinta como texto rojo de 12px al fondo del sheet, sin accion de reintento. El boton "Conectar" queda deshabilitado (`:131`) porque no hay `selectedId`, asi que el usuario no tiene NINGUN camino hacia adelante.
- No hay `manager.destroy()` en ningun lado (aceptable para singleton, pero anotarlo).

### 1.4 Sobre "una ventana lo mando a Google Play Store"

**En el codigo de EVA no existe ninguna ruta desde el flujo BLE hacia Play Store.** Se busco: `ble-hr.ts`, `ConnectSensorSheet.tsx`, `CardioScreenV3.tsx` no linkean nada. La libreria `react-native-ble-plx` tampoco (grep de `market://` / `play.google.com` en su fuente Android: cero hits).

La UNICA ruta a Play Store alcanzable desde la app es la de Health Connect (§2.2): en Android <=13 el `PermissionController.createRequestPermissionResultContract("com.google.android.apps.healthdata")` produce un intent hacia el proveedor; si el APK de Health Connect no esta instalado, el sistema resuelve a la ficha de Play Store (o revienta con `ActivityNotFoundException`). Hipotesis fuerte: **el salto a Play Store que vio QA vino de "Conectar salud", no del sensor** (misma sesion de QA, dos flujos seguidos). Confirmar con `adb logcat` mirando `ActivityTaskManager: START u0 {act=androidx.health.ACTION_REQUEST_PERMISSIONS ...}`.

### 1.5 SPEC DE FIX — BLE (todo OTA-able, cero build)

**Archivo 1: `apps/mobile/lib/ble-hr-parse.ts`** (parte pura, testeable) — agregar taxonomia de error:

```ts
export type BleErrorKind =
  | 'powered-off'     // 102 -> "Prende el Bluetooth para buscar tu sensor"
  | 'unauthorized'    // 101 -> permiso denegado
  | 'unsupported'     // 100 -> equipo sin BLE
  | 'location-off'    // 601 -> Android <12, GPS apagado
  | 'scan-failed'     // 600 -> reintentar en unos segundos
  | 'no-native'       // modulo nativo ausente (OTA sobre binario viejo / Expo Go)
  | 'unknown'

/** PURA: mapea el errorCode de react-native-ble-plx a una causa accionable. */
export function bleErrorKind(err: unknown): BleErrorKind {
  const code = (err as { errorCode?: number } | null)?.errorCode
  switch (code) {
    case 100: return 'unsupported'
    case 101: return 'unauthorized'
    case 102: return 'powered-off'
    case 600: return 'scan-failed'
    case 601: return 'location-off'
    default:  return 'unknown'
  }
}

export const BLE_ERROR_COPY: Record<BleErrorKind, string> = {
  'powered-off':  'Prende el Bluetooth para buscar tu sensor.',
  'unauthorized': 'EVA necesita permiso de Bluetooth para buscar tu sensor.',
  'unsupported':  'Este telefono no tiene Bluetooth de baja energia (BLE).',
  'location-off': 'Prende la ubicacion del telefono: Android la exige para buscar sensores BLE.',
  'scan-failed':  'No pudimos iniciar la busqueda. Espera unos segundos y reintenta.',
  'no-native':    'Actualiza EVA desde la tienda para conectar tu sensor de pulso.',
  unknown:        'No se pudo buscar sensores. Reintenta.',
}
```

**Archivo 2: `apps/mobile/lib/ble-hr.ts`**

1. Ampliar `MinimalManager` (`:78-87`) con:
   ```ts
   state: () => Promise<string>
   onStateChange: (l: (s: string) => void, emitCurrent?: boolean) => { remove: () => void }
   enable: () => Promise<unknown>   // Android only
   ```
2. Cambiar `isBleAvailable()` (`:106-108`) para que **no instancie nada**:
   ```ts
   import { NativeModules } from 'react-native'
   export function isBleAvailable(): boolean {
     return NativeModules?.BlePlx != null   // o TurboModuleRegistry.get('BlePlx') != null
   }
   ```
   y que `loadManager()` (que si construye) se llame recien dentro de `startScan`/`connect`.
   El snapshot inicial (`:142`) pasa a usar el detect barato.
3. Nuevo `errorKind: BleErrorKind | null` en `BleHrState` (`:44-55`) al lado de `error: string`; la UI decide copy + CTA por kind. Mantener `error` como string derivado para no romper `ConnectSensorSheet.tsx:98`.
4. Gate de adaptador ANTES del scan, en `startScan` (insertar entre `:179` y `:184`):
   ```ts
   const st = await manager.state().catch(() => 'Unknown')
   if (st !== 'PoweredOn') {
     if (Platform.OS === 'android') {
       // ble-plx enable() es no-op en Android 13+ (BluetoothAdapter.enable deprecado):
       // no confiar; si sigue apagado, mandar a Ajustes de Bluetooth.
       try { await manager.enable() } catch { /* usuario rechazo */ }
     }
     const after = await manager.state().catch(() => 'Unknown')
     if (after !== 'PoweredOn') {
       this.set({ status: 'error', errorKind: 'powered-off', error: BLE_ERROR_COPY['powered-off'] })
       return
     }
   }
   ```
5. En el callback de scan (`:186-190`) usar `bleErrorKind(error)` en vez del string fijo.
6. En `connect()` / `doConnect()` (`:279`) idem: distinguir "sensor apagado o fuera de rango" de "el telefono corto la conexion".
7. Timeout sin resultados (`:205-207`): setear `errorKind: 'scan-failed'`-like o un status `empty` para que el sheet muestre "No encontramos sensores. Prende la cinta / activa el modo broadcast del reloj y reintenta."

**Archivo 3: `apps/mobile/components/alumno/workout/v3/ConnectSensorSheet.tsx`**

- Reemplazar el texto rojo suelto (`:98-102`) por un bloque de error con copy por kind + boton de accion contextual:
  - `powered-off` (Android) → "Abrir ajustes de Bluetooth" con `Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')`.
  - `powered-off` (iOS) → texto solo (iOS no permite deep-link a Ajustes de Bluetooth; `Linking.openSettings()` lleva a la ficha de EVA, sirve para `unauthorized`).
  - `unauthorized` → "Abrir ajustes de EVA" (`Linking.openSettings()`).
  - `location-off` → `android.settings.LOCATION_SOURCE_SETTINGS`.
  - cualquier kind → boton "Reintentar" que llama `ble.startScan()` (hoy no existe: el CTA principal esta disabled sin `selectedId`, `:131`).
- Suscribirse a `onStateChange` mientras el sheet este abierto para que, cuando el usuario prenda el Bluetooth desde el panel rapido, el scan reanude solo.

**Archivo 4: `apps/mobile/components/alumno/workout/v3/CardioScreenV3.tsx`**

- `:117` `bleSupported` pasa a ser el detect barato; ademas, cuando `isBleAvailable() === false` (binario viejo / Expo Go), hoy **no se muestra nada**. Eso es "degradacion honesta" pero deja al alumno sin explicacion. Recomendado: mantener el chip visible en variante apagada con copy `BLE_ERROR_COPY['no-native']` ("Actualiza EVA desde la tienda para conectar tu sensor") en lugar de desaparecer. (Ver §3.)

---

## 2. HALLAZGO 19 — "Conectar salud" → toast "No se pudo conectar con Salud" (iPhone y Android)

### 2.1 ROOT CAUSE ANDROID (CERTERA, y es NATIVA): `HealthConnectPermissionDelegate` nunca se registra

`react-native-health-connect` exige wiring manual en `MainActivity`. Su README lo dice explicito:

`react-native-health-connect/README.md:59`
```kotlin
override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  // In order to handle permission contract results, we need to set the permission delegate.
  HealthConnectPermissionDelegate.setPermissionDelegate(this)
}
```

El delegate es un `object` con dos `lateinit`:

`react-native-health-connect/android/src/main/java/dev/matinzd/healthconnect/permissions/HealthConnectPermissionDelegate.kt:19-21,45-48`
```kotlin
private lateinit var requestPermission: ActivityResultLauncher<Set<String>>
...
suspend fun launchPermissionsDialog(permissions: Set<String>): Set<String> {
    requestPermission.launch(permissions)      // <-- explota si nadie llamo setPermissionDelegate
    return permissionsChannel.receive()
}
```

Y el nativo lo invoca desde una corrutina sin proteccion:

`.../HealthConnectManager.kt:66-76`
```kotlin
fun requestPermission(reactPermissions: ReadableArray, promise: Promise) {
    throwUnlessClientIsAvailable(promise) {
      coroutineScope.launch {                                   // Dispatchers.IO
        val granted = HealthConnectPermissionDelegate.launchPermissionsDialog(...)
        promise.resolve(...)
      }
    }
}
```

Verificacion en este repo:
- `grep -rn "setPermissionDelegate" android/ README.md` en la libreria → **solo** la definicion y el README. Nadie lo llama.
- El config plugin que trae la libreria (`react-native-health-connect/app.plugin.js`) **solo** agrega el intent-filter `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` a `activity[0]`. **No toca MainActivity.**
- `apps/mobile/app.json:162` registra el plugin tal cual (`"react-native-health-connect"`).
- El proyecto es CNG (no hay `apps/mobile/android/` ni `ios/` versionados; `apps/mobile/plugins/` solo tiene `with-android-cleartext.js`, `with-gradle-jvmargs.js`, `with-ios-modular-headers.js`, `with-privacy-manifest.js`).

**Por lo tanto, en el APK/AAB actual `MainActivity.onCreate` NUNCA llama `setPermissionDelegate`.** Consecuencia al tocar Continuar en "Conectar salud":

`lib/health-aggregators.ts:173-185` → `hc.initialize()` resuelve OK → `hc.requestPermission(ANDROID_READ_PERMS)` → nativo → `launchPermissionsDialog` → `UninitializedPropertyAccessException: lateinit property requestPermission has not been initialized`, lanzada **dentro de `coroutineScope.launch` sin CoroutineExceptionHandler** ⇒ excepcion no capturada ⇒ **crash del proceso** (o, si el handler la traga, la promesa nunca resuelve y el boton queda colgado en "Conectando..." para siempre, porque `await` no vuelve y el `finally` de `HabitsCard.tsx:145` no corre).

Esto encaja exactamente con el hallazgo QA-3 original que motivo `25a7c2a8` ("conectar salud saca de la app") y con el toast generico cuando la excepcion se degrada a rechazo de promesa.

**Nada de esto se arregla por OTA ni por recompilar tal cual: hay que agregar un config plugin nuevo ANTES de la build EAS.**

### 2.2 ROOT CAUSE ANDROID SECUNDARIA: manifest incompleto para Android 14+

El plugin de la libreria agrega solo `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`. Para Android 14+ (donde Health Connect es parte del sistema y es el caso de la mayoria de los devices de QA) Google exige ademas el alias de uso de permisos:

```xml
<activity-alias
    android:name="ViewPermissionUsageActivity"
    android:exported="true"
    android:targetActivity=".MainActivity"
    android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
  <intent-filter>
    <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
    <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
  </intent-filter>
</activity-alias>
```

Sin eso la pantalla de permisos de Health Connect queda sin politica de privacidad (y Play lo pide para la declaracion de datos de salud). No es la causa del crash, pero va en el mismo plugin.

Lo que **si** esta bien (verificado, no tocar):
- `<queries><package android:name="com.google.android.apps.healthdata"/></queries>` lo aporta el manifest de la propia libreria (`react-native-health-connect/android/src/main/AndroidManifest.xml:4-6`) → la visibilidad de paquete para `getSdkStatus` en Android <=13 esta cubierta.
- Permisos `android.permission.health.READ_STEPS` / `READ_SLEEP` declarados en `app.json:48-49`.
- `minSdkVersion 26` (`app.json:101-106`) es compatible con la lib androidx.

### 2.3 ROOT CAUSE iOS: no es determinable desde el codigo PORQUE el codigo se traga el error

`lib/health-aggregators.ts:91-99`:
```ts
function iosInit(hk: AppleHealthKitModule): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      hk.initHealthKit(iosPermissions(hk), (err) => resolve(!err))   // <-- err se DESCARTA
    } catch {
      resolve(false)                                                  // <-- excepcion se DESCARTA
    }
  })
}
```

`requestHealthPermissions` (`:220-230`) devuelve `false` y `HabitsCard.tsx:135-137` pinta el toast generico. **No queda rastro en logs ni en Sentry.** Candidatos, ordenados por probabilidad, con su discriminador:

| # | causa | por que es plausible | como se discrimina en 1 linea |
|---|---|---|---|
| 1 | `initHealthKit` responde error de HealthKit (autorizacion/entitlement/tipo invalido) | el binario `856829fa` trae el profile con HealthKit, pero el error string es lo unico que lo confirma | loguear `err` crudo: `console.warn('[health] initHealthKit', err)` + `Sentry.captureMessage` |
| 2 | `hk.initHealthKit` **no es funcion** | ver §2.4: `react-native-health` arma su export con `Object.assign`, que NUNCA lanza; si el modulo nativo no estuviera enlazado el objeto igual existe (solo con `Constants`) | `console.warn(Object.keys(hk).length, typeof hk.initHealthKit)` |
| 3 | usuario ya nego antes | HealthKit no reporta denegacion de lectura por privacidad: `initHealthKit` resuelve OK igual, asi que esto **no** produciria el toast | descartable |
| 4 | dispositivo sin HealthKit (iPad) | QA usa iPhone | descartable |

**Accion #1 del fix iOS: instrumentar. Sin el string de error de `initHealthKit` cualquier "fix" es adivinanza.**

### 2.4 BUG CIERTO EN EL GATE iOS: `isHealthAvailable()` da true aunque no haya modulo nativo

`react-native-health/index.js:1-13` (fuente real de la version instalada 1.19.0):
```js
const { AppleHealthKit } = require('react-native').NativeModules
export const HealthKit = Object.assign({}, AppleHealthKit, { Constants: {...} })
module.exports = HealthKit
```

`Object.assign({}, undefined, {...})` **no lanza**: devuelve `{ Constants }`. Entonces:

`lib/health-aggregators.ts:54-64, 78-82`
```
57    try { const mod = require('react-native-health'); iosModule = (mod.default ?? mod) }
60    catch { iosModule = null }
79    if (Platform.OS === 'ios') return loadIosHealth() !== null      // <-- SIEMPRE true en iOS
```

Es decir: en iOS el boton "Conectar salud" (`HabitsCard.tsx:199`) se muestra **siempre**, incluso en Expo Go o en un binario sin el pod, y falla despues con el toast generico. La "degradacion honesta" documentada en el header del archivo (`:9-12`) **no funciona en iOS**. En Android si funciona: `react-native-health-connect` usa `TurboModuleRegistry.getEnforcing('HealthConnect')` (`lib/commonjs/NativeHealthConnect.js:7`) o cae a `moduleProxy(LINKING_ERROR)` (`lib/commonjs/index.js:68-86`), asi que o revienta el require (→ `null`, boton oculto) o revienta al primer metodo.

### 2.5 BUG CIERTO: `androidInit` ignora el resultado de `requestPermission`

`lib/health-aggregators.ts:173-185`:
```ts
await hc.requestPermission(ANDROID_READ_PERMS)
return true          // <-- true aunque el usuario haya denegado TODO
```
`requestPermission` resuelve con el **set de permisos efectivamente concedidos** (`HealthConnectManager.kt:70-76` → `mapPermissionResult(granted)`). Si el alumno deniega, EVA igual guarda `optIn=true` (`HabitsCard.tsx:139`), muestra "Conectado a Salud" (`:204`) y despues no autocompleta nunca nada. Mentira silenciosa.

### 2.6 Estado del guard de `25a7c2a8` (lo que si aporto y lo que no)

Aporto (verificado en el diff): alerta previa antes de saltar a Salud (`HabitsCard.tsx:108-119`), `try/catch/finally` que libera el spinner (`:121-147`), y el gate `getSdkStatus` que evita pedir permiso cuando el proveedor no esta instalado/desactualizado (`health-aggregators.ts:148-171`, `:177`).

Lo que **no** resuelve:
- No arregla §2.1 (delegate no registrado) — es nativo.
- El `finally` no salva el caso "promesa que nunca resuelve": si `requestPermission` cuelga, `await` no vuelve y el boton queda en "Conectando...". Falta un `Promise.race` con timeout.
- Los tres caminos de fallo terminan en el mismo toast generico (`:136`, `:144`).
- El toast "Instala/Actualiza Health Connect desde Google Play" es **solo texto**: no lleva a Play. Si el toast que vio QA fue el generico y no este, significa que el device corrio el OTA anterior al guard, o que `getSdkStatus` devolvio 3 (disponible) y el fallo esta rio abajo, en `requestPermission` (§2.1). Ambos escenarios estan cubiertos por el fix de abajo.

### 2.7 SPEC DE FIX — Salud

**A. NUEVO plugin nativo (bloqueante para Android; exige build EAS) — `apps/mobile/plugins/with-health-connect.js`**

```js
const { withMainActivity, withAndroidManifest, AndroidConfig } = require('@expo/config-plugins')

const IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate'
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)'

// 1) MainActivity.kt: registrar el delegate DENTRO de onCreate, despues de super.onCreate(null).
//    Debe ser en onCreate: registerForActivityResult lanza IllegalStateException si se llama
//    con el Activity ya en RESUMED (por eso NO sirve hacerlo lazy desde JS).
function withDelegate(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents
    if (src.includes(CALL)) return cfg
    src = src.replace(/^(package .+\n)/m, `$1\n${IMPORT}\n`)
    src = src.replace(/super\.onCreate\(null\)/, `super.onCreate(null)\n    ${CALL}`)
    cfg.modResults.contents = src
    return cfg
  })
}

// 2) AndroidManifest: activity-alias VIEW_PERMISSION_USAGE / HEALTH_PERMISSIONS (Android 14+).
function withPermissionUsage(config) { /* push del activity-alias de §2.2 */ }

module.exports = (config) => withPermissionUsage(withDelegate(config))
```
Registrarlo en `app.json:99-173` **despues** de `"react-native-health-connect"`.
Riesgo: si el template de Expo 54 cambia `super.onCreate(null)`, el replace falla en silencio → el plugin debe **lanzar** si no encontro el ancla (fail-fast en prebuild, no build verde con la app rota).

**B. `apps/mobile/lib/health-aggregators.ts` (OTA-able)**

1. Gate iOS real (`:78-82`):
   ```ts
   function iosUsable(m: AppleHealthKitModule | null): boolean {
     return !!m && typeof m.initHealthKit === 'function' && typeof m.getStepCount === 'function'
   }
   export function isHealthAvailable(): boolean {
     if (Platform.OS === 'ios') return iosUsable(loadIosHealth())
     if (Platform.OS === 'android') return loadAndroidHealth() !== null
     return false
   }
   ```
   Y exponer `getHealthAvailability(): 'ok' | 'no-native' | 'unsupported-platform'` para que la UI pueda decir "actualiza la app" en vez de esconder el boton (§3).
2. Propagar el error en vez de tragarlo. Cambiar la firma interna a un resultado tipado:
   ```ts
   export type HealthConnectResult =
     | { ok: true }
     | { ok: false; reason: 'no-native' | 'denied' | 'provider-missing' | 'provider-update'
                  | 'timeout' | 'native-error'; detail?: string }
   export async function requestHealthPermissions(): Promise<HealthConnectResult>
   ```
   - iOS: `hk.initHealthKit(perms, (err) => resolve(err ? {ok:false, reason:'native-error', detail:String(err)} : {ok:true}))`; ademas `Sentry.captureMessage('health.init.ios', { extra: { detail } })`.
   - Android: mapear `getSdkStatus` a `provider-missing` / `provider-update`; envolver `requestPermission` en `Promise.race([p, timeout(45_000) -> {reason:'timeout'}])`; **leer el set devuelto** y exigir que contenga Steps y SleepSession, si no → `denied`.
3. `androidInit` (`:173-185`): dejar de devolver `true` a ciegas (§2.5).
4. Post-conexion, verificacion honesta: tras `ok:true`, intentar `readTodaySteps()`; si vuelve `null` en iOS, avisar "Conectado, pero Salud todavia no comparte pasos: revisalo en Salud > Compartir" (HealthKit no reporta denegacion de lectura, esta es la unica forma de detectarla).

**C. `apps/mobile/components/alumno/home/HabitsCard.tsx` (OTA-able)**

- `connectHealth` (`:105-148`): switch sobre `reason` con copy y CTA distintos:
  | reason | copy | CTA |
  |---|---|---|
  | `no-native` | "Actualiza EVA desde la tienda para conectar con Salud." | abrir store (`Linking.openURL`) |
  | `provider-missing` | "Instala Health Connect para conectar." | `market://details?id=com.google.android.apps.healthdata` con fallback `https://play.google.com/store/apps/details?id=...` |
  | `provider-update` | "Actualiza Health Connect para conectar." | mismo deep link |
  | `denied` | "No autorizaste pasos y sueno. Podes hacerlo desde Salud cuando quieras." | `openHealthConnectSettings()` (Android) / `Linking.openSettings()` (iOS) |
  | `timeout` | "Salud no respondio. Reintenta." | reintentar |
  | `native-error` | "Salud no pudo responder. Reintenta o revisa permisos." | reintentar + Sentry ya logueado |
- El toast generico "No se pudo conectar con Salud" deja de existir.
- Mantener el `Alert` previo (`:108-119`) — es correcto y esta bien redactado.

---

## 3. UX DE DEGRADACION (requisito 3 del brief) — SPEC

Regla: **nunca** un error generico, **nunca** un salto a una tienda sin contexto, **nunca** una funcion que desaparece sin explicacion.

Tres estados, y el mensaje sale del **motivo**, no del sintoma:

1. **`no-native`** (JS nuevo por OTA sobre binario viejo, o Expo Go): el control se muestra **apagado, no oculto**, con subtitulo "Actualiza EVA desde la tienda para conectar tu reloj" y CTA "Actualizar". Hoy BLE lo esconde (`CardioScreenV3.tsx:257`, `:343`) y Salud en iOS lo muestra roto (§2.4): las dos puntas mal.
   Deteccion barata y sin efectos: `NativeModules.BlePlx != null`; `typeof hk.initHealthKit === 'function'`; require de health-connect que revienta.
2. **`provider-missing` / `provider-update`** (Android sin Health Connect): texto explicito **antes** de mover al usuario, y el salto a Play Store **solo** tras un tap deliberado en un boton que dice "Instalar Health Connect". Nunca automatico. Esto es exactamente lo que QA vivio al reves.
3. **`powered-off` / `unauthorized` / `denied`** (capacidad presente, estado del sistema en contra): copy accionable + deep link al lugar exacto (ajustes de Bluetooth, ajustes de la app, Health Connect), y reintento in-place sin cerrar el sheet.

Ademas, en los tres: cero estados terminales sin salida. Hoy el sheet BLE con error deja el CTA principal deshabilitado (`ConnectSensorSheet.tsx:131`) y el usuario solo puede cerrar.

---

## 4. PARIDAD CON LA WEB PWA

**BLE**: la web SI tiene implementacion (`apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/web-ble-hr.ts`) y **esta mejor** que RN en lo que falla:
- Feature-detect **sin efectos colaterales**: `getBluetooth()` mira `navigator.bluetooth` (`web-ble-hr.ts:56-63`); no instancia nada. RN construye un `BleManager` para "detectar" (§1.2).
- Taxonomia de error tipada `HrErrorKind = 'unsupported' | 'cancelled' | 'denied' | 'connection-lost' | ...` (`web-ble-hr.ts:156-159`) con `mapRequestError` (`:182-186`), y copy por caso en `SensorSheetV3.tsx:26-29`. RN colapsa todo a un string (`ble-hr.ts:188`).
- El chooser del navegador resuelve solo el "Bluetooth apagado" (Chrome lo dice y ofrece encenderlo). En RN **nadie** lo resuelve: por eso hay que implementar el gate de §1.5.

Copy web a reutilizar tal cual (misma voz de producto):
```
unsupported:       'Tu navegador no permite conectar sensores por Bluetooth.'
cancelled:         'No se eligio ningun sensor. Enciende la cinta o el reloj y vuelve a intentar.'
denied:            'Permiso de Bluetooth denegado. Habilitalo en el navegador para conectar tu sensor.'
connection-lost:   'Se perdio la conexion con el sensor. Acercalo y vuelve a conectar.'
```

**Salud (pasos/sueno)**: **no hay paridad posible** — la PWA no tiene acceso a HealthKit/Health Connect (grep en `apps/web/src/components/habits/`: cero referencias a health). Es una capacidad exclusiva de RN, o sea que aca RN debe ser mejor que la web, no igual; no hay referencia contra la cual comparar. La unica regla heredable de la web es la de honestidad: si la capacidad no esta, no se promete.

---

## 5. QUE ARREGLA SOLA LA BUILD EAS PENDIENTE Y QUE NO

| item | lo arregla la build sola | por que |
|---|---|---|
| BLE: "No se pudo buscar sensores" con BT apagado | **NO** | el modulo nativo ya esta en el binario `856829fa`; el bug es JS (§1.1). Se arregla por **OTA**. |
| BLE: manager instanciado al importar | **NO** | JS. OTA. |
| BLE: copy/CTA por tipo de error | **NO** | JS. OTA. |
| Salud iOS: gate falso-positivo (`Object.assign`) | **NO** | JS. OTA. |
| Salud iOS: causa real del `initHealthKit` fallido | **desconocido hasta instrumentar** | si resulta ser entitlement, ya vino arreglado en `856829fa`; si es el modulo, la build no cambia nada. Instrumentar primero (§2.3). |
| Salud Android: `setPermissionDelegate` | **NO — y ademas la build TAL CUAL no lo arregla** | exige agregar `plugins/with-health-connect.js` **antes** de compilar (§2.7-A). Si se compila sin el plugin, el crash/hang sigue identico. |
| Salud Android: activity-alias Android 14+ | **NO** | mismo plugin. |
| Salud Android: `androidInit` devuelve true a ciegas | **NO** | JS. OTA. |
| Notificaciones (icono, canal PUBLIC), expo-audio, notify-kit | SI | son cambios de `app.json`/modulos posteriores al binario. |

**Orden de ejecucion recomendado:** (1) fixes JS de BLE + instrumentacion de Salud → OTA inmediato y QA fisica que ya devuelve el string real del error iOS; (2) crear `with-health-connect.js`; (3) recien ahi la build EAS; (4) OTA final con el mapeo de `reason` a copy.

---

## 6. RIESGOS / REGRESIONES

1. **`manager.enable()` en Android 13+**: `BluetoothAdapter.enable()` esta deprecado desde API 33 y devuelve `false` sin hacer nada. El fix NO puede depender de el: siempre re-chequear `state()` y caer al deep link de ajustes. Si no, se cambia un error opaco por un boton que no hace nada.
2. **Cambiar `isBleAvailable()` a `NativeModules.BlePlx != null`**: bajo New Architecture bridgeless `NativeModules` es un proxy sobre `TurboModuleRegistry`; devuelve `null` si el modulo no existe, asi que el detect es valido, pero conviene envolverlo en try/catch y dejar el fallback al `loadManager()` viejo para no perder el boton en un runtime raro. Verificar en device Android **y** iOS (el nombre del modulo es `BlePlx` en ambos: `react-native-ble-plx/src/BleModule.js:855`).
3. **Instanciacion tardia del `BleManager`**: mover `new BleManager()` a `startScan` puede introducir un delay perceptible en el primer scan y, en iOS, mueve el prompt de permiso de Bluetooth al momento del tap (que es lo correcto, pero es un cambio de comportamiento visible en QA).
4. **Plugin que patchea `MainActivity`**: es un `withMainActivity` sobre codigo generado. Si el ancla no matchea debe **fallar el prebuild** (no continuar en silencio). Ademas hay que verificar que no colisione con `expo-splash-screen` (que ya inyecta `setTheme(R.style.AppTheme)` antes de `super.onCreate(null)`) — insertar **despues** de `super.onCreate(null)`, nunca antes.
5. **`registerForActivityResult` fuera de `onCreate`** lanza `IllegalStateException` ("LifecycleOwners must call register before they are STARTED"). Cualquier atajo de tipo "llamar el delegate lazy desde JS" esta condenado; tiene que ser en `onCreate`.
6. **Exigir el set de permisos concedidos en Android** (§2.5) hara que usuarios que hoy figuran "Conectado a Salud" en falso pasen a "no conectado" tras el update. Es lo correcto, pero es un cambio visible: la clave local `eva.health.optin` (`lib/health-prefs.ts:9`) queda en `true` de sesiones anteriores. Recomendado: revalidar el opt-in al montar (leer permisos concedidos con `getGrantedPermissions()` en Android) y limpiar la preferencia si ya no aplica.
7. **Tests**: `tests/mobile/ble-hr.test.ts` y `tests/mobile/health-aggregators.test.ts` cubren **solo** las partes puras (parser 0x2A37, base64, rssi, ventanas, sumSleepHours). Ninguno toca los controladores, asi que los fixes no rompen la suite; pero conviene agregar tests puros nuevos para `bleErrorKind` / mapeo de `reason` (es exactamente el tipo de logica que el proyecto ya separa en `*-pure.ts`).
8. **Sentry**: `@sentry/react-native` ya esta instalado y configurado (`app.json:166-172`). Loguear el error crudo de HealthKit/Health Connect es barato y es la unica forma de cerrar §2.3 sin adivinar; cuidar de NO mandar datos de salud, solo el string de error.
9. **No tocar `runtimeVersion`** al hacer los fixes JS: cualquier cambio en `app.json` que altere `version` invalida el canal OTA para los binarios de QA.

---

## 7. RESUMEN EJECUTIVO (5 lineas)

1. El binario de QA (`856829fa`, 07-25) **si trae** BLE, HealthKit y Health Connect: la premisa "falta el modulo nativo" no aplica a estos dos flujos.
2. BLE falla porque `startScan` nunca mira el estado del adaptador y colapsa 6 causas distintas en un solo string (`lib/ble-hr.ts:186-190`) — **100% arreglable por OTA**.
3. Salud/Android falla porque **nadie llama `HealthConnectPermissionDelegate.setPermissionDelegate(this)`** en `MainActivity`: `requestPermission` revienta o cuelga. Exige un config plugin NUEVO + build EAS.
4. Salud/iOS: el gate `isHealthAvailable()` da true siempre (`Object.assign` no lanza) y `iosInit` **se traga el error** — hay que instrumentar antes de "arreglar".
5. El salto a Play Store no tiene ninguna ruta desde el flujo BLE: sale del contrato de permisos de Health Connect.
