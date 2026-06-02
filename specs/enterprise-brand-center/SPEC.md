# SPEC — Brand Center Enterprise

## Qué
Rework del menú **Marca** (`/org/[slug]/brand`) para que sea un Brand Center self-service, sin información de desarrollador, con preview WYSIWYG real, y que el white-label (color, logo, loader, splash, iconos PWA) realmente llegue a la app del coach y del alumno.

## Por qué
La página actual expone scaffolding de dev (badges MVP/Next, "Loader library", "tokens", nombres de tablas internas) que un cliente enterprise no debe ver, tiene controles no funcionales, un bug de permisos (el rol `brand_manager` no puede editar/publicar y `ops` sí, contra el modelo de permisos), y el "toque" de marca no llega completo (loader del alumno usa config del coach, sin splash iOS ni iconos PWA normalizados).

## User stories
- Como **brand_manager / owner**, configuro logo, nombre, color y loader de mi organización y veo en vivo cómo se verá en la app del coach, la PWA del alumno y el loader, sin tocar código.
- Como **brand_manager / owner**, guardo un borrador y publico cuando estoy listo; mis coaches y alumnos ven la marca tras publicar.
- Como **alumno/coach** de una org, veo el color, logo, loader y splash de la empresa (no de EVA) — la app se siente propia de la marca.
- Como **org_admin**, puedo editar el borrador pero no publicar (decisión de la org).

## Acceptance Criteria
1. La UI de Marca no muestra jerga técnica, badges MVP/Next/roadmap, ni nombres de tablas.
2. `brand_manager` puede editar y publicar; `ops` no puede; `org_admin` edita pero no publica. Controles deshabilitados según rol.
3. Preview WYSIWYG renderiza el loader real (`EvaRouteLoader`) con la config elegida + previews de coach app, alumno PWA, icono e splash.
4. Publicar propaga color/logo/loader definidos por la org a coaches activos y escribe audit `brand.published`.
5. El alumno en `/c/[coach_slug]` hereda color/logo/loader de la org; hay `apple-touch-startup-image` (splash) e icono PWA maskable generados.
6. Tokens de marca expuestos en `WorkspaceBrand` (`packages/types`) para la futura app RN.

## Fuera de alcance (v1)
Tipografía/fuente custom; modelo `organization_branding` versionado/rollback (se queda con `brand_draft` jsonb); smartwatch/nativo.

## Constraints
Branch `v2/enterprise`, Supabase **local**, sin merge ni `db push` a prod, sin costos.
