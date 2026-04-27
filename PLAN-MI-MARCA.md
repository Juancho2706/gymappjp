# Plan "Mi Marca" White Label — EVA App
> Generado por Claude Code · 2026-04-26

---

## PENDIENTE INMEDIATO: Loader morph animation para texto custom

### Diagnóstico
- `eva-loader-text-shine` CSS class = `background-position` slide en `background-size: 200%` → colores fluyen a través de las letras (el "morph")
- `eva-loader-word-pulse` = opacity/scale pulse simple — lo que el coach recibe cuando tiene `textColor`
- EVA usa `eva-loader-text-shine` con gradient `#8b5cf6 → #06b6d4 → #10b981 → #8b5cf6` (un solo `<span>`, no letras individuales)
- Coach custom con color → `eva-loader-word-pulse` (sin morph) ← **aquí está el problema**

### Fix: `src/components/ui/EvaRouteLoader.tsx`

Cuando `hasCustomColor = true`, en lugar de `eva-loader-word-pulse` + solid color:
1. Importar `generateBrandPalette` de `@/lib/color-utils`
2. Computar `palette = generateBrandPalette(textColor)`
3. Construir gradient brandado: `linear-gradient(90deg, ${palette.primaryLight}, ${palette.primary}, ${palette.primaryDark}, ${palette.primaryLight})`
4. Aplicar `bg-clip-text text-transparent eva-loader-text-shine` — mismo CSS, misma animación, paleta del coach
5. Eliminar `eva-loader-word-pulse` del render del texto

```tsx
// ANTES (línea ~73-87)
const hasCustomColor = Boolean(textColor)
// hasCustomColor → 'eva-loader-word-pulse' + { color: textColor }
// !hasCustomColor → 'eva-loader-text-shine' + EVA purple/cyan gradient

// DESPUÉS
import { generateBrandPalette } from '@/lib/color-utils'

const loaderGradient = textColor
    ? (() => {
        const p = generateBrandPalette(textColor)
        return `linear-gradient(90deg, ${p.primaryLight}, ${p.primary}, ${p.primaryDark}, ${p.primaryLight})`
      })()
    : 'linear-gradient(90deg, #8b5cf6, #06b6d4, #10b981, #8b5cf6)'

// El span siempre usa el mismo className:
// className="bg-clip-text text-transparent eva-loader-text-shine font-display font-extrabold leading-none ..."
// style={{ backgroundImage: loaderGradient }}
// → eliminar la rama hasCustomColor en className y style
```

**Resultado**: texto del coach (ej. "JOSEFIT") hace exactamente el mismo morph que E-V-A, con variantes claras/oscuras derivadas de su color de marca.

**Archivo CSS a consultar**: `src/app/globals.css` líneas ~627-690
**Keyframe responsable**: `@keyframes eva-loader-text-shine { 0% { background-position: 0% center } 100% { background-position: 200% center } }`

---

## CAMBIOS YA IMPLEMENTADOS (en esta sesión)

### color-utils.ts
- `hexToRgb()` — centralizado, elimina duplicados
- `getContrastInfo(hex)` — WCAG contrast ratio, devuelve `textColor: '#ffffff' | '#000000'`
- `generateBrandPalette()` — ahora devuelve `primaryForeground` calculado con WCAG

### BrandSettingsForm.tsx
- `brandScore` (0-100%) — barra de progreso de completitud de marca
- `contrast` badge WCAG — Shield icon AA/AA-large/fail inline con el color picker
- `isDirty` + `beforeunload` — warning al navegar con cambios sin guardar
- Reset to default button — `BRAND_PRIMARY_COLOR` del sistema
- QR memoizado con `useMemo`
- Toggle loader style: "Gradiente animado" vs "Color sólido"
- Eliminado `hexToRgb` local duplicado

### LogoUploadForm.tsx
- Zona drag-and-drop completa con HTML5 drag events
- Hint "512×512px, fondo transparente recomendado"
- Visual drag highlight state

### StudentDashboardPreview.tsx
- Bug fix: `logoUrl` no llegaba a `DesktopFrame` → `DashboardScreen` ahora acepta `logoUrl: string | null`
- Logo mostrado en sidebar desktop con fallback a inicial coloreada

### BrandSettingsTourClient.tsx
- `storageKey` scoped por coach: `eva:brand-settings-tour-seen:${coachId}`
- Evita conflicto entre coaches en mismo browser

### `src/app/c/[coach_slug]/layout.tsx` y `src/app/coach/layout.tsx`
- CSS vars añadidas: `--theme-primary-foreground`, `--primary`, `--primary-foreground`
- Usan `palette.primaryForeground` (WCAG-calculado)

### Login/change-password buttons
- `ClientLoginForm.tsx`: botón usa `color: 'var(--primary-foreground, #ffffff)'`
- `change-password/page.tsx`: ídem
- Eliminada clase `btn-theme` inexistente

### Dashboard page.tsx
- Eliminados 7 Suspense boundaries granulares → usa `loading.tsx` de ruta
- Loader limpio sin skeleton mess

---

## FIXES PENDIENTES MENORES

| # | Archivo | Issue |
|---|---------|-------|
| 1 | `actions.ts` ~77 | `previous_slugs` array sin límite — agregar `if (len >= 10) shift()` |
| 2 | `actions.ts` logo upload | Solo valida extensión, no magic bytes — agregar check JPEG/PNG signature |
| 3 | `LogoUploadForm.tsx` ~160 | Múltiples uploads rápidos crean memory leak en `URL.revokeObjectURL` — revocar en `processFile` antes de crear nuevo |
| 4 | `BrandSettingsTour.tsx` ~128-137 | Tour card puede salirse de viewport en < 375px |

---

## ROADMAP FUTURO (docs/WHITE-LABEL-ROADMAP.md)

### Sprint 1 — Quick wins
- Custom domain: `[slug].eva-app.cl` wildcard subdomain
- Brand Score gamificado (% completado)
- Landing pública `/c/[slug]` antes del login

### Sprint 2 — Diferenciadores
- Fuente tipográfica (selector Google Fonts ~20 opciones)
- Color secundario/acento
- Dark mode palette configurable

### Sprint 3 — Alto impacto
- Compartir imagen brandada (canvas/OG)
- Email transaccional brandado (Resend)
- Push notifications con nombre del coach

### Sprint 4 — Largo plazo
- Custom domain real (CNAME + SSL)
- App nativa iOS/Android white-label (Capacitor)
