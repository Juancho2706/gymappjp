# Ventajas nativas del teléfono — plan de features (coach/alumno standalone)

_2026-06-06 · Investigación web 2026 (9 temas) verificada contra factibilidad real en Expo SDK 54 / RN 0.81 / New Architecture · Objetivo: que la RN mobile **iguale o SUPERE** a la web/PWA usando lo que el teléfono puede y el navegador no._

> **Prioridad:** v1 (primer release standalone) · v2 (siguiente) · later (futuro/enterprise). **Esfuerzo:** S/M/L/XL.
> **Regla de oro:** todo esto requiere **dev build** (no Expo Go) — EVA ya buildea con EAS local, así que no es bloqueante. Validar cada add con `tsc --noEmit` + `expo export` + prueba en **device físico** (varias features no corren en simulador).

---

## 1. Resumen ejecutivo — qué gana el teléfono que la web NO puede

| Tema | Veredicto | Por qué la web NO puede | v1 |
|------|-----------|--------------------------|----|
| **Push + recordatorios locales** | 🔴 must-have | iOS Safari PWA: push frágil/sin canales; no hay recordatorios locales fiables | ✅ |
| **Offline-first robusto** | 🟢 high-value | Safari sin Background Sync, cache ~50MB purgable | ✅ (endurecer lo que hay) |
| **Cámara + scan de barras** | 🟢 high-value | BarcodeDetector web falla; cámara web pobre | ✅ |
| **Login biométrico (Face ID)** | 🟢 high-value | WebAuthn móvil inconsistente; token en navegador | ✅ |
| **HealthKit / Health Connect** | 🟢 high-value | **Imposible en web** (no hay API) | ✅ (peso + pasos) |
| **Rest timer background / Live Activity** | 🟢 high-value | JS se suspende; no hay Live Activities en web | ✅ (local) / v2 (Live Activity) |
| **Widgets home/lock screen** | 🟢 high-value | **Técnicamente imposible en PWA** | v2 (requiere SDK 56) |
| **Wearables (leer del reloj)** | 🟡 nice-to-have | Web no accede a HealthKit | v2 (lectura) / later (app de reloj) |
| **UX/retención (gamificación)** | 🟢 high-value | rachas/celebración + haptics nativos | ✅ (ver doc UX) |

---

## 2. v1 — el stack nativo del primer release

### Push notifications + recordatorios (must-have) · `expo-notifications`
La mayor palanca de retención (adherencia del alumno = renovación del coach).
- **v1:** permisos con *priming* (pantalla que explica el valor ANTES del prompt nativo; iOS solo pregunta 1 vez); **recordatorios LOCALES** programables de entreno/comida/check-in (sin backend, sin red, hora exacta, repetibles); **deep-link** desde la notificación a la pantalla exacta (Expo Router `data.url`); **push remoto coach→alumno** ("tu coach actualizó tu plan") vía tabla `push_tokens` + Edge Function + Expo Push API (killer feature B2B2C); **rachas** con *streak freeze* (loss aversion sin castigo).
- **Gotchas:** el campo `notification` de `app.json` está DEPRECADO en SDK 54 → migrar al **config plugin** de `expo-notifications`. Android: `SCHEDULE_EXACT_ALARM` (API 31+), crear *channels* ANTES de programar, `POST_NOTIFICATIONS`. iOS: credenciales APNs (EAS). Testear en device real (background/app matada).
- **v2:** badges/logros, win-back automatizado por inactividad, centro de preferencias granular, timing personalizado por ventana de actividad (+50% open rate), rich push + actions.
- **Ligado a:** `push_tokens` ya marcado P0 en memoria del proyecto; revocar token en logout (bug actual del coach).

### Offline-first (high-value) · **endurecer lo existente, NO migrar**
- **v1:** instalar `@react-native-community/netinfo` (hoy la detección es por inferencia de error → bugs S1 en alumno); **idempotencia por `client_log_id`** (UUID con `expo-crypto`) para que cortar la señal a mitad de request NO duplique series; flush **por-item resiliente** (hoy workout flush es todo-o-nada); flush también al **reconectar** (no solo al volver a foreground). Opcional: migrar AsyncStorage→**MMKV v3** (~30× más rápido, Nitro/New Arch).
- **NO v1:** WatermelonDB (frágil en SDK 54), PowerSync (de pago), CRDTs (innecesario; last-write-wins por `client_log_id` basta). `expo-sqlite` (incluido) si se necesita estructura compleja = v2.
- **Cierra:** los S1 de offline del alumno (comidas perdidas, series que desaparecen → duplican).

### Cámara + scan de barras (high-value) · `expo-camera` (ya instalado)
- **v1:** botón "Tomar foto" con cámara nativa en check-in (hoy solo galería); comprimir con `expo-image-manipulator` (ya instalado) y normalizar HEIC→JPEG; **escaneo de código de barras** de alimentos (`CameraView` `onBarcodeScanned` ean13/upc) → fetch a **Open Food Facts** (2.8M productos, gratis) → autocompletar macros, SIEMPRE con pantalla de confirmación/edición + fallback manual (cobertura Chile variable).
- **Nota:** en SDK 54 el scanner está integrado en `CameraView` (`expo-barcode-scanner` deprecado). Bug `#44491` afecta SDK **55**, no 54 (validar al migrar). NO usar vision-camera en v1 (sobre-ingeniería).
- **v2:** ghost overlay (foto anterior translúcida) para alinear pose; cache de productos escaneados; vista comparativa por fecha.

### Login biométrico + sesión segura (high-value) · `expo-local-authentication` + `expo-secure-store`
- **v1:** persistir sesión Supabase (refresh token) en **Keychain/Keystore** (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); **quick unlock** con Face ID/huella al reabrir si ya hay sesión; toggle opt-in en Ajustes (nunca forzar); fallback robusto a password si la biometría falla/cambia; limpiar secure-store en logout.
- **Patrón:** la biometría **desbloquea localmente** un token ya emitido por Supabase — no reemplaza el login. `NSFaceIDUsageDescription` obligatorio (iOS). Para v1, usar biometría como *gate* (no `requireAuthentication` a nivel item, que se invalida al cambiar biometría).
- **v2:** gating de pantallas sensibles (fotos de progreso, datos de salud). **later:** passkeys/WebAuthn.

### HealthKit / Health Connect (high-value) · por plataforma detrás de un servicio propio
- **v1:** leer **PESO** (autocompletar check-in + verlo el coach) y **PASOS** (única señal universal sin wearable); pantalla de permisos/onboarding de Salud (exigida por Apple 2.5.1 y Google Play).
- **Libs:** iOS `@kingstinct/react-native-healthkit` v14 (Nitro, New Arch, config plugin); Android `react-native-health-connect` + `expo-health-connect` (minSdk 26). **NO** Google Fit (fuera de servicio fin 2026).
- **v2:** sesiones de entrenamiento, FC, sueño (solo brillan con wearable). **later:** escritura, background delivery, integración directa Garmin/Whoop.
- **Riesgos:** Google Play whitelist tarda 5-12 días hábiles → planificar antes del lanzamiento; Apple rechaza si pides muchos tipos de golpe (pedir solo peso/pasos al inicio); testear en device físico.

### Rest timer que sobrevive el lock (high-value) · `expo-notifications` + `expo-haptics` + `expo-audio`
- **v1 (cross-platform, sin código nativo):** notificación local programada al terminar el descanso (suena con app en background/pantalla bloqueada); haptic escalonado en los últimos 3s + `notification.Success` al terminar; sonido que suena en modo silencio (`expo-audio` con sesión configurada); **timer basado en timestamp absoluto** (no `setInterval`) para no driftear al volver de background.
- **v2 (diferenciador "wow", iOS):** **Live Activity** del rest timer en Dynamic Island + lock screen (`expo-live-activity` de software-mansion-labs) — countdown nativo `Text(timerInterval:)` renderizado por el SO (cero batería, sin server), con branding del coach. Requiere config plugin + dev build, iOS 16.2+.
- **later:** Android foreground service / Live Updates (ecosistema inmaduro).

---

## 3. v2 / later

- **Widgets home/lock** (high-value, imposible en PWA): "próximo entreno + racha" y "macros del día". **Bloqueante de versión:** `expo-widgets` oficial es **alpha en SDK 55, estable en SDK 56** — NO está en SDK 54. Opciones: subir a SDK 56 (recomendado) y usar `expo-widgets`, o `@bittingz/expo-widgets` comunitario (SwiftUI+Kotlin a mano). **Empezar con UN widget iOS small**, medir adopción. Android y branding por coach = later.
- **Wearables:** leer métricas de workout del reloj vía HealthKit/Health Connect (v2, alto valor); **app companion de reloj = later** (RN no corre en watchOS/Wear OS → Swift/Kotlin nativo, 2 bases extra).
- **Gamificación social / leaderboards:** later + enterprise (multi-tenant/RLS, riesgo de desmotivar).

---

## 4. Dependencias a agregar (resumen)

| Dep | Para | Ola |
|-----|------|-----|
| `@react-native-community/netinfo` | detección de red (offline) | v1 |
| `expo-secure-store` + `expo-local-authentication` | sesión segura + Face ID | v1 |
| `expo-notifications` (+ config plugin) | push + recordatorios locales | v1 |
| `expo-audio` | sonido del rest timer | v1 |
| `expo-crypto` | UUID idempotente offline | v1 |
| `@kingstinct/react-native-healthkit` (iOS) | leer peso/pasos | v1 |
| `react-native-health-connect` + `expo-health-connect` (Android) | leer peso/pasos | v1 |
| `expo-camera` ✅ ya instalado | foto check-in + barcode | v1 |
| `react-native-mmkv` v3 (opcional) | storage rápido | v1/v2 |
| `expo-live-activity` | rest timer Dynamic Island | v2 (iOS) |
| `expo-widgets` (requiere SDK 56) / `@bittingz/expo-widgets` | widgets | v2 |

> Cada dep nueva con postinstall debe declararse en `pnpm-workspace.yaml#allowBuilds` (regla del repo).

Las features de UI/animación nativas (confetti, count-up, rings animados, haptics con carácter) están en [mobile-ux-design-language.md](mobile-ux-design-language.md). La secuencia integrada (qué ola hace qué) está en [mobile-roadmap.md](mobile-roadmap.md).
