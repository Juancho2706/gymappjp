# Supabase Migration Workflow

This workflow is the project standard for DB schema changes.

## 1. Authenticate and link

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

## 2. Sync local migrations from remote

```bash
npx supabase db pull
```

This updates `supabase/migrations` with the linked project's current migration history.

## 3. Create a new migration

```bash
npx supabase migration new <short_name_in_snake_case>
```

## 4. Edit SQL and validate locally

- Write reversible, idempotent SQL when possible.
- Prefer explicit `IF EXISTS`/`IF NOT EXISTS` for safety.
- Keep data migrations deterministic.

## 5. Apply migrations to remote

```bash
npx supabase db push
```

## 6. Commit policy

- Commit new files under `supabase/migrations` in the same PR as related app code.
- Never ship schema changes without migration files.
- Include rollback notes in PR description when change is risky.
