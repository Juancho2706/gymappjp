# EVA Fitness Platform — Guía de Producto

> Documento de alto nivel para equipos, agentes de IA y stakeholders.  
> Resume qué hace la app, a quién va dirigida y cómo se ve/siente.

---

## 1. ¿Qué hace esta app?

EVA es una plataforma **SaaS white-label B2B2C** para coaches de fitness, personal trainers y dueños de gimnasios. Permite a cada coach operar su propia app móvil (PWA) con su marca, colores y logo, sin escribir código.

### Core loop completo

1. **Crear** — El coach diseña programas de entrenamiento con un constructor visual drag-and-drop (bloques, series, descansos, variantes A/B).
2. **Asignar** — Asigna programas y planes de nutrición a cada alumno desde un directorio centralizado.
3. **Ejecutar** — El alumno abre la app en su teléfono, ve su rutina del día, registra series con pesos/reps/RIR y recibe feedback visual en tiempo real.
4. **Seguir** — El coach monitorea adherencia, progresos, PRs, peso corporal, fotos de check-in y actividad reciente desde un dashboard analytics.

### Módulos principales

| Módulo | Descripción |
|--------|-------------|
| **Entrenamiento** | Constructor de planes, biblioteca de programas, ejecución con timer, PRs automáticos, variante A/B por semana. |
| **Nutrición** | Planes nutricionales por objetivo, biblioteca de alimentos (incluye marcas chilenas), log diario de macros, adherencia 30 días. |
| **Check-in** | Wizard de fotos front/lateral con compresión, seguimiento de peso, medidas corporales (en roadmap). |
| **Directorio de alumnos** | War Room con attention score, tabla virtualizable, perfil completo (6 tabs: overview, análisis, nutrición, progreso, plan, facturación). |
| **Mi Marca** — White-label | Logo, color primario, tipografía, loader customizable, favicon dinámico, pantalla offline brandada, QR de instalación. |
| **Pagos** — Suscripciones | 4 tiers (Starter/Pro/Elite/Scale) en CLP vía MercadoPago; upgrade mid-cycle, grace period, reactivación. |
| **Panel CEO** — Admin | Dashboard plataforma, finanzas (MRR/ARR/churn), auditoría de acciones, gestión masiva de coaches. |

---

## 2. ¿A quién va dirigido?

### Persona primaria: el Coach (pagador)

- **Quién es:** Personal trainer independiente, coach online o dueño de box/CrossFit en Chile y LATAM. Típicamente maneja 10–50 alumnos.
- **Su dolor hoy:** WhatsApp + hojas de cálculo dispersas. No tiene forma profesional de mostrar resultados ni su "propia app".
- **Qué busca:** Profesionalización, marca propia y escalabilidad sin complejidad técnica.
- **Ventaja EVA:** En minutos tiene una PWA instalable con su logo y colores que sus alumnos usan como si fuera una app nativa.

### Persona secundaria: el Alumno (usuario final)

- **Quién es:** Cliente del coach. No paga EVA directamente; accede por relación con su entrenador.
- **Su dolor hoy:** No sabe qué entrenar ni cómo registrar su progreso. Poco feedback visual.
- **Qué busca:** Claridad, guía paso a paso y motivación inmediata (confetti en PRs, rachas, gráficos).

### Segmento B2B futuro: Gimnasios y franquicias

- Boxes con múltiples coaches que necesitan una cuenta owner + sub-coaches + métricas consolidadas.
- Contacto directo: `contacto@eva-app.cl`.

---

## 3. Estilo y Branding

### Identidad en una frase

EVA es software **premium, técnico y limpio** para escalar un negocio de coaching. Sensación de **control, datos y profesionalidad** — no "gym bro" gritón; más **arquitecto / científico / SaaS de alto nivel**.

### Paleta de color

#### Interfaz por defecto (sin branding del coach)

| Rol | Hex | Uso |
|-----|-----|-----|
| **Primary** | `#007AFF` | Botones principales, links, focos, brillos suaves (azul iOS / eléctrico). |
| **Cian acento** | `#00E5FF` | Detalles secundarios, gráficos, partículas de luz, degradados. |
| **Violeta** | `#5856D6` | Degradados de titular junto al azul. |
| **Éxito / marca EVA** | `#10B981` | Verde EVA: landing pública, éxito, marca propia de la plataforma. |
| **Rojo error** | `#FF3B30` | Alertas puntuales. |

#### Superficies (modo claro)

| Rol | Hex |
|-----|-----|
| Fondo página | `#F5F5F5` |
| Tarjetas | `#FFFFFF` |
| Texto principal | `#121212` |
| Texto secundario | `#6B7280` |

#### Modo oscuro (alternativa premium)

| Rol | Hex |
|-----|-----|
| Fondo | `#121212` |
| Tarjetas | `#1E1E1E` |
| Texto principal | `#F8F9FA` |
| Texto secundario | `#A1A1AA` |

### Tipografía

- **UI y cuerpo:** Sans geométrica limpia (equivalente visual: **Inter**).
- **Titulares / marca "EVA":** Sans condensada y fuerte (equivalente: **Montserrat** Black / ExtraBold, tracking ajustado).
- **Palabra "EVA":** Siempre en mayúsculas, sans bold, moderna, sin serif.

### Lenguaje visual del UI

- **Esquinas:** Redondeo generoso (~12px base; botones hero a menudo **pill / rounded-full**).
- **CTAs:** Forma **píldora**, fondo azul `#007AFF`, texto blanco, sombra suave tipo **glow azul** (no neón agresivo).
- **Navegación:** Barra **flotante tipo cápsula** ("pill nav") con **glassmorphism** (fondo semitransparente + blur).
- **Tarjetas:** Blanco sobre gris claro, borde fino; en oscuro: gris muy oscuro elevado.
- **Textura opcional:** Grid cuadriculado muy sutil (cuaderno de ingeniero) y/o ruido film muy leve.
- **Hero / fondos:** Orbs / blobs difuminados (azul primario muy suave + gris o cielo), sensación **tech / espacial suave**; evoca shader abstracto con luz suave.

### Qué evitamos

- Skeuomorfismo pesado.
- Colores ácidos saturados sin control.
- Tipografía script, gótica o "gym motivacional".
- Startup infantil con mascota.
- Banco suizo frío e inaccesible.

---

## 4. Flujos clave en una línea

| Flujo | Ruta clave | Qué sucede |
|-------|-----------|------------|
| Coach crea programa | `/coach/builder/[clientId]` | DnD de ejercicios, configura bloques, guarda y asigna. |
| Alumno entrena | `/c/[slug]/workout/[planId]` | Ve plan del día, loguea sets, recibe PRs y confetti al terminar. |
| Coach personaliza marca | `/coach/settings/brand` | Sube logo, elige color, texto de loader, preview en vivo claro/oscuro. |
| Suscripción y pagos | `/coach/subscription` | Elige tier, paga con MercadoPago, webhook activa acceso automáticamente. |
| Admin plataforma | `/admin/dashboard` | Panel CEO con MRR, churn, coaches activos, auditoría y acciones masivas. |

---

## 5. Metadatos del producto

| Campo | Valor |
|-------|-------|
| **Nombre aplicación** | EVA Fitness Platform |
| **Tagline (ES)** | Escala tu negocio de personal training y coaching; rutinas, nutrición, alumnos, app propia. |
| **Mercado** | Fitness B2B, SaaS, white-label para coaches |
| **Región focal** | Chile / LATAM |
| **Moneda** | CLP (peso chileno) |
| **Email plataforma** | `contacto@eva-app.cl` |
| **Repositorio** | `https://github.com/Juancho2706/gymappjp.git` |

---

*Última actualización: 2026-04-27. Mantener alineado con `AGENTS.md`, `docs/BRANDING-IMAGENES-IA.md` y `nuevabibliadelaapp/`.*
