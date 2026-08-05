/**
 * Clases Tailwind de los controles del wizard del builder V2. Vivian inline en
 * PlanBuilderClient.tsx; al repartir el wizard en archivos se extraen TAL CUAL para que cada
 * pieza siga pintando exactamente los mismos controles (mismo markup, mismas clases).
 */
export const inputClass =
  'min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-sm text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25'
export const macroInputClass =
  'min-h-9 w-full rounded-control border border-border-default bg-surface-card px-2 text-sm tabular-nums text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25'
export const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted'
export const primaryButtonClass =
  'inline-flex min-h-11 items-center gap-1 rounded-control bg-primary/100 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-app disabled:opacity-60'
export const secondaryButtonClass =
  'inline-flex min-h-11 items-center gap-1 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
export const iconButtonClass =
  'rounded-control p-2 text-muted transition-colors hover:bg-surface-sunken hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
