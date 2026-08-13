# App Review iOS 1.1.0 — rechazo del 13-08-2026 y respuesta

Submission ID `912b9afb-6317-49b0-9bba-35868e812207` · versión revisada 1.1.0 (52) · device del revisor:
iPad Air 11" (M3).

Tres motivos: **2.5.4** (background mode de Bluetooth sin justificación), **2.5.1** (usa HealthKit sin
identificarlo en la UI) y **1.4.1** (información de salud sin citas). Los tres se arreglan con binario
nuevo — ninguno viaja por OTA (`app.json` + rutas nuevas).

## Qué se cambió en el código

### 2.5.4 — `bluetooth-central` en `UIBackgroundModes`

**Causa raíz.** El plugin `react-native-ble-plx` de `app.json` traía `modes: ["central"]`. Ese prop
inyecta `bluetooth-central` en `UIBackgroundModes` **independientemente** de `isBackgroundEnabled`
(ver `node_modules/react-native-ble-plx/plugin/build/withBLE.js`: `withBLEBackgroundModes` recibe
`_props.modes` sin mirar `isBackgroundEnabled`). EVA nunca usó BLE en background — el sensor de FC
se conecta solo con el ejecutor de cardio en pantalla.

**Fix.** Se quitó `modes` del plugin. Verificado con `npx expo config --type introspect --json`:
`UIBackgroundModes` queda **ausente** del Info.plist resuelto. `NSBluetoothAlwaysUsageDescription`
se conserva (BLE en foreground sigue funcionando igual).

### 2.5.1 — HealthKit no identificado en la UI

**Causa raíz.** La integración existía pero el único punto de entrada era una fila dentro del card de
Hábitos del inicio del alumno, y **solo** cuando la fecha seleccionada era HOY. Un revisor no tenía
cómo encontrarla.

**Fix.**
- Pantalla dedicada `apps/mobile/app/alumno/salud.tsx` — titulada **"Apple Salud"**, con el detalle
  de cada dato que EVA lee (pasos, sueño, entrenamientos, frecuencia cardiaca, distancia, calorías
  activas), para qué se usa, el botón conectar/desconectar y la sección de privacidad (solo lectura,
  nunca escribe, revocable).
- Fila permanente **"Apple Salud"** en Perfil del alumno (`perfil-salud-row`), siempre visible.
- El flujo de opt-in se extrajo a `apps/mobile/lib/use-health-connection.ts` para que el card de
  Hábitos y la pantalla nueva compartan la misma lógica (sin duplicar).

### 1.4.1 — información médica sin citas

**Fix.** Pantalla `apps/mobile/app/fuentes.tsx` ("Fuentes y método") con disclaimer explícito
(estimaciones, no diagnóstico, no reemplaza a un profesional) y las citas con link resoluble:

| Cálculo | Referencia |
| --- | --- |
| Metabolismo basal | Mifflin MD, St Jeor ST, et al. *Am J Clin Nutr.* 1990;51(2):241–247 — `doi.org/10.1093/ajcn/51.2.241` |
| Factores de actividad (PAL) | FAO/WHO/UNU. *Human energy requirements.* Roma; 2004 — `fao.org/4/y5686e/y5686e00.htm` |
| BMR por masa magra | Cunningham JJ. *Am J Clin Nutr.* 1980;33(11):2372–2374 — `doi.org/10.1093/ajcn/33.11.2372` |
| BMR por masa magra | Katch FI, McArdle WD, Katch VL. *Exercise Physiology.* |
| Proteína 1,6–2,2 g/kg | Jäger R, et al. ISSN Position Stand. *J Int Soc Sports Nutr.* 2017;14:20 — `doi.org/10.1186/s12970-017-0177-8` |
| Grasas 20–35% kcal | Institute of Medicine. *DRIs for Energy, Carbohydrate, Fiber, Fat…* 2005 — `doi.org/10.17226/10490` |
| Atwater 4/4/9 kcal/g | FAO. *Food energy — methods of analysis and conversion factors.* FNP 77; 2003 — `fao.org/4/y5022e/y5022e00.htm` |
| Composición de alimentos | USDA FoodData Central — `fdc.nal.usda.gov` |
| Productos escaneados | Open Food Facts — `world.openfoodfacts.org` |

Entradas a esa pantalla (tienen que ser fáciles de encontrar, es lo que pide la guideline):

1. Nutrición → link **"Cómo se calculan estos números · Fuentes"** pegado debajo del anillo de kcal.
2. Perfil → **"Fuentes y método"**.
3. Composición corporal → **"Ver fuentes y método de cálculo"** dentro del disclaimer.

## Pendiente antes de reenviar

1. **Build nueva** (`eas build -p ios --profile production`). `autoIncrement` + `appVersionSource:
   remote` suben el build number solo — no tocar `buildNumber` a mano.
2. **Dos screen recordings en device físico** (los pide Apple explícitamente) y subirlos al campo
   *Notes* de App Review Information:
   - **HealthKit**: abrir EVA como alumno → Perfil → "Apple Salud" → mostrar la pantalla completa →
     tocar "Conectar con Apple Salud" → mostrar la hoja de permisos de HealthKit → volver → mostrar
     los pasos autocompletados en Hábitos del inicio.
   - **Bluetooth** (opcional, solo si vuelven a preguntar): alumno → entrenamiento con bloque de
     cardio → "Conectar sensor" → mostrar el escaneo BLE y la lectura de FC en vivo con una cinta.
3. **Notes de App Review**: dejar escrito que la cuenta demo es de alumno, dónde están las citas
   (Nutrición → "Cómo se calculan estos números", y Perfil → "Fuentes y método"), dónde está
   HealthKit (Perfil → "Apple Salud"), y que el Bluetooth es **solo foreground** — por eso ya no
   hay background mode declarado.
4. **Mencionar que la app es solo iPhone** (`supportsTablet: false`). Las dos revisiones se hicieron
   en iPad, donde la app corre en modo compatibilidad; pedir amablemente que la prueben en iPhone
   es legítimo y reduce el riesgo de que HealthKit se comporte distinto.

## Paridad web (no bloquea a Apple)

La web muestra los mismos cálculos (`PlanBuilderSidebar`, builder V2, vista del alumno) y todavía no
tiene la pantalla de fuentes. Replicarla ahí queda pendiente.
