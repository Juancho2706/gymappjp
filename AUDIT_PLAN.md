# EVA — Plan de Auditoría Pre-Enterprise + React Native

> Fecha: 2026-05-15
> Objetivo: Auditar EVA por 20 roles antes de 2 cambios mayores:
> 1. **Tier Enterprise** — capa Org multi-coach, SSO/SAML/SCIM, RBAC, audit logs, custom domain.
> 2. **React Native iOS/Android** — apps nativas compartiendo backend.
> Estado contexto: validado contra fuentes web May 2026 (ver sección final).

## Implicaciones arquitectónicas de los 2 cambios

**React Native — decisiones YA TOMADAS (no reabrir):**
- Stack: **Expo SDK 53 + Expo Router v4** (managed workflow, EAS Build en nube)
- Modelo distribución: **aggregator app "EVA"** (Apple Guideline 4.2.6) — una app, multi-coach dentro
- Backend: **mismo Supabase** — mismas tablas, mismas RLS policies, mismas credenciales
- Auth storage: **AsyncStorage** + `detectSessionInUrl: false` (no localStorage en RN)
- Pagos: **Linking.openURL → browser externo** SIEMPRE — nunca checkout in-app (evita 30% Apple/Google)
- Styling: **NativeWind v4** (misma sintaxis Tailwind que web)
- Token seguro: **expo-secure-store** (Keychain iOS / Keystore Android)
- CI/CD: **EAS Build** (30 builds/mes gratis) + **EAS Submit** a tiendas
- OTA: **Expo Updates** para cambios JS sin revisión tiendas
- Cuentas stores: **Guimel presta** Apple Developer ($99/año) + Google Play ($25 único) → costo EVA: $0
- Deep linking: **Universal Links iOS** + **App Links Android** (`/.well-known/apple-app-site-association` + `assetlinks.json`)
- White-label: **ThemeContext runtime** por coach slug (logo + primaryColor desde Supabase)
- Repo: **eva-mobile/** separado (o monorepo) consumiendo mismo Supabase sin duplicar
- Primera pantalla: selector de coach por **`invite_code`** (ej: JUAN24) o link `/c/[slug]`
- Roadmap ya definido: **8 semanas hasta submission** a tiendas

**Pendientes críticos RN antes de auditoría:**
- `invite_code` column en tabla `coaches` — migración requerida
- `apple-app-site-association` + `assetlinks.json` en `/.well-known/` de eva-app.cl
- `PrivacyInfo.xcprivacy` (privacy manifest iOS 17+)
- App Privacy Labels en App Store Connect
- Data Safety Form en Google Play Console
- Screenshots iPhone 16 Pro Max 6.9" (mínimo 3, mostrar múltiples coaches)
- Estado offline: mensaje descriptivo, no pantalla en blanco (bloqueador Apple)
- Auditoría Guimel pre-submission (commitment confirmado)
- Migrar cuenta a nombre EVA cuando haya revenue (~$99 USD) — riesgo: si Guimel no renueva, apps caen

**Enterprise obliga ahora:**
- Modelo datos: tabla `organizations` sobre `coaches`, RLS reescrita por org + coach
- SSO: SAML 2.0 + OIDC (WorkOS / Auth0 / Stytch) — Supabase Auth no cubre SAML enterprise out-of-box
- SCIM provisioning (auto-provisioning usuarios desde IdP cliente)
- RBAC granular: org_admin / coach_admin / coach / client / read_only_auditor
- Audit log inmutable (append-only, exportable, retention configurable)
- Custom domain + SSL automatizado (gym.cliente.com white-label completo)
- SLA contractual + status page + uptime histórico
- Data residency opcional (algunos enterprise piden datos en región específica)

**Regla de oro:** cualquier feature nueva ahora debe pensarse "¿esto rompe RN o Enterprise?" antes de mergear.

---

## Estrategia

Auditar **por capas**, no menú-por-menú. Tres pasadas:

1. **Fase 1 — Sistémica:** roles transversales detectan bloqueadores estructurales (security, fintech, legal, infra). No tocar UI todavía.
2. **Fase 2 — Journeys producto:** roles producto/UX/eng auditan flujos end-to-end, no pantallas aisladas.
3. **Fase 3 — GTM Enterprise:** roles comerciales preparan motion enterprise cuando el producto está sólido.

**Cómo usar:**
- Una sesión nueva de Claude Code por rol (contexto limpio).
- Tras cada auditoría: consolida hallazgos P0/P1 en backlog único.
- No implementes durante la auditoría — solo recolecta.
- Re-audita Security / Fintech / Legal tras los fixes y antes del lanzamiento enterprise.

**Ritmo sugerido:** 2 roles/semana → 10 semanas auditoría (20 roles) + 6-8 semanas fixes P0/P1 → Enterprise + RN.

## Orden recomendado (revisado para Enterprise + RN)

**Semanas 1-2 (foundations):** Software Architect (#1) → Enterprise Solutions Architect (#19) → Mobile Engineer RN (#20).
Estos 3 primero porque sus decisiones (modelo datos org, API layer, monorepo) condicionan todo lo demás. Sin esto, los otros roles auditan sobre arquitectura que va a cambiar.

**Semanas 3-4:** Security (#2) → Backend Eng (#11) → Fintech MP (#3).
**Semanas 5-6:** Legal Chile (#6) → DevOps (#4) → SRE (#5).
**Semanas 7-8:** Frontend (#10) → QA (#12) → UX (#9) → PM (#8).
**Semana 9:** Data (#13) → FinOps (#7).
**Semana 10:** GTM (Sales #14, SDR #15, CSM #16, Implementation #17, Marketing #18).

---

# FASE 1 — Sistémica (bloqueadores)

## 1. Software Architect

```
Actúa como Software Architect senior auditando EVA (B2B2C white-label SaaS, Next.js 15 App Router + Supabase).

Contexto crítico: próximamente capa Enterprise (org > coach > client, multi-tenant pesado) + apps React Native iOS/Android compartiendo backend.

Scope:
- Estructura módulos (/coach, /c/[coach_slug]), patrón _data/_actions/_components
- Acoplamientos entre coach app y client app
- Deuda técnica estructural
- Escalabilidad pre-enterprise (modelo organizations sobre coaches, RLS reescrita)
- Boundaries RSC vs Client Components
- Lógica de negocio reusable React Native (qué está atada a Next.js vs portable)
- Server Actions vs API layer (RN no puede consumir Server Actions directo)
- Monorepo readiness — packages compartidos (types, Zod schemas, domain logic)
- Auth strategy multi-cliente (web + native) — refresh token, deep links
- Modelo permisos extensible a RBAC granular (org_admin/coach_admin/coach/client/auditor)
- Audit log architecture (append-only, qué tabla, particionado)
- Custom domain per-org strategy (multi-tenant SSL automation)
- Data residency considerations (Supabase multi-region viable?)

Output tabla markdown:
| Severidad (P0/P1/P2) | Hallazgo | Archivo:línea | Impacto Enterprise | Impacto RN | Fix sugerido | Effort (S/M/L) |

No toques código. Solo lee y reporta. Prioriza top 20 hallazgos. Marca cuáles son bloqueadores Enterprise vs RN vs ambos.
```

## 2. Security Engineer (SecOps)

```
Actúa como Security Engineer auditando EVA. Stack: Next.js 15, Supabase (RLS), MercadoPago, Upstash.

Audita:
- RLS policies todas tablas (24 con RLS) — ¿bypass posible?
- Server Actions — autorización, input validation Zod, deserialization (CVE-2026-23870 RSC)
- CVE-2025-29927 middleware bypass — confirmar versión Next ≥ 15.2.3
- Secrets management (.env, service role key exposure)
- OWASP Top 10 2025 aplicado (incluye LLM Top 10 si hay IA)
- Headers seguridad (CSP, HSTS, X-Frame, Permissions-Policy)
- MercadoPago webhook HMAC verification
- Rate limiting endpoints críticos (Upstash)
- Session management Supabase SSR
- File uploads (Storage) — MIME validation, size limits, AV scan
- SQL injection vectors en RPCs (22 funciones) — security definer vs invoker
- React Taint APIs uso en datos sensibles
- Data Access Layer — env/db no importado fuera de DAL
- Multi-tenant isolation (Enterprise): cross-org data leak vectors, RLS por org_id
- SSO/SAML readiness — flows seguros, JIT provisioning, SCIM token storage
- Audit log tamper-proof (append-only, hash chain opcional)
- API auth RN: anon key en EXPO_PUBLIC_* — aceptable con RLS pero auditar exposición
- Token storage RN: AsyncStorage (session) vs expo-secure-store (refresh token) — ¿división correcta?
- Refresh token rotation — ¿qué pasa con token offline cuando RN no tiene red?
- Deep link hijacking (Universal Links iOS verificado con apple-app-site-association firmado, App Links Android con sha256)
- `invite_code` en coaches: fuerza bruta posible si corto (JUAN24) — rate limit en RLS/API
- Push token storage (push_tokens table) — RLS: solo usuario propio puede upsert
- Privacy manifest iOS 17+ / Data Safety Android — qué APIs usa EVA RN (NSURLSession, UserDefaults, Location si hay)
- MercadoPago via Linking.openURL — confirmar abre Safari/Chrome externo, NO WebView/in-app browser (bloqueador Apple)

Output:
| Severidad CVSS | Vulnerabilidad | Ubicación | Vector ataque | Mitigación | PoC posible? |

Top 20 hallazgos. P0 = exploit inmediato.
```

## 3. Fintech / Integrations (MercadoPago)

```
Actúa como Fintech Integrations Specialist. Audita integración MercadoPago en EVA.

Contexto: MP pre-approvals (suscripciones recurrentes CLP), único gateway Chile recurring.

Audita:
- Flow completo: creación pre-approval → autorización → cobro recurrente → cancelación
- Webhook handler — idempotencia, HMAC, retry logic, dedup por event id
- Reconciliación pagos (DB vs MP) — job periódico
- Manejo estados: pending/authorized/paused/cancelled
- Edge cases: tarjeta vencida, fondos insuficientes, downgrade mid-cycle, prorrateo
- Refunds y disputas (chargebacks)
- Logs auditoría transacciones (immutable trail)
- Manejo timezones (MP UTC, Chile UTC-3/-4, DST)
- Modo enterprise: billing manual (link MP / transferencia) — flow paralelo
- Boleta electrónica SII — emisión automática post-cobro

Output:
| Severidad | Issue | Archivo | Riesgo financiero | Fix |

Top 15. Incluye gaps reconciliación.
```

## 4. DevOps / Infrastructure

```
Actúa como DevOps Engineer auditando EVA.

Audita:
- CI/CD pipeline — typecheck, lint, test, e2e gates
- Build process Next.js — tiempo, cache, bundle size
- Deployment strategy (Vercel) — preview, rollback, canary, atomic
- Env management — secrets rotation, staging vs prod separation
- Database migrations workflow (supabase/migrations) — forward-only? reversible?
- Branching strategy git + protección branch
- Dependencias — npm audit, Snyk/Dependabot, outdated
- Edge functions Supabase deployment
- PWA service worker versioning (public/sw.js manual) — cache busting
- Infra as Code — Terraform/Pulumi para enterprise multi-region
- Monorepo readiness — eva-mobile/ mismo repo vs repo separado (decisión pendiente)
- EAS Build pipeline: development → preview → production profiles (eas.json ya diseñado)
- EAS Submit automation: App Store Connect + Play Console
- OTA updates: Expo Updates `eas update --branch production` — ¿gating por version range?
- /.well-known/ archivos en Vercel: apple-app-site-association + assetlinks.json — route config
- Guimel accounts dependency: proceso documentado para acceso + rollback si cuenta cae
- 30 builds/mes EAS gratis — tracking uso, cuándo escalar a EAS Pro ($99/mes)
- ENV management móvil: EXPO_PUBLIC_* vars — no `.env` sino `eas.json` secrets
- Custom domain automation per-org (Vercel domains API o Cloudflare for SaaS)
- Multi-region Supabase / read replicas para enterprise data residency

Output:
| Severidad | Gap | Riesgo operacional | Bloquea Enterprise/RN | Fix | Tooling sugerido |

Top 15 hallazgos.
```

## 5. SRE (observabilidad + reliability)

```
Actúa como Site Reliability Engineer auditando EVA pre-enterprise.

Audita:
- Logging — qué se loggea, dónde, retención, PII redacted
- Error tracking (Sentry/equivalente) — source maps prod
- Métricas APM (latencia, throughput, errores, Core Web Vitals)
- Uptime monitoring (synthetic checks journeys críticos)
- SLOs/SLAs definidos (enterprise lo exigirá: 99.9% típico)
- Alerting — qué dispara qué, on-call rotation
- Backups Supabase — frecuencia, restore tested (game day)
- Disaster recovery plan + RTO/RPO documentado
- Runbooks incidentes + postmortem template
- Performance budgets (TTI, LCP, INP < 200ms)
- Database query performance (pg_stat_statements, slow queries, índices)
- Status page público

Output:
| Severidad | Gap reliability | MTTR impact | Fix | Herramienta |

Top 15.
```

## 6. Legal & Compliance Chile

```
Actúa como Legal Counsel especialista Chile auditando EVA (SaaS fitness B2B2C, recolecta datos salud/biométricos).

Audita compliance:
- Ley 19.628 (vigente) protección datos personales Chile
- Ley 21.719 (vigencia 2026-12-01) — nueva Agencia Protección Datos, ARCO+P, notificación brechas 72h, multas hasta 20.000 UTM o 4% ingresos
- Datos sensibles salud — base legal tratamiento explícita
- Términos servicio y política privacidad — presentes? actualizados ley nueva?
- Consentimiento explícito granular (no checkbox global, no dark patterns)
- DPA con Supabase (datos en US), MercadoPago, Vercel, Upstash — transferencias internacionales con garantías
- Registro actividades tratamiento (RAT) obligatorio
- DPO designado si aplica
- Boleta electrónica SII — facturación enterprise
- Ley protección consumidor (SERNAC) — cancelaciones, refunds, Ley Pro Consumidor
- Subprocessors disclosure público
- Derecho ARCO+P (acceso, rectificación, cancelación, oposición, portabilidad)
- Retención datos post-cancelación + derecho al olvido
- Menores edad — usuarios clientes coaches (consentimiento parental)
- Excepción PYME diciembre 2026 - 2027 (amonestación, no multa)

Output:
| Riesgo legal (Alto/Medio/Bajo) | Gap compliance | Ley/Artículo | Multa potencial | Acción requerida | Plazo (antes 2026-12-01) |

Top 15. Marca cuáles bloquean venta enterprise.
```

## 7. FinOps

```
Actúa como FinOps Specialist auditando costos EVA.

Audita:
- Costos Supabase Pro ($25 base + overages DB/Storage/Bandwidth/Compute/Egress)
- Costos Vercel (compute, bandwidth, ISR, image optimization)
- MercadoPago fees (% transacción + IVA fee)
- Upstash Redis (requests + bandwidth)
- Dominios, email transaccional (Resend/SES)
- Unit economics: CAC, costo servir cliente/mes, margen bruto
- Queries DB caras (full scans, N+1) — invisible cost driver
- Imágenes/storage — optimización, CDN Cloudflare frontal (cache hits)
- Edge function invocations + duration
- Proyección costos a 100/1000/10000 coaches
- Tier enterprise — pricing piso vs costo real servir
- Cache layer (Cloudflare free tier delante de Vercel)
- Tagging recursos para chargeback per-tenant

Output:
| Categoría | Costo actual estimado | Costo @ 10x scale | Optimización | Ahorro % |

Top 15 ineficiencias.
```

---

# FASE 2 — Journeys producto

## 8. Product Manager

```
Actúa como PM senior auditando EVA producto.

Para cada journey crítico evalúa friction, drop-off risk, missing features, competencia (Trainerize, TrueCoach, Everfit, Hevy Coach):

Journeys:
1. Coach signup → onboarding → primer cliente invitado
2. Coach crea programa workout → asigna cliente
3. Cliente ejecuta workout → logs → completa
4. Cliente check-in semanal → coach review
5. Nutrición: plan → log diario → adherencia
6. Billing coach: trial → conversión → renovación
7. White-label setup: branding → PWA cliente instalada

Output por journey:
| Step | Friction observado | Severidad UX | Feature gap vs competencia | Hipótesis fix |

Cierra con: top 5 features que faltan para enterprise-ready (SSO, SCIM, audit logs, RBAC, multi-coach org).
```

## 9. UX/UI Designer

```
Actúa como UX/UI Designer senior auditando EVA (mobile-first PWA, coach desktop + client mobile).

Audita:
- Heurísticas Nielsen 10 — aplicadas en flujos críticos
- Accesibilidad WCAG 2.2 AA (contraste, focus, ARIA, keyboard nav, screen reader)
- Mobile viewport (h-dvh, safe areas, touch targets ≥44px)
- Consistencia design system (shadcn + base-ui + Radix)
- Dark mode parity
- Loading/empty/error states todos los flows
- Microcopy claridad (español Chile, no spanglish)
- Onboarding coach + onboarding cliente (white-label)
- Forms — validación inline, errores claros, autocomplete
- Confirmaciones acciones destructivas

Output:
| Pantalla/Flow | Issue UX | Heurística violada | Severidad | Fix |

Top 20. Marca cuáles afectan conversión trial→paid.
```

## 10. Senior Frontend Engineer

```
Actúa como Senior Frontend Engineer auditando EVA (Next.js 15 App Router, React 19, Tailwind v4).

Audita:
- RSC vs Client boundaries — uso correcto 'use client'
- Server Actions — patrón, error handling, useActionState, validación Zod
- Estado: useState/useReducer/useTransition/useOptimistic/Context — uso idiomático
- React.cache deduplication en _data/ (no unstable_cache con Supabase SSR)
- revalidatePath uso correcto post-mutation
- Bundle size — code splitting, dynamic imports, tree-shaking
- Imágenes — next/image en todos lados (regla CLAUDE.md), zero <img>
- Tailwind v4 @theme — sin tailwind.config legacy
- Forms — react-hook-form + Zod v4 ambos lados
- @dnd-kit touch behavior
- PWA service worker — cache strategy, update flow, skipWaiting
- i18n LanguageContext
- Suspense boundaries + streaming
- React Taint APIs en datos sensibles
- React 19.2.4+ (post deserialization CVE)
- Business logic portabilidad — qué se puede extraer a package compartido con React Native
- Componentes 100% Next.js-bound (next/link, next/image, next/navigation) vs lógica pura
- Forms validation Zod schemas — extraíbles a package shared
- Estado global Context APIs — compatible RN o requiere refactor
- API client abstraction (preparar fetch wrapper que sirva web + native)

Output:
| Severidad | Issue | Archivo:línea | Anti-patrón | Bloquea RN? | Fix |

Top 20.
```

## 11. Senior Backend Engineer

```
Actúa como Senior Backend Engineer auditando EVA backend (Supabase Postgres + RLS + 22 RPCs + Server Actions Next.js).

Audita:
- Schema 26 tablas — normalización, índices, FKs, constraints
- RLS policies — performance (índices en columnas RLS, subquery direction reversed, wrap auth.uid() en select para initPlan cache), correctness
- RPCs 22 funciones — security definer vs invoker, SQL injection, search_path
- Migrations — orden, reversibilidad, data migrations idempotentes
- N+1 queries en RSC fetches
- SELECT * en tablas catálogo (regla CLAUDE.md prohíbe)
- Promise.all parallel queries — uso real
- Transacciones — atomicidad operaciones multi-tabla
- Soft delete vs hard delete consistency
- Timestamps timezone handling (UTC en DB, conversión cliente)
- Database.types.ts sync con schema real
- Multiple permissive policies advisor (Supabase lint 0006)
- Explicit filters en queries para usar índices aunque RLS los duplique
- Modelo Enterprise: tabla organizations sobre coaches, FK cascade, RLS por org
- RN acceso directo Supabase (anon key) — RLS es única barrera, sin Server Actions intermedias
- Migración requerida RN: `invite_code` en tabla `coaches` (único, generado, JUAN24 style)
- Migración requerida RN: tabla `push_tokens` (user_id, device_id, token, platform, created_at)
- Migración requerida RN: columna `device_tokens` RLS — solo user propio puede leer/escribir
- API layer: Server Actions Next.js NO accesibles desde RN — identificar cuáles necesitan endpoint alternativo
- Sync engine offline-first (Supabase Realtime + local cache) consideración
- Soft delete vs anonimización (Ley 21.719 + retention enterprise)
- Particionado audit_logs (volumen alto enterprise)
- Connection pooling Supavisor para scale RN + web combinado

Output:
| Severidad | Issue | Ubicación | Performance impact | Bloquea Enterprise/RN | Fix |

Top 20.
```

## 12. QA Automation

```
Actúa como QA Automation Engineer auditando EVA.

Audita:
- Cobertura Vitest unit tests — % por módulo
- Playwright E2E — journeys cubiertos vs críticos
- Tests faltantes en flows críticos (billing, RLS, white-label, multi-tenant)
- Test data management — fixtures, seeds, factory pattern
- Flakiness — tests inestables
- CI integration tests + parallel sharding
- Visual regression (Chromatic/Percy)
- Performance tests (k6/Artillery, load, stress)
- Accessibility tests automated (axe-core)
- Mocking strategy — Supabase, MP
- RLS testing from client SDK, no desde SQL Editor (bypassea RLS)
- Contract tests webhooks MP

Output:
| Severidad | Gap testing | Journey/módulo | Riesgo regresión | Test propuesto | Tipo (unit/e2e/visual/perf/a11y) |

Top 20.

Cierra con: prioridad 10 tests E2E críticos a escribir antes enterprise.
```

## 13. Data Scientist / Analyst

```
Actúa como Data Analyst auditando capa analytics EVA.

Audita:
- Eventos trackeados — completitud journey funnel
- Schema analytics — tablas event-store o externa (PostHog/Mixpanel/Amplitude)
- Métricas producto: DAU/WAU/MAU, retention cohortes, adherencia workouts/nutrición
- Métricas negocio: MRR, churn, LTV, CAC payback, NRR/GRR
- Dashboards coaches — qué ven sus clientes
- Dashboard admin EVA — health negocio
- Datos faltantes para decisión enterprise pricing
- PII en analytics — anonimización, hash
- Data quality — nulls, duplicados, drift
- Data warehouse plan (cuando pasar de Postgres directo a BigQuery/ClickHouse)
- Reverse ETL para CRM/CS tooling

Output:
| Severidad | Gap data | Decisión bloqueada | Evento/métrica faltante | Implementación |

Top 15.
```

---

# FASE 3 — GTM Enterprise

## 14. Head of Sales (B2B Enterprise)

```
Actúa como Head of Sales B2B Enterprise auditando EVA pre-lanzamiento tier enterprise.

Contexto: EVA agrega tier enterprise para cadenas gym / boxes CrossFit / clínicas (multi-coach una org).

Audita/diseña:
- ICP enterprise — perfil cuenta ideal Chile/LATAM
- Pricing tiers — piso, seats, features gating (SSO, SCIM, audit log, RBAC, SLA)
- Diferenciador vs Trainerize/TrueCoach/Everfit
- Sales motion — PLG-assisted vs full sales-led
- Demo flow — qué mostrar primeros 15 min
- Objeciones típicas + respuestas
- Contratos — términos, SLAs exigibles, DPA template
- Procurement — qué pedirá compliance/IT cliente enterprise (SOC2 Type 1/2, pen test, security questionnaire)
- Ciclo venta esperado, deal size promedio
- Materiales sales: one-pager, deck, ROI calculator, security pack
- Framework qualifying: MEDDPICC (deals >$50K ACV, >5 stakeholders, ciclo >6 meses)

Output:
| Área | Estado actual | Gap | Prioridad lanzamiento | Owner |

Cierra con: 5 cosas a tener listas día 1 enterprise.
```

## 15. SDR

```
Actúa como SDR auditando capacidad outbound EVA enterprise.

Diseña:
- Lista 50 cuentas objetivo Chile (cadenas gym, boxes, clínicas deportivas, nutricionistas grupo, kinesiología)
- Buyer personas — quién decide, quién usa, quién paga (Economic Buyer MEDDPICC)
- Outbound sequences — email + LinkedIn + WhatsApp (Chile-friendly)
- Qualifying framework (MEDDPICC adaptado para deals enterprise, BANT solo deals <$25K)
- Pain points hipótesis por segmento
- CRM mínimo viable — stack sugerido budget startup (HubSpot Starter / Attio / Folk)
- Métricas SDR — meetings booked, SQL conversion, SAO rate
- Discovery call script con preguntas MEDDPICC

Output: plan outbound 90 días con KPIs semanales.
```

## 16. Customer Success Manager

```
Actúa como CSM diseñando función CS para EVA enterprise.

Diseña:
- Health score modelo — señales adherencia coaches, login frequency, NPS, soporte tickets
- Churn signals tempranos
- Expansion playbook — upsell seats, módulos premium
- Onboarding handoff sales→CS
- QBR template (Quarterly Business Review)
- Cadencia touchpoints por tier
- Self-serve resources (help center, videos, academia)
- Escalation matrix
- Métricas: GRR, NRR, NPS, CSAT, time-to-value, logo retention

Output: playbook CS 6 meses + stack tooling presupuesto startup.
```

## 17. Implementation Specialist (Onboarding)

```
Actúa como Implementation Specialist diseñando onboarding enterprise EVA.

Contexto: cadena gym con 10-50 coaches, cientos clientes, migrar desde Excel/Trainerize.

Diseña:
- Implementation playbook — semanas 1-4
- Data migration — desde competencia o Excel (importer + validación)
- White-label setup — branding, dominio, PWA, manifest
- Coach training — sesiones, materiales, certificación interna
- Go-live checklist
- Success criteria onboarding (definición "implementado")
- Soporte primeros 30 días (Slack Connect / Shared Channel)
- Handoff a CSM
- Time-to-first-value target (< 14 días)

Output:
| Fase | Actividades | Duración | Owner cliente | Owner EVA | Entregable |

Plan completo + riesgos típicos.
```

## 18. Marketing & Growth Lead

```
Actúa como Marketing & Growth Lead auditando posicionamiento EVA enterprise.

Audita:
- Landing actual — claim, value prop, social proof
- SEO técnico + content gaps
- Diferenciación mensaje vs Trainerize
- Funnel marketing — top/mid/bottom
- Casos uso documentados / case studies (al menos 3 logos)
- Estrategia contenido (blog, YouTube, IG coaches, TikTok)
- Comunidad — Discord/WhatsApp coaches
- Programa referidos coaches (PLG flywheel)
- PR Chile fitness/wellness
- Paid acquisition — viabilidad Meta/Google budget startup
- Trust page (security, privacy, status, changelog)

Output:
| Canal/Asset | Estado | Gap | ROI esperado | Prioridad Q | Inversión |

Top 10 acciones próximos 90 días.
```

---

# Roles adicionales (Enterprise + React Native)

## 19. Enterprise Solutions Architect

```
Actúa como Enterprise Solutions Architect diseñando la capa Enterprise sobre EVA actual.

Contexto: EVA hoy es coach → clients. Enterprise agrega organization → coaches → clients. Clientes objetivo: cadenas gym (10-50 coaches), franquicias, clínicas.

Audita/diseña:
- Modelo datos multi-tenant: organizations, organization_members, roles, permissions
- Migration path: cómo migrar coaches actuales standalone a estar dentro de orgs (o convivir)
- RLS reescrita: dos ejes (org_id AND coach_id) sin romper performance
- RBAC matriz: org_owner / org_admin / org_billing / coach_admin / coach / client / auditor (read-only)
- SSO/SAML 2.0: WorkOS vs Auth0 vs Stytch vs self-hosted (Supabase Auth no cubre SAML enterprise OOTB)
- SCIM 2.0 provisioning — auto creación/desactivación usuarios desde Okta/Azure AD
- Audit log: schema, retention, export (CSV/SIEM), inmutabilidad
- Custom domain per-org (gym.cliente.com) — Vercel Domains API / Cloudflare for SaaS, SSL auto
- White-label profundo: theming runtime, email templates, PWA manifest dinámico per-org
- Billing enterprise: invoice-based, NET 30/60, multi-seat, prorrateo, anual con descuento
- SLA contractual (99.9% típico) + status page público + uptime histórico
- Data residency: viable en Supabase? regiones disponibles, copia per-org
- Feature flags por org (gating premium modules)
- Sandbox/staging environment per-org (algunos enterprise lo piden)
- Bulk operations (import 500 clientes vía CSV, mass-assign programa)
- Reporting org-level (analytics agregada multi-coach)

Output:
| Componente | Estado actual EVA | Cambio requerido | Effort (S/M/L/XL) | Bloqueador venta enterprise? | Riesgo migración |

Cierra con: diagrama propuesto modelo datos + roadmap 6 meses fase por fase.
```

## 20. Mobile Engineer (React Native / Expo)

```
Actúa como Mobile Engineer senior auditando el plan de migración EVA a React Native.

CONTEXTO CRÍTICO — DECISIONES YA TOMADAS (no reabrir, solo auditar si son correctas):
- Stack: Expo SDK 53 + Expo Router v4 + NativeWind v4
- Modelo: aggregator app "EVA" (Apple Guideline 4.2.6) — una app, múltiples coaches dentro
- Backend: mismo Supabase (mismas tablas, RLS, credenciales) — cero duplicación
- Auth: Supabase Auth + AsyncStorage (detectSessionInUrl: false) + expo-secure-store para tokens
- Pagos: Linking.openURL al browser externo SIEMPRE (nunca in-app checkout)
- OTA: Expo Updates para cambios JS
- Builds: EAS Build (30/mes gratis) + EAS Submit
- Cuentas stores: Guimel (Apple $99/año + Google Play $25 único) → EVA costo $0
- Roadmap ya definido: 8 semanas hasta submission

ESTRUCTURA MÓVIL DECIDIDA:
eva-mobile/app/(auth)/login.tsx, register.tsx
eva-mobile/app/(student)/[slug]/index.tsx, programs.tsx, progress.tsx
eva-mobile/app/(coach)/dashboard.tsx, students.tsx
eva-mobile/app/index.tsx ← selector coach por invite_code o link

Audita plan y entrega hallazgos sobre:

ARQUITECTURA:
- ¿Aggregator model correcto para EVA? Riesgo de rechazo Apple 4.2.6 — argumentar
- invite_code en tabla coaches: diseño, unicidad, colisiones, expiración
- ThemeContext runtime por slug: caching, flash of wrong theme, primer render
- Server Actions Next.js NO accesibles desde RN — ¿qué endpoints del web actual rompería?
- ¿Qué tablas/RPCs de Supabase necesitan endpoint nuevo? ¿O acceso directo desde RN es ok?

AUTH Y SEGURIDAD:
- AsyncStorage vs expo-secure-store — cuál para qué dato (session vs access token vs refresh)
- Refresh token rotation en RN — manejo expiración offline
- biometric unlock (expo-local-authentication) — ¿vale la pena para MVP?

DEEP LINKING:
- apple-app-site-association config para /c/* paths — ¿correcta?
- assetlinks.json + sha256 fingerprint management en EAS
- Caso: app NO instalada → fallback web (/c/[slug]) — ¿está manejado?

PUSH NOTIFICATIONS:
- expo-notifications token registration — backend necesita tabla device_tokens (push_tokens por user/device)
- ¿Ya existe esa tabla en Supabase? Si no, migración requerida
- Casos: workout recordatorio, check-in pendiente, mensaje coach
- APNs certificados en cuenta Guimel — riesgo si cambia de cuenta

OFFLINE:
- Workout execution sin wifi — caso más crítico. ¿Estrategia?
- Estado offline mínimo Apple: mensaje descriptivo (no pantalla en blanco) — bloqueador submission
- ¿WatermelonDB / op-sqlite / solo Supabase Realtime cache?

STORE COMPLIANCE:
- PrivacyInfo.xcprivacy (iOS 17+) — APIs que declara EVA (UserDefaults, NSURLSession, etc.)
- App Privacy Labels App Store Connect — qué datos recolecta (email, health/fitness, usage)
- Data Safety Form Google Play — datos compartidos con terceros (Supabase US)
- Screenshots iPhone 16 Pro Max 6.9" (3+ mostrando múltiples coaches) — estado actual
- Privacy Policy URL accesible sin login en la app

PERFORMANCE:
- FlashList vs FlatList para lista workouts/exercises (muchos items)
- expo-image vs Image de RN para logos de coaches
- Hermes engine — habilitado por defecto en Expo SDK 53?
- Bundle size inicial — tiempo cold start

RIESGOS PLAN GUIMEL:
- Dependencia cuenta Apple: ¿acuerdo escrito? ¿qué pasa si no renueva?
- Plan A cuenta Apple propia EVA (DUNS Number) — timeline
- Múltiples rechazos Apple escalan escrutinio — plan B si hay 3+ rechazos
- EAS Build gratuito 30/mes — ¿alcanza para 8 semanas desarrollo activo?

PENDIENTES QUE BLOQUEAN SUBMISSION (listar estado):
- invite_code column en tabla coaches
- apple-app-site-association live en eva-app.cl/.well-known/
- assetlinks.json live en eva-app.cl/.well-known/
- PrivacyInfo.xcprivacy en repo
- App Privacy Labels completos
- Data Safety Form completo
- Screenshots 6.9"
- Offline message state
- Push token registration table

COACH APP:
- PDF menciona panel básico del coach en mobile (sem 5). ¿Necesario para MVP? ¿No agrega riesgo de rechazo por contenido limitado?
- Recomendar: MVP solo alumno, coach sigue en web.

Output:
| Área | Decisión tomada | Corrección/Riesgo | Severidad | Fix antes submission |

Cierra con:
1. Lista pendientes bloqueadores submission (P0)
2. Lista nice-to-have post-launch (P2)
3. Validación: ¿el roadmap 8 semanas es realista?
```

---

## Validación 2026 (research web May 15, 2026)

Cada recomendación fue validada contra fuentes actuales. Highlights:

### Vigentes / Trending ✅

- **Ley 21.719 Chile** — confirmada vigencia **2026-12-01**. Multas hasta 20.000 UTM o 4% ingresos. PYMEs solo amonestación primer año. Bloqueador enterprise: DPA con todos los SaaS subprocesadores (Supabase US = transferencia internacional con garantías obligatorias).
- **OWASP Top 10 LLM 2025** — vigente. Prompt Injection #1, Sensitive Info Disclosure #2. Si EVA agrega features IA (recomendador rutinas, chatbot), aplica.
- **CVE-2025-29927 Next.js middleware bypass** — confirmar versión Next ≥ 15.2.3.
- **CVE-2026-23870 React Server Components** — Mayo 2026 security release Vercel. Verificar React ≥ 19.2.4.
- **Supabase RLS performance** — wrap `auth.uid()` en subselect para initPlan cache, índices en columnas RLS (100x mejora), revertir dirección subqueries, testear desde SDK no SQL Editor.
- **SOC2 Type 1** — 8-12 semanas, $30K-$80K primer año. **No-go enterprise sin él** en 2026 procurement.
- **MEDDPICC** — framework dominante 2026 para deals >$50K ACV. Confirmado legalmente "genérico" (abril 2026), libre uso.
- **FinOps Supabase/Vercel** — stack típico $45/mes hasta $10K MRR. Cloudflare frontal recomendado (cache hits = ahorro masivo). Queries ineficientes son el "invisible cost driver".

### Sin cambios relevantes ⚪

- Heurísticas Nielsen, WCAG 2.2 AA, Server Actions security pattern (Zod + auth + ownership), Patrón módulo Next.js App Router.

### Gap detectado en research 🟡

- MercadoPago webhook best practices 2026 específicas: docs oficiales no actualizadas con guidance reciente. Recomendación: auditar contra patrones genéricos (HMAC, idempotencia, dedup event_id, retry exponencial) — no hay framework MP-specific 2026.

---

## Sources

- [Ley 21.719: guía 2026 cumplimiento](https://preyproject.com/es/blog/ley-de-proteccion-de-datos-en-chile)
- [Ley 21.719 Chile 2026: 7 pasos](https://www.yourdevs.net/blog/ley-21719-proteccion-datos-chile)
- [Guía Práctica Implementación — Gobierno Digital Chile](https://wikiguias.digital.gob.cl/datos-personales/guia-practica-implementacion-nueva-ley-datos-personales)
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)
- [Next.js Security Best Practices 2026 — Authgear](https://www.authgear.com/post/nextjs-security-best-practices/)
- [Next.js May 2026 security release — Vercel](https://vercel.com/changelog/next-js-may-2026-security-release)
- [How to Think About Security in Next.js — Vercel](https://nextjs.org/blog/security-nextjs-server-components-actions)
- [React 19 Security Audit — SecureBlitz](https://secureblitz.com/react-19-security-audit)
- [Supabase RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [Supabase Security Best Practices 2026](https://supaexplorer.com/guides/supabase-security-best-practices)
- [MercadoPago PreApproval API — Chile](https://www.mercadopago.cl/developers/en/reference/subscriptions/_preapproval/post)
- [Enterprise readiness checklist 2026 — WorkOS](https://workos.com/blog/enterprise-readiness-checklist-2026)
- [SOC 2 Readiness Checklist 2026 — Dsalta](https://www.dsalta.com/resources/soc-2/soc-2-readiness-checklist-2026-guide-for-saas-startups)
- [SOC 2 Controls SaaS Buyers Expect 2026](https://canadiancyber.ca/soc2-controls-saas/)
- [FinOps for Supabase guide](https://medium.com/@maximedalessandro/finops-for-supabase-a-guide-to-cutting-your-cloud-costs-817ef13b852c)
- [Supabase Pricing Real Costs 2026](https://designrevision.com/blog/supabase-pricing)
- [MEDDPICC Sales Methodology 2026 — Prospeo](https://prospeo.io/s/meddpicc-sales-methodology)
- [Best Sales Methodologies B2B SaaS 2026 — Sales Assembly](https://www.salesassembly.com/blog/revenue-leadership/best-sales-methodologies-b2b-saas-2026/)
