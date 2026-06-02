# TASKS — Brand Center Enterprise

## B0 — DB
- [ ] Migration `org_brand_loader_splash.sql`: ADD COLUMN loader_text/use_custom_loader/loader_icon_mode/loader_text_color/splash_bg_color a `organizations` (+ CHECKs).
- [ ] `supabase db reset` local + regenerar `src/lib/database.types.ts`.

## B1 — Permisos
- [ ] `rolesWithOrgPermission(perm)` en `domain/org/permissions.ts`.
- [ ] Gate `uploadOrgLogoAction`/`saveBrandDraftAction`/`discardBrandDraftAction` → `org.brand.edit`.
- [ ] Gate `publishEnterpriseBrandAction` → `org.brand.publish`.
- [ ] UI: deshabilitar controles si el rol no puede.

## B2 — Limpieza
- [ ] Borrar LOADER_OPTIONS, Brand controls MVP, Web+Mobile parity, Estado de esta fase, Propagation map, Brand score, copys con schema.
- [ ] `BrandMobileTabBar` tabs: Identidad/Vista previa/Publicar.

## B3 — UI/UX
- [ ] `BrandLivePreview.tsx` (WYSIWYG: coach app, alumno PWA, loader real, icono+splash).
- [ ] Controles loader en `BrandCenterActions` (texto, icon mode, color).
- [ ] Readiness checklist (logo, contraste, nombre, publicado).

## B4 — Loader org source of truth
- [ ] Extender `WorkspaceBrand` (`domain/auth/types`) + re-export `packages/types`.
- [ ] `resolveBrandForWorkspace` devuelve loader org.
- [ ] `proxy.ts`: headers `x-coach-loader-*` desde org si coach `org_managed`.
- [ ] `publishEnterpriseBrandAction`: propaga loader definido por la org.

## B5 — Splash/iconos
- [ ] `app/api/icon/[slug]/route.tsx` (ImageResponse maskable 192/512).
- [ ] `app/api/splash/[slug]/route.tsx` (ImageResponse parametrizado).
- [ ] `c/[coach_slug]/layout.tsx`: `apple-touch-startup-image` links.
- [ ] manifest usa `/api/icon/[slug]`.

## B6 — RN
- [ ] Documentar shape de marca en `enterprise-reference-matrices.md`.

## DoD
- [ ] typecheck + lint limpios.
- [ ] E2E permisos (brand_manager edita/publica; ops no; admin no publica).
- [ ] E2E publish propaga + alumno hereda; audit escrito.
- [ ] grep higiene: 0 jerga visible.
- [ ] mobile-visual-audit verde.
