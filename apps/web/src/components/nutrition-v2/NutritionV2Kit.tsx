import type { HTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Cloud,
  CloudOff,
  ImageIcon,
  Info,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  Utensils,
  WifiOff,
} from 'lucide-react'
import {
  NUTRITION_STRATEGIES,
  formatNutritionCalories,
  type NutritionAttentionModel,
  type NutritionBuilderStepModel,
  type NutritionFoodRowModel,
  type NutritionMealSlotModel,
  type NutritionStrategy,
  type NutritionSyncState,
  type NutritionTone,
} from '@eva/nutrition-v2'
import {
  nutritionIllustrationSource,
  type NutritionIllustration,
} from './state-illustration'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

const toneClasses: Record<NutritionTone, string> = {
  neutral: 'border-border-subtle bg-surface-card text-strong',
  brand:
    'border-sport-300/50 bg-sport-100/70 text-sport-700 dark:border-sport-600/40 dark:bg-sport-100/20 dark:text-sport-300',
  nutrition:
    'border-primary/30 bg-primary/10 text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary',
  success:
    'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  warning:
    'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200',
  danger:
    'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300',
  info: 'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-700/50 dark:bg-sky-950/30 dark:text-sky-300',
}

export function NutritionPageShell({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  toolbar,
  children,
  aside,
  className,
  flushMobile,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  backHref?: string
  toolbar?: ReactNode
  children: ReactNode
  aside?: ReactNode
  className?: string
  /**
   * Paginas del COACH (dentro de CoachMainWrapper): el shell del panel ya aporta el gutter
   * movil px-5 py-6 + safe-area top (patron Alumnos) — sumar el px-3/pt propio de este
   * componente apachurraba la seccion vs. /coach/clients. `true` cede el gutter movil al
   * wrapper y conserva el padding de escritorio. Las paginas del ALUMNO (/c/...) no lo pasan.
   */
  flushMobile?: boolean
}) {
  return (
    <main
      className={cx(
        // Gutter movil de 12px: en ~390px las cards necesitan todo el ancho posible;
        // md: recupera el margen amplio de escritorio.
        flushMobile
          ? 'mx-auto w-full max-w-[1440px] md:px-6 md:pb-8 md:pt-8'
          : 'mx-auto w-full max-w-[1440px] px-3 pb-5 pt-[calc(env(safe-area-inset-top,0px)+1.25rem)] md:px-6 md:pb-8 md:pt-8',
        className,
      )}
    >
      <NutritionHeader eyebrow={eyebrow} title={title} description={description} actions={actions} backHref={backHref} />
      {toolbar ? <div className="mt-4 md:mt-5">{toolbar}</div> : null}
      <div
        className={cx(
          'mt-5 grid min-w-0 gap-5 md:mt-6 md:gap-6',
          aside ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : false,
        )}
      >
        <section className="min-w-0">{children}</section>
        {aside ? <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">{aside}</aside> : null}
      </div>
    </main>
  )
}

export function NutritionHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  backHref?: string
}) {
  if (backHref) {
    // Variante compacta (movil): una sola fila [flecha][eyebrow+titulo] [CTA].
    // El eyebrow va como overline sobre el titulo (no como pill a la derecha) para
    // dejar el borde derecho libre a UNA accion primaria; el resto de acciones se
    // demueve al contenido de la pagina.
    return (
      <header className="flex items-center gap-1.5">
        <Link
          href={backHref}
          aria-label="Volver"
          className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-strong transition-colors hover:bg-surface-card active:bg-surface-card"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="truncate font-mono text-[10px] font-semibold uppercase leading-4 tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="truncate font-display text-[22px] font-black leading-tight tracking-[-0.02em] text-strong md:text-3xl">
            {title}
          </h1>
          {description ? <p className="mt-0.5 truncate text-[12.5px] leading-4 text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
    )
  }
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-primary dark:text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-3xl font-bold tracking-tight text-strong md:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted md:text-base">{description}</p> : null}
      </div>
      {/* Movil: el titulo manda; las acciones van DEBAJO del bloque de titulo (nunca antes,
          apiladas arriba rompen la jerarquia). Desktop conserva la fila titulo/acciones. */}
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function NutritionToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'flex min-h-12 flex-wrap items-center gap-2 rounded-card border border-border-subtle bg-surface-card p-2 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function StrategyBadge({ strategy, compact = false }: { strategy: NutritionStrategy; compact?: boolean }) {
  const meta = NUTRITION_STRATEGIES[strategy]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary dark:border-primary/40 dark:bg-primary/15 dark:text-primary"
      title={meta.description}
    >
      <Utensils aria-hidden="true" className="h-3.5 w-3.5" />
      {compact ? meta.shortLabel : meta.label}
    </span>
  )
}

export function PlanVersionBadge({
  version,
  status,
  effectiveLabel,
}: {
  version: number | string
  status: 'draft' | 'published' | 'superseded' | 'archived'
  effectiveLabel?: string
}) {
  const config = {
    draft: { label: 'Borrador', tone: 'warning' as const },
    published: { label: 'Publicado', tone: 'success' as const },
    superseded: { label: 'Anterior', tone: 'neutral' as const },
    archived: { label: 'Archivado', tone: 'neutral' as const },
  }[status]
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold', toneClasses[config.tone])}>
      v{version} · {config.label}
      {effectiveLabel ? <span className="font-normal opacity-80">· {effectiveLabel}</span> : null}
    </span>
  )
}

export function MealTimeline({
  slots,
  renderActions,
  emptyAction,
}: {
  slots: NutritionMealSlotModel[]
  renderActions?: (slot: NutritionMealSlotModel) => ReactNode
  emptyAction?: ReactNode
}) {
  if (slots.length === 0) {
    return (
      <NutritionStatePanel
        title="Aún no hay franjas para este día"
        description="El plan puede ser completamente flexible o todavía no se ha publicado una estructura diaria."
        icon="empty"
        action={emptyAction}
      />
    )
  }
  return (
    <ol aria-label="Registro de comidas del día" className="relative space-y-4 before:absolute before:bottom-5 before:left-[17px] before:top-5 before:w-px before:bg-border-subtle">
      {slots.map((slot) => (
        <li key={slot.id} className="relative pl-11">
          <span
            aria-hidden="true"
            className={cx(
              'absolute left-2 top-5 z-10 h-[19px] w-[19px] rounded-full border-4 border-surface-app',
              slot.state === 'consumed' ? 'bg-emerald-500' : slot.state === 'offline' ? 'bg-amber-500' : 'bg-primary/100',
            )}
          />
          <MealSlotCard slot={slot} actions={renderActions?.(slot)} />
        </li>
      ))}
    </ol>
  )
}

export function MealSlotCard({ slot, actions }: { slot: NutritionMealSlotModel; actions?: ReactNode }) {
  const state = {
    empty: { label: 'Sin registros', tone: 'neutral' as const },
    prescribed: { label: 'Esperado', tone: 'nutrition' as const },
    partial: { label: 'Parcial', tone: 'warning' as const },
    consumed: { label: 'Consumido', tone: 'success' as const },
    different: { label: 'Diferente al plan', tone: 'info' as const },
    corrected: { label: 'Corregido', tone: 'info' as const },
    offline: { label: 'Pendiente de sincronizar', tone: 'warning' as const },
  }[slot.state]
  return (
    <article className="rounded-card border border-border-subtle bg-surface-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-strong">{slot.name}</h3>
            <span className={cx('rounded-pill border px-2 py-0.5 text-[11px] font-semibold', toneClasses[state.tone])}>{state.label}</span>
          </div>
          {slot.timeLabel ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted">
              <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
              {slot.timeLabel}
            </p>
          ) : null}
          {slot.prescriptionLabel ? <p className="mt-2 text-sm text-body">{slot.prescriptionLabel}</p> : null}
        </div>
        {slot.subtotalCalories !== null && slot.subtotalCalories !== undefined ? (
          <span className="font-mono text-sm font-semibold text-strong">{formatNutritionCalories(slot.subtotalCalories)}</span>
        ) : null}
      </div>
      <div className="mt-4 divide-y divide-border-subtle">
        {slot.foods.length > 0 ? slot.foods.map((food) => <FoodRow key={food.id} food={food} />) : <p className="py-4 text-sm text-muted">Aún no registras alimentos en esta franja.</p>}
      </div>
      {actions ? <div className="mt-4 flex flex-wrap gap-2 border-t border-border-subtle pt-4">{actions}</div> : null}
    </article>
  )
}

export function FoodThumbnail({ src, alt, size = 'md' }: { src?: string | null; alt: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'h-9 w-9', md: 'h-12 w-12', lg: 'h-16 w-16' }[size]
  if (!src) {
    return (
      <span aria-label={`Sin imagen para ${alt}`} className={cx('inline-flex shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-sunken text-subtle', sizeClass)} role="img">
        <ImageIcon aria-hidden="true" className="h-5 w-5" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} className={cx('shrink-0 rounded-control border border-border-subtle object-cover', sizeClass)} loading="lazy" src={src} />
  )
}

export function FoodRow({ food, actions }: { food: NutritionFoodRowModel; actions?: ReactNode }) {
  const statusLabel = { default: null, pending: 'Guardando', corrected: 'Corregido', offline: 'Sin sincronizar', error: 'Error' }[food.status ?? 'default']
  return (
    <div className="flex min-w-0 items-center gap-3 py-3">
      <FoodThumbnail alt={food.name} src={food.thumbnailUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-strong">{food.name}</p>
          {statusLabel ? <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{statusLabel}</span> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">{food.quantityLabel}{food.detail ? ` · ${food.detail}` : ''}</p>
        <p className="mt-1 font-mono text-[11px] text-subtle">
          {food.calories !== null && food.calories !== undefined ? `${formatNutritionCalories(food.calories)} · ` : ''}
          P {food.proteinG ?? 0} · C {food.carbsG ?? 0} · G {food.fatsG ?? 0}
        </p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  )
}

export function SyncOfflineState({ state, label, onRetry }: { state: NutritionSyncState; label?: string; onRetry?: () => void }) {
  const config = {
    synced: { icon: Cloud, text: label ?? 'Sincronizado', tone: 'success' as const },
    pending: { icon: Cloud, text: label ?? 'Pendiente', tone: 'warning' as const },
    syncing: { icon: LoaderCircle, text: label ?? 'Sincronizando…', tone: 'info' as const },
    error: { icon: AlertTriangle, text: label ?? 'Error de sincronización', tone: 'danger' as const },
    offline: { icon: CloudOff, text: label ?? 'Sin conexión', tone: 'warning' as const },
  }[state]
  const Icon = config.icon
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold', toneClasses[config.tone])}>
      <Icon aria-hidden="true" className={cx('h-3.5 w-3.5', state === 'syncing' && 'animate-spin')} />
      {config.text}
      {onRetry && state === 'error' ? <button className="ml-1 underline underline-offset-2" onClick={onRetry} type="button">Reintentar</button> : null}
    </span>
  )
}

export function NutritionStatePanel({
  title,
  description,
  icon = 'empty',
  tone = 'neutral',
  illustration,
  action,
  className,
}: {
  title: string
  description: string
  icon?: 'empty' | 'error' | 'permission' | 'offline' | 'info'
  tone?: NutritionTone
  /**
   * Ilustración del CEO para el estado vacío/error. Reemplaza el glifo lucide
   * por el arte de `/illustrations/` (retina vía @2x srcSet, imagen estática).
   * Aditivo: sin esta prop, el panel se comporta exactamente como antes.
   */
  illustration?: NutritionIllustration
  action?: ReactNode
  className?: string
}) {
  const Icon = { empty: Utensils, error: AlertTriangle, permission: ShieldAlert, offline: WifiOff, info: Info }[icon]
  const art = illustration ? nutritionIllustrationSource(illustration) : null
  return (
    <section className={cx('flex min-h-48 flex-col items-center justify-center rounded-card border p-6 text-center', toneClasses[tone], className)}>
      {art ? (
        // Decorativa: el título + descripción ya anuncian el estado al lector de pantalla.
        <span
          aria-hidden="true"
          className="mb-5 grid h-36 w-36 place-items-center rounded-full sm:h-40 sm:w-40"
          style={{ background: 'color-mix(in oklab, var(--theme-primary) 10%, transparent)' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            aria-hidden="true"
            src={art.src}
            srcSet={art.srcSet}
            width={144}
            height={144}
            loading="lazy"
            className="h-24 w-24 select-none object-contain sm:h-28 sm:w-28"
          />
        </span>
      ) : (
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-current/10"><Icon aria-hidden="true" className="h-5 w-5" /></span>
      )}
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 opacity-80">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  )
}

export function NutritionSkeleton({ variant = 'today', rows = 3 }: { variant?: 'today' | 'history' | 'coach' | 'builder'; rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando Nutrición" className="space-y-4">
      <div className="h-28 animate-pulse rounded-card bg-surface-sunken motion-reduce:animate-none" />
      {variant === 'builder' ? (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-96 animate-pulse rounded-card bg-surface-sunken motion-reduce:animate-none" />)}
        </div>
      ) : Array.from({ length: rows }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-card bg-surface-sunken motion-reduce:animate-none" />)}
    </div>
  )
}

export function CoachAttentionCard({ item, onAction }: { item: NutritionAttentionModel; onAction?: (id: string) => void }) {
  return (
    <article className={cx('rounded-card border p-4', toneClasses[item.tone])}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-current/10">
          {item.tone === 'warning' || item.tone === 'danger' ? <AlertTriangle aria-hidden="true" className="h-4 w-4" /> : <Info aria-hidden="true" className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm opacity-85">{item.description}</p>
        </div>
        <button className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-3 text-sm font-semibold hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onAction?.(item.id)} type="button">
          {item.actionLabel}<ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </article>
  )
}

export function BuilderStepList({ steps }: { steps: NutritionBuilderStepModel[] }) {
  return (
    <nav data-testid="nutrition-v2-builder-stepper" aria-label="Pasos del constructor" className="rounded-card border border-border-subtle bg-surface-card p-3">
      <ol className="space-y-1">
        {steps.map((step, index) => (
          <li key={step.id}>
            <div aria-current={step.state === 'current' ? 'step' : undefined} className={cx('flex min-h-11 items-start gap-3 rounded-control px-3 py-2', step.state === 'current' && 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary', step.state === 'error' && 'bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300')}>
              <span className={cx('mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold', step.state === 'complete' && 'border-emerald-500 bg-emerald-500 text-white', step.state === 'current' && 'border-primary bg-primary/100 text-white', step.state === 'upcoming' && 'border-border-default bg-surface-sunken text-muted', step.state === 'error' && 'border-rose-500 bg-rose-500 text-white')}>
                {step.state === 'complete' ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="min-w-0"><span className="block text-sm font-semibold">{step.label}</span>{step.description ? <span className="mt-0.5 block text-xs opacity-70">{step.description}</span> : null}</span>
            </div>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function BuilderInspector({ title = 'Inspector', children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <aside className="rounded-card border border-border-subtle bg-surface-card shadow-sm">
      <div className="border-b border-border-subtle px-4 py-3"><h2 className="font-display text-base font-semibold text-strong">{title}</h2></div>
      <div className="space-y-4 p-4">{children}</div>
      {footer ? <div className="border-t border-border-subtle p-4">{footer}</div> : null}
    </aside>
  )
}

export function ResponsiveDataAdapter<T>({
  items,
  getKey,
  headers,
  renderRow,
  renderCard,
  empty,
}: {
  items: T[]
  getKey: (item: T) => string
  headers: string[]
  renderRow: (item: T) => ReactNode
  renderCard: (item: T) => ReactNode
  empty?: ReactNode
}) {
  if (items.length === 0) return <>{empty ?? null}</>
  return (
    <>
      <div className="space-y-3 md:hidden">{items.map((item) => <div key={getKey(item)}>{renderCard(item)}</div>)}</div>
      <div className="hidden overflow-x-auto rounded-card border border-border-subtle bg-surface-card md:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-muted"><tr>{headers.map((header) => <th key={header} className="px-4 py-3 font-semibold">{header}</th>)}</tr></thead>
          <tbody className="divide-y divide-border-subtle">{items.map((item) => <tr key={getKey(item)}>{renderRow(item)}</tr>)}</tbody>
        </table>
      </div>
    </>
  )
}

export function NutritionRefreshButton({ onClick, children = 'Actualizar' }: { onClick?: () => void; children?: ReactNode }) {
  return (
    <button className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onClick} type="button">
      <RefreshCcw aria-hidden="true" className="h-4 w-4" />{children}
    </button>
  )
}

export type NutritionCardProps = HTMLAttributes<HTMLDivElement> & { tone?: NutritionTone }

export function NutritionCard({ tone = 'neutral', className, ...props }: NutritionCardProps) {
  return <div className={cx('rounded-card border p-4 shadow-sm', toneClasses[tone], className)} {...props} />
}
