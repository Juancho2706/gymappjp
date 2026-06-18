# Recetas en EVA — opciones para estudiar (NO implementado aun)

> Documento de estudio. **DECISIÓN TOMADA (2026-06-18):** se adopta el **Nivel 0 — tarjeta de receta libre, solo ideas/inspiración**, SIN macros ni adherencia, SIN reemplazar nada, SIN add-on modular (disponible en tier Pro+). El coach las crea en su biblioteca de nutrición (junto a sus alimentos), con un botón "Crear receta"; scope **coach o team** (no global EVA); asignable a **1..N alumnos**; el alumno las ve como sección "Ideas de recetas" separada del plan. Foto opcional del coach. El diseño de implementación quedó en el plan maestro (feature L). El resto de este documento es el análisis que llevó a esa decisión.

---

## 1. El problema en simple

### Qué es una "receta" aquí
Una **receta** es un plato con nombre propio que el coach quiere que el alumno coma —"Pollo al horno con arroz y ensalada", "Avena con plátano y maní"— y que el coach arma **una sola vez** y puede **asignar a muchos alumnos** o reutilizar en muchos planes.

### Cómo se arma una comida HOY (lo que NO queremos repetir)
Hoy, cuando el coach construye una comida en el PlanBuilder / MealCard, cada **alimento** se agrega **uno por uno** y cada uno arrastra su propia ficha:

- cantidad (qty)
- unidad (gramos, taza, unidad…)
- macros calculados desde la base de alimentos (`foods`)

Es decir: para armar "Pollo con arroz y ensalada" hoy hay que agregar fila de pollo (150 g → macros), fila de arroz (80 g → macros), fila de lechuga (… → macros), fila de aceite (… → macros)… y la app suma todo. Es preciso, pero es **trabajoso por cada comida y por cada alumno**.

**La queja concreta:** el coach no quiere desglosar ingrediente-por-ingrediente con cantidad/unidad/macros cada vez que quiere prescribir un plato. Quiere algo más parecido a "escribir la receta como se la diría a una persona" y asignarla, sin pasar por el motor de `food_items`.

### La diferencia clave
| Comida hoy (food_items) | Receta-light (lo que se estudia) |
|---|---|
| Cada alimento = fila estructurada (qty/unit/macros) | Un bloque: nombre + texto de ingredientes + instrucciones |
| Macros se **calculan** sumando alimentos | Macros (si las hay) se **teclean a mano** una vez, o no hay |
| Trabajoso por comida y por alumno | Se arma una vez, se reasigna a muchos |
| Permite escalar porciones, lista de compras exacta, swaps | No permite eso (o solo de forma aproximada) |

El research lo resume así: existe un **espectro** que va desde "tarjeta de receta libre, cero estructura" hasta "receta estructurada con macros calculadas". Lo que quieren ustedes vive en la **parte baja-media** de ese espectro.

---

## 2. El espectro de enfoques (del research)

El research de 'recipes-light' identifica cuatro niveles. Van de menos a más esfuerzo de autoría / más fidelidad.

### Nivel 0 — Tarjeta de receta LIBRE (cero estructura, cero macros)
**Qué da:** el coach escribe solo un **nombre** y un **texto libre** (descripción, ingredientes en prosa, instrucciones), opcionalmente una **foto**. El alumno lo lee como una **sugerencia** y registra por su cuenta lo que realmente comió.

**Qué cuesta:** casi nada de trabajo para el coach. Es el "piso" del espectro y donde la mayoría de coaches empieza.

**Cómo se ve:** una tarjeta tipo "post": título, foto opcional, párrafo de ingredientes, pasos.

**Cómo afecta macros/adherencia:** **no participa** en el cálculo de macros ni en la adherencia, porque no hay nada estructurado que sumar. Es inspiración pura.

**Ejemplos 2026:** Everfit lo llama "Recipe Books" / inspiración; Trainerize permite el "modo manual" donde el coach "llena todo a mano".

---

### Nivel 1 — Tarjeta con MACROS TOTALES tecleadas a mano (sin ingredientes estructurados)  ⭐
**Qué da:** el coach escribe nombre, foto opcional, lista de ingredientes en **texto**, instrucciones, porciones… y **teclea los cuatro totales** (kcal / proteína / carbohidrato / grasa) **directamente**, SIN desglosar ingrediente por ingrediente. La tarjeta sí "lleva macros", pero son **afirmadas por el coach**, no derivadas.

**Qué da de valor:** es el **punto dulce** entre "asignable" y "simple". El plato **sí puede contar** para las metas de macros y la adherencia, pero el coach se **salta el trabajo** de la base de alimentos.

**Qué cuesta:** muy poco más que el Nivel 0. El riesgo es que las macros tecleadas pueden **alejarse de la realidad** (no hay fuente de verdad) y **no se pueden escalar porciones automáticamente** (no hay base por-ingrediente para multiplicar).

**Cómo se ve:** igual que la tarjeta libre, pero con una fila de 4 números (kcal/P/C/G) que el coach llenó.

**Cómo afecta macros/adherencia:** **sí cuenta**, porque hay 4 números que el motor de adherencia (`computeNutritionAdherence`) puede comparar contra la meta. Pero hereda el error de lo que el coach tecleó.

**Ejemplos 2026:** Trainerize lo ofrece explícitamente como la alternativa "manual" al auto-cálculo; My PT Hub ("custom meals").

---

### Nivel 2 — Receta ESTRUCTURADA con macros auto-calculadas (lo que NO quieren para todo)
**Qué da:** el coach busca en la base de alimentos, agrega filas de ingredientes con cantidad/porción, y la app **suma las macros sola**. Incluye nombre, foto, tiempo de preparación, tipo de comida, etiquetas, instrucciones, lista de ingredientes y un campo de **porciones/rendimiento**. Macros se muestran por-receta y por-porción.

**Qué da de valor:** **máxima fidelidad**. Es el **único** nivel que permite de forma confiable: escalar porciones, generar lista de compras exacta, y "cambiar para cumplir macros" (swaps).

**Qué cuesta:** es el **más caro de autoría** — exactamente la complejidad ingrediente-por-ingrediente que se quiere evitar. El research advierte: **no obligar este flujo para cada comida**; reservarlo solo para "recetas estrella" que se reutilizan en muchos clientes, donde el costo de armarla una vez se amortiza.

**Cómo se ve:** prácticamente igual a armar una comida hoy en EVA (el motor de `food_items`).

**Ejemplos 2026:** Trainerize "auto-calculate mode", Everfit, ProMealPlan, NutriAdmin.

---

### Pieza transversal — Escalado por porciones
Solo funciona en el **Nivel 2** (necesita base por-ingrediente para dividir/multiplicar). El research recomienda: si una receta no tiene ingredientes estructurados, **default porciones = 1 y ocultar el control de escalado** (evita el clásico bug de confusión "¿este número es por porción o por receta entera?").

### Pieza transversal — La biblioteca reutilizable
El "secreto" de que cualquiera de estos niveles sea reutilizable y no un one-off por cliente es la **biblioteca de recetas del coach**: cada receta vive como registro reutilizable, se crea nueva **duplicando** una parecida y editando, y se asigna a muchos. El alumno la navega/filtra (por tipo de comida, etiqueta) y la registra con un toque. Trainerize: "duplica comidas para construir tu biblioteca más rápido"; HubFit: "colecciones de recetas, log de un toque, macros auto-llenadas".

### Pieza transversal — Intensidad de asignación (estricto / flexible / inspiración)
La **misma** receta se puede asignar con tres intensidades sin necesitar entidades distintas:
- **Estricto:** receta exacta, en comida/día exacto.
- **Flexible:** un set semanal entre el cual el alumno elige, manteniéndose cerca de las macros.
- **Inspiración:** solo para mirar, sin horario.

El research advierte: la **UI del alumno debe señalar claramente el modo**, o el alumno trata "inspiración" como prescripción (o ignora un plan estricto). Es de Everfit (taxonomía Structured / Flexible / Recipe Books).

---

## 3. Recomendación: la "tarjeta de receta asignable" (Nivel 1, con Nivel 0 incluido gratis)

**El nivel más simple que sirve es la tarjeta de receta asignable**, que combina Nivel 0 + Nivel 1:

> Una receta = **nombre** + **foto opcional subida por el coach** + **lista de ingredientes en texto** + **porciones** + **instrucciones**, que se asigna a una comida del plan **como un bloque**. **Opcionalmente** lleva **macros totales tecleadas a mano por el coach** (kcal/P/C/G), nunca calculadas ingrediente por ingrediente.

Esto da lo que pidieron: asignable, reutilizable, y **sin tocar la complejidad de `food_items`**.

### Cómo se asigna a un alumno
1. El coach crea la receta una vez en su **biblioteca de recetas** (nombre, ingredientes en texto, instrucciones, foto/macros opcionales).
2. En el plan del alumno, en lugar de armar una comida alimento-por-alimento, el coach **inserta la receta como un bloque** en una comida del día.
3. El alumno la ve como una **tarjeta** dentro de su plan: foto, qué lleva, cómo se hace, y (si el coach las tecleó) las macros del plato.
4. El alumno la marca como **comida hecha** (igual que hoy marca comidas).

### Cómo se reutiliza
- La misma receta se inserta en el plan de **otro** alumno con un toque (la biblioteca es del coach).
- Para crear una receta nueva parecida, se **duplica** una existente y se edita.
- Se navega/filtra por tipo de comida o etiqueta a medida que la biblioteca crece (esto exige etiquetas/búsqueda desde el día uno o la biblioteca se vuelve inmanejable pasadas unas decenas de recetas).

### Cómo NO toca la complejidad de food_items
- La receta-light es un **bloque de texto + 4 números opcionales**, no un conjunto de filas de alimentos.
- **No** busca en la base de alimentos, **no** calcula macros sumando, **no** escala porciones automáticamente.
- Convive con las comidas estructuradas actuales: una comida del plan puede seguir siendo "armada con food_items" o ser "una receta-light asignada". Son dos caminos paralelos; la receta-light **no reemplaza ni modifica** el motor existente.
- Trade-off honesto a aceptar: como las macros las teclea el coach (o no hay), **no se puede** garantizar exactitud milimétrica ni lista de compras exacta ni swaps automáticos sobre estas recetas. Eso queda para el Nivel 2 / "Nutrición Pro" si algún día se quiere.

---

## 4. Preguntas abiertas para decidir

Estas son las decisiones que hay que cerrar **antes** de implementar:

1. **¿Cuenta para macros/adherencia?**
   - Opción A: la receta-light es **solo inspiración** (Nivel 0) → no toca metas ni adherencia. Más simple, menos útil.
   - Opción B: lleva **macros totales tecleadas** (Nivel 1) → sí cuenta, pero hay que decidir si esas macros son **autoritativas** (se suman a la meta del día) o solo **referenciales** (se muestran pero no cuentan). El research insiste en **etiquetar** cuál es para no confundir.

2. **¿Reemplaza una comida del plan o es un extra?**
   - ¿La receta asignada **ES** la comida del día (sustituye al bloque de food_items) o es un **adicional** que se muestra al lado? Esto define cómo cuenta (o no) en el total del día.

3. **¿Quién la crea: coach o también la org/equipo?**
   - ¿La biblioteca es **del coach** (cada coach la suya) o hay recetas **compartidas a nivel org/equipo** (una biblioteca común para todo el gimnasio)? Afecta el alcance y la propiedad.

4. **¿La foto la sube el coach?**
   - Si hay foto, es **subida por el coach** (no cámara del alumno al registrar). ¿Es opcional con un estado vacío limpio cuando no hay foto? ¿Un solo formato/recorte (ej. 4:5) para que la grilla se vea uniforme?
   - Nota: subir fotos abre temas de **calidad variable**, almacenamiento y moderación (contenido subido por usuario, derechos de autor de terceros). El research sugiere reusar el pipeline de compresión de fotos que ya existe en EVA (check-in WebP 1080px) si se decide hacerlo.

5. **¿Base o Pro?**
   - La **tarjeta asignable simple** (Nivel 0/1) es candidata a **base** (es justo el "amplia y creíble" sin complejidad).
   - La **foto del coach** y la **receta estructurada con macros calculadas / swaps / lista de compras** son las que el research empuja a **"Nutrición Pro"** (power feature de pago). Decidir la línea base-vs-Pro **antes** de construir, o se difumina el argumento de cobrar.

---

## 5. Consideración por rol (lo relevante de recetas-light)

Resumen de lo que cada perspectiva aporta específicamente sobre la receta-light (Niveles 0/1 asignables):

- **Arquitecto de Software:** las comidas base hoy son **texto libre** (nombre+descripción, macros solo a nivel de plan), sin filas de alimentos. Eso significa que la receta-light **encaja con lo que ya existe** sin migración pesada — pero también que cualquier feature que dependa de ingredientes estructurados (lista de compras exacta, swaps, micros) **no** se puede construir sobre la receta-light. Modelar la receta como entidad propia reutilizable; si lleva foto, una sola columna opcional/nullable.

- **Backend:** el "modo manual" (nombre + 4 totales tecleados, sin ingredientes) es el **mayor palanca de simplicidad**: da tarjetas computables a costo casi de texto libre. Gotcha del codebase: cualquier columna nueva que el coach edite necesita su `GRANT UPDATE(col)` en la misma migración o PostgREST falla en runtime. La foto reutiliza el pipeline WebP 1080px existente.

- **Frontend (Web) / Mobile:** la UI de tarjeta es barata y ya hay piezas (MealCard, swap sheets). El alumno debe ver claramente el **modo** de la receta (estricto/flexible/inspiración). Estados vacíos obligatorios (sin foto, sin macros). En mobile, modelar la foto como atributo único de la comida (no captura por-log) y reusar compresión WebP.

- **Product Manager / Head of Sales / SDR:** la **biblioteca reutilizable** ("arma una vez, asigna a muchos") es la historia de adopción y de ahorro de tiempo del coach. La línea base-vs-Pro debe quedar **explícita**: tarjeta simple = base/credibilidad; foto + estructura/macros calculadas = Nutrición Pro ($9.990) — si todo se mete en base, no queda nada que cobrar. Riesgo de venta: **scope creep** que mete las features "pro" en base y mata el upsell.

- **UX/UI:** la receta-light debe vivir **dentro de la casa de nutrición** (bottom-sheet móvil / slide-over desktop, mismo contenido), no abrir una pantalla suelta más — el problema raíz que ya se diagnosticó es "nutrición en 9 rincones". Señalar el modo de prescripción. Si lleva foto del coach, un solo aspect-ratio para grilla uniforme.

- **Security / Legal & Compliance (Chile):** la foto del coach es **contenido subido por usuario (UGC)** → términos que transfieran la licencia/responsabilidad (declara tener derechos, prohibido fotos de terceros o de personas identificables sin consentimiento) + mecanismo de aviso-y-retiro y moderación mínima. Bucket privado con URLs firmadas, validar tipo de archivo, quitar EXIF. La receta-light en sí (texto + macros) tiene riesgo legal **bajo**, salvo que se presenten las macros tecleadas como exactas (etiquetar como referencial evita un reclamo SERNAC por información engañosa).

- **DevOps / Fintech:** si la foto va en "Pro", es el único componente que agrega **costo de storage** y pipeline de upload — reusar el de check-in. Definir qué pasa con las recetas/fotos "Pro" cuando el coach **deja de pagar** el módulo (degradación elegante: read-only / ocultas, no romper el plan vivo del alumno ni dejar imágenes huérfanas en storage).

- **QA / Customer Success:** estado vacío para cada superficie (receta sin foto, sin macros). Si las macros son tecleadas, dejar claro al alumno que son **aproximadas**. La biblioteca necesita etiquetas/búsqueda o se vuelve inmanejable. Onboarding/educación al coach para que adopte la feature.

---

### En una frase
El camino más simple que sirve es una **tarjeta de receta asignable y reutilizable** (nombre + ingredientes en texto + instrucciones + porciones, con foto y macros totales **opcionales tecleadas a mano**), guardada en una **biblioteca del coach**, asignada a una comida del plan **como bloque** — sin pasar por el motor `food_items`, dejando la receta estructurada con macros calculadas, swaps y lista de compras como un escalón futuro de "Nutrición Pro".

---

Documento de estudio relevante ya existente en el repo: `docs/audits/nutrition-audit-2026-06.md` y `docs/audits/nutrition-plan-de-accion-2026-06.md` (contexto del overhaul de nutrición donde encajaría esta decisión).