# Client Excel Import — SPEC

**Status:** DRAFT  
**Owner:** TBD  
**Last updated:** 2026-05-26  
**Related plan:** `specs/client-excel-import/PLAN.md`

---

## Contexto de investigación

Investigado en mayo 2026. Auditado desde perspectivas de: Software Architect, Backend, Frontend, Mobile, DevOps, QA, Security, PM, UX/UI, Sales B2B, SDR, CSM, Legal Chile, Fintech.

---

## Problem

Coaches nuevos llegan a EVA con su base de clientes en Excel o Google Sheets. Sin import, deben crear cada cliente uno por uno desde un formulario — 50 clientes = 50 formularios = 30-60 minutos de trabajo manual.

Esta fricción en las primeras 48h post-registro es la causa #1 de churn en onboarding: coach no ve su data real en la plataforma → no percibe valor → abandona.

---

## Hallazgo clave del audit de código

**No existe nada de esta feature hoy.** Feature nueva completa.

**Lo que sí existe y afecta el diseño:**

La tabla `clients` actual tiene menos campos de los que un coach querría importar:

| Campo | ¿En tabla `clients`? |
|---|---|
| `full_name` | ✅ |
| `email` | ✅ |
| `phone` | ✅ (nullable) |
| `goal_weight_kg` | ✅ (peso objetivo, no actual) |
| `is_active` | ✅ |
| `org_id` | ✅ (enterprise) |
| Peso actual / inicial | ❌ No en `clients` — posiblemente en tabla de perfil |
| Altura | ❌ No en `clients` |
| Fecha de nacimiento / edad | ❌ No en `clients` |
| Objetivo en texto libre | ❌ No está como texto |

**Decisión pendiente antes de implementar:** confirmar qué campos adicionales se agregan a `clients` o si hay tabla de perfil separada (`client_profiles`) donde viven estos datos.

**Flujo de creación de cliente actual:**
- Admin panel: `adminClient.auth.admin.createUser()` + INSERT en `clients`
- El import debe replicar exactamente este flujo para cada fila válida

---

## Users

- **Primary:** Coach individual que migra desde Excel/Google Sheets/otra app
- **Secondary:** Admin EVA que hace migración asistida para clientes enterprise
- **Internal/operator:** CSM de EVA que hace white-glove onboarding para gyms grandes

---

## Goals

- Coach puede poblar toda su base de clientes en < 10 minutos desde cualquier planilla
- Sistema mapea columnas automáticamente sin AI y sin que el coach tenga que aprender un formato rígido
- Preview claro de errores antes de confirmar — coach sabe exactamente qué va a pasar
- Clientes importados reciben email de bienvenida automáticamente
- Re-importar (actualizar datos) no crea duplicados

---

## Non-Goals

- Import de historial de check-ins o logs de entrenamiento (v2)
- Import de programas de nutrición (v2)
- Import > 500 filas en v1 (límite deliberado)
- Integración directa con Google Sheets o Notion via API (v3)
- Import desde otras apps de fitness (Mindbody, TrueCoach) — requiere parsers específicos por app

---

## Column Mapping Sin AI — Mecánica Completa

### Por qué no AI

- Costo por request (OpenAI/Anthropic API)
- Latencia
- Dependencia externa
- No necesario: el problema es determinístico con un buen diccionario + fuzzy matching

### Paso 1: Normalización del header

Cada header del archivo del coach pasa por:
1. Lowercase completo
2. Remover tildes: `á→a`, `é→e`, `í→i`, `ó→o`, `ú→u`, `ñ→n`
3. Remover caracteres no alfanuméricos (espacios, puntos, guiones, underscores)
4. Resultado: `"Nombre Completo"` → `nombrecompleto`, `"Cel."` → `cel`, `"Fecha Nac."` → `fechanac`

### Paso 2: Diccionario de sinónimos bilingüe (español/inglés)

Coaches chilenos escriben en español. Tabla completa:

| Variantes que acepta EVA | Campo interno EVA |
|---|---|
| nombre, nombrecompleto, nombrecliente, nombreyapellido, fullname, name, cliente | `full_name` |
| email, correo, mail, correoelectronico, email, emailcliente | `email` |
| telefono, tel, cel, celular, fono, phone, movil, celular, whatsapp, contacto | `phone` |
| fechanacimiento, fechanac, nacimiento, birthday, birthdate, fechadenacimiento, fnac, dob | `birth_date` |
| peso, pesokg, pesoactual, pesoinicial, weight, kg, pesoenckg | `weight_kg` |
| altura, talla, estatura, height, cm, alturacm | `height_cm` |
| objetivo, meta, goal, motivacion, motivo, proposito | `goal` |
| pesoobjetivo, metapeso, goalweight, pesometa | `goal_weight_kg` |

Si hay match exacto en el diccionario (post-normalización) → confianza 100%.

### Paso 3: Fuzzy matching Levenshtein para lo que no matcheó

Si después del diccionario una columna no tiene match, se calcula distancia de Levenshtein entre el header normalizado y cada campo EVA normalizado.

Fórmula de similaridad: `similarity = (len_a + len_b - distance) / (len_a + len_b)`

| Condición | Confianza | Comportamiento en UI |
|---|---|---|
| Match exacto en diccionario | 100% | Auto-mapeado, verde fijo, no editable |
| Levenshtein similaridad ≥ 0.85 | 85% | Auto-sugerido, amarillo, coach puede cambiar |
| Levenshtein similaridad ≥ 0.60 | 60% | Sugerido con `?`, naranja, coach debe confirmar |
| Sin match (similaridad < 0.60) | 0% | Dropdown vacío, rojo, coach elige o ignora |

### Resultado de la UI de mapping

Tabla de dos columnas visualmente clara:

```
Tu columna             | Campo en EVA
-----------------------|--------------------------------
Nombre Completo    ✅  | Nombre completo (100%)
Correo             ✅  | Email (100%)
Cel.               ✅  | Teléfono (100%)
Fecha Nac.        ⚠️  | Fecha de nacimiento (85%) [cambiar ↓]
Kilos             ❓  | Peso (kg) (60%) ← confirmar [cambiar ↓]
Gym del cliente    ❌  | Sin coincidencia → [Ignorar columna]
```

Coach no necesita tocar los verdes. Solo atiende amarillos/naranjas y decide qué hacer con rojos.

---

## Template Excel Descargable

EVA ofrece template `.xlsx` descargable. No es solo headers — tiene:

- **Dropdowns nativos de Excel** en columna "Objetivo": opciones predefinidas (Bajar peso, Ganar masa, Mejorar rendimiento, Rehabilitación, Otro)
- **Validación de formato de fecha** en columna "Fecha de nacimiento" — celda Excel formateada como fecha, rechaza texto libre
- **Validación de rango** en peso (1-300 kg) y altura (50-250 cm) — Excel rechaza valores imposibles
- **Fila de ejemplo** (fila 2) con datos ficticios pero realistas — coach entiende el formato
- **Comentarios en headers** — tooltip explicativo en cada columna al hover
- **Instrucciones en hoja 2** del archivo — guía visual en español

---

## Detección Automática de Encoding

Coaches chilenos tienen nombres con `ñ` y tildes. Excel viejo guarda en Latin-1 (ISO-8859-1). Si se lee como UTF-8, los caracteres se corrompen.

EVA detecta encoding automáticamente:
- Busca BOM (Byte Order Mark) en primeros bytes
- Si no hay BOM: intenta UTF-8, si falla → intenta Latin-1
- Normaliza todo a UTF-8 antes de procesar
- Coach nunca ve caracteres rotos

---

## Flujo Completo de 5 Pasos

### Paso 1 — Upload
Coach entra a "Clientes" → botón "Importar desde Excel". Dropzone: drag & drop o file picker. Acepta `.xlsx`, `.xls`, `.csv`. Máximo 10MB. Valida que sea archivo de hoja de cálculo (magic bytes, no solo extensión).

### Paso 2 — Column Mapping
UI de mapping según mecánica descrita arriba. Auto-mapeo inmediato al cargar. Coach revisa, confirma, ajusta columnas amarillas/naranjas, ignora columnas que no mapean.

### Paso 3 — Preview con Validación por Fila
Tabla paginada con TODAS las filas del archivo. Antes de importar cualquier cosa:
- Fila verde: datos válidos, lista para importar
- Fila amarilla: advertencia no bloqueante (ej. teléfono con formato raro)
- Fila roja: error bloqueante (ej. email inválido, campo obligatorio vacío)

Coach puede editar celdas inline en la preview para corregir errores menores sin volver al archivo original.

Opción "Importar de todas formas" para filas con advertencias (no errores bloqueantes).

### Paso 4 — Confirmación
Resumen antes de confirmar: "Se importarán 47 clientes. 3 filas tienen advertencias. 2 filas con errores serán omitidas."

Si el plan del coach tiene límite de clientes y este import lo supera: mostrar cálculo de costo antes de confirmar. Ej: "Esto llevará tu cuenta de 8 a 55 clientes. Tu plan Pro incluye ilimitados. [Confirmar]"

### Paso 5 — Resultado
- Animación de éxito (confetti moment — refuerzo positivo para coaches que migran)
- "47 clientes importados. 2 omitidos."
- Botón descarga de "reporte de errores" en CSV para las filas que fallaron
- Los 47 clientes ya aparecen en la lista de clientes, listos para usar

---

## Email de Bienvenida a Clientes Importados

Cada cliente importado recibe email automático:
- Informa que su coach los añadió a EVA
- Link para crear contraseña y acceder al app
- Menciona el nombre del coach para contexto

Esto cumple con Ley 19.628 (notificación al interesado de que sus datos están siendo procesados).

---

## Duplicados — Detección en Dos Niveles

**Nivel 1 — Duplicados dentro del mismo archivo:**
Misma dirección de email aparece más de una vez en el Excel del coach. La segunda fila se marca en amarillo con "Duplicado en este archivo — se importará solo una vez (primera ocurrencia)."

**Nivel 2 — Duplicados con clientes ya existentes en la cuenta:**
Email ya existe en `clients` de este coach. Fila se marca en azul con "Ya existe en tu cuenta — esta fila actualizará sus datos si confirmas." Coach puede desactivar este comportamiento por importación.

---

## User Stories

- Como coach nuevo, quiero subir mi planilla Excel de clientes y que EVA la lea automáticamente, para no tener que crear 50 perfiles uno por uno.
- Como coach, quiero que EVA entienda que mi columna "Cel." es el teléfono y "Correo" es el email, sin que yo le tenga que decir el formato exacto.
- Como coach, quiero ver exactamente qué clientes van a quedar mal importados antes de confirmar, para poder corregirlo.
- Como coach que migra de otra app, quiero re-importar mi planilla actualizada sin que se creen duplicados, para mantener mis datos limpios.
- Como cliente importado, quiero recibir un email notificándome que mi coach me añadió a EVA, para poder crear mi cuenta.

---

## Acceptance Criteria

### Funcional
- [ ] Acepta `.xlsx`, `.xls`, `.csv` hasta 10MB / 500 filas (v1)
- [ ] Mapeo automático de columnas con diccionario bilingüe ES/EN sin AI
- [ ] Coach puede cambiar cualquier mapping manualmente
- [ ] Preview de todas las filas con errores destacados por fila y por campo
- [ ] Coach puede editar celdas en la preview antes de confirmar
- [ ] Import crea clientes via `adminClient.auth.admin.createUser()` (mismo flujo que creación manual)
- [ ] Email de bienvenida enviado a cada cliente importado con link de onboarding
- [ ] Re-import del mismo archivo: upsert por email (actualiza, no duplica)
- [ ] Reporte de errores descargable en CSV post-import
- [ ] Template Excel descargable con validaciones nativas, ejemplos e instrucciones

### Seguridad
- [ ] Validación de MIME type server-side (magic bytes, no solo extensión)
- [ ] CSV injection sanitizado: valores que empiezan con `=`, `+`, `-`, `@` son escapados antes de cualquier render
- [ ] Archivos Excel con macros (`.xlsm`) rechazados
- [ ] Hyperlinks en celdas eliminados durante parsing
- [ ] Archivo de import auto-eliminado de Storage después de 7 días
- [ ] Import scoped a `coach_id` — email de cliente + coach_id como unique constraint (no colisión cross-coach)
- [ ] Rate limiting: máximo 3 imports concurrentes por coach

### Legal (Ley 19.628 Chile)
- [ ] Email de bienvenida a clientes importados (notificación de procesamiento de datos)
- [ ] Coach acepta responsabilidad de tener consentimiento de sus clientes — checkbox en UI antes de confirmar import
- [ ] Archivo de import eliminado de Storage en 7 días (minimización de datos)

### Performance
- [ ] Parsing + mapping completado en < 3s para 100 filas
- [ ] Import de 100 clientes completado en < 10s
- [ ] Para > 100 filas: proceso asíncrono con progress bar + notificación al terminar

### Mobile
- [ ] En móvil: banner sugiriendo usar desktop, pero no bloquea
- [ ] Si coach insiste en móvil: file picker funcional, misma validación

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Tabla `clients` no tiene campos que coaches quieren importar (peso actual, altura, birth_date) | Feature incompleta o requiere migration extra | Decidir schema antes de implementar — open question #1 |
| Coach importa clientes sin su consentimiento | Legal (Ley 19.628) | Checkbox de responsabilidad + ToS + email de bienvenida |
| Encoding incorrecto corrompe tildes y ñ | Datos sucios en DB | Auto-detect encoding: BOM → UTF-8 → Latin-1 fallback |
| CSV injection en celdas | XSS o ejecución en cliente | Sanitizar valores que empiezan con `=`, `+`, `-`, `@` |
| Excel con macros ejecutadas durante parsing | Ejecución de código arbitrario | Usar `xlsx` con `cellFormula: false`; rechazar `.xlsm` |
| Import masivo dispara upgrade de plan con cargo automático | Sorpresa al coach | Mostrar cálculo de costo + confirmación explícita antes de import |
| Import job cuelgado (> 5 min en processing) | Job fantasma | Alerta de monitoreo + timeout automático a los 5 min |
| Coach sube Excel con datos de clientes de otro negocio | Datos cruzados por error | Sin mitigación técnica — responsabilidad del coach según ToS |

---

## Open Questions

- [ ] **Crítica:** ¿Qué campos adicionales se agregan a la tabla `clients` antes de implementar? (peso actual, altura, fecha nacimiento) — esto determina qué columnas del Excel son importables
- [ ] ¿El import está disponible para coaches en plan free o solo paid?
- [ ] ¿Límite de import en plan free (ej. 20 clientes) para incentivar upgrade?
- [ ] ¿Email de bienvenida usa template de Resend existente o nuevo?
- [ ] ¿Los clientes importados son creados con `force_password_change: true`? (asumir sí — mismo flujo que creación manual)
- [ ] ¿Import history — coach puede ver imports pasados y sus resultados?
- [ ] ¿Campo "objetivo" como texto libre en import mapea a algún campo existente en DB?
