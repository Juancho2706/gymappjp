# Exercise Creator — SPEC

**Status:** DRAFT  
**Owner:** TBD  
**Last updated:** 2026-05-26  
**Related plan:** `specs/exercise-creator/PLAN.md`

---

## Contexto de investigación

Investigado en mayo 2026. Auditado desde perspectivas de: Software Architect, Backend, Frontend, Mobile, DevOps, QA, Security, PM, UX/UI, Sales B2B, SDR, CSM, Legal Chile, Fintech.

---

## Problem

Coaches con metodología propia (CrossFit, pilates, rehabilitación, funcional) no pueden representar sus ejercicios en EVA. Solo existe el catálogo global EVA (read-only). Esto genera:

- Coaches que no pueden digitalizar su metodología real → churn
- Planes de entrenamiento que no reflejan lo que el coach realmente hace
- En enterprise: cada coach recrea los mismos ejercicios del gym por separado → inconsistencia de metodología

---

## Hallazgo clave del audit de código

**La arquitectura ya está construida en su mayor parte:**

| Componente | Estado actual |
|---|---|
| `exercises.coach_id` (nullable) | ✅ Ya existe en schema |
| `exercises.video_url` | ✅ Ya existe |
| `exercises.gif_url` | ✅ Ya existe |
| `exercises.instructions` (array) | ✅ Ya existe |
| `exercises.muscle_group`, `body_part`, `secondary_muscles`, `equipment`, `difficulty` | ✅ Ya existen |
| Query del builder filtra `.or('coach_id.is.null, coach_id.eq.${user.id}')` | ✅ Ya funciona — si existiera un ejercicio custom, aparecería sin cambiar el builder |
| `DraggableExerciseCatalog.tsx` — modal de preview con soporte YouTube | ✅ Parcialmente existe |

**Lo que NO existe:**
- UI para que coach cree/edite ejercicios
- RLS policy que permita INSERT en `exercises` con `coach_id` propio
- Storage bucket `exercise-media`
- Badge "Mío" en el picker
- Lógica completa de YouTube embed + validación

---

## Users

- **Primary:** Coach individual con metodología propia
- **Secondary:** Org admin (enterprise) que quiere biblioteca compartida para todos sus coaches
- **Internal/operator:** Admin EVA que mantiene el catálogo global

---

## Goals

- Coach puede crear ejercicios propios que aparecen en su builder sin fricción
- Coach puede adjuntar video demostrativo via YouTube (sin abarrotar Supabase Storage)
- En enterprise: org admin puede crear ejercicios visibles para todos los coaches de la org
- El cliente final ve el ejercicio custom exactamente igual que uno global (sin diferencia de experiencia)

---

## Non-Goals

- Compartir ejercicios entre coaches de distintas organizaciones
- Subir video directamente a Supabase Storage (decisión intencional — usar YouTube)
- Verificación de ownership del canal YouTube en v1 (se implementa en v2/enterprise con OAuth)
- Editor de video o procesamiento de media dentro de EVA
- IA para sugerir ejercicios

---

## Modelo de ejercicios en 3 capas

```
is_global = true                   → Catálogo EVA (seed, read-only para coaches)
coach_id = X, org_id = null        → Ejercicio privado del Coach X
org_id = Y, coach_id = null        → Ejercicio de la Organización Y (enterprise)
```

RLS maneja aislamiento. Un coach solo ve: globales + propios + los de su org (si tiene).

---

## YouTube como única fuente de video

### Por qué YouTube y no Storage

No cargar videos a Supabase — costo de Storage + CDN escala mal para video. YouTube es gratuito, tiene CDN global, y el coach ya sube sus demos ahí.

### Tipos de video y decisión

| Tipo | ¿Embebible? | ¿Recomendado? | Razón |
|---|---|---|---|
| Público | Sí | No — en v1 | Cualquier video de YouTube funcionaría, no solo del coach |
| **No listado (Unlisted)** | **Sí** | **Sí — ideal** | No aparece en búsqueda pública, solo quien tiene el link lo ve |
| Privado | **No** | No | No se puede embeber en iframe |

**Instrucción al coach:** "Sube tu video a YouTube → márcalo como 'No listado' → pega el link aquí."

### Formatos de URL aceptados

EVA debe aceptar y parsear todos estos formatos:
- `https://www.youtube.com/watch?v=XXXXX`
- `https://youtu.be/XXXXX`
- `https://www.youtube.com/embed/XXXXX`
- `https://youtube.com/shorts/XXXXX`

Se extrae el `video_id` con regex. Se guarda solo el `video_id` en DB, no la URL completa.

### Privacy-enhanced embed

EVA usa `https://www.youtube-nocookie.com/embed/{video_id}` en el iframe — YouTube no trackea cookies a los clientes al reproducir. Mejor para Ley 19.628 Chile / GDPR.

### Validación de video privado

Cuando coach pega un link, EVA intenta cargar el embed. Si el video es privado, el iframe falla. EVA detecta esto y muestra: "Este video es privado en YouTube. Cámbialo a 'No listado' para que pueda mostrarse."

### Verificación de ownership en v1

Sin verificación automática en v1. Coach firma ToS declarando que es propietario del contenido. Checkbox: "Confirmo que soy el propietario o tengo derechos sobre este video." Se registra en audit log.

### v2 — YouTube OAuth (enterprise)

Coach conecta su canal YouTube a EVA via Google OAuth. EVA consulta YouTube Data API v3 para listar sus videos (incluyendo unlisted). Coach selecciona de su propia lista — no pega URL. Garantiza ownership. Requiere: Google OAuth integration + YouTube Data API quota management.

---

## User Stories

- Como coach, quiero crear mis propios ejercicios con nombre, descripción e imagen, para poder usarlos en los planes de mis clientes.
- Como coach, quiero adjuntar un video de YouTube a mi ejercicio, para que mi cliente vea la demostración correcta sin que yo tenga que grabar dentro de EVA.
- Como coach, quiero que mis ejercicios custom aparezcan en el mismo buscador del builder que los ejercicios globales, para no tener que ir a otro lugar.
- Como coach, quiero que mis ejercicios estén diferenciados visualmente de los globales (badge "Mío"), para identificarlos rápido.
- Como org admin (enterprise), quiero crear ejercicios a nivel de organización, para que todos mis coaches tengan acceso a la metodología del gym desde el día 1.
- Como cliente, quiero ver el video demostrativo del ejercicio que me asignó mi coach, para ejecutarlo correctamente.

---

## Acceptance Criteria

### Funcional
- [ ] Coach puede crear ejercicio con: nombre, grupo muscular, músculo secundario, equipamiento, dificultad, instrucciones, imagen/GIF, link de YouTube
- [ ] Ejercicio aparece en `DraggableExerciseCatalog` con badge "Mío" diferenciado
- [ ] Ejercicio custom aparece en sección propia arriba de resultados globales cuando hay match
- [ ] Coach puede editar y eliminar sus ejercicios
- [ ] Al eliminar: planes existentes que lo referenciaban muestran el ejercicio como snapshot (nombre + instrucciones preservados), no crash
- [ ] Video de YouTube se embebe con `youtube-nocookie.com`
- [ ] Si video es privado: mensaje de error claro "Cámbialo a No listado en YouTube"
- [ ] Org admin puede crear ejercicios `org_id = Y, coach_id = null` visibles para todos coaches de la org (enterprise)

### Seguridad
- [ ] Coach A no puede ver ni editar ejercicios de Coach B (RLS)
- [ ] Upload de imagen: validar MIME type server-side (no solo extensión)
- [ ] Campo instrucciones: no permite HTML (solo texto plano o markdown) — prevenir XSS
- [ ] IDs de ejercicio son UUIDs (no secuenciales — prevenir enumeración)
- [ ] Path de Storage prefijado con `{coach_id}/` — coach no puede subir a ruta de otro

### Mobile/Responsive
- [ ] Creator funciona en mobile (single scroll, no wizard multi-paso)
- [ ] Imagen se puede subir desde cámara del dispositivo (expo-image-picker en mobile)
- [ ] Video YouTube se reproduce correctamente en mobile via iframe

### Performance
- [ ] Picker carga ejercicios custom en < 200ms junto con globales
- [ ] Thumbnail de imagen sirve desde CDN Supabase con `cache-control: immutable`

### Post-delete
- [ ] Ejercicio eliminado → planes existentes muestran snapshot del nombre, no "ejercicio no encontrado"

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Coach pega video de YouTube que no es suyo | Legal (copyright) | Checkbox de ownership + ToS clause + audit log |
| Video privado de YouTube no embebible | UX rota silenciosamente | Detección activa de embed failure + mensaje claro |
| Coach acumula ejercicios con nombres inconsistentes | Catálogo propio caótico | Búsqueda fuzzy + organización por grupo muscular + duplicate warning |
| Storage bucket `exercise-media` crece sin control | Costo operacional | Lifecycle rule: objetos sin referencia en DB → auto-delete a los 30 días |
| RLS mal configurada expone ejercicios entre coaches | Privacidad / confidencialidad metodología | Test E2E de aislamiento en CI |
| Org admin elimina ejercicio org-level que coaches tienen en planes activos | Planes de clientes rotos | Soft-delete + snapshot en workout_blocks al asignar |

---

## Open Questions

- [ ] ¿Se limita el número de ejercicios custom en plan básico? (ej. 20 free, ilimitado pro) — decisión de pricing
- [ ] ¿Ejercicios custom se muestran en la app del cliente en el catálogo de ejercicios (`/c/[slug]/exercises`)? ¿O solo en los planes asignados?
- [ ] ¿Campo `birth_date` o datos de perfil extendido necesitan migration antes de esta feature? (relacionado con import)
- [ ] ¿Coach puede "donar" su ejercicio custom al catálogo global EVA (opt-in)? Roadmap v3
- [ ] ¿El snapshot al eliminar guarda solo nombre o también instrucciones y video?
