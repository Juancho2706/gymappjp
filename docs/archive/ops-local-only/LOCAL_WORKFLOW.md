# Local Workflow

Ultima modificacion: 2026-05-21 18:25 -04:00

## Reglas de seguridad

- Trabajar en `v2/enterprise`.
- No tocar `master` ni Live salvo instruccion explicita.
- Supabase de desarrollo es local.
- No ejecutar `npx supabase db push` durante desarrollo local.
- No versionar `.env*`, `.vercel/`, `.mcp.json`, `supabase/.temp/`, `test-results*` ni `playwright-report/`.

## Inicio de sesion

```powershell
git branch --show-current
git status -sb
npx supabase status
```

Si Supabase local no corre:

```powershell
npx supabase start
npx supabase db reset
```

## Verificaciones recomendadas

```powershell
npm run typecheck -w @eva/web
npx tsc --noEmit -p apps/mobile/tsconfig.json
npx vitest run
npm run build -w @eva/web
```

E2E focal:

```powershell
npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1
```

## Antes de commit

1. Actualizar docs canonicos si cambia estructura, rutas, flujos o pruebas.
2. Revisar que no entren artefactos:

```powershell
git status --short
git check-ignore -v test-results .env.e2e.local supabase/.temp/cli-latest
```

3. Commits separados por tema:
   - `feat(...)`
   - `fix(...)`
   - `refactor(...)`
   - `docs(...)`
   - `test(...)`

## Paso a produccion futuro

Cuando toque Live:

1. Congelar rama.
2. Revalidar suite completa.
3. Aplicar migraciones a Supabase remoto.
4. Regenerar tipos contra remoto si corresponde.
5. Configurar buckets, hooks, env vars y webhooks.
6. Deploy preview.
7. Smoke test.
8. Merge/promote a production.
