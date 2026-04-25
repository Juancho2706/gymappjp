# 04 — Negocio y Estrategia de EVA Fitness Platform

> **Actualizado:** 2026-04-24 America/Santiago (Sesión 9)
> **Fuentes:** PLANIFICACION-EMPRESA.md, ESCALABILIDAD-Y-MODELO-NEGOCIO.md, EVALUACION-PAGOS-CHILE.md (resumen)

---

## Glosario Rápido

| Término | Definición |
|--------|------------|
| **EVA** | SaaS white-label para coaches: programas, nutrición, progreso y app alumno con marca del coach |
| **MRR** | Ingreso recurrente mensual normalizado |
| **ARPA** | MRR ÷ cuentas coach de pago activas |
| **B2B2C** | EVA cobra al coach; el alumno usa la app por relación con el coach |
| **Grace period** | Tras cancelar, el coach conserva acceso hasta `current_period_end` |
| **Upgrade mid-cycle** | Cambio de plan con inicio del nuevo cobro al término del ciclo actual |
| **PWA** | App instalable por alumno (`/c/[coach_slug]` + manifest dinámico) |
| **White-label** | Cada coach tiene su espacio `/c/[coach_slug]` con logo, colores y mensaje propio |

---

## Problema y Propuesta de Valor

**Problema del coach independiente en Chile/LATAM:**
- Gestiona alumnos por WhatsApp + hojas de cálculo dispersas
- No puede mostrar resultados de forma profesional
- No tiene su propia "app" ni marca reconocible
- Los competidores anglosajones (Trainerize, TrueCoach) cobran en USD, no entienden el mercado LATAM

**Propuesta de valor de EVA:**
1. **White-label real:** cada coach expone su espacio con su logo, colores y mensaje de bienvenida
2. **Core loop completo:** constructor de planes → asignación → ejecución alumno → seguimiento coach
3. **Nutrición integrada** en tiers superiores
4. **Stack moderno en CLP:** Next.js 16, Supabase, Vercel, MercadoPago

**Ventaja competitiva:**
- White-label real (PWA instalable con marca del coach)
- Mercado Chile/LATAM desatendido
- Precios en CLP
- Datos y soporte en español

---

## Personas

| Persona | Descripción | Dolor | Busca |
|---------|-------------|-------|-------|
| **Coach (pagador)** | PT independiente o dueño de box; 10–50 alumnos típicos | WhatsApp + hojas dispersas | Profesionalización, marca propia |
| **Alumno (usuario final)** | No paga EVA directamente | No sabe qué entrenar ni cómo registrar | Claridad + feedback visual en móvil |
| **Fundador/ops** | Necesita visibilidad de MRR, churn | Panel CEO aún en 0% | SQL o ruta interna hasta que exista el panel |

---

## Tiers de Suscripción (CLP)

Fuente de verdad: `src/lib/constants.ts` y `src/app/pricing/page.tsx`

### Tabla maestra de tiers

Fuente de verdad en código: [`TIER_CONFIG`](src/lib/constants.ts), [`TIER_ALLOWED_BILLING_CYCLES`](src/lib/constants.ts), [`getTierPriceClp`](src/lib/constants.ts). El tier legacy **`starter_lite` fue retirado** (migración `20260421130100_coaches_retire_starter_lite_tier.sql`); el producto expone **4 tiers**.

| Tier | Etiqueta | Alumnos máx. (código) | Precio mensual CLP | Ciclos permitidos | Nutrición |
|------|----------|------------------------|-------------------|-------------------|-----------|
| `starter` | Starter | 10 | **$19.990** | Solo mensual | No |
| `pro` | Pro | 30 | **$29.990** | Solo mensual | Sí |
| `elite` | Elite | 60 | **$44.990** | Mensual, trimestral, anual | Sí |
| `scale` | Scale | 100 | **$64.990** | Mensual, trimestral, anual | Sí |

### Precios por ciclo (calculados con descuentos del código)

`getTierPriceClp`: trimestral = 3× mensual con −10%; anual = 12× mensual con −20% (redondeo `Math.round`).

| Tier | Mensual | Trimestral (−10%) | Anual (−20%) |
|------|---------|-------------------|--------------|
| starter | $19.990 | N/A | N/A |
| pro | $29.990 | N/A | N/A |
| elite | $44.990 | **$121.473** | **$431.904** |
| scale | $64.990 | **$175.473** | **$623.904** |

### Mensajes por segmento

- **Coach con pocos alumnos y sin nutrición:** Starter — mensual simple, tope 10 alumnos
- **Coach con nutrición o intención de escalar:** Pro — “sweet spot” en pricing (nutrición + hasta 30 alumnos)
- **Box mediano / muchos alumnos:** Elite o Scale — prepago trimestral/anual mejora cashflow
- **Gimnasio / franquicia:** Empresarial `contacto@eva-app.cl` — multi-coach, reporting, posible dominio propio

---

## Economía del Negocio

### Escenarios de MRR ilustrativos

**Escenario conservador (mes 3):** 4 coaches: 3×Starter, 1×Pro  
MRR ≈ 3×$19.990 + $29.990 = **$89.960 CLP/mes** (ilustrativo; usar mix real de tiers)

**Escenario base (mes 6):** 12 coaches con mezcla de tiers
MRR aproximado ≈ **~$280.000 CLP/mes**

**Escenario agresivo (mes 12):** 35 coaches con mezcla equilibrada
ARPA sube por nutrición y tiers altos → MRR potencial ~$1M+ CLP/mes

### Unit economics (esqueleto)

- **CAC objetivo:** < $50.000 CLP (MAPA Fase 3)
- **LTV ejemplo:** ARPA $25.000 × 14 meses = ~$350.000 CLP
- **LTV/CAC objetivo:** > 3 (estándar SaaS SMB saludable)

### Tiempos de "ver ventas"

| Hito | Horizonte típico |
|------|-----------------|
| Primera compra real | Días 0–14 post go-live comercial |
| Primer mes con MRR "no trivial" | 30–45 días |
| Validación de embudo | 60 días |
| Fase 2 (10+ coaches pagando) | 3–9 meses |

---

## Go-to-Market (Fase 1)

### Canales de adquisición (costo ascendente)

1. **Red propia y referrals** — costo marginal bajo
2. **Outbound a gimnasios y boxes** — demo presencial con PWA instalada
3. **Alianzas con nutricionistas** — bundles Pro+ (nutrición real en producto)
4. **Contenido educativo** — reels/shorts "cómo dejar de mandar PDFs por WhatsApp"
5. **Programa piloto / beta invites** — `/registro-beta?t=<token>` para invitaciones controladas. 20 días Pro gratis + 30 alumnos. Ideal para coaches de confianza que generen testimonios.
6. **Programa piloto extendido** — 3–5 coaches con feedback semanal + testimonio

### Proceso de venta B2B (pasos)

1. **Calificación:** nº alumnos, herramientas actuales, disposición a pagar SaaS
2. **Demo 20 min:** core loop (crear alumno → asignar programa → log alumno). Mostrar **Mi Marca** y **War Room** si el perfil es gestión
3. **Propuesta de tier:** alinear a límites `maxClients` para evitar frustración inmediata
4. **Prueba guiada:** opcional. `trialing` existe en BD
5. **Cierre:** envío a `/register`
6. **Onboarding:** checklist primeras 48 h

### Material mínimo de ventas

- Screenshots o video vertical del dashboard alumno
- One-pager PDF con precios alineados a `/pricing`
- FAQ sobre cancelación con acceso hasta fin de período y cambio de plan sin doble cobro

---

## Fases del Producto

### Fase 0: Pre-Revenue — COMPLETADA (~98%)
Producto funcional. Core loop completo. MercadoPago integrado con grace period + upgrade mid-cycle. Beta invite flow activo. Dashboard V2 listo. Auth rediseñado. Landing refactorizada.

### Fase 1: Revenue MVP (objetivo inmediato)
**Objetivo:** Primer coach real pagando.

| Métrica | Target |
|---------|--------|
| Coaches pagando | 1+ |
| Errores críticos en flujo de pago | 0 |
| Tiempo registro → pago | < 3 min |

**Qué falta:**
- Smoke test webhook MP en producción con credenciales reales
- Verificación cuenta MP (KYC completo)
- Panel CEO para visibilidad de métricas
- Testing E2E de cobertura real

### Fase 2: Product-Market Fit (3–9 meses)
**Objetivo:** 10+ coaches activos.

| Métrica | Target |
|---------|--------|
| Retención coach mes 2 | > 60% |
| NPS coach | > 40 |

**Qué construir:**
- Dashboard coach reworkeado (War Room style, tendencias)
- Mi Marca preview moderno
- Check-in con medidas corporales
- Panel CEO básico
- Workout optimistic + offline

### Fase 3: Growth
**Objetivo:** 50+ coaches.

| Métrica | Target |
|---------|--------|
| CAC | < $50.000 CLP |
| LTV/CAC | > 3 |

**Qué construir:** Push notifications, email marketing, gamificación, i18n completo, SEO técnico, programa de referidos.

### Fase 4: Scale
**Objetivo:** 200+ coaches.

| Métrica | Target |
|---------|--------|
| MRR | > $5M CLP |
| Uptime | 99.9% |

**Qué construir:** App móvil nativa (Capacitor), offline-first completo, CDN, multi-region Supabase, marketplace de templates.

---

## Escalabilidad del Stack

### Capacidad actual (sin cambios)

| Métrica | Capacidad estimada | Cuello de botella |
|---------|-------------------|-------------------|
| Coaches activos | 500–2.000 | Conexiones DB Supabase |
| Alumnos totales | 10.000–50.000 | Storage de fotos |
| Requests/mes | Ilimitado (Vercel Edge) | Supabase queries |
| Workouts/día | ~100.000 inserts | Supabase write throughput |

**Conclusión:** El stack actual escala perfectamente hasta ~1.000 coaches pagando con ~20.000 alumnos activos sin cambios. Eso equivale a ~$20–60M CLP/mes en MRR.

### Cuándo empieza a mostrar fricción

- **>5.000 coaches simultáneos:** Conexiones PostgreSQL. Solución: PgBouncer en Supabase Pro.
- **>500.000 filas en workout_logs:** Full scans en analytics. Solución: índices compuestos.
- **Fotos a gran escala:** Supabase Storage sin CDN global. Solución: Cloudflare Images.
- **Gym con aislamiento total requerido:** Modelo compartido no satisface. Solución: Supabase project dedicado por organización.

---

## Modelo B2B (Gimnasios)

### Venta a gym hoy (sin nuevo código)

La arquitectura actual soporta gym con workaround:
```
Gym "FitBox Santiago"
  ├── Coach "admin" (dueño) → ve todos sus alumnos
  ├── Coach "Pedro" → ve solo sus alumnos
  └── Coach "María" → ve solo sus alumnos
```
**Precio posible:** 3-4 cuentas × $29.990 = ~$120.000 CLP/mes. Limitación: sin vista consolidada cross-coaches.

### Para B2B real (1 semana de desarrollo)

Requiere:
1. Tabla `organizations` con `owner_id`, `max_coaches`, `subscription_tier`
2. Columna `organization_id` + `role_in_org` en `coaches`
3. Panel Owner: ver todos sus coaches + métricas consolidadas
4. Tier "Gym" en facturación

**Precio gym:** $99.990–$199.990 CLP/mes para box de 5–15 coaches.

### Roadmap B2B completo

| Fase | Esfuerzo | Features |
|------|----------|---------|
| Fase 1 B2B (básico) | ~7 días | `organizations`, panel owner, tier Gym |
| Fase 2 B2B (completo) | ~13 días | Dominio personalizado, roles, reportes exportables |
| Fase 3 B2B (enterprise) | ~17 días | Supabase dedicado, SSO, multi-sede, API pública |

---

## Evaluación de Proveedores de Pago

### Decisión actual: MercadoPago
EVA usa MP Pre-approvals (suscripciones recurrentes). **Mantener como proveedor principal mientras se valida el mercado.**

### Comparativa

| Criterio | MercadoPago (actual) | WebPay OneClick | Flow.cl | Stripe |
|----------|---------------------|-----------------|---------|--------|
| Suscripciones recurrentes | ✅ Pre-approvals | ✅ OneClick manual | ✅ Nativas | ✅ Billing nativo |
| Redcompra (débito CLP) | ✅ | ✅ | ✅ | ❌ |
| Tarjetas internacionales | ✅ | 🔶 Solo CL | 🔶 Limitado | ✅ Excelente |
| Confianza usuario chileno | 🔶 Media | ⭐⭐⭐⭐⭐ | 🔶 Media-alta | 🔶 Baja |
| Tiempo onboarding | ✅ Inmediato | ❌ 5-15 días | 🔶 3-7 días | ✅ 1-3 días |
| Límites de escala | ⚠️ Requiere KYC | ✅ Sin límites | ✅ Sin límites | ✅ Sin límites |
| API Quality (DX) | 🔶 Medio | 🔶 Medio | 🔶 Bueno | ⭐⭐⭐⭐⭐ |
| Comisión aprox. | ~3.49% | ~1.5–2.5% | ~2.95% | ~2.9% + $0.30 |
| Expansión LATAM | ✅ | ❌ Solo CL | ❌ Solo CL | ✅ Global |
| Complejidad integración | **Ya hecho** | Media | Baja | Baja |

### Hoja de ruta de pagos

- **Hoy (primeros 50 coaches):** Mantener MP. **Acción urgente: completar KYC en MP Chile** (RUT, cédula, cuenta bancaria). Sin esto, MP puede congelar fondos al llegar a 30-50 coaches.
- **Mediano plazo (50–200 coaches):** Agregar **Flow.cl** como alternativa. Flow usa WebPay internamente, suscripciones nativas, onboarding 3-7 días. Coach elige al registrarse.
- **Largo plazo (200+ coaches, LATAM):** Multi-proveedor: Flow.cl (Chile), MP (LATAM), Stripe (internacional).

### Cómo está preparado el código para multi-proveedor

`src/lib/payments/types.ts` ya define la interfaz:
```typescript
export interface PaymentsProvider {
    name: 'mercadopago' | 'stripe'   // agregar | 'flow' | 'transbank'
    createCheckout(input): Promise<CreateCheckoutResult>
    processWebhook(payload): Promise<WebhookProcessResult>
    fetchCheckoutSnapshot(checkoutId): Promise<ProviderCheckoutSnapshot>
    cancelCheckoutAtProvider(checkoutId): Promise<void>
}
```
El campo `coaches.payment_provider` ya existe en DB. Agregar Flow requiere ~3-4 días.

---

## Riesgos Principales

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| No monetizar a tiempo (cash runway) | Alta | Crítico | Fase 1 como prioridad absoluta |
| Cuenta MP sin KYC → congelamiento fondos | Alta | Alto | Completar verificación esta semana |
| Schema drift (migraciones perdidas) | Media | Alto | `supabase db push` + disciplina de versionado |
| Performance con muchos coaches (N+1) | Media | Alto | React.cache, índices, monitoreo |
| PWA limitada vs apps nativas (percepción) | Media | Medio | Offline básico, push notifications futuro |
| Seguridad RLS no validada en prod | Alta | Crítico | `supabase db push` + test E2E RLS antes de marketing |
| Competencia (Trainerize, TrueCoach, etc.) | Alta | Alto | Diferenciación: white-label + mercado Chile/LATAM |
| Bus factor = 1 (un solo developer) | Alta | Crítico | Documentación, tests, código limpio |

---

## Soporte y Comunicación

- **Canal principal:** contacto@eva-app.cl (visible en pricing/landing)
- **SLA Fase 1:** primera respuesta < 24 h hábil; P0 pagos < 4 h
- **Clasificación:** P0 pago/acceso | P1 bug bloquea entreno | P2 UX | P3 idea

---

## Legal y Cumplimiento

- `/legal` y `/privacidad` enlazados desde la app. Email: `contacto@eva-app.cl`
- Facturación B2B: criterio contable con asesor. MP entrega comprobantes según configuración de cuenta
- Ley 19.628 de protección de datos personales (Chile) — `privacidad/page.tsx`
- Términos de uso con límites por tier y uso aceptable

---

## Métricas North Star

**Hasta que exista el Panel CEO (0% actualmente):**

> "Sesiones de entrenamiento con al menos un set logueado por semana, por coach activo"

Conecta valor alumno + retención coach. Alternativa: **alumnos activos semanales por coach**.

### KPIs por fase

| Fase | Métricas mínimas |
|------|------------------|
| Fase 1 | 1+ coach pagando; 0 errores críticos en pago; tiempo registro→pago < 3 min |
| Fase 2 | 10+ coaches; retención mes 2 > 60%; NPS coach > 40 |
| Fase 3 | 50+ coaches; CAC < $50.000 CLP; LTV/CAC > 3 |
| Fase 4 | 200+ coaches; MRR > $5M CLP; uptime 99.9% |

### Activación coach (definición operativa)

1. Cuenta creada y pago OK
2. ≥1 alumno creado en directorio
3. ≥1 programa asignado o visible en alumno
4. ≥1 log de entrenamiento por un alumno en 14 días

### Ritmo de ingeniería sugerido

- Release semanal o quincenal con notas breves para pilotos
- Congelar features 48 h antes de campaña de marketing grande
- Postmortem en cualquier incidente P0 de pagos
