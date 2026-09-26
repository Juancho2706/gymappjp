---
status: active
owner: product-engineering
last_verified: "2026-09-26"
canonical: false
---

# Landing y embudo Free→Pro — datos de PostHog (26-09-2026)

Pedido: tarea de Sergio «analizar reestructuración de landing para ventas» y «colocar más agresivo vender
Pro a los nuevos». Consultas únicas (no son métricas guardadas) en PostHog, proyecto `417986`, últimos
30 días (27-08 → 26-09), sin la cohorte interna `301460`. Entorno: producción (`www.eva-app.cl`), código en
HEAD `822153a7`.

## 1. Embudo landing → pago

| Paso | Personas | Sobre la landing |
|---|---:|---:|
| Pageview de `/` | 983 | 100 % |
| `register_submitted` | 52 | 5,3 % |
| `coach_registered` | 40 | 4,1 % |
| `checkout_started` | 2 | 0,2 % |
| `checkout_confirmed` | 1 | 0,1 % |

Ventana de 14 días, orden secuencial. **La landing convierte razonablemente a registro (4 %); el derrumbe
está entre Free y el pago (40 → 2).**

## 2. De dónde vienen

~85 % celular desde anuncios: `meta` 619 visitantes (23 registros, 3,7 %), `ig` 143 (6, 4,2 %). Directo en
escritorio: 107 (9, 8,4 %). ChatGPT: 3 visitantes, 2 registros.

## 3. Hasta dónde bajan

Solo se sabe para quien pasó a otra página (~160 personas, por `$prev_pageview_max_scroll_percentage`):
75 no pasaron del primer 25 % (tocan el CTA del hero), 13 llegaron al 25–50 %, 10 al 50–75 % y 63 al
75–100 %. **Del ~80 % que se va sin navegar no hay dato**: no hay `$pageleave` ni `$autocapture` en el
proyecto, ni eventos por sección.

## 4. Coaches nuevos y Pro

- 71 coaches nuevos en 30 días: **51 usaron el panel web** (`/coach/*`), 5 abrieron la app y 10 vieron
  `/coach/subscription`.
- Solo **6** chocaron con un límite de Pro (`upgrade_gate_hit`), 2 iniciaron el upgrade, 11 iniciaron un
  checkout y 5 lo confirmaron (incluye reactivaciones).
- Con Free = 1 alumno, casi nadie llega al segundo alumno ⇒ casi nadie ve la oferta. Hoy la única otra
  señal es un link chico «Ver planes →» en el panel (`app/coach/dashboard/_components/DashboardShell.tsx:403`).

## 5. Lectura y recomendación (decisiones del owner al final)

1. **No reestructurar la landing a ciegas.** Convierte a registro dentro de lo esperable para B2B gratis y
   el cuello está después. Primero medir: eventos `landing_section_viewed` (uno por sección y sesión) y
   `landing_cta_clicked {ubicación}` — ~0,5 día — y con el tráfico actual (~900/mes) hay datos en 2 semanas.
   Después, cambios chicos con experimento de PostHog (p. ej. precio Pro visible en el hero), no un rediseño.
2. **Botones Pro en la web: sí, es donde está el hueco** (51 de 71 nuevos usan la web). En las apps no:
   Apple 3.1.1 y la regla del embudo (CAPA 1/1', `docs/specs/embudo-free-pro/SPEC.md`). Mockup antes de UI.
3. **Link de Instagram:** sin código. Bio → `https://www.eva-app.cl/pricing?utm_source=instagram&utm_medium=bio`;
   el proxy guarda el UTM en la cookie first-touch `eva_utm` y queda asociado al alta.

## 6. Decisiones del owner (26-09, opción múltiple)

- **Landing:** medir primero (`landing_section_viewed` + `landing_cta_clicked`), rediseño recién con datos.
- **Botones Pro:** **A** (tarjeta de plan en el panel, reemplaza «Ver planes →») + **C** (aviso una sola vez
  al crear el alumno que llena el cupo), en la **web: escritorio y PWA**. **B** (botón fijo en la barra)
  descartado por ahora. **En la app nada nuevo:** iOS sin botón/link/precio y Android con su línea sin link
  (reglas de pago de las tiendas, CAPA 1/1' del embudo).
- **Orden de implementación:** kg/lb → píxel de compra → botones Pro (A + C) → medición de la landing.
