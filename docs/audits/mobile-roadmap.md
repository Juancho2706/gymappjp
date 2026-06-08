# EVA Mobile — Roadmap maestro (coach + alumno standalone)

_2026-06-06 · Índice y plan por olas para llevar el RN mobile (coach + alumno **standalone**) a igualar o superar la web/PWA. Enterprise (coach/alumno) queda **diferido** a una fase futura por decisión del usuario._

> Este es el **tablero**: abrí este doc para ver dónde estamos y qué sigue. Cada pieza vive en su propio documento (links abajo). El detalle línea-por-línea con `archivo:linea` está en cada audit.

---

## 0. 🔒 Reglas de seguridad y ejecución autónoma (`/goal`)

> Aplican SIEMPRE, y con más razón si se deja a Claude corriendo solo en `/goal` (modo autónomo, sin supervisión en vivo). Pensadas para que el usuario "se despierte y revise lo que se hizo" sin sorpresas.

**NUNCA, bajo ninguna circunstancia (ni en `/goal`):**
- ❌ **Tocar Supabase live.** Cero migraciones, cero `db push`, cero cambios de schema/tablas/RLS/RPC, cero MCP de Supabase contra prod. Si un fix REQUIERE migración (los 2 conocidos: `UNIQUE` en `workout_logs` y tabla `push_tokens`) → **NO se hace**: se deja el ítem marcado como "BLOQUEADO: requiere aprobación de migración" y se sigue con lo demás. Nunca improvisar un workaround que escriba schema.
- ❌ **`git commit` / `git push`.** El usuario commitea/buildea. El trabajo queda en el **working tree** sin commitear para que el usuario revise el diff al despertar. (Si el usuario quiere auto-commit por tanda durante un `/goal`, debe decirlo explícitamente.)
- ❌ **Acciones destructivas o irreversibles** (borrar datos, `db reset` contra algo que no sea local, mandar emails/push reales a usuarios, publicar a tiendas).

**SÍ se puede en autónomo:**
- ✅ Crear/editar código en `apps/mobile` (y `apps/web` para endpoints que no toquen schema).
- ✅ Agregar deps con **pnpm** (declarar postinstall en `pnpm-workspace.yaml#allowBuilds`).
- ✅ Migraciones **locales** (`npx supabase` en stack local) SOLO si el usuario lo pide — por defecto NO.
- ✅ Validar cada tanda: `cd apps/mobile && npx tsc --noEmit && npx expo export --platform android`.

**Disciplina de ejecución autónoma:**
- Trabajar **por tandas pequeñas**, validando verde (tsc + expo export) antes de seguir.
- Dejar un **registro de avance** (qué se hizo, qué se saltó y por qué) en el doc de la ola o en el tracker, para revisión al despertar.
- Ante duda de algo irreversible o que toque Supabase/commits → **detenerse y dejar anotado**, no asumir.
- No inventar datos ni "tests verdes" falsos: si algo falla, se reporta con el error real.

---

## 1. Mapa de documentos

| Documento | Qué cubre | Estado |
|-----------|-----------|--------|
| [coach-mobile-readiness-review.md](coach-mobile-readiness-review.md) | Auditoría del **coach** mobile (14 disciplinas) + bloqueantes | ✅ hecho |
| [alumno-web-vs-mobile.md](alumno-web-vs-mobile.md) | Auditoría **alumno** web→mobile (9 áreas) + paridad + oportunidades nativas | ✅ hecho |
| [mobile-shared-foundation.md](mobile-shared-foundation.md) | **Cimientos compartidos** coach+alumno (auth, datos, errores, offline, push, build) | ✅ hecho |
| [mobile-native-advantages.md](mobile-native-advantages.md) | **Ventajas del teléfono** (push, offline, cámara/scan, Face ID, HealthKit, Live Activity, widgets) | ✅ hecho |
| [mobile-ux-design-language.md](mobile-ux-design-language.md) | **UI/UX + motion**: deportivo, profesional, animado | ✅ hecho |
| [rn-mobile-vs-web-parity.md](rn-mobile-vs-web-parity.md) | Audit histórico del coach (vivo) + tanda de fixes 2026-06 | ✅ hecho |
| _mobile-enterprise.md_ | Coach/alumno enterprise (invite, workspace switch, org-admin, billing org) | ⏳ futuro |

---

## 2. Estado real (resumen honesto)

- **Coach standalone:** maduro en el core; bloqueantes de lanzamiento son de release/legal/enterprise (ver su doc), **no impiden** avanzar con el alumno.
- **Alumno standalone:** NO está vacío — hay scaffolding de todas las tabs. Pero está **por debajo de la web** en profundidad y tiene **bugs S1 de datos** (duplica series, fecha UTC, comidas/series offline perdidas) + **acceso sin gates** (suspendido/force-password) + **perfil mobile-missing** (sin baja de cuenta, sin control de push).
- **Causa raíz común:** sin capa de datos/manejo central, contratos no compartidos, offline frágil, gates no portados → **se resuelven en los cimientos compartidos**.
- **Oportunidad:** el alumno usa CERO ventajas nativas hoy (cámara/push/HealthKit/widgets instalados sin usar) y el deleite visual es plano → ahí está el "igualar o superar a la web".

---

## 3. Plan por olas (standalone)

### 🌊 Ola 0 — Cimientos compartidos _(base de todo; coach + alumno)_
Fuente: [mobile-shared-foundation.md](mobile-shared-foundation.md). Cierra varios S1 de ambos lados a la vez.
- `AuthProvider` único + gates de navegación (suspendido / force-password / onboarding) + manejo central de 401 + sesión en `expo-secure-store`.
- Selector Coach/Alumno + onboarding completo con consentimiento real (lo que el usuario quería bien hecho).
- Hook de carga `{loading|error|empty|data}` + `ErrorState` con retry + `ErrorBoundary` + Sentry.
- Capa `infrastructure/` (no `supabase.from` en componentes) + fix de duplicación de `workout_logs`.
- `@eva/brand-kit/motion.ts` + `useEvaMotion()` + `lib/haptics.ts` (cimiento del deleite).
- Adoptar `@eva/schemas` (password unificado) + usar `date-utils` Santiago.
- NetInfo + idempotencia `client_log_id` + cola offline per-item reusable.
- `expo-notifications` config plugin + `push_tokens` + revocar token en logout.
- EAS env prod + ATS solo dev + CI mobile (typecheck + expo export) + tests del reducer/loaders.

### 🌊 Ola 1 — Alumno standalone: paridad + integridad + deleite v1
Fuente: [alumno-web-vs-mobile.md](alumno-web-vs-mobile.md) + [ux-design-language](mobile-ux-design-language.md) + [native-advantages](mobile-native-advantages.md) (v1).
- **Integridad de datos (S1):** workout sin UTC + con `client_id`; series/comidas offline que no se pierdan ni dupliquen; barra de progreso del hero real (no 18%).
- **Paridad core:** aplicar swaps de nutrición; porción parcial; instrucciones del coach; editar serie ya registrada; resumen con PRs + 1RM; QuickLog/WeightQuickLog en home; `ProgramPhaseBar`/semana; fotos de check-in con cámara nativa.
- **Deleite v1:** `ComplianceRing` animado, count-up de números, check de serie animado + haptic, confetti de workout completado, skeleton→contenido, Pressable de marca, transiciones de pantalla. (Lenguaje visual dark-first + hero numbers + acento = acción.)
- **Nativo v1:** offline endurecido, recordatorios locales (entreno/comida/check-in), Face ID quick-unlock, scan de barras (Open Food Facts), HealthKit/Health Connect (peso + pasos), rest timer que sobrevive el lock (local), push remoto coach→alumno, rachas con streak-freeze.

### 🌊 Ola 2 — Diferenciadores "wow" + profundidad
- **Nativo v2:** Live Activity del rest timer (Dynamic Island), celebración de PR con Skia, HealthKit sesiones/FC/sueño, ghost overlay de fotos, cache de productos escaneados, win-back/badges, centro de preferencias de push.
- **Widgets** (requiere subir a **SDK 56** para `expo-widgets` oficial): UN widget iOS "próximo entreno + racha", medir adopción.
- **Deleite v2:** PR inline, racha viva, swipe-to-action, macro-fill al marcar comida, pull-to-refresh con marca.
- **Coach v2:** los S2 de su readiness review que no sean enterprise.

### 🌊 Ola 3 — Polish + aspiracional
- Polish S3 (copy/tildes, estados "sin datos", skeletons en todas, i18n), charts ricos de progreso, heatmap anual.
- **later:** wearables (app de reloj), shared element transitions, AppBackground animado, passkeys.

### ⏳ Enterprise (diferido)
Coach/alumno enterprise (canje de invite, workspace switch, org-admin mobile, billing `org_invoices`, anuncios de org, soporte con SLA). Documento propio cuando se decida abordarlo. El `AuthProvider` de Ola 0 se diseña para soportarlo sin reescritura.

---

## 4. Reglas transversales (todas las olas)

- **Sin tocar Supabase live** salvo lo aprobado; validar cada tanda con `cd apps/mobile && npx tsc --noEmit && npx expo export --platform android`.
- **pnpm** only; deps con postinstall → `pnpm-workspace.yaml#allowBuilds`.
- **Dev build** para todo lo nativo (no Expo Go); probar en **device físico** (push/HealthKit/cámara/biometría no van en simulador).
- Cada feature nueva (no bugfix) → spec (SDD) declarando estado en coach Y alumno.
- El usuario commitea/buildea.

---

## 5. Próximo paso

Documentos completos. **Recomendación:** empezar por **Ola 0 (cimientos compartidos)** — desbloquea coach y alumno a la vez y cierra los S1 de acceso/datos antes de construir pantallas. Esperando luz verde para comenzar.
