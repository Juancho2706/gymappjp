'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatMonthLabel, monthRangeFrom } from '@eva/client-dossier'

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { downloadClientDossierPdf } from '@/lib/pdf/client-dossier-pdf'
import {
    getClientDossier,
    getClientMonthDossiers,
    getClientReportBounds,
} from './_actions/client-detail.actions'

/**
 * Diálogo de exportación del informe del alumno (R19, docs/specs/dossier-por-meses).
 *
 * Dos modos:
 *  - «Estado actual» (default): el dossier de HOY, exactamente el comportamiento anterior del
 *    botón del hero. Con el foco inicial en el CTA, el caso frecuente son 2 clics (o Enter).
 *  - «Por meses»: uno o varios informes mensuales, junto (1 PDF) o separados (un zip).
 *
 * Los errores se muestran INLINE (nunca `alert`) y el diálogo no se cierra si algo falla, para
 * que el coach pueda reintentar sin rearmar la selección.
 */

/** Más de 12 chips ⇒ la lista pasa a caja con scroll (no empuja el CTA fuera de la pantalla). */
const MONTHS_BEFORE_SCROLL = 12

/**
 * Tope del RPC (`p_months` ≤ 24, si no levanta 22023). Se replica en la UI para que el coach vea
 * el freno al tocar el chip 25 y no después de esperar una exportación que iba a fallar.
 */
const MAX_MONTHS = 24

const TOO_MANY_MONTHS = `Podés exportar hasta ${MAX_MONTHS} meses por vez.`

/**
 * Mensajes de producto que el service levanta a propósito (42501 / 22023). En producción Next
 * enmascara el mensaje de cualquier otro error de un server action, así que todo lo que no esté
 * en esta lista se muestra con el texto genérico: es lo único honesto que se puede decir.
 */
const KNOWN_ERRORS = new Set(['No tenés acceso a este alumno', 'Selección de meses inválida'])

const GENERIC_ERROR = 'No se pudo generar el PDF. Intentá de nuevo.'

function messageFor(error: unknown): string {
    if (error instanceof Error && KNOWN_ERRORS.has(error.message)) return error.message
    return GENERIC_ERROR
}

type ExportMode = 'today' | 'months'

type ReportBounds = { firstMonthKey: string; currentMonthKey: string }

export type DossierExportDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    clientId: string
}

export function DossierExportDialog({ open, onOpenChange, clientId }: DossierExportDialogProps) {
    const [mode, setMode] = useState<ExportMode>('today')
    const [bounds, setBounds] = useState<ReportBounds | null>(null)
    const [loadingBounds, setLoadingBounds] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [single, setSingle] = useState(true)
    const [includePhotos, setIncludePhotos] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    // Foco inicial en el CTA (R19): abrir + Enter descarga el estado actual.
    const ctaRef = useRef<HTMLButtonElement | null>(null)
    /** Último `clientId` cuyos bounds ya se pidieron (in-flight o resueltos): evita el doble fetch. */
    const boundsLoadedForRef = useRef<string | null>(null)
    /** Espejo de `bounds` legible dentro del efecto de apertura SIN meterlo en las deps. */
    const boundsRef = useRef<ReportBounds | null>(null)

    /**
     * Apertura: resetea la UI y asegura los bounds.
     *
     * Deps `[open, clientId]` a propósito, y SIN cleanup que cancele. La versión anterior tenía
     * `bounds`/`loadingBounds` en las deps y hacía `setLoadingBounds(true)` adentro: el re-render
     * volvía a correr el efecto, el cleanup marcaba `cancelled` y la promesa en vuelo ya no podía
     * ni setear los meses ni apagar el spinner ⇒ «Cargando meses…» para siempre.
     *
     * El componente vive montado junto al hero (solo cambia `open`), así que resolver después de
     * cerrar no es un leak: deja los bounds cacheados para la próxima apertura.
     */
    useEffect(() => {
        if (!open) return
        setMode('today')
        setBusy(false)
        setError(null)
        setNotice(null)
        setSingle(true)
        setIncludePhotos(true)

        // Alumno distinto ⇒ los bounds cacheados no sirven.
        if (boundsLoadedForRef.current !== null && boundsLoadedForRef.current !== clientId) {
            boundsRef.current = null
            setBounds(null)
            boundsLoadedForRef.current = null
        }
        setSelected(
            boundsRef.current ? new Set([boundsRef.current.currentMonthKey]) : new Set<string>()
        )
        if (boundsLoadedForRef.current === clientId) return

        boundsLoadedForRef.current = clientId
        setLoadingBounds(true)
        getClientReportBounds(clientId)
            .then((next) => {
                boundsRef.current = next
                setBounds(next)
                setSelected(new Set([next.currentMonthKey]))
            })
            .catch(() => {
                // Se libera el candado: la próxima apertura vuelve a intentar.
                boundsLoadedForRef.current = null
                setError('No se pudieron cargar los meses disponibles.')
            })
            .finally(() => setLoadingBounds(false))
    }, [open, clientId])

    /** Meses disponibles, ascendentes (el orden en que se exportan). */
    const monthsAsc = useMemo(
        () => (bounds ? monthRangeFrom(bounds.firstMonthKey, bounds.currentMonthKey) : []),
        [bounds]
    )
    /** Los chips se pintan del más reciente al más viejo: es lo que el coach busca primero. */
    const monthsForChips = useMemo(() => [...monthsAsc].reverse(), [monthsAsc])
    const selectedAsc = useMemo(
        () => monthsAsc.filter((key) => selected.has(key)),
        [monthsAsc, selected]
    )

    const count = selectedAsc.length
    const separate = mode === 'months' && !single && count > 1
    const ctaLabel =
        mode === 'today'
            ? 'Descargar PDF'
            : separate
              ? `Descargar ${count} PDF (zip)`
              : 'Descargar 1 PDF'

    const disabled = busy || (mode === 'months' && (loadingBounds || count === 0))

    function toggleMonth(key: string) {
        setError(null)
        // Tope de la UI (MAX_MONTHS): al pasarse NO se marca el chip y se avisa en línea.
        if (!selected.has(key) && selected.size >= MAX_MONTHS) {
            setNotice(TOO_MANY_MONTHS)
            return
        }
        setNotice(null)
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    function selectLast(n: number) {
        setError(null)
        setNotice(n > MAX_MONTHS ? TOO_MANY_MONTHS : null)
        setSelected(new Set(monthsAsc.slice(-Math.min(n, MAX_MONTHS))))
    }

    async function handleConfirm() {
        if (disabled) return
        setError(null)
        setBusy(true)
        try {
            if (mode === 'today') {
                const dossier = await getClientDossier(clientId)
                await downloadClientDossierPdf(dossier)
            } else {
                const dossiers = await getClientMonthDossiers(clientId, selectedAsc, {
                    includePhotos,
                })
                if (dossiers.length === 0) {
                    setError('Esos meses no tienen datos para exportar.')
                    return
                }
                await downloadClientDossierPdf(dossiers, { separate })
            }
            onOpenChange(false)
        } catch (err) {
            setError(messageFor(err))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[460px]" initialFocus={ctaRef}>
                <DialogHeader>
                    <DialogTitle>Exportar informe</DialogTitle>
                    <DialogDescription>
                        Un PDF con el estado actual del alumno, o un informe por cada mes.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4 grid gap-4">
                    {/* «Por meses» queda deshabilitado mientras llegan los bounds: sin meses que
                        mostrar, el modo sería una pantalla vacía (R19/DM-02b). */}
                    <SegmentedControl
                        size="sm"
                        aria-label="Tipo de informe"
                        options={[
                            { value: 'today', label: 'Estado actual' },
                            { value: 'months', label: 'Por meses' },
                        ]}
                        value={mode}
                        disabledValues={loadingBounds ? ['months'] : undefined}
                        onChange={(value) => {
                            setError(null)
                            setNotice(null)
                            setMode(value === 'months' ? 'months' : 'today')
                        }}
                    />

                    {loadingBounds && (
                        <p className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Cargando meses…
                        </p>
                    )}

                    {mode === 'months' && (
                        <div className="grid gap-3">
                            {monthsForChips.length === 0 ? (
                                <p className="text-[13px] font-semibold text-muted">
                                    Este alumno todavía no tiene meses con actividad.
                                </p>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted">
                                            Meses
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            {[3, 6].map((n) => (
                                                <button
                                                    key={n}
                                                    type="button"
                                                    onClick={() => selectLast(n)}
                                                    disabled={monthsAsc.length === 0}
                                                    className="rounded-pill px-2.5 py-1 font-ui text-[12px] font-bold text-sport-600 outline-none transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
                                                >
                                                    Últimos {n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Chips de mes: botones con `aria-pressed` (misma receta visual
                                        que `components/ui/tag.tsx`, el chip del DS). */}
                                    <div
                                        role="group"
                                        aria-label="Meses del informe"
                                        className={cn(
                                            'flex flex-wrap gap-2',
                                            monthsForChips.length > MONTHS_BEFORE_SCROLL &&
                                                'max-h-[168px] overflow-y-auto pr-1'
                                        )}
                                    >
                                        {monthsForChips.map((key) => {
                                            const isCurrent = key === bounds?.currentMonthKey
                                            const isOn = selected.has(key)
                                            const label = formatMonthLabel(key)
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    aria-pressed={isOn}
                                                    aria-label={
                                                        isCurrent
                                                            ? `${label}, mes en curso hasta hoy`
                                                            : label
                                                    }
                                                    onClick={() => toggleMonth(key)}
                                                    className={cn(
                                                        'inline-flex h-[34px] shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-pill border-[1.5px] px-3.5 font-ui text-[13px] font-semibold leading-none outline-none [transition:all_var(--dur-fast)_var(--ease-out)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
                                                        isOn
                                                            ? 'border-transparent bg-sport-500 text-[var(--text-on-sport)]'
                                                            : 'border-border-default bg-surface-card text-text-body hover:border-[var(--border-strong)]'
                                                    )}
                                                >
                                                    {isCurrent ? `${label} · hasta hoy` : label}
                                                </button>
                                            )
                                        })}
                                    </div>

                                    {/* Una sola línea bajo los chips: el freno de los 24 meses
                                        manda sobre el recordatorio de elegir al menos uno. */}
                                    {notice ? (
                                        <p
                                            role="status"
                                            className="text-[12px] font-semibold text-[var(--warning-600)]"
                                        >
                                            {notice}
                                        </p>
                                    ) : count === 0 ? (
                                        <p className="text-[12px] font-medium text-muted">
                                            Elegí al menos un mes.
                                        </p>
                                    ) : null}
                                </>
                            )}

                            {/* Solo tiene sentido elegir junto/separado con 2+ informes. */}
                            {count >= 2 && (
                                <div className="flex items-center justify-between gap-3">
                                    <label
                                        htmlFor="dossier-single"
                                        className="text-[13px] font-semibold text-strong"
                                    >
                                        Un solo PDF
                                        <span className="block text-[11px] font-medium text-muted">
                                            Apagado descarga un zip con {count} archivos.
                                        </span>
                                    </label>
                                    <Switch
                                        id="dossier-single"
                                        aria-label="Un solo PDF"
                                        checked={single}
                                        onCheckedChange={setSingle}
                                    />
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-3">
                                <label
                                    htmlFor="dossier-photos"
                                    className="text-[13px] font-semibold text-strong"
                                >
                                    Incluir fotos
                                    <span className="block text-[11px] font-medium text-muted">
                                        Hasta 3 por mes.
                                    </span>
                                </label>
                                <Switch
                                    id="dossier-photos"
                                    aria-label="Incluir fotos"
                                    checked={includePhotos}
                                    onCheckedChange={setIncludePhotos}
                                />
                            </div>
                        </div>
                    )}

                    {error && (
                        <p
                            role="alert"
                            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive"
                        >
                            {error}
                        </p>
                    )}
                </div>

                <DialogFooter className="mt-4">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={busy}
                    >
                        Cancelar
                    </Button>
                    <Button
                        ref={ctaRef}
                        onClick={handleConfirm}
                        disabled={disabled}
                        aria-busy={busy}
                    >
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                        {busy ? 'Generando…' : ctaLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
