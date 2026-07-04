'use client'

import Link from 'next/link'
import { Building2, ChevronRight } from 'lucide-react'
import type { OrgNutritionTemplate } from '../_data/nutrition-page.queries'

const GOAL_LABELS: Record<string, string> = {
    deficit: 'Déficit',
    maintenance: 'Mantenimiento',
    surplus: 'Volumen',
}

interface Props {
    orgName: string
    templates: OrgNutritionTemplate[]
}

export function OrgTemplatesSection({ orgName, templates }: Props) {
    if (templates.length === 0) return null

    return (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 space-y-3 dark:border-violet-900 dark:bg-violet-950">
            <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">Templates de {orgName}</p>
            </div>
            <div className="flex flex-col gap-2">
                {templates.map(t => (
                    <Link
                        key={t.id}
                        href={`/coach/nutrition-plans/new?org_template=${t.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-surface-sunken border border-zinc-200 dark:border-zinc-800 px-4 py-3 hover:border-violet-400 dark:hover:border-violet-700 transition-colors group"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{t.name}</p>
                                {t.goal_type && (
                                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                                        {GOAL_LABELS[t.goal_type] ?? t.goal_type}
                                    </span>
                                )}
                            </div>
                            <div className="mt-0.5 flex gap-3 text-xs text-zinc-400">
                                {t.daily_calories && <span>{t.daily_calories} kcal</span>}
                                {t.protein_g && <span>P:{t.protein_g}g</span>}
                                {t.carbs_g && <span>C:{t.carbs_g}g</span>}
                                {t.fats_g && <span>G:{t.fats_g}g</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 shrink-0 group-hover:gap-2 transition-all">
                            Usar
                            <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
