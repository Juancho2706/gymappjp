# R7 — Universo de wearables para HR en vivo (BPM y distancia durante cardio)

Investigacion para EVA (React Native / Expo 54, RN 0.81, iOS + Android; y PWA Next.js). Objetivo del CEO: soportar "todos los wearables posibles" para leer frecuencia cardiaca y distancia EN VIVO durante el cardio en el gimnasio. Este documento mapea el universo completo de fuentes de HR en tiempo real y su viabilidad real de integracion, separando lo que suena posible de lo que efectivamente se puede construir con esfuerzo razonable.

## Resumen ejecutivo

- **La palanca ganadora es el BLE estandar (perfil Heart Rate, servicio `0x180D` / caracteristica `0x2A37`).** Con UNA sola integracion (`react-native-ble-plx`) EVA cubre practicamente todas las cintas de pecho y brazaletes opticos del mercado (Polar, Garmin, Wahoo, Coospo, Magene, Scosche) y, ademas, muchos relojes en "modo broadcast" (Garmin, Coros, Suunto, e incluso Whoop). Es el ~80% del publico que hace cardio con pulsometro con el minimo trabajo.
- **Apple Watch NO transmite HR por BLE ni ANT+.** Usa un protocolo cerrado; no se puede escanear como una cinta. La unica via legitima para HR en vivo del Apple Watch es construir una **app companion nativa watchOS** que abra una `HKWorkoutSession` y envie las muestras al iPhone por WatchConnectivity. Esto es esfuerzo alto (target Swift nativo, fuera del flujo Expo managed).
- **Los agregadores de plataforma (HealthKit en iPhone, Health Connect en Android) son historicos/agregados, no streams en vivo.** HealthKit puede dar datos "casi en vivo" con `HKObserverQuery` + background delivery, pero con retrasos e inconsistencias; Health Connect no transmite en vivo, no tiene API de servidor y exige una app Android intermediaria. Ninguno sirve como fuente confiable de BPM segundo-a-segundo.
- **Wear OS / Galaxy Watch dan HR en vivo, pero solo desde dentro del reloj** (Health Services `ExerciseClient`/`MeasureClient`), reenviando al telefono via Wearable Data Layer API. Requiere una **app companion Wear OS**. Galaxy Watch NO tiene broadcast BLE nativo (feature request abierto).
- **PWA: Web Bluetooth funciona en Chrome/Edge Android** (servicio `heart_rate`, sin flags) y permite HR en vivo en el navegador. En **iOS NO existe Web Bluetooth en ningun navegador** (todos usan WebKit por politica de Apple). El unico fallback honesto en iOS PWA es empujar a la app nativa o entrada manual.
- **Callejones sin salida para HR en vivo:** Fitbit (Web API solo historico, 24h, aprobacion caso-a-caso), Huawei Health (cloud/historico, HMS restringido), Xiaomi/Amazfit (ecosistema cerrado, sin API publica en vivo), y **ANT+** (solo Android, requiere radio hardware casi extinta en telefonos 2026). Descartar.

## Hallazgos

### 1. Agregadores de plataforma

**Apple Watch / HealthKit.** El dato en vivo del Apple Watch NO llega "gratis" a una app iOS. Para HR en tiempo real hay que iniciar una `HKWorkoutSession` en el reloj (app nativa watchOS) que mantiene el sensor activo y transmite muestras al iPhone; la app iOS sola puede usar `HKObserverQuery` + `enableBackgroundDelivery(for:frequency:)` para reaccionar a cambios, pero con retrasos de sincronizacion notables y actualizaciones poco confiables (a menudo solo al traer la app a primer plano). En la practica, "en vivo real" = app watchOS con workout session, no solo lectura de HealthKit ([Apple Developer Forums – livestream HR](https://developer.apple.com/forums/thread/102292), [WWDC25 – Track workouts with HealthKit](https://developer.apple.com/videos/play/wwdc2025/322/), [Forums – near real-time HR](https://developer.apple.com/forums/thread/774953)). Ademas, el Apple Watch **no transmite HR por BLE estandar ni ANT+**: usa un protocolo cerrado, por lo que no puede emparejarse como cinta con equipos o apps de terceros ([Apple Community](https://discussions.apple.com/thread/256036627), [Pelobuddy – BlueHeart workaround](https://www.pelobuddy.com/demo-guide-blueheart-broadcast-heart-rate-hr-from-apple-watch-to-peloton-bike-or-tread-via-bluetooth-ble/)).

**Health Connect (Android).** Esta pensado para agregar datos historicos, no para streaming. Soporta `readRecords` (ultimas muestras) y `aggregate` (min/max/avg en un rango), pero **no** entrega un flujo en vivo, y no tiene API de servidor: cualquier lectura exige una app Android local que suba el dato ([Android Developers – Health Connect](https://developer.android.com/health-and-fitness/health-connect), [arquitectura](https://developer.android.com/health-and-fitness/health-connect/architecture)). No sirve como fuente de BPM en vivo.

**Wear OS / Galaxy Watch.** El HR en vivo se obtiene *dentro del reloj* con Health Services: `ExerciseClient` entrega actualizaciones rapidas durante un ejercicio de tu propia app; `MeasureClient` mide HR puntual con info de disponibilidad; `PassiveClient` monitorea en segundo plano con batching de baja potencia ([Android Developers – Health Services](https://developer.android.com/health-and-fitness/health-services), [Medium – HR en Wear OS Health Services](https://medium.com/@fierydinesh/heart-rate-in-wearos-health-services-android-97dadc0c2987)). Para que ese dato llegue al telefono se usa la Wearable Data Layer API (`DataClient` con `putDataItem` marcado urgente, o `MessageClient`), y en el telefono un `WearableListenerService` con `onDataChanged`/`onMessageReceived` ([Data Layer API](https://developer.android.com/training/wearables/data/overview)). En Galaxy Watch, el `Samsung Health Sensor SDK` corre en el reloj (HR, IBI, ECG, PPG en Galaxy Watch4+) y reenvia al telefono por la misma Data Layer ([Samsung – transfer HR to phone](https://developer.samsung.com/health/blog/en/transfer-heart-rate-from-galaxy-watch-to-a-phone), [Samsung Health Sensor SDK](https://developer.samsung.com/health/sensor/overview.html)). Conclusion: se necesita una app companion Wear OS; no hay atajo desde el telefono. El Galaxy Watch **no** ofrece broadcast BLE nativo (peticion abierta de la comunidad, [Samsung Community](https://us.community.samsung.com/t5/Galaxy-Watch/Feature-Request-Heart-Rate-Broadcasting-via-BLE-for-Galaxy-Watch/td-p/3314341)).

### 2. Bluetooth LE estandar (perfil Heart Rate)

El perfil GATT Heart Rate (servicio `0x180D`, caracteristica de medicion `0x2A37`) es universal: byte 0 = flags, luego HR en uint8 (0-255) o uint16 segun flag ([nkolban/esp32-snippets #837](https://github.com/nkolban/esp32-snippets/issues/837), [wellally – React + Web Bluetooth](https://www.wellally.tech/blog/build-real-time-heart-rate-dashboard-react-bluetooth)). Lo emiten:

- **Cintas de pecho:** Polar H9/H10, Garmin HRM-Dual/HRM-Pro, Wahoo TICKR, Coospo, Magene. El Polar H10 expone Service UUID `0x180D` / Char `0x2A37` estandar ([polar-ble-sdk PolarH10.md](https://github.com/polarofficial/polar-ble-sdk/blob/master/documentation/products/PolarH10.md)).
- **Brazaletes opticos:** Polar Verity Sense, Scosche Rhythm.
- **Relojes en modo broadcast:** **Garmin** (broadcast BLE en Forerunner 245/945, Fenix 6+, Venu 3 y posteriores; los viejos solo ANT+) ([DCRainmaker – Garmin dual broadcast](https://www.dcrainmaker.com/2020/06/tidbit-bluetooth-broadcasting.html), [Garmin – FR955 broadcast](https://www8.garmin.com/manuals/webhelp/GUID-9D99A9D4-467A-4F1A-A0EA-023184FEA3DD/EN-US/GUID-57A88A77-3813-4E79-9DB1-FC95B06F01BA.html)); **Coros** (Broadcast HR desde el Toolbox, con limite de **una** conexion BLE simultanea) ([COROS – Broadcasting HR](https://support.coros.com/hc/en-us/articles/360040256991-Broadcasting-Heart-Rate)); **Suunto** (varios modelos permiten broadcast; verificar por modelo); y **Whoop** (transmite HR por BLE como si fuera una cinta) ([openwearables – Whoop API](https://openwearables.io/blog/whoop-api-recovery-strain-sleep-data-for-developers)). **Galaxy Watch y Apple Watch NO** hacen broadcast BLE.

**Libreria RN:** `react-native-ble-plx` (dotintent) va en **v3.2.0**, con **config plugin de Expo integrado** (SDK 43+), props `isBackgroundEnabled`, `neverForLocation`, `modes`, `bluetoothAlwaysPermission` ([README](https://github.com/dotintent/react-native-ble-plx/blob/master/README.md), [config-plugins](https://github.com/expo/config-plugins/blob/main/packages/react-native-ble-plx/README.md)). **No funciona en Expo Go**: exige `npx expo prebuild` + build de desarrollo/EAS (dev build nativa). Permisos: Android `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` (con `neverForLocation` para evitar el permiso de ubicacion), `BLUETOOTH_ADMIN`; iOS `NSBluetoothAlwaysUsageDescription`. Es UNA integracion que abarca todo el universo `0x180D`.

### 3. SDKs propietarios

- **Polar BLE SDK** (oficial, Android minSdk 24 / iOS 14+, usa ReactiveX): stream en vivo de HR, RR, ECG (130 Hz) y PPG/ACC en H10 y Verity Sense ([polar-ble-sdk README](https://github.com/polarofficial/polar-ble-sdk/blob/master/README.md)). Es SDK nativo sin wrapper RN oficial; para HR simple no aporta sobre `0x180D` (solo vale la pena para ECG/PPG avanzado).
- **Garmin:** no expone streaming en vivo a terceros por API. El Health SDK / Connect IQ es sincronizacion historica/companion; el unico camino en vivo real es el **broadcast BLE** del reloj (`0x180D`), ya cubierto por la Capa 1 ([Pulsoid – streaming HR desde Garmin](https://plsoid.medium.com/streaming-heart-rate-from-garmin-with-pulsoid-d04d06ae2d16)).
- **Fitbit:** Web API solo historico/intraday, tope de 24h por request y acceso intraday aprobado caso-a-caso; **no hay HR en tiempo real** ni broadcast BLE utilizable ([Fitbit dev – intraday](https://dev.fitbit.com/build/reference/web-api/intraday/)). Descartar para en vivo.
- **Whoop:** la API **no** entrega HR continuo/en vivo (webhooks diarios, HR historico a 1 min); pero el dispositivo **transmite HR por BLE** como cinta, asi que el unico camino en vivo es capturarlo con `react-native-ble-plx` (Capa 1) ([openwearables – Whoop](https://openwearables.io/blog/whoop-api-recovery-strain-sleep-data-for-developers)).
- **Xiaomi/Amazfit (Zepp):** ecosistema cerrado, sin API publica de HR en vivo para terceros; broadcast BLE inconsistente por modelo. No es camino confiable.
- **Huawei Health:** Health Kit es cloud/historico y restringido (mayormente HMS/China), sin streaming en vivo a terceros. Descartar.

### 4. PWA (Web Bluetooth)

En **Chrome/Edge de Android**, Web Bluetooth va sin flag: `navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] })`, luego GATT + `characteristic.startNotifications()` y evento `characteristicvaluechanged` para el stream en vivo; soporte global ~76% ([Chrome for Developers – Bluetooth](https://developer.chrome.com/docs/capabilities/bluetooth), [BLEFYI](https://blefyi.com/guide/web-bluetooth/)). En **iOS/iPadOS NO existe Web Bluetooth en ningun navegador**, ni Safari ni Chrome/Edge (todos obligados a WebKit); tampoco en iOS 18 ([ioswebble](https://ioswebble.com/), [TestMu – Web Bluetooth support](https://www.testmuai.com/learning-hub/web-bluetooth-browser-support/)). Los unicos "workarounds" son navegadores dedicados (Bluefy/WebBLE) o puentes WKWebView + CoreBluetooth, inservibles para una PWA normal. **Fallback honesto en iOS PWA:** no hay BLE; ofrecer la app nativa (o entrada manual de BPM/distancia). No prometer HR en vivo por web en iPhone.

### 5. ANT+

Protocolo de Garmin/Dynastream, **solo Android** y solo con radio ANT en hardware (o dongle). Cada vez menos telefonos lo traen; hubo reportes de ANT+ roto tras Android 13 en Galaxy ([ThisIsANT – ANT en telefonos](https://www.thisisant.com/consumer/ant-101/ant-in-phones), [Samsung Community – ANT roto Android 13](https://eu.community.samsung.com/t5/andere-galaxy-s-serien/ant-doesn-t-work-anymore-since-update-to-android-13-on-galaxy/m-p/6652501/highlight/true)). En 2026 es practicamente irrelevante para telefonos y todo sensor moderno tambien habla BLE. Descartar.

## Matriz de viabilidad

| Fuente | Cobertura de mercado | HR en vivo | Como en RN (lib + build nativa) | Como en PWA | Esfuerzo |
|---|---|---|---|---|---|
| Cintas de pecho BLE (Polar H9/H10, Garmin HRM-Dual/Pro, Wahoo TICKR, Coospo, Magene) | Alta (estandar cardio serio) | Si, nativo `0x180D` | `react-native-ble-plx` v3.2.0 — build nativa SI (prebuild/EAS, no Expo Go) | Web Bluetooth (Android si / iOS no) | S |
| Brazaletes opticos BLE (Polar Verity Sense, Scosche Rhythm) | Media-alta | Si, `0x180D` | Igual (misma integracion BLE) | Web Bluetooth (Android si / iOS no) | S |
| Relojes Garmin (broadcast BLE: FR245/945, Fenix 6+, Venu 3+) | Alta entre corredores | Si, en modo broadcast | Misma integracion BLE | Web Bluetooth (Android si / iOS no) | S |
| Relojes Coros (Broadcast HR) | Media | Si (1 sola conexion BLE) | Misma integracion BLE | Web Bluetooth (Android si / iOS no) | S |
| Relojes Suunto (broadcast segun modelo) | Baja-media | Si en modelos con broadcast | Misma integracion BLE | Web Bluetooth (Android si / iOS no) | S/M |
| Whoop (banda) | Media (nicho) | Solo via broadcast BLE (API no da vivo) | Misma integracion BLE | Web Bluetooth (Android si / iOS no) | S |
| Apple Watch | Muy alta en iPhone | Si, pero solo via app watchOS + `HKWorkoutSession` (NO BLE) | Target nativo watchOS + WatchConnectivity → RN; fuera de Expo managed | No (iOS sin Web Bluetooth) | L |
| Wear OS / Galaxy Watch | Alta en Android premium | Si, via app Wear OS (Health Services) + Data Layer | App companion Wear OS (Kotlin) + puente RN | No (fuera del navegador) | L |
| Fitbit | Alta base instalada | No (API historica 24h) | No hay camino en vivo | No | N/A |
| Xiaomi/Amazfit (Zepp) | Alta en gama baja | No confiable (cerrado) | Sin API publica en vivo | No | N/A |
| Huawei Health | Media (HMS) | No (cloud/historico) | Sin streaming a terceros | No | N/A |
| HealthKit (iPhone, sin app watchOS) | — | Casi-vivo, con retrasos poco confiables | `react-native-health` u otro; solo lectura diferida | No | M (poco confiable) |
| Health Connect (Android) | — | No (agregado/historico) | Lectura diferida via bridge | No | M (no sirve para vivo) |
| ANT+ | Marginal en 2026 | Si con hardware ANT | Solo Android con radio ANT (casi extinta) | No | Descartar |

## Estrategia recomendada por capas

**Capa 1 — BLE estandar `0x180D` (obligatoria, esfuerzo S/M).** Integrar `react-native-ble-plx` como unico canal de HR en vivo. Con esto EVA lee cualquier cinta o brazalete del mercado y, ademas, relojes Garmin/Coros/Suunto/Whoop puestos en "modo broadcast". Es una sola integracion que cubre el grueso del publico que hace cardio con pulsometro (~80% de los casos reales). Ya requieren build nativa (dev build/EAS), asi que el costo marginal es bajo. En PWA, replicar con **Web Bluetooth** para Android (mismo servicio `heart_rate`), aceptando que iOS web queda fuera. La distancia en vivo se estima on-device (GPS del telefono via `expo-location` para outdoor, o cadencia/tiempo para indoor); el BLE HR profile no transporta distancia salvo sensores de speed/cadence dedicados (perfil `0x1816`), que se pueden sumar con la MISMA libreria si se quiere cinta/bici.

**Capa 2 — Apple Watch via companion watchOS (opcional, esfuerzo L).** Para el gran publico iPhone que ya tiene Apple Watch y no quiere comprar cinta, la unica via legitima es una app nativa watchOS que abra `HKWorkoutSession`/`HKLiveWorkoutBuilder` y envie muestras al iPhone por WatchConnectivity, exponiendolas a RN por un modulo nativo. Es esfuerzo alto (target Swift fuera del flujo Expo managed, revision App Store del target watchOS). Priorizar solo si el segmento iPhone+Apple Watch es estrategico.

**Capa 3 — Wear OS / Galaxy Watch via companion (opcional, esfuerzo L).** Analogo en Android: app Wear OS con Health Services (`ExerciseClient`/`MeasureClient`) que empuja HR por Wearable Data Layer al telefono. En Galaxy Watch, `Samsung Health Sensor SDK` para IBI/ECG. Alto esfuerzo y fragmentacion; construir solo con demanda comprobada.

**Lo que NO se puede soportar (y por que).** *Fitbit:* la Web API es historica (24h, aprobacion caso-a-caso), sin HR en vivo ni broadcast; imposible en tiempo real. *Huawei Health:* cloud/historico, HMS restringido; sin streaming a terceros. *Xiaomi/Amazfit:* ecosistema cerrado sin API publica en vivo. *Apple Watch por BLE:* protocolo cerrado, no emula cinta; la unica via es la Capa 2. *iOS PWA con BLE:* WebKit no implementa Web Bluetooth en ningun navegador iOS; el fallback honesto es empujar a la app nativa o entrada manual. *ANT+:* dependiente de hardware casi extinto en telefonos 2026 y solo Android; redundante frente a BLE. *HealthKit/Health Connect como fuente "en vivo":* son almacenes agregados/historicos con retrasos; sirven para post-workout, no para BPM segundo-a-segundo.

**Sintesis operativa:** invertir primero y bien en la Capa 1 (BLE estandar) resuelve el mandato del CEO para la mayoria de usuarios con una integracion mantenible; las Capas 2 y 3 son inversiones grandes por-plataforma que solo se justifican si el publico Apple Watch / Galaxy Watch lo pide con volumen. Comunicar con honestidad que "todos los wearables posibles" en la practica significa "todo lo que hable BLE HR + relojes en broadcast", mas dos puentes nativos opcionales; Fitbit/Huawei/Xiaomi/Amazfit quedan fuera del vivo por decision de sus fabricantes, no por limitacion de EVA.

## Fuentes

- Apple Developer Forums — livestream HR desde Apple Watch: https://developer.apple.com/forums/thread/102292
- WWDC25 — Track workouts with HealthKit: https://developer.apple.com/videos/play/wwdc2025/322/
- Apple Developer Forums — near real-time HR: https://developer.apple.com/forums/thread/774953
- Apple Community — Apple Watch cannot broadcast HR: https://discussions.apple.com/thread/256036627
- Pelobuddy — BlueHeart (workaround broadcast Apple Watch): https://www.pelobuddy.com/demo-guide-blueheart-broadcast-heart-rate-hr-from-apple-watch-to-peloton-bike-or-tread-via-bluetooth-ble/
- Android Developers — Health Connect: https://developer.android.com/health-and-fitness/health-connect
- Android Developers — Health Connect architecture: https://developer.android.com/health-and-fitness/health-connect/architecture
- Android Developers — Health Services on Wear OS: https://developer.android.com/health-and-fitness/health-services
- Medium — HR en Wear OS (Health Services): https://medium.com/@fierydinesh/heart-rate-in-wearos-health-services-android-97dadc0c2987
- Android Developers — Data Layer API overview: https://developer.android.com/training/wearables/data/overview
- Samsung Developer — Transfer HR from Galaxy Watch to phone: https://developer.samsung.com/health/blog/en/transfer-heart-rate-from-galaxy-watch-to-a-phone
- Samsung Developer — Health Sensor SDK overview: https://developer.samsung.com/health/sensor/overview.html
- Samsung Community — Feature request BLE HR broadcast Galaxy Watch: https://us.community.samsung.com/t5/Galaxy-Watch/Feature-Request-Heart-Rate-Broadcasting-via-BLE-for-Galaxy-Watch/td-p/3314341
- react-native-ble-plx README (dotintent): https://github.com/dotintent/react-native-ble-plx/blob/master/README.md
- Expo config-plugins — react-native-ble-plx: https://github.com/expo/config-plugins/blob/main/packages/react-native-ble-plx/README.md
- Polar BLE SDK README: https://github.com/polarofficial/polar-ble-sdk/blob/master/README.md
- Polar BLE SDK — PolarH10.md: https://github.com/polarofficial/polar-ble-sdk/blob/master/documentation/products/PolarH10.md
- DCRainmaker — Garmin dual ANT+/BLE broadcasting: https://www.dcrainmaker.com/2020/06/tidbit-bluetooth-broadcasting.html
- Garmin — FR955 broadcasting HR during activity: https://www8.garmin.com/manuals/webhelp/GUID-9D99A9D4-467A-4F1A-A0EA-023184FEA3DD/EN-US/GUID-57A88A77-3813-4E79-9DB1-FC95B06F01BA.html
- Pulsoid — Streaming HR desde Garmin: https://plsoid.medium.com/streaming-heart-rate-from-garmin-with-pulsoid-d04d06ae2d16
- COROS Help Center — Broadcasting Heart Rate: https://support.coros.com/hc/en-us/articles/360040256991-Broadcasting-Heart-Rate
- OpenWearables — Whoop API (recovery/strain/sleep, sin HR continuo): https://openwearables.io/blog/whoop-api-recovery-strain-sleep-data-for-developers
- Fitbit Development — Intraday (historico 24h): https://dev.fitbit.com/build/reference/web-api/intraday/
- Chrome for Developers — Web Bluetooth: https://developer.chrome.com/docs/capabilities/bluetooth
- BLEFYI — Web Bluetooth guide: https://blefyi.com/guide/web-bluetooth/
- ioswebble — Web Bluetooth en iPhone (via app/puente, no Safari): https://ioswebble.com/
- TestMu (LambdaTest) — Web Bluetooth browser support: https://www.testmuai.com/learning-hub/web-bluetooth-browser-support/
- ThisIsANT — ANT en telefonos: https://www.thisisant.com/consumer/ant-101/ant-in-phones
- Samsung Community — ANT+ roto tras Android 13: https://eu.community.samsung.com/t5/andere-galaxy-s-serien/ant-doesn-t-work-anymore-since-update-to-android-13-on-galaxy/m-p/6652501/highlight/true
- nkolban/esp32-snippets #837 — estructura BLE HR (0x180D/0x2A37): https://github.com/nkolban/esp32-snippets/issues/837
- wellally.tech — React + Web Bluetooth (HR dashboard): https://www.wellally.tech/blog/build-real-time-heart-rate-dashboard-react-bluetooth
