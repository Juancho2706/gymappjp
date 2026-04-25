# Dashboard v2 — Iteración 2: Pago rápido, Panel MRR, Fix fondo móvil

## Contexto

Tres mejoras sobre dashboard v2 ya activo (`NEXT_PUBLIC_COACH_DASHBOARD_V2=1`):

1. **+Pago** → modal standalone con selector de alumno + mismo form de BillingTabB8.
2. **Card MRR** → Sheet lateral con estado de pagos por alumno (quién pagó, quién no).
3. **Fondo móvil cortado** → mover `AmbientBackground` a `position: fixed` para cubrir viewport completo.

---

## 1. QuickAddPaymentModal

**Archivo nuevo:** `src/app/coach/dashboard/_components/payments/QuickAddPaymentModal.tsx`

Props:
```ts
{ open: boolean; onOpenChange: (v: boolean) => void; clients: { id: string; name: string }[] }
```

Campos del form (igual que BillingTabB8):
- Select alumno (nuevo — primer campo)
- Monto (CLP, number)
- Fecha (date, default hoy)
- Concepto (text, ej. "Mensualidad abril")
- Período en meses (number, opcional)

Acción: reusar `addPayment` de `src/app/coach/clients/[clientId]/actions.ts` — ya acepta `client_id`.

**Cambios en:**
- `src/app/coach/dashboard/_data/types.ts` — agregar `clientList: { id: string; name: string }[]` a `DashboardV2Data`
- `src/app/coach/dashboard/_data/dashboard.queries.ts` — en `getCoachDashboardDataV2`, poblar `clientList` desde `pulse.map(p => ({ id: p.clientId, name: p.clientName }))`
- `src/app/coach/dashboard/_components/header/QuickActionsBar.tsx` — recibir prop `clients`, cambiar +Pago a `onClick={() => setPayOpen(true)}`, render `<QuickAddPaymentModal>`
- `src/app/coach/dashboard/_components/DashboardShell.tsx` — pasar `clients={data.clientList}` a `<QuickActionsBar>`

---

## 2. RevenueSheet — Panel MRR

**Archivo nuevo:** `src/app/coach/dashboard/_components/sheets/RevenueSheet.tsx`

Sheet lateral derecho. Secciones:
- **Header**: MRR mes actual + delta %
- **Lista por alumno**: nombre | último pago (fecha + monto) | próx. renovación | estado badge
- Ordenado: sin pago reciente primero (riesgo churn)
- Cada fila → link a `/coach/clients/{id}`

**Datos:** agregar `clientPaymentSummary: ClientPaymentSummary[]` a `DashboardV2Data`.

```ts
interface ClientPaymentSummary {
  clientId: string
  clientName: string
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
  lastPaymentPeriodMonths: number | null
  nextRenewalDate: string | null     // lastPaymentDate + period_months (date-fns addMonths)
  hasRecentPayment: boolean          // último pago < 35 días
}
```

Función `buildClientPaymentSummary(clientPaymentsRaw, pulse)` en `dashboard.queries.ts`:
- Para cada cliente en `pulse`, busca su último pago pagado en `clientPaymentsRaw` (mismo array ya disponible, filtrar por `coach_id` ya implícito por query)
- Calcular `nextRenewalDate` con `addMonths` de date-fns

**NOTA:** `clientPaymentsRaw` en la query actual no tiene `client_id`. Necesita agregarse al select:
```ts
supabase
  .from('client_payments')
  .select('client_id, payment_date, amount, status, period_months')
  .eq('coach_id', userId)
  .gte('payment_date', clientPaymentsLookbackStart)
```

**Cambios en:**
- `src/app/coach/dashboard/_data/types.ts` — agregar `ClientPaymentSummary`, campo en `DashboardV2Data`
- `src/app/coach/dashboard/_data/dashboard.queries.ts` — agregar `client_id` al select de payments + `buildClientPaymentSummary()`
- `src/app/coach/dashboard/_components/kpi/KpiStrip.tsx` — agregar prop `onMrrClick`, MRR tile usa `onClick` no `href`
- `src/app/coach/dashboard/_components/DashboardShell.tsx` — estado `revenueSheetOpen`, pasar `onMrrClick` a KpiStrip, render `<RevenueSheet>`

---

## 3. Fix fondo móvil

**Problema:** `AmbientBackground` está dentro `<div className="relative">` con padding. Los blur circles tienen `overflow-hidden` → se recortan en cuadrado en móvil.

**Fix en `DashboardShell.tsx`:**

```tsx
// Sacar AmbientBackground del div relative, ponerlo ANTES como fixed:
return (
  <>
    <AmbientBackground />
    <div className="relative z-10 flex flex-col gap-6 p-4 pb-24 sm:p-6 lg:p-8">
      {/* contenido */}
    </div>
    {/* sheets */}
  </>
)
```

Cambio en `AmbientBackground`:
```tsx
// Antes: absolute inset-0 overflow-hidden
// Después: fixed inset-0 pointer-events-none (sin overflow-hidden)
```

Sin `overflow-hidden`, los blurs se extienden al viewport completo. `fixed` no genera scroll horizontal.

---

## Archivos a tocar

| Archivo | Acción |
|---------|--------|
| `src/app/coach/dashboard/_data/types.ts` | + `ClientPaymentSummary`, `clientPaymentSummary`, `clientList` |
| `src/app/coach/dashboard/_data/dashboard.queries.ts` | + `client_id` en select payments, + `buildClientPaymentSummary()` |
| `src/app/coach/dashboard/_components/payments/QuickAddPaymentModal.tsx` | NUEVO |
| `src/app/coach/dashboard/_components/sheets/RevenueSheet.tsx` | NUEVO |
| `src/app/coach/dashboard/_components/header/QuickActionsBar.tsx` | +Pago → onClick + prop clients |
| `src/app/coach/dashboard/_components/kpi/KpiStrip.tsx` | MRR → onClick no href |
| `src/app/coach/dashboard/_components/DashboardShell.tsx` | estados + fix background |

Reusar:
- `addPayment` action: `src/app/coach/clients/[clientId]/actions.ts`
- `Sheet, SheetContent, SheetHeader, SheetTitle` de `src/components/ui/sheet.tsx`
- `Dialog, DialogContent, DialogHeader, DialogTitle` de `src/components/ui/dialog.tsx`
- `addMonths, format` de `date-fns` + `es` locale
- `GlassCard` de `src/components/ui/glass-card.tsx`
