# Plan Maestro Estrategico — EVA Fitness Platform

> Documento exhaustivo de planificacion desde todas las perspectivas profesionales.
> Cada tarea tiene: ID unico, prioridad (P0-P3), esfuerzo estimado, dependencias.
> **Generado:** 2026-04-10 America/Santiago
> **Actualizado:** 2026-04-14 America/Santiago — BUG-002/003/004/005 cerrados (nutrición quantity+unit, alertas críticas alumnos nuevos, onboarding dismiss); FEAT-F01 unidades g+un completado; FEAT-F02 seed 250 alimentos completado; estado real ~76%.
> **Base:** Auditoria completa de 225+ archivos, 24 tablas BD, 38 rutas.

---

## Glosario de Prioridades

| Prioridad | Significado | Criterio |
|-----------|-------------|----------|
| **P0** | Bloqueante | Sin esto no hay revenue ni produccion segura |
| **P1** | Critica | Necesario para los primeros 10 coaches pagando |
| **P2** | Importante | Mejora significativa de retención o experiencia |
| **P3** | Deseable | Nice-to-have, polish, futuro |

---

# PARTE 1: ESTRATEGIA Y PRODUCTO

## 1.1 Vision del Producto

**EVA** es una plataforma SaaS white-label para coaches de fitness que les permite gestionar programas de entrenamiento, nutricion y progreso de sus alumnos a traves de una app personalizada con su marca.

**Propuesta de valor unica:**
- White-label real: cada coach tiene su propia "app" (PWA) con logo, colores y dominio personalizado
- Mercado Chile/LATAM desatendido por competidores anglosajones (Trainerize, TrueCoach, PTminder)
- Stack moderno que permite iteracion rapida (Next.js 16, RSC, Supabase)
- UX premium en los modulos core (dashboard alumno, builder, directorio)

**Modelo de negocio:** Suscripcion mensual escalonada por cantidad de alumnos (CLP).

---

## 1.2 Personas del Usuario

### Persona 1: Coach Carlos (usuario primario — paga)
- **Edad:** 28-45 anos
- **Contexto:** Personal trainer independiente o dueno de box/gym pequeno en Chile
- **Alumnos:** 10-50 alumnos activos
- **Pain points:** Usa WhatsApp + Excel + Google Sheets para gestionar alumnos. Pierde tiempo en seguimiento manual. No tiene herramienta profesional en espanol que se adapte a su marca.
- **Expectativa:** Quiere parecer profesional, diferenciarse, y automatizar lo repetitivo.
- **Dispositivo:** iPhone/Android (primario), laptop (secundario)

### Persona 2: Alumna Maria (usuario secundario — no paga directamente)
- **Edad:** 22-40 anos
- **Contexto:** Alumna de Coach Carlos. Entrena 3-5 veces por semana.
- **Pain points:** Recibe rutinas por WhatsApp/PDF, se pierden. No sabe si esta progresando. No sabe que comer.
- **Expectativa:** Abrir la app y saber que hacer hoy, registrar su entrenamiento rapido, ver su progreso.
- **Dispositivo:** Smartphone (99% del uso)

### Persona 3: CEO/Founder (superadmin)
- **Contexto:** Tu y tu socio. Necesitan ver metricas de la plataforma.
- **Pain points:** No hay visibilidad del estado del negocio (MRR, churn, coaches activos).
- **Expectativa:** Dashboard interno con KPIs clave sin tocar la BD manualmente.

---

## 1.3 Analisis Competitivo

| Feature | EVA (actual) | Trainerize | TrueCoach | PTminder |
|---------|-------------|------------|-----------|----------|
| White-label | Si (PWA) | Parcial (branding) | No | No |
| Mercado LATAM/CLP | Si | No | No | No |
| Espanol nativo | Si | Traduccion | No | No |
| Builder DnD | Si (avanzado) | Si | Si | Basico |
| Nutricion integrada | Si (completo) | Add-on | Basico | No |
| Attention Scores | Si | No | No | No |
| Compliance tracking | Si (3 anillos) | Basico | Basico | No |
| App nativa | No (PWA) | Si | Si | Si |
| Pagos integrados | **No** | Si | Si | Si |
| Precio (coach) | CLP 14.990+ | USD 5+/alumno | USD 19-99 | USD 42+ |

**Conclusion:** EVA tiene ventaja en UX y features analíticos pero le falta el basico: cobrar. La competencia cobra y entrega menos.

---

## 1.4 Matriz de Priorizacion (Impact vs Effort)

```
                    ALTO IMPACTO
                         |
    [Pagos P0]     [Dashboard Coach P1]     [Notificaciones P2]
    [Registro+Pago P0]                       [Push P2]
    [Landing/Pricing P0]                     [Offline P2]
                         |
  BAJO ESFUERZO ─────────┼───────── ALTO ESFUERZO
                         |
    [Quick Wins P1]      [Mi Marca P2]       [App Nativa P3]
    [Fix bugs P0]        [Onboarding P2]     [Marketplace P3]
    [.env.example P0]    [i18n completo P2]  [Wearables P3]
                         |
                    BAJO IMPACTO
```

---

## 1.5 Roadmap por Trimestre

| Trimestre | Fase | Objetivo | % Target |
|-----------|------|----------|----------|
| Q2 2026 (ahora) | Fase 1: Revenue MVP | Primer coach pagando | 75% |
| Q3 2026 | Fase 2: PMF | 10+ coaches, validar modelo | 85% |
| Q4 2026 | Fase 3: Growth | 50+ coaches, escalar | 92% |
| Q1 2027 | Fase 4: Scale | 200+ coaches, app nativa | 97% |

---

# PARTE 2: DISENO Y EXPERIENCIA (UX/UI)

## 2.1 Inventario de Deuda UX

### P0 — Bloqueante para revenue

| ID | Area | Problema | Impacto |
|----|------|----------|---------|
| ~~BUG-001~~ | Workout Execution | ~~Semana nueva mostraba logs de la semana anterior como "ya completados"~~ | ~~Alumno no podía registrar entrenamientos correctamente~~ → **CERRADO 2026-04-13** |
| ~~BUG-002~~ | Nutrición | ~~`quantity` input snapeaba a 0 al borrar el campo~~ | **CERRADO 2026-04-14** — State cambiado a `string`, parse en preview/add |
| ~~BUG-003~~ | Nutrición | ~~Selector de unidad g/un no respondía dentro del Sheet~~ | **CERRADO 2026-04-14** — Reemplazado por button toggle (fix portal Radix) |
| ~~BUG-004~~ | Dashboard Coach | ~~Alertas críticas aparecían para alumnos nuevos sin planes~~ | **CERRADO 2026-04-14** — Guard `hasActiveWorkoutProgram` en `calculateAttentionScore` |
| ~~BUG-005~~ | Dashboard Coach | ~~Onboarding coach sin botón para cerrar/ocultar~~ | **CERRADO 2026-04-14** — Botón X + `dismissed` persistido en localStorage |
| UX-001 | Pricing/Landing | Moneda inconsistente (USD en /pricing vs CLP en landing) | Confusion total del usuario, destruye confianza |
| UX-002 | Registro coach | Sin flujo de pago, sin confirmacion visual de "que estoy comprando" | No hay conversion |
| UX-003 | Login coach | UI basica sin branding premium | Primera impresion pobre |

### P1 — Critica para primeros coaches

| ID | Area | Problema | Impacto |
|----|------|----------|---------|
| ~~FEAT-F01~~ | BD Alimentos | ~~Solo 54 alimentos. Pocos para uso real de nutrición.~~ | **CERRADO 2026-04-14** — Seed 250+ alimentos completado |
| ~~FEAT-F02~~ | Unidades nutrición | ~~7 unidades inconsistentes (g, ml, gr, un, cda, cdta, taza, porción). Sin validación.~~ | **CERRADO 2026-04-14** — Simplificado a `g` + `un`. BUG-002/003 quantity+unit corregidos |
| FEAT-H01 | Perfil alumno coach | Coach no puede ver qué comió/entrenó un alumno en una fecha específica del pasado | Dificulta seguimiento individualizado → DayNavigator en tabs Nutrición + Análisis |
| UX-004 | Dashboard coach | UI no refleja el nivel del resto de la app | Coach siente que la app es "a medias" |
| UX-005 | Mi Marca | Preview desactualizado del dashboard alumno | Coach no sabe que vera su alumno |
| UX-006 | Onboarding alumno | Sin progress bar visual, saltos bruscos entre pasos | Abandono en primer uso |
| UX-007 | Workout execution | Scroll largo en entrenamientos con muchos ejercicios | Frustracion alumno |
| UX-008 | Check-in | Sin campos de medidas corporales (cintura, pecho, brazo, etc.) | Coach no puede trackear composicion corporal |

### P2 — Importante para retención

| ID | Area | Problema | Impacto |
|----|------|----------|---------|
| UX-009 | i18n | Solo landing tiene switch es/en. Resto de la app hardcoded en espanol | Limita mercado |
| UX-010 | Ejercicios coach | Sin upload de GIF propios. Solo usa banco global | Coach no puede personalizar |
| UX-011 | Ejercicios alumno | Sin favoritos ni historial por ejercicio | Alumno no puede ver su progreso por movimiento |
| UX-012 | Email transaccional | No hay emails: bienvenida, reminder check-in, programa nuevo | Coach debe comunicar todo manual |
| UX-013 | Tabs perfil alumno | "Entrenamiento" y "Programa" se solapan. Logs duplicados. Coach confundido sobre qué tab usar. | Rename → Análisis + Plan; quitar mini-logs de ProgramTabB7 |
| UX-014 | KPI card Overview | Card sidebar "Métricas Clave" muestra 3 métricas con estilos muy grandes. "Racha" duplicada en grid de 6 KPIs. | Reducir padding, quitar blur decorativo, eliminar "Racha Interact." |

---

## 2.2 Arquitectura de Informacion — Gaps

### Coach (sidebar actual vs ideal)

**Actual:**
```
Dashboard | Alumnos | Programas | Ejercicios | Planes Nutricionales | Mi Marca
```

**Ideal (propuesta):**
```
Dashboard | Alumnos | Programas | Ejercicios | Nutricion | Mi Marca | Suscripcion
                                                                        └── Nuevo
```

**Cambios:**
- Agregar "Suscripcion" al sidebar (gestion de plan, facturacion, upgrade)
- "Nutricion" como label (actualmente dice "Planes Nutricionales" — largo)
- Foods accesible desde dentro de Nutricion (ya lo esta, confirmar)

### Alumno (nav actual vs ideal)

**Actual (ClientNav):**
```
Dashboard | Nutricion | Ejercicios | Check-in | Settings
```

**Ideal (propuesta):**
```
Dashboard | Entrenar | Nutricion | Progreso | Mas (ejercicios, settings)
```

**Cambios:**
- "Entrenar" como acceso directo al workout del dia (hoy el hero card ya hace esto)
- "Progreso" como seccion dedicada (hoy esta disperso en dashboard)
- "Mas" agrupa secundarios (ejercicios, configuracion, check-in)
- Check-in accesible desde dashboard banner (ya existe) + desde "Progreso"

---

## 2.3 Auditoria Mobile-First

| Area | Estado | Problemas detectados |
|------|--------|---------------------|
| Dashboard alumno | Excelente | Grid responsive, pull-to-refresh, safe-area |
| Workout execution | Bueno | Scroll largo en routines grandes, sin nav por bloque |
| Check-in | Bueno | Wizard funciona, animaciones direction-aware |
| Nutricion alumno | Excelente | Day navigator, toggle comidas, responsive |
| Coach sidebar | Bueno | Sheet en mobile, pero no persiste estado |
| Builder | Excelente | Bottom sheet para catalogo, day navigation |
| Dashboard coach | Regular | Cards no optimizadas para mobile, charts pequenos |
| Landing | Bueno | Hero responsive, sheet menu, pero LCP no medido |

---

## 2.4 Micro-copy y UX Writing

| Problema | Donde | Solucion propuesta |
|----------|-------|-------------------|
| Textos hardcoded en espanol | Toda la app excepto landing | Migrar a i18n keys progresivamente |
| "EVA" como titulo en pestanas | Multiples pages | Usar nombre del coach cuando aplique (white-label) |
| Error messages genericos | Server actions | Mensajes especificos por tipo de error |
| Sin empty states en algunos modulos | Dashboard coach sin alumnos | Disenar empty states con CTAs claros |
| Tooltips ausentes en iconos | Multiples | Agregar `InfoTooltip` donde haya iconos sin texto |

---

## 2.5 Design System — Gaps

| Componente | Estado | Gap |
|-----------|--------|-----|
| GlassCard | Implementado | OK — base de todo |
| GlassButton | Implementado | OK |
| Dark mode | Default dark | Sin verificacion sistematica en todos los componentes |
| `--theme-primary` | Implementado | Algunos charts no lo respetan |
| Skeleton system | Parcial | No todos los modulos tienen loading.tsx |
| Motion presets | `animation-presets.ts` | Falta `useReducedMotion` en algunos hijos |
| Spacing scale | Tailwind default | Inconsistencias (space-y-2 vs space-y-3 en contextos similares) |
| Typography | Inter + Montserrat | Referencias a `font-outfit` que no esta cargada |

---

### Tareas de Diseno

| ID | Tarea | Prioridad | Esfuerzo | Dependencia |
|----|-------|-----------|----------|-------------|
| DS-001 | Disenar flujo de registro + pago (wireframes) | P0 | 2 dias | UX-002 |
| DS-002 | Disenar pagina pricing unificada (CLP, tiers definitivos) | P0 | 1 dia | UX-001 |
| DS-003 | Disenar rework dashboard coach (War Room style) | P1 | 2 dias | UX-004 |
| DS-004 | Disenar wizard onboarding alumno mejorado | P2 | 1 dia | UX-006 |
| DS-005 | Disenar pantalla de "Progreso" dedicada para alumno | P2 | 2 dias | — |
| DS-006 | Disenar empty states para todos los modulos | P1 | 1 dia | — |
| DS-007 | Disenar flujo de gestion de suscripcion coach | P1 | 1 dia | DS-001 |
| DS-008 | Disenar campos de medidas corporales en check-in | P2 | 0.5 dia | UX-008 |
| DS-009 | Audit dark mode + contraste WCAG AA | P2 | 1 dia | — |
| DS-010 | Disenar sistema de notificaciones (in-app + email) | P2 | 2 dias | — |

---

# PARTE 3: INGENIERIA (DESARROLLO TECNICO)

## FASE 1: REVENUE ENABLEMENT (P0)

### Epic 1.1: Integracion de Pagos

> **Objetivo:** Coach puede registrarse y pagar. Suscripcion recurrente. Webhooks para activar/desactivar.

#### 1.1.1 Definir tiers y modelo de datos
| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-001 | Definir tiers definitivos (CLP, features por tier) | 0.5 dia | Producto + Tech. Resultado: tabla con tiers, precios, limites |
| ENG-002 | Migración BD: tabla `subscription_events` o ampliar `coaches` | 0.5 dia | Campos: `subscription_tier`, `subscription_status`, `subscription_mp_id`, `trial_ends_at`, `current_period_end`, `max_clients` |
| ENG-003 | Crear constante `TIER_CONFIG` en `src/lib/constants.ts` | 0.5 dia | Map tier → features, limites, precios. Single source of truth |

#### 1.1.2 Integracion MercadoPago
| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-004 | Crear cuenta MercadoPago Chile, obtener API keys | 0.5 dia | Sandbox + produccion |
| ENG-005 | Instalar SDK MercadoPago (`mercadopago` npm) | 0.5 dia | — |
| ENG-006 | API route: `POST /api/payments/create-preference` | 1 dia | Crea suscripcion recurrente (preapproval) de MercadoPago y retorna init_point |
| ENG-007 | API route: `POST /api/payments/webhook` | 1.5 dias | Recibe IPN de MercadoPago, valida firma, actualiza `coaches.subscription_status` |
| ENG-008 | API route: `GET /api/payments/subscription-status` | 0.5 dia | Para que el frontend consulte estado actual |
| ENG-009 | Middleware: agregar `subscription_status` check en `/coach/*` | 0.5 dia | Si expired/cancelled → redirigir a pagina de reactivacion |
| ENG-010 | Pagina `/coach/reactivate` — CTA para renovar suscripcion | 1 dia | — |

#### 1.1.3 Flujo de registro con pago
| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-011 | Redisenar `/register` — paso 1: datos, paso 2: seleccionar tier, paso 3: pagar | 2 dias | Multi-step form, preview del tier, redirect a MercadoPago |
| ENG-012 | Callback post-pago: activar coach, redirect a `/coach/dashboard` | 1 dia | Success/failure/pending pages |
| ENG-013 | Trial gratuito: 14 dias sin pago, banner countdown en dashboard | 1 dia | `coaches.trial_ends_at`, check en middleware, banner en dashboard |

#### 1.1.4 Gestion de suscripcion
| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-014 | Pagina `/coach/subscription` — ver plan, proximo cobro, historial | 1 dia | — |
| ENG-015 | Upgrade/downgrade: cambiar tier desde la app | 1 dia | MercadoPago update subscription API |
| ENG-016 | Cancelación: flujo de cancelacion con survey de razones | 1 dia | — |

#### 1.1.5 Control de acceso por tier
| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-017 | Middleware check `max_clients` por tier al crear alumno | 0.5 dia | — |
| ENG-018 | Feature flags: `canUseNutrition`, `canUseBranding`, etc. | 1 dia | Helper `getCoachFeatures(tier)` |
| ENG-019 | UI: badges "Pro" / "Elite" en features bloqueadas, upsell modals | 1 dia | — |

**Subtotal Epic 1.1: ~14 dias**

---

### Epic 1.2: Landing y Pricing Alignment

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-020 | Unificar moneda en `/pricing` a CLP | 0.5 dia | Usar mismos tiers que landing |
| ENG-021 | Conectar CTAs de pricing/landing a `/register` con tier preseleccionado | 0.5 dia | Query param `?tier=pro` |
| ENG-022 | Agregar FAQ a pricing (preguntas frecuentes de coaches) | 0.5 dia | — |
| ENG-023 | Testimonios reales o placeholder convincente | 0.5 dia | — |
| ENG-024 | Optimizar LCP de landing (defer animations, optimize images) | 1 dia | Lighthouse audit |
| ENG-025 | Meta tags SEO: og:image, structured data, sitemap.xml | 0.5 dia | — |

**Subtotal Epic 1.2: ~3.5 dias**

---

### Epic 1.3: Quick Wins y Bug Fixes (P0)

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-026 | Crear `.env.example` con todas las variables | 15 min | — |
| ENG-027 | Fix auth callback redirect `/auth/login` → `/login` | 10 min | `src/app/auth/callback/route.ts` |
| ENG-028 | Borrar `ClientCard.tsx` V1 huerfano | 5 min | Verificar con grep primero |
| ENG-029 | Renombrar cache sw.js `omnicoach` → `eva` | 10 min | `public/sw.js` |
| ENG-030 | Unificar `LIBRARY_PROGRAM_LIST_SELECT` | 30 min | Mover a `workout-programs-library.ts` |
| ENG-031 | Mover `puppeteer` a devDependencies | 5 min | O evaluar alternativa |
| ENG-032 | Fix o eliminar `font-outfit` references | 20 min | `/pricing`, `/coach/exercises` |
| ENG-033 | Commit migraciones SQL al repo (`supabase db pull`) | 1 hr | — |
| ENG-034 | Tipar `admin-raw.ts` (eliminar `any`) | 30 min | — |

**Subtotal Epic 1.3: ~3 horas**

---

## FASE 2: CORE LOOP POLISH (P1)

### Epic 2.1: Dashboard Coach Rework

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-035 | Migrar page.tsx a patron `_data/_components/_actions` | 1 dia | Mismo patron que dashboard alumno |
| ENG-036 | Implementar React.cache en queries del dashboard | 0.5 dia | — |
| ENG-037 | War Room header: stat cards con useSpring (como directorio) | 1 dia | Total alumnos, adherencia global, check-ins esta semana, MRR |
| ENG-038 | Alertas inteligentes agregadas (top 5 alumnos que necesitan atencion) | 1 dia | Reusar `calculateAttentionScore` de `dashboard.service.ts` |
| ENG-039 | Charts mejorados: tendencia adherencia 30d, crecimiento alumnos con area | 1 dia | Recharts con `--theme-primary` |
| ENG-040 | Activity feed enriquecido: check-ins con foto miniatura, workouts completados | 0.5 dia | — |
| ENG-041 | Quick actions: crear alumno, ir a builder, ver nutricion | 0.5 dia | — |
| ENG-042 | KPI comparativa: este mes vs mes anterior | 1 dia | — |
| ENG-043 | Calendario de sesiones programadas (mini calendario) | 1 dia | — |
| ENG-044 | Mobile optimization: stack en 1 columna, charts scrollable | 0.5 dia | — |

**Subtotal Epic 2.1: ~8 dias**

---

### Epic 2.2: Mi Marca Rework

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-045 | Redisenar UI del formulario de branding | 1 dia | Preview en tiempo real a la derecha (desktop) |
| ENG-046 | Implementar crop de logo (react-image-crop o similar) | 1 dia | — |
| ENG-047 | Agregar opciones: secondary color, font choice, welcome message | 1 dia | — |
| ENG-048 | Actualizar `StudentDashboardPreview` con layout del dashboard real | 1.5 dias | Reutilizar componentes reales en modo preview |
| ENG-049 | Preview en tiempo real del login del alumno | 0.5 dia | — |
| ENG-050 | Migración BD: agregar campos `secondary_color`, `welcome_message`, `font_preference` a `coaches` | 0.5 dia | — |

**Subtotal Epic 2.2: ~5.5 dias**

---

### Epic 2.3: Workout Execution Polish

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-051 | Optimistic updates completos en LogSetForm | 1 dia | useOptimistic + rollback on error |
| ENG-052 | Navegacion por bloque (tabs o scroll-snap por seccion) | 1 dia | — |
| ENG-053 | Vibracion nativa (Navigator.vibrate) en timer y completar set | 0.5 dia | Con fallback silencioso |
| ENG-054 | Batch logging: boton "completar todos los sets" para bloque | 1 dia | — |
| ENG-055 | Offline queue: guardar logs en IndexedDB si sin conexion, sync al volver | 2 dias | — |
| ENG-056 | Personalizacion rest timer desde prescripcion (rest_time del bloque) | 0.5 dia | — |
| ENG-057 | Comparativa historica en summary: "esta vez vs tu mejor" | 1 dia | — |
| ENG-058 | Badges/logros al completar (streak de dias, PR, primera vez) | 1 dia | — |

**Subtotal Epic 2.3: ~8 dias**

---

### Epic 2.4: Check-in Enhancements

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-059 | Agregar campos de medidas corporales | 1.5 dias | Migración BD: `waist_cm`, `chest_cm`, `arm_cm`, `hip_cm`, `thigh_cm` en `check_ins`. Paso nuevo en wizard |
| ENG-060 | Campo de notas libres del alumno | 0.5 dia | Textarea en paso 1 o nuevo paso |
| ENG-061 | Foto de perfil lateral (tercer angulo) | 0.5 dia | Similar a front/back, upload a Storage |
| ENG-062 | Historial de check-ins con timeline visual | 1 dia | Accesible desde dashboard o seccion dedicada |
| ENG-063 | Comparacion side-by-side de fotos (2 fechas) | 1 dia | Reusar `PhotoComparisonSlider` del perfil coach |
| ENG-064 | Reminder automatico si >7 dias sin check-in | 0.5 dia | Depende de notificaciones (ENG-090+) |

**Subtotal Epic 2.4: ~5 dias**

---

### Epic 2.5: Ejercicios Coach Rework

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-065 | Upload de GIF/video custom por ejercicio | 1.5 dias | Supabase Storage bucket `exercises`, compresion, preview |
| ENG-066 | Bulk edit: seleccion multiple + editar grupo muscular/equipo | 1 dia | — |
| ENG-067 | Tags personalizados por ejercicio | 0.5 dia | Migración BD: `tags text[]` en `exercises` |
| ENG-068 | Busqueda mejorada: por nombre + grupo + equipo + tags | 0.5 dia | — |
| ENG-069 | Importar desde banco global al catalogo custom | 0.5 dia | Copiar ejercicio global como custom del coach |
| ENG-070 | Notas del coach por ejercicio (cues, variantes) | 0.5 dia | Migración BD: `coach_notes text` en `exercises` |

**Subtotal Epic 2.5: ~4.5 dias**

---

## FASE 3: RETENCION Y ENGAGEMENT (P2)

### Epic 3.1: Notificaciones

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-071 | Email transaccional: setup proveedor (Resend o similar) | 0.5 dia | — |
| ENG-072 | Email: bienvenida al alumno (con credenciales + link a la app) | 1 dia | Template HTML branded |
| ENG-073 | Email: recordatorio check-in (>5 dias) | 0.5 dia | Cron job o Supabase Edge Function |
| ENG-074 | Email: nuevo programa asignado | 0.5 dia | — |
| ENG-075 | Email: programa por vencer (3 dias) | 0.5 dia | — |
| ENG-076 | Email: coach — resumen semanal de alumnos | 1 dia | KPIs: adherencia, check-ins, alertas |
| ENG-077 | In-app notifications: sistema de notificaciones | 2 dias | Tabla `notifications`, bell icon, badge count |
| ENG-078 | Push notifications (Web Push API + VAPID) | 2 dias | — |
| ENG-079 | Preferencias de notificacion (alumno y coach) | 1 dia | — |

**Subtotal Epic 3.1: ~9 dias**

---

### Epic 3.2: Gamificacion y Engagement

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-080 | Sistema de logros/badges | 2 dias | Tabla `achievements`, definiciones, trigger al completar |
| ENG-081 | Logro: racha de X dias entrenando | 0.5 dia | Ya existe streak — conectar a achievement |
| ENG-082 | Logro: primer PR | 0.5 dia | — |
| ENG-083 | Logro: X check-ins completados | 0.5 dia | — |
| ENG-084 | Logro: X comidas registradas | 0.5 dia | — |
| ENG-085 | Logro: peso objetivo alcanzado | 0.5 dia | Requiere `goal_weight` (ENG-097) |
| ENG-086 | Perfil de logros del alumno (showcase) | 1 dia | — |
| ENG-087 | Leaderboard entre alumnos del mismo coach (opt-in) | 2 dias | — |
| ENG-088 | Celebraciones visuales (confetti, animaciones) al desbloquear | 0.5 dia | Ya existe infra con canvas-confetti |

**Subtotal Epic 3.2: ~8 dias**

---

### Epic 3.3: Onboarding Alumno Rework

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-089 | Progress bar visual (step indicator con iconos) | 0.5 dia | — |
| ENG-090 | Foto inicial del alumno (para comparacion futura) | 1 dia | Upload a Storage, asociar a `client_intake` o `check_ins` |
| ENG-091 | Validacion campo a campo (inline errors, no solo al submit) | 0.5 dia | react-hook-form field-level validation |
| ENG-092 | Skip de campos opcionales (lesiones, condiciones medicas) | 0.5 dia | — |
| ENG-093 | Animacion de bienvenida al completar | 0.5 dia | Lottie o confetti |
| ENG-094 | Recogida de objetivo de peso (para futuro `goal_weight`) | 0.5 dia | — |

**Subtotal Epic 3.3: ~3.5 dias**

---

### Epic 3.4: Deuda Tecnica de BD

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-095 | `supabase db pull` — volcar DDL completo al repo | 1 dia | Incluir: tablas, RLS policies, functions, triggers, indexes |
| ENG-096 | Establecer workflow de migraciones versionadas | 0.5 dia | Documentar en README: como crear, aplicar, verificar |
| ENG-097 | Migración: `goal_weight_kg numeric` en `clients` | 0.5 dia | + pasar al WeightProgressChart como ReferenceLine |
| ENG-098 | Migración: `waist_cm`, `chest_cm`, `arm_cm`, `hip_cm`, `thigh_cm` en `check_ins` | 0.5 dia | Para check-in enriquecido |
| ENG-099 | Migración: `tags text[]`, `coach_notes text` en `exercises` | 0.5 dia | Para catalogo coach |
| ENG-100 | Migración: campos de suscripcion extendidos en `coaches` | 0.5 dia | `current_period_end`, `max_clients`, etc. |
| ENG-101 | Migración: tabla `notifications` | 0.5 dia | id, user_id, type, title, body, read, link, created_at |
| ENG-102 | Migración: tabla `achievements` + `user_achievements` | 0.5 dia | Definiciones + tracking por usuario |
| ENG-103 | Indexes de performance: `workout_logs(client_id, logged_at)`, `check_ins(client_id, date)`, `daily_nutrition_logs(client_id, log_date)` | 0.5 dia | — |
| ENG-104 | Audit RLS policies existentes (aplicadas via MCP, no versionadas) | 1 dia | Comparar dashboard Supabase vs expectations |

**Subtotal Epic 3.4: ~6 dias**

---

### Epic 3.5: i18n Completo

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-105 | Auditar todos los strings hardcoded en espanol | 1 dia | Generar lista de archivos + strings a migrar |
| ENG-106 | Migrar modulo coach a i18n keys (sidebar, dashboard, directorio) | 2 dias | — |
| ENG-107 | Migrar modulo alumno a i18n keys (dashboard, workout, nutrition, check-in) | 2 dias | — |
| ENG-108 | Migrar modulos auth a i18n keys (login, register, forgot, reset) | 1 dia | — |
| ENG-109 | Agregar portugues (pt-BR) como tercer idioma | 1 dia | Mercado Brasil enorme |
| ENG-110 | Selector de idioma persistente (cookie o user preference) | 0.5 dia | — |

**Subtotal Epic 3.5: ~7.5 dias**

---

### Epic 3.6: Panel CEO / Superadmin

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-111 | Ruta `/x/internal` protegida por email whitelist | 0.5 dia | Middleware check |
| ENG-112 | Dashboard: total coaches, total alumnos, coaches activos vs trial vs expired | 1 dia | — |
| ENG-113 | MRR actual + historico (chart lineal) | 1 dia | Calcular desde `coaches.subscription_tier` + `status` |
| ENG-114 | Churn rate: coaches que cancelaron / total | 0.5 dia | — |
| ENG-115 | Actividad de la plataforma: workouts logueados hoy, check-ins hoy | 0.5 dia | — |
| ENG-116 | Top coaches por alumnos activos | 0.5 dia | — |
| ENG-117 | Funnel: registro → pago → primer alumno → primer programa | 1 dia | — |
| ENG-118 | Herramientas admin: desactivar coach, extender trial, cambiar tier manual | 1 dia | Admin API actions |

**Subtotal Epic 3.6: ~6 dias**

---

## FASE 4: PERFORMANCE Y ESCALA (P2-P3)

### Epic 4.1: Performance

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-119 | Lighthouse audit completo (todas las rutas principales) | 1 dia | Target: Performance >90, Accessibility >90 |
| ENG-120 | Optimizar LCP de landing (lazy images, font-display swap) | 1 dia | — |
| ENG-121 | Implementar ISR/SSG donde aplique (landing, pricing, legal) | 0.5 dia | `export const revalidate = 3600` |
| ENG-122 | Optimizar bundle size: analizar con `@next/bundle-analyzer` | 0.5 dia | Eliminar imports pesados sin usar |
| ENG-123 | Lazy load Recharts (dynamic import con loading) | 0.5 dia | Charts pesados, no necesarios en initial load |
| ENG-124 | Image optimization: WebP/AVIF via Supabase transform o next/image | 0.5 dia | — |
| ENG-125 | Query optimization: evitar N+1 en perfil alumno y directorio | 1 dia | Analizar con Supabase query logs |
| ENG-126 | Connection pooling: verificar configuracion Supabase | 0.5 dia | — |

**Subtotal Epic 4.1: ~5.5 dias**

---

### Epic 4.2: PWA Avanzado

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-127 | Offline basico: cache de assets estaticos + ultima version del dashboard | 2 dias | sw.js rewrite con Workbox |
| ENG-128 | Offline queue para workout logs (IndexedDB + background sync) | 2 dias | — |
| ENG-129 | Splash screen nativo por coach (dynamic based on manifest) | 0.5 dia | Ya tiene manifest dinamico — verificar splash behavior |
| ENG-130 | Badge API: mostrar notificaciones sin abrir en badge del icono | 0.5 dia | — |
| ENG-131 | Share Target API: recibir fotos compartidas para check-in | 1 dia | — |

**Subtotal Epic 4.2: ~6 dias**

---

### Epic 4.3: App Movil Nativa (Futuro P3)

| ID | Subtarea | Esfuerzo | Detalle |
|----|----------|----------|---------|
| ENG-132 | Evaluacion: Capacitor vs React Native vs Flutter | 2 dias | POC con Capacitor (reutiliza Next.js) |
| ENG-133 | Setup Capacitor + plugins nativos (camera, haptics, push) | 3 dias | — |
| ENG-134 | Build iOS + TestFlight | 2 dias | — |
| ENG-135 | Build Android + Play Console internal testing | 2 dias | — |
| ENG-136 | Deep links (universal links iOS, app links Android) | 1 dia | — |
| ENG-137 | Native splash + app icon por coach | 1 dia | Generar en build time |

**Subtotal Epic 4.3: ~11 dias**

---

# PARTE 4: QA Y TESTING

## 4.1 Estado Actual de Testing

| Tipo | Herramienta | Tests existentes | Cobertura |
|------|-------------|-----------------|-----------|
| Unit | Vitest + Testing Library | 1 (`Button.test.tsx`) | ~0.5% |
| E2E | Playwright | 1 (`auth.spec.ts` — solo titulos) | ~1% |
| Integration | — | 0 | 0% |
| Visual regression | — | 0 | 0% |
| RLS | — | 0 | 0% |

**Veredicto:** Cobertura critica. No se puede ir a produccion con pagos reales sin tests.

---

## 4.2 Estrategia de Testing por Capa

### Capa 1: Server Actions (Prioridad Maxima)

> Las server actions son el punto critico: mutan datos, manejan dinero, gestionan auth.

| ID | Test | Prioridad | Esfuerzo |
|----|------|-----------|----------|
| QA-001 | `createClientAction` — crea auth user + client row | P0 | 0.5 dia |
| QA-002 | `deleteClientAction` — cascade delete | P0 | 0.5 dia |
| QA-003 | `logSetAction` — upsert correcto, revalidation | P1 | 0.5 dia |
| QA-004 | `submitCheckinAction` — upload + insert + revalidation | P1 | 0.5 dia |
| QA-005 | `saveWorkoutProgramAction` — nested inserts | P1 | 1 dia |
| QA-006 | `loginAction` — happy path + coach not found + wrong password | P0 | 0.5 dia |
| QA-007 | `registerAction` — happy path + duplicate slug + rollback on failure | P0 | 1 dia |
| QA-008 | Server actions de pagos (cuando existan) | P0 | 1 dia |
| QA-009 | `toggleMealAction` — optimistic + server consistency | P1 | 0.5 dia |
| QA-010 | `quickLogWeightAction` — validacion 20-400 kg | P1 | 0.5 dia |

**Subtotal: ~6.5 dias**

---

### Capa 2: E2E Flujos Criticos (Playwright)

| ID | Test | Prioridad | Esfuerzo |
|----|------|-----------|----------|
| QA-011 | Flujo registro coach completo (con mock de pago) | P0 | 1 dia |
| QA-012 | Flujo login coach → dashboard → crear alumno | P0 | 1 dia |
| QA-013 | Flujo coach: crear programa → asignar → verificar en alumno | P1 | 1.5 dias |
| QA-014 | Flujo alumno: login → dashboard → workout → completar → summary | P1 | 1.5 dias |
| QA-015 | Flujo alumno: check-in completo (3 pasos + fotos) | P1 | 1 dia |
| QA-016 | Flujo alumno: nutricion (toggle comidas, cambiar dia) | P1 | 1 dia |
| QA-017 | Flujo password: forgot → email → reset → login | P1 | 1 dia |
| QA-018 | Flujo onboarding alumno (multi-step completo) | P2 | 0.5 dia |
| QA-019 | Responsive: repetir QA-014 en viewport mobile (375px) | P1 | 0.5 dia |
| QA-020 | PWA: instalar, abrir standalone, navegar | P2 | 0.5 dia |

**Subtotal: ~9.5 dias**

---

### Capa 3: RLS Validation

| ID | Test | Prioridad | Esfuerzo |
|----|------|-----------|----------|
| QA-021 | Alumno no puede ver datos de otro alumno (mismo coach) | P0 | 1 dia |
| QA-022 | Alumno no puede ver datos de alumno de otro coach | P0 | 0.5 dia |
| QA-023 | Coach solo ve sus propios alumnos | P0 | 0.5 dia |
| QA-024 | Coach no puede acceder a alumnos de otro coach | P0 | 0.5 dia |
| QA-025 | Alumno no puede mutar datos de otro alumno | P0 | 1 dia |
| QA-026 | Validar RLS en todas las 24 tablas (matrix) | P1 | 2 dias |
| QA-027 | Test con service_role vs anon key vs user JWT | P1 | 1 dia |

**Subtotal: ~6.5 dias**

---

### Capa 4: Device Testing Matrix

| Dispositivo | OS | Browser | Prioridad |
|------------|-----|---------|-----------|
| iPhone 14/15/16 | iOS 17+ | Safari | P0 |
| iPhone SE | iOS 17+ | Safari | P1 |
| Samsung Galaxy S23+ | Android 14+ | Chrome | P0 |
| Pixel 7 | Android 14+ | Chrome | P1 |
| iPad Air | iPadOS 17+ | Safari | P2 |
| Desktop Mac | macOS | Chrome, Safari | P0 |
| Desktop Windows | Windows 11 | Chrome, Edge | P1 |

**Checklist por dispositivo:**
- [ ] Login coach + alumno
- [ ] Dashboard loads correctly
- [ ] Workout execution (scroll, timer, log set)
- [ ] Check-in wizard (fotos con camara)
- [ ] Nutrition toggle
- [ ] PWA install + standalone
- [ ] Safe area (notch, Dynamic Island)
- [ ] Dark mode correct
- [ ] Pull to refresh
- [ ] Keyboard handling (inputs no cubiertos)

---

### Capa 5: Performance Benchmarks

| Metrica | Target | Herramienta |
|---------|--------|-------------|
| LCP (landing) | < 2.5s | Lighthouse |
| FID (dashboard) | < 100ms | Lighthouse |
| CLS | < 0.1 | Lighthouse |
| TTI (dashboard alumno) | < 3s | Lighthouse |
| Bundle size (main) | < 300KB gzipped | Bundle analyzer |
| Supabase query time (p95) | < 200ms | Supabase dashboard |

---

# PARTE 5: INFRAESTRUCTURA, DEVOPS Y SEGURIDAD

## 5.1 CI/CD Pipeline

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| OPS-001 | Setup GitHub Actions: lint + type-check on PR | P0 | 0.5 dia |
| OPS-002 | GitHub Actions: run Vitest on PR | P0 | 0.5 dia |
| OPS-003 | GitHub Actions: run Playwright on PR (headless) | P1 | 1 dia |
| OPS-004 | Vercel preview deployments por PR (ya existe si esta en Vercel) | P0 | 0.5 dia |
| OPS-005 | Branch protection: require passing CI + 1 review | P1 | 15 min |
| OPS-006 | Semantic versioning + changelog automatico | P2 | 0.5 dia |
| OPS-007 | Deploy automatico a staging en merge a `develop` | P1 | 0.5 dia |
| OPS-008 | Deploy a produccion solo en merge a `main` con approval | P1 | 0.5 dia |

**Subtotal: ~4 dias**

---

## 5.2 Environment Management

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| OPS-009 | Crear `.env.example` completo | P0 | 15 min |
| OPS-010 | Documentar todas las variables en README | P0 | 30 min |
| OPS-011 | Setup Supabase proyecto staging (separado de produccion) | P1 | 1 dia |
| OPS-012 | Seed data para desarrollo local | P1 | 1 dia |
| OPS-013 | Script de setup local (`npm run setup`) | P2 | 0.5 dia |

**Subtotal: ~3 dias**

---

## 5.3 Supabase Migration Workflow

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| OPS-014 | `supabase db pull` — exportar schema completo | P0 | 0.5 dia |
| OPS-015 | Documentar workflow: `supabase migration new` → edit → `supabase db push` | P0 | 0.5 dia |
| OPS-016 | Agregar migration check a CI (schema diff) | P2 | 1 dia |
| OPS-017 | Backup automatico de Supabase (Point-in-Time Recovery) | P1 | 0.5 dia |
| OPS-018 | Script de reset local: drop + recreate + seed | P2 | 0.5 dia |

**Subtotal: ~3 dias**

---

## 5.4 Storage y CDN

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| OPS-019 | Audit Storage buckets: permisos, RLS, limites de tamano | P1 | 0.5 dia |
| OPS-020 | Configurar transformaciones de imagen (thumbnails en Storage) | P2 | 0.5 dia |
| OPS-021 | CDN para assets estaticos (logos, GIFs ejercicios) | P2 | 1 dia |
| OPS-022 | Cleanup policy: eliminar fotos huerfanas de check-ins borrados | P2 | 0.5 dia |
| OPS-023 | Limites de upload: maximo 10MB por archivo, 50MB total por check-in | P1 | 0.5 dia |

**Subtotal: ~3 dias**

---

## 5.5 Seguridad

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| SEC-001 | Audit completo de RLS policies en las 24 tablas | P0 | 2 dias |
| SEC-002 | Rate limiting en auth endpoints (login, register, forgot-password) | P0 | 1 dia |
| SEC-003 | Rate limiting en server actions criticas (pagos) | P0 | 0.5 dia |
| SEC-004 | CORS configuracion correcta (solo dominios propios) | P1 | 0.5 dia |
| SEC-005 | CSP headers (Content-Security-Policy) | P2 | 1 dia |
| SEC-006 | Sanitizacion de inputs (XSS prevention) | P1 | 1 dia |
| SEC-007 | Audit de secrets: verificar que no hay API keys en codigo | P0 | 0.5 dia |
| SEC-008 | Supabase: desactivar signup publico si no se necesita | P0 | 15 min |
| SEC-009 | HTTPS enforcement (Vercel lo hace por defecto) | P0 | Verificar |
| SEC-010 | Session timeout configuration | P1 | 0.5 dia |
| SEC-011 | Logging de eventos de seguridad (login fallido, cambio password) | P2 | 1 dia |
| SEC-012 | Penetration testing basico (OWASP top 10 checklist) | P1 | 2 dias |

**Subtotal: ~10.5 dias**

---

# PARTE 6: CRECIMIENTO Y NEGOCIO

## 6.1 Estrategia de Monetizacion

### Modelo de Precios (propuesta)

| Tier | Alumnos | Precio CLP/mes | Features |
|------|---------|----------------|----------|
| Starter | 1–10 | 14.990 | Rutinas, ejercicios, check-ins basico |
| Pro | 11–25 | 24.990 | + Nutricion, branding custom, export PDF |
| Elite | 26–50 | 39.990 | + Attention scores, analytics avanzados |
| Scale | 51–100 | 59.990 | + Prioridad soporte, multi-programa |
| Enterprise | 101–200 | 89.990 | + API acceso, soporte dedicado |

**Trial:** 14 dias gratis, todos los features (para que prueben lo premium).

### Tareas de Monetizacion

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| BIZ-001 | Validar precios con 5 coaches potenciales (encuesta/entrevista) | P0 | 2 dias |
| BIZ-002 | Definir features por tier (feature matrix final) | P0 | 1 dia |
| BIZ-003 | Crear landing page de precios con calculator ("cuantos alumnos tienes?") | P1 | 1 dia |
| BIZ-004 | Configurar MercadoPago con tiers reales | P0 | 1 dia |
| BIZ-005 | Crear flujo de upgrade in-app (mostrar que gana al subir de tier) | P1 | 1 dia |
| BIZ-006 | Implementar descuento anual (paga 10, lleva 12) | P2 | 0.5 dia |
| BIZ-007 | Programa de referidos: coach refiere coach, 1 mes gratis | P2 | 2 dias |

**Subtotal: ~8.5 dias**

---

## 6.2 Adquisicion de Coaches

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| GRO-001 | Identificar 50 coaches target en Instagram/TikTok Chile | P0 | 2 dias |
| GRO-002 | Crear video demo de la plataforma (2 min) | P0 | 2 dias |
| GRO-003 | Landing page con video embedded + CTA de trial | P0 | 0.5 dia |
| GRO-004 | Outreach personalizado a coaches (DM + email) | P0 | Ongoing |
| GRO-005 | Crear cuenta Instagram @eva.fitness.app | P1 | 0.5 dia |
| GRO-006 | Content plan: 3 posts/semana mostrando features | P1 | Ongoing |
| GRO-007 | Partnership con gyms/boxes para distribucion | P2 | Ongoing |
| GRO-008 | Webinar "Como profesionalizar tu coaching con tecnologia" | P2 | 2 dias |
| GRO-009 | SEO: blog con articulos para coaches (programacion, nutricion, negocio) | P2 | Ongoing |
| GRO-010 | Google Ads: keywords "app para personal trainer", "software gym" | P2 | 1 dia setup |

---

## 6.3 Retencion de Coaches

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| RET-001 | Onboarding guiado para coach nuevo (tutorial interactivo) | P1 | 3 dias |
| RET-002 | Email drip: dias 1, 3, 7, 14 post-registro con tips de uso | P1 | 1 dia |
| RET-003 | Health score del coach: alumnos activos, uso de features, compliance | P2 | 2 dias |
| RET-004 | Alerta interna si coach no usa la app por 7 dias (para outreach manual) | P1 | 0.5 dia |
| RET-005 | Feature request system: coaches pueden votar por features | P2 | 1 dia |
| RET-006 | Roadmap publico (show que estas construyendo activamente) | P2 | 0.5 dia |
| RET-007 | Exit survey cuando coach cancela | P1 | 0.5 dia |

---

## 6.4 Metricas Framework

### North Star Metric
**Weekly Active Coaches** (coaches que loguean al menos 1 vez por semana)

### Metricas por funnel

| Stage | Metrica | Target Fase 1 |
|-------|---------|---------------|
| Awareness | Visitas landing/mes | 500 |
| Acquisition | Registros/mes | 20 |
| Activation | Coach crea primer programa en <24h | 60% |
| Revenue | Conversion trial → pago | 30% |
| Retention | Coach activo mes 2 | 60% |
| Referral | Coaches referidos / coach activo | 0.1 |

### Metricas de alumno (engagement del producto)

| Metrica | Target |
|---------|--------|
| Workouts logueados / alumno / semana | >2.5 |
| Check-ins / alumno / mes | >3 |
| Nutrition tracking rate (comidas completadas / asignadas) | >50% |
| DAU/MAU ratio (alumnos) | >30% |

---

## 6.5 ASO (App Store Optimization) — Futuro

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| ASO-001 | Definir keywords target (App Store + Play Store) | P3 | 1 dia |
| ASO-002 | Screenshots profesionales (6 por plataforma) | P3 | 2 dias |
| ASO-003 | Video preview de la app (30 seg) | P3 | 2 dias |
| ASO-004 | Descripcion optimizada con keywords | P3 | 0.5 dia |
| ASO-005 | Solicitar reviews de beta testers | P3 | 0.5 dia |

---

# PARTE 7: LEGAL Y COMPLIANCE

## 7.1 Terminos y Condiciones

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| LEG-001 | Revisar y actualizar `/legal` — terminos de servicio actuales | P0 | 1 dia |
| LEG-002 | Agregar clausula de suscripcion y pagos recurrentes | P0 | 0.5 dia |
| LEG-003 | Agregar clausula de cancelacion y reembolsos | P0 | 0.5 dia |
| LEG-004 | Agregar clausula de uso aceptable (limites por tier) | P1 | 0.5 dia |
| LEG-005 | Checkbox obligatorio de aceptacion en registro | P0 | 0.5 dia |

---

## 7.2 Politica de Privacidad

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| LEG-006 | Revisar y actualizar `/privacidad` | P0 | 1 dia |
| LEG-007 | Documentar datos recopilados por tipo de usuario (coach vs alumno) | P0 | 0.5 dia |
| LEG-008 | Documentar uso de Supabase/Vercel como procesadores de datos | P1 | 0.5 dia |
| LEG-009 | Agregar seccion de cookies y tracking | P1 | 0.5 dia |
| LEG-010 | Derecho a eliminacion de datos (cuenta + datos asociados) | P1 | 1 dia |

---

## 7.3 Proteccion de Datos (Chile — Ley 19.628 y reforma)

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| LEG-011 | Revisar compliance con Ley 19.628 (datos personales Chile) | P1 | 1 dia |
| LEG-012 | Implementar mecanismo de consentimiento explicito para datos de salud | P0 | 1 dia |
| LEG-013 | Data retention policy: cuanto tiempo se guardan fotos, logs, check-ins | P1 | 0.5 dia |
| LEG-014 | Right to data portability: exportar datos del alumno en formato estandar | P2 | 2 dias |
| LEG-015 | Data Processing Agreement (DPA) para coaches como controladores | P2 | 1 dia |

---

## 7.4 Datos de Salud

| ID | Tarea | Prioridad | Esfuerzo |
|----|-------|-----------|----------|
| LEG-016 | Disclaimer: "EVA no es un dispositivo medico ni sustituye consejo medico" | P0 | 15 min |
| LEG-017 | Disclaimer visible en check-in y onboarding donde se recogen datos de salud | P0 | 30 min |
| LEG-018 | Asegurar que fotos de check-in estan protegidas (Storage RLS, no publicas) | P0 | 0.5 dia |
| LEG-019 | Logging de acceso a datos sensibles (quien vio fotos, cuando) | P2 | 1 dia |

---

# PARTE 8: RESUMEN DE ESFUERZO Y TIMELINE

## Esfuerzo por Fase

| Fase | Descripcion | Esfuerzo estimado | Periodo |
|------|-------------|-------------------|---------|
| Fase 1 | Revenue MVP (Pagos + Landing + Quick Wins + QA basico) | ~35 dias | Q2 2026 |
| Fase 2 | Core Loop Polish (Dashboard coach, Mi Marca, Workout, Check-in) | ~35 dias | Q2-Q3 2026 |
| Fase 3 | Retencion (Notificaciones, Gamificacion, Onboarding, i18n, Panel CEO) | ~40 dias | Q3 2026 |
| Fase 4 | Scale (Performance, PWA, App Nativa) | ~25 dias | Q4 2026 |

**Total estimado: ~135 dias de desarrollo**

---

## Esfuerzo por Perspectiva

| Perspectiva | Dias estimados |
|-------------|---------------|
| Engineering (Frontend + Backend) | ~95 dias |
| QA / Testing | ~22 dias |
| DevOps / Infra / Security | ~20 dias |
| UX / Design | ~12 dias |
| Growth / Business | ~10 dias |
| Legal | ~10 dias |

---

## Orden de Ejecucion Recomendado (Sprint by Sprint)

### Sprint 1 (2 semanas): Foundation
- ENG-026 a ENG-034 (Quick Wins — 3 horas)
- OPS-009, OPS-010 (.env.example, README)
- OPS-014, OPS-015 (Supabase migrations al repo)
- SEC-007, SEC-008 (Audit secrets, desactivar signup)
- LEG-016, LEG-017 (Disclaimers de salud)
- QA-006, QA-007 (Tests de auth actions)

### Sprint 2 (2 semanas): Pagos Core
- ENG-001 a ENG-003 (Tiers + modelo datos)
- ENG-004 a ENG-010 (MercadoPago integration)
- LEG-001 a LEG-005 (Terminos actualizados)
- BIZ-001, BIZ-002 (Validar precios, feature matrix)

### Sprint 3 (2 semanas): Registro + Landing
- ENG-011 a ENG-016 (Registro con pago + gestion suscripcion)
- ENG-020 a ENG-025 (Landing/Pricing alignment)
- ENG-017 a ENG-019 (Control acceso por tier)
- QA-011, QA-012 (E2E registro + login + crear alumno)
- LEG-006, LEG-007 (Privacidad actualizada)

### Sprint 4 (2 semanas): QA + Launch Prep
- QA-021 a QA-027 (RLS validation completa)
- SEC-001 a SEC-003 (Security audit critico)
- OPS-001 a OPS-004 (CI/CD basico)
- QA-014, QA-015 (E2E workout + check-in)
- ENG-119, ENG-120 (Lighthouse)
- GRO-002, GRO-003 (Video demo + landing con video)

### Sprint 5 (2 semanas): BETA LAUNCH
- Fix bugs encontrados en QA
- GRO-001, GRO-004 (Outreach a coaches)
- BIZ-004 (MercadoPago produccion)
- RET-001, RET-002 (Onboarding coach + email drip)
- Monitoreo y soporte

### Sprint 6+ (ongoing): Phase 2
- ENG-035 a ENG-044 (Dashboard coach rework)
- ENG-045 a ENG-050 (Mi Marca rework)
- ENG-051 a ENG-058 (Workout polish)
- ENG-059 a ENG-064 (Check-in enhancements)
- ENG-071 a ENG-079 (Notificaciones)

---

## Total de Tareas

| Categoria | Cantidad |
|-----------|---------|
| Engineering (ENG-*) | 137 |
| QA (QA-*) | 27 |
| DevOps/Infra (OPS-*) | 18 |
| Security (SEC-*) | 12 |
| Design (DS-*) | 10 |
| Business (BIZ-*) | 7 |
| Growth (GRO-*) | 10 |
| Retention (RET-*) | 7 |
| Legal (LEG-*) | 19 |
| ASO (ASO-*) | 5 |
| **TOTAL** | **252 tareas** |

---

## Decision Log (para trackear decisiones de producto)

| # | Decision | Fecha | Contexto |
|---|----------|-------|----------|
| 1 | Moneda principal: CLP | Pendiente | Landing usa CLP, pricing USD. Resolver |
| 2 | Payment provider: MercadoPago vs Stripe | **MercadoPago activo** | Implementación REST en `src/lib/payments/providers/mercadopago.ts`; Stripe stub |
| 3 | Trial: 14 dias con todos los features | Propuesta | Maximizar activation |
| 4 | Extensiones nutricion (meals, recipes, barcode): fuera de scope | 2026-04-09 | Baja prioridad hasta nueva decision |
| 5 | QA RLS formal: cuando TOTAL >90% | 2026-04-10 | Antes se valida informalmente |
| 6 | App nativa: evaluar despues de 50 coaches | Propuesta | PWA primero |
| 7 | `trialing` en BD + webhook prod | 2026-04-11 | CHECK constraint ampliado; token webhook obligatorio en producción |
| 8 | Capabilities por tier | 2026-04-11 | Misma feature set; diferenciación por `max_clients` (`TIER_CAPABILITIES` documentado en código) |

---

> **Este documento es vivo.** Actualizar conforme se tomen decisiones, se completen tareas, o cambien prioridades. Cada sprint deberia revisar y priorizar las tareas pendientes.
