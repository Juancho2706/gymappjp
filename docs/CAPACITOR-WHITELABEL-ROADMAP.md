# Capacitor + Next.js: Roadmap para App Nativa White-Label

> **Estado:** Investigación / Planificación  
> **Cuándo ejecutar:** Cuando EVA tenga 20-30 coaches pagando y el modelo de negocio esté validado.  
> **Complejidad:** Media. No requiere reescribir la app.

---

## 1. ¿Qué es Capacitor?

**Capacitor** (creado por Ionic) es un "puente" nativo que toma tu aplicación web y la envuelve dentro de un **WebView nativo** (WKWebView en iOS, WebView en Android).

**La magia:** Tu código de Next.js sigue funcionando **exactamente igual**. Las mismas páginas, componentes, server actions, hooks y estilos. Capacitor solo proporciona la cápsula nativa.

```
┌─────────────────────────────────────────┐
│           App Store / Play Store        │
│  ┌─────────────────────────────────┐    │
│  │   Capacitor Native Bridge       │    │
│  │  ┌───────────────────────────┐  │    │
│  │  │    WKWebView / WebView    │  │    │
│  │  │  ┌─────────────────────┐  │  │    │
│  │  │  │   Tu Next.js App    │  │  │    │
│  │  │  │  (igual que hoy)    │  │  │    │
│  │  │  └─────────────────────┘  │  │    │
│  │  └───────────────────────────┘  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## 2. ¿Por qué Capacitor y no React Native / Flutter?

| Criterio | Capacitor | React Native | Flutter |
|----------|-----------|--------------|---------|
| **Reutilización de código** | ✅ 95% (todo tu Next.js) | ⚠️ ~60% (rewrites necesarios) | ❌ 0% (rewrite total) |
| **Tiempo para lanzar** | ✅ Semanas | ⚠️ Meses | ❌ Meses |
| **Costo de migración** | ✅ Bajo | ⚠️ Alto | ❌ Muy alto |
| **Performance UI** | ⚠️ Buena (WebView) | ✅ Muy buena | ✅ Excelente |
| **Acceso nativo** | ✅ Plugins maduros | ✅ Extenso | ✅ Extenso |
| **White label dinámico** | ✅ 100% runtime | ⚠️ Parcial | ⚠️ Parcial |
| **Equipo actual** | ✅ Conocen web | ❌ Necesitan mobile devs | ❌ Necesitan Dart |

**Veredicto para EVA:** Capacitor es la opción óptima porque:
1. Tu equipo ya domina Next.js / React / TypeScript.
2. El white label depende de branding dinámico cargado desde Supabase. En Capacitor, esto funciona **igual que en la PWA**.
3. No necesitas reescribir ni un solo componente.
4. Puedes iterar rápido: actualizas el servidor → la app nativa se actualiza sola (sin resubir a stores).

---

## 3. Flujo de Build (simplificado)

```bash
# 1. Exportar Next.js a estático
next export

# 2. Sincronizar con Capacitor
npx cap sync

# 3. Abrir Xcode / Android Studio
npx cap open ios
npx cap open android

# 4. Firmar y subir a stores (manual o vía CI/CD)
```

**Nota:** `next export` requiere que todas las rutas sean estáticamente generables. Server Actions siguen funcionando porque Capacitor hace fetch al servidor igual que un navegador.

---

## 4. White Label en Contexto Nativo

### Modelo: "EVA Fitness" en stores (como TrueCoach)

Esta es la estrategia recomendada para EVA en este momento:

- **Una sola app** en App Store y Google Play: "EVA Fitness" (o "EVA para Coaches")
- **Branding interno 100% dinámico:** Cada alumno, al loguearse con su coach, ve la marca de ese coach (logo, colores, nombre) exactamente como funciona hoy en la PWA.
- **Lo único "fijo" en el binario:**
  - Nombre de la app en el teléfono: "EVA"
  - Ícono de la app en la pantalla de inicio: logo de EVA
  - Splash screen nativo: branding EVA

### ¿Por qué no una app por coach (como Trainerize)?

| Aspecto | Una app EVA | App por coach |
|---------|-------------|---------------|
| **Costo Apple Dev** | $99/año (uno) | $99/año × N coaches |
| **Costo Google Play** | $25 una vez | $25 × N coaches |
| **Proceso de review** | 1 app | N apps (riesgo de spam) |
| **Mantenimiento** | 1 binario | CI/CD complejo |
| **Tiempo de setup por coach** | Inmediato | Días/semanas |
| **Percepción del alumno** | "App de mi coach" (interno) | "App de mi coach" (nativo) |

**Recomendación:** Empezar con una sola app "EVA". Cuando un coach enterprise pague por una app propia, ahí se evalúa generar un binario custom con CI/CD automatizado.

---

## 5. Qué APIs Nativas Ganas con Capacitor

| API | Uso en EVA | Prioridad |
|-----|-----------|-----------|
| **Push Notifications** | Notificaciones de rutina, check-in, mensajes del coach | 🔴 Alta |
| **Camera** | Subir foto de progreso (check-in) | 🟡 Media |
| **Biometric Auth** | Face ID / Huella para login rápido | 🟡 Media |
| **Haptics** | Vibración al completar set, timer | 🟢 Baja |
| **Deep Links** | Links de invitación que abren la app directamente | 🟡 Media |
| **Local Notifications** | Recordatorios de entrenamiento programados | 🟡 Media |
| **Splash Screen** | Control total del splash nativo | 🟢 Baja |
| **Status Bar** | Color dinámico según tema del coach | 🟢 Baja |

---

## 6. Roadmap Estimado

### Fase 0: Ahora (PWA Max) ✅
- Maximizar la experiencia PWA white-label (lo que estamos haciendo ahora)
- Validar que coaches y alumnos usan la PWA instalada

### Fase 1: Preparación (mes 1)
- Configurar `next export` y resolver dependencias de SSR
- Instalar Capacitor en rama de desarrollo
- Probar build local en iOS Simulator y Android Emulator
- Integrar plugin de Push Notifications

### Fase 2: MVP Nativo (mes 2)
- Build funcional con todas las rutas actuales
- Push notifications básicas
- Splash screen nativo con branding EVA
- Beta cerrada con 5 coaches

### Fase 3: Stores (mes 3)
- Crear cuentas de desarrollador (Apple + Google)
- Preparar assets de store (screenshots, descripciones)
- Submit a App Store y Google Play
- Iterar según feedback de review

### Fase 4: Escalar (mes 4+)
- Automatizar builds con GitHub Actions
- Agregar más plugins nativos (biometric, camera)
- Evaluar white label por coach enterprise (flavors/builds custom)

---

## 7. Costos

| Concepto | Costo | Notas |
|----------|-------|-------|
| Apple Developer Program | $99 USD/año | Obligatorio para App Store |
| Google Play Developer | $25 USD (único) | Obligatorio para Play Store |
| Servidor de builds (CI/CD) | $0-50/mes | GitHub Actions gratuito para repos públicos |
| Mac para builds iOS | $0-∞ | Necesitas macOS para firmar IPAs. Puedes usar Mac mini en la nube (~$50/mes) o GitHub Actions con runner macOS |
| Capacitor / Ionic | Gratis | Open source |
| Plugins nativos | Gratis | Comunidad open source |

**Total mínimo para lanzar:** ~$124 USD primer año.

---

## 8. Consideraciones Técnicas

### `next export` vs Server Actions
- Capacitor carga tu app como archivos estáticos locales, pero las peticiones a tu servidor (Supabase, API routes) funcionan igual.
- Las **Server Actions** siguen funcionando porque hacen POST al servidor Next.js.
- Lo que NO funciona: rutas dinámicas que dependen de `headers()` o `cookies()` sin revalidación explícita. Esto se resuelve con `generateStaticParams` o usando el modo SSR híbrido de Capacitor.

### WebView vs Navegador
- En iOS, el WebView es **WKWebView** (mismo motor que Safari). La app se ve idéntica a la PWA.
- En Android, es **WebView** basado en Chromium.
- **Ventaja:** No más limitaciones de PWA (storage ilimitado, push notifications nativas, no borrado de caché en 7 días).

### Seguridad
- Capacitor soporta **Certificate Pinning** para prevenir MITM.
- Las credenciales de Supabase se almacenan igual que en web (Secure Storage plugin opcional).

---

## 9. Conclusión

**No necesitas dejar Next.js.** Capacitor es el puente perfecto entre tu PWA actual y una app nativa en stores.

**Próximo paso concreto:** Cuando llegues a 20-30 coaches pagando, crear una rama `capacitor-poc`, instalar Capacitor, hacer `next export`, y probar en un simulador. Eso te dará la confianza de que el camino es viable sin reescribir nada.

**Hoy:** Maximizar la PWA white-label es la inversión correcta. Cada mejora que hagas ahora (loader custom, offline screen, paleta de colores) se hereda automáticamente en la app nativa de Capacitor.
