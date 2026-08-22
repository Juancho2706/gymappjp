import { z } from 'zod'

/**
 * Persona del coach — la respuesta a «¿A qué te dedicas?» del onboarding v2
 * (docs/specs/coach-onboarding-v2/SPEC.md §1).
 *
 * Contrato PURO compartido por web y RN: la MISMA lista, el MISMO copy y el MISMO vocabulario
 * («alumno» / «paciente» / «atleta») en los dos lados. La persona vive en `coaches.persona`
 * (columna propia con CHECK, migración `20260822002122_onboarding_v2_persona_demo.sql`), no en
 * un jsonb: segmenta correos y funnel.
 *
 * `PERSONAS` es espejo EXACTO del CHECK de la migración. Si divergen, el server action escribe
 * un valor que la base rechaza.
 */
export const PERSONAS = ['strength', 'nutrition', 'rehab', 'endurance', 'other'] as const

export type Persona = (typeof PERSONAS)[number]

/** Validación de boundary (server action + endpoint mobile). El body NUNCA es autoridad. */
export const PersonaSchema = z.enum(PERSONAS)

/**
 * Vocabulario y copy de UNA persona. Fuente ÚNICA de los 5 copys que hoy están duplicados
 * (modal, checklist, HelpCenter, correo D+0, viñetas) — SPEC §6.
 */
export interface PersonaCopy {
    /** Título de la tarjeta en la pantalla «¿A qué te dedicas?» (SPEC §1). */
    tileTitle: string
    /** Bajada de la tarjeta: qué obtiene si elige esta rama. */
    tileSubtitle: string
    /**
     * Cómo se le llama a la gente que atiende. v1 solo en la pantalla de persona, el checklist
     * y los correos (decisión D3 opción A); el vocabulario global es deuda declarada.
     */
    noun: { singular: string; plural: string }
    /** Nombre del alumno de ejemplo sembrado en el alta. `null` = esta rama no siembra demo. */
    demoName: string | null
    /** Bajada del demo («30 años · hipertrofia»). `null` cuando no hay demo. */
    demoTagline: string | null
    /**
     * Segunda pregunta inline de la pantalla (SPEC §1). `null` = esta rama no la muestra
     * (`other` ya deja el panel completo). La respuesta persiste en `coaches.persona_also_other`.
     */
    secondQuestion: string | null
    /**
     * Plantilla del mensaje de WhatsApp con el que el coach invita. Tokens `{nombre}` y `{link}`
     * (el link de invitación real). Tono latam neutro: es un mensaje que manda una persona.
     */
    whatsappInvite: string
}

/**
 * Copy por persona. Los títulos y bajadas son EXACTOS de la tabla de SPEC §1: se pregunta por lo
 * que HACE (no por el título profesional), «kinesiólogo/fisioterapeuta» no se nombra (CL vs MX/CO)
 * y la quinta tarjeta dice qué pasa si la eliges, no «saltar».
 */
export const PERSONA_COPY: Record<Persona, PersonaCopy> = {
    strength: {
        tileTitle: 'Entreno fuerza y acondicionamiento',
        tileSubtitle: 'Rutinas, progresiones y seguimiento. Presencial u online.',
        noun: { singular: 'alumno', plural: 'alumnos' },
        demoName: 'Matías',
        demoTagline: '30 años · hipertrofia',
        secondQuestion: '¿También les armas la alimentación?',
        whatsappInvite:
            'Hola {nombre}, te invité a mi app: ahí te dejo tu rutina y vamos siguiendo tus avances. Entras con tu correo acá: {link}',
    },
    nutrition: {
        tileTitle: 'Soy nutricionista',
        tileSubtitle: 'Pautas, porciones e intercambios, y evaluación corporal.',
        noun: { singular: 'paciente', plural: 'pacientes' },
        demoName: 'Ana',
        demoTagline: '34 años · recomposición corporal',
        secondQuestion: '¿También les armas el entrenamiento?',
        whatsappInvite:
            'Hola {nombre}, te invité a mi app con tu pauta y tu seguimiento: {link} — entras con tu correo y ahí te dejo todo.',
    },
    rehab: {
        tileTitle: 'Trabajo rehabilitación y readaptación',
        tileSubtitle: 'Screening de movimiento, pauta de ejercicios y evolución.',
        noun: { singular: 'paciente', plural: 'pacientes' },
        demoName: 'Pedro',
        demoTagline: '45 años · lumbalgia inespecífica',
        secondQuestion: '¿También les armas la alimentación?',
        whatsappInvite:
            'Hola {nombre}, te invité a mi app: ahí te dejo tus ejercicios y vamos registrando cómo avanzas. Entras con tu correo acá: {link}',
    },
    endurance: {
        tileTitle: 'Entreno resistencia: running, ciclismo, trail',
        tileSubtitle: 'Zonas de frecuencia cardíaca, ritmos e intervalos.',
        noun: { singular: 'atleta', plural: 'atletas' },
        demoName: 'Javiera',
        demoTagline: "28 años · 10K en 52'",
        secondQuestion: '¿También les armas la alimentación?',
        whatsappInvite:
            'Hola {nombre}, te invité a mi app: ahí te dejo tus zonas, tus ritmos y la semana de entrenamiento. Entras con tu correo acá: {link}',
    },
    other: {
        tileTitle: 'Otra cosa / todavía no lo tengo claro',
        tileSubtitle: 'Te dejamos el panel completo y lo ajustas cuando quieras.',
        noun: { singular: 'alumno', plural: 'alumnos' },
        demoName: null,
        demoTagline: null,
        secondQuestion: null,
        whatsappInvite:
            'Hola {nombre}, te invité a mi app: ahí te dejo tu plan y vamos siguiendo tus avances. Entras con tu correo acá: {link}',
    },
}

/**
 * Orden de las tarjetas en la pantalla (SPEC §1). El escape (`other`) va SIEMPRE último: es una
 * salida, no una opción más — y se mide aparte para saber cuánta gente contesta al azar.
 */
export const PERSONA_TILE_ORDER: readonly Persona[] = PERSONAS

/** Sustantivo de la persona («alumno» / «paciente» / «atleta»). Helper para no repetir el lookup. */
export function personaNoun(persona: Persona, plural = false): string {
    const noun = PERSONA_COPY[persona].noun
    return plural ? noun.plural : noun.singular
}

/**
 * Rellena la plantilla de WhatsApp. Reemplaza TODAS las apariciones de `{nombre}` y `{link}`
 * (el `link` va crudo: quien lo mande decide si lo pasa por `encodeURIComponent` al armar el
 * `wa.me`, porque ahí se codifica el mensaje entero).
 */
export function formatWhatsappInvite(
    persona: Persona,
    vars: { nombre: string; link: string },
): string {
    // `split().join()` en vez de `replaceAll`: el metodo pide lib ES2021 y este paquete tambien
    // lo compilan tsconfigs con lib ES2020 (los packages puros). Semantica identica con tokens
    // literales, y sin regex (el link no se escapa).
    return PERSONA_COPY[persona].whatsappInvite
        .split('{nombre}').join(vars.nombre)
        .split('{link}').join(vars.link)
}
