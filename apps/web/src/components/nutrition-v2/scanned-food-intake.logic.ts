import type { FoodCatalogItem, NutritionIntakeMutation } from '@eva/nutrition-v2'
import { buildCatalogIntakePayload } from '@/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic'

/**
 * Contexto minimo que la page del scanner (server) le pasa al cliente para poder
 * registrar el alimento escaneado por el MISMO camino que el registro por busqueda
 * (recordIntakeAction -> record_nutrition_intake_v2). Sin este contexto el scanner
 * es solo-consulta (no muestra el CTA "Registrar").
 */
export interface ScannerRegistrationContext {
  /** Dia local del alumno (America/Santiago), igual al del read model de Hoy. */
  localDate: string
  timezone: string
  planVersionId: string | null
  snapshotId: string | null
  /** Franjas del dia como opciones {code,label} (mismas del dialogo de busqueda). */
  slotOptions: Array<{ code: string; label: string }>
  /** Ruta del Today del alumno a revalidar tras registrar (tambien sirve de href de vuelta). */
  revalidatePath: string
}

/**
 * Payload de intake para un alimento ESCANEADO. Es exactamente el payload de alimento
 * libre del catalogo (buildCatalogIntakePayload: source 'offplan', snapshot por porcion,
 * el RPC escala) con un solo cambio honesto: captureMethod 'barcode' en vez de 'search',
 * porque el gesto real fue un escaneo/lookup de codigo de barras. 'pending_verification'
 * NO bloquea: el registro es self-report con snapshot; la verificacion es curacion del
 * catalogo del coach/EVA.
 */
export function buildScannedFoodIntakePayload(input: {
  context: {
    clientId: string
    date: string
    timezone: string
    planVersionId: string | null
    snapshotId: string | null
  }
  food: FoodCatalogItem
  quantity: number
  unit: string
  mealSlotCode: string | null
  idempotencyKey: string
  occurredAt?: string
}): NutritionIntakeMutation {
  return { ...buildCatalogIntakePayload(input), captureMethod: 'barcode' }
}
