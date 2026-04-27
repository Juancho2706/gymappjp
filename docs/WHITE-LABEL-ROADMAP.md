# White Label — Roadmap de Mejoras Futuras

> Documento de visión y backlog para llevar "Mi Marca" al mejor white-label del mercado fitness.
> Ordenado por impacto/esfuerzo. Las secciones Quick Wins son las más rentables para implementar primero.

---

## SPRINT 1 — Quick Wins (< 1 semana)

### 1.1 Color secundario / acento
**Qué:** Agregar un segundo color de marca (`brand_secondary_color`). Se usa en badges, etiquetas nutricionales, gráficos de check-in.  
**Por qué:** Los coaches con identidad visual completa tienen primario + secundario. Hoy todo es monocolor.  
**Cómo:**
- Agregar columna `brand_secondary_color TEXT` en `coaches`
- Agregar a `generateBrandPalette` un segundo conjunto de variables CSS
- Exponer en BrandSettingsForm como segundo color picker (opcional)

### 1.2 Botón "Restablecer ajustes de marca"
**Qué:** Reset completo a valores de fábrica (color `#007AFF`, sin logo, nombre por defecto).  
**Por qué:** Coaches que quieren "empezar de cero" no tienen forma de hacerlo.  
**Cómo:** Server action `resetBrandSettingsAction` + modal de confirmación.

### 1.3 Fuente tipográfica personalizable
**Qué:** Selector de Google Fonts (filtrado a 15-20 fuentes sans-serif legibles).  
**Por qué:** La tipografía es parte de la identidad de marca tanto como el color.  
**Cómo:**
- Columna `brand_font_family TEXT` en `coaches`
- Variable CSS `--brand-font` inyectada en layouts
- En BrandSettingsForm: dropdown con preview de cada fuente
- Cargar fuente con `next/font/google` dinámicamente o `@import` en `<style>` tag

### 1.4 Validación de dimensiones de logo al subir
**Qué:** Si el logo es menor a 128×128 px, mostrar aviso (no bloquear).  
**Por qué:** Logos de baja resolución se ven pixelados en la PWA.  
**Cómo:** `createImageBitmap(file)` en cliente antes de subir → verificar width/height.

---

## SPRINT 2 — Diferenciadores (1-3 semanas)

### 2.1 Landing page pública del coach
**Qué:** La ruta `/c/[slug]` (antes del login) muestra una landing page con:
- Logo del coach
- Nombre de marca y tagline configurable
- Botones: "Soy alumno → login" / "Quiero unirme → formulario de contacto"
- Color y fuente de marca aplicados

**Por qué:** Hoy `/c/[slug]` redirige directo al login. Los coaches no tienen una "vitrina" para nuevos alumnos. Una landing aumenta conversión y percepción de profesionalismo.  
**Cómo:**
- Agregar campo `brand_tagline TEXT` (máx 120 chars) en `coaches`
- Agregar campo `brand_show_landing BOOLEAN DEFAULT false`
- Página `src/app/c/[coach_slug]/page.tsx` (actualmente no existe o redirige)
- Completamente brandada con CSS vars del coach

### 2.2 Subdomain automático
**Qué:** Cada coach obtiene `[slug].eva-app.cl` además de `/c/[slug]`.  
**Por qué:** `tucoach.eva-app.cl` se percibe más profesional que `eva-app.cl/c/tucoach`. No requiere configuración DNS del coach.  
**Cómo:**
- Wildcard subdomain en DNS: `*.eva-app.cl → Vercel`
- Vercel: agregar `*.eva-app.cl` como custom domain
- Middleware: detectar subdomain, resolver `slug = subdomain`, continuar flujo existente

### 2.3 Compartir resultados brandados (Social Share)
**Qué:** El alumno puede generar una imagen para compartir en redes con:
- Logo del coach
- Color de marca como fondo
- Resultado destacado (PR, peso, cumplimiento mensual)
- "Entrenado por [BrandName]"

**Por qué:** Marketing viral orgánico. Cada alumno que comparte un PR es publicidad para el coach.  
**Cómo:**
- API Route `GET /api/og/[slug]/share?type=pr&value=...` usando `@vercel/og`
- Parámetros: tipo de logro, valor, nombre del alumno
- Botón "Compartir" en pantalla de PRs y peso del alumno

### 2.4 Notificaciones push brandadas
**Qué:** Las notificaciones push llegan con el nombre del coach, no "EVA".  
**Por qué:** "Juan, tu entrenamiento está listo — FitPro Academy" vs "Notificación de EVA". Impacto directo en tasa de apertura.  
**Cómo:**
- Web Push API: usar `applicationServerKey` por coach o a nivel app con payload personalizado
- El `title` de la notificación = `coach.brand_name`
- El `icon` = `coach.logo_url` o fallback a ícono generado
- Agregar campo `push_vapid_key` si se quiere por coach (avanzado)

---

## SPRINT 3 — Alto Impacto Estratégico (1-2 meses)

### 3.1 Custom domain propio del coach
**Qué:** El coach puede poner `app.micoach.com` y los alumnos acceden ahí.  
**Por qué:** El mayor diferenciador de white-label. Elimina toda referencia a EVA.  
**Cómo:**
1. Coach ingresa su dominio en "Mi Marca" → guardado en `coaches.custom_domain`
2. Panel muestra instrucciones: `CNAME app → proxy.eva-app.cl`
3. EVA verifica el DNS (`dns.resolve(domain, 'CNAME')`)
4. Vercel Domains API: `POST /v9/projects/{id}/domains` con el dominio verificado
5. Certificado SSL automático por Vercel
6. Middleware reconoce el dominio y lo mapea al slug correspondiente

**Complejidad:** Alta. Requiere integración con Vercel API y flujo de verificación DNS.

### 3.2 Email transaccional brandado
**Qué:** Todos los emails que EVA envía a alumnos de un coach usan su logo y color.  
**Por qué:** Coherencia de marca total. El alumno nunca ve "EVA" si el coach no quiere.  
**Cómo:**
- Plantillas de email dinámicas en Resend/Postmark con variables de marca
- Variables: `{{logo_url}}`, `{{brand_color}}`, `{{brand_name}}`, `{{coach_tagline}}`
- Tipos de email a brandear: bienvenida, confirmación de workout, resumen semanal, recordatorio de check-in

### 3.3 Brand Kit descargable
**Qué:** El coach puede descargar un "Kit de Marca" generado automáticamente:
- PDF con paleta de colores + códigos hex/RGB
- Logo en variantes (original, negativo, monocromo)
- Guía de uso básica
- QR code en alta resolución

**Por qué:** Los coaches usan su marca fuera de EVA (flyers, Instagram, ropa). Este kit les da coherencia.  
**Cómo:**
- Generar PDF server-side con `@react-pdf/renderer` o `puppeteer`
- API Route `GET /api/brand-kit/[slug]` → devuelve ZIP o PDF
- Botón en "Compartir con alumnos"

### 3.4 App nativa iOS/Android white-label (via Capacitor)
**Qué:** El coach puede tener su propia app en App Store y Google Play con su nombre e ícono.  
**Por qué:** "Descarga mi app en el App Store" es el mayor marcador de profesionalismo. Es el Santo Grial del white-label fitness.  
**Cómo (ver `docs/CAPACITOR-WHITELABEL-ROADMAP.md`):**
- Capacitor wrapping de la PWA (ya existe infraestructura)
- Build pipeline parametrizado: `COACH_SLUG`, `BRAND_NAME`, `BRAND_COLOR`, `LOGO_URL`
- 2 modelos de distribución:
  - **Enterprise**: una cuenta Apple/Google Enterprise, distribución directa (sin App Store)
  - **White-label**: cada coach con su propia cuenta de desarrollador (más complejo, más premium)

---

## SPRINT 4 — Visión Largo Plazo

### 4.1 Dashboard de analytics de marca
**Métricas a mostrar al coach:**
- Alumnos activos en su app (últimos 7/30 días)
- % de alumnos que instalaron la PWA
- Clicks en link compartido (UTM tracking)
- Tasa de apertura del welcome modal
- Alumnos que compartieron resultados en redes

### 4.2 Modo "Incógnito EVA"
**Qué:** Toggle para ocultar completamente cualquier referencia a EVA en la app del alumno.  
**Por qué:** Algunos coaches no quieren que sus alumnos sepan que usan un SaaS.  
**Cómo:** `coaches.hide_eva_branding BOOLEAN` → condiciona textos, footers, metadatos, service worker name.

### 4.3 Temas de color pre-diseñados (Brand Templates)
**Qué:** Galería de 20+ temas completos (color primario + secundario + fuente + estilo de bordes).  
**Ejemplo:** "Minimalista Blanco", "Dark Gym", "Pastel Wellness", "Bold Orange", "Corporate Blue"  
**Por qué:** Coaches sin identidad visual pueden elegir un look profesional en 1 clic.

### 4.4 Personalización avanzada de navegación
**Qué:** El coach puede reordenar las secciones del menú del alumno y renombrar ítems.  
**Ejemplo:** Renombrar "Ejercicios" → "Biblioteca" o "Check-in" → "Seguimiento".  
**Almacenamiento:** JSON en `coaches.nav_config JSONB`.

---

## TABLA DE PRIORIDAD

| Feature | Impacto | Esfuerzo | ROI |
|---------|---------|----------|-----|
| Fuente personalizada | Medio | Bajo | ★★★★☆ |
| Landing page pública | Alto | Medio | ★★★★★ |
| Subdomain automático | Alto | Medio | ★★★★★ |
| Social share brandado | Alto | Medio | ★★★★☆ |
| Custom domain | Muy alto | Alto | ★★★★☆ |
| Email brandado | Medio | Medio | ★★★☆☆ |
| Brand Kit PDF | Medio | Bajo | ★★★★☆ |
| Push notifications | Medio | Bajo | ★★★★☆ |
| App nativa | Muy alto | Muy alto | ★★★☆☆ |
| Analytics de marca | Medio | Alto | ★★★☆☆ |
| Modo incógnito EVA | Alto | Bajo | ★★★★★ |

---

## NOTAS DE IMPLEMENTACIÓN

### Patrón para nuevos campos de marca
Cada nuevo campo sigue este flujo:
1. Migración SQL: `ALTER TABLE coaches ADD COLUMN ...`
2. Actualizar `database.types.ts` (o regenerar con `supabase gen types`)
3. Agregar al Zod schema en `actions.ts`
4. Agregar a `get-coach.ts` select si se necesita en layouts
5. Agregar a `generateBrandPalette` o nuevo util si afecta CSS vars
6. Inyectar en layout via `<style>` tag o `middleware.ts` headers
7. Exponer en `BrandSettingsForm.tsx`
8. Actualizar `BrandThemePreview.tsx` y `StudentDashboardPreview.tsx`

### Dependencias recomendadas a evaluar
- `@vercel/og` — imágenes OG dinámicas para social share
- `@react-pdf/renderer` — brand kit PDF
- `color` o `chroma-js` — si se necesitan transformaciones de color más sofisticadas
- `@capacitor/core` — app nativa (ya documentado en CAPACITOR-WHITELABEL-ROADMAP.md)
