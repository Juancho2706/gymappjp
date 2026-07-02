# Investigación UX — Patrón "elegir un conjunto de registros y aplicarles una acción/herramienta" (bulk action / cohort apply)

Fecha de investigación: 2026-06-24
Contexto del producto: un coach quiere "usar" un módulo (cardio, evaluación de movimiento, composición corporal) y elegir a qué **alumno(s)** aplicarlo/evaluar. Hoy entra por-alumno (uno a uno). Idea de diseño: un **launcher** → elijo módulo → elijo alumno(s) → uso.

Todas las afirmaciones están respaldadas con fuente (título + URL + fecha). Prioridad 2025–2026.

---

## 0. Resumen ejecutivo (qué aplicar)

1. **El patrón "elegir registros + aplicar acción" es estándar y bien documentado.** Su columna vertebral son cuatro piezas: selección con checkboxes, una **barra de acción contextual** que aparece al seleccionar, un **contador de selección** persistente, y **feedback con undo** tras ejecutar. (NN/G, 2025; Eleken, feb-2026; PatternFly.)
2. **Para nuestro caso, lo natural es un flujo híbrido tool-first → multi-target.** El coach decide primero la herramienta (módulo), porque es la intención que tiene en mente ("voy a evaluar movimiento esta semana"), y luego elige a quién. Eso es legítimo, pero rompe la regla por defecto **noun-verb (objeto primero)** que la literatura considera más intuitiva — así que el diseño debe **compensar** ese cambio de orden con confirmación/preview claros.
3. **Acciones que tocan a varias personas exigen prevención de error**: deshabilitar la acción para los registros no elegibles, mostrar un **preview de impacto** ("se evaluará a N alumnos"), distinguir **"seleccionar página" vs "seleccionar todo"**, y ofrecer **undo / recuperación suave**.
4. **El riesgo real de nuestro caso es de modelo mental**: tres herramientas SÍ son "por-selección" (cardio, movimiento, composición) y una NO lo es (intercambios, que vive dentro del plan de un alumno). Mezclarlas en el mismo launcher confunde. La recomendación es **separar visualmente** las herramientas "aplicables a un cohorte" de las "contextuales del plan", o no listar intercambios en el launcher.

---

## 1. Multi-selección en mobile y desktop — buenas prácticas 2025–2026

### 1.1 Las cuatro piezas del patrón (consenso de fuentes)

NN/G reduce el patrón a **tres guidelines**: (1) ofrecer **"Select All"**, (2) usar una **barra de acción contextual** que aparece al seleccionar, y (3) dar **feedback claro con capacidad de undo**.
> "Provide a Select All option… Use a contextual action bar… Give clear feedback with undo capability."
> — Rachel Krause, *Bulk Actions: 3 Design Guidelines*, Nielsen Norman Group, 17-mar-2025. https://www.nngroup.com/videos/bulk-actions-design-guidelines/

Eleken amplía a **8 guidelines** (artículo actualizado 23-feb-2026): selección intuitiva con checkboxes, comunicar elegibilidad, mantener acciones contextuales/visibles, priorizar seguridad y prevención de error, feedback transparente, diseñar para escala, soportar flujos flexibles, y accesibilidad/adaptación a dispositivo.
> "Use checkboxes as the clearest selection method… minimum target sizes of 24×24 px (desktop) or 44×44 px (touch)… Display bulk-action controls immediately after selection, keeping the workflow on-screen. The toolbar should remain persistent during scrolling and adapt as selection changes."
> — *Bulk action UX: 8 design guidelines with examples for SaaS*, Eleken, act. 23-feb-2026. https://www.eleken.co/blog-posts/bulk-actions-ux

### 1.2 La barra de acción contextual (toolbar flotante)

Es el patrón dominante: una barra **persistente** que aparece al seleccionar, flota arriba de las filas o fija al fondo en mobile, **se expande/contrae según el número de ítems** y manda las acciones secundarias a un menú "More".
> "Show a floating contextual toolbar when multiple items are selected… fixed at the bottom of the screen… It should expand or contract based on the number of items selected, gracefully move overflow actions into a 'More' menu… This approach works well in mobile or responsive views."
> — Eleken, 23-feb-2026 (citado arriba). También: Gmail y Notion usan iconos clave directos + menú "More" al seleccionar varias filas.

### 1.3 Contador de selección y estados parciales (indeterminate)

El contador debe reflejar la **selección global**, no solo la página visible, y el checkbox maestro tiene tres estados: vacío / **guion (parcial)** / check (todo).
> "A text label displays the total number of selected items. If pagination is in use, it will reflect the number of items selected across all pages… Empty: No items selected. Minus icon: Partial selection… Check mark: All items selected."
> — *Bulk selection*, PatternFly Design System. https://www.patternfly.org/patterns/bulk-selection/

### 1.4 "Seleccionar página" vs "Seleccionar todo" (escala)

Distinción crítica cuando la lista está paginada/filtrada: separar "seleccionar lo visible" de "seleccionar todo el dataset", con confirmación explícita en batches grandes.
> "'Select page' chooses all items on the current page… 'Select all' encompasses every item across all pages."
> — PatternFly (citado arriba).
> "Support 'Select all' across filtered datasets with explicit confirmation for large batches."
> — Eleken, 23-feb-2026.

### 1.5 Mobile específico: checkbox-list, gesto, target size

- **Cuándo checkbox-list**: lista corta (<10) con todo visible; para listas largas, **buscador/filtro + virtual rendering**.
  > "Use a checkbox list when the number of options is small (< 10)… Always provide a search/filter input for very large lists and implement virtual rendering."
  > — *Multi-select Input Pattern*, UX Patterns for Developers. https://uxpatterns.dev/patterns/forms/multi-select-input
- **Checkbox vs toggle en mobile**: checkbox cuando se eligen varias opciones y el cambio NO es inmediato (es un "submit"/opt-in); toggle solo para binario standalone de efecto inmediato.
  > "Use checkbox UI design when multiple options can be selected, the change doesn't take immediate effect… use toggles when the action takes immediate effect, the setting is binary and standalone."
  > — *Checkboxes: Design Guidelines*, NN/G. https://www.nngroup.com/articles/checkboxes-design-guidelines/
- **Target táctil**: 44×44 px mínimo en touch (Eleken, 23-feb-2026).
- **Estado seleccionado accesible**: no confiar solo en el checkmark visual; exponer `aria-selected` y diferenciar el estado (check, bold). (UX Patterns for Developers; NN/G.)

> **Lectura para nuestro caso (mobile-first):** el "select mode" con long-press es nativo de listas mobile, pero como el coach entra **deliberadamente** a una herramienta, conviene un **modo selección explícito** (la lista de alumnos ya nace en modo multi-select) en vez de esconderlo tras un long-press. Mantener: checkbox por fila (44px), buscador arriba, barra de acción fija abajo con contador ("Evaluar a 3 alumnos"), y un check maestro con estado parcial.

---

## 2. Tool-first vs object-first — trade-offs y cuándo cada uno

### 2.1 Lo que dice la literatura: por defecto, objeto-primero (noun-verb)

OOUX (Object-Oriented UX) sostiene que pensar en **objetos antes que en acciones** es lo más intuitivo, porque imita cómo razonamos en el mundo físico.
> "Object Oriented UX is all about thinking in terms of objects before actions… prioritizes nouns (objects) over verbs (actions)… the noun-verb paradigm is more intuitive for users than verb-noun."
> — *Object-Oriented User Experience Design: The Power of Objects-First Design Approach*, UX Planet. https://uxplanet.org/object-oriented-user-experience-design-the-power-of-objects-first-design-approach-e65e07488a00
> "Users are likely first inclined to think about the object first, and secondarily – what they do with it."
> — *OOUX: A Foundation for Interaction Design*, ooux.com. https://ooux.com/resources/ooux-a-foundation-for-interaction-design

El paradigma clásico **noun-verb** (seleccionar el objeto y luego la acción) es el estándar de usabilidad de toda la vida:
> "noun-verb paradigm: the user selects an object first, then chooses an action to perform on it."
> — *noun-verb paradigm*, Usability First Glossary. https://www.usabilityfirst.com/glossary/noun-verb-paradigm/index.html

### 2.2 Trade-offs aplicados

| Eje | Object-first (alumno → herramienta) | Tool-first (herramienta → alumnos) |
|-----|-------------------------------------|------------------------------------|
| Mapa mental | Coincide con noun-verb (más intuitivo por defecto). | Coincide con la **intención de tarea** cuando el verbo es lo que el usuario tiene en mente ("hoy evalúo movimiento"). |
| Bulk / cohorte | Pésimo: hay que repetir alumno por alumno (= el dolor actual). | **Ideal**: una herramienta, muchos objetivos en una pasada. |
| Descubribilidad de la herramienta | Buena si el alumno muestra sus módulos disponibles. | Buena para "qué puedo hacer hoy" (centro de acciones). |
| Riesgo | Bajo (acción sobre 1 objeto a la vez). | **Mayor**: una acción afecta a varias personas → exige preview/confirmación. |

**Regla de decisión (síntesis):**
- Si la tarea es **una acción repetida sobre muchos** (justo nuestro caso: evaluar/aplicar un módulo a varios alumnos) → **tool-first con multi-target es lo correcto**, porque elimina la repetición que hoy duele.
- Si la tarea es **explorar/editar un objeto** (revisar la ficha de un alumno, ajustar SU plan) → **object-first**.
- Lo más robusto es ofrecer **ambas puertas** al mismo flujo: desde la ficha del alumno ("usar módulo X con este alumno") y desde el launcher ("módulo X → elegir alumnos"). UX Mastery describe object-focused vs task-focused como complementarios, no excluyentes.
  > — *Object-focused vs Task-focused Design*, UX Mastery. https://uxmastery.com/object-focused-vs-task-focused/

> **Recomendación:** adoptar tool-first para el launcher (resuelve el bulk), PERO **compensar** que rompe noun-verb con: (a) un paso de selección de alumnos muy explícito, (b) contador siempre visible, y (c) preview de impacto antes de ejecutar (sección 3). Mantener también la entrada object-first existente desde la ficha del alumno, para no abandonar el mapa mental por defecto.

---

## 3. Evitar errores en acciones que afectan a varias personas

Fuentes: Eleken (23-feb-2026); NN/G (17-mar-2025); guía de acciones destructivas (Medium/Bootcamp); diálogos de confirmación (UX Planet).

### 3.1 Elegibilidad: deshabilitar lo que no aplica
Si la herramienta no puede aplicar a todos los seleccionados, **deshabilitar/grisar** la acción con tooltip que explique por qué (en lugar de fallar silenciosamente). Relevante para composición corporal, que exige `weight_kg`/datos del alumno.
> "If an action can't apply to every selected item, the safest route is to disable it (or gray it out)… Use tooltips or inline notes explaining why actions are unavailable."
> — Eleken, 23-feb-2026.

### 3.2 Preview de impacto antes de confirmar
Mostrar exactamente qué cambiará y a cuántos. Reduce carga cognitiva y aumenta confianza.
> "The most effective confirmation designs… show users exactly what will change after their confirmation… reduces cognitive load and increases confidence."
> — *Ultimate Guide To Shift Management Confirmation UX*, myshyft.com. https://www.myshyft.com/blog/action-confirmation-prompts/
> "Ensure the user understands the impacts and results of the action they are undertaking."
> — *A UX guide to destructive actions*, Bootcamp/Medium. https://medium.com/design-bootcamp/a-ux-guide-to-destructive-actions-their-use-cases-and-best-practices-f1d8a9478d03

### 3.3 Confirmación con moderación (no banalizarla)
Usar confirmación solo para lo destructivo/irreversible; abusar la convierte en ruido de fondo. Acción reversible → basta toast con undo; irreversible → más fricción explícita.
> "Confirmation dialogs… their effectiveness depends directly on their rarity — the more often you display them, the faster they become background noise."
> — Eleken, 23-feb-2026 / *Confirmation dialogs*, UX Planet. https://uxplanet.org/confirmation-dialogs-how-to-design-dialogues-without-irritation-7b4cf2599956

### 3.4 Undo / recuperación suave
Tras ejecutar, ofrecer revertir vía toast/banner ("Se evaluó a N alumnos — Deshacer").
> "After the user commits a bulk action, immediately offer a way to revert it… 'X items have been deleted — Undo'."
> — NN/G, 17-mar-2025 / Eleken, 23-feb-2026.

### 3.5 Feedback de resultado parcial
En batch sobre N personas, reportar éxitos/fallos por ítem ("Users always know exactly what succeeded, what failed, and why"), con spinner/result-summary. (Eleken, 23-feb-2026.)

> **Aplicado a nuestro caso:** antes de "usar" el módulo sobre el cohorte, mostrar pantalla de resumen: módulo elegido, lista de N alumnos, alumnos **no elegibles** grisados con motivo (ej. "sin peso registrado" en composición), botón primario con el conteo ("Evaluar a 3"), y tras ejecutar un toast con undo si la acción crea/duplica registros.

---

## 4. Ejemplos de "launcher de herramientas" / "centro de acciones" en B2B (2025–2026)

- **Command Palette (Cmd+K)** es ya estándar en dashboards SaaS modernos como puerta tool-first ("qué quiero hacer").
  > "A live Command Palette (Cmd+K) is featured in advanced SaaS admin dashboards… Shadcn Admin… dashboard with command palette and RBAC."
  > — *22 Best SaaS Admin Dashboard Templates 2026*, AdminLTE. https://adminlte.io/blog/saas-admin-dashboard-templates/
- **Microsoft Partner Center — Action Center**: un centro consolidado de acciones/notificaciones accionables a nivel de cuenta; ejemplo maduro de "centro de acciones" B2B.
  > — *Action Center overview*, Microsoft Learn. https://learn.microsoft.com/en-us/partner-center/action-center/action-center-overview
- **Plataformas de health coaching (2026)** combinan engagement del cliente, **protocol builders**, entrega de programas y práctica en una sola superficie — el tipo de producto donde "elegir módulo → aplicarlo a clientes" encaja.
  > "Complete health coaching platforms combine client engagement (journaling, habits, metrics), protocol builders, program delivery, and practice management."
  > — *Best Health Coach Apps 2026*, Practice Better. https://practicebetter.io/blog/best-health-coach-apps-2026
- **CRMs de coaching (2025)**: la coaching está centrada en datos de actividad y entrega de "coaching dirigido"; los planes traen *playbooks/sequences/playlists* — la idea de acción aplicada a un subconjunto de clientes.
  > — *Top 12 CRM Software for Coaches in 2025*, Simply.Coach. https://simply.coach/blog/crm-for-coaches-client-management/ ; *7 Best B2B Sales Tools 2026*, Salesforce. https://www.salesforce.com/sales/b2b-sales-tools/

> **Lectura:** el "launcher de módulo" propuesto es exactamente el patrón **command-palette / action-center** trasladado al dominio coach. Precedente sólido en B2B; nuestro twist es que la acción es **multi-target sobre alumnos**, así que el launcher debe encadenar con el patrón de bulk-select de la sección 1.

---

## 5. Riesgo: mezclar herramientas por-alumno con una que NO es por-selección (intercambios)

Tres herramientas (cardio, evaluación de movimiento, composición) son **por-selección / aplicables a un cohorte**. "Intercambios" (nutrition exchanges) **NO** es de ese tipo: vive **dentro del plan de un alumno** y se configura por-alumno/por-plan (es Nutrición Pro per-student, no una acción aplicable a un grupo). Meterla en el mismo launcher de "elige módulo → elige alumnos" rompe el modelo mental.

Principios que respaldan el riesgo y su mitigación:

- **Consistencia de objetos/acciones (OOUX):** las acciones deben mapear coherentemente a los objetos; mezclar una acción que opera sobre "cohorte de alumnos" con otra que opera sobre "una sección del plan de un alumno" genera un modelo mental inconsistente.
  > "By systematically defining nouns (objects) and verbs (actions), OOUX helps create a structured, modular, and user-focused UI… consistency across the digital product."
  > — UX Planet / OOUX (citado en §2.1).
- **Comunicar elegibilidad / no ofrecer acciones inválidas:** si una "herramienta" del launcher no admite multi-selección, ofrecerla ahí es justamente el anti-patrón que Eleken pide evitar (acciones que no aplican a la selección deben deshabilitarse o no aparecer). (Eleken, 23-feb-2026.)

**Mitigaciones recomendadas (en orden de preferencia):**
1. **No listar intercambios en el launcher multi-target.** Mantenerla donde vive hoy (dentro del editor del plan del alumno, modo `client-plan`). Es la opción más limpia: el launcher solo contiene herramientas verdaderamente "aplicables a varios".
2. Si por descubribilidad se quiere mostrar intercambios en el launcher, **separarla visualmente en una sección distinta** rotulada por su naturaleza — p. ej. "Herramientas de evaluación (elige alumnos)" vs "Configuración dentro del plan (un alumno)" — y al elegir intercambios **saltar directo al selector de UN alumno → su plan**, sin paso de multi-selección. Nunca presentarla con checkbox-list de cohorte.
3. **Etiquetar el alcance en cada tarjeta de módulo** ("Aplica a varios alumnos" vs "Se configura en el plan de un alumno") para que el coach sepa, antes de entrar, qué tipo de flujo le espera. Esto usa el principio de comunicar elegibilidad/alcance por adelantado (Eleken, 23-feb-2026).

> **Conclusión del riesgo:** el launcher debe ser honesto sobre el *shape* de cada herramienta. Cardio/movimiento/composición = flujo bulk (módulo → multi-select alumnos → preview → usar). Intercambios = flujo contextual (un alumno → su plan). No forzar las cuatro por el mismo embudo.

---

## Fuentes

- *Bulk Actions: 3 Design Guidelines* — Rachel Krause, Nielsen Norman Group, 17-mar-2025. https://www.nngroup.com/videos/bulk-actions-design-guidelines/
- *Bulk action UX: 8 design guidelines with examples for SaaS* — Eleken, act. 23-feb-2026. https://www.eleken.co/blog-posts/bulk-actions-ux
- *Bulk selection* — PatternFly Design System. https://www.patternfly.org/patterns/bulk-selection/
- *Checkboxes: Design Guidelines* — Nielsen Norman Group. https://www.nngroup.com/articles/checkboxes-design-guidelines/
- *Multi-select Input Pattern* — UX Patterns for Developers. https://uxpatterns.dev/patterns/forms/multi-select-input
- *Object-Oriented User Experience Design: The Power of Objects-First Design Approach* — UX Planet. https://uxplanet.org/object-oriented-user-experience-design-the-power-of-objects-first-design-approach-e65e07488a00
- *OOUX: A Foundation for Interaction Design* — ooux.com. https://ooux.com/resources/ooux-a-foundation-for-interaction-design
- *noun-verb paradigm* — Usability First Glossary. https://www.usabilityfirst.com/glossary/noun-verb-paradigm/index.html
- *Object-focused vs Task-focused Design* — UX Mastery. https://uxmastery.com/object-focused-vs-task-focused/
- *A UX guide to destructive actions: their use cases and best practices* — Joel Pascual, Bootcamp/Medium. https://medium.com/design-bootcamp/a-ux-guide-to-destructive-actions-their-use-cases-and-best-practices-f1d8a9478d03
- *Confirmation dialogs: How to design dialogs without irritation* — Dmitry Sergushkin, UX Planet. https://uxplanet.org/confirmation-dialogs-how-to-design-dialogues-without-irritation-7b4cf2599956
- *Ultimate Guide To Shift Management Confirmation UX* — myshyft.com. https://www.myshyft.com/blog/action-confirmation-prompts/
- *22 Best SaaS Admin Dashboard Templates 2026 (React, Next.js & Tailwind)* — AdminLTE. https://adminlte.io/blog/saas-admin-dashboard-templates/
- *Action Center overview - Partner Center* — Microsoft Learn. https://learn.microsoft.com/en-us/partner-center/action-center/action-center-overview
- *Best Health Coach Apps 2026: Top Software Compared* — Practice Better. https://practicebetter.io/blog/best-health-coach-apps-2026
- *Top 12 CRM Software for Coaches in 2025* — Simply.Coach. https://simply.coach/blog/crm-for-coaches-client-management/
- *7 Best B2B Sales Tools and Software for 2026* — Salesforce. https://www.salesforce.com/sales/b2b-sales-tools/
