# F7 — Sonido del sistema para el cronómetro y wheel picker para kg/reps

Investigación de fundamentos para el rediseño del ejecutor de EVA (React Native + Expo 54, iOS y Android, y PWA). Dos preguntas independientes del CEO, resueltas con evidencia técnica y de UX verificada en la web (julio 2026).

## Resumen ejecutivo

**Sonido del cronómetro de descanso.** La promesa "usar el mismo sonido que la persona configuró en su móvil para alarma/cronómetro" es **cumplible en Android pero imposible en iOS**. En Android existe una API pública (`RingtoneManager.getDefaultUri(TYPE_ALARM/TYPE_NOTIFICATION)`) que devuelve el URI del tono elegido por el usuario, y ese URI se puede reproducir o asignar como sonido de un canal de notificación con `USAGE_ALARM`; requiere un módulo nativo (build nativa, no Expo Go). En iOS **no existe ninguna API pública** para leer ni reproducir el tono de alarma, timer o ringtone que el usuario configuró: Apple lo bloquea deliberadamente, incluso `kSystemSoundID_UserPreferredAlert` "no reproduce nada". Lo honesto en iOS es ofrecer un **catálogo propio de sonidos bundleados** más el sonido por defecto de notificación (`UNNotificationSound.default`). Conclusión práctica: la UI de ajustes debe ser **asimétrica por plataforma** — en Android puede ofrecer "usar el sonido de alarma de tu teléfono" + catálogo propio; en iOS solo catálogo propio + "sonido por defecto". Nunca prometer "tu sonido del sistema" en iOS.

**Wheel picker para kg/reps.** La evidencia UX es **matizada pero se inclina en contra del wheel como control primario** para rangos grandes con decimales (0–300 kg en pasos de 2,5). Los pickers de rueda son buenos para rangos cortos y acotados y para ajustes finos con una mano, pero son lentos y frustrantes cuando hay que recorrer distancias largas (de 10 a 200), y ocultan el resto de valores. Las apps de fitness líderes (Strong, Hevy) **no usan wheel** para el registro de series: usan un teclado numérico propio/compacto con autorrelleno del valor anterior, precisamente porque priorizan velocidad de logging. Recomendación: **teclado numérico como control primario** (rápido para saltos grandes), con **steppers +/− opcionales** para microajustes (±2,5 kg, ±1 rep) y, si se quiere, un wheel **solo como modo secundario centrado en el valor previo** con rango corto. No hacer el wheel el único método.

---

## Sonido del sistema (hallazgos)

### El caso de uso real importa

El "cronómetro de descanso" de un ejecutor de gym tiene dos escenarios distintos que cambian la respuesta técnica:

1. **App en primer plano** (la persona mira la cuenta regresiva): basta reproducir un archivo de audio con `expo-audio`/`expo-av` configurando la sesión de audio en categoría `playback`. Cross-platform, simple.
2. **App en segundo plano / pantalla bloqueada** (deja el teléfono entre series): hace falta o bien una **notificación local programada** para el instante en que termina el descanso (`expo-notifications`), o bien audio en background con `UIBackgroundModes: audio` (iOS) y controles de lock screen (Android corta el audio en background a los ~3 min si no se configuran los lock-screen controls). Las notificaciones locales son el camino estándar para "avísame cuando termine el descanso".

Esta distinción es la que determina de dónde sale el sonido: audio in-app (control total del archivo) vs. sonido del **canal de notificación** (Android) o `UNNotificationSound` (iOS).

### Android: sí se puede leer el tono del usuario

`RingtoneManager.getDefaultUri(int type)` acepta `TYPE_RINGTONE`, `TYPE_NOTIFICATION` o `TYPE_ALARM` y devuelve el `Uri` del sonido por defecto que el usuario tiene configurado para ese tipo. Ese URI se puede:

- **Reproducir directamente** con `RingtoneManager.getRingtone(context, uri).play()` o un `MediaPlayer` (útil en foreground).
- **Asignar como sonido de un canal** de notificación vía `NotificationChannel.setSound(uri, audioAttributes)` con `AudioAttributes.USAGE_ALARM`. Usar `USAGE_ALARM` es importante porque le da permiso al OS de reproducir el audio completo (el sonido de notificación normal se corta a ~5 s) y de sonar como alarma.

Gotcha crítico de Android 8+: **el sonido de un canal no se puede cambiar tras crearlo** por código; solo el usuario puede editarlo en Ajustes del sistema. Si querés ofrecer selección de sonido en la app, el patrón es **crear un canal distinto por cada sonido** (p. ej. `rest-timer-alarm`, `rest-timer-notif`, `rest-timer-mixkit1`) y enrutar la notificación al canal correcto. Cambiar de sonido = cambiar de canal, no mutar el existente.

Librerías RN/Expo (estado 2026):
- **`react-native-ringtone-manager`** (millerbennett): expone `getRingtones()`, `setRingtone()`, `pickRingtone()`. **Android-only**, poca actividad (2 stars). Su README dice explícitamente que setear ringtones "no está disponible en iOS, no hay API pública". Sirve para listar/obtener tonos del sistema en Android.
- **`react-native-notification-sounds`** (saadqbal): recupera la lista de sonidos del sistema (incluye filtro por alarma) y sus rutas, para dejar que el usuario elija; **Android** principalmente.
- **Notifee**: permite crear canales nativamente con `AudioAttributes` y `USAGE_ALARM`, y bundlear sonidos en `res/raw`. Es la vía recomendada cuando `expo-notifications` se queda corto con canales/sonidos largos.
- **`expo-notifications`**: soporta sonidos custom por canal, pero hay issues conocidos (sonido custom que solo funciona en foreground, config plugin para meter el `.wav` en `res/raw`).

Todas requieren **build nativa** (development build / EAS), no funcionan en Expo Go.

### iOS: no se puede (verificado)

No existe API pública para leer ni reproducir el tono de alarma/timer/ringtone del usuario. Los foros oficiales de Apple lo confirman: "system-supplied alert sounds and system-supplied user-interface sound effects are not available to iOS applications"; usar `kSystemSoundID_UserPreferredAlert` con `AudioServicesPlayAlertSound` **no reproduce nada**. Las apps de terceros solo tienen selección de tonos locales, sin acceso a la biblioteca de música ni a los tonos del sistema.

Alternativas honestas en iOS:
- **`UNNotificationSound.default`**: el sonido de notificación por defecto del sistema (no configurable por la app, pero es "del sistema").
- **Sonido custom bundleado** en la notificación: archivo ≤30 s en el bundle, referenciado por `UNNotificationSound(named:)`.
- **Audio in-app** con `expo-audio` en categoría `playback`: reproducir cualquier `.caf`/`.wav`/`.mp3` propio cuando la app está activa.
- **`AudioServicesPlaySystemSound(systemSoundID)`**: reproduce **sonidos del propio bundle** o un conjunto acotado de IDs de sistema; **no** da acceso al tono de alarma elegido por el usuario, y depender de IDs de sistema no documentados es riesgo de rechazo en App Store. No es la vía.
- **AlarmKit (iOS 26+)**: framework nuevo (WWDC25) que sí **rompe silent mode y Focus/DND** con consentimiento del usuario (`NSAlarmKitUsageDescription`), y sirve para timers/alarmas en Lock Screen y Dynamic Island. **Pero**: (a) solo iOS 26+, (b) los **sonidos custom estaban rotos** en iOS 26.0 estable (reproducía un beep de error en vez del archivo — múltiples reportes en dev forums), (c) **no** da acceso al tono personal del usuario, solo a sonidos del bundle, (d) requiere módulo nativo (existe `react-native-nitro-ios-alarm-kit`, build nativa, device real). AlarmKit es interesante a futuro para "que suene aunque esté en silencio", no para "el sonido que el usuario eligió".

### Tabla iOS vs Android

| Capacidad | Android | iOS |
|---|---|---|
| Leer el tono de **alarma** que configuró el usuario | Sí — `RingtoneManager.getDefaultUri(TYPE_ALARM)` | **No** (sin API pública) |
| Reproducir ese tono in-app | Sí — `Ringtone`/`MediaPlayer` | No |
| Usar ese tono como sonido de notificación | Sí — canal con `setSound(uri, USAGE_ALARM)` | No |
| Catálogo propio bundleado | Sí (`res/raw`) | Sí (bundle, ≤30 s en notif) |
| Sonido "por defecto del sistema" | Sí (`TYPE_NOTIFICATION` default) | Sí (`UNNotificationSound.default`) |
| Romper silent/DND para que suene | Con `USAGE_ALARM` (parcial) | Solo con **AlarmKit** (iOS 26+, consent) |
| Cambiar sonido sin recrear canal | **No** (canal por sonido) | N/A (se pasa en cada notif) |
| Librería madura RN | `react-native-ringtone-manager`, `react-native-notification-sounds`, Notifee | `expo-notifications`, `react-native-nitro-ios-alarm-kit` (iOS 26) |
| Requiere build nativa | Sí | Sí |

### Qué puede prometer la UI sin mentir

- **Android**: opción "Usar el sonido de alarma de tu teléfono" (lee `TYPE_ALARM`) + "Usar tono de notificación del teléfono" (`TYPE_NOTIFICATION`) + catálogo propio de EVA. Todo real.
- **iOS**: "Sonido por defecto" (`UNNotificationSound.default`) + **catálogo propio de EVA** (varios tonos bundleados). Nada de "tu sonido del sistema/alarma".
- **Copy honesto y unificado**: llamar la sección "Sonido del descanso" con una lista de opciones EVA + (solo Android) un ítem extra "sonido del sistema". No mostrar en iOS un selector que insinúe leer los tonos del teléfono.

---

## Wheel picker (hallazgos)

### Evidencia UX

La literatura converge en que **el método de entrada debe casar con el rango y la precisión**, no en que el wheel sea universalmente bueno o malo:

- **NN/g (input steppers)**: los steppers +/− son ideales cuando hay un valor por defecto claro y ajustes pequeños/discretos (interacción de un tap para pasar de 1 a 2), pero son **impracticables para rangos amplios** (de 1 a 50 obliga a demasiados taps) y para cantidades continuas donde el valor exacto importa; ahí conviene teclear. Recomiendan target táctil mínimo ~1 cm para no disparar la tasa de error (Fitts).
- **Mobiscroll (numeric values)**: recomienda **numpad** para entrada libre ("teclado enfocado, más rápido y fácil que el teclado completo"), **stepper** para números chicos, y **scroller/wheel solo para rangos acotados** — textual: "si el rango es muy grande y el usuario debe scrollear de 10 a 1000000, usá otra cosa".
- **Pickers de rueda (críticas)**: son buenos para operar con un dedo en touch, pero **ocultan los demás valores**, ocupan mucha pantalla y son lentos cuando hay que recorrer distancias largas; usuarios reportan frustración al scrollear en vez de teclear. El numpad "es lo más rápido si sabés lo que querés ingresar y tenés que meter muchos valores" — exactamente el caso del logging de series.

Para kg con decimales de 2,5 en rango 0–300, un wheel de una sola columna tendría ~120 posiciones (0; 2,5; 5; …; 300), lo que lo vuelve largo de recorrer; una solución de dos columnas (entero + fracción) reduce el recorrido pero añade complejidad y no es más rápida que teclear "82,5".

### Qué hacen las apps de fitness

- **Strong** y **Hevy** — las dos referencias de "logging rápido" — están diseñadas alrededor de la **velocidad de registro**: se elige ejercicio, se ingresan series/reps con un **teclado numérico** y **autorrelleno del último valor** ("Hevy auto-completa tus pesos y reps previos"). No usan wheel para peso/reps; el foco es teclear/confirmar rápido con el valor anterior ya puesto.
- El patrón dominante en trackers de fuerza es **campo numérico + prellenado del histórico + steppers opcionales**, no la rueda. La rueda aparece más en selección de tiempo/fechas o en valores muy acotados.

### Librerías RN maduras (2026)

- **`@quidone/react-native-wheel-picker`**: la opción moderna más usada; API declarativa, date picker incluido. Companion **`@quidone/react-native-wheel-picker-feedback`** (v2.0.0) da **haptics y sonido por tick** vía `triggerImpact()`, `triggerSound()`, `triggerSoundAndImpact()` — **pero el feedback háptico es solo iOS** (en Android "no pasa nada"). **Gotcha de rendimiento**: con muchos ítems (~1000) el modal tarda en aparecer y el scroll se pone muy lento; dentro de `@gorhom/bottom-sheet` en Android hay issues de performance reportados. Para 0–300 kg conviene acotar la lista o virtualizar.
- Otras (`react-native-picker-select`, wrappers de `UIPickerView`) existen pero con menos tracción o dependientes de vistas nativas.

### Veredicto con matices

- **En contra como control primario** para kg/reps de rango grande con decimales: es más lento que teclear para saltos grandes, oculta valores, ocupa pantalla y tiene costos de performance con listas largas. Las apps líderes lo evitaron por eso.
- **A favor como control secundario/microajuste**: con la rueda **centrada en el valor previo** y rango corto (p. ej. ±10 kg alrededor de lo último), da una interacción de una mano agradable con haptics (iOS). Buen "modo alternativo", no el único.

---

## Recomendación para EVA

### Sonido del cronómetro

1. **Construir un catálogo propio de EVA** (4–6 tonos: beep suave, campana, timbre, etc.), bundleado en ambas plataformas. Es la base común que nunca miente.
2. **Ajuste asimétrico por plataforma**, detectando `Platform.OS`:
   - Android: agregar opciones "Sonido de alarma del teléfono" y "Sonido de notificación del teléfono" leídas con `RingtoneManager` (módulo nativo o `react-native-notification-sounds`), reproducibles in-app y asignables al canal con `USAGE_ALARM`. Recordar el patrón **un canal por sonido** (no mutar canal).
   - iOS: "Sonido por defecto" (`UNNotificationSound.default`) + catálogo EVA. Sin promesa de "tu sonido del sistema".
3. **Foreground vs background**: para el aviso con app cerrada/bloqueada usar **notificación local programada** al fin del descanso (`expo-notifications`/Notifee) con el sonido elegido; para la cuenta visible en foreground, `expo-audio` en categoría `playback`. Evaluar **AlarmKit (iOS 26+)** más adelante solo si se quiere "sonar aunque esté en silencio" — con la advertencia de sus sonidos custom rotos y su requisito de iOS 26.
4. **Copy honesto**: nunca mostrar en iOS un selector que sugiera leer los tonos del teléfono.

### Wheel picker para kg/reps

1. **Primario: teclado numérico** con **prellenado del valor de la sesión anterior** (patrón Strong/Hevy) — es lo más rápido y lo que los alumnos ya conocen.
2. **Steppers +/− opcionales** con incrementos sensibles (peso ±2,5 kg / ±5 lb; reps ±1) para microajustes de una mano sin abrir teclado.
3. **Wheel solo como modo secundario** (si el CEO insiste): rueda **centrada en el valor previo**, rango corto, con `@quidone/react-native-wheel-picker` + feedback háptico (iOS). Nunca como único método y cuidando la performance con listas acotadas.
4. **No** hacer que anotar 82,5 kg cuando venías de 60 kg obligue a scrollear una rueda larga: para saltos grandes, teclado.

En síntesis: catálogo EVA + "sonido del sistema" solo donde de verdad se puede (Android); y teclado numérico con prellenado como rey del logging, con steppers de apoyo y wheel como lujo opcional.

---

## Fuentes

**Sonido / Android:**
- react-native-ringtone-manager — https://github.com/millerbennett/react-native-ringtone-manager
- react-native-notification-sounds — https://github.com/saadqbal/react-native-notification-sounds
- Notifee — behaviour / canales y sonido — https://notifee.app/react-native/docs/android/behaviour/
- RingtoneManager (Android reference, mirror) — https://stuff.mit.edu/afs/sipb/project/android/docs/reference/android/media/RingtoneManager.html
- Batch — custom notification sounds en Android (USAGE_ALARM, res/raw) — https://doc.batch.com/developer/technical-guides/how-to-guides/mobile/android-specific/how-to-use-custom-notification-sounds-on-android
- expo-notifications custom sound issues — https://github.com/expo/expo/issues/27978 ; https://github.com/expo/expo/issues/16447

**Sonido / iOS:**
- Apple Dev Forums — "Using system sound for a UI Alert" (kSystemSoundID_UserPreferredAlert no suena) — https://developer.apple.com/forums/thread/95221
- WWDC25 — Wake up to the AlarmKit API — https://developer.apple.com/videos/play/wwdc2025/230/
- WWDCNotes — AlarmKit (rompe silent/Focus, consent, sonidos del bundle) — https://wwdcnotes.com/documentation/wwdc25-230-wake-up-to-the-alarmkit-api/
- Apple Dev Forums — AlarmKit no reproduce sonidos custom (iOS 26) — https://developer.apple.com/forums/thread/795417 ; https://developer.apple.com/forums/thread/798140 ; https://developer.apple.com/forums/thread/802620
- react-native-nitro-ios-alarm-kit (bindings RN de AlarmKit, iOS 26+) — https://github.com/Gautham495/react-native-nitro-ios-alarm-kit
- expo-audio (categoría playback, background/lock screen) — https://docs.expo.dev/versions/latest/sdk/audio/

**Wheel picker / UX:**
- NN/g — Design Guidelines for Input Steppers — https://www.nngroup.com/articles/input-steppers/
- Mobiscroll — Numeric Values (numpad vs scroller vs stepper) — https://blog.mobiscroll.com/numeric-values/
- Mobiscroll — dial/scroller vs keypad (pickers de fecha/tiempo) — https://blog.mobiscroll.com/date-time-dial-scroller-keypad/
- Balsamiq — Numeric stepper guidelines — https://balsamiq.com/learn/steppers/

**Wheel picker / librerías RN:**
- @quidone/react-native-wheel-picker — https://github.com/quidone/react-native-wheel-picker ; https://www.npmjs.com/package/@quidone/react-native-wheel-picker
- @quidone/react-native-wheel-picker-feedback (haptics/sonido por tick, iOS) — https://github.com/quidone/react-native-wheel-picker-feedback
- Issue de performance con muchos ítems / bottom-sheet — https://github.com/quidone/react-native-wheel-picker/issues/49

**Apps de fitness (logging):**
- Hevy App Review (autorrelleno, logging rápido) — https://repreturn.com/hevy-app-review/
- Comparativa Fitbod/Strong/Hevy 2026 — https://www.sensai.fit/blog/hevy-vs-strong-vs-fitbod-vs-jefit
- Strong — Workout Tracker (logging rápido, timers) — https://www.strong.app/
