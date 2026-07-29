# PLAN — Porciones propias del coach

1. **FD2 — P-A backend + web**: `packages/schemas/nutrition-exchanges.ts` (Create/Update/DeleteExchangeGroupSchema), `exchanges.repository.ts` (insert/update/softDelete, patron insertDayVariant), `nutrition-exchanges.service.ts` (unicidad slug/code vs system+propios, workspace gate), server actions nuevas, API `/api/mobile/nutrition/exchanges/groups` (POST/PATCH/DELETE con el gate mobile), UI web: fila "+ Crear grupo nuevo" + form popover + menu ⋯ en `PortionsGroupPicker.tsx`.
2. **FD6a — P-A RN**: sheet de creacion/edicion consumiendo la API (jamas Supabase directo) en el `PortionsGroupPickerSheet` del builder RN y quick-edit RN.
3. **FD6b — P-B clasificar**: campos de equivalencia en AddFoodSheet + `CreateCoachFoodInputSchema`/insert del builder + curacion + alta RN; verificacion/migracion de column grant `exchange_*`.
4. **Tests**: schema (rechaza is_system/composed_of/codigo duplicado), repository, actions, API route, y regresion `EXCHANGE_GROUP_NOT_FOUND` al borrar grupo en uso por un draft.

Riesgo principal: snapshots congelados ya protegen lo publicado — testear borrado de grupo en uso; validaciones de unicidad case-insensitive; no romper el picker existente (grupos system primero, propios despues, crear al final).
