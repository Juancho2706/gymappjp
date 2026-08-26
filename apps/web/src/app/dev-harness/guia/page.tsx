import { notFound } from 'next/navigation'
import type { Json } from '@/lib/database.types'
import type { OnboardingSignals } from '@eva/onboarding'
import type { Persona } from '@eva/schemas'
import { GuidePill } from '@/components/coach/GuidePill'
import { GuideScreen } from '../../coach/guia/_components/GuideScreen'
import { DemoStudentBanner } from '../../coach/clients/[clientId]/_components/DemoStudentBanner'
import type { CoachBrandDraft, DemoStudentSnapshot } from '../../coach/dashboard/_data/dashboard.queries'

/**
 * HARNESS LOCAL (solo dev) — «Tus primeros pasos» (`/coach/guia`) + la píldora flotante + la
 * banda del alumno de ejemplo, todo con FIXTURES y sin tocar la base.
 *
 * Existe para que `scripts/guia-visual-check.mjs` pueda medir la responsividad real (5 anchos ×
 * light/dark) sin sesión de coach ni datos sembrados: la guía es la primera pantalla que ve TODO
 * coach nuevo desde el 22-08 y el QA del owner la encontró rota justo en los anchos que nadie
 * abre en el navegador de escritorio.
 *
 * Lo que el harness IMITA del shell real (`coach/layout.tsx` + `CoachMainWrapper` +
 * `CoachSidebar`), porque de eso depende la geometría que se afirma:
 *  - `<main id="coach-main">` con el mismo padding y el mismo cap de ancho — la píldora MIDE ese
 *    elemento para apoyarse en el borde izquierdo del contenido;
 *  - el riel del menú de escritorio (248 px expandido) a la izquierda;
 *  - la cápsula flotante del nav móvil, con su geometría verbatim (`left/right: 14`,
 *    `bottom: safe-area + 16`, padding 8, icono 24 + rótulo 10 px) — es contra ESA caja que se
 *    afirma que la píldora no la tapa.
 *
 * Query params:
 *  - `?persona=strength|nutrition|rehab|endurance|other` (default `nutrition`)
 *  - `?demo=0` para la variante sin alumno de ejemplo (la guía pierde su riel)
 *  - `?brand=0` para la variante sin la tarjeta «Tu marca en 60 segundos»
 *  - `?paso2=pendiente` para el paso 2 SIN tildar: es el único estado en que se ve el CTA nuevo
 *    de «Vive tu app» (docs/specs/vive-tu-app-directo V1.18). Con el fixture por defecto el paso
 *    está hecho y el gate visual nunca mediría el botón que esta spec cambia.
 *
 * Fuera de `development` la ruta no existe (mismo guard que el resto de `dev-harness`).
 */

const PERSONAS: readonly Persona[] = ['strength', 'nutrition', 'rehab', 'endurance', 'other']

/** Nombres del demo por persona, en línea con `PERSONA_COPY` (fixture, no lectura). */
const DEMO_NAME: Record<Persona, string> = {
    strength: 'Matías Fuentes',
    nutrition: 'Ana Riquelme',
    rehab: 'Pedro Lagos',
    endurance: 'Javiera Contreras',
    other: 'Alumno de ejemplo',
}

/** KPIs largos a propósito: el rótulo más ancho es el que revienta la grilla si algo no trunca. */
const DEMO_KPIS: Record<Persona, DemoStudentSnapshot['kpis']> = {
    strength: [
        { label: 'Programa', value: '3 días' },
        { label: 'Entrenamientos', value: '8' },
        { label: 'Récord personal', value: '1' },
    ],
    nutrition: [
        { label: 'Pauta', value: 'Activa' },
        { label: 'Adherencia', value: '86%' },
        { label: 'Composición', value: '27% grasa' },
    ],
    rehab: [
        { label: 'Screening', value: '7 patrones' },
        { label: 'Pauta domiciliaria', value: '3 áreas' },
        { label: 'Reevaluación', value: null },
    ],
    endurance: [
        { label: 'Zonas', value: 'Calculadas' },
        { label: 'Sesiones', value: '3' },
        { label: 'Frecuencia cardíaca', value: '52 lpm' },
    ],
    other: [
        { label: 'Ficha', value: 'Completa' },
        { label: 'Actividad', value: null },
        { label: 'Check-ins', value: '2' },
    ],
}

/**
 * Marca SIN elegir y con el verde sembrado: es el estado real del coach del día 1 y el que
 * hace que `BrandQuickCard` pinte su aviso extra («Te dejamos el azul EVA preseleccionado»).
 */
const BRAND: CoachBrandDraft = {
    fullName: 'Ana Riquelme',
    brandName: 'Estudio Riquelme Nutrición Clínica',
    instagramHandle: '',
    primaryColor: '#10B981',
    useBrandColorsCoach: true,
    welcomeMessage: '',
    loaderText: '',
    useCustomLoader: false,
    loaderIconMode: 'eva',
    neutralTint: false,
    brandFontKey: '',
    loaderVariant: 'eva',
    welcomeModalEnabled: false,
    welcomeModalContent: '',
    welcomeModalType: 'text',
    executorTheme: 'coach',
    themePresetKey: '',
    loginLayoutKey: '',
    loaderConfig: '',
    logoUrl: null,
}

/**
 * 2/5 con los pasos 2 y 3 hechos: deja el paso 1 como «siguiente» (que es el que embebe la
 * tarjeta de marca) y los pasos 4 y 5 pendientes, o sea los TRES estados visuales en pantalla.
 *
 * `emitted` viene lleno a propósito: sin eso `useOnboardingGuide` intentaría emitir
 * `step_completed` y persistir el jsonb en cada carga del harness — POSTs a endpoints sin sesión
 * y un toast de error encima de las capturas.
 */
const SIGNALS: OnboardingSignals = {
    hasBrand: false,
    viveTuAppOpened: true,
    hasFirstArtifact: true,
    realClients: 0,
    realStudentActivity: false,
}

const GUIDE_FIXTURE: Json = {
    completed: { vive_tu_app: true, first_artifact: true },
    emitted: ['vive_tu_app', 'first_artifact'],
    dismissed: false,
    hidden: false,
    ahaMomentSent: false,
    guide_seen_at: '2026-08-22T10:00:00.000Z',
}

export default async function GuiaHarnessPage({
    searchParams,
}: {
    searchParams: Promise<{ persona?: string; demo?: string; brand?: string; paso2?: string }>
}) {
    if (process.env.NODE_ENV !== 'development') notFound()

    const params = await searchParams
    const persona: Persona = PERSONAS.includes(params.persona as Persona)
        ? (params.persona as Persona)
        : 'nutrition'
    const withDemo = params.demo !== '0'
    const needsBrand = params.brand !== '0'
    const paso2Pendiente = params.paso2 === 'pendiente'

    // Paso 2 sin tildar: la señal del servidor en `false` y la key fuera de `completed`. `emitted`
    // se deja como está — solo evita POSTs, y un paso no completado no emite nada igual.
    const signals: OnboardingSignals = paso2Pendiente
        ? { ...SIGNALS, viveTuAppOpened: false }
        : SIGNALS
    const guide: Json = paso2Pendiente
        ? { ...(GUIDE_FIXTURE as Record<string, unknown>), completed: { vive_tu_app: false, first_artifact: true } }
        : GUIDE_FIXTURE

    const demo: DemoStudentSnapshot | null = withDemo
        ? { clientId: 'demo-harness', fullName: DEMO_NAME[persona], kpis: DEMO_KPIS[persona] }
        : null

    return (
        <div
            className="flex min-h-[100dvh] min-w-0 flex-col bg-[var(--surface-app)] md:h-dvh md:max-h-dvh md:flex-row md:overflow-hidden"
            data-harness="guia"
        >
            {/* Riel del menú de escritorio (248 px expandido, como `CoachSidebar`): la píldora
                mide `#coach-main`, así que sin este bloque su `left` sería el de un panel sin menú
                y el gate no probaría nada de lo que ve el coach. */}
            <div
                aria-hidden="true"
                className="hidden w-[248px] shrink-0 border-r border-subtle bg-[var(--surface-app)] md:block"
            />

            <div className="flex min-w-0 flex-1 flex-col">
                <main
                    id="coach-main"
                    className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-x-clip overflow-y-visible pb-[var(--mobile-content-bottom-offset)] md:overflow-y-auto md:pb-0"
                >
                    <div className="mx-auto w-full min-w-0 max-w-full animate-fade-in px-5 py-6 md:max-w-[var(--dt-read-wide)] md:px-[var(--dt-page-x)] md:py-10">
                        {/* La banda del demo vive en la ficha del alumno, no en la guía: se monta
                            acá arriba para poder medirla en los mismos anchos de una sola pasada. */}
                        <div className="mb-6" data-harness-block="demo-banner">
                            <DemoStudentBanner
                                label="Alumno de ejemplo"
                                name={DEMO_NAME[persona]}
                            />
                        </div>

                        <div data-harness-block="guide">
                            <GuideScreen
                                coachId="harness-coach"
                                firstName="Ana"
                                persona={persona}
                                demo={demo}
                                brand={BRAND}
                                needsBrand={needsBrand}
                                showsEvaBadge
                                signals={signals}
                                initialGuide={guide}
                                guideSeenAt="2026-08-22T10:00:00.000Z"
                                welcome
                            />
                        </div>
                    </div>
                </main>
            </div>

            {/* Cápsula flotante del nav móvil — geometría verbatim de `CoachSidebar` (la del
                diseño `TabBar.jsx`): es la caja contra la que se afirma que la píldora no se
                superpone. Inerte: acá solo importa su rectángulo. */}
            <nav
                aria-label="Navegación principal"
                data-harness-nav="mobile"
                className="flex md:hidden"
                style={{
                    position: 'fixed',
                    left: 14,
                    right: 14,
                    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
                    zIndex: 50,
                    alignItems: 'stretch',
                    padding: 8,
                    borderRadius: 30,
                    background: 'color-mix(in srgb, var(--surface-card) 74%, transparent)',
                    backdropFilter: 'saturate(180%) blur(26px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(26px)',
                    border: '1px solid color-mix(in srgb, var(--text-strong) 9%, transparent)',
                }}
            >
                {['Inicio', 'Alumnos', 'Nutrición', 'Opciones'].map((label) => (
                    <span
                        key={label}
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 3,
                            padding: '6px 0',
                            color: 'var(--ink-400)',
                        }}
                    >
                        <span style={{ display: 'block', height: 24, width: 24, borderRadius: 8, background: 'currentColor', opacity: 0.25 }} />
                        <span style={{ fontSize: 10, fontWeight: 600, maxHeight: 14, overflow: 'hidden' }}>{label}</span>
                    </span>
                ))}
            </nav>

            <GuidePill
                coachId="harness-coach"
                persona={persona}
                onboardingGuide={guide}
                managed={false}
            />

            <p className="sr-only" data-harness-ready>
                listo
            </p>
        </div>
    )
}
