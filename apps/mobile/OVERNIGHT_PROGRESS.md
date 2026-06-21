# OVERNIGHT — Progreso (append-only)

> Una entrada por turno. Memoria durable a través de compactaciones de contexto.
> Formato por entrada:
> ## <timestamp> — <Txx nombre>
> - estado: done | blocked | partial
> - archivos: ...
> - validación: tsc exit=<n> / expo exit=<n>
> - commit: <hash o "—">
> - próxima: <Txx>
> - learnings/gotchas: ...

---

## 2026-06-21 01:33 — T1 Paleta macro canónica
- estado: done
- archivos: lib/theme.ts (interface +macro scheme-aware, light/dark, export MACRO_COLORS central), components/MacroRingSummary.tsx (re-export MACRO_COLORS desde theme, rings usan theme.macro.*, over/goal via theme.macro)
- validación: tsc exit=0 / expo exit=0
- commit: (siguiente)
- próxima: T2 filtros ejercicios
- learnings/gotchas: solo 2 consumidores de MACRO_COLORS (MacroRingSummary + FoodSearchSheet); FoodSearchSheet sigue importando desde '../MacroRingSummary' (re-export mantiene compat). NO toqué tailwind.config/global.css: ningún componente mobile usa clases macro-*; el hogar correcto de estos colores (StyleSheet) es theme.ts. Valores canónicos: protein #5E9FD6/#7FB3E0, carbs #FFB74D/#FFC97A, fats #81C784/#A0D6A3, over #EF4444, goal #10B981.

---

## 2026-06-21 ~01:40 — T2 Filtros ejercicios "Con video"
- estado: done
- archivos: lib/exercises.ts (+exerciseHasVideo), app/coach/(tabs)/ejercicios.tsx (state videoOnly + chip "Con video" + filtro + key), app/alumno/(tabs)/exercises.tsx (import + state + toggle row + filtro)
- validación: tsc exit=0 / expo exit=0
- commit: (siguiente)
- próxima: T3 subscription display
- learnings/gotchas: "Personalizados" en coach YA existe como tab "Míos" (source==='own') → no dupliqué chip; agregué solo "Con video" en coach. Alumno no tiene ownership (ve coach+system) → solo "Con video". exerciseHasVideo = youtube(video_url) || gif_url || video_url .mp4/.webm/.mov/.gif. AC plural "toggles" cubierto por la combinación tab-origen + chip-video en coach; alumno = chip-video.

## 2026-06-21 ~01:55 — T3 Subscription display parity
- estado: done
- archivos: lib/coach-subscription.ts (tipos AddonLive/PaymentEvent/BillingBreakdown/CardInfo + MODULE_LABELS inline + extractEventAmountClp + getCoachSubscriptionOverview ahora lee card/addons/events/snapshot directos), app/coach/(tabs)/subscription.tsx (cards Facturacion, Modulos activos con badge Cortesia EVA, Tarjeta, Historial de pagos; helper formatClp + BreakdownRow)
- validación: tsc exit=0 (2º intento) / expo exit=0
- commit: (siguiente)
- próxima: T4 login alumno brandeado
- learnings/gotchas: GOTCHA importante — el endpoint web /api/payments/subscription-status usa createClient() (sesion por COOKIE) → NO acepta el Bearer de mobile (devolveria 401). Solucion: leer DIRECTO por PostgREST bajo la sesion del coach (RLS SELECT-own) las tablas coaches(card_*)/coach_addons/subscription_events/billing_snapshots; el total compuesto sale del ultimo billing_snapshot (congelado) → NO recomputo precios (no duplico la logica de @/lib/constants ni services/billing, que no estan en packages). MODULE_LABELS inline (4 keys estables) en vez de @eva/module-catalog (no importado en mobile, evitar fallo de resolucion). GOTCHA tsc: el builder de supabase es PromiseLike (sin .catch) → usar IIFE async + try/catch, no .then().catch(). Todas las lecturas guarded → pantalla degrada elegante. Render gated por presencia (vacio = no se muestra la card). Verificacion runtime = en device.

## 2026-06-21 ~02:05 — T4 Login alumno brandeado
- estado: done
- archivos: lib/branding.ts (+welcomeMessage en CoachBranding + welcome_message en BRANDING_COLS_RICH + mapping), app/(auth)/login.tsx (import Image, branding del context, heading brandeado para alumno = logo 80x80 + displayName + welcomeMessage, footer "Impulsado por EVA")
- validación: tsc exit=0 / expo exit=0
- commit: (siguiente)
- próxima: — (fin scope Medio)
- learnings/gotchas: welcome_message va en BRANDING_COLS_RICH; si anon no tiene grant de columna, el query RICH falla y cae a BRANDING_COLS_MIN (sin welcome) → degrada solo, sin romper. El path coach del login queda INTACTO (branch solo para !isCoach && branding). branding llega via useTheme().branding (ThemeContext ya lo hidrata desde AsyncStorage + +native-intent lo cachea al abrir /c/slug). Verificacion runtime (logo real + welcome) = en device con un coach que tenga logo_url + welcome_message.

## RESUMEN FINAL
Corrida overnight 2026-06-21 (~01:33–02:05), scope Medio (T1-T4), rama feat/rn-parity-overnight, worktree D:/tmp/gymappjp-rn-overnight.

DONE (4/4, todas tsc exit=0 + expo exit=0 + commit):
- T1 paleta macro canonica — commit 01b80000
- T2 filtro "Con video" en ejercicios — commit 5bdc2e53
- T3 subscription display parity (solo lectura) — commit aa392ab9
- T4 login alumno brandeado — commit (este)
BLOCKED: ninguna.

REVISAR EN LA MANANA (todo verificable solo en device — el bundle/tsc no lo cubre):
1. T1: abrir nutricion (alumno + coach) → anillos macro deben verse en paleta calma (azul/durazno/verde), no naranja/azul/amarillo. Modo claro y oscuro.
2. T2: pantalla Ejercicios (coach) chip "Con video" filtra; alumno "Aprender Tecnica" idem. Combinar con musculo/busqueda.
3. T3: suscripcion de un coach con add-on activo y/o billing_snapshot → deben aparecer cards Facturacion/Modulos(badge Cortesia EVA)/Tarjeta/Historial. Coach sin esos datos → cards ocultas (degrada). Verificar que coaches.card_* y subscription_events sean legibles por la sesion del coach (RLS/grants); si una lectura no tiene permiso, queda vacia (no rompe).
4. T4: login de alumno via /c/<slug> o codigo de un coach con logo_url + welcome_message → debe verse logo + nombre de marca + mensaje. Coach login sin cambios. Confirmar que anon puede leer welcome_message (si no, cae a fallback sin welcome).

RETOMAR / MERGEAR:
- Diffs: git -C D:/tmp/gymappjp-rn-overnight diff master..feat/rn-parity-overnight -- apps/mobile
- Gate: cd D:/tmp/gymappjp-rn-overnight/apps/mobile && npx tsc --noEmit && npx expo export --platform android
- Mergear a master por flujo normal de PR (rama feat/rn-parity-overnight). Build EAS para device.
- Limpiar worktree al terminar: git worktree remove D:/tmp/gymappjp-rn-overnight
PROXIMO scope sugerido (no hecho): T5 Areas settings, o pasar a P0/P1 del informe (workout polimorfico, modulos pagos) que requieren packages/DB y NO son aptos unattended.
