/**
 * @eva/onboarding — la guía del coach nuevo, como DATO puro.
 *
 * Fuente ÚNICA de los 5 pasos del checklist v2 por persona, del alumno de ejemplo que se siembra
 * en el alta y del catálogo de plantillas de cada rama
 * (docs/specs/coach-onboarding-v2/SPEC.md §4, §5, §6).
 *
 * Paquete PURO TypeScript: CERO React / Next.js / Supabase / React Native. Lo consumen la web
 * (checklist del dashboard, empty states, correos por comportamiento) y `apps/mobile` (home día 1)
 * — el drift de los «cinco copys distintos de los mismos 4 pasos» que documenta la auditoría
 * muere acá: si el copy cambia, cambia en un solo archivo.
 *
 * Lo que este paquete NO hace: no lee la base, no siembra nada, no decide entitlements. Recibe
 * SEÑALES ya computadas server-side (`resolveAutoCompleted`) y devuelve el estado de la guía.
 *
 * El vocabulario («alumno» / «paciente» / «atleta») y el nombre del demo viven en
 * `@eva/schemas` (`PERSONA_COPY`): acá se importa el TIPO y el copy ya viene resuelto, con un
 * test cruzado que falla si los dos archivos se desincronizan (mismo patrón que
 * `@eva/feature-prefs` con `MODULE_KEYS`).
 */

import type { Persona } from '@eva/schemas'

/** Los 5 verbos de la guía, en orden. */
export type OnboardingStepKey =
    | 'profile_branding'
    | 'vive_tu_app'
    | 'first_artifact'
    | 'first_client'
    | 'aha'

/**
 * Orden canónico de los pasos. `ONBOARDING_STEPS[persona]` respeta este orden y el resolver de
 * progreso lo usa para elegir el «próximo paso».
 */
export const ONBOARDING_STEP_KEYS = [
    'profile_branding',
    'vive_tu_app',
    'first_artifact',
    'first_client',
    'aha',
] as const satisfies readonly OnboardingStepKey[]

/** Cantidad de pasos de la guía. Es fija por diseño (checklist de 3-5 ítems, SPEC §6). */
export const ONBOARDING_TOTAL_STEPS = 5 as const

/**
 * Señal REAL que auto-tilda el paso. No hay tilde manual: el checklist refleja trabajo hecho,
 * no clics (SPEC §6, «ítems que producen resultado real»).
 * - `brand`: `logo_url` o preset o `primary_color` distinto del default.
 * - `vive_tu_app_opened`: evento `vive_tu_app_opened` (el coach abrió su app como el demo).
 * - `first_artifact`: programa / plan V2 / `movement_assessments` / perfil cardio creado o editado.
 * - `real_client`: ≥1 fila en `clients` que NO sea `is_demo`.
 * - `real_student_activity`: `workout_logs` / `nutrition_intake_entries` de un alumno REAL (el aha).
 */
export type OnboardingAutoSignal =
    | 'brand'
    | 'vive_tu_app_opened'
    | 'first_artifact'
    | 'real_client'
    | 'real_student_activity'

export interface OnboardingStep {
    key: OnboardingStepKey
    /** Título del ítem. Copy final, ya resuelto por persona. */
    label: string
    /** Bajada de una línea: qué gana el coach al hacerlo. */
    description: string
    /**
     * Destino en WEB. `null` = el paso no navega (es una acción in-place o lo dispara el alumno).
     * Puede traer el token `{demoClientId}`: se resuelve con `resolveHref`.
     */
    webHref: string | null
    /** Destino en RN (Expo Router). Mismas reglas que `webHref`; se resuelve con `resolveRnRoute`. */
    rnRoute: string | null
    autoSignal: OnboardingAutoSignal
}

/**
 * Token del id del alumno de ejemplo dentro de `webHref` / `rnRoute`. Se resuelve recién al
 * pintar (el demo se siembra en el alta y su id vive en `onboarding_guide.demo`).
 */
export const DEMO_CLIENT_TOKEN = '{demoClientId}'

// ── Rutas verificadas contra el árbol (21-08) ────────────────────────────────────────────────
// WEB:  /coach/settings?tour=1                  -> hub Opciones; `tour=1` lo lee
//                                                  settings/_components/BrandSettingsTourClient.tsx:78
//       /coach/workout-programs                 -> app/coach/workout-programs
//       /coach/nutrition-v2/{id}/editor         -> EDITOR ÚNICO. El wizard viejo
//                                                  (`{id}/builder`) hoy REDIRIGE acá
//                                                  (builder/page.tsx:131), así que apuntamos al
//                                                  destino final y no a la escala.
//       /coach/movement/{id}                    -> app/coach/movement/[clientId]
//       /coach/cardio/{id}                      -> app/coach/cardio/[clientId]
//       /coach/clients?invite=1                 -> app/coach/clients (el `invite=1` lo consume
//                                                  el stepper de alta de W4.1; hoy la ruta abre
//                                                  el directorio, no rompe nada).
// RN:   /coach/settings/brand                   -> app/coach/settings/brand.tsx
//       /coach/(tabs)/builder                   -> el grupo VA en el href (así navega hoy RN,
//                                                  p.ej. CoachDashboardSections.tsx:1163)
//       /coach/nutrition-v2/editor/{id}         -> EDITOR ÚNICO de RN (nutritionV2EditorHref).
//                                                  `nutrition-v2/builder/[clientId]` quedó como
//                                                  alias retirado (lib/nutrition-v2-hub.ts:265).
//       /coach/movement/{id} · /coach/cardio/{id}
//       /coach/(tabs)/clientes
// ─────────────────────────────────────────────────────────────────────────────────────────────

const WEB = {
    brand: '/coach/settings?tour=1',
    programs: '/coach/workout-programs',
    nutritionEditor: `/coach/nutrition-v2/${DEMO_CLIENT_TOKEN}/editor`,
    movement: `/coach/movement/${DEMO_CLIENT_TOKEN}`,
    cardio: `/coach/cardio/${DEMO_CLIENT_TOKEN}`,
    invite: '/coach/clients?invite=1',
} as const

const RN = {
    brand: '/coach/settings/brand',
    programs: '/coach/(tabs)/builder',
    nutritionEditor: `/coach/nutrition-v2/editor/${DEMO_CLIENT_TOKEN}`,
    movement: `/coach/movement/${DEMO_CLIENT_TOKEN}`,
    cardio: `/coach/cardio/${DEMO_CLIENT_TOKEN}`,
    invite: '/coach/(tabs)/clientes',
} as const

/** Paso 1: idéntico en las 5 ramas salvo el sustantivo de la persona. */
function brandStep(noun: string): OnboardingStep {
    return {
        key: 'profile_branding',
        label: 'Pon tu color y tu logo',
        description: `Tu marca en 60 segundos. Es lo primero que ve tu ${noun} al entrar.`,
        webHref: WEB.brand,
        rnRoute: RN.brand,
        autoSignal: 'brand',
    }
}

/** Paso 2: «Vive tu app». No navega — lo dispara una acción (magic link del alumno demo). */
function viveTuAppStep(description: string): OnboardingStep {
    return {
        key: 'vive_tu_app',
        label: 'Mira tu app con tu marca',
        description,
        webHref: null,
        rnRoute: null,
        autoSignal: 'vive_tu_app_opened',
    }
}

/** Paso 4: invitar al primer alumno REAL (el demo no cuenta). */
function firstClientStep(noun: string): OnboardingStep {
    return {
        key: 'first_client',
        label: `Invita a tu primer ${noun}`,
        description: 'Le llega el link por WhatsApp o correo, entra con su correo y ve TU app.',
        webHref: WEB.invite,
        rnRoute: RN.invite,
        autoSignal: 'real_client',
    }
}

/** Paso 5: el aha. No navega: lo completa el alumno, no el coach. Es el único confeti. */
function ahaStep(label: string, description: string): OnboardingStep {
    return { key: 'aha', label, description, webHref: null, rnRoute: null, autoSignal: 'real_student_activity' }
}

/**
 * Los 5 pasos por persona. El paso 3 es el que cambia de verdad entre ramas (SPEC §6): las ramas
 * difieren en LO QUE PASA DESPUÉS, no en la redacción.
 */
export const ONBOARDING_STEPS: Record<Persona, readonly OnboardingStep[]> = {
    strength: [
        brandStep('alumno'),
        viveTuAppStep('Entra como Matías, tu alumno de ejemplo.'),
        {
            key: 'first_artifact',
            label: 'Arma la rutina de Matías desde la plantilla',
            description: 'Elige una plantilla, cambia lo que quieras y queda lista para asignar.',
            webHref: WEB.programs,
            rnRoute: RN.programs,
            autoSignal: 'first_artifact',
        },
        firstClientStep('alumno'),
        ahaStep(
            'Tu alumno completa su primer entreno',
            'Cuando registre su primera serie, lo ves en el panel al instante.',
        ),
    ],
    nutrition: [
        brandStep('paciente'),
        viveTuAppStep('Entra como Ana, tu paciente de ejemplo.'),
        {
            key: 'first_artifact',
            label: 'Arma la pauta de Ana desde una plantilla',
            description: 'Porciones e intercambios ya cargados: ajustás lo que haga falta y publicás.',
            webHref: WEB.nutritionEditor,
            rnRoute: RN.nutritionEditor,
            autoSignal: 'first_artifact',
        },
        firstClientStep('paciente'),
        ahaStep(
            'Tu paciente registra su primera comida',
            'Cuando registre su primera comida, ves su adherencia en el panel.',
        ),
    ],
    rehab: [
        brandStep('paciente'),
        viveTuAppStep('Entra como Pedro, tu paciente de ejemplo.'),
        {
            key: 'first_artifact',
            label: 'Haz el screening de 7 patrones de Pedro',
            description: 'Puntaje con semáforo por patrón; de ahí sale su pauta para la casa.',
            webHref: WEB.movement,
            rnRoute: RN.movement,
            autoSignal: 'first_artifact',
        },
        firstClientStep('paciente'),
        ahaStep(
            'Tu paciente completa su primera sesión en casa',
            'Cuando termine su primera sesión domiciliaria, lo ves en su evolución.',
        ),
    ],
    endurance: [
        brandStep('atleta'),
        viveTuAppStep('Entra como Javiera, tu atleta de ejemplo.'),
        {
            key: 'first_artifact',
            label: 'Revisa las zonas de Javiera y su semana base',
            description: 'Con su FC de reposo y su marca de 5K salen las zonas y los ritmos.',
            webHref: WEB.cardio,
            rnRoute: RN.cardio,
            autoSignal: 'first_artifact',
        },
        firstClientStep('atleta'),
        ahaStep(
            'Tu atleta registra su primer rodaje con FC',
            'Cuando suba su primer rodaje, ves la curva de frecuencia cardíaca.',
        ),
    ],
    other: [
        brandStep('alumno'),
        // `other` no siembra demo (SPEC §4): el «Vive tu app» usa un acceso de prueba, no un alumno.
        viveTuAppStep('Entra como alumno con un acceso de prueba.'),
        {
            key: 'first_artifact',
            label: 'Arma tu primer plan (rutina o pauta)',
            description: 'Empezá por donde te sirva: una rutina de entrenamiento o una pauta de alimentación.',
            webHref: WEB.programs,
            rnRoute: RN.programs,
            autoSignal: 'first_artifact',
        },
        firstClientStep('alumno'),
        ahaStep(
            'Tu alumno usa la app por primera vez',
            'Cuando entre y registre algo, lo ves en el panel al instante.',
        ),
    ],
}

// ── Alumno de ejemplo ────────────────────────────────────────────────────────────────────────

/**
 * Ficha del alumno de ejemplo que se siembra en el alta (SPEC §4). `null` = esa rama no siembra.
 *
 * Los nombres de campo de `intake` son EXACTAMENTE las columnas de `client_intake`
 * (`weight_kg`, `height_cm`, `experience_level`, `availability`, `goals`, `injuries`,
 * `medical_conditions`; `sex` va en la fila del intake y es texto libre por contrato:
 * 'male' | 'female' | 'other' | null). El vocabulario de `goals`/`experience_level` copia el del
 * formulario de alta del alumno (`/c/[coach_slug]/onboarding`), no el de los seeds en inglés.
 *
 * El seed real (W3, `seedDemoStudent`) es quien escribe: acá solo vive el CONTENIDO, para que la
 * ficha del demo sea idéntica en web y en RN y para poder revisarla sin abrir la base.
 */
export interface DemoProfile {
    name: string
    age: number
    sex: 'female' | 'male'
    goal: string
    tagline: string
    intake: {
        weight_kg: number
        height_cm: number
        experience_level: string
        availability: string
        goals: string
        injuries?: string
        medical_conditions?: string
    }
    /** Solo la rama `endurance`: perfil de cardio del que salen las zonas (`cardio_profiles`). */
    cardio?: { resting_hr: number; ref_5k_time_sec: number }
}

export const DEMO_PROFILES: Record<Persona, DemoProfile | null> = {
    strength: {
        name: 'Matías',
        age: 30,
        sex: 'male',
        goal: 'Aumentar masa muscular',
        tagline: '30 años · hipertrofia',
        intake: {
            weight_kg: 78,
            height_cm: 178,
            experience_level: 'Intermedio',
            availability: '4 días por semana, tardes',
            goals: 'Ganar masa muscular manteniendo el peso a raya.',
        },
    },
    nutrition: {
        name: 'Ana',
        age: 34,
        sex: 'female',
        goal: 'Recomposición corporal',
        tagline: '34 años · recomposición corporal',
        intake: {
            weight_kg: 64,
            height_cm: 165,
            experience_level: 'Principiante',
            availability: '3 días por semana, mañanas',
            goals: 'Bajar grasa y sostener masa muscular, con una pauta que pueda cumplir.',
        },
    },
    rehab: {
        name: 'Pedro',
        age: 45,
        sex: 'male',
        goal: 'Volver a moverse sin dolor',
        tagline: '45 años · lumbalgia inespecífica',
        intake: {
            weight_kg: 86,
            height_cm: 174,
            experience_level: 'Principiante',
            availability: '3 días por semana, 20 minutos en casa',
            goals: 'Volver a entrenar sin dolor lumbar y aguantar la jornada sentado.',
            injuries: 'Lumbalgia inespecífica de 6 meses, sin irradiación.',
            medical_conditions: 'Sin banderas rojas. Trabajo de oficina, 8 h sentado.',
        },
    },
    endurance: {
        name: 'Javiera',
        age: 28,
        sex: 'female',
        goal: 'Rendimiento deportivo',
        tagline: "28 años · 10K en 52'",
        intake: {
            weight_kg: 58,
            height_cm: 168,
            experience_level: 'Intermedio',
            availability: '5 días por semana, mañanas',
            goals: "Bajar de 52' en 10K sin lesionarse.",
        },
        cardio: { resting_hr: 58, ref_5k_time_sec: 1500 },
    },
    other: null,
}

// ── Plantillas por rama ──────────────────────────────────────────────────────────────────────

export interface OnboardingTemplate {
    /** Slug estable del contenido (lo consume el seed / el clonador de W3). */
    id: string
    label: string
    /** Una línea: para quién es. Se pinta en el empty state template-first (SPEC §7). */
    blurb: string
}

/**
 * Catálogo de plantillas clonables por persona (SPEC §4). El coach nuevo NUNCA ve un builder en
 * blanco: el vacío muestra estas plantillas y el demo. `other` va vacío a propósito — el panel
 * completo no tiene un «mundo» del que sacar plantillas.
 */
export const TEMPLATE_CATALOG: Record<Persona, ReadonlyArray<OnboardingTemplate>> = {
    strength: [
        { id: 'full-body-3', label: 'Full body 3 días', blurb: 'Cuerpo completo, para arrancar o volver.' },
        { id: 'upper-lower-4', label: 'Torso / Pierna 4 días', blurb: 'El clásico para quien ya entrena hace rato.' },
        { id: 'ppl', label: 'Push / Pull / Legs', blurb: 'Empuje, tracción y pierna, 3 o 6 días.' },
    ],
    nutrition: [
        { id: 'portions-1800', label: '1800 kcal por porciones', blurb: 'Pauta por porciones, 4 tiempos de comida.' },
        { id: 'hybrid-2200', label: '2200 kcal híbrida', blurb: 'Gramos donde importa, porciones en el resto.' },
    ],
    rehab: [
        { id: 'lumbalgia-f1', label: 'Lumbalgia · fase 1', blurb: 'Control de dolor y movilidad, para la casa.' },
        { id: 'postop-rodilla-1-4', label: 'Post-op rodilla · sem 1-4', blurb: 'Rango, activación y carga progresiva.' },
        { id: 'hombro-control-motor', label: 'Hombro · control motor', blurb: 'Escápula y manguito, sin dolor.' },
    ],
    endurance: [
        { id: 'base-10k-4', label: 'Base 4 semanas · 10K', blurb: 'Rodajes en Z2, series cortas y un fondo.' },
        { id: 'media-maraton-12', label: 'Media maratón · 12 sem', blurb: 'De la base al ritmo objetivo de 21K.' },
        { id: 'retorno-lesion', label: 'Retorno tras lesión', blurb: 'Vuelta progresiva con caminata-trote.' },
    ],
    other: [],
}

// ── Resolvers puros ──────────────────────────────────────────────────────────────────────────

/** Señales YA computadas server-side. La UI no decide nada: refleja. */
export interface OnboardingSignals {
    /** `logo_url` o preset elegido o `primary_color` distinto del default. */
    hasBrand: boolean
    /** Evento `vive_tu_app_opened` registrado (web o RN). */
    viveTuAppOpened: boolean
    /** Programa / plan V2 / screening / perfil cardio creado o editado. */
    hasFirstArtifact: boolean
    /** Alumnos REALES (excluye `clients.is_demo`). */
    realClients: number
    /** Un alumno real entrenó o registró una comida (el aha). */
    realStudentActivity: boolean
}

/**
 * Mapea señales → pasos tildados. Puro y total: siempre devuelve las 5 claves.
 * `realClients` viene ya sin demos (el conteo que excluye `is_demo`, W1 F1.3).
 */
export function resolveAutoCompleted(
    signals: OnboardingSignals,
): Record<OnboardingStepKey, boolean> {
    return {
        profile_branding: signals.hasBrand === true,
        vive_tu_app: signals.viveTuAppOpened === true,
        first_artifact: signals.hasFirstArtifact === true,
        first_client: signals.realClients > 0,
        aha: signals.realStudentActivity === true,
    }
}

/**
 * Próximo paso a destacar: el PRIMERO sin tildar, en el orden de la guía. `null` = 5/5 (el
 * checklist se va al pie del dashboard). Un paso tildado más abajo no adelanta a uno pendiente:
 * el orden es el del trabajo real, no el del progreso.
 */
export function nextStep(
    persona: Persona,
    completed: Record<OnboardingStepKey, boolean>,
): OnboardingStep | null {
    const steps = ONBOARDING_STEPS[persona]
    return steps.find((step) => completed[step.key] !== true) ?? null
}

/** Progreso de la guía. `total` es 5 siempre (checklist de 5 verbos). */
export function progress(
    completed: Record<OnboardingStepKey, boolean>,
): { done: number; total: typeof ONBOARDING_TOTAL_STEPS } {
    let done = 0
    for (const key of ONBOARDING_STEP_KEYS) {
        if (completed[key] === true) done += 1
    }
    return { done, total: ONBOARDING_TOTAL_STEPS }
}

/** ¿La guía está completa? Azúcar para decidir si se colapsa al pie del dashboard. */
export function isOnboardingComplete(completed: Record<OnboardingStepKey, boolean>): boolean {
    return progress(completed).done === ONBOARDING_TOTAL_STEPS
}

function resolveTarget(target: string | null, demoClientId: string | null): string | null {
    if (target === null) return null
    if (!target.includes(DEMO_CLIENT_TOKEN)) return target
    // El paso necesita el demo y todavía no hay: mejor ningún link que un `/undefined` que
    // termina en un 404 (o peor, en la ficha de otro alumno).
    if (demoClientId == null || demoClientId === '') return null
    // `split().join()` en vez de `replaceAll` (pide lib ES2021; este paquete tambien lo compilan
    // tsconfigs con lib ES2020). Mismo resultado con un token literal.
    return target.split(DEMO_CLIENT_TOKEN).join(encodeURIComponent(demoClientId))
}

/**
 * Destino WEB del paso, con `{demoClientId}` resuelto. Devuelve `null` cuando el paso no navega
 * o cuando necesita el alumno de ejemplo y no hay (rama `other`, o demo borrado por el coach).
 */
export function resolveHref(
    step: OnboardingStep,
    ctx: { demoClientId: string | null },
): string | null {
    return resolveTarget(step.webHref, ctx.demoClientId)
}

/** Gemelo de `resolveHref` para RN (Expo Router). Mismas reglas, misma semántica de `null`. */
export function resolveRnRoute(
    step: OnboardingStep,
    ctx: { demoClientId: string | null },
): string | null {
    return resolveTarget(step.rnRoute, ctx.demoClientId)
}
