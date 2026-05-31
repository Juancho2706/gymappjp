import { redirect } from 'next/navigation'
import { orgRoleCan } from '@/domain/org/permissions'
import Link from 'next/link'
import type { Metadata } from 'next'
import {
    Apple,
    ArrowRight,
    Beef,
    BookOpen,
    Flame,
    Gauge,
    Layers3,
    Salad,
    Scale,
    Sparkles,
    Target,
    Users,
} from 'lucide-react'
import { getOrgBySlug, getOrgMembers, getOrgNutritionTemplateUsage, getOrgNutritionTemplates } from '../_data/org.queries'
import { CreateOrgNutritionTemplateForm } from './_components/CreateOrgNutritionTemplateForm'
import { DeleteOrgNutritionTemplateButton } from './_components/DeleteOrgNutritionTemplateButton'

export const metadata: Metadata = { title: 'Nutricion' }

interface Props {
    params: Promise<{ slug: string }>
}

const GOAL_LABELS: Record<string, string> = {
    deficit: 'Deficit',
    maintenance: 'Mantenimiento',
    surplus: 'Volumen',
}

const GOAL_TONES: Record<string, string> = {
    deficit: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
    maintenance: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300',
    surplus: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-300',
}

function macroTotal(template: { protein_g: number | null; carbs_g: number | null; fats_g: number | null }) {
    return (template.protein_g ?? 0) * 4 + (template.carbs_g ?? 0) * 4 + (template.fats_g ?? 0) * 9
}

function macroSplit(template: { protein_g: number | null; carbs_g: number | null; fats_g: number | null }) {
    const total = macroTotal(template)
    if (!total) return 'Sin macros'
    const protein = Math.round(((template.protein_g ?? 0) * 4 / total) * 100)
    const carbs = Math.round(((template.carbs_g ?? 0) * 4 / total) * 100)
    const fats = Math.max(0, 100 - protein - carbs)
    return `${protein}% P / ${carbs}% C / ${fats}% G`
}

export default async function OrgNutritionPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const isAdmin = orgRoleCan(org.myRole, 'org.coaches.invite')
    if (!isAdmin) redirect(`/org/${slug}`)

    const [templates, members] = await Promise.all([
        getOrgNutritionTemplates(org.id),
        getOrgMembers(org.id),
    ])
    const templateUsage = await getOrgNutritionTemplateUsage(org.id, templates)
    const usageByTemplate = new Map(templateUsage.map(item => [item.template_id, item]))

    const activeCoaches = members.filter(member => member.role === 'coach' && member.status === 'active' && member.coach_id)
    const goalCounts = templates.reduce<Record<string, number>>((acc, template) => {
        const goal = template.goal_type ?? 'none'
        acc[goal] = (acc[goal] ?? 0) + 1
        return acc
    }, {})
    const avgCalories = templates.length
        ? Math.round(templates.reduce((sum, template) => sum + (template.daily_calories ?? 0), 0) / Math.max(1, templates.filter(template => template.daily_calories).length || 1))
        : 0
    const templatesInUse = templateUsage.filter(item => item.active_clients > 0).length
    const activeClientsUsingTemplates = templateUsage.reduce((sum, item) => sum + item.active_clients, 0)
    const loggedClients7d = templateUsage.reduce((sum, item) => sum + item.logged_clients_7d, 0)
    const adoptionAdherence = activeClientsUsingTemplates > 0
        ? Math.round((loggedClients7d / activeClientsUsingTemplates) * 100)
        : 0
    const coachUsageRows = templateUsage
        .flatMap(item => item.coach_usage.map(coach => ({
            ...coach,
            template_id: item.template_id,
            template_name: templates.find(template => template.id === item.template_id)?.name ?? 'Template',
        })))
        .sort((a, b) => b.active_clients - a.active_clients || b.logged_clients_7d - a.logged_clients_7d)
        .slice(0, 8)

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_86%_12%,rgba(249,115,22,0.12),transparent_30%)]"
                    />
                    <div className="relative grid gap-6 xl:grid-cols-[1fr_430px] xl:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                                <Salad className="h-3.5 w-3.5" aria-hidden="true" />
                                Herramientas / Nutricion
                            </span>
                            <h1 className="mt-3 max-w-3xl text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                                Biblioteca nutricional enterprise
                            </h1>
                            <p className="hidden sm:block mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Plantillas base para que coaches enterprise creen planes mas rapido, con macros consistentes y meal structure reutilizable.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-2">
                                <Link
                                    href={`/org/${slug}/coaches`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300"
                                >
                                    Coaches que la usan
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </Link>
                                <Link
                                    href={`/org/${slug}/audit`}
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-bold text-zinc-200 transition hover:bg-zinc-800"
                                >
                                    Ver auditoria
                                </Link>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/75 p-3 md:grid-cols-4">
                            {[
                                ['Templates', templates.length],
                                ['Coaches', activeCoaches.length],
                                ['En uso', templatesInUse],
                                ['Adh. 7d', activeClientsUsingTemplates > 0 ? `${adoptionAdherence}%` : 'N/D'],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-xl bg-zinc-900 p-3 text-center">
                                    <p className="text-2xl font-black text-white">{value}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-4">
                    {([
                        [BookOpen, 'Catalogo', templates.length, 'plantillas disponibles'],
                        [Flame, 'Promedio kcal', avgCalories || 'N/D', 'templates con calorias'],
                        [Target, 'Objetivos', Object.keys(goalCounts).length, 'tipos cubiertos'],
                        [Users, 'Alumnos usando', activeClientsUsingTemplates, 'match por nombre + macros'],
                    ] as const).map(([Icon, title, value, detail]) => (
                        <div key={title} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <Icon className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                                <p className="truncate text-right text-lg font-black text-white">{value}</p>
                            </div>
                            <h2 className="mt-4 text-sm font-black text-white">{title}</h2>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
                        </div>
                    ))}
                </section>

                <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
                    <aside className="space-y-5">
                        <CreateOrgNutritionTemplateForm orgSlug={slug} />

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Gauge className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Coverage</h2>
                            </div>
                            <div className="mt-4 space-y-3">
                                {['deficit', 'maintenance', 'surplus'].map(goal => (
                                    <div key={goal} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <span className={`rounded-full border px-2 py-1 text-xs font-bold ${GOAL_TONES[goal]}`}>{GOAL_LABELS[goal]}</span>
                                        <span className="text-sm font-black text-white">{goalCounts[goal] ?? 0}</span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Uso real</h2>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                    <p className="text-2xl font-black text-white">{activeClientsUsingTemplates}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Alumnos activos</p>
                                </div>
                                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                    <p className="text-2xl font-black text-white">{activeClientsUsingTemplates > 0 ? `${adoptionAdherence}%` : 'N/D'}</p>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">Adherencia 7d</p>
                                </div>
                            </div>
                            <p className="mt-3 text-xs leading-5 text-zinc-500">
                                MVP sin migracion: detecta planes activos que conservan mismo nombre y macros del template org.
                            </p>
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Uso por coach</h2>
                            </div>
                            <div className="mt-4 space-y-2">
                                {coachUsageRows.length > 0 ? coachUsageRows.map(row => (
                                    <div key={`${row.template_id}-${row.coach_id}`} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-white">{row.coach_name ?? 'Coach sin nombre'}</p>
                                                <p className="mt-1 truncate text-xs text-zinc-500">{row.template_name}</p>
                                            </div>
                                            <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-xs font-black text-emerald-300">
                                                {row.adherence_7d}%
                                            </span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                            <div>
                                                <p className="text-sm font-black text-white">{row.active_clients}</p>
                                                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-500">Alumnos</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-white">{row.active_plans}</p>
                                                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-500">Planes</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-white">{row.logged_clients_7d}</p>
                                                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-500">Logs 7d</p>
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-4 text-sm leading-6 text-zinc-500">
                                        Todavia no hay coaches usando templates org con planes activos.
                                    </p>
                                )}
                            </div>
                        </section>
                    </aside>

                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Layers3 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                    <h2 className="text-lg font-black text-white">Templates nutricionales</h2>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-zinc-500">
                                    Los coaches enterprise pueden leer esta biblioteca desde el flujo coach. Coach standalone no depende de esto.
                                </p>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-400">
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                Reutilizable web/mobile
                            </div>
                        </div>

                        <div className="mt-5 space-y-3">
                            {templates.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/50 p-8 text-center">
                                    <Apple className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
                                    <p className="mt-3 text-sm font-bold text-zinc-300">Sin templates nutricionales</p>
                                    <p className="mt-1 text-sm text-zinc-500">Crea bases para deficit, mantenimiento y volumen antes de escalar coaches.</p>
                                </div>
                            ) : (
                                templates.map(template => {
                                    const usage = usageByTemplate.get(template.id)
                                    return (
                                    <article key={template.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="truncate text-sm font-black text-white">{template.name}</p>
                                                    {template.goal_type && (
                                                        <span className={`rounded-full border px-2 py-1 text-xs font-bold ${GOAL_TONES[template.goal_type] ?? 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
                                                            {GOAL_LABELS[template.goal_type] ?? template.goal_type}
                                                        </span>
                                                    )}
                                                </div>
                                                {template.description && <p className="mt-2 text-sm leading-6 text-zinc-500">{template.description}</p>}

                                                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                                                    {([
                                                        [Flame, 'Kcal', template.daily_calories ?? 'N/D'],
                                                        [Beef, 'Proteina', template.protein_g ? `${template.protein_g}g` : 'N/D'],
                                                        [Apple, 'Carbos', template.carbs_g ? `${template.carbs_g}g` : 'N/D'],
                                                        [Scale, 'Grasas', template.fats_g ? `${template.fats_g}g` : 'N/D'],
                                                    ] as const).map(([Icon, label, value]) => (
                                                        <div key={label as string} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                                                            <Icon className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                                            <p className="mt-2 text-xs text-zinc-500">{label as string}</p>
                                                            <p className="text-sm font-black text-white">{value as string | number}</p>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                                                        <p className="text-xs text-zinc-500">Alumnos activos</p>
                                                        <p className="mt-1 text-lg font-black text-white">{usage?.active_clients ?? 0}</p>
                                                    </div>
                                                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                                                        <p className="text-xs text-zinc-500">Logs 7d</p>
                                                        <p className="mt-1 text-lg font-black text-white">{usage?.logged_clients_7d ?? 0}</p>
                                                    </div>
                                                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
                                                        <p className="text-xs text-zinc-500">Adh. 7d</p>
                                                        <p className="mt-1 text-lg font-black text-white">{usage && usage.active_clients > 0 ? `${usage.adherence_7d}%` : 'N/D'}</p>
                                                    </div>
                                                </div>

                                                {usage && usage.coach_usage.length > 0 && (
                                                    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                                                        <p className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Coaches usando este template</p>
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {usage.coach_usage.slice(0, 4).map(coach => (
                                                                <span key={coach.coach_id} className="rounded-full border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-semibold text-zinc-300">
                                                                    {coach.coach_name ?? 'Coach'} · {coach.active_clients} alumnos
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">{macroSplit(template)}</p>

                                                {template.meal_names.length > 0 && (
                                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                                        {template.meal_names.map((meal, index) => (
                                                            <span key={`${meal.name}-${index}`} className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-semibold text-zinc-400">
                                                                {meal.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <DeleteOrgNutritionTemplateButton orgSlug={slug} templateId={template.id} />
                                        </div>
                                    </article>
                                    )
                                })
                            )}
                        </div>
                    </section>
                </section>
            </div>
        </div>
    )
}
