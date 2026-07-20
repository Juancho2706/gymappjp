---
status: active
owner: platform
last_verified: 2026-07-20
canonical: true
---

# EVA Fitness Platform

EVA es una plataforma SaaS B2B2C para coaches, equipos de coaches y organizaciones fitness. Reúne gestión de alumnos, entrenamiento, nutrición, progreso y marca en web/PWA y en una app nativa Expo/React Native.

Producción web: [www.eva-app.cl](https://www.eva-app.cl) · Contacto: `contacto@eva-app.cl`

## Superficies

| Superficie | Usuarios | Entrada principal |
|---|---|---|
| Web pública | Visitantes y registro | `/`, `/pricing`, `/enterprise` |
| Dashboard web | Coaches standalone y coaches de Teams | `/coach/*` |
| Alumno web/PWA | Alumno standalone, Team o Enterprise | `/c/[coach_slug]/*`, `/t/[team_slug]/*`, `/e/[org_slug]/*` |
| Enterprise web | Owner y staff de una organización | `/org/[slug]/*` |
| Operación interna | Administradores EVA | `/admin/*` |
| App nativa | Coaches y alumnos | `apps/mobile` (Expo Router) |

La app nativa es un binario EVA único. Logo, colores y experiencia se resuelven en runtime según el workspace activo; no se genera un binario diferente por coach.

## Monorepo

```text
apps/
├── web/       # Next.js App Router, Server Actions y API móvil
└── mobile/    # Expo 54, React Native y Expo Router

packages/      # Dominio y contratos puros compartidos web + mobile
supabase/      # Migraciones, configuración y pruebas SQL/RLS
tests/         # Playwright y pruebas de integración
scripts/       # Operación, auditorías e importadores controlados
docs/          # Memoria canónica y runbooks
specs/         # Solo trabajo activo bajo SDD
```

El mapa completo está en [PROJECT_STRUCTURE.md](docs/architecture/PROJECT_STRUCTURE.md). Los flujos están en [FLOWS_AND_COMPONENTS.md](docs/architecture/FLOWS_AND_COMPONENTS.md).

## Inicio local

Requisitos: Node.js compatible con Next.js 16, `pnpm@11.5.0` y variables locales basadas en `.env.example` y `apps/mobile/.env.example`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

App móvil:

```bash
pnpm --filter @eva/mobile start
```

No versionar `.env*`, credenciales, artefactos de build ni datos reales de usuarios.

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm check:tokens
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm test:e2e
```

Los E2E requieren su entorno y personas de prueba. El estado y los gates vigentes viven en [TEST_STATUS.md](docs/testing/TEST_STATUS.md).

## Reglas de arquitectura

- Web: `app/_data` → `services` → `infrastructure/db` → Supabase. Las Server Actions validan y delegan; no concentran lógica de negocio.
- Compartido: lógica, schemas y contratos reutilizables viven en `packages/*`, sin dependencias de Next.js ni React Native.
- Mobile: acceso directo solo con sesión de usuario y RLS; operaciones privilegiadas o con secretos pasan por `apps/web/src/app/api/mobile`.
- Toda lectura/escritura debe respetar el workspace activo: standalone, Team o Enterprise nunca se mezclan.
- Feature nueva: `specs/<feature>/{SPEC,PLAN,TASKS}.md` antes del código. Al cerrar, el spec deja el árbol activo.
- Cambios de base de datos: migraciones aditivas, forward-only y con validación RLS. Nunca aplicar cambios destructivos directamente a producción.

## Despliegue

- Web: Vercel, desde `master`.
- Mobile: EAS Build/Submit, desde perfiles de `apps/mobile/eas.json`.
- Datos/Auth/Storage: Supabase.
- Pagos standalone: MercadoPago; Flow/Webpay existe detrás de configuración de lanzamiento.

No ejecutar deploys, submits ni migraciones productivas como parte de una verificación local.

## Documentación

Empezar en [docs/README.md](docs/README.md). El estado operativo actual está en [CURRENT.md](docs/status/CURRENT.md).

La documentación describe intención y estado verificado; código, migraciones y configuración siguen siendo la evidencia ejecutable. Si divergen, corregir el documento en el mismo cambio.
