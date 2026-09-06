---
status: active
owner: product-engineering
last_verified: "2026-09-06"
canonical: false
---

# Auditoría «Revisar unidad» — ítems «un» sobre alimentos de 100 g con medida casera divergente (06-09-2026)

Tren [Cantidades honestas](../specs/nutrition-cantidades-honestas/SPEC.md) §5.5 (W2.5, decisión D3 a del owner: badge
en el editor + un aviso a cada coach, **sin reescribir ningún plan**). Consulta ejecutada en LIVE el 06-09 (solo
lectura): ítems prescritos con `unit = 'un'` en versiones **publicadas** de planes **activos**, cuyo alimento NO es
nativo por unidad (`serving_unit ≠ 'un'`) y tiene medida casera que difiere > 30 % de `serving_size`. Cada fila se
repite una vez por variante de día del plan; acá se listan los ítems distintos.

| Coach | Alumno | Plan (v) | Ítem prescrito | Hoy vale | Con la medida casera valdría | Lectura |
|---|---|---|---|---|---|---|
| `jotap-coach` | Alan | Dieta Alan (v3, 02-09) | Clara de huevo, cruda · 4 un | 400 g · 208 kcal | 4 claras · 132 g · 69 kcal | Probable error de unidad (4 claras). |
| `jotap-coach` | Valeska | Dieta valeska (v7, 22-08) | Clara de huevo, cruda · 2 un | 200 g · 104 kcal | 2 claras · 66 g · 34 kcal | Probable error de unidad. |
| `jotap-coach` | Sofía González | Dieta Sofi (v1, 17-07) | Atún en lata al agua · 1 un | 80 g · 93 kcal | 1 lata escurrida · 120 g · 139 kcal | Ambiguo: 1 un = porción de 80 g del catálogo. |
| `jotap-coach` | Alan, Angélica, Danielis, Jean pierre, Jotap, Luna, Millaray, Pauli | varios | Pepino pelado crudo · 1 un | 100 g · 10 kcal | 1 unidad mediana · 201 g · 20 kcal | Irrelevante en kcal; coherente con el uso «1 un = 100 g» de Jean. |
| `olympuswolf` | David Navarro | Déficit Calórico (v1, 06-08) | Huevo entero, duro (cocido) · 2 un | 200 g · 310 kcal | 2 huevos · 100 g · 155 kcal | Probable error de unidad (2 huevos = 100 g). |

Los 26 ítems de `jotap-coach` (13 versiones, 11 alumnos) son mayormente el pepino; Jean usa «un» = porción de 100 g a
propósito (SPEC §2), así que **no se toca nada**: el badge «Revisar unidad» del editor (W2.5) se lo muestra al abrir el
plan y decide él. El caso de `olympuswolf` es el único con impacto calórico real (155 kcal de más por día).

## Avisos (los manda el owner; copy final en [TASKS](../specs/nutrition-cantidades-honestas/TASKS.md) § W2)

**A Jean (`jotap-coach`)** — «Hola Jean. Con la actualización de hoy el editor ofrece la medida casera real de cada
alimento («clara · 33 g», «huevo · 61 g») y te marca con «Revisar unidad» los ítems donde «un» puede no ser lo que
querías. En tus planes vigentes aparecen así: las claras de huevo de Alan (4 un = 400 g) y de Valeska (2 un = 200 g)
y el atún de Sofía (1 un = 80 g). Nada cambia solo: si querías claras de verdad, tocá «Usar claras»; si «1 un = 100 g»
era la idea, dejalo como está. Cualquier duda, escribime.»

**A `olympuswolf`** — «Hola. En el plan de David Navarro, «Huevo entero, duro · 2 un» hoy vale 200 g (310 kcal):
en EVA «1 un» es una porción de 100 g salvo que el alimento sea por unidad. Desde hoy el editor te ofrece «huevo · 50 g»
como medida y te marca ese ítem con «Revisar unidad»; con «Usar huevos» queda en 2 huevos = 100 g = 155 kcal. No lo
cambiamos por vos: revisalo cuando puedas.»

## Consulta (para repetirla)

```sql
select co.slug as coach, cl.full_name as alumno, p.name as plan, v.version_number as version, v.effective_from,
  ms.name as franja, coalesce(pi.snapshot_name, pi.custom_name) as item, pi.quantity, pi.unit,
  f.name as alimento, f.serving_size, f.household_label, f.household_grams,
  round(pi.snapshot_calories) as kcal_vigentes,
  round(pi.snapshot_calories * f.household_grams / nullif(f.serving_size, 0)) as kcal_si_fuera_casera
from public.nutrition_prescription_items_v2 pi
join public.nutrition_meal_slots_v2 ms on ms.id = pi.meal_slot_id
join public.nutrition_plan_versions_v2 v on v.id = pi.version_id
join public.nutrition_plans_v2 p on p.id = v.plan_id
join public.clients cl on cl.id = p.client_id
join public.coaches co on co.id = cl.coach_id
join public.foods f on f.id = pi.food_id
where lower(btrim(pi.unit)) = 'un' and v.status = 'published' and p.lifecycle_status = 'active'
  and coalesce(f.serving_unit, 'g') <> 'un' and f.household_grams is not null and f.serving_size > 0
  and abs(f.household_grams - f.serving_size) / f.serving_size > 0.30
order by coach, alumno, plan, franja, item;
```
