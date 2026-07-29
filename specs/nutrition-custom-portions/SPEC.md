# SPEC — Porciones propias del coach (grupos custom + clasificar alimentos)

Fecha: 2026-07-28 · Origen: pedido de coach real (Dudu) + verificacion `D:\tmp\dudu-c-porciones.md` · Plan visual: artifact "Plan: Multi-dia + Porciones propias".

## Problema

El catalogo de porciones/intercambios esta congelado en el seed (9 grupos system, ~40 alimentos clasificados). La RLS de `exchange_groups` YA permite grupos custom por coach (`xg_insert/update/delete`), pero no existe UI, server action ni contrato para crearlos; y `foods.exchange_group_id/exchange_portion_grams/exchange_portion_label` solo las escribio el seed — los alimentos propios del coach son invisibles para porciones (no salen en equivalencias, no suman cobertura).

## Alcance

**P-A — Crear/editar/eliminar grupo propio** (0 migraciones):
- Entrada: fila "+ Crear grupo nuevo" al final de la lista custom del picker de grupos (web popover, RN sheet).
- Form: Nombre · Codigo corto 2-3 letras (sugerido, unico vs system+propios) · macros de referencia por 1 porcion (P/C/G en g, kcal autocalculada 4/4/9 editable) · color de la paleta existente · medida de ejemplo opcional. Custom siempre `macros_confirmed=false` (badge "Valores referenciales").
- Gestionar: menu ⋯ en filas propias (Editar/Eliminar soft-delete). Eliminar en uso: aviso "los planes publicados conservan su version congelada" (los `snapshot_*` ya protegen lo publicado).
- F1 excluye: grupos compuestos (`composed_of`) y editar grupos system (rechazado en schema).
- RN escribe SIEMPRE via API nueva `/api/mobile/nutrition/exchanges/groups` (leccion NUT-005: cero escrituras Supabase directas nuevas).

**P-B — Clasificar alimentos propios** (solo foods del coach en F1):
- Bloque opcional "Equivalencia de porciones" (grupo + gramos por porcion + medida casera) en: AddFoodSheet (web), alta rapida del builder web, curacion, alta RN.
- Efecto inmediato sin tocar read models: `exchangeFoods` y cobertura derivada leen `foods` vivo.
- Validar que el grupo sea visible al coach (system o propio). Verificar column-level grant de las 3 columnas `exchange_*` en `foods` para authenticated (si falta: migracion aditiva de grant).
- Cap `rn <= 40` de equivalencias por grupo: se documenta y queda (priorizar propios = F2).

**P-C — Paliativo seed para Dudu**: fuera de este build (requiere su lista; operacion manual posterior).

## Gating

Porciones NO son Pro (decision vigente): crear grupos y clasificar alimentos tampoco.

## Criterio de aceptacion

- Coach crea grupo "SHK · Batido" desde el picker (web y RN), lo asigna a una franja, publica; el alumno ve el grupo con badge referencial y las equivalencias de los alimentos que el coach clasifico.
- Alimento propio clasificado aparece en el sheet de equivalencias del alumno y suma cobertura al registrarse en gramos (sin cambios de SQL de lectura).
- Codigo duplicado ("C") rechazado con mensaje claro; grupos system inmutables.
- Gates verdes + tests de schema/repository/actions/API + paridad web-RN.
