'use client'

import Image from 'next/image'
import { Printer } from 'lucide-react'
import { MOVEMENT_PATTERNS_V1 } from '@eva/calc'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { MovementAssessmentItem } from '@/domain/assessment/types'
import type { MovementPrintData } from '@/services/assessment/movement-assessment.service'

/**
 * Cuerpo del reporte imprimible (patron progress-print). Estilo claro fijo
 * (independiente del dark mode) y marca del CONTEXTO (team o coach — jamas EVA
 * hardcodeado si hay marca). Disclaimer SIEMPRE visible (AC5).
 */
export function MovementPrintReport({ data }: { data: MovementPrintData }) {
    const { t, language } = useTranslation()
    const locale = language === 'es' ? 'es-CL' : 'en-US'
    const { assessment } = data

    const orderedItems = MOVEMENT_PATTERNS_V1.map((def) =>
        assessment.items.find((i) => i.pattern === def.slug)
    ).filter((i): i is MovementAssessmentItem => i != null)

    const bandColor =
        assessment.risk_band === 'high' ? '#ef4444' : assessment.risk_band === 'moderate' ? '#f59e0b' : '#10b981'

    return (
        <div className="mx-auto max-w-[720px] bg-white p-8 text-neutral-900">
            <div className="flex items-center justify-between gap-4 border-b-2 pb-4" style={{ borderColor: data.brandColor ?? '#111' }}>
                <div className="flex items-center gap-3">
                    {data.logoUrl && (
                        <Image
                            src={data.logoUrl}
                            alt={data.brandName}
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-lg object-contain"
                        />
                    )}
                    <div>
                        <p className="text-sm font-bold">{data.brandName}</p>
                        <h1 className="text-xl font-extrabold">{t('assessment.title')}</h1>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold print:hidden"
                >
                    <Printer className="h-4 w-4" aria-hidden />
                    {t('assessment.report.print')}
                </button>
            </div>

            <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                    <p className="text-lg font-bold">{data.clientName ?? '—'}</p>
                    <p className="text-xs text-neutral-500">
                        {t('assessment.report.assessedAt')}{' '}
                        {new Date(assessment.assessed_at).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                        })}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">{t('assessment.composite')}</p>
                    <p className="text-3xl font-extrabold tabular-nums">
                        {assessment.composite_score ?? '—'}<span className="text-base text-neutral-500">/21</span>
                    </p>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold"
                    style={{ borderColor: bandColor, color: bandColor }}
                >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bandColor }} aria-hidden />
                    {assessment.risk_band ? t(`assessment.band.${assessment.risk_band}`) : '—'}
                </span>
                {assessment.has_pain && (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                        {t('assessment.flag.pain')}
                    </span>
                )}
                {assessment.has_asymmetry && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {t('assessment.flag.asymmetry')}
                    </span>
                )}
            </div>

            <table className="mt-5 w-full border-collapse text-sm">
                <thead>
                    <tr className="border-b-2 border-neutral-900 text-left text-[10px] uppercase tracking-wide">
                        <th className="py-2 pr-2">{t('assessment.report.pattern')}</th>
                        <th className="px-2 py-2 text-center">{t('assessment.side.left')}</th>
                        <th className="px-2 py-2 text-center">{t('assessment.side.right')}</th>
                        <th className="px-2 py-2 text-center">{t('assessment.flag.pain')}</th>
                        <th className="px-2 py-2 text-center">{t('assessment.report.final')}</th>
                    </tr>
                </thead>
                <tbody>
                    {orderedItems.map((item) => {
                        const weakLeft =
                            item.is_per_side &&
                            item.score_left != null &&
                            item.score_right != null &&
                            item.score_left < item.score_right
                        const weakRight =
                            item.is_per_side &&
                            item.score_left != null &&
                            item.score_right != null &&
                            item.score_right < item.score_left
                        return (
                            <tr key={item.id} className="border-b border-neutral-200">
                                <td className="py-2 pr-2">
                                    <p className="font-medium">{t(`assessment.pattern.${item.pattern}`)}</p>
                                    {item.clearing_positive === true && (
                                        <p className="text-[10px] font-semibold text-red-600">
                                            {t('assessment.report.clearing')}: {t('assessment.report.clearingPositive')}
                                        </p>
                                    )}
                                    {item.comment && <p className="text-[11px] text-neutral-500">{item.comment}</p>}
                                </td>
                                <td className={`px-2 py-2 text-center tabular-nums ${weakLeft ? 'font-extrabold text-red-600' : ''}`}>
                                    {item.is_per_side ? (item.score_left ?? '—') : '—'}
                                </td>
                                <td className={`px-2 py-2 text-center tabular-nums ${weakRight ? 'font-extrabold text-red-600' : ''}`}>
                                    {item.is_per_side ? (item.score_right ?? '—') : (item.score_single ?? '—')}
                                </td>
                                <td className="px-2 py-2 text-center">{item.pain ? '✕' : ''}</td>
                                <td className="px-2 py-2 text-center text-base font-bold tabular-nums">{item.final_score}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>

            {assessment.notes && (
                <div className="mt-4 rounded-lg border border-neutral-200 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                        {t('assessment.report.notes')}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{assessment.notes}</p>
                </div>
            )}

            <p className="mt-6 border-t border-neutral-200 pt-3 text-[11px] leading-relaxed text-neutral-500">
                {t('assessment.disclaimer')}
            </p>
        </div>
    )
}
