---
status: active
owner: engineering
last_verified: 2026-07-20
canonical: true
---

# Project structure

## Vista general

```text
gymappjp/
├── apps/
│   ├── web/                  # Next.js 16: web, PWA, Server Actions y APIs
│   └── mobile/               # Expo 54 / React Native 0.81 / Expo Router
├── packages/                 # Contratos y motores puros compartidos
├── supabase/
│   ├── migrations/           # Historial SQL forward-only
│   └── tests/                # Verificación SQL/RLS
├── tests/                    # Playwright e integración cross-feature
├── scripts/                  # Utilidades operativas e importadores
├── specs/                    # SDD: únicamente features activas
└── docs/                     # Estado, arquitectura, operación y evidencia
```

Workspace manager: pnpm. No hay Turborepo; los scripts raíz usan filtros de pnpm.

## `apps/web`

```text
apps/web/src/
├── app/                      # App Router y features por ruta
├── components/               # UI compartida entre tres o más dominios
│   ├── atoms/
│   ├── molecules/
│   ├── organisms/
│   └── <dominio>/
├── domain/                   # Tipos y políticas de negocio puras
├── infrastructure/
│   ├── db/                   # Repositories Supabase
│   └── email/                # Adaptadores externos
├── services/                 # Casos de uso y autorización de aplicación
├── lib/                      # Adaptadores de framework y utilidades
└── types/                    # Tipos auxiliares locales
```

### Dependencias permitidas en web

```text
app (_data / _actions / route handlers)
                 │
                 ▼
              services
                 │
                 ▼
       infrastructure/db
                 │
                 ▼
              Supabase
```

- `domain/` no importa Next.js, Supabase ni componentes.
- `infrastructure/` recibe clientes/adaptadores; no decide UX ni redirects.
- `services/` contiene autorización, scope y lógica de aplicación; no importa desde `app/`.
- `_data/*.queries.ts` adapta lecturas para una ruta y puede usar `React.cache` por request.
- `_actions/*.actions.ts` valida input, identifica al actor, llama al servicio y revalida.
- `page.tsx` es principalmente composición y carga de datos.

El repositorio todavía contiene módulos legacy que no cumplen toda la dirección. No copiarlos como patrón. Al tocarlos, mover la lógica nueva hacia la capa correcta sin reescrituras destructivas fuera de alcance.

### Feature-first

```text
app/<zona>/<feature>/
├── page.tsx
├── loading.tsx
├── _data/
├── _actions/
├── _components/
└── _lib/
```

Un componente permanece junto a su feature hasta demostrar uso en tres o más dominios. Solo entonces asciende a `components/atoms`, `molecules` u `organisms`.

## `apps/mobile`

```text
apps/mobile/
├── app/                      # Rutas Expo: auth, coach y alumno
├── components/
│   ├── atoms/
│   ├── molecules/
│   ├── organisms/
│   ├── coach/
│   ├── alumno/
│   ├── workout/
│   └── nutrition-v2/
├── context/                  # Sesión, workspace y estado transversal
├── lib/                      # Queries, API clients, caché/offline y view-models
├── types/
├── assets/
└── plugins/                  # Config plugins de build nativo
```

Mobile usa dos caminos de datos:

1. Supabase directo con el JWT del usuario para operaciones cubiertas por RLS.
2. `apps/web/src/app/api/mobile/*` para operaciones privilegiadas, rate limiting, secretos, scopes complejos o contratos server-authoritative.

Reglas:

- RLS nunca se sustituye por un filtro de UI.
- Las mutaciones sensibles deben revalidar sesión, workspace y ownership en servidor.
- `lib/api.ts` es el transporte hacia la API web; no duplicar URL/base headers por pantalla.
- Estado offline debe ser idempotente y reconciliar contra el resultado server-side.
- Lógica portable sale de `apps/mobile` hacia `packages/*`; componentes y APIs nativas permanecen locales.

## Paquetes compartidos

| Paquete | Responsabilidad |
|---|---|
| `@eva/schemas` | Schemas Zod y contratos de input compartidos |
| `@eva/tiers` | Tiers, precios, ciclos, límites y capacidades |
| `@eva/brand-kit` | Resolución de temas, presets y branding |
| `@eva/workout-engine` | Reglas de entrenamiento, reconciliación, objetivos e intervalos |
| `@eva/plan-builder` | Estado y reducer del constructor de programas |
| `@eva/nutrition-v2` | Contratos, read models, cálculos y lógica portable de Nutrición V2 |
| `@eva/nutrition-engine` | Cálculos de nutrición legacy/compartidos |
| `@eva/bodycomp` | DTOs y cálculos de composición corporal |
| `@eva/cardio` | Zonas, intervalos y dominio cardio |
| `@eva/profile-analytics` | Transformaciones de analítica del alumno |
| `@eva/feature-prefs` | Preferencias de superficies por feature |
| `@eva/module-catalog` | Catálogo estable de módulos profesionales |
| `@eva/coach-nav` | Definición portable de navegación coach |
| `@eva/calc` | Cálculos generales puros |

Un paquete compartido no puede depender de Next.js, DOM, Expo, React Native ni credenciales. Debe exponer funciones puras, tipos o schemas testeables.

## Rutas y ownership

| Zona | Código principal | Ownership funcional |
|---|---|---|
| Público/auth | `apps/web/src/app/(auth)`, landing y legal | Plataforma |
| Coach | `apps/web/src/app/coach` | Producto coach |
| Alumno standalone | `apps/web/src/app/c/[coach_slug]` | Producto alumno |
| Alumno Team | `apps/web/src/app/t/[team_slug]` | Producto alumno + Teams |
| Alumno Enterprise | `apps/web/src/app/e/[org_slug]` | Producto alumno + Enterprise |
| Team | `apps/web/src/app/coach/team`, services `team/` | Teams |
| Enterprise | `apps/web/src/app/org/[slug]` | Enterprise |
| Admin | `apps/web/src/app/admin` | Operaciones EVA |
| API nativa | `apps/web/src/app/api/mobile` | Plataforma + feature dueña |
| Mobile | `apps/mobile/app` | Producto móvil |

## Datos y seguridad

- Tipos generados de DB web: `apps/web/src/lib/database.types.ts`.
- Migraciones activas: `supabase/migrations/`.
- Migraciones `*_backup*` son historia, no input de deploy.
- Autenticación: Supabase Auth.
- Autorización: servicio/scope explícito más RLS.
- Multi-tenant: standalone, Team y Enterprise tienen filtros y memberships separados.
- Service role: solo servidor/scripts autorizados; nunca cliente web o mobile.
- Queries de catálogo: columnas explícitas; evitar `select('*')`.

Una modificación de tablas, funciones o RLS debe incluir migración, pruebas pertinentes y regeneración de tipos cuando cambie el contrato.

## Estado y UI

- Web prioriza RSC, Server Actions, `useState`, `useReducer`, `useTransition`, `useOptimistic` y Context.
- No introducir Redux, Zustand, SWR ni React Query.
- Mobile usa Context/estado local y cachés explícitas; no crea una segunda fuente de verdad del servidor.
- Tokens semánticos y marca deben funcionar en light/dark y con white-label.
- Web móvil usa `dvh` y safe areas; native usa `react-native-safe-area-context`.

## Documentación y ciclo de vida

- Estado global: `docs/status/CURRENT.md`.
- Paridad móvil: `docs/status/MOBILE_PARITY.md`.
- Feature activa: `specs/<feature>/{SPEC,PLAN,TASKS}.md`.
- Decisión duradera: arquitectura o ADR, no un handoff.
- Procedimiento repetible: `docs/operations/`.
- Evidencia histórica: `docs/archive/`; nunca es fuente canónica.

Handoffs, prompts, logs de agentes, capturas, reportes generados y planes completados no pertenecen al árbol documental activo.

## Cuándo actualizar este documento

Actualizar en el mismo cambio si se agrega una app, paquete compartido, capa, zona de rutas o regla de dependencia. Un componente nuevo o una ruta individual normalmente solo requiere actualizar el mapa de flujos si altera un recorrido principal.
