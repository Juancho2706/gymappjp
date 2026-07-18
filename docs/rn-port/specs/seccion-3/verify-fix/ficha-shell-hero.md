# VERIFY/FIX — `ficha-shell-hero`

Fecha: 2026-07-12

## Estado

Unidad cerrada a nivel código/spec. Tanda A cerró shell, hero, tabs, FAB y
helpers; Tanda B cerró acciones, autorización multi-workspace y derivados.

## Tanda A

- Refetch de ficha por `useFocusEffect`; carga inicial visible y retornos del
  builder silenciosos. Secuencias ignoran respuestas viejas; error de red tiene
  retry y no se presenta como “Alumno no encontrado”.
- Day-detail también refresca por foco con cancelación y `finally`; el refresh
  ya no pisa la fecha elegida por el coach.
- Estado usa `deriveClientStatus` con score acumulado equivalente y señales de
  hoy; conserva Al día/Atención/Urgente.
- Semana, última actividad y helpers compartidos usan días calendario Santiago.
- Header vuelve a “Alumnos” sin duplicar el nombre que ya vive en el hero.
- Activity y barra de adherencia leen `sport-400/500` white-label; sombras,
  tracking, gap y motivos se alinearon al web vivo.
- Tab bar mantiene BlurView Android, usa surface-app tokenizado, geometría web,
  hint descartable/reduced-motion y estado stuck con borde/sombra.
- Badges leen PRs, días efectivos del programa A/B y comidas/riesgo nutricional.
- FAB exige al menos 10 dígitos, queda visible deshabilitado al faltar teléfono y
  abre `wa.me` sin mensaje, igual al FAB web.
- No se tocaron tabs hermanos ni árbol alumno/ejecutor.

## Tanda B

- Menú ⋮ usa el sheet completo en el orden web: ficha, WhatsApp, editar, reset,
  pausar/reactivar, archivar/desarchivar y eliminar; los tres shortcuts RN del
  directorio se ocultan en esta superficie.
- WhatsApp del menú usa el copy web y URL de recurso: `/t/{teamSlug}` para team,
  `/c/{inviteCode || slug}` para el resto. Si no puede resolverla, la acción no
  aparece.
- Reset devuelve clave temporal copiable; pausa y archivo muestran copy web;
  eliminar exige escribir el nombre y vuelve al directorio tras éxito.
- PATCH/DELETE/reset reciben el workspace RN. Servidor revalida bearer,
  membresía/rol, team vigente y scope del alumno antes de toda mutación.
- DELETE preserva la identidad Auth cuando el alumno también es coach y falla
  cerrado si no puede comprobarlo; un fallo de GoTrue conserva estado
  reintentable. Desarchivar revalida el cupo standalone y archivar/desarchivar
  conserva los correos y enlaces correctos para standalone/team/enterprise.
- La transición sheet→confirmación queda encolada hasta el dismiss; el
  directorio mantiene el sheet montado durante el cierre para no perder la
  acción en iOS.
- Peso cae al intake; score acumula señales de check-in, entreno, nutrición y
  ciclo; racha actual usa actividad workout + comidas completadas de 371 días.
- Query base del cliente propaga fallos de red para que el retry sea alcanzable;
  fallos parciales ricos siguen degradando sin ocultar la identidad del alumno.
- Editor se desmonta al cerrar y bloquea X/Android Back mientras guarda.

## Gates

- `pnpm exec tsc --noEmit` mobile — PASS.
- `pnpm exec tsc --noEmit` web — PASS.
- `node scripts/check-token-parity.mjs` — PASS, 86/86.
- `pnpm exec expo export --platform android` — PASS.
- `pnpm exec vitest run packages/profile-analytics/client-status.test.ts packages/profile-analytics/overview.test.ts` — PASS, 13/13.
- Smoke device light/dark × EVA/custom — pendiente.
