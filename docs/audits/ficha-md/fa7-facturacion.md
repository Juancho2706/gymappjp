# 7. Pestana Facturacion

La pestana **Facturacion (B8)** vive en la ficha del alumno del coach (`/coach/clients/[clientId]`) y se renderiza con el componente cliente `BillingTabB8` (`apps/web/src/app/coach/clients/[clientId]/BillingTabB8.tsx`). Es un registro **manual** de pagos del alumno hacia el coach (cobro de mensualidades / servicios), totalmente independiente del cobro de suscripcion del coach a EVA via MercadoPago. Los datos viven en la tabla `client_payments`.

## 7.1 Datos que llegan al componente

`BillingTabB8` recibe dos props:

- `payments: PaymentRow[]` — historial de pagos del alumno.
- `clientId: string` — id del alumno (para acciones).

Los `payments` los provee la carga del perfil (`getClientProfileData` en `client-detail.service.ts`), que hace un fetch a `client_payments` (la tabla todavia no esta en los tipos generados, por eso el query usa `(supabase as any)`):

```ts
const paymentsPromise = (supabase as any)
    .from('client_payments')
    .select('*')
    .eq('client_id', clientId)
    .order('payment_date', { ascending: false })
```

El resultado se devuelve como `payments: payments || []`. La consulta esta gateada por RLS + `assertCoachClientReadAccess` (scoping coach->alumno standalone/team/enterprise).

Cada fila (`PaymentRow`) tiene estos campos:

| Campo | Tipo | Significado |
|-------|------|-------------|
| `id` | string | id del pago |
| `amount` | number | monto cobrado (CLP) |
| `payment_date` | string | fecha del pago (YYYY-MM-DD) |
| `service_description` | string | concepto del pago (ej. "Mensualidad abril") |
| `status` | string \| null | estado: `paid` / `pending` / otro |
| `period_months` | number \| null | periodo cubierto en meses (opcional, sirve para estimar renovacion) |
| `receipt_image_url` | string \| null | URL de un comprobante adjunto (si existe) |

## 7.2 Que muestra (funcional)

### Tarjetas resumen (3 metricas calculadas en cliente)

A partir de `payments`, el componente ordena por fecha descendente (`sorted`) y filtra los pagados (`paidRows`, via `isPaidStatus`: status `paid` / `pagado` / `completed`):

1. **Total cobrado** — `totalPaid` = suma de `amount` de las filas con estado pagado. Formateado en CLP con `Intl.NumberFormat('es-CL')`.
2. **Ultimo pago** — `lastPaid` = primer elemento de `paidRows` (el mas reciente). Muestra la distancia relativa (`formatDistanceToNow` en espanol, ej. "hace 5 dias") + fecha exacta + monto. Si no hay pagos pagados muestra `—`.
3. **Prox. renovacion (estim.)** — `nextRenewalLabel`. Se calcula tomando la fecha del ultimo pago pagado (`lastPaidDate`) y sumandole `period_months` (`lastPaidMonths`) via `addMonths`. Solo se calcula si hay meses > 0; si no, muestra `—`. Es solo una **estimacion en cliente**, no se persiste.

### Linea de tiempo (historial)

Lista vertical de **todos** los pagos (no solo pagados), ordenados de mas reciente a mas antiguo. Cada item muestra:

- Monto (`formatMoney(amount)`).
- Concepto (`service_description`, o "Sin descripcion" si vacio).
- Fecha del pago (`payment_date`, formato "d MMM yyyy" en espanol).
- Periodo en meses si `period_months > 0` (ej. "3 mes(es)").
- Una etiqueta de estado con el valor crudo de `status` (o `—`), coloreada segun sea pagado (`isPaidStatus`), pendiente (`isPendingStatus` = status `pending`) u otro.
- Boton de eliminar (icono basura) que dispara `onDelete`.
- Si hay `receipt_image_url`, un enlace que abre el comprobante en pestana nueva, con miniatura (`<Image unoptimized>`).

Si no hay pagos: muestra "No hay pagos registrados."

> Nota: no existe en este componente un panel de "estado de suscripcion / dias restantes" del alumno como tal — lo que hay es la estimacion de proxima renovacion derivada del ultimo pago manual + `period_months`. Los dias restantes del **plan de entrenamiento** (`planDaysRemaining`) se calculan en `getClientProfileData` pero pertenecen a otras pestanas, no a Facturacion.

## 7.3 Registrar un pago manual (modal "Registrar pago")

El boton **"Nuevo pago"** abre un `Dialog` con el formulario. Campos:

| Campo (estado) | Input | Default | Obligatorio |
|----------------|-------|---------|-------------|
| Monto (`amount`) | number (`min=1`, `step=1`) | vacio | si |
| Fecha (`paymentDate`) | date | hoy (`new Date().toISOString().split('T')[0]`) | si |
| Concepto (`description`) | text | vacio | si |
| Meses (`periodMonths`) | number (`min=1`) | vacio | no (opcional, para renovacion) |

### Validacion en cliente (`onAddPayment`)

Antes de enviar, valida y setea `formError` si algo falla:

- `amount` debe parsear a numero finito > 0 (se limpian espacios) — si no: "Indica un monto valido."
- `paymentDate` no vacio — si no: "Indica la fecha del pago."
- `description.trim()` no vacio — si no: "Indica un concepto (ej. mensualidad)."
- `periodMonths`: si viene, debe ser numero finito >= 1; si esta vacio se manda `undefined` — si no cumple: "Periodo en meses debe ser un numero >= 1 o vacio."

Si pasa la validacion, dentro de `startAddTransition` llama a la accion `addPayment` con:

```ts
await addPayment({
    client_id: clientId,
    amount: Math.round(amt),       // entero
    payment_date: paymentDate,
    service_description: desc,      // trim
    period_months: pm,             // numero o undefined
    status: 'paid',                // SIEMPRE 'paid' al crear desde aqui
})
```

El alta siempre crea el pago con `status: 'paid'` (el formulario no expone selector de estado). Tras exito: cierra el modal, resetea el form (`resetAddForm`) y hace `router.refresh()` para recargar datos del servidor. Si la accion lanza error, muestra "No se pudo registrar el pago. Revisa los datos o intenta de nuevo."

## 7.4 Como se persiste el pago (backend)

Cadena de llamadas: `addPayment` (server action en `client-detail.actions.ts`) -> `addPaymentService` (`client-detail.service.ts`) -> `addPaymentForCoach` (`client.service.ts`).

### Server action `addPayment` (`client-detail.actions.ts`)

Es un thin wrapper que reexporta `addPaymentService`:

```ts
export async function addPayment(data: {...}) {
    return addPaymentService(data)
}
```

### Service `addPayment` (`client-detail.service.ts`, l.697)

1. Crea cliente Supabase y obtiene el usuario con `supabase.auth.getUser()` (boundary de **mutacion** -> usa `getUser`, no `getClaims`). Si no hay user: `throw "Unauthorized"`.
2. Resuelve el scope del coach con `getCoachClientScope(supabase, user.id)` (da `{ orgId }` del workspace activo).
3. Llama `addPaymentForCoach(supabase, user.id, data, scope)`.
4. `revalidatePath(\`/coach/clients/${data.client_id}\`)` para refrescar la ficha.

### Repository `addPaymentForCoach` (`client.service.ts`, l.48)

1. **Autorizacion**: `assertCoachCanManageClient(db, coachId, data.client_id, scope)` — verifica que exista una fila en `clients` con `id = client_id`, `coach_id = coachId`, `is_active = true` y el scope de org correcto (`org_id = orgId` o `org_id IS NULL` para standalone). Si no existe: `throw "Client not found in active workspace"`.
2. **Insert** en `client_payments`:

```ts
await db.from('client_payments').insert([{
    ...data,          // client_id, amount, service_description, period_months, payment_date, status
    coach_id: coachId,
}])
```

Es decir, se persiste **todo lo que mando el formulario** mas el `coach_id` derivado de la sesion (nunca del body). El componente fija `status: 'paid'`. Si el insert falla: `throw "Failed to add payment"`.

> Los campos persistidos en `client_payments`: `client_id`, `coach_id`, `amount`, `service_description`, `period_months`, `payment_date`, `status`. (`receipt_image_url` no lo escribe este flujo; el componente solo lo lee/muestra si la fila lo trae.)

## 7.5 Eliminar un pago

El boton de basura llama `onDelete(paymentId)`, que pide confirmacion nativa ("Eliminar este pago del historial?") y, si se acepta, dentro de `startDeleteTransition` llama a la accion `deletePayment(paymentId, clientId)` y luego `router.refresh()`.

Cadena: `deletePayment` (action) -> `deletePaymentService` (`client-detail.service.ts`, l.716) -> `deletePaymentForCoach` (`client.service.ts`, l.64).

### Service `deletePayment`

1. `getUser()` (mutacion). Si no: `throw "Unauthorized"`.
2. `getCoachClientScope`.
3. `deletePaymentForCoach(supabase, user.id, paymentId, scope)`.
4. `revalidatePath(\`/coach/clients/${clientId}\`)`.

### Repository `deletePaymentForCoach`

1. Busca la fila en `client_payments` por `id = paymentId` **y** `coach_id = coachId` (un coach solo puede tocar sus propios pagos). Si no existe: `throw "Payment not found"`.
2. Reautoriza con `assertCoachCanManageClient` sobre el `client_id` recuperado del pago.
3. `DELETE` de la fila filtrando por `id` + `coach_id`. Si falla: `throw "Failed to delete payment"`.

## 7.6 Resumen de seguridad / scoping

- **Lectura** (`getClientProfileData`): usa `getClaims()` (verificacion local del JWT) + RLS + `assertCoachClientReadAccess`.
- **Mutaciones** (alta/baja): usan `getUser()` (revocacion fresca) + `getCoachClientScope` + `assertCoachCanManageClient` (valida `coach_id`, `is_active`, `org_id` scope). El `coach_id` siempre sale de la sesion, jamas del payload.
- Doble filtro `coach_id` en delete: el coach solo elimina pagos suyos, ademas de validar propiedad del alumno.
