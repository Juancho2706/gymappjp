# Escalabilidad y Modelo de Negocio — EVA Fitness Platform

> **Generado:** 2026-04-16 America/Santiago
> **Propósito:** Análisis técnico de escalabilidad de la arquitectura actual + estudio de viabilidad para vender EVA como producto a negocios (gimnasios, boxes, cadenas).

---

## Índice

1. [¿Qué es escalabilidad?](#1-qué-es-escalabilidad)
2. [Estado actual de escalabilidad](#2-estado-actual-de-escalabilidad)
3. [Límites reales del stack actual](#3-límites-reales-del-stack-actual)
4. [Modelo de venta a negocios (B2B)](#4-modelo-de-venta-a-negocios-b2b)
5. [Infraestructura requerida para B2B](#5-infraestructura-requerida-para-b2b)
6. [Hoja de ruta para escalar](#6-hoja-de-ruta-para-escalar)

---

# 1. ¿Qué es escalabilidad?

Escalabilidad significa que un sistema puede manejar **más carga** (usuarios, datos, operaciones) sin degradar su rendimiento, sin rediseño completo, y idealmente sin costo lineal.

Hay tres dimensiones:

| Dimensión | Definición | Ejemplo en EVA |
|-----------|------------|----------------|
| **Escala vertical** | Más potencia en los mismos servidores | Subir el plan de Supabase |
| **Escala horizontal** | Más instancias paralelas | Múltiples réplicas de la app en Vercel |
| **Escala de producto** | Más clientes/negocios sin reescribir | Nuevos coaches o gimnasios sin tocar el código |

---

# 2. Estado actual de escalabilidad

## 2.1 Arquitectura Multi-Tenant actual

EVA es hoy una aplicación **SaaS multi-tenant compartida**: todos los coaches y sus alumnos viven en la **misma base de datos Supabase**, separados por `coach_id` y políticas RLS.

```
┌─────────────────────────────────────────┐
│           Una sola instancia            │
│                                         │
│  Vercel (Next.js)    Supabase           │
│  ┌──────────────┐    ┌───────────────┐  │
│  │  /coach/*    │    │  coaches (N)  │  │
│  │  /c/[slug]/* │───▶│  clients (M)  │  │
│  │  /api/*      │    │  workouts...  │  │
│  └──────────────┘    └───────────────┘  │
│                                         │
│  Coach A, B, C... todos comparten       │
│  la misma DB, separados por RLS         │
└─────────────────────────────────────────┘
```

**Ventajas de este modelo:**
- Zero overhead operativo: un solo proyecto Supabase, un solo deployment Vercel
- Cada coach nuevo = solo un registro en `coaches` + usuarios en `auth.users`
- El código es idéntico para todos
- Costos marginales muy bajos por coach nuevo

**Cómo escala hoy:**
- **Vercel:** Edge Network global, auto-scaling de serverless functions. No hay servidor que "caer". Con el plan Pro de Vercel, EVA puede manejar millones de requests sin configuración adicional.
- **Supabase:** PostgreSQL administrado. El plan Pro soporta 8GB DB, 500 conexiones, backup diario. Para la escala actual (decenas de coaches, cientos de alumnos) es más que suficiente.
- **Next.js RSC + React.cache():** Las queries de servidor están cacheadas por request. La arquitectura `_data/` con `Promise.all` ya está optimizada para latencia mínima.

## 2.2 ¿Cuántos usuarios soporta el stack actual?

Con el stack actual **sin cambios**:

| Métrica | Capacidad estimada | Cuello de botella |
|---------|-------------------|-------------------|
| Coaches activos | 500–2.000 | Conexiones DB Supabase |
| Alumnos totales | 10.000–50.000 | Storage de fotos (check-ins) |
| Requests/mes | Ilimitado (Vercel Edge) | Supabase queries |
| Workouts/día | ~100.000 inserts | Supabase write throughput |
| Check-ins/mes | ~20.000 | Storage bucket Supabase |

**Conclusión:** El stack actual escala perfectamente hasta **~1.000 coaches pagando con ~20.000 alumnos activos** sin cambios de infraestructura. Eso equivale a ~$20–$60M CLP/mes en MRR. Para un negocio en fase inicial, esto es más que suficiente.

## 2.3 Puntos fuertes de escalabilidad

| Área | Evaluación | Detalle |
|------|------------|---------|
| **Serverless compute** | ✅ Excelente | Vercel serverless = 0 gestión, escala automática |
| **White-label nativo** | ✅ Excelente | Cada coach tiene su PWA, slug, colores, sin código extra |
| **RLS (Row Level Security)** | ✅ Excelente | Aislamiento de datos a nivel DB sin middleware custom |
| **PWA** | ✅ Bueno | No requiere App Store, instala en cualquier dispositivo |
| **React Server Components** | ✅ Bueno | Menos carga en el cliente, mejor rendimiento en mobile |
| **Caching (React.cache)** | ✅ Bueno | Queries deduplicadas por request en el servidor |
| **Storage (Supabase)** | 🔶 Medio | Funciona bien, pero sin CDN dedicada para fotos |
| **Tests de carga** | ❌ Ausente | Sin benchmark de throughput real |
| **Conexiones DB** | 🔶 Medio | Sin PgBouncer en plan Free. Plan Pro incluye pooler |

---

# 3. Límites reales del stack actual

## 3.1 ¿Cuándo deja de escalar?

El stack actual empieza a mostrar fricción en estos escenarios:

### Escenario A: >5.000 coaches activos simultáneos
- **Cuello de botella:** Conexiones PostgreSQL. Supabase Pro tiene 500 conexiones. Con muchos coaches viendo su dashboard al mismo tiempo, se pueden agotar.
- **Solución:** Activar PgBouncer (transaction pooling) en Supabase → soporta miles de conexiones lógicas con pocas físicas. Ya disponible en Supabase Pro.

### Escenario B: >500.000 filas en workout_logs
- **Cuello de botella:** Queries de analytics (MRR, sesiones 30d, crecimiento alumnos) hacen full scans sin índices.
- **Solución:** Agregar índices compuestos en tablas críticas: `workout_logs(coach_id, logged_at)`, `check_ins(client_id, created_at)`, `daily_nutrition_logs(client_id, log_date)`.

### Escenario C: Fotos de check-in a gran escala
- **Cuello de botella:** Supabase Storage no tiene CDN global optimizada. Con miles de fotos de check-in, la latencia de carga aumenta para usuarios fuera de la región del bucket.
- **Solución:** Integrar Cloudflare Images o AWS CloudFront como CDN para el bucket de fotos.

### Escenario D: Un gym quiere datos separados por seguridad
- **Cuello de botella:** Arquitectura actual pone todos los coaches en la misma DB. Si un gym requiere aislamiento total (sus datos no pueden estar junto a otros), el modelo actual no lo satisface.
- **Solución:** Ver Sección 5.

## 3.2 Lo que NO es un problema de escala hoy

- **El código de la app:** Next.js con RSC y Vercel Edge escala horizontalmente de forma automática. No hay estado en servidor.
- **Autenticación:** Supabase Auth usa JWT stateless. No hay sesiones en memoria.
- **La lógica de negocio:** Server Actions son funciones puras, no mantienen estado.

---

# 4. Modelo de venta a negocios (B2B)

## 4.1 Definición del cliente B2B

Un cliente B2B en este contexto es una **organización** que tiene múltiples coaches y múltiples alumnos bajo la misma marca. Ejemplos:

| Tipo | Descripción | Coaches | Alumnos |
|------|-------------|---------|---------|
| **Box CrossFit** | 1 dueño, 2-5 coaches, 50-200 alumnos | 2–5 | 50–200 |
| **Gym mediano** | Cadena local, 5-15 coaches, 200-1.000 alumnos | 5–15 | 200–1.000 |
| **Cadena nacional** | Múltiples sedes, 20-100 coaches | 20–100 | 2.000–20.000 |
| **Estudio de pilates/yoga** | 2-5 instructores, 30-100 alumnos | 2–5 | 30–100 |

## 4.2 Diferencias clave B2B vs B2C (coach individual)

| Aspecto | B2C (coach individual) | B2B (negocio) |
|---------|----------------------|---------------|
| **Quién paga** | El coach directamente | El dueño del negocio |
| **Ciclo de venta** | 1 persona, decisión rápida | 1-4 semanas, múltiples decisores |
| **Precio** | $15.000–$60.000 CLP/mes | $100.000–$500.000+ CLP/mes |
| **Soporte** | Self-service | Onboarding dedicado |
| **Personalización** | Colores/logo propios | Dominio propio, facturación, reportes |
| **Contrato** | Mensual/anual autogestión | Contrato anual firmado |
| **Integración** | Ninguna necesaria | A veces integración con su software de cobros |

## 4.3 Propuesta de valor para un gym

Lo que EVA ofrece a un gym que hoy usa WhatsApp + Excel:

1. **Panel unificado por sede:** el dueño ve todas las métricas de todos los coaches y alumnos
2. **Branding del gym en la app:** los alumnos ven la marca del gym, no la de cada coach
3. **Cumplimiento y adherencia en tiempo real:** qué alumnos están fallando esta semana
4. **Historial de cada alumno:** si un alumno cambia de coach, el historial queda en el sistema
5. **Nutrición integrada:** planes nutricionales asignados por los coaches
6. **Reportes para el dueño:** MRR, retención de alumnos, coaches más activos

## 4.4 ¿Cómo venderle a un gym hoy, sin nueva infraestructura?

La arquitectura actual **ya soporta** el modelo de gym con un workaround simple:

```
Gym "FitBox Santiago" (dueño = un coach "admin")
  ├── Coach "admin" (cuenta del dueño, ve a todos los alumnos)
  ├── Coach "Pedro" (coach 1, ve solo sus alumnos)
  ├── Coach "María" (coach 2, ve solo sus alumnos)
  └── Coach "Luis" (coach 3, ve solo sus alumnos)
```

El dueño pagaría por 3-4 cuentas de coach. Los alumnos se registran bajo el slug del coach correspondiente. **Limitación:** el dueño no tiene una vista consolidada de todos los alumnos.

**Precio posible hoy:** $4 cuentas × $39.990 = ~$160.000 CLP/mes por el gym.

---

# 5. Infraestructura requerida para B2B real

Para vender a gimnasios de forma seria (no workaround), se necesitan estos cambios:

## 5.1 Feature: Panel de Organización (Gym Dashboard)

**Descripción:** Una cuenta "Owner" que puede:
- Ver todos los coaches de su organización
- Ver todos los alumnos (de todos sus coaches)
- Ver métricas consolidadas: adherencia total, churn, workouts esta semana
- Invitar/desactivar coaches desde un panel
- Ver facturación unificada (1 factura, no N)

**Implementación en BD:**
```sql
-- Nueva tabla
CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    owner_id uuid REFERENCES auth.users(id),
    logo_url text,
    primary_color text DEFAULT '#007AFF',
    subscription_status text DEFAULT 'active',
    subscription_tier text DEFAULT 'gym',
    max_coaches integer DEFAULT 10,
    created_at timestamptz DEFAULT now()
);

-- Relación coach → organización
ALTER TABLE coaches ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE coaches ADD COLUMN role_in_org text DEFAULT 'coach'; -- 'owner' | 'coach' | 'admin'
```

**Esfuerzo estimado:** 4-6 días de desarrollo.

## 5.2 Feature: Dominio Personalizado por Organización

Hoy cada coach tiene `/c/coach-slug/`. Un gym querría `app.fitboxsantiago.cl`.

**Implementación:**
- Usar Vercel's [Custom Domains API](https://vercel.com/docs/domains) para agregar dominios programáticamente
- Agregar campo `custom_domain` en `organizations`
- El middleware detecta el hostname y resuelve el `organization_id` (o `coach_id`) desde ahí

**Esfuerzo estimado:** 3-4 días.

## 5.3 Feature: Roles dentro de una organización

| Rol | Permisos |
|-----|----------|
| `owner` | Ve todo, configura el gym, paga, invita coaches |
| `admin` | Ve todo, pero no puede pagar ni eliminar coaches |
| `coach` | Solo ve sus propios alumnos (comportamiento actual) |
| `nutritionist` | Solo accede a módulo de nutrición de sus alumnos |

**Esfuerzo estimado:** 2-3 días para los 2 roles principales.

## 5.4 Feature: Facturación unificada

En vez de N suscripciones MercadoPago separadas, el gym paga una sola.

**Nuevo tier "Gym":**

| Tier | Coaches | Alumnos | Precio CLP/mes |
|------|---------|---------|----------------|
| Gym Starter | 1–5 | 250 | 99.990 |
| Gym Pro | 6–15 | 750 | 199.990 |
| Gym Enterprise | 16–50 | Ilimitado | Negociar |

**Esfuerzo estimado:** 2-3 días + configuración MP.

## 5.5 Feature: Aislamiento de datos (Enterprise)

Para clientes grandes que lo exijan, se puede ofrecer un **Supabase project dedicado** por organización.

**Arquitectura:**
```
Organización A (gym mediano)  →  Proyecto Supabase compartido
Organización B (cadena grande) →  Proyecto Supabase DEDICADO
                                   (schema idéntico, datos aislados)
```

**Implementación:** La app necesita saber qué URL de Supabase usar según la organización. Esto requiere un "meta-registry" (tabla en el proyecto principal que mapea `organization_id → supabase_url + anon_key`).

**Esfuerzo estimado:** 5-8 días. Solo necesario para clientes >1.000 alumnos o con requisitos de compliance estrictos.

## 5.6 Feature: Reportes exportables

Los dueños de gym necesitan reportes para sus reuniones de management:
- Adherencia semanal/mensual por coach
- Retención de alumnos (churn rate)
- Top ejercicios por popularidad
- Export CSV / PDF de estos datos

**Esfuerzo estimado:** 3-4 días.

---

# 6. Hoja de ruta para escalar

## Fase 0 — Hoy (ya funcional para B2B básico)
El modelo actual puede venderle a gyms pequeños como workaround (múltiples cuentas coach bajo el mismo dueño). No ideal, pero funciona y genera revenue inmediato.

## Fase 1 — B2B básico (3-4 semanas de desarrollo)

| Tarea | Esfuerzo | Impacto |
|-------|----------|---------|
| Tabla `organizations` + relación a coaches | 1d | Base de todo |
| Panel owner: ver todos sus coaches | 2d | Core feature |
| Panel owner: ver métricas consolidadas | 2d | Diferenciador |
| Tier "Gym" en facturación | 1d | Revenue |
| Onboarding para gym (invitar coaches) | 1d | Adopción |
| **Total** | **~7 días** | |

Con esto, EVA puede venderse activamente a boxes y estudios.

## Fase 2 — B2B completo (4-6 semanas adicionales)

| Tarea | Esfuerzo | Impacto |
|-------|----------|---------|
| Dominio personalizado por gym | 3d | Premium feel |
| Roles (owner/admin/coach) | 3d | Seguridad interna |
| Reportes exportables (CSV/PDF) | 4d | Retención clientes corporativos |
| Integración webhooks para ERP del gym | 3d | Enterprise enablement |
| **Total** | **~13 días** | |

## Fase 3 — Enterprise (solo si el mercado lo pide)

| Tarea | Esfuerzo | Impacto |
|-------|----------|---------|
| Supabase project dedicado por org | 5d | Compliance/seguridad |
| SSO (Single Sign-On) con Google Workspace | 3d | Gyms corporativos |
| Multi-sede (una org, múltiples locations) | 4d | Cadenas nacionales |
| API pública para integraciones | 5d | Ecosystem |

---

## Resumen Ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| **¿Es escalable la app hoy?** | **Sí.** Para 500–2.000 coaches individuales, el stack actual no necesita cambios. |
| **¿Puede venderle a un gym hoy?** | **Sí, con workaround.** Múltiples cuentas coach bajo el mismo negocio. Precio ~$100.000–$200.000 CLP/mes. |
| **¿Qué se necesita para B2B real?** | **~7 días de desarrollo** para la Fase 1: tabla `organizations`, panel owner, tier Gym. |
| **¿Necesita nueva infraestructura?** | **No.** Vercel + Supabase soportan el modelo B2B dentro del stack actual. Solo nuevas tablas y UI. |
| **¿Cuándo sería necesario cambiar infraestructura?** | Solo si un gym tiene >5.000 alumnos y exige aislamiento de datos por compliance. En ese caso, Supabase project dedicado. |
| **¿Cuál es el precio ideal para un gym?** | $99.990–$199.990 CLP/mes para un gym de 5–15 coaches. Margen alto versus el costo de infraestructura adicional (casi cero). |

---

*Documento de estudio — generado para análisis estratégico. No compromete ningún roadmap.*
