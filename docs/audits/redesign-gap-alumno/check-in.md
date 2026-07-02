# Auditoría fidelidad visual — Alumno · Check-in mensual

Área: `/c/[coach_slug]/check-in` (wizard 3 pasos: peso+energía → fotos → notas+resumen).

- **KIT (mobile/primario):** `docs/design-source/ui_kits/eva-app/screens/alumno.jsx` — `CheckIn()` (líneas 764-899) + `CI_PhotoSlot` (741-762); `TopBar` en `shared.jsx:42-59`; `.eva-metric` en `docs/design-source/tokens/base.css:36-41` (font-display · fw-black 900 · `--ls-tighter` -0.03em · tabular).
- **KIT (desktop ≥760):** sin rebuild — `DESKTOP-OPT-PLAN.md` Ola 2: "Check-in se mantiene como wizard centrado (buena UX desktop)". No hay `Desktop*Checkin` en el kit desktop; solo un link `Check-in` en el dashboard desktop (`desktop-coach.jsx:434`).
- **APP:** `apps/web/src/app/c/[coach_slug]/check-in/page.tsx` (wrapper) + `CheckInForm.tsx` (wizard) + tokens en `apps/web/src/app/globals.css`.

## Resumen

El wizard está transcrito **1:1** con el kit: TopBar (subtítulo "Paso X de 3" + h1 display 26px), stepper de 3 barras (activa `flex 1.6`, hechas = color coach, pendientes `--ink-200`), banner disclaimer médico (`warning-100`/`warning-500`/`shield-alert`), Paso 1 (card "último check-in" sunken + card "Peso actual" con stepper ±0.1 y número 48px + card "Nivel de energía" con slider `accentColor` coach), Paso 2 (dos `CI_PhotoSlot` aspect 3/4, dashed→`sport-500` en preview, X `danger-500`, gradiente + label, línea `lock` "JPG, PNG o WEBP · máx 5 MB…"), Paso 3 (textarea 1000 chars + card "Resumen" con 3 métricas + banner `wifi-off` de error), y estado enviado (círculo 88px `success-500` + h1 27px + botón "Volver al inicio"). Padding de cards (`lg`=20 / `md`=16), variantes (`sunken` = surface-sunken + shadow-none), colores, tamaños de ícono y copys coinciden. Wrapper `mx-auto max-w-lg` = "wizard centrado" en desktop, exactamente lo pedido por DESKTOP-OPT-PLAN.

Diferencias respecto al kit = **riqueza extra de la app** (no son gaps, se mantienen): link "Atrás" en el TopBar (el kit no lo trae en esta pantalla), overlay "Optimizando…" en la foto, `SuccessWaveOverlay` + confetti brandeado, empty-state "Tu primer check-in", `focus-visible` ring en el textarea, `disabled` de "Continuar" sin peso.

**Sin P0. Sin P1.** Solo dos nits de token/ícono.

---

## Hallazgos

### [P2] Números métricos sin el tightening `-0.03em` de `.eva-metric`
- **Kit:** `base.css:36-41` — `.eva-metric { font-family: var(--font-display); font-weight: var(--fw-black)/*900*/; letter-spacing: var(--ls-tighter)/* -0.03em */; font-feature-settings: tabular }`. En `alumno.jsx` el peso (línea 830, `fontSize 48`), el valor de energía (840, `fontSize 16`) y las 3 métricas del Resumen (874, `fontSize 18`) usan `className="eva-metric"`.
- **App:** `CheckInForm.tsx:451` (peso), `:472` (energía), `:665` (resumen) usan `font-display … font-black tabular-nums` **sin** `tracking`, por lo que heredan `letter-spacing: normal` (0). El peso `font-black` (900) y `tabular-nums` sí matchean; solo falta el interletraje. (Nota: el `.eva-metric` propio de la app en `globals.css:1253` está desalineado con el kit —800 y -0.01em— pero esta pantalla no lo usa.)
- **Diferencia:** el número héroe (48px) se ve ~0.03em más suelto/menos compacto que el "look métrico deportivo" del kit. Sutil pero transversal a todas las métricas de la pantalla.
- **Fix:** agregar `tracking-[-0.03em]` (o `[letter-spacing:-0.03em]`) a los tres spans métricos: líneas 451, 472 y 665.

### [P2] Ícono del estado "enviado": círculo-dentro-de-círculo en vez de check limpio
- **Kit:** `alumno.jsx:789` — círculo 88px `success-500` con un check **desnudo** (`Ic('check', { size: 44 })`).
- **App:** `CheckInForm.tsx:332` — mismo círculo 88px `success-500`, pero el ícono es `<CheckCircle2 className="h-11 w-11" />` (check **encerrado en su propio círculo**), lo que dibuja un aro blanco extra dentro del círculo verde.
- **Diferencia:** doble aro (círculo dentro de círculo) vs. el checkmark suelto del kit.
- **Fix:** usar el `Check` liso (ya importado en línea 9) en la tarjeta de éxito: reemplazar `CheckCircle2` por `Check` en la línea 332.

---

Verificado 1:1 (salvo los 2 nits P2 anteriores; 0 P0, 0 P1).
