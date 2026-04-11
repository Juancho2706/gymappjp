# ENG-119 / ENG-120 — Lighthouse y LCP landing

## Rutas a auditar (ENG-119)

Ejecutar Lighthouse (Chrome) o CLI contra entorno estable (staging o `npm run build && npm start`):

- `/`
- `/pricing`
- `/register`
- `/login`
- `/coach/dashboard` (requiere sesión coach; usar ventana ya logueada o script con storage)
- `/c/[slug]/dashboard` (requiere alumno + slug real)

**Objetivos orientativos (PLAN-MAESTRO):** Performance ≥ 90, Accessibility ≥ 90 en rutas públicas principales cuando el entorno y datos son representativos.

## Registro de resultados

| Ruta | Fecha | Perf | A11y | Best practices | SEO | Notas |
|------|-------|------|------|----------------|-----|-------|
| / | | | | | | |
| /pricing | | | | | | |
| … | | | | | | |

## CLI (opcional)

Con Chrome instalado y URL base:

```bash
npx lighthouse https://tu-dominio/ --only-categories=performance,accessibility --output html --output-path ./lighthouse-report.html
```

## ENG-120 — Cambios aplicados en código

- **Landing:** `DashboardMockup` se carga con `next/dynamic` (`ssr: false`) y placeholder ligero para reducir trabajo inicial y mejorar LCP percibido.
- **Fuentes:** `display: 'swap'` ya configurado en `src/app/layout.tsx` (`Inter`, `Montserrat`).
- **Demo en vídeo:** iframe con `loading="lazy"` en `src/components/landing/DemoVideoSection.tsx`.

Re-ejecutar Lighthouse en `/` tras desplegar para comparar LCP.
