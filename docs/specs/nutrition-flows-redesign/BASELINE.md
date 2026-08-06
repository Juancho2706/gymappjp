# BASELINE — metricas antes del rediseño (capturada 2026-08-06)

Fuente: PostHog proyecto EVA (id 417986), ultimos 30 dias, `$pageview` por `$pathname LIKE '%nutri%'`.

## Trafico (unico dato medible hoy)

| Zona | Pageviews 30d | Personas unicas |
|------|--------------:|----------------:|
| Alumno nutrition-v2 | 170 | 20 |
| Coach hub nutrition-v2 | 103 | 10 |
| Alumno V1 / otras rutas nutricion | 74 | 20 |
| Coach otras (nutrition-plans, builder legacy) | 35 | 7 |

## Eventos de producto existentes (pre-T1.0)

Solo `student_workout_launched`, `student_workout_completed`, `upgrade_gate_hit`. **Cero eventos de nutricion** — los KPIs del programa (taps/dia, tiempo-crear-plan, % correcciones, % plantilla) NO son medibles hoy. T1.0 los instrumenta; la primera ventana comparable sera ~2 semanas despues del deploy de O1.

## Eventos que agrega T1.0 (web; RN sin PostHog — pendiente decision aparte)

| Evento | Props | Responde |
|--------|-------|----------|
| `student_nutrition_intake` | `method: item_tap\|bulk_slot\|portion_chip\|free_search` | taps/dia, mix de metodos de registro |
| `student_nutrition_correction` | `action: opened\|saved\|voided` | % de correcciones que se abandonan (opened sin saved/voided) |
| `coach_nutrition_builder_opened` | `mode: create\|edit\|template`, `from: blank\|template\|plan` | embudo de creacion |
| `coach_nutrition_plan_published` | `editor: wizard\|quick_edit`, `duration_ms` (desde opened), `days_count`, `items_count` | tiempo-crear-plan, % desde plantilla |
| `coach_nutrition_template_applied` | `source: library\|picker` | uso real de plantillas (se dispara desde T1.5) |

Reglas: gated por consentimiento (no-op sin `ph`), sin montos ni datos personales, convencion de `lib/posthog/events.ts`.
