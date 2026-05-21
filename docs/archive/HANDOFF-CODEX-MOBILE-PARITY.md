# Handoff Mobile Visual Parity (Codex AI continuation)

## TL;DR

Estoy a mitad de un plan de 7 fases para llevar la app `apps/mobile/` a **~95%+ visual parity con la PWA web `apps/web/`** así coaches y alumnos que ya usan PWA en prod no sienten diferencia al migrar a APK/IPA. Fases 1-3+4 (parcial) hechas y pusheadas. Falta terminar Fase 3+4 (screens restantes), Fase 5A-E (mobile-only polish + alumno dashboard rico + coach signup/dashboard), Fase 6 (branding white-label), Fase 7 (rebuild APK + verify).

**Branch:** `v2/enterprise`
**Último commit pusheado:** `80fccb4`
**Plan completo:** `C:\Users\juanm\.claude\plans\antes-de-eso-quiero-compiled-narwhal.md`

---

## Contexto crítico

- **Workspace monorepo** con `apps/web/` (Next.js + Tailwind v4) y `apps/mobile/` (Expo SDK 54 + Expo Router v6).
- Login mobile contra Supabase prod **funciona** (commit `f4cae71` arregló secrets vacíos del workflow `mobile-build.yml`).
- Workflow GH Actions `Mobile Build` permite APK Android + IPA iOS via `eas build --local` (sin gastar EAS credits). Profile clave: `prodpreview` (apunta a Supabase prod via `NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY` secrets).
- iOS submit a TestFlight automático: workflow input `submit_ios=true`, secrets `ASC_API_KEY_ID`/`ASC_API_ISSUER_ID`/`ASC_API_KEY_P8` ya configurados, `ascAppId: 6770426633`, `appleTeamId: 5GKWMMZ46Q`.
- iOS build con `prodpreview` ya tiene `ios.distribution: "store"` para TestFlight path.
- Memory rules en `C:\Users\juanm\.claude\projects\d--Proyectos-Antigravity-gymappjp\memory\` documentan reglas (rama v2/enterprise, Supabase local para dev excepto excepción mobile-prod-preview testing).

---

## Stack mobile actual (commit 80fccb4)

### Deps instaladas (Phase 1 ✅)
- `lucide-react-native ^1.16.0` + `react-native-svg 15.12.1`
- `react-native-reanimated ~4.1.1` + `moti ^0.30.0`
- `expo-linear-gradient ~15.0.8`
- `expo-keep-awake ~15.0.8`
- Babel plugin `react-native-worklets/plugin` agregado en [apps/mobile/babel.config.js](apps/mobile/babel.config.js) (Reanimated v4 usa worklets, NO `react-native-reanimated/plugin` que es v3).

### Primitives library (Phase 2 ✅)
Carpeta nueva `apps/mobile/components/` con barrel export en `index.ts`:
- `Button.tsx` (variants primary/electric/outline/ghost/destructive/glass/secondary; sm/md/lg; left/right LucideIcon; loading; full)
- `Input.tsx` (label, leftIcon, trailingLabel slot, error, md/lg)
- `Card.tsx` (default/highlighted/success/destructive; padding; radius lg/xl/2xl; highlighted obtiene shadowGlowBlue)
- `Section.tsx` + `InfoRow` (uppercase Montserrat title, hairline rows)
- `Badge.tsx` (tones primary/success/destructive/muted/cyan; sm/md; toneColor override)
- `EmptyState.tsx` (lucide icon + title + subtitle + opcional action)
- `ScreenHeader.tsx` (28px Montserrat title + 13px Inter subtitle + trailing slot)
- `TopBar.tsx` (brand "EVA" o back ChevronLeft + opcional título centrado)
- `ComplianceRing.tsx` (SVG circle progress, % center, branded color)
- `Sparkline.tsx` (SVG line + gradient area, 1.75 stroke)
- `MacroPill.tsx` (tinted bg + branded value + label + unit opcional)
- `StreakCounter.tsx` (Flame icon orange + días)

Todos consumen `theme` vía `useTheme()` de `apps/mobile/context/ThemeContext.tsx`.

### Screens refactorizadas (Phase 3+4 parcial ✅)
- [apps/mobile/app/(auth)/login.tsx](apps/mobile/app/(auth)/login.tsx) — Sparkles brand pill, Mail/Lock/ArrowRight icons, MotiView fade-in + stagger
- [apps/mobile/app/(auth)/forgot-password.tsx](apps/mobile/app/(auth)/forgot-password.tsx) — KeyRound hero, Mail input, success state con spring scale
- [apps/mobile/app/alumno/codigo.tsx](apps/mobile/app/alumno/codigo.tsx) — Hash hero, ArrowRight, MotiView
- [apps/mobile/app/coach/(tabs)/clientes.tsx](apps/mobile/app/coach/(tabs)/clientes.tsx) — Search/ChevronRight/Users icons, MotiView stagger per card
- [apps/mobile/app/alumno/(tabs)/workout.tsx](apps/mobile/app/alumno/(tabs)/workout.tsx) — Dumbbell/ChevronRight/RefreshCw, MotiView stagger
- [apps/mobile/app/alumno/(tabs)/check-in.tsx](apps/mobile/app/alumno/(tabs)/check-in.tsx) — Camera/Scale/Zap/Check/Image icons, success Moti spring
- [apps/mobile/app/coach/(tabs)/_layout.tsx](apps/mobile/app/coach/(tabs)/_layout.tsx) — tabBarIcon: Users/Dumbbell/Apple/CheckCircle/User
- [apps/mobile/app/alumno/(tabs)/_layout.tsx](apps/mobile/app/alumno/(tabs)/_layout.tsx) — tabBarIcon: Dumbbell/Apple/CheckCircle/User

---

## Pendiente (lo que tenés que hacer)

### Phase 3+4 — Resto de screens (~1.5hrs)

Estas siguen con código pre-primitives (theme tokens consistentes pero sin lucide icons ni Moti). Aplicar mismo patrón:
- Importar `Button`, `Input`, `ScreenHeader`, `EmptyState`, `Badge`, `Section`, `InfoRow`, `Card` desde `'../../../components'` (ajustar path).
- Reemplazar emojis (📷 ✓ → ←) + texto-flecha por íconos lucide.
- Wrap content principal en `<MotiView from={{opacity:0, translateY:20}} animate={{opacity:1, translateY:0}} transition={{type:'timing', duration:500}}>`.
- Listas: stagger por index `delay: Math.min(index * 50, 400)`.

**Pendientes:**
1. [apps/mobile/app/(auth)/reset-password.tsx](apps/mobile/app/(auth)/reset-password.tsx) — leer + refactorear igual que forgot-password (KeyRound + Eye/EyeOff toggle visibility en password)
2. [apps/mobile/app/coach/(tabs)/builder.tsx](apps/mobile/app/coach/(tabs)/builder.tsx) — Dumbbell, Calendar para DOW, EmptyState con Dumbbell
3. [apps/mobile/app/coach/(tabs)/check-ins.tsx](apps/mobile/app/coach/(tabs)/check-ins.tsx) — Camera (foto), Activity (energy), Calendar (date), MotiView stagger per checkin
4. [apps/mobile/app/coach/(tabs)/nutricion.tsx](apps/mobile/app/coach/(tabs)/nutricion.tsx) — UtensilsCrossed, Apple, BadgeCheck
5. [apps/mobile/app/coach/(tabs)/perfil.tsx](apps/mobile/app/coach/(tabs)/perfil.tsx) — User/Building2/CreditCard/LogOut/ExternalLink; usar `Section` + `InfoRow` primitives
6. [apps/mobile/app/coach/cliente/[clientId].tsx](apps/mobile/app/coach/cliente/[clientId].tsx) — User avatar bg, Phone/Target/Calendar/Bell/Activity/Dumbbell; refactor con `Section`/`InfoRow`/`Card`
7. [apps/mobile/app/alumno/(tabs)/nutricion.tsx](apps/mobile/app/alumno/(tabs)/nutricion.tsx) — UtensilsCrossed, Check, Apple empty, Flame kcal; usar `MacroPill` primitive
8. [apps/mobile/app/alumno/(tabs)/perfil.tsx](apps/mobile/app/alumno/(tabs)/perfil.tsx) — User/UserCog/LogOut; refactor con primitives
9. [apps/mobile/app/alumno/workout/[planId].tsx](apps/mobile/app/alumno/workout/[planId].tsx) — ChevronLeft (back), Timer (rest banner), Check (set done), Trophy (PR); usar `TopBar back title=planTitle`; MotiView stagger por BlockCard

### Phase 5A — Splash + role selector polish (~1hr)
- [apps/mobile/app/index.tsx](apps/mobile/app/index.tsx) — agregar:
  - `expo-linear-gradient` LinearGradient bg `colors={[theme.background, theme.primary + '0A', theme.background]}`
  - Grid pattern overlay opacity 3% (SVG pattern via react-native-svg Defs+Pattern)
  - Brand pill con `Sparkles` icon + "Bienvenido" (mismo style que login)
  - Dumbbell + Activity icons en los 2 botones (reemplazar emojis 🏋️ 💪)
  - MotiView entrance: brand scale 0.9→1 + slide-up; botones staggered delay 300/450ms
- [apps/mobile/app/_layout.tsx](apps/mobile/app/_layout.tsx) — al ocultar SplashScreen, agregar transición Moti fade del primer screen.

### Phase 5B — Alumno dashboard rico (~2.5hrs)

**Biggest gap.** Web tiene dashboard rico en `/c/[coach_slug]/dashboard` (paths web en plan file). Mobile actualmente solo tiene 4 tabs simples.

**Crear nueva route `apps/mobile/app/alumno/(tabs)/home.tsx`** o reemplazar `workout.tsx` como home:

- `DashboardHeader`: saludo time-aware ("Buenos días, {firstName}") + `StreakCounter` (Flame badge días seguidos con workout completado)
- `WeekCalendar`: scroll horizontal 7 días, dot por día con workout logged (color branded), tap → expandir
- `CheckInBanner` condicional si no hay check-in del mes (link → /check-in)
- `WorkoutHeroCard`: si hay workout hoy → nombre plan + CTA "Empezar" + progress bar sets/target; si NO → `RestDayCard` con próximo workout teaser
- 3 `ComplianceRing` row (workout adherence 30d, nutrition 30d, check-in 30d) — usar primitive existente
- `ActiveProgramSection`: nombre programa + phase bar (linear progress)
- `RecentWorkoutsSection`: últimos 3-5 workouts con timestamp + sets done (Card list)
- `WeightSparkline`: peso actual + trend arrow + `Sparkline` primitive 30d

**Queries Supabase:**
- `workout_programs` (active program + workout_plans)
- `workout_logs` (últimos 30d para sparkline weight si existe campo, o `check_ins.weight`)
- `check_ins` (último, count 30d para compliance)
- `daily_nutrition_logs` + `nutrition_meal_logs` (compliance nutrición 30d)

**Tabs alumno suben a 5:** Home / Workout (current → renombrar a "Rutina" o mantener) / Nutrición / Check-in / Perfil. Actualizar [apps/mobile/app/alumno/(tabs)/_layout.tsx](apps/mobile/app/alumno/(tabs)/_layout.tsx) con nuevo tab `home` + icon `Home`.

### Phase 5C — Coach signup mobile (~1hr)

Nuevo: [apps/mobile/app/(auth)/register.tsx](apps/mobile/app/(auth)/register.tsx)

- 3 pasos: datos personales (full_name, brand_name, email, password) → plan (tier picker, **solo `free` para v1 mobile, paid → "Completá en eva-app.cl"**) → confirmación
- Reuse logic: `supabase.auth.signUp({ email, password })` → si OK, insert en `coaches` con free tier defaults. Reference: [apps/web/src/app/(auth)/register/actions.ts](apps/web/src/app/(auth)/register/actions.ts) líneas 130-215 para el flow free.
- Usar primitives `Button`, `Input`, `TopBar back showBrand`, `MotiView` stagger por step.
- Sanitize email con `email.trim().toLowerCase()` (web tiene `sanitizePlatformEmail` para esto — replicar inline en RN o exponer endpoint, NO importar de web).
- Después de signup OK + insert: `router.replace('/(auth)/login?role=coach')` con mensaje "Revisa tu correo para confirmar".

Linkear desde login screen: agregar al final `<TouchableOpacity onPress={() => router.push('/(auth)/register')}>Crear cuenta nueva</TouchableOpacity>`.

### Phase 5D — Coach home dashboard (~30min)

Nuevo tab: [apps/mobile/app/coach/(tabs)/home.tsx](apps/mobile/app/coach/(tabs)/home.tsx)

- Stats simples (Card row):
  - Total alumnos activos (`clients.is_active=true count`)
  - Check-ins esta semana (`check_ins date>=monday count`)
  - Workouts hoy (`workout_plans assigned_date=today count`)
- Lista próximos workouts hoy (clients name + plan name + CTA tap → cliente detail)
- Sin charts complejos (`DashboardCharts` web es overkill mobile)

Actualizar [apps/mobile/app/coach/(tabs)/_layout.tsx](apps/mobile/app/coach/(tabs)/_layout.tsx) — agregar tab `home` con icon `LayoutDashboard` como primero (antes de clientes).

### Phase 5E — Reset password polish (~30min)

Refactor [apps/mobile/app/(auth)/reset-password.tsx](apps/mobile/app/(auth)/reset-password.tsx) (ya está en Phase 3+4 pendientes pero merece mención):
- KeyRound icon hero
- 2 inputs password + confirm password con Eye/EyeOff toggle visibility
- Match validation inline
- Success state con Check icon + "Contraseña actualizada"

### Phase 6 — Coach branding propagation (~1hr)

Verificar [apps/mobile/context/ThemeContext.tsx](apps/mobile/context/ThemeContext.tsx) usa `applyCoachBranding(base, branding.primaryColor)` cuando `branding != null`. Si no, fix:

```tsx
const { branding } = useContext(...)
const theme = useMemo(() => {
  const base = colorScheme === 'dark' ? darkTheme : lightTheme
  return branding?.primaryColor ? applyCoachBranding(base, branding.primaryColor) : base
}, [colorScheme, branding?.primaryColor])
```

Resultado: alumno post-codigo ve botones/iconos/anillos con color del coach (same white-label que PWA).

### Phase 7 — Verify + APK rebuild (~1hr)

1. `cd apps/mobile && npx tsc --noEmit` desde root con `-p apps/mobile/tsconfig.json`
2. (opcional) `expo start` local + Expo Go en device para iterar fast
3. GH Actions → Mobile Build → workflow_dispatch:
   - App: `mobile`, Platform: `android`, Profile: `prodpreview`, Branch: `v2/enterprise`
4. Descargar APK del artifact → instalar en device Android
5. iOS: mismo workflow con `Platform: ios`, `submit_ios: true` → TestFlight automático (~30-45min build + ~15-30min Apple processing)
6. Walkthrough comparativo: PWA `eva-app.cl` en Chrome mobile vs APK side-by-side. Verificar login, coach clientes, alumno workout, alumno check-in, alumno nutrición.

---

## Reference paths web (para visual)

| Patrón mobile | Web reference |
|---|---|
| Login | [apps/web/src/app/(auth)/login/page.tsx](apps/web/src/app/(auth)/login/page.tsx) |
| Brand mark | [apps/web/src/components/landing/LandingBrandMark.tsx](apps/web/src/components/landing/LandingBrandMark.tsx) |
| Hero/landing | [apps/web/src/components/landing/LandingHeroSection.tsx](apps/web/src/components/landing/LandingHeroSection.tsx) |
| Coach client card | [apps/web/src/components/coach/ClientCardV2.tsx](apps/web/src/components/coach/ClientCardV2.tsx) |
| Alumno dashboard rich | [apps/web/src/app/c/[coach_slug]/dashboard/page.tsx](apps/web/src/app/c/[coach_slug]/dashboard/page.tsx) + `_components/*` (hero, calendar, checkin, compliance, habits, streak, weight, records, history, program, nutrition, header) |
| Bottom nav alumno | [apps/web/src/components/client/ClientNav.tsx](apps/web/src/components/client/ClientNav.tsx) |
| Button variants | [apps/web/src/components/ui/button.tsx](apps/web/src/components/ui/button.tsx) |
| Skeleton brand-color-mixed | [apps/web/src/app/c/[coach_slug]/dashboard/_components/dashboard-skeletons.tsx](apps/web/src/app/c/[coach_slug]/dashboard/_components/dashboard-skeletons.tsx) |
| Globals CSS (radius/fonts/shadows/colors) | [apps/web/src/app/globals.css](apps/web/src/app/globals.css) |

---

## Reglas a respetar

1. **NUNCA push a master desde v2/enterprise** sin autorización explícita. Email hotfix de hoy fue excepción acordada.
2. **Branch:** `v2/enterprise` siempre.
3. **Supabase local** (`127.0.0.1:54321`) en `npm run dev` (web). Mobile `prodpreview` profile apunta a prod via GH Actions secrets (intencional, read-only auth testing).
4. **MCP Supabase apunta a PROD** — solo para queries read-only de diagnóstico, no para devs.
5. **Cada deps install** → rebuild APK. ~15-20min Android, 30-45min iOS via GH Actions.
6. **Commit granular** por fase. Mensaje en formato conventional commits, body explicando "why".
7. **Co-Author** en commits: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` (o tu modelo).
8. **NO** importar código de `apps/web/` en `apps/mobile/` — solo usar como **reference visual**. Replicar valores, no compartir runtime.

---

## Estado git

```
v2/enterprise → 80fccb4 (push OK)
master        → 4c1e637 (email hotfix, no tocar)
```

Commits hechos esta sesión (Phase 1-4 parcial):
- `e2a4199` chore(mobile): add lucide-react-native, react-native-svg, reanimated, moti, expo-linear-gradient, expo-keep-awake
- `a89655c` feat(mobile): extract reusable design primitives library
- `80fccb4` feat(mobile): apply lucide icons + Moti animations to auth, tab bars, alumno workout/checkin, coach clientes

---

## Lo que MENOS conviene tocar

- Workout/nutrition builder editors → web-only (drag-drop complejo)
- Admin panel mobile → web-only (intencional, seguridad)
- Enterprise org admin mobile → web-only (uso poco frecuente)
- Templates/Recipes/Exercises catalog CRUD → web-only
- Apple IAP → no aplica (MP funciona OK como servicio externo)
- Messaging/chat → postergado v1.1
- HealthKit/Health Connect → postergado v1.1
