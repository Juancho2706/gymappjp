'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { BookOpen, ChevronDown, Search } from 'lucide-react'

/**
 * Centro de ayuda — sección colapsable con Guías (cards apiladas paso-a-paso) y FAQ
 * (accordion), más un buscador client-side. Autocontenida: el mismo componente se usa
 * en el pane embebido de Opciones (SettingsShell) y en la ruta /coach/support (hub móvil),
 * sin navegación a otra página. Contenido verificado contra el comportamiento real del panel.
 */

type Guide = { title: string; steps: string[] }
type Faq = { q: string; a: string }

const GUIDES: Guide[] = [
    {
        title: 'Primeros pasos',
        steps: [
            'Crea tu cuenta en eva-app.cl y confirma tu correo (plan gratis) o completa el pago (plan pagado).',
            'Personaliza tu marca en Opciones › Mi Marca: logo, colores y nombre.',
            'Crea tu primer alumno en Alumnos › Nuevo Alumno y envíale el acceso por WhatsApp o con tu código de invitación.',
        ],
    },
    {
        title: 'Invitar y gestionar alumnos',
        steps: [
            'En Alumnos, toca "Nuevo Alumno" y completa nombre, correo, teléfono y una contraseña temporal.',
            'Comparte el enlace de tu portal (chip "Portal alumnos") o tu código de invitación.',
            'Desde el directorio puedes editar, pausar, archivar, resetear la contraseña o eliminar a cada alumno.',
        ],
    },
    {
        title: 'Crear un programa en el builder',
        steps: [
            'Abre la ficha del alumno y toca "Entrenamiento" para entrar al builder.',
            'Agrega días, arrastra ejercicios del catálogo y edita cada bloque (series, reps, tempo, RIR, descanso).',
            'Para una superserie, usa el botón "Superserie" entre dos bloques de la misma área.',
            'Guarda: los cambios quedan en el plan del alumno.',
        ],
    },
    {
        title: 'Armar un plan de nutrición',
        steps: [
            'En Nutrición tienes 4 pestañas: Plantillas, Alumnos, Alimentos y Recetas.',
            'Crea una plantilla reutilizable ("Nueva plantilla") o asigna un plan directo a un alumno.',
            'En la pestaña Alumnos usa "Asignar" para crear el plan del alumno y editarlo (queda como CUSTOM).',
            'Una plantilla es genérica; el plan del alumno es su copia concreta y editable.',
        ],
    },
    {
        title: 'Módulos Pro',
        steps: [
            'Cardio, Evaluación de movimiento, Composición corporal y Nutrición Pro son módulos add-on.',
            'Actívalos en Opciones › Suscripción (requieren un plan pagado activo); cada uno cuesta $9.990/mes.',
            'Ya activos, aparecen en la ficha del alumno y enriquecen el builder.',
        ],
    },
    {
        title: 'Tu marca white-label',
        steps: [
            'En Opciones › Mi Marca defines logo, colores, nombre y mensajes de bienvenida.',
            'Tus alumnos ven TU marca en su app, no la de EVA.',
            'La personalización de marca está disponible desde el plan Starter.',
        ],
    },
    {
        title: 'Suscripción y pagos',
        steps: [
            'En Opciones › Suscripción ves tu plan, el próximo cobro y el desglose.',
            'Puedes cambiar de plan, cambiar la tarjeta o cancelar cuando quieras.',
            'Un upgrade se activa al instante (cobro prorrateado); un downgrade se agenda para el próximo corte.',
        ],
    },
    {
        title: 'Check-ins y seguimiento',
        steps: [
            'Tus alumnos envían check-ins con peso y fotos desde su app.',
            'Revísalos en la ficha del alumno (pestañas Overview y Progreso).',
            'El directorio resalta a quienes necesitan atención según su adherencia y días sin actividad.',
        ],
    },
]

const FAQS: Faq[] = [
    {
        q: '¿Cómo entra mi alumno a la app?',
        a: 'Comparte el enlace de tu portal (formato eva-app.cl/c/tu-código/login) o tu código de invitación. El alumno inicia sesión con su correo y la contraseña temporal que le asignaste.',
    },
    {
        q: '¿El alumno paga algo?',
        a: 'No. EVA lo pagas tú como coach; para tu alumno la app no tiene costo.',
    },
    {
        q: '¿Qué pasa si llego al tope de alumnos?',
        a: 'Al alcanzar el límite de tu plan verás un aviso al crear un alumno. Puedes archivar alumnos inactivos o subir a un plan con más cupo desde Opciones › Suscripción.',
    },
    {
        q: '¿Puedo cambiar de plan?',
        a: 'Sí, desde Opciones › Suscripción. Subir de plan se activa de inmediato con un cobro prorrateado; bajar de plan o cambiar de frecuencia se agenda para tu próxima renovación.',
    },
    {
        q: '¿Cómo reseteo la contraseña de un alumno?',
        a: 'En Alumnos, abre el menú del alumno y usa "Resetear contraseña": se genera una contraseña temporal que puedes copiar y enviarle. El alumno deberá cambiarla al ingresar.',
    },
    {
        q: '¿Puedo exportar la ficha en PDF?',
        a: 'Sí. En la ficha del alumno usa el botón "Exportar": se abre la vista de impresión de tu navegador, desde donde puedes guardar como PDF.',
    },
    {
        q: '¿Qué es una superserie y cómo la armo?',
        a: 'Es un grupo de ejercicios que se ejecutan seguidos. En el builder, usa el botón "Superserie" entre dos bloques de la misma área para enlazarlos.',
    },
    {
        q: '¿Cómo funciona la adherencia?',
        a: 'Es el porcentaje de lo planificado que tu alumno efectivamente completó (entrenamientos y comidas marcadas). La ves en el directorio y en la ficha de cada alumno.',
    },
    {
        q: '¿Puedo usar mi propio logo?',
        a: 'Sí. En Opciones › Mi Marca subes tu logo y eliges tus colores. Disponible desde el plan Starter.',
    },
    {
        q: '¿Qué pasa si cancelo?',
        a: 'Conservas el acceso hasta el final del período que ya pagaste. Después tu cuenta pasa al plan gratuito; tus datos no se borran.',
    },
    {
        q: '¿Los alumnos ven mi marca o la de EVA?',
        a: 'Ven tu marca: la app del alumno usa tu logo, colores y nombre. Solo las pantallas de acceso del coach muestran la marca EVA.',
    },
    {
        q: '¿Cómo importo alumnos desde Excel?',
        a: 'En Alumnos › Importar subes un Excel o CSV, mapeas las columnas y confirmas. La importación masiva está disponible según tu plan.',
    },
    {
        q: '¿Cómo funcionan los módulos de pago?',
        a: 'Cardio, Evaluación de movimiento, Composición corporal y Nutrición Pro se activan en Opciones › Suscripción (requieren plan pagado). Cuestan $9.990/mes cada uno y se suman a tu cobro.',
    },
    {
        q: '¿Necesito tarjeta para el plan gratis?',
        a: 'No. El plan gratuito no requiere tarjeta e incluye hasta 3 alumnos.',
    },
    {
        q: '¿Cómo contacto a soporte?',
        a: 'Escríbenos a contacto@eva-app.cl o usa el formulario "Enviar un mensaje" más abajo. Respondemos en menos de 24 horas.',
    },
]

function matches(q: string, ...fields: string[]) {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return fields.some((f) => f.toLowerCase().includes(needle))
}

export function HelpCenter() {
    const [open, setOpen] = useState(false)
    const [tab, setTab] = useState<'guias' | 'faq'>('guias')
    const [query, setQuery] = useState('')
    const [openFaq, setOpenFaq] = useState<number | null>(null)

    const guides = useMemo(() => GUIDES.filter((g) => matches(query, g.title, ...g.steps)), [query])
    const faqs = useMemo(() => FAQS.filter((f) => matches(query, f.q, f.a)), [query])

    return (
        <div>
            <Card padding="none">
                {/* Trigger — abre/cierra la sección */}
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((v) => !v)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                >
                    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-control bg-surface-sunken text-[var(--ink-700)]">
                        <BookOpen className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-bold text-strong">Centro de ayuda</div>
                        <div className="mt-px truncate text-[13px] text-muted">Guías y preguntas frecuentes</div>
                    </div>
                    <ChevronDown
                        aria-hidden
                        strokeWidth={2.25}
                        className={`size-[18px] shrink-0 text-[var(--ink-300)] transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                </button>

                {open ? (
                    <div className="border-t border-[var(--border-subtle)] p-3.5">
                        {/* Buscador */}
                        <div className="relative">
                            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-[16px] -translate-y-1/2 text-muted" />
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar en la ayuda…"
                                aria-label="Buscar en el centro de ayuda"
                                className="h-11 w-full rounded-control border border-default bg-surface-sunken pl-9 pr-3 text-sm text-strong outline-none placeholder:text-muted focus:border-[var(--brand)]"
                            />
                        </div>

                        {/* Tabs */}
                        <div className="mt-3 flex gap-1.5 rounded-control bg-surface-sunken p-1">
                            {(['guias', 'faq'] as const).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setTab(t)}
                                    className={`flex min-h-[44px] flex-1 items-center justify-center rounded-control px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                                        tab === t ? 'bg-surface-card text-strong shadow-sm' : 'text-muted hover:text-strong'
                                    }`}
                                >
                                    {t === 'guias' ? 'Guías' : 'FAQ'}
                                </button>
                            ))}
                        </div>

                        {/* Contenido */}
                        <div className="mt-3.5">
                            {tab === 'guias' ? (
                                guides.length === 0 ? (
                                    <p className="rounded-control border border-subtle bg-surface-sunken px-3 py-4 text-center text-[13px] text-muted">
                                        No encontramos guías para “{query}”.
                                    </p>
                                ) : (
                                    <div className="space-y-2.5">
                                        {guides.map((g) => (
                                            <div key={g.title} className="rounded-control border border-subtle bg-surface-card p-3.5">
                                                <h4 className="text-[14.5px] font-bold text-strong">{g.title}</h4>
                                                <ol className="mt-2 space-y-1.5">
                                                    {g.steps.map((s, i) => (
                                                        <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-muted">
                                                            <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-sport-100 text-[11px] font-bold text-sport-600">
                                                                {i + 1}
                                                            </span>
                                                            <span className="min-w-0 flex-1">{s}</span>
                                                        </li>
                                                    ))}
                                                </ol>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : faqs.length === 0 ? (
                                <p className="rounded-control border border-subtle bg-surface-sunken px-3 py-4 text-center text-[13px] text-muted">
                                    No encontramos preguntas para “{query}”.
                                </p>
                            ) : (
                                <div className="overflow-hidden rounded-control border border-subtle bg-surface-card">
                                    {faqs.map((f, i) => {
                                        const isOpen = openFaq === i
                                        return (
                                            <div key={f.q}>
                                                {i > 0 && <div className="mx-3.5 h-px bg-[var(--border-subtle)]" />}
                                                <button
                                                    type="button"
                                                    aria-expanded={isOpen}
                                                    onClick={() => setOpenFaq(isOpen ? null : i)}
                                                    className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                                                >
                                                    <span className="min-w-0 flex-1 text-[14px] font-semibold text-strong">{f.q}</span>
                                                    <ChevronDown
                                                        aria-hidden
                                                        strokeWidth={2.25}
                                                        className={`size-[17px] shrink-0 text-[var(--ink-300)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                                    />
                                                </button>
                                                {isOpen ? (
                                                    <p className="px-3.5 pb-3.5 text-[13px] leading-relaxed text-muted">{f.a}</p>
                                                ) : null}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </Card>
        </div>
    )
}
