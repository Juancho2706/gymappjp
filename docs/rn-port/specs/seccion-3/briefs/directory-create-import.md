# Unidad: directory-create-import (key: `directory-create-import`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = los flujos de ALTA de alumnos: modal "Nuevo alumno" + wizard de importacion masiva.

## Alcance exacto
- `apps/mobile/components/coach/directory/CreateClientModal.tsx` (124 L): formulario nuevo alumno (nombre, email/telefono, etc.), validacion, submit.
- `apps/mobile/components/coach/directory/ImportClientsForm.tsx` (384 L): wizard de importacion (pegar/parsear lista, preview, confirmar).

## webFiles (verdad web, paths verificados)
- `apps/web/src/app/coach/clients/CreateClientModal.tsx` (306 L) — modal nuevo alumno.
- `apps/web/src/app/coach/clients/import/page.tsx` + `import/_components/*` + `import/_actions/*` — wizard de importacion.
- `apps/web/src/app/coach/clients/_lib/create-client-internal.ts` — logica de creacion.

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/directory/CreateClientModal.tsx`
- `apps/mobile/components/coach/directory/ImportClientsForm.tsx`

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/app/coach/(tabs)/clientes.tsx` → owner `directory-screen` (monta ambos; los abre desde el FAB "Nuevo alumno" y el boton/FAB Importar). Coordinar por props `open`/`onClose`/`onCreated`.
- `apps/mobile/components/coach/directory/directory-shared.ts` → owner `directory-screen`.

## P0 / riesgos conocidos
- **Bomba -999 (gotcha 6a):** verificar el mecanismo de presentacion de ambos. Si usan `Modal` RN nativo (como los otros directory sheets) → sin riesgo. Si usan `@gorhom` con snapPoints fijos → CreateClientModal es CRITICO (alta de alumno, flujo core) → migrar a `nativeModal`/Modal RN. Grep cada archivo para confirmar.
- **Fabric 45798 (gotcha 6c) — ALTO:** ambos son formularios con multiples `TextInput`. NINGUN wrapper de TextInput debe llevar estilo condicional por focus (el borde de focus va en el propio TextInput). Riesgo directo aqui (varios inputs).
- **Congelamiento (gotcha 6b):** N/A si no hacen fetch propio de catalogos al montar; si ImportClientsForm precarga algo, cargar on-open.
- **Copy VERBATIM:** labels de campo, placeholders, mensajes de validacion (Zod), textos del wizard de importacion 1:1 con el web. Validacion Zod en cliente Y (server action compartida).
- **HIBP gotcha (memoria):** si el flujo genera password temporal para el alumno, respetar `generateStudentTempPassword` (no PIN numerico puro — leaked-pwd rechaza). Logica compartida; no reimplementar.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"CreateClientModal"` / `"ImportClients"` / `"import"` (buscar). Base principal: comparar campo-a-campo contra `CreateClientModal.tsx` web y el wizard `import/`.

## Notas de datos (queries/RPC, claves de dia)
- Creacion: server action espejo de `create-client-internal.ts` (crea `clients` scoped al coach — recordar que el scoping de `clients` es service-role-only; la creacion pasa por el endpoint, no PATCH directo). Sin claves de dia.
- Importacion: parseo local de la lista + insercion batch via server action. Fallback fail-invisible en errores parciales; reportar filas fallidas (copy VERBATIM del web).
