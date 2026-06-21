# OVERNIGHT — Cómo lanzar el /goal

## Pre-requisitos
- Worktree aislado: `D:\tmp\gymappjp-rn-overnight` (rama `feat/rn-parity-overnight`, off master `099fe4d6`).
- `pnpm install` corrido en el worktree (deps presentes — el bundle de expo las necesita).
- Claude Code v2.1.139+ (requisito de `/goal`).
- **Auto mode ON** en la sesión: `/goal` saca los prompts por-turno, pero NO los por-tool. Sin auto mode, cada tool call se bloquea esperando aprobación → no es unattended. (auto mode + /goal = combo correcto.)
- La 1ra vez en este path puede pedir aceptar el trust dialog del workspace (el evaluador de /goal es parte de hooks).

## Lanzar (interactivo, recomendado)
1. Abrí una terminal y `cd D:\tmp\gymappjp-rn-overnight`.
2. Arrancá Claude Code ahí. Activá **auto mode**.
3. Pegá el `/goal` con esta condición (un solo comando):

```
/goal Trabaja en apps/mobile siguiendo apps/mobile/OVERNIGHT_TASKS.md (releelo cada turno). Implementa las tareas T1-T4 una por turno; valida cada una con: cd apps/mobile && npx tsc --noEmit  y  npx expo export --platform android (redirige el output a ../../.overnight-logs/ y muestra SOLO exit= y las ultimas 8 lineas, el log de expo es enorme). Commitea en la rama feat/rn-parity-overnight SOLO si ambos dan exit 0, mensaje "feat(mobile): <tarea> (overnight)". Maximo 2 intentos de fix por tarea; si sigue roja, git restore + marcala blocked en OVERNIGHT_TASKS.md. PROHIBIDO tocar apps/web (salvo .well-known), packages/, supabase/migrations; sin deps nuevas no triviales; NO push, NO merge. Append a apps/mobile/OVERNIGHT_PROGRESS.md cada turno. Muestra en CADA turno los dos exit= y el estado de T1-T4. CONDICION CUMPLIDA cuando: T1, T2, T3 y T4 estan cada una done o blocked en OVERNIGHT_TASKS.md, y cada done tiene en el transcript tsc exit=0 + expo exit=0 + un commit; o tras 25 turnos o 90 minutos, lo que pase primero. Al cumplir, escribe el RESUMEN FINAL en OVERNIGHT_PROGRESS.md.
```

## Lanzar (headless / sin terminal abierta mirando)
```
cd D:\tmp\gymappjp-rn-overnight
claude -p "/goal <misma condicion de arriba>"
```
- Corre hasta cumplir la condición en una sola invocación. El proceso debe quedar vivo (no cerrar la sesión/PC). Ctrl+C para abortar.

## Mientras corre
- `/goal` (sin args) muestra turnos, tokens y el último "reason" del evaluador.
- `/goal clear` lo corta antes de tiempo.
- Indicador `◎ /goal active` muestra cuánto lleva.

## Revisión matutina (vos)
1. `cd D:\tmp\gymappjp-rn-overnight && git log --oneline feat/rn-parity-overnight`
2. Leer `apps/mobile/OVERNIGHT_PROGRESS.md` (RESUMEN FINAL + entradas).
3. Re-correr el gate: `cd apps/mobile && npx tsc --noEmit && npx expo export --platform android`.
4. Eyeball diffs (`git diff master..feat/rn-parity-overnight -- apps/mobile`). Build EAS si querés device.
5. Cherry-pick / merge lo bueno a master vía tu flujo normal de PR. Descartar lo `blocked`.
6. Limpiar worktree cuando termines: `git worktree remove D:/tmp/gymappjp-rn-overnight` (desde el repo principal).

## Por qué esto es seguro overnight
- Rama + worktree aislados → master/prod intocables; no choca con la sesión de whitelabel v2.
- Gate tsc+bundle por chunk → no commitea código roto.
- Scope mobile-only additivo, sin DB/packages → blast radius = una rama que revisás vos.
- Builds reales (EAS) son manuales igual.
