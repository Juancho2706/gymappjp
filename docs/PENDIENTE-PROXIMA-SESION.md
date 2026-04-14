# Pendiente — Próxima Sesión
**Fecha:** 2026-04-13 · Sesión anterior llegó al 93% de límite de tokens

---

## P1 — Feature: Historial por fecha en perfil del alumno (coach)

El coach selecciona una fecha en las tabs del perfil y ve qué comió / qué entrenó ese día.

### Archivos a modificar

**1. `src/app/coach/clients/[clientId]/actions.ts`**
Agregar dos nuevas server actions al final del archivo:

```typescript
// Nutrición de un alumno en una fecha específica
export async function getClientNutritionForDate(clientId: string, date: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('daily_nutrition_logs')
    .select(`
      id, log_date, plan_name_at_log, target_calories_at_log, target_protein_at_log,
      target_carbs_at_log, target_fats_at_log,
      nutrition_meal_logs (
        id, meal_id, is_completed,
        nutrition_meals (
          id, name, order_index,
          food_items (
            id, quantity, unit,
            foods (name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit)
          )
        )
      )
    `)
    .eq('client_id', clientId)
    .eq('log_date', date)
    .maybeSingle()
  return data
}

// Entrenamiento de un alumno en una fecha específica
export async function getClientWorkoutForDate(clientId: string, date: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workout_logs')
    .select(`
      set_number, weight_kg, reps_done, rpe, logged_at,
      workout_blocks!inner (
        section, order_index,
        exercises (name, muscle_group),
        workout_plans (title, day_of_week)
      )
    `)
    .eq('client_id', clientId)
    .gte('logged_at', `${date}T00:00:00`)
    .lte('logged_at', `${date}T23:59:59`)
    .order('logged_at')
  return data
}
```

**2. `src/app/coach/clients/[clientId]/NutritionTabB5.tsx`**
- Importar `DayNavigator` desde `@/app/c/[coach_slug]/nutrition/_components/DayNavigator` (o copiar el componente si tiene dependencias internas)
- Agregar state: `const [selectedDate, setSelectedDate] = useState<string | null>(null)`
- Agregar state: `const [historyData, setHistoryData] = useState<any>(null)`
- Agregar `useTransition` para fetch al cambiar fecha
- Al final del JSX existente, agregar nueva sección:

```tsx
{/* === Ver día específico === */}
<div className="mt-6 space-y-4">
  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
    Ver día específico
  </p>
  <DayNavigator
    selectedDate={selectedDate ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })}
    onDateChange={(date) => {
      setSelectedDate(date)
      startTransition(async () => {
        const data = await getClientNutritionForDate(clientId, date)
        setHistoryData(data)
      })
    }}
  />
  {historyData === null && selectedDate !== null && (
    <p className="text-sm text-muted-foreground text-center py-4">
      Sin registros de nutrición para este día.
    </p>
  )}
  {historyData && (
    /* Renderizar macros del día + lista de comidas en modo lectura */
    <NutritionDayReadOnly data={historyData} />
  )}
</div>
```

**3. `src/app/coach/clients/[clientId]/TrainingTabB4Panels.tsx`**
- Misma lógica con `DayNavigator` + `getClientWorkoutForDate`
- La vista de solo lectura muestra: ejercicio → sets (set #, kg, reps, RPE)
- Agregar al final del JSX existente (no tocar los charts/PRs actuales)

### DayNavigator — verificar si es reutilizable
Ruta actual: `src/app/c/[coach_slug]/nutrition/_components/DayNavigator.tsx`
- Si tiene imports del contexto de esa ruta específica, crear una copia en `src/components/shared/DayNavigator.tsx`
- Props esperadas: `{ selectedDate: string, onDateChange: (date: string) => void }`

### Notas importantes
- Vista 100% read-only — sin botones de acción
- RLS existente ya permite al coach leer datos de sus alumnos (no requiere cambios)
- No afecta los charts/PRs/rings actuales de cada tab
- `clientId` ya disponible en ambos componentes como prop

---

## P2 — Smoke test MercadoPago sandbox

Archivo de referencia: ver `docs/PLAN-MAESTRO-ESTRATEGICO.md` tarea BIZ-004
- Verificar credenciales sandbox en `.env.local`
- Test flujo completo: checkout → pago → webhook → subscription activa

## P2 — Pricing en CLP

Archivo: `src/app/pricing/page.tsx`
- Alinear precios a CLP (actualmente en USD o mixto)
- Ver `docs/MAPA-MAESTRO.md` para el % actual del módulo

---

## Resumen del estado actual (post sesión 2026-04-13)

| Módulo | % |
|---|---|
| BD Alimentos | ✅ 261 foods globales |
| Units g+un | ✅ Normalizado en BD + UI |
| Bug workout weekly reset | ✅ Corregido |
| Tabs perfil: Análisis + Plan | ✅ Renombradas |
| KPI card Overview | ✅ Reducida (sin blur, sin racha duplicada) |
| Mini-logs en tab Plan | ✅ Removidos |
| **Historial por fecha (coach)** | ⏳ **PENDIENTE — P1** |
