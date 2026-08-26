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
     * Plantilla del mensaje de WhatsApp con el que el coach invita, **con la credencial adentro**.
     * Tokens `{nombre}`, `{link}` (el link de invitación real), `{correo}` y `{clave}`.
     * Tono latam neutro: es un mensaje que manda una persona.
     *
     * Solo se usa cuando el mensaje va a un destinatario CON NOMBRE (`wa.me/<digits>`):
     * la regla 4 de `docs/specs/flujo-coach-nuevo/SPEC.md §5` lo exige, y quien decide es el
     * call site — este paquete no sabe si hay teléfono.
     */
    whatsappInvite: string
    /**
     * La MISMA invitación sin credencial: misma primera frase, mismo link, y en vez del usuario y
     * la clave, la verdad («te mandé tu clave al correo» — el correo de bienvenida sí la lleva).
     *
     * Es la variante obligatoria cuando no hay teléfono: `wa.me/?text=` abre el selector de
     * contactos y un toque equivocado entrega acceso a datos de salud de un tercero (Ley 21.719).
     * Tokens: `{nombre}` y `{link}`. **Nunca** `{clave}`.
     */
    whatsappInviteSinClave: string
}

/**
 * Primera frase de cada persona — la que ya estaba en producción, intacta: cambia lo que sigue,
 * no la voz. `nutrition` es la única reescrita, porque su frase traía el `{link}` incrustado y el
 * bloque de acceso lo pone abajo (copy literal de SPEC §6).
 */
const WHATSAPP_INTRO: Record<Persona, string> = {
    strength: 'Hola {nombre}, te invité a mi app: ahí te dejo tu rutina y vamos siguiendo tus avances.',
    nutrition: 'Hola {nombre}, te invité a mi app con tu pauta y tu seguimiento.',
    rehab: 'Hola {nombre}, te invité a mi app: ahí te dejo tus ejercicios y vamos registrando cómo avanzas.',
    endurance:
        'Hola {nombre}, te invité a mi app: ahí te dejo tus zonas, tus ritmos y la semana de entrenamiento.',
    other: 'Hola {nombre}, te invité a mi app: ahí te dejo tu plan y vamos siguiendo tus avances.',
}

/**
 * Bloque de acceso, IDÉNTICO en las cinco personas (SPEC §6): es la corrección del callejón 4 —
 * el `{link}` es `/c/{código}/login`, que pide correo **y** contraseña, y hasta hoy el mensaje
 * mandaba al alumno a una pantalla que no podía cruzar sin ir a buscar la clave a su casilla.
 *
 * Vive en una constante y no copiado cinco veces para que ninguna rama quede sin él.
 */
const WHATSAPP_ACCESO_CON_CLAVE =
    '\nEntra acá: {link}\nTu usuario: {correo}\nTu clave temporal: {clave} — la cambias apenas entres.'

/** Bloque de acceso sin credencial (regla 4 de SPEC §5): el link sí, la clave por correo. */
const WHATSAPP_ACCESO_SIN_CLAVE = '\nEntra acá: {link} — te mandé tu clave al correo.'

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
        whatsappInvite: `${WHATSAPP_INTRO.strength}${WHATSAPP_ACCESO_CON_CLAVE}`,
        whatsappInviteSinClave: `${WHATSAPP_INTRO.strength}${WHATSAPP_ACCESO_SIN_CLAVE}`,
    },
    nutrition: {
        tileTitle: 'Soy nutricionista',
        tileSubtitle: 'Pautas, porciones e intercambios, y evaluación corporal.',
        noun: { singular: 'paciente', plural: 'pacientes' },
        demoName: 'Ana',
        demoTagline: '34 años · recomposición corporal',
        secondQuestion: '¿También les armas el entrenamiento?',
        whatsappInvite: `${WHATSAPP_INTRO.nutrition}${WHATSAPP_ACCESO_CON_CLAVE}`,
        whatsappInviteSinClave: `${WHATSAPP_INTRO.nutrition}${WHATSAPP_ACCESO_SIN_CLAVE}`,
    },
    rehab: {
        tileTitle: 'Trabajo rehabilitación y readaptación',
        tileSubtitle: 'Screening de movimiento, pauta de ejercicios y evolución.',
        noun: { singular: 'paciente', plural: 'pacientes' },
        demoName: 'Pedro',
        demoTagline: '45 años · lumbalgia inespecífica',
        secondQuestion: '¿También les armas la alimentación?',
        whatsappInvite: `${WHATSAPP_INTRO.rehab}${WHATSAPP_ACCESO_CON_CLAVE}`,
        whatsappInviteSinClave: `${WHATSAPP_INTRO.rehab}${WHATSAPP_ACCESO_SIN_CLAVE}`,
    },
    endurance: {
        tileTitle: 'Entreno resistencia: running, ciclismo, trail',
        tileSubtitle: 'Zonas de frecuencia cardíaca, ritmos e intervalos.',
        noun: { singular: 'atleta', plural: 'atletas' },
        demoName: 'Javiera',
        demoTagline: "28 años · 10K en 52'",
        secondQuestion: '¿También les armas la alimentación?',
        whatsappInvite: `${WHATSAPP_INTRO.endurance}${WHATSAPP_ACCESO_CON_CLAVE}`,
        whatsappInviteSinClave: `${WHATSAPP_INTRO.endurance}${WHATSAPP_ACCESO_SIN_CLAVE}`,
    },
    other: {
        tileTitle: 'Otra cosa / todavía no lo tengo claro',
        tileSubtitle: 'Te dejamos el panel completo y lo ajustas cuando quieras.',
        noun: { singular: 'alumno', plural: 'alumnos' },
        demoName: null,
        demoTagline: null,
        secondQuestion: null,
        whatsappInvite: `${WHATSAPP_INTRO.other}${WHATSAPP_ACCESO_CON_CLAVE}`,
        whatsappInviteSinClave: `${WHATSAPP_INTRO.other}${WHATSAPP_ACCESO_SIN_CLAVE}`,
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
 * Rellena la plantilla de WhatsApp. Reemplaza TODAS las apariciones de `{nombre}`, `{link}`,
 * `{correo}` y `{clave}` (el `link` va crudo: quien lo mande decide si lo pasa por
 * `encodeURIComponent` al armar el `wa.me`, porque ahí se codifica el mensaje entero).
 *
 * **Qué variante sale la decide lo que se pasa, y quién lo pasa es el CALL SITE**: con `correo` y
 * `clave` presentes sale `whatsappInvite` (con credencial); si falta alguno —o viene vacío— sale
 * `whatsappInviteSinClave`. El paquete no sabe si hay teléfono, y la regla 4 de
 * `docs/specs/flujo-coach-nuevo/SPEC.md §5` (credencial SOLO a un destinatario con nombre) se
 * aplica donde ese dato existe: `buildWhatsappUrl` en web, `guided-invite` en RN.
 *
 * Fallar hacia la variante sin credencial es deliberado: un `undefined` no puede terminar en un
 * mensaje que diga «Tu clave temporal: undefined».
 */
export function formatWhatsappInvite(
    persona: Persona,
    vars: { nombre: string; link: string; correo?: string | null; clave?: string | null },
): string {
    const correo = (vars.correo ?? '').trim()
    const clave = (vars.clave ?? '').trim()
    const copy = PERSONA_COPY[persona]
    const template = correo && clave ? copy.whatsappInvite : copy.whatsappInviteSinClave
    // `split().join()` en vez de `replaceAll`: el metodo pide lib ES2021 y este paquete tambien
    // lo compilan tsconfigs con lib ES2020 (los packages puros). Semantica identica con tokens
    // literales, y sin regex (el link no se escapa).
    return template
        .split('{nombre}').join(vars.nombre)
        .split('{link}').join(vars.link)
        .split('{correo}').join(correo)
        .split('{clave}').join(clave)
}
