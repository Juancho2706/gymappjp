---
status: active
owner: database-security
last_verified: 2026-07-20 @ 34b09d8f
canonical: true
---

# Checklist DB para nuevos write-paths de React Native

Aplicar a todo cambio en `apps/mobile` que agregue o amplíe `insert`, `update`, `upsert`, `delete`, RPC o upload. El cliente móvil usa el JWT del usuario contra Supabase; nunca contiene `service_role`.

No mergear hasta completar los puntos aplicables contra el esquema real del entorno objetivo. Los SQL locales describen intención, pero `information_schema` y `pg_policies` describen el estado efectivo.

## 1. Delimitar el write-path

- [ ] Registrar tabla/bucket, operación, columnas, rol real y scope: standalone, enterprise o team.
- [ ] Confirmar si escribe PostgREST como `authenticated`, una RPC `SECURITY DEFINER` o una API server-side protegida.
- [ ] Para cambios de ownership, scoping, billing o entitlements, usar una operación server-side/RPC con autorización explícita; no ampliar permisos del cliente.

## 2. Revisar grants efectivos

```sql
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = '<tabla>'
  AND grantee = 'authenticated';

SELECT column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = '<tabla>'
  AND grantee = 'authenticated'
ORDER BY privilege_type, column_name;
```

- [ ] Si existe `UPDATE` a nivel tabla, una columna nueva hereda el permiso; RLS todavía debe limitar filas.
- [ ] Si `UPDATE` está revocado a nivel tabla, agregar la columna user-editable al allowlist en la misma migración:

```sql
GRANT UPDATE (nueva_columna) ON public.<tabla> TO authenticated;
```

- [ ] No usar `REVOKE UPDATE(columna)` para compensar un grant de tabla: no lo anula. El patrón válido es `REVOKE UPDATE ON ...` y luego `GRANT UPDATE(columna, ...)`.
- [ ] Mantener fuera de allowlists los campos de scoping (`id`, `org_id`, `team_id`, `coach_id`) y los de billing/entitlements, salvo una decisión de seguridad documentada.

Los allowlists actuales de `coaches`, `teams` y `clients` nacen en:

- `supabase/migrations/20260612140000_modules_compra_only_grants.sql`;
- `supabase/migrations/20260612140001_clients_scoping_grants.sql`;
- migraciones posteriores de branding que agregan columnas explícitas.

## 3. Revisar RLS

```sql
SELECT policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = '<tabla>'
ORDER BY policyname;
```

- [ ] La policy cubre el actor y scope reales, no solo al owner standalone.
- [ ] En `UPDATE`, `USING` limita las filas existentes y `WITH CHECK` impide mover la fila a otro tenant.
- [ ] En team/enterprise, reutilizar helpers `SECURITY DEFINER` vigentes; no consultar recursivamente la misma tabla de membresía desde su policy.
- [ ] `anon` no obtiene PII, tokens, datos clínicos ni billing por un grant copiado de un flujo público de branding.
- [ ] Probar al menos: actor permitido, usuario ajeno, otro team/org y rol sin capacidad de gestión.

## 4. Storage

- [ ] El object path contiene el scope esperado por la policy; para fotos del alumno, normalmente comienza con su UID.
- [ ] Buckets sensibles permanecen privados y se leen mediante URL firmada. `checkins` usa este patrón en mobile.
- [ ] Un bucket público solo se acepta para assets deliberadamente públicos y con MIME/tamaño restringidos.
- [ ] Verificar `storage.objects` con un usuario real permitido y otro ajeno.

## 5. Migración y despliegue

- [ ] Crear migración timestamped, aditiva, idempotente y forward-only en `supabase/migrations/`.
- [ ] No ejecutar `db push` directo a producción.
- [ ] Si Supabase Branching está disponible: branch efímero → `apply_migration` → seed sintético/tests RLS → advisors → merge → pull/types → borrar branch el mismo día.
- [ ] Si Branching no está disponible: seguir el procedimiento aditivo-en-live de [RUNBOOK.md](./RUNBOOK.md), con snapshot y validación previa; nunca improvisar DDL destructivo.
- [ ] Regenerar los tipos DB compartidos cuando cambie el esquema y revisar consumidores web + mobile.

## 6. Gate final

- [ ] Ejecutar `tests/separation/module-grants.sql` si toca `coaches`, `teams`, `clients` o sus allowlists.
- [ ] Agregar un test SQL de RLS para el nuevo tenant/rol cuando el caso no esté cubierto.
- [ ] Validar con sesión `authenticated`; `service_role` omite RLS y no demuestra seguridad.
- [ ] Correr `pnpm --filter @eva/mobile exec tsc --noEmit` y las pruebas unitarias/E2E afectadas.
- [ ] Revisar advisors de seguridad y rendimiento; cero hallazgos críticos nuevos.
- [ ] Confirmar manualmente desde la app que la mutación persiste, que el error se muestra sin perder datos y que el modo offline no duplica escrituras.
