# EVA Fitness Platform

**SaaS white-label B2B2C para coaches fitness, personal trainers y gimnasios.**

Cada coach opera su propia app móvil (PWA) con su marca, colores y logo — sin escribir código. Sus alumnos la instalan como app nativa. El coach gestiona programas, nutrición y seguimiento desde un dashboard analytics.

> **Web:** [eva-app.cl](https://eva-app.cl) · **Empresas:** [enterprise.eva-app.cl](https://enterprise.eva-app.cl) · **Contacto:** `contacto@eva-app.cl`

---

## Core loop

1. **Crear** — El coach diseña programas de entrenamiento con constructor visual drag-and-drop (bloques, series, descansos, variantes A/B).
2. **Asignar** — Asigna programas y planes de nutrición a cada alumno desde directorio centralizado.
3. **Ejecutar** — El alumno abre la app en su teléfono, ve la rutina del día, registra series con pesos/reps/RIR y recibe feedback visual en tiempo real.
4. **Seguir** — El coach monitorea adherencia, PRs, peso corporal, fotos de check-in y actividad reciente.

---

## Módulos

| Módulo | Qué hace |
|--------|----------|
| **Entrenamiento** | Constructor de planes, biblioteca de 230+ ejercicios animados, ejecución con timer, PRs automáticos, variante A/B por semana |
| **Nutrición** | Planes por objetivo, biblioteca de alimentos (incluye marcas chilenas), log diario de macros, adherencia 30 días |
| **Check-in** | Wizard de fotos front/lateral, seguimiento de peso, gráficos de progreso |
| **Directorio de alumnos** | War Room con attention score, perfil completo (overview, analítica, nutrición, progreso, plan, facturación) |
| **Mi Marca (white-label)** | Logo, color primario, tipografía, loader customizable, favicon dinámico, QR de instalación |
| **Pagos / Suscripciones** | 4 tiers (Starter / Pro / Elite / Scale) en CLP vía MercadoPago — upgrade mid-cycle, grace period |
| **Empresas** | Capa enterprise para gyms/academias con múltiples coaches, pool de clientes compartido, panel admin de org |

---

## ¿Para quién?

### Coach (pagador)
Personal trainer independiente, coach online o dueño de box/CrossFit en Chile y LATAM. Típicamente 10–50 alumnos. Cansado de WhatsApp + planillas de cálculo. Quiere profesionalización, marca propia y escalabilidad sin complejidad técnica.

### Alumno (usuario final)
Cliente del coach. No paga EVA directamente; accede por relación con su entrenador. Quiere claridad, guía paso a paso y motivación inmediata (confetti en PRs, rachas, gráficos).

### Gimnasios y franquicias (enterprise)
Boxes con múltiples coaches que necesitan cuenta owner + sub-coaches + métricas consolidadas. Tier separado con billing manual y panel admin propio en `/org/[slug]`.

---

## Identidad visual

**EVA** es software premium, técnico y limpio. Sensación de control, datos y profesionalidad — arquitecto / científico / SaaS de alto nivel. No "gym bro".

### Colores

| Rol | Hex | Uso |
|-----|-----|-----|
| Primary | `#007AFF` | Botones, links, focos — azul iOS eléctrico |
| Cian acento | `#00E5FF` | Gráficos, partículas, degradados |
| Violeta | `#5856D6` | Degradados de titular junto al azul |
| Marca EVA | `#10B981` | Landing pública, éxito, marca propia |
| Rojo error | `#FF3B30` | Alertas puntuales |

### Tipografía

- **UI:** Sans geométrica limpia (Inter)
- **Titulares / "EVA":** Sans condensada bold (Montserrat ExtraBold)
- **"EVA":** Siempre mayúsculas, sans bold, moderna, sin serif

### Lenguaje visual

CTAs en píldora con glow azul suave. Barra de navegación flotante con glassmorphism. Tarjetas blancas sobre gris claro (light) o gris muy oscuro elevado (dark). Hero con orbs/blobs difuminados — sensación tech / espacial suave.

---

## Flujos clave

| Flujo | Ruta |
|-------|------|
| Coach crea programa | `/coach/builder/[clientId]` |
| Alumno entrena | `/c/[slug]/workout/[planId]` |
| Coach personaliza marca | `/coach/settings/brand` |
| Coach gestiona suscripción | `/coach/subscription` |
| Admin de gym / academia | `/org/[slug]` |
| Panel CEO interno | `/admin/dashboard` |

---

## Datos del producto

| Campo | Valor |
|-------|-------|
| Tagline | Escala tu negocio de personal training: rutinas, nutrición, alumnos, app propia |
| Mercado | Fitness B2B, SaaS white-label |
| Región focal | Chile / LATAM |
| Moneda | CLP (peso chileno) |
| Email plataforma | `contacto@eva-app.cl` |
| Privacidad / ARCO | `privacidad@eva-app.cl` |

---

## Licencia

MIT
