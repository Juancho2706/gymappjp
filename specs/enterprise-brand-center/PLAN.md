# PLAN — Brand Center Enterprise

> Plan ejecutable completo: `C:\Users\juanm\.claude\plans\dynamic-churning-bonbon.md` (fuente de verdad). Aquí el resumen arquitectónico.

## Fases
- **B0 — DB:** `organizations` gana `loader_text`, `use_custom_loader`, `loader_icon_mode`, `loader_text_color`, `splash_bg_color` (migración local; mirror de las columnas que ya tiene `coaches`). Reusa `brand_draft` jsonb para draftear.
- **B1 — Permisos:** gate por `orgRoleCan` vía `rolesWithOrgPermission(perm)`; edit = owner/admin/brand_manager, publish = owner/brand_manager.
- **B2 — Limpieza:** borrar mockups/jerga de `brand/page.tsx` + tabs nuevos (Identidad/Vista previa/Publicar).
- **B3 — UI/UX:** layout 2 columnas, `BrandLivePreview` WYSIWYG (loader real), readiness checklist.
- **B4 — Loader org source of truth:** `proxy.ts` + `workspace-brand.service` resuelven loader de org para coaches `org_managed`; `WorkspaceBrand` extendido; publish propaga loader de la org.
- **B5 — Splash/iconos:** rutas `ImageResponse` `/api/icon/[slug]`, `/api/splash/[slug]`; `apple-touch-startup-image` en `c/[coach_slug]/layout.tsx`; manifest usa icon route.
- **B6 — RN:** tokens de marca en `packages/types`.

## Pilares
Clean Arch (lógica en services/infra), feature-first (`brand/_components`), atomic (moléculas locales), SDD (este spec).

## Reuso
`generateBrandPalette`, `EvaRouteLoader`, `orgRoleCan`, `uploadOrgLogoAction`, `resolveBrandForWorkspace`, helpers de contraste.
