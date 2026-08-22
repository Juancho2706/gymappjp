import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  Alert,
  BackHandler,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { KeyboardDoneBar } from '../../KeyboardDoneBar'
import NetInfo from '@react-native-community/netinfo'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  Copy,
  CopyCheck,
  History,
  Info,
  ListPlus,
  Lock,
  MoreVertical,
  NotebookPen,
  Pencil,
  Trash2,
  X,
} from 'lucide-react-native'
import {
  COPY_PRESETS,
  MAX_ITEM_SUBSTITUTIONS,
  NEXT_DAYS_QUICK_PICKS,
  NUTRITION_WEEK_ORDER,
  VARIANT_LABEL_MAX,
  applyQuickEditToDraft,
  buildSubstitutionMap,
  catalogToPortionGroups,
  collectPortionGroups,
  copyPlanWarning,
  countDraftChanges,
  countItemOrderChanges,
  countItemSubstitutionChanges,
  countVariantHeaderChanges,
  daysForCopyPreset,
  formatNutritionDayOfWeek,
  mergePortionGroupChoices,
  nextDaysFrom,
  planCopy,
  qeExchangeGroups,
  qeSlotCopyTargets,
  qeSubstitutionEquivalence,
  qeVariantTotalWithPortions,
  quickEditReducer,
  readModelToDraft,
  readModelToEditState,
  resolveNutritionDayVariantForDate,
  sortNutritionDayVariantsForDisplay,
  takenDayVariantDows,
  validateQuickEdit,
  type CopyMode,
  type FoodCatalogItem,
  type NutritionItemSubstitution,
  type NutritionItemSubstitutionRead,
  type NutritionPlanReadModel,
  type NutritionStrategy,
  type NutritionV2CoachScope,
  type QeItemSubstitution,
  type QePortionGroup,
  type QePortionTarget,
  type QeVariant,
  type QuickEditState,
} from '@eva/nutrition-v2'
import { NutritionCard } from '../NutritionCard'
import { DayVariantWeekStrip } from '../DayVariantWeekStrip'
import { NutritionMotionButton, NutritionStatePanel, StrategyBadge } from '../NutritionV2Kit'
import { AddActionButton } from '../AddActionButton'
import { Sheet } from '../../Sheet'
import { toast } from '../../Toast'
import { useTheme } from '../../../context/ThemeContext'
import { resolveEffectiveCoachBrandTheme } from '../../../lib/theme'
import { supabase } from '../../../lib/supabase'
import {
  MAX_DAY_VARIANTS,
  mapFoodCatalogItemToBuilderFood,
  strategyUsesSlots,
  type BuilderFoodMacrosPatch,
  type NutritionV2WriteClient,
} from '../../../lib/nutrition-v2-builder'
import {
  buildQuickEditBaseline,
  buildQuickEditIdempotencyKey,
  loadQuickEditSubstitutions,
} from '../../../lib/nutrition-v2-quick-edit'
import type { PortionPickerGroup, QuickEditGroupAdmin } from './EditablePortionsSection'
import { fetchNutritionV2ExchangeGroups } from '../../../lib/nutrition-v2-exchange-groups.api'
import { toQuickEditPortionGroup } from '../../../lib/nutrition-v2-builder-portions'
import { publishDraftRN, publishQuickEditRN, savePlanTemplateRN } from '../../../lib/nutrition-v2.api'
import type { EditorCreationInput, EditorTemplateInput } from '../../../lib/nutrition-v2-editor'
import {
  rememberFoodQuantity,
  type RememberedQuantities,
} from '../../../lib/nutrition-v2-last-quantity'
import {
  clearNutritionDraft,
  quickEditDraftKey,
  readNutritionDraft,
  sweepStaleNutritionDrafts,
  unifiedEditorDraftKey,
  writeNutritionDraft,
} from '../../../lib/nutrition-coach-draft-store'
import {
  TourHelpButton,
  TourOverlay,
  TourScrollHostBinder,
  TourTarget,
  TourTargetsProvider,
  tourSteps,
  useTourController,
  type TourScrollHost,
} from '../tour'
import { AppBackground } from '../../AppBackground'
import { EditableSlotCard } from './EditableSlotCard'
import { EditorDayRibbon } from './EditorRibbon'
import { EditorMetaCard } from './EditorMetaCard'
import { TargetsEditorCard } from './TargetsEditorCard'
import { FoodSearchSheet, type FoodSearchMode } from './FoodSearchSheet'
import { PublishBar, UndoSnackbar, type PublishBarDayTotals } from './PublishBar'
import { ProUpsellSheet, PublishConfirmSheet, StaleBaseSheet } from './QuickEditSheets'
import {
  EDITOR_COPY,
  QUICK_EDIT_COPY,
  addDayCta,
  copySlotCta,
  copySlotDone,
  dayIndexJump,
  discardConfirmBody,
  removeDayConfirmBody,
} from './microcopy'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'

let keySeq = 0
function genKey(prefix: string): string {
  keySeq += 1
  return prefix + '-' + Date.now().toString(36) + '-' + keySeq
}

// T2.6 F1: ventana unica del Deshacer destructivo en todo el modulo (web y RN), era 5 s.
const UNDO_TIMEOUT_MS = 8000

/** Respiro entre el borde inferior del campo enfocado y la barrera (teclado + PublishBar). */
const KEYBOARD_GAP = 12

interface SearchTarget {
  mode: FoodSearchMode
  variantKey: string
  slotKey: string
  itemKey: string | null
}

/** Franja apuntada por el menú de la franja / la hoja de copia (CE-5). */
interface SlotRef {
  variantKey: string
  slotKey: string
}

/** Item apuntado por el menú del alimento (editor unico: reemplazos + reorden). */
interface ItemRef extends SlotRef {
  itemKey: string
}

/** Variante proyectada al contrato compartido de la tira Lu-Do (`NutritionDayVariantLike`). */
interface WeekVariantLike {
  id: string
  dayOfWeek: number | null
  isDefault: boolean
}

interface UndoEntry {
  message: string
  /** Undo LOCAL del draft (despacha al reducer que corresponda; nunca toca backend). */
  restore: () => void
}

/**
 * Payload del respaldo local del quick-edit (AsyncStorage). `schema: 2` (T3.3a): el arbol es
 * la gramatica COMPARTIDA del paquete y las porciones viven DENTRO de el. Un respaldo v1
 * (dos reducers RN, formas viejas) NO se restaura: rehidratar el reducer compartido con un
 * arbol de otra forma corromperia la edicion — se descarta, igual que una base obsoleta.
 */
interface QuickEditDraftPayload {
  schema: 2
  clientId: string
  planId: string
  baseVersionId: string
  state: QuickEditState
}

/**
 * Modo EDITOR del editor unico (T3.3b): el mismo lienzo, con metadatos del plan y —en
 * creacion— con un arbol que no nace del plan vigente. `null` = quick-edit clasico, sin un
 * solo cambio de comportamiento.
 */
export interface QuickEditEditorInput {
  /**
   * Reemplazos autorizados (F-02) de la version base, forma read-model. En el editor se
   * HIDRATAN en el arbol (se editan y se pintan con su nombre) en vez de viajar aparte y
   * re-inyectarse al publicar, que es lo que hace el quick-edit clasico.
   */
  itemSubstitutions: NutritionItemSubstitutionRead[]
  /**
   * Catalogo VIGENTE de los alimentos de esos reemplazos, para resolver sus macros y mostrarle al
   * coach la cantidad equivalente que ve el alumno («≈ 130 g»). Opcional y fail-soft: sin el, la
   * fila del reemplazo no pinta el numero — nunca uno falso. No viaja al draft.
   */
  substitutionFoodsById?: Parameters<typeof buildSubstitutionMap>[1]
  /** NUT-008: la lectura fallo ⇒ publicar los borraria. Bloquea el publish. */
  substitutionsLoadFailed: boolean
  /** Modo creacion (plantilla / copia de plan / blanco); null = edicion del plan vigente. */
  creation: EditorCreationInput | null
  /** Modo PLANTILLA (sin alumno ni vigencia; publicar se vuelve guardar). Excluyente con `creation`. */
  template?: EditorTemplateInput | null
  /** Se pidio `?template=` y no se pudo abrir: blanco CON aviso (jamas en silencio). */
  templateUnavailable?: boolean
  /** El `?from=` pedido no abrio: se degrado y hay que decirlo (jamas en silencio). */
  originUnavailable: boolean
  /**
   * Porcion pegajosa (T2.6 F4): ultima cantidad por alimento con la precedencia alumno > coach
   * ya resuelta en SQL. El alta desde el catalogo la precarga y el commit del campo la
   * actualiza. Vacio = todo cae al `servingSize` del catalogo, como siempre.
   */
  rememberedQuantities: RememberedQuantities
}

/**
 * Modo edicion in-place del plan vigente — espejo RN del quick-edit web (qe-design
 * §1.3): editar = tocar el plan donde se ve; draft local (dirty) + UN boton "Publicar
 * cambios". El draft y su baseline viven en dos reducers locales (sobreviven re-renders) y
 * ademas se respaldan en AsyncStorage (autosave debounced) para ofrecer "Restaurar" tras
 * matar la app (F2). Publicar exige red; en fallo el draft NO se pierde y el reintento reusa
 * la MISMA idempotency key.
 *
 * Con `editor` (T3.3b) la MISMA pantalla es el editor unico: suma la cabecera de metadatos
 * (`state.meta`), publica una creacion por `publishDraftRN` cuando el arbol no viene del plan
 * vigente, y usa su propia key de respaldo local. Sin `editor` todo eso no existe.
 */
export function QuickEditMode({
  clientId,
  clientName,
  planModel,
  scope,
  todayIso,
  hasNutritionPro = false,
  editor = null,
  onExit,
  onPublished,
  onStaleReload,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  /** Workspace coach activo: viaja al endpoint de mutaciones (gate de rollout + scope). */
  scope: NutritionV2CoachScope
  todayIso: string
  /**
   * Entitlement Nutricion Pro del coach. Gobierna SOLO la afordancia de los dias
   * especificos (candado + upsell en vez del selector). El gate real es server-side
   * (`multi_variant` -> UPGRADE_REQUIRED en el endpoint de mutaciones). Default fail-closed.
   */
  hasNutritionPro?: boolean
  /** Editor unico (T3.3b). Ausente = quick-edit clasico, bit-identico a como era. */
  editor?: QuickEditEditorInput | null
  onExit: () => void
  onPublished: () => void
  onStaleReload: () => void
}) {
  const { theme, branding } = useTheme()
  // Marca real del coach para la «Familia N» (ver nota en `EditableSlotCard`): el default del
  // componente es el primary de la WEB, y en el móvil el azul de sistema es otro.
  const brandColor = resolveEffectiveCoachBrandTheme(branding).brandColor
  const router = useRouter()
  // QA2-B4: el modo edicion se monta como pantalla completa dentro de una ruta SIN
  // header nativo (root Stack con headerShown:false), asi que el inset superior es
  // responsabilidad de esta barra fija — sin el, el boton de salida choca con la
  // barra de estado/notch.
  const insets = useSafeAreaInsets()
  // Baseline CONGELADO al montar: se hidrata UNA vez al entrar al modo edicion (el
  // componente se monta al entrar y se desmonta al salir; una re-entrada re-hidrata
  // fresco). Si la ficha recibe un read model mas nuevo mientras se edita (carrera
  // cache→fresh), el diff NO se corrompe y el guard optimista del publish detecta la
  // base obsoleta (STALE_BASE) — la salida segura es Recargar.
  const [frozen] = useState(() => {
    // T3.3a: hidratacion de la gramatica COMPARTIDA (@eva/nutrition-v2). Las porciones viajan
    // DENTRO del arbol (slot.portionTargets) — el reducer paralelo RN murio. En el quick-edit
    // clasico los reemplazos F-02 NO se hidratan (llegan por fetch aparte y se re-inyectan al
    // publicar); en el EDITOR si, porque alli se editan.
    // T3.3b creacion: el arbol y el draft base los trae el llamador ya hidratados (plantilla,
    // copia de plan o blanco) — el plan vigente del alumno no participa.
    const initial = editor?.template
      ? editor.template.initialState
      : editor?.creation
        ? editor.creation.initialState
        : readModelToEditState(
            planModel,
            // El catalogo de los sustitutos entra como 2do arg: sin el, los reemplazos YA
            // guardados (los unicos que existen hoy) no resuelven macros vigentes y la fila se
            // queda sin la equivalencia («≈ 130 g»).
            editor ? buildSubstitutionMap(editor.itemSubstitutions, editor.substitutionFoodsById) : {},
            { withMeta: editor != null },
          )
    const baseDraft = editor?.template
      ? editor.template.baseDraft
      : editor?.creation
        ? editor.creation.baseDraft
        : readModelToDraft(planModel, clientId)
    return {
      baseline: buildQuickEditBaseline(planModel),
      initial,
      baseDraft,
      // Dict CONGELADO de grupos del plan (snapshots del read model; catalogo vivo jamas).
      portionGroups: collectPortionGroups(planModel),
    }
  })
  const baseline = frozen.baseline
  const initialState = frozen.initial
  const [state, dispatch] = useReducer(quickEditReducer, initialState ?? { variants: [], visibleNotes: '' })
  // Editor unico (T3.3b): superficie y modo. `creation` != null ⇒ el arbol NO sale del plan
  // vigente, asi que no hay version base, ni CAS del quick-edit, ni respaldo local.
  const editorMode = editor != null
  const creation = editor?.creation ?? null
  const template = editor?.template ?? null
  // Descripcion de la plantilla: metadato de la FILA, no del draft del contrato — vive fuera del
  // reducer a proposito (paridad con el editor web) y se escribe junto al draft en cada guardado.
  const [templateDescription, setTemplateDescription] = useState(template?.description ?? '')

  // Porciones propias (FD6a): la lista del picker es el dict CONGELADO del plan. Crear un grupo
  // agrega una entrada; editarlo reemplaza la suya en el sitio; eliminarlo lo saca de la lista
  // (los targets ya publicados conservan su snapshot congelado — el grupo borrado no los mueve).
  const [groupOverrides, setGroupOverrides] = useState<PortionPickerGroup[]>([])
  const [removedGroupIds, setRemovedGroupIds] = useState<ReadonlySet<string>>(() => new Set<string>())
  // Ids de grupos PROPIOS del coach: el dict congelado no distingue system de propios, así que se
  // resuelven con UNA lectura perezosa del catálogo (RLS coach-scoped) al abrir el picker. Si falla,
  // simplemente no aparece la afordancia de editar (crear sigue funcionando).
  const [ownGroupIds, setOwnGroupIds] = useState<ReadonlySet<string>>(() => new Set<string>())
  const ownGroupsRequestedRef = useRef(false)

  // Catalogo VIVO de grupos del coach (solo editor): en creacion el plan aun no tiene grupos
  // congelados, asi que sin esto el picker de porciones abriria vacio. null = todavia no llego o
  // la lectura fallo ⇒ se ofrecen solo los del plan (degradacion invisible, espejo del web).
  const [catalogGroups, setCatalogGroups] = useState<QePortionGroup[] | null>(null)

  const portionGroups = useMemo<PortionPickerGroup[]>(() => {
    const overrides = new Map(groupOverrides.map((group) => [group.exchangeGroupId, group]))
    const merged: PortionPickerGroup[] = mergePortionGroupChoices(
      frozen.portionGroups,
      catalogGroups,
    ).map((group: QePortionGroup) => overrides.get(group.exchangeGroupId) ?? group)
    const known = new Set(merged.map((group) => group.exchangeGroupId))
    for (const group of groupOverrides) {
      if (!known.has(group.exchangeGroupId)) merged.push(group)
    }
    return merged.filter((group) => !removedGroupIds.has(group.exchangeGroupId))
  }, [frozen.portionGroups, catalogGroups, groupOverrides, removedGroupIds])

  // Reemplazos autorizados (F-02) de la version base, por prescriptionItemId. Carry-over PURO:
  // el read-model no los trae; se fetchean al entrar y se re-inyectan al publicar para que
  // republicar NO los pierda (misma clase del bug private_notes). No son editables en F1.
  // TODO(F-02 P3): editor coach RN — afordancia por item para agregar/quitar reemplazos (reusar
  // FoodSearchSheet, max 8, solo structured/hybrid). Hoy solo se preservan y se muestran al alumno.
  // (En el EDITOR este mapa queda vacio a proposito: los reemplazos viven EN el arbol.)
  const [carryOverSubs, setCarryOverSubs] = useState<ReadonlyMap<string, NutritionItemSubstitution[]>>(new Map())
  // NUT-008: estado HONESTO del carry-over. 'loading' = el fetch sigue en vuelo (publicar
  // ahora borraria los reemplazos por carrera); 'error' = no se pudo leer (mismo dano). Solo
  // 'loaded' habilita publicar. Antes el mapa arrancaba vacio y nada distinguia los tres casos.
  const [subsStatus, setSubsStatus] = useState<'loading' | 'loaded' | 'error'>(() =>
    // El editor recibe la lectura ya resuelta por la pantalla (y ya hidratada en el arbol):
    // no hay fetch propio que esperar, solo el veredicto NUT-008.
    editor ? (editor.substitutionsLoadFailed ? 'error' : 'loaded') : 'loading',
  )
  const [subsReloadNonce, setSubsReloadNonce] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  // T3.v Cabina (V3.3): hoja «Metas ▾» del header (editor único). El usuario la pide con el
  // botón; un error de validación de metas la fuerza abierta aunque el usuario intente cerrarla
  // (espejo del patrón `forcedOpen`/`metasOpen` de `EditorRibbon.tsx` web).
  const [metasRequested, setMetasRequested] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stale, setStale] = useState(false)
  const [upsell, setUpsell] = useState<string | null>(null)
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  const [undo, setUndo] = useState<UndoEntry | null>(null)
  // FD5 (multi-dia): sheets del alta de dias y del menu por dia (renombrar / cambiar dia).
  const [addDayOpen, setAddDayOpen] = useState(false)
  const [addDays, setAddDays] = useState<number[]>([])
  const [addSource, setAddSource] = useState<'clone' | 'empty'>('clone')
  const [dayMenuKey, setDayMenuKey] = useState<string | null>(null)
  const [changeDayKey, setChangeDayKey] = useState<string | null>(null)
  const [renameKey, setRenameKey] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  // Editor unico (T3.3b): menu por item (reemplazos + reorden), hoja de reemplazos, duplicar
  // dia y copiar dia a varios dias. Todo gateado a `state.meta` (el clasico no los ofrece).
  const [itemMenu, setItemMenu] = useState<ItemRef | null>(null)
  const [subsTarget, setSubsTarget] = useState<ItemRef | null>(null)
  const [duplicateDayKey, setDuplicateDayKey] = useState<string | null>(null)
  const [copyDayKey, setCopyDayKey] = useState<string | null>(null)
  const [copyDayMode, setCopyDayMode] = useState<CopyMode>('replace')
  const [copyDayDays, setCopyDayDays] = useState<number[]>([])
  // W3b (solo editor): capsula de DIA ACTIVO — se edita un dia a la vez. El quick-edit clasico
  // conserva la pila completa con anclas (cero cambios de comportamiento).
  const [activeDayKey, setActiveDayKey] = useState<string | null>(null)
  // CE-5: menú de la franja + hoja multi-select de días destino de la copia.
  const [slotMenu, setSlotMenu] = useState<SlotRef | null>(null)
  const [copySource, setCopySource] = useState<SlotRef | null>(null)
  const [copyTargetKeys, setCopyTargetKeys] = useState<string[]>([])
  // Respaldo local (F2) de una sesion anterior recuperado de AsyncStorage; alimenta el banner
  // "Restaurar". Guarda el payload completo (state + portions) hasta que el coach decida.
  const [pendingRestore, setPendingRestore] = useState<QuickEditDraftPayload | null>(null)

  /* ── Guía Viva (SPEC `nutrition-onboarding-tour`) ────────────────────────────────────────────
   * El tour del editor: 6 pasos, auto-arranque UNA vez por coach y «?» a demanda para siempre.
   * Vive solo en el editor único — el quick-edit clásico no tiene mini-cinta ni «Metas ▾», así que
   * la mitad del guion no existiría ahí. */
  const tourCoachId = branding?.coachId ?? null
  const tour = useTourController({
    tourId: 'editor',
    coachId: tourCoachId,
    // Jamás en creación ni en plantilla (invariante de la SPEC): un tour sobre un plan vacío enseña
    // menos, y el auto-arranque espera a la próxima entrada en edición normal. Con la guía v2 del
    // coach activa tampoco arranca: lo gatea `useTourController` (decisión del owner 22-08).
    autoStart: editorMode && creation === null && template === null,
    // La identidad del coach llega del branding guardado, que puede hidratar un tick después del
    // primer render. Sin ella el flag se marcaría bajo el cajón `anon` y la guía volvería a saltar.
    autoStartReady: tourCoachId !== null,
  })
  // Target del paso «Metas sin salir del flujo»: el botón vive suelto en el header, así que se
  // registra por ref en vez de envolverlo (ver `TourTargets.tsx`).
  // NO se registra con `useTourTarget` a proposito. Ese hook lee el contexto por `useContext`, y
  // este componente RENDERIZA el `<TourTargetsProvider>` en su propio JSX (mas abajo): sus hooks
  // corren POR ENCIMA del provider y ven `null`, asi que el ref quedaba mudo y el target 'metas'
  // NUNCA se registraba. El paso 2 del tour media null y degradaba a velo liso — el sintoma que
  // reporto el dueno el 18-08. Se envuelve con `<TourTarget>`, que es un componente y si vive
  // dentro del provider. Es la misma trampa que `TourScrollHostBinder` ya documenta.
  // Alto real de la PublishBar. El «?» se apoya JUSTO encima: ver la nota de D2 en el render.
  const [publishBarHeight, setPublishBarHeight] = useState(0)

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Anclas por día: el scroll apila los N días completos, así que cada bloque publica su
  // offset vertical con `onLayout` (relativo al contentContainer = coordenada de `scrollTo`)
  // y la fila de chips salta ahí. Ref y no estado: medir no debe re-renderizar el árbol.
  const scrollRef = useRef<ScrollView>(null)
  const dayOffsetsRef = useRef<Record<string, number | undefined>>({})
  // QA del dueño 17-08: escribiendo en «Notas para tu alumno» no se veía lo que se escribía. El
  // `KeyboardAvoidingView` de esta pantalla es INERTE en Android (`behavior` va undefined ahí) y la
  // PublishBar vive FUERA del scroll, así que se interpone entre el fondo del lienzo y el teclado.
  // Se mide el teclado y se le devuelve ese alto al scroll como padding: el contenido vuelve a tener
  // a dónde subir. Seguro para el crash del 16-08 — este `onScroll` corre en el hilo de JS, no es un
  // worklet de Reanimated como el del catálogo de ejercicios.
  const [keyboardInset, setKeyboardInset] = useState(0)
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => setKeyboardInset(event.endCoordinates?.height ?? 0),
    )
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardInset(0),
    )
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  // Host de scroll para la Guía Viva (QA owner 17-08): el overlay necesita traer el target al
  // viewport antes de recortar (espejo del scrollIntoView web). Offset por ref, no estado.
  const tourScrollOffsetYRef = useRef(0)
  const tourScrollHost = useMemo<TourScrollHost>(
    () => ({
      scrollTo: (y: number) => scrollRef.current?.scrollTo({ y, animated: false }),
      getOffsetY: () => tourScrollOffsetYRef.current,
    }),
    [],
  )
  // QA del dueño 17-08, segunda vuelta: el padding de arriba ABRE el hueco pero nadie vuelve a
  // scrollear, así que «Notas para tu alumno» seguía tapada. El intento previo scrolleaba dentro
  // de un `requestAnimationFrame` del `onFocus` — ~16 ms después del foco, cuando el teclado
  // todavía no existe y no hay nada que esquivar; y con `adjustResize` el viewport encoge sin
  // mover el offset. Se resuelve con el patrón que ya vive en el ejecutor
  // (`alumno/workout/StepperExecution.tsx`): se anota el pedido y se mide con `measureInWindow`
  // contra `Keyboard.metrics().screenY` cuando el teclado YA tiene métricas (`keyboardDidShow`),
  // o en el frame siguiente si ya estaba arriba (saltar de un input a otro no emite evento).
  const notesInputRef = useRef<TextInput>(null)
  const notesPendingRef = useRef(false)
  const flushNotesVisible = useCallback(() => {
    if (!notesPendingRef.current) return
    const node = notesInputRef.current
    const scroller = scrollRef.current
    if (!node || !scroller) return
    notesPendingRef.current = false
    const keyboardTop = Keyboard.metrics()?.screenY ?? Dimensions.get('window').height
    // La PublishBar vive FUERA del ScrollView y DENTRO del KeyboardAvoidingView: se interpone
    // entre el fondo del lienzo y el teclado, así que la barrera real es el tope del teclado
    // MENOS su alto (ya medido por el `onLayout` del target «publicar»).
    const barrier = keyboardTop - publishBarHeight
    node.measureInWindow((_x, y, _width, height) => {
      const overlap = y + height + KEYBOARD_GAP - barrier
      if (overlap > 1) {
        scroller.scrollTo({ y: Math.max(0, tourScrollOffsetYRef.current + overlap), animated: true })
      }
    })
  }, [publishBarHeight])
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', flushNotesVisible)
    // Si el teclado se cierra sin haber resuelto el pedido se descarta: un foco posterior no
    // debe arrastrar el lienzo hasta el campo viejo.
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      notesPendingRef.current = false
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [flushNotesVisible])
  const ensureNotesVisible = useCallback(() => {
    notesPendingRef.current = true
    if (Keyboard.isVisible()) requestAnimationFrame(flushNotesVisible)
  }, [flushNotesVisible])
  // Guard para no escribir el respaldo local en la hidratacion inicial (evita un borrador vacio).
  const isFirstRenderRef = useRef(true)
  // Key del respaldo local: una sesion de quick-edit por alumno; el clientId va SIEMPRE en la
  // key (gotcha PR #148) para no cruzar borradores entre alumnos.
  // El editor unico usa prefijo PROPIO: su arbol lleva metadatos que el quick-edit clasico no
  // muestra, y ofrecerse borradores entre superficies mezclaria capacidades distintas.
  const draftKey = editorMode ? unifiedEditorDraftKey(clientId) : quickEditDraftKey(clientId)
  // Idempotency key por INTENCION de publicar: fresca al abrir el confirm, reutilizada
  // en todos los reintentos de esa intencion (qe-design §2.5).
  const intentKeyRef = useRef<string | null>(null)
  // Ultima firma recordada por item (porcion pegajosa): evita reescribir lo mismo en cada blur.
  const rememberedSignatureRef = useRef<Record<string, string>>({})
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    }
  }, [])

  // Degradacion de origen AVISADA (leccion JP 2026-08-11: una plantilla soft-deleted abria el
  // plan vigente sin una palabra y el coach publicaba encima creyendo que era su plantilla).
  useEffect(() => {
    if (!editor?.originUnavailable) return
    toast.error(editor.creation ? EDITOR_COPY.originUnavailableCreate : EDITOR_COPY.originUnavailableEdit)
  }, [editor?.originUnavailable, editor?.creation, editor])

  /**
   * Correccion de macros de un alimento (T2.2). Alcanza TODAS las filas con ese `food`
   * hidratado (las del catalogo agregadas/swapeadas en esta sesion). Criterio W2 del editor
   * compartido: los items BASE viven de su `macroBase` congelado y no ofrecen el lapiz — el
   * mapa paralelo de foods (y su fetch) murio con la convergencia.
   */
  const handleFoodOverrideApplied = useCallback(
    (foodId: string, macros: BuilderFoodMacrosPatch, message: string) => {
      dispatch({ type: 'APPLY_FOOD_OVERRIDE', foodId, macros })
      toast.success(message)
    },
    [dispatch],
  )

  // Carry-over de reemplazos autorizados (F-02): fetch de la version base congelada. El
  // estado del fetch gobierna el publish (ver `doPublish`): mientras no este 'loaded' no se
  // puede publicar, porque el publish reescribe el arbol completo y borraria lo no leido.
  useEffect(() => {
    // Editor: la pantalla ya los leyo (y los hidrato en el arbol) antes de montar esto.
    if (editorMode) return
    if (!baseline) return
    let active = true
    setSubsStatus('loading')
    void loadQuickEditSubstitutions(
      supabase as unknown as NutritionV2WriteClient,
      baseline.baseVersionId,
    ).then((res) => {
      if (!active || !mountedRef.current) return
      setCarryOverSubs(res.byItem)
      setSubsStatus(res.status)
    })
    return () => {
      active = false
    }
  }, [editorMode, baseline, subsReloadNonce])

  // Catalogo de grupos del coach para el picker (solo editor; una lectura al montar). Con el
  // llegan tambien los ids de los grupos PROPIOS, que habilitan la afordancia de editarlos.
  // Best-effort: un fallo deja el picker con los grupos del plan y nadie se entera.
  useEffect(() => {
    if (!editorMode) return
    let active = true
    ownGroupsRequestedRef.current = true
    void fetchNutritionV2ExchangeGroups(scope)
      .then(({ groups }) => {
        if (!active || !mountedRef.current) return
        setCatalogGroups(catalogToPortionGroups(groups))
        setOwnGroupIds(new Set(groups.filter((group) => !group.isSystem).map((group) => group.id)))
      })
      .catch(() => {
        /* best-effort */
      })
    return () => {
      active = false
    }
  }, [editorMode, scope])

  // Reintento explicito del fetch de reemplazos (boton del banner de error). En el EDITOR la
  // lectura la hizo la pantalla ANTES de montar (y se hidrato en el arbol), asi que reintentar
  // es volver a abrir el editor — el equivalente exacto del `router.refresh()` del web.
  const retrySubstitutions = useCallback(() => {
    setPublishError(null)
    if (editorMode) {
      onStaleReload()
      return
    }
    setSubsReloadNonce((nonce) => nonce + 1)
  }, [editorMode, onStaleReload])

  // Baseline y draft actual pasan por la MISMA proyeccion que el web: cero ediciones = cero
  // cambios garantizado, diff por `id` (identidad de la version base) y porciones EN el arbol.
  // En CREACION el baseline es VACIO (cero dias, sin notas; el meta inicial no cuenta): todo el
  // contenido del origen cuenta como alta y la barra aparece de entrada — publicar una plantilla
  // sin tocarla es legitimo (mismo criterio que el editor web).
  const baselineDraft = useMemo(() => {
    if (!frozen.baseDraft || !initialState) return null
    // Plantilla NUEVA: mismo baseline vacio que la creacion (todo cuenta como alta). Editar una
    // plantilla existente abre en 0 cambios, como la edicion de un plan.
    const isNewTemplate = template !== null && template.templateId === null
    const baselineState: QuickEditState =
      creation || isNewTemplate
        ? { variants: [], visibleNotes: '', ...(initialState.meta ? { meta: initialState.meta } : {}) }
        : initialState
    return applyQuickEditToDraft(frozen.baseDraft, baselineState)
  }, [frozen.baseDraft, initialState, creation, template])
  const currentDraft = useMemo(
    () => (frozen.baseDraft ? applyQuickEditToDraft(frozen.baseDraft, state) : null),
    [frozen.baseDraft, state],
  )
  const templateDescriptionDirty =
    template !== null && templateDescription.trim() !== (template.description ?? '').trim()
  const count = useMemo(() => {
    if (!baselineDraft || !currentDraft) return 0
    return (
      countDraftChanges(baselineDraft, currentDraft) +
      countVariantHeaderChanges(baselineDraft, currentDraft) +
      // El paquete no compara reemplazos (hasta el editor unico ninguna superficie los editaba):
      // sin esto, quitar o agregar uno dejaria la barra apagada. En el quick-edit clasico el
      // arbol no los lleva, asi que el delta es 0 y nada cambia.
      countItemSubstitutionChanges(baselineDraft, currentDraft) +
      countItemOrderChanges(baselineDraft, currentDraft) +
      // La descripcion de la plantilla no vive en el draft: sin este +1, editar SOLO la
      // descripcion dejaria "Guardar" apagado.
      (templateDescriptionDirty ? 1 : 0)
    )
  }, [baselineDraft, currentDraft, templateDescriptionDirty])
  // Con meta editable manda la estrategia del ESTADO: es la que se va a publicar.
  const strategy: NutritionStrategy = state.meta?.strategy ?? baseline?.strategy ?? 'flexible'
  // `todayIso` habilita la regla de vigencia elegible (solo hace algo con `meta.effectiveFrom`).
  const validation = useMemo(
    () => validateQuickEdit(state, { strategy, today: todayIso }),
    [state, strategy, todayIso],
  )
  const errors = showErrors ? validation.errors : {}

  // Al montar el modo edicion: barre borradores vencidos (TTL 7d, ambos prefijos) y evalua si hay
  // un respaldo local restaurable para ESTE plan y version base. Si el borrador es de otra version
  // (alguien publico entremedio via otra sesion / web / builder) se descarta: restaurar contra una
  // base obsoleta seria peor que nada — mismo espiritu que el guard STALE_BASE del publish.
  // AsyncStorage es async: `mountedRef`/`active` evitan tocar estado tras el desmonte (sin flash).
  useEffect(() => {
    // Creacion y PLANTILLA: sin respaldo local (pendiente declarado, igual que en web) —
    // restaurar un borrador de otra superficie mezclaria arboles contra bases distintas.
    if (creation || template) return
    if (!baseline) return
    let active = true
    const now = Date.now()
    void (async () => {
      await sweepStaleNutritionDrafts(now)
      const record = await readNutritionDraft<QuickEditDraftPayload>(draftKey, now)
      if (!active || !mountedRef.current) return
      if (!record) return
      const { payload } = record
      if (
        payload.schema === 2 &&
        payload.planId === baseline.planId &&
        payload.baseVersionId === baseline.baseVersionId &&
        Array.isArray(payload.state?.variants)
      ) {
        setPendingRestore(payload)
      } else {
        void clearNutritionDraft(draftKey)
      }
    })()
    return () => {
      active = false
    }
  }, [creation, template, baseline, draftKey])

  // Autosave debounced del arbol editable + porciones: escribe el respaldo local solo si hay
  // cambios reales; si el coach vuelve al baseline (0 cambios) borra el borrador (ya no aporta).
  // El guard de primer render evita crear un borrador vacio al hidratar. 1500 ms como en web.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }
    if (creation || template) return
    if (!baseline) return
    const timer = setTimeout(() => {
      if (count > 0) {
        void writeNutritionDraft<QuickEditDraftPayload>(
          draftKey,
          {
            schema: 2,
            clientId,
            planId: baseline.planId,
            baseVersionId: baseline.baseVersionId,
            state,
          },
          Date.now(),
        )
      } else {
        void clearNutritionDraft(draftKey)
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [state, count, creation, template, baseline, draftKey, clientId])

  // Aplica el respaldo local rehidratando los DOS reducers (arbol principal + porciones) y baja el
  // banner. Persistir/restaurar solo `state` perderia los cambios de porciones (regresion vs web).
  const restoreDraft = useCallback(() => {
    if (!pendingRestore) return
    dispatch({ type: 'RESTORE_DRAFT', state: pendingRestore.state })
    setPendingRestore(null)
  }, [pendingRestore])

  // Descarta el respaldo local ofrecido y baja el banner sin tocar el estado actual.
  const dismissRestore = useCallback(() => {
    void clearNutritionDraft(draftKey)
    setPendingRestore(null)
  }, [draftKey])

  // Al salir, el respaldo local solo se borra si el coach descarto ediciones PROPIAS (count > 0) o
  // si no queda un respaldo anterior sin restaurar: salir limpio con el banner "Restaurar" todavia
  // pendiente NO debe destruir ese respaldo en silencio (mismo guard que web). Best-effort sin await.
  const doExit = useCallback(() => {
    if (count > 0 || pendingRestore === null) void clearNutritionDraft(draftKey)
    onExit()
  }, [count, pendingRestore, draftKey, onExit])

  const requestExit = useCallback(() => {
    if (count > 0) {
      Alert.alert(
        QUICK_EDIT_COPY.leaveGuardTitle,
        template ? EDITOR_COPY.templateLeaveGuard : QUICK_EDIT_COPY.leaveGuard,
        [
          { text: QUICK_EDIT_COPY.keepEditing, style: 'cancel' },
          { text: 'Salir', style: 'destructive', onPress: doExit },
        ],
      )
      return
    }
    doExit()
  }, [count, doExit, template])

  // Guard de salida por back de hardware (Android) — espejo del beforeunload web.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestExit()
      return true
    })
    return () => sub.remove()
  }, [requestExit])

  const pushUndo = useCallback((entry: UndoEntry) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndo(entry)
    undoTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setUndo(null)
    }, UNDO_TIMEOUT_MS)
  }, [])

  const handleUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    if (undo) undo.restore()
    setUndo(null)
  }, [undo])

  const handleRemoveItem = useCallback(
    (variantKey: string, slotKey: string, itemKey: string) => {
      const variant = state.variants.find((v) => v.key === variantKey)
      const slot = variant?.slots.find((s) => s.key === slotKey)
      const index = slot?.items.findIndex((i) => i.key === itemKey) ?? -1
      const item = index >= 0 ? slot?.items[index] : undefined
      if (!slot || !item) return
      dispatch({ type: 'REMOVE_ITEM', variantKey, slotKey, itemKey })
      pushUndo({
        message: QUICK_EDIT_COPY.deletedUndo,
        restore: () => dispatch({ type: 'RESTORE_ITEM', variantKey, slotKey, index, item }),
      })
    },
    [state, pushUndo],
  )

  // Baja de un target de porciones con Deshacer (mismo snackbar de los items). T3.3a: las
  // porciones viven en el arbol compartido — acciones con variantKey + slotKey.
  const handleRemovePortion = useCallback(
    (variantKey: string, slotKey: string, target: QePortionTarget, index: number) => {
      dispatch({ type: 'REMOVE_PORTION_TARGET', variantKey, slotKey, targetKey: target.key })
      pushUndo({
        message: PORTIONS_COPY.builder.groupRemoved(target.groupName),
        restore: () => dispatch({ type: 'RESTORE_PORTION_TARGET', variantKey, slotKey, index, target }),
      })
    },
    [pushUndo],
  )

  const handleAddPortion = useCallback((variantKey: string, slotKey: string, group: QePortionGroup) => {
    dispatch({ type: 'ADD_PORTION_TARGET', variantKey, slotKey, key: genKey('ptarget'), group })
  }, [])

  // Porciones propias (FD6a): administración de grupos desde el picker del quick-edit. La
  // ESCRITURA vive en `ExchangeGroupFormSheet` (endpoint mobile, nunca Supabase directo); acá solo
  // se refleja el resultado en la lista y —al eliminar— se quitan los targets que quedarían
  // apuntando a un grupo borrado (publicar así rompería el freeze con EXCHANGE_GROUP_NOT_FOUND).
  const portionGroupAdmin: QuickEditGroupAdmin = useMemo(
    () => ({
      scope,
      ownGroupIds,
      ensureLoaded: () => {
        if (ownGroupsRequestedRef.current) return
        ownGroupsRequestedRef.current = true
        void fetchNutritionV2ExchangeGroups(scope)
          .then(({ groups }) => {
            if (!mountedRef.current) return
            setOwnGroupIds(new Set(groups.filter((group) => !group.isSystem).map((group) => group.id)))
          })
          .catch(() => {
            // Best-effort: sin catálogo no hay afordancia de editar, pero crear sigue disponible.
          })
      },
      onSaved: (group) => {
        setGroupOverrides((prev) => [
          ...prev.filter((g) => g.exchangeGroupId !== group.id),
          toQuickEditPortionGroup(group),
        ])
        setRemovedGroupIds((prev) => {
          if (!prev.has(group.id)) return prev
          const next = new Set(prev)
          next.delete(group.id)
          return next
        })
        setOwnGroupIds((prev) => (prev.has(group.id) ? prev : new Set(prev).add(group.id)))
      },
      onDeleted: (groupId) => {
        setRemovedGroupIds((prev) => new Set(prev).add(groupId))
        setGroupOverrides((prev) => prev.filter((g) => g.exchangeGroupId !== groupId))
        for (const variant of state.variants) {
          for (const slot of variant.slots) {
            for (const target of slot.portionTargets) {
              if (target.exchangeGroupId === groupId) {
                dispatch({
                  type: 'REMOVE_PORTION_TARGET',
                  variantKey: variant.key,
                  slotKey: slot.key,
                  targetKey: target.key,
                })
              }
            }
          }
        }
      },
    }),
    [scope, ownGroupIds, state.variants],
  )

  const handleRemoveSlot = useCallback(
    (variantKey: string, slotKey: string) => {
      const variant = state.variants.find((v) => v.key === variantKey)
      if (!variant) return
      if (strategyUsesSlots(baseline?.strategy ?? null) && variant.slots.length <= 1) {
        Alert.alert(QUICK_EDIT_COPY.addSlot, QUICK_EDIT_COPY.lastSlotBlocked)
        return
      }
      const index = variant.slots.findIndex((s) => s.key === slotKey)
      const slot = index >= 0 ? variant.slots[index] : undefined
      if (!slot) return
      // T2.6 F1 — una sola gramatica destructiva en todo el modulo: la accion OCURRE y hay
      // Deshacer (espejo del web, que tambien perdio este confirm). Tenia undo Y ADEMAS un
      // Alert de confirmacion encima; el confirm sobraba.
      dispatch({ type: 'REMOVE_SLOT', variantKey, slotKey })
      // Las porciones de la franja quedan intactas en su estado paralelo
      // (keyed por slot.key): el RESTORE_SLOT las recupera solo.
      pushUndo({
        message: QUICK_EDIT_COPY.slotDeletedUndo,
        restore: () => dispatch({ type: 'RESTORE_SLOT', variantKey, index, slot }),
      })
    },
    [state, baseline, pushUndo],
  )

  // ── Multi-dia (FD5) ────────────────────────────────────────────────────────────────
  // Dias ya reclamados por una variante especifica (el picker los deshabilita).
  const takenDays = useMemo(() => Array.from(takenDayVariantDows(state)), [state])
  // Orden de lectura: dia base primero, despues los especificos Lu→Do (espejo web).
  const orderedVariants = useMemo(() => sortNutritionDayVariantsForDisplay(state.variants), [state.variants])
  const showVariantHeader = state.variants.length > 1

  /**
   * Proyección de las variantes al contrato compartido `NutritionDayVariantLike` para la tira
   * Lu-Do (QW-13): el estado del quick-edit usa `default`/`key` y el helper del paquete
   * `isDefault`/`id`. La identidad viaja en `id = key` porque `buildNutritionDayVariantWeekStrip`
   * empareja por `id` cuando ambas variantes lo traen (identidad por referencia sería frágil).
   */
  const weekVariants = useMemo<WeekVariantLike[]>(
    () =>
      state.variants.map((variant) => ({
        id: variant.key,
        dayOfWeek: variant.dayOfWeek,
        isDefault: variant.isDefault,
      })),
    [state.variants],
  )

  // Día del plan que aplica HOY (misma regla que el snapshot del alumno): el índice lo marca
  // para que el coach entre orientado — espejo del `todayVariantKey` web.
  const todayVariantKey = useMemo(
    () => resolveNutritionDayVariantForDate(weekVariants, todayIso)?.id ?? null,
    [weekVariants, todayIso],
  )

  /**
   * Dia en edicion (solo editor). Fallback en cadena: eleccion del coach → dia que aplica HOY →
   * primero en orden de lectura. Si el dia activo se elimina, la cadena resuelve sola.
   */
  const activeVariant = useMemo(() => {
    if (!editorMode) return null
    return (
      orderedVariants.find((variant) => variant.key === activeDayKey) ??
      orderedVariants.find((variant) => variant.key === todayVariantKey) ??
      orderedVariants[0] ??
      null
    )
  }, [editorMode, orderedVariants, activeDayKey, todayVariantKey])
  const visibleVariants = editorMode && activeVariant ? [activeVariant] : orderedVariants
  // Diccionario del engine para que los subtotales SUMEN las porciones a eleccion.
  const exchangeGroups = useMemo(() => qeExchangeGroups(portionGroups), [portionGroups])
  // Totales EN VIVO del dia activo (items + porciones) para la barra fija de abajo (W3b).
  const dayTotals = useMemo((): PublishBarDayTotals | null => {
    if (!activeVariant) return null
    const totals = qeVariantTotalWithPortions(activeVariant, exchangeGroups)
    const target = Number(activeVariant.targets.calories.trim())
    // T3.v Cabina (V3.3): metas de gramos por macro — alimentan la mini-cinta (`EditorDayRibbon`)
    // sin un segundo cálculo (mismo criterio "no se inventa un porcentaje" que `targetCalories`).
    const targetProteinG = Number(activeVariant.targets.proteinG.trim())
    const targetCarbsG = Number(activeVariant.targets.carbsG.trim())
    const targetFatsG = Number(activeVariant.targets.fatsG.trim())
    return {
      label: showVariantHeader ? activeVariant.label : null,
      calories: totals.calories,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatsG: totals.fatsG,
      targetCalories: Number.isFinite(target) && target > 0 ? target : null,
      targetProteinG: Number.isFinite(targetProteinG) && targetProteinG > 0 ? targetProteinG : null,
      targetCarbsG: Number.isFinite(targetCarbsG) && targetCarbsG > 0 ? targetCarbsG : null,
      targetFatsG: Number.isFinite(targetFatsG) && targetFatsG > 0 ? targetFatsG : null,
    }
  }, [activeVariant, exchangeGroups, showVariantHeader])

  const handleDayLayout = useCallback((variantKey: string, y: number) => {
    dayOffsetsRef.current[variantKey] = y
  }, [])

  // Salto a un día: sin offset medido (bloque aún no montado) no hace nada — mejor quieto
  // que saltar a una coordenada inventada.
  const jumpToDay = useCallback((variantKey: string) => {
    const y = dayOffsetsRef.current[variantKey]
    if (y == null) return
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true })
  }, [])

  function openAddDay() {
    setAddDays([])
    setAddSource('clone')
    setAddDayOpen(true)
  }

  /**
   * Alta de uno o varios dias. Ademas del arbol principal hay que clonar la capa de
   * PORCIONES, que en RN vive en un reducer aparte keyed por `slot.key`: sin esto el dia
   * clonado perderia sus grupos a eleccion. El mapeo `from -> to` sale de la MISMA funcion
   * pura que usa el reducer, asi que pantalla y estado no pueden divergir.
   */
  const handleAddDays = useCallback(() => {
    if (addDays.length === 0) return
    // T3.3a: el reducer compartido clona el dia COMPLETO (franjas + items + porciones en el
    // arbol) — el bloque paralelo de clonado de porciones murio con el reducer hermano.
    dispatch({ type: 'ADD_VARIANT', days: addDays, source: addSource })
    setAddDayOpen(false)
  }, [addDays, addSource])

  const handleRemoveDay = useCallback(
    (variant: QeVariant) => {
      const index = state.variants.findIndex((candidate) => candidate.key === variant.key)
      if (index < 0 || variant.isDefault) return
      const removed = state.variants[index]
      setDayMenuKey(null)
      Alert.alert(QUICK_EDIT_COPY.removeDayTitle, removeDayConfirmBody(variant.label.trim() || 'este día'), [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            dispatch({ type: 'REMOVE_VARIANT', variantKey: variant.key })
            // Las porciones de sus franjas quedan intactas en el estado paralelo (keyed por
            // slot.key): el RESTORE_VARIANT las recupera solo, igual que con las franjas.
            pushUndo({
              message: QUICK_EDIT_COPY.dayRemovedUndo,
              restore: () => dispatch({ type: 'RESTORE_VARIANT', index, variant: removed }),
            })
          },
        },
      ])
    },
    [state, pushUndo],
  )

  // ── Copia de franja entre dias (CE-5) ─────────────────────────────────────────────
  /**
   * Aplica la copia a N días en UN gesto: el árbol lo mueve el reducer y la capa de
   * PORCIONES —reducer hermano keyed por `slot.key`— la mueve la pantalla con los MISMOS
   * destinos (`resolveQuickEditSlotCopyTargets` sobre el estado PREVIO, la misma función pura
   * que usa el reducer: pantalla y estado no pueden divergir).
   *
   * Deshacer: el árbol y las porciones previos completos. Una copia toca N días a la vez, así
   * que ningún `RESTORE_*` puntual la cubre (nota de la lib).
   */
  const applySlotCopy = useCallback(
    (source: SlotRef, targetVariantKeys: readonly string[]) => {
      if (targetVariantKeys.length === 0) return
      const previousState = state
      // T3.3a: la accion del arbol compartido copia la franja COMPLETA (items + porciones);
      // el mirror manual del reducer hermano murio. Deshacer = arbol previo entero (una copia
      // toca N dias; ningun RESTORE_* puntual la cubre).
      dispatch({
        type: 'COPY_SLOT_TO_VARIANTS',
        sourceVariantKey: source.variantKey,
        slotKey: source.slotKey,
        targetVariantKeys,
      })
      setSlotMenu(null)
      setCopySource(null)
      setCopyTargetKeys([])
      pushUndo({
        message: copySlotDone(targetVariantKeys.length),
        restore: () => dispatch({ type: 'RESTORE_DRAFT', state: previousState }),
      })
    },
    [state, pushUndo],
  )

  // Destinos posibles de la copia + si pisan una franja homónima (se resuelve con la MISMA
  // función pura del reducer, para que la hoja prometa exactamente lo que va a pasar).
  const copyCandidates = useMemo(() => {
    if (!copySource) return []
    const resolved = qeSlotCopyTargets(state, copySource.variantKey, copySource.slotKey)
    const replacedByKey = new Map(resolved.map((target) => [target.variantKey, target.replaces]))
    return orderedVariants
      .filter((variant) => variant.key !== copySource.variantKey)
      .map((variant) => ({ variant, replaces: replacedByKey.get(variant.key) === true }))
  }, [copySource, state, orderedVariants])

  // ── Editor unico: capacidades W2/W3 del editor web ────────────────────────────────────
  /** Resuelve el item apuntado por un `ItemRef` sobre el estado vigente. */
  const findItem = useCallback(
    (ref: ItemRef | null) => {
      if (!ref) return null
      const variant = state.variants.find((candidate) => candidate.key === ref.variantKey)
      const slot = variant?.slots.find((candidate) => candidate.key === ref.slotKey)
      const index = slot?.items.findIndex((candidate) => candidate.key === ref.itemKey) ?? -1
      if (!slot || index < 0) return null
      return { slot, item: slot.items[index], index }
    },
    [state],
  )

  /** Reorden dentro de la franja (W3b): Subir/Bajar, la afordancia tactil del drag del web. */
  const handleMoveItem = useCallback(
    (ref: ItemRef, direction: -1 | 1) => {
      const found = findItem(ref)
      if (!found) return
      const toIndex = found.index + direction
      if (toIndex < 0 || toIndex >= found.slot.items.length) return
      dispatch({ type: 'REORDER_ITEM', variantKey: ref.variantKey, slotKey: ref.slotKey, itemKey: ref.itemKey, toIndex })
    },
    [findItem],
  )

  /** Quitar un reemplazo autorizado con Deshacer al MISMO indice (W2). */
  const handleRemoveSubstitution = useCallback(
    (ref: ItemRef, sub: QeItemSubstitution, index: number) => {
      dispatch({ type: 'REMOVE_ITEM_SUBSTITUTION', variantKey: ref.variantKey, slotKey: ref.slotKey, itemKey: ref.itemKey, index })
      pushUndo({
        message: EDITOR_COPY.substitutionRemovedUndo,
        restore: () =>
          dispatch({
            type: 'RESTORE_ITEM_SUBSTITUTION',
            variantKey: ref.variantKey,
            slotKey: ref.slotKey,
            itemKey: ref.itemKey,
            index,
            sub,
          }),
      })
    },
    [pushUndo],
  )

  /**
   * Duplica el dia elegido como otro dia de la semana (W2). `ADD_VARIANT` solo clona el dia
   * BASE; esto permite "duplicar el sabado como domingo". Deshacer elimina el dia nuevo.
   */
  const handleDuplicateDay = useCallback(
    (sourceVariantKey: string, dayOfWeek: number) => {
      const variantKey = genKey('variant')
      dispatch({ type: 'DUPLICATE_VARIANT_AS', sourceVariantKey, dayOfWeek, variantKey })
      setDuplicateDayKey(null)
      pushUndo({
        message: EDITOR_COPY.duplicateDayDone(formatNutritionDayOfWeek(dayOfWeek) ?? ''),
        restore: () => dispatch({ type: 'REMOVE_VARIANT', variantKey }),
      })
    },
    [pushUndo],
  )

  // Copia de UN dia a varios (W3a): la descripcion previa sale de los modulos PUROS del wizard
  // (`planCopy`/`copyPlanWarning`, hoy en el paquete), asi que el aviso promete exactamente lo
  // que va a pasar: que se pisa, que se suma y que nombres quedan duplicados.
  const copyDayVariant = useMemo(
    () => state.variants.find((variant) => variant.key === copyDayKey) ?? null,
    [state.variants, copyDayKey],
  )
  const copyDayPlan = useMemo(() => {
    if (!copyDayVariant) return null
    const occupantByDay = new Map<number, QeVariant>()
    for (const candidate of state.variants) {
      if (!candidate.isDefault && candidate.dayOfWeek != null) occupantByDay.set(candidate.dayOfWeek, candidate)
    }
    return planCopy({
      mode: copyDayMode,
      sourceSlotNames: copyDayVariant.slots.map((slot) => slot.name),
      destinations: copyDayDays.map((dayOfWeek) => {
        const occupant = occupantByDay.get(dayOfWeek)
        return {
          dayOfWeek,
          occupied: occupant != null,
          slotNames: occupant ? occupant.slots.map((slot) => slot.name) : [],
        }
      }),
      room: MAX_DAY_VARIANTS - takenDays.length,
    })
  }, [copyDayVariant, copyDayMode, copyDayDays, state.variants, takenDays])
  const copyDayEffectiveCount = copyDayPlan
    ? copyDayPlan.entries.filter((entry) => !entry.skippedNoRoom).length
    : 0

  const handleCopyDay = useCallback(() => {
    if (!copyDayVariant) return
    if (copyDayDays.length === 0) {
      toast.info(EDITOR_COPY.copyDayNothing)
      return
    }
    const previousState = state
    dispatch({
      type: 'COPY_VARIANT_TO_DAYS',
      sourceVariantKey: copyDayVariant.key,
      days: copyDayDays,
      mode: copyDayMode,
      keySeed: genKey('copy'),
    })
    setCopyDayKey(null)
    setCopyDayDays([])
    pushUndo({
      message: EDITOR_COPY.copyDayDone(copyDayEffectiveCount),
      restore: () => dispatch({ type: 'RESTORE_DRAFT', state: previousState }),
    })
  }, [copyDayVariant, copyDayDays, copyDayMode, copyDayEffectiveCount, state, pushUndo])

  const handleSelectFood = useCallback(
    (food: FoodCatalogItem) => {
      if (!searchTarget) return
      const builderFood = mapFoodCatalogItemToBuilderFood(food)
      if (searchTarget.mode === 'substitution' && searchTarget.itemKey) {
        // Guardas de la UI (el reducer tambien las aplica): ni el propio alimento prescrito ni
        // uno ya autorizado — un tap que "no hace nada" parece un bug.
        const found = findItem({
          variantKey: searchTarget.variantKey,
          slotKey: searchTarget.slotKey,
          itemKey: searchTarget.itemKey,
        })
        const subs = found?.item.substitutions ?? []
        if (food.id === found?.item.foodId || subs.some((sub) => sub.foodId === food.id)) {
          toast.info(EDITOR_COPY.substitutionDuplicate)
          return
        }
        dispatch({
          type: 'ADD_ITEM_SUBSTITUTION',
          variantKey: searchTarget.variantKey,
          slotKey: searchTarget.slotKey,
          itemKey: searchTarget.itemKey,
          food: builderFood,
        })
        setSearchTarget(null)
        setSubsTarget({
          variantKey: searchTarget.variantKey,
          slotKey: searchTarget.slotKey,
          itemKey: searchTarget.itemKey,
        })
        return
      }
      if (searchTarget.mode === 'swap' && searchTarget.itemKey) {
        dispatch({
          type: 'SWAP_ITEM_FOOD',
          variantKey: searchTarget.variantKey,
          slotKey: searchTarget.slotKey,
          itemKey: searchTarget.itemKey,
          food: builderFood,
        })
      } else {
        // Porcion pegajosa: si el coach ya fijo una cantidad para este alimento, el alta nace
        // con ella (y su unidad). Sin memoria, el reducer cae al `servingSize` del catalogo.
        const prefill = editor?.rememberedQuantities[builderFood.id]
        dispatch({
          type: 'ADD_CATALOG_ITEM',
          variantKey: searchTarget.variantKey,
          slotKey: searchTarget.slotKey,
          key: genKey('item'),
          food: builderFood,
          ...(prefill ? { prefill } : {}),
        })
      }
      setSearchTarget(null)
    },
    [searchTarget, findItem, editor],
  )

  /**
   * Porcion pegajosa: al FIJAR la cantidad (blur) se recuerda para la proxima, en este alumno y
   * en general. Solo el editor escribe memoria (el quick-edit clasico ni lee ni escribe) y solo
   * con alimento del catalogo en mano. La firma evita reescribir lo mismo en cada blur.
   */
  const handleQuantityCommit = useCallback(
    (variantKey: string, slotKey: string, itemKey: string) => {
      // En PLANTILLA no hay alumno: el clientId es un relleno y la memoria seria ruido.
      if (!editorMode || template) return
      const found = findItem({ variantKey, slotKey, itemKey })
      const food = found?.item.food
      if (!food) return
      const signature = food.id + ':' + found.item.quantity + ':' + found.item.unit
      if (rememberedSignatureRef.current[itemKey] === signature) return
      rememberedSignatureRef.current[itemKey] = signature
      void rememberFoodQuantity(supabase as unknown as NutritionV2WriteClient, {
        clientId,
        foodId: food.id,
        quantity: found.item.quantity,
        unit: found.item.unit,
      })
    },
    [editorMode, template, findItem, clientId],
  )

  const handleFreeItem = useCallback(() => {
    if (!searchTarget || searchTarget.mode !== 'add') return
    dispatch({
      type: 'ADD_CUSTOM_ITEM',
      variantKey: searchTarget.variantKey,
      slotKey: searchTarget.slotKey,
      key: genKey('item'),
    })
    setSearchTarget(null)
  }, [searchTarget])

  /**
   * Publish del modo CREACION (T3.3b): `publishDraftRN` — el MISMO pipeline del wizard RN —
   * con la vigencia elegible; CAS solo si el alumno ya tenia plan (reemplazo). No hay version
   * base que preservar, asi que el carry-over F-02 no aplica: los reemplazos que el arbol trae
   * (copia de plan) viajan DENTRO del draft.
   */
  const doCreatePublish = useCallback(async () => {
    if (!creation || !currentDraft || !intentKeyRef.current) return
    const net = await NetInfo.fetch()
    if (net.isConnected === false) {
      if (!mountedRef.current) return
      setConfirmOpen(false)
      setPublishError(QUICK_EDIT_COPY.offline)
      return
    }
    setPublishing(true)
    setPublishError(null)
    const res = await publishDraftRN({
      scope,
      draft: currentDraft,
      idempotencyKey: intentKeyRef.current,
      effectiveFrom: state.meta?.effectiveFrom ?? todayIso,
      hasNutritionPro,
      expectedCurrentVersionId: creation.expectedCurrentVersionId,
    })
    if (!mountedRef.current) return
    setPublishing(false)
    setConfirmOpen(false)
    if (res.ok) {
      intentKeyRef.current = null
      onPublished()
      return
    }
    if (res.code === 'STALE_BASE') {
      setStale(true)
      return
    }
    if (res.code === 'UPGRADE_REQUIRED') {
      setUpsell(res.error)
      return
    }
    if (res.code === 'EFFECTIVE_DATE' || res.code === 'NEEDS_VARIANT' || res.code === 'NEEDS_SLOT') {
      // El campo culpable existe en el arbol: se marcan los errores locales junto al mensaje.
      setShowErrors(true)
      setPublishError(res.error)
      return
    }
    setPublishError(res.error)
  }, [creation, currentDraft, scope, state.meta, todayIso, hasNutritionPro, onPublished])

  /**
   * Guardado del modo PLANTILLA: sin CAS ni idempotencia (paridad con el wizard — ultima
   * escritura gana) y sin PostHog de publish, porque no se publico nada. El draft proyectado
   * viaja tal cual; el servicio le quita la identidad y valida el round-trip antes de escribir.
   */
  const doTemplateSave = useCallback(async () => {
    if (!template || !currentDraft) return
    const net = await NetInfo.fetch()
    if (net.isConnected === false) {
      if (!mountedRef.current) return
      setConfirmOpen(false)
      setPublishError(QUICK_EDIT_COPY.offline)
      return
    }
    setPublishing(true)
    setPublishError(null)
    const res = await savePlanTemplateRN({
      scope,
      templateId: template.templateId,
      name: (state.meta?.name ?? '').trim(),
      description: templateDescription.trim() || null,
      draft: currentDraft,
    })
    if (!mountedRef.current) return
    setPublishing(false)
    setConfirmOpen(false)
    if (res.ok) {
      intentKeyRef.current = null
      onPublished()
      return
    }
    setPublishError(res.error)
  }, [template, currentDraft, scope, state.meta, templateDescription, onPublished])

  const doPublish = useCallback(async () => {
    if (template) {
      await doTemplateSave()
      return
    }
    if (creation) {
      await doCreatePublish()
      return
    }
    if (!baseline || !intentKeyRef.current) return
    // NUT-008 (fail-closed): sin los reemplazos autorizados de la version base, publicar los
    // BORRA (el publish reescribe el arbol completo y solo escribe lo que trae el draft).
    // Cubre las dos vias: fetch en vuelo (carrera) y fetch fallido.
    if (subsStatus !== 'loaded') {
      if (!mountedRef.current) return
      setConfirmOpen(false)
      setPublishError(
        subsStatus === 'loading'
          ? QUICK_EDIT_COPY.substitutionsLoading
          : QUICK_EDIT_COPY.substitutionsFailed,
      )
      return
    }
    const net = await NetInfo.fetch()
    if (net.isConnected === false) {
      if (!mountedRef.current) return
      setConfirmOpen(false)
      setPublishError(QUICK_EDIT_COPY.offline)
      return
    }
    setPublishing(true)
    setPublishError(null)
    // Publish canonico de la lib CON capa de porciones (targets con snapshot congelado
    // por el MISMO pipeline: tablas versionadas + publish_nutrition_plan_v2).
    // NUT-005: la publicacion pasa por la API movil (rollout + delta-gate Pro + CAS server-side).
    const res = await publishQuickEditRN({
      scope,
      clientId,
      planModel,
      state,
      // Editor: los reemplazos ya viven EN el arbol (hidratados y editables), asi que no hay
      // nada que re-inyectar — el mapa esta vacio y la proyeccion ya los lleva.
      carryOverSubstitutions: carryOverSubs,
      idempotencyKey: intentKeyRef.current,
      todayIso,
    })
    if (!mountedRef.current) return
    setPublishing(false)
    setConfirmOpen(false)
    if (res.ok) {
      intentKeyRef.current = null
      // Publicado: el respaldo local ya no aporta (best-effort, sin bloquear la salida).
      void clearNutritionDraft(draftKey)
      onPublished()
      return
    }
    if (res.code === 'STALE_BASE' || res.code === 'EFFECTIVE_DATE') {
      // Con la migracion same-day, EFFECTIVE_DATE residual = carrera contra otra sesion
      // (fecha < vigente) → mismo tratamiento que STALE_BASE: recargar (qe-design §1.2.D).
      setStale(true)
      return
    }
    if (res.code === 'UPGRADE_REQUIRED') {
      setUpsell(res.message)
      return
    }
    setPublishError(res.message)
  }, [template, doTemplateSave, creation, doCreatePublish, baseline, scope, clientId, planModel, state, carryOverSubs, subsStatus, todayIso, onPublished, draftKey])

  const handlePublishRequest = useCallback(() => {
    if (count === 0 || publishing) return
    // Guard NUT-008 antes de abrir el confirm: no se ofrece publicar si el carry-over de
    // reemplazos no esta resuelto (misma razon que en doPublish). En PLANTILLA no aplica:
    // no hay alumno ni version base de la que arrastrar reemplazos.
    if (!template && subsStatus !== 'loaded') {
      setPublishError(
        subsStatus === 'loading'
          ? QUICK_EDIT_COPY.substitutionsLoading
          : QUICK_EDIT_COPY.substitutionsFailed,
      )
      return
    }
    if (!validation.ok) {
      setShowErrors(true)
      setPublishError('Revisa los campos marcados antes de publicar.')
      return
    }
    setShowErrors(false)
    setPublishError(null)
    // Key FRESCA por intencion (abrir el confirm); los reintentos de esta intencion la reusan.
    intentKeyRef.current = buildQuickEditIdempotencyKey({ clientId, operationId: genKey('qe') })
    setConfirmOpen(true)
  }, [count, publishing, validation.ok, clientId, subsStatus, template])

  const handleRetry = useCallback(() => {
    // Con el carry-over sin resolver, "Reintentar" reintenta la LECTURA de reemplazos (es
    // lo que bloquea), no el publish: republicar sin ellos los borraria (NUT-008).
    if (subsStatus !== 'loaded') {
      retrySubstitutions()
      return
    }
    if (!intentKeyRef.current) {
      handlePublishRequest()
      return
    }
    void doPublish()
  }, [doPublish, handlePublishRequest, subsStatus, retrySubstitutions])

  const handleDiscard = useCallback(() => {
    if (count === 0) {
      doExit()
      return
    }
    Alert.alert(QUICK_EDIT_COPY.discardTitle, discardConfirmBody(count), [
      { text: QUICK_EDIT_COPY.keepEditing, style: 'cancel' },
      { text: QUICK_EDIT_COPY.discard, style: 'destructive', onPress: doExit },
    ])
  }, [count, doExit])

  // Sin plan vigente NO hay quick-edit; el editor en modo CREACION, en cambio, es exactamente
  // la pantalla que sirve para ese caso (arma el primer plan del alumno).
  if (!baseline && !creation && !template) {
    return (
      <View className="flex-1 bg-surface-app px-4" style={{ paddingTop: insets.top + 24 }}>
        <NutritionStatePanel
          title="Sin plan vigente"
          description="No hay un plan publicado para editar."
        />
      </View>
    )
  }

  const usesSlots = strategyUsesSlots(strategy) || state.variants.some((v) => v.slots.length > 0)
  // Vigencia FUTURA de la version base (solo edicion): en creacion la fecha la elige el coach.
  const futureDate =
    baseline && !creation && baseline.effectiveFrom > todayIso ? baseline.effectiveFrom : null
  const dayMenuVariant = state.variants.find((variant) => variant.key === dayMenuKey) ?? null
  const changeDayVariant = state.variants.find((variant) => variant.key === changeDayKey) ?? null
  const slotMenuSlot = slotMenu
    ? (state.variants
        .find((variant) => variant.key === slotMenu.variantKey)
        ?.slots.find((slot) => slot.key === slotMenu.slotKey) ?? null)
    : null
  const copySourceSlot = copySource
    ? (state.variants
        .find((variant) => variant.key === copySource.variantKey)
        ?.slots.find((slot) => slot.key === copySource.slotKey) ?? null)
    : null
  // Editor unico: refs resueltos de los menus nuevos (item, reemplazos, duplicar, copiar dia).
  const itemMenuItem = findItem(itemMenu)
  const itemMenuIsFirst = (itemMenuItem?.index ?? 0) <= 0
  const itemMenuIsLast =
    itemMenuItem === null || itemMenuItem.index >= itemMenuItem.slot.items.length - 1
  const subsItem = findItem(subsTarget)
  const subsList = subsItem?.item.substitutions ?? []
  const duplicateDayVariant = state.variants.find((variant) => variant.key === duplicateDayKey) ?? null
  const copyDaySourceDow = copyDayVariant?.dayOfWeek ?? null
  const copyDayWarning = copyDayPlan ? copyPlanWarning(copyDayPlan) : null

  // T3.v Cabina (V3.3): «Metas ▾» del header hospeda el MISMO `TargetsEditorCard` del día
  // activo — el lienzo deja de pintarlo (ver `visibleVariants.map` abajo). Un error de
  // validación de metas del día activo fuerza la hoja abierta (espejo `EditorRibbon.tsx` web).
  const targetsInvalid =
    editorMode &&
    activeVariant !== null &&
    Object.keys(errors).some((key) => key.startsWith('target.' + activeVariant.key + '.'))
  const metasOpen = metasRequested || targetsInvalid

  return (
    // Guía Viva: el provider es puro contexto (no renderiza ninguna vista), así que envolver la
    // pantalla con él no puede mover un píxel. Tiene que quedar por encima TANTO de los targets
    // como del overlay, que es quien los mide.
    <TourTargetsProvider>
    <TourScrollHostBinder host={tourScrollHost} />
    <View className="flex-1 bg-surface-app">
      {/* Sello EVA v2 — reversa del dueño 17-08 (paridad con el editor web): el editor también
          lleva Horizonte B; la barra superior y las cards sólidas sostienen la legibilidad. */}
      <AppBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        {/* Barra «Listo» sobre el teclado numérico de iOS (QA owner 22-08: el decimal-pad no trae
            tecla de retorno y, con casi todo el lienzo tocable, el teclado «no se bajaba»). La
            cuelgan por `inputAccessoryViewID` el stepper de cantidad y los campos numéricos de la
            cabecera. Android no la pinta: usa su tecla ✓. */}
        <KeyboardDoneBar />
        {/* Barra fija del modo edición: salida + identidad del alumno + anclas por día. Vive
            FUERA del scroll a propósito — con los N días apilados, el único control de
            navegación no puede desaparecer al primer deslizamiento. */}
        <View className="border-b border-subtle bg-surface-app px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Salir del modo edición"
              onPress={requestExit}
              hitSlop={8}
              className="h-11 w-11 items-center justify-center rounded-control border border-subtle bg-surface-card"
            >
              <ArrowLeft color={theme.textSecondary} size={20} />
            </Pressable>
            <View className="min-w-0 flex-1">
              <Text
                className="font-mono text-[10px] font-semibold uppercase leading-4 tracking-[1.6px] text-primary"
                numberOfLines={1}
              >
                {template
                  ? EDITOR_COPY.templateEyebrow
                  : creation
                    ? EDITOR_COPY.createEyebrow
                    : editorMode
                      ? EDITOR_COPY.eyebrow
                      : QUICK_EDIT_COPY.editingEyebrow}
              </Text>
              <Text
                accessibilityRole="header"
                className="font-display-black text-[22px] leading-7 tracking-[-0.44px] text-strong"
                numberOfLines={1}
              >
                {template ? (state.meta?.name.trim() || EDITOR_COPY.templateTitle) : clientName}
              </Text>
            </View>
            {/* T3.v Cabina (V3.3): «Metas ▾» migra del lienzo al header (espejo `EditorRibbon.tsx`
                web) — hospeda el MISMO `TargetsEditorCard` del día activo en la hoja de abajo. */}
            {editorMode && activeVariant ? (
              <TourTarget name="metas">
              <Pressable
                // Guía Viva: target del paso «Metas sin salir del flujo». `collapsable={false}` es
                // lo que impide que Android aplane la vista y la vuelva imposible de medir.
                collapsable={false}
                accessibilityRole="button"
                accessibilityLabel={EDITOR_COPY.metasPopover}
                accessibilityState={{ expanded: metasOpen }}
                onPress={() => setMetasRequested(true)}
                hitSlop={8}
                className="min-h-11 shrink-0 flex-row items-center gap-1 rounded-control border border-subtle bg-surface-card px-3"
              >
                <Text className="text-xs font-bold text-strong">{EDITOR_COPY.metasPopover}</Text>
                <ChevronDown color={theme.textSecondary} size={14} />
              </Pressable>
              </TourTarget>
            ) : null}
          </View>
          {showVariantHeader ? (
            <DayAnchorRow
              variants={orderedVariants}
              todayVariantKey={todayVariantKey}
              activeVariantKey={activeVariant?.key ?? null}
              onJump={(variantKey) => {
                // Editor: los chips CAMBIAN el dia en edicion (capsula); el clasico scrollea
                // hasta el bloque, que sigue apilado abajo.
                if (editorMode) {
                  setActiveDayKey(variantKey)
                  scrollRef.current?.scrollTo({ y: 0, animated: true })
                  return
                }
                jumpToDay(variantKey)
              }}
            />
          ) : null}
        </View>

        {/* T3.v Cabina (V3.3): mini-cinta sticky bajo el header — kcal x/meta + 3 % con dot de
            macro del día activo. FUERA del scroll (mismo criterio que la barra de arriba). */}
        {editorMode && dayTotals ? (
          // Guía Viva: target del paso «Tu tablero de vuelo».
          <TourTarget name="ribbon">
            <EditorDayRibbon dayTotals={dayTotals} />
          </TourTarget>
        ) : null}

        <ScrollView
          ref={scrollRef}
          className="flex-1"
          // `pb-8` sale del className y pasa acá porque `contentContainerStyle` lo pisaría: el alto
          // del teclado se SUMA al respiro de siempre (ver `keyboardInset`). Sin esto el último
          // campo queda bajo el teclado y la PublishBar, y el cursor se hunde línea a línea.
          contentContainerClassName="gap-4 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 32 + keyboardInset }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Guía Viva: el host del tour necesita el offset vivo para scrollear al target.
          onScroll={(event) => {
            tourScrollOffsetYRef.current = event.nativeEvent.contentOffset.y
          }}
          scrollEventThrottle={32}
        >
          {/* EDITOR UNICO (T3.3b): con `state.meta` la identidad del plan deja de ser un rotulo
              read-only y pasa a ser la cabecera EDITABLE (nombre, estrategia, permisos, vigencia
              en creacion). Sin meta, el quick-edit clasico pinta el rotulo de siempre. */}
          {state.meta ? (
            <EditorMetaCard
              state={state}
              meta={state.meta}
              dispatch={dispatch}
              errors={errors}
              disabled={publishing}
              hasNutritionPro={hasNutritionPro}
              today={todayIso}
              futureDateLabel={futureDate}
              template={template !== null}
              templateDescription={templateDescription}
              onTemplateDescription={template ? setTemplateDescription : undefined}
            />
          ) : (
            <View className="gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <StrategyBadge strategy={strategy} />
                <Text className="text-sm font-semibold text-strong" numberOfLines={1}>
                  {baseline?.name ?? ''}
                </Text>
              </View>
              <Text className="text-xs leading-5 text-muted">{QUICK_EDIT_COPY.editingHint}</Text>
            </View>
          )}

          {/* Banner PERMANENTE (leccion JP 2026-08-11): una plantilla no le llega a nadie hasta
              aplicarla, y confundirla con un plan publicado ya costo un reporte de coach. */}
          {template ? (
            <View className="flex-row items-start gap-2 rounded-control border border-primary/25 bg-primary/10 px-4 py-3">
              <Info color={theme.primary} size={16} />
              <Text className="min-w-0 flex-1 text-sm leading-5 text-body">
                {EDITOR_COPY.templateBanner}
              </Text>
            </View>
          ) : null}

          {!usesSlots ? (
            <View className="flex-row items-start gap-2 rounded-control border border-subtle bg-surface-sunken px-4 py-3">
              <Info color={theme.primary} size={16} />
              <Text className="min-w-0 flex-1 text-sm leading-5 text-body">
                {QUICK_EDIT_COPY.flexibleHint}
              </Text>
            </View>
          ) : null}

          {/* Respaldo local (F2): hay un borrador de una sesion anterior (mismo plan/version) sin
              publicar. Espejo del banner web QuickEditPlanView.tsx:73-98 — tokens EVA DS (primary),
              icono History, Restaurar (rehidrata ambos reducers) + X (descarta el borrador). */}
          {pendingRestore ? (
            <View className="flex-row items-center gap-3 rounded-card border border-primary/25 bg-primary/10 p-3">
              <History color={theme.primary} size={16} />
              <Text className="min-w-0 flex-1 text-xs font-semibold leading-5 text-primary">
                {QUICK_EDIT_COPY.restoreBanner}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={QUICK_EDIT_COPY.restoreCta}
                onPress={restoreDraft}
                className="h-8 items-center justify-center rounded-control bg-primary px-3"
              >
                <Text className="text-xs font-bold text-white">{QUICK_EDIT_COPY.restoreCta}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={QUICK_EDIT_COPY.restoreDismiss}
                onPress={dismissRestore}
                hitSlop={8}
                className="h-8 w-8 items-center justify-center rounded-control"
              >
                <X color={theme.primary} size={16} />
              </Pressable>
            </View>
          ) : null}

          {visibleVariants.map((variant, variantIndex) => (
            <View
              key={variant.key}
              className="gap-3"
              onLayout={(event) => handleDayLayout(variant.key, event.nativeEvent.layout.y)}
            >
              {/* FD5: encabezado del día + menú (Cambiar día / Renombrar / Eliminar). El día
                  base no cambia de día ni se elimina; solo se puede renombrar. */}
              {showVariantHeader ? (
                <View>
                  <View className="flex-row items-start gap-2">
                    <View className="min-w-0 flex-1">
                      <Text className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                        {variant.isDefault ? QUICK_EDIT_COPY.baseDayEyebrow : QUICK_EDIT_COPY.specificDayEyebrow}
                      </Text>
                      <Text className="font-display text-base font-semibold text-strong" numberOfLines={1}>
                        {variant.label}
                      </Text>
                      {variant.isDefault ? (
                        <Text className="mt-0.5 text-xs leading-5 text-muted">
                          {QUICK_EDIT_COPY.baseDayHint}
                        </Text>
                      ) : null}
                      {errors['variant.' + variant.key + '.label'] ? (
                        <Text className="mt-1 text-xs font-medium text-danger-600">
                          {errors['variant.' + variant.key + '.label']}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={QUICK_EDIT_COPY.dayMenuTitle + ' ' + variant.label}
                      disabled={publishing}
                      onPress={() => setDayMenuKey(variant.key)}
                      hitSlop={8}
                      className="h-11 w-11 items-center justify-center rounded-control border border-subtle bg-surface-card"
                    >
                      <MoreVertical color={theme.textSecondary} size={18} />
                    </Pressable>
                  </View>
                  {/* QW-13: la tira Lu-Do read-only también mientras se edita — es cuando más
                      importa saber qué días cubre esta variante (un label propio como "Día de
                      entrenamiento" borra toda referencia al día de semana). */}
                  <VariantWeekStrip
                    variants={weekVariants}
                    variantKey={variant.key}
                    todayIso={todayIso}
                  />
                </View>
              ) : null}
              {/* T3.v Cabina (V3.3): en el editor único la card de metas se mudó a la hoja
                  «Metas ▾» del header (ver arriba) — el lienzo ya no la pinta. El quick-edit
                  clásico (`!editorMode`) la conserva exactamente igual que antes. */}
              {editorMode ? null : (
                <TargetsEditorCard
                  variant={variant}
                  showVariantLabel={false}
                  errors={errors}
                  disabled={publishing}
                  onTargetChange={(field, value) =>
                    dispatch({ type: 'SET_TARGET', variantKey: variant.key, field, value })
                  }
                />
              )}

              {usesSlots
                ? variant.slots.map((slot, slotIndex) => (
                    // Guía Viva: la PRIMERA franja del día activo es el target del paso «Franjas
                    // que se leen solas» y la que además hospeda «agregar» y «porciones». Se
                    // envuelven TODAS (con el nombre en `null` no se registra nada) para que
                    // ninguna franja quede con un nivel de vista distinto de sus hermanas.
                    <TourTarget
                      key={slot.key}
                      name={editorMode && variantIndex === 0 && slotIndex === 0 ? 'slot' : null}
                    >
                    <EditableSlotCard
                      tourTargets={editorMode && variantIndex === 0 && slotIndex === 0}
                      slot={slot}
                      index={slotIndex}
                      errors={errors}
                      disabled={publishing}
                      portionGroups={portionGroups}
                      // T3.v Cabina (V3.2): meta de kcal del DIA para el «{n}% de la meta» del
                      // popover del subtotal de la franja. Meta vacia o no numerica ⇒ null y el
                      // panel no dice el porcentaje (jamas se inventa contra una meta ausente).
                      targetCalories={(() => {
                        const target = Number(variant.targets.calories.trim())
                        return Number.isFinite(target) && target > 0 ? target : null
                      })()}
                      portionGroupAdmin={portionGroupAdmin}
                      scope={scope}
                      onFoodOverrideApplied={handleFoodOverrideApplied}
                      onPortionStep={(targetKey, direction) =>
                        dispatch({
                          type: 'STEP_PORTION_TARGET',
                          variantKey: variant.key,
                          slotKey: slot.key,
                          targetKey,
                          direction,
                        })
                      }
                      onPortionNotes={(targetKey, value) =>
                        dispatch({
                          type: 'SET_PORTION_NOTES',
                          variantKey: variant.key,
                          slotKey: slot.key,
                          targetKey,
                          value,
                        })
                      }
                      onPortionRemove={(target, targetIndex) =>
                        handleRemovePortion(variant.key, slot.key, target, targetIndex)
                      }
                      onPortionAdd={(group) => handleAddPortion(variant.key, slot.key, group)}
                      onSlotPatch={(patch) =>
                        dispatch({ type: 'UPDATE_SLOT', variantKey: variant.key, slotKey: slot.key, patch })
                      }
                      // Nota del coach de la franja («el globito», N-C): accion propia porque
                      // el patch de UPDATE_SLOT solo cubre nombre/hora. Texto crudo; la
                      // proyeccion del publish normaliza ''/espacios a null (N-A).
                      onSlotInstructions={(value) =>
                        dispatch({ type: 'SET_SLOT_INSTRUCTIONS', variantKey: variant.key, slotKey: slot.key, value })
                      }
                      onOpenMenu={
                        showVariantHeader
                          ? () => setSlotMenu({ variantKey: variant.key, slotKey: slot.key })
                          : undefined
                      }
                      onSearchFood={() =>
                        setSearchTarget({ mode: 'add', variantKey: variant.key, slotKey: slot.key, itemKey: null })
                      }
                      onAddFreeItem={() =>
                        dispatch({
                          type: 'ADD_CUSTOM_ITEM',
                          variantKey: variant.key,
                          slotKey: slot.key,
                          key: genKey('item'),
                        })
                      }
                      onItemQuantity={(itemKey, value) =>
                        dispatch({ type: 'SET_ITEM_QUANTITY', variantKey: variant.key, slotKey: slot.key, itemKey, value })
                      }
                      onItemQuantityCommit={
                        editorMode
                          ? (itemKey) => handleQuantityCommit(variant.key, slot.key, itemKey)
                          : undefined
                      }
                      onItemUnit={(itemKey, unit) =>
                        dispatch({ type: 'SET_ITEM_UNIT', variantKey: variant.key, slotKey: slot.key, itemKey, unit })
                      }
                      onItemName={(itemKey, value) =>
                        dispatch({ type: 'SET_ITEM_NAME', variantKey: variant.key, slotKey: slot.key, itemKey, value })
                      }
                      onSwapItem={(itemKey) =>
                        setSearchTarget({ mode: 'swap', variantKey: variant.key, slotKey: slot.key, itemKey })
                      }
                      onRemoveItem={(itemKey) => handleRemoveItem(variant.key, slot.key, itemKey)}
                      onOpenItemMenu={
                        state.meta
                          ? (itemKey) => setItemMenu({ variantKey: variant.key, slotKey: slot.key, itemKey })
                          : undefined
                      }
                    />
                    </TourTarget>
                  ))
                : null}

              {usesSlots && strategyUsesSlots(strategy) ? (
                // «Familia N» (T3.v Cabina): la pastilla de alta, no una barra de ancho completo.
                // QA owner 17-08: las DOS altas van en UNA fila (apiladas ocupaban el doble de
                // alto). «Agregar día» acompaña solo al ÚLTIMO día visible — es alta del plan, no
                // del día — con su candado Pro intacto al lado. `flex-wrap` para pantallas
                // angostas: si no entran juntas, envuelven sin desbordar.
                <View className="flex-row flex-wrap items-center gap-1.5">
                  <AddActionButton
                    variant="neutral"
                    icon="franja"
                    label={QUICK_EDIT_COPY.addSlot}
                    brandColor={brandColor}
                    disabled={publishing}
                    onPress={() => dispatch({ type: 'ADD_SLOT', variantKey: variant.key, key: genKey('slot'), name: '', startTime: '' })}
                  />
                  {variantIndex === visibleVariants.length - 1 &&
                  takenDays.length < NUTRITION_WEEK_ORDER.length ? (
                    <>
                      <AddActionButton
                        variant="dashed"
                        icon="dia"
                        label={QUICK_EDIT_COPY.addDay}
                        brandColor={brandColor}
                        disabled={publishing}
                        onPress={openAddDay}
                      />
                      {hasNutritionPro ? null : (
                        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                          <Lock color={theme.primary} size={16} />
                        </View>
                      )}
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}

          {/* FD5: "+ Agregar día" al final de la lista de días. Sin Nutrición Pro el CTA lleva
              candado y el sheet muestra el upsell (el server rechaza igual: multi_variant).

              «Familia N» (T3.v Cabina): pastilla PUNTEADA — el día que todavía no existe es el
              caso de «hueco por llenar» del que vive esa variante. El candado del gate Pro NO se
              pierde: la pastilla no admite hijos (su forma es fija a propósito), así que viaja al
              lado, como sello. Sigue siendo decorativo — quien anuncia el gate es el sheet.

              QA owner 17-08: solo para días SIN fila de altas (estrategia flexible) — el caso
              estructurado/híbrido lo hospeda la fila del último día, arriba. */}
          {takenDays.length < NUTRITION_WEEK_ORDER.length &&
          !(usesSlots && strategyUsesSlots(strategy)) ? (
            <View className="flex-row items-center gap-1.5">
              <AddActionButton
                variant="dashed"
                icon="dia"
                label={QUICK_EDIT_COPY.addDay}
                brandColor={brandColor}
                disabled={publishing}
                onPress={openAddDay}
              />
              {hasNutritionPro ? null : (
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Lock color={theme.primary} size={16} />
                </View>
              )}
            </View>
          ) : null}

          {/* Notas visibles EDITABLES (visible_notes, espejo web QuickEditPlanView); permisos
              siguen read-only con hint. protocolNotes read-only (carry-over del publish). */}
          <NutritionCard>
            <View className="flex-row items-center gap-2">
              <NotebookPen color={theme.textSecondary} size={16} />
              {/* En el editor los permisos viven en la cabecera: seguir titulando "y permisos"
                  mandaba a buscar aca unos controles que no estan. */}
              <Text className="font-display text-base font-semibold text-strong">
                {state.meta ? QUICK_EDIT_COPY.notesLabel : QUICK_EDIT_COPY.notesPermissionsTitle}
              </Text>
            </View>
            {/* En el editor el titulo de la card YA es "Notas para tu alumno". */}
            {state.meta ? null : (
              <Text className="mt-3 text-xs font-semibold text-muted">
                {QUICK_EDIT_COPY.notesLabel}
              </Text>
            )}
            <TextInput
              ref={notesInputRef}
              accessibilityLabel={QUICK_EDIT_COPY.notesLabel}
              value={state.visibleNotes}
              onChangeText={(value) => dispatch({ type: 'SET_VISIBLE_NOTES', value })}
              editable={!publishing}
              multiline
              maxLength={8000}
              textAlignVertical="top"
              placeholder={QUICK_EDIT_COPY.notesPlaceholder}
              placeholderTextColor={theme.mutedForeground}
              // Tope de alto = paridad exacta con el `<textarea rows={5}>` de la web, que es
              // justamente por qué la web NO reproduce este defecto: sin tope, el campo crece línea
              // a línea, Android scrollea al foco UNA sola vez y el cursor termina bajo el borde.
              style={{ maxHeight: 140 }}
              // Al enfocar sólo se ANOTA el pedido: la cuenta la resuelve `flushNotesVisible`
              // cuando el teclado ya tiene métricas. Ver la nota del ref arriba.
              onFocus={ensureNotesVisible}
              className="mt-3 min-h-28 rounded-control border border-default bg-surface-card px-2.5 py-2 text-sm leading-6 text-body"
            />
            {errors['plan.visibleNotes'] ? (
              <Text className="mt-1 text-xs font-medium text-danger-600">
                {errors['plan.visibleNotes']}
              </Text>
            ) : null}
            {planModel.protocolNotes ? (
              <Text className="mt-2 text-xs leading-5 text-muted">{planModel.protocolNotes}</Text>
            ) : null}
            {/* Los chips read-only de permisos solo existen en el quick-edit CLASICO: en el editor
                unico los permisos son editables y viven en la cabecera. */}
            {state.meta ? null : (
              <View className="mt-3 flex-row flex-wrap gap-1.5">
                  {(
                  [
                    // "Puede sustituir" no se pinta: espejo de la decision D4 del web
                    // (`docs/specs/nutrition-exchange-swap/SPEC.md`). El permiso no lo lee ningun
                    // camino de autorizacion desde T2.4.
                    [planModel.permissions.canRegisterFreely, QUICK_EDIT_COPY.permRegisterFreely],
                    [planModel.permissions.canAdjustPrescribedQuantity, QUICK_EDIT_COPY.permAdjustQuantity],
                  ] as const
                ).map(([enabled, label]) => (
                  <View
                    key={label}
                    className={
                      'rounded-pill border px-2 py-0.5 ' +
                      (enabled ? 'border-primary/30 bg-primary/10' : 'border-subtle bg-surface-sunken')
                    }
                  >
                    <Text
                      className={'text-[11px] font-semibold ' + (enabled ? 'text-primary' : 'text-muted')}
                    >
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {state.meta ? null : (
              <View className="mt-3 flex-row items-start gap-1.5">
                <Info color={theme.textSecondary} size={14} />
                <Text className="min-w-0 flex-1 text-xs leading-5 text-muted">
                  {QUICK_EDIT_COPY.readonlyHint}
                </Text>
              </View>
            )}
          </NutritionCard>
        </ScrollView>

        {undo ? <UndoSnackbar message={undo.message} onUndo={handleUndo} /> : null}

        {/* Guía Viva: target del paso «Publica y ya llegó». El `onLayout` no es del tour: es lo que
            le dice al «?» dónde termina la barra para poder apoyarse justo encima. */}
        <TourTarget
          name="publicar"
          onLayout={(event) => setPublishBarHeight(event.nativeEvent.layout.height)}
        >
          <PublishBar
            count={count}
            publishing={publishing}
            errorMessage={publishError}
            dayTotals={dayTotals}
            template={template !== null}
            creation={creation !== null}
            onDiscard={handleDiscard}
            onPublish={handlePublishRequest}
            onRetry={handleRetry}
          />
        </TourTarget>
      </KeyboardAvoidingView>

      {/* El «?» de la Guía Viva (D2, INVARIANTE del dueño: «jamás tapa nada»).
       *
       * La SPEC lo ubica «flotante sobre la PublishBar, lado IZQUIERDO (los CTAs viven a la
       * derecha)». Eso es literal en la web, donde esa barra deja su mitad izquierda libre. En RN
       * NO: acá «Descartar» y «Publicar» son dos botones `flex-1` que ocupan el ancho ENTERO de la
       * barra (gotcha conocido del proyecto: dos botones en fila siempre `flex-1`), así que
       * apoyarlo dentro de la barra taparía «Descartar» — exactamente lo que D2 prohíbe.
       *
       * Se resuelve por el invariante y no por la letra: el botón flota por el lado izquierdo JUSTO
       * ENCIMA de la barra (`publishBarHeight` sale del `onLayout` de arriba, y ese alto ya incluye
       * el área segura inferior, que la barra se paga sola). Es el mismo lugar que la web le da en
       * ≥1024 —esquina inferior izquierda del lienzo—, y el único punto de la pantalla donde el «?»
       * no se apoya sobre ningún control. Queda declarado para el juicio del dueño. */}
      {editorMode ? (
        <TourHelpButton
          tourId="editor"
          coachId={tourCoachId}
          variant="floating"
          onOpen={tour.start}
          // `Math.max` con el área segura: si la barra no se pintó (plan de un día sin metas y sin
          // cambios) su alto es 0 y `bottom: 10` dejaría el botón bajo la barra de gestos.
          style={{ left: 14, bottom: Math.max(publishBarHeight, insets.bottom) + 10 }}
        />
      ) : null}

      {editorMode ? (
        <TourOverlay steps={tourSteps('editor')} active={tour.active} onEnd={tour.end} />
      ) : null}

      <FoodSearchSheet
        open={searchTarget !== null}
        mode={searchTarget?.mode ?? 'add'}
        onClose={() => setSearchTarget(null)}
        onSelect={handleSelectFood}
        onFreeItem={handleFreeItem}
      />
      <PublishConfirmSheet
        open={confirmOpen}
        publishing={publishing}
        studentName={clientName}
        futureDate={futureDate}
        template={template !== null}
        creation={creation ? { effectiveFrom: state.meta?.effectiveFrom ?? null } : null}
        onConfirm={() => void doPublish()}
        onClose={() => setConfirmOpen(false)}
      />
      <StaleBaseSheet
        open={stale}
        onReload={() => {
          setStale(false)
          onStaleReload()
        }}
      />
      <ProUpsellSheet message={upsell} onClose={() => setUpsell(null)} />

      {/* T3.v Cabina (V3.3): «Metas ▾» del header — hospeda el MISMO `TargetsEditorCard` y los
          MISMOS dispatches (`SET_TARGET`) que antes vivían en el lienzo; solo cambia el host.
          Un error de validación fuerza la hoja abierta y `onClose` no puede cerrarla mientras
          persista (espejo del patrón `forcedOpen`/`Popover` web). */}
      <Sheet
        open={metasOpen}
        onClose={() => setMetasRequested(false)}
        nativeModal
        dynamicSizing
        title={EDITOR_COPY.metasPopover}
        accessibilityLabel={EDITOR_COPY.metasPopover}
      >
        {activeVariant ? (
          <TargetsEditorCard
            variant={activeVariant}
            showVariantLabel={showVariantHeader}
            errors={errors}
            disabled={publishing}
            onTargetChange={(field, value) =>
              dispatch({ type: 'SET_TARGET', variantKey: activeVariant.key, field, value })
            }
          />
        ) : null}
      </Sheet>

      {/* ── EDITOR UNICO (T3.3b): menu del item + reemplazos + duplicar/copiar dia ────────── */}
      <Sheet
        open={itemMenu !== null}
        onClose={() => setItemMenu(null)}
        nativeModal
        dynamicSizing
        title={itemMenuItem?.item.displayName || EDITOR_COPY.itemMenuTitle}
        accessibilityLabel={EDITOR_COPY.itemMenuTitle}
      >
        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={EDITOR_COPY.substitutionsMenu(itemMenuItem?.item.substitutions.length ?? 0)}
            onPress={() => {
              setSubsTarget(itemMenu)
              setItemMenu(null)
            }}
            className="min-h-12 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3"
          >
            <ListPlus color={theme.textSecondary} size={16} />
            <Text className="text-sm font-semibold text-strong">
              {EDITOR_COPY.substitutionsMenu(itemMenuItem?.item.substitutions.length ?? 0)}
            </Text>
          </Pressable>
          {/* Reorden dentro de la franja: en el telefono no hay drag con manija (el web lo tiene
              en desktop); Subir/Bajar es la afordancia tactil equivalente. */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={EDITOR_COPY.moveItemUp}
                accessibilityState={{ disabled: itemMenuIsFirst }}
                disabled={itemMenuIsFirst}
                onPress={() => {
                  if (itemMenu) handleMoveItem(itemMenu, -1)
                  setItemMenu(null)
                }}
                className={
                  'min-h-12 flex-row items-center justify-center gap-2 rounded-control border border-default bg-surface-card px-3 ' +
                  (itemMenuIsFirst ? 'opacity-50' : '')
                }
              >
                <ArrowUp color={theme.textSecondary} size={16} />
                <Text className="text-sm font-semibold text-strong">{EDITOR_COPY.moveItemUp}</Text>
              </Pressable>
            </View>
            <View className="flex-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={EDITOR_COPY.moveItemDown}
                accessibilityState={{ disabled: itemMenuIsLast }}
                disabled={itemMenuIsLast}
                onPress={() => {
                  if (itemMenu) handleMoveItem(itemMenu, 1)
                  setItemMenu(null)
                }}
                className={
                  'min-h-12 flex-row items-center justify-center gap-2 rounded-control border border-default bg-surface-card px-3 ' +
                  (itemMenuIsLast ? 'opacity-50' : '')
                }
              >
                <ArrowDown color={theme.textSecondary} size={16} />
                <Text className="text-sm font-semibold text-strong">{EDITOR_COPY.moveItemDown}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Sheet>

      {/* Reemplazos autorizados del item (W2): lista con el nombre congelado, quitar con Deshacer
          y alta por el buscador. Los guards (tope 8, sin duplicados, sin auto-reemplazo) los
          aplica el reducer compartido; la UI los enuncia antes de que el coach choque. */}
      <Sheet
        open={subsTarget !== null}
        onClose={() => setSubsTarget(null)}
        nativeModal
        dynamicSizing
        title={EDITOR_COPY.substitutionsTitle(subsItem?.item.displayName || 'este alimento')}
        accessibilityLabel={EDITOR_COPY.substitutionsTitle(subsItem?.item.displayName || 'este alimento')}
      >
        <View className="gap-3">
          <Text className="text-xs leading-5 text-muted">{EDITOR_COPY.substitutionsHint}</Text>
          {subsList.length === 0 ? (
            <Text className="rounded-control border border-subtle bg-surface-sunken px-3 py-2.5 text-sm leading-6 text-body">
              {EDITOR_COPY.substitutionsEmpty}
            </Text>
          ) : (
            <View className="gap-2">
              {subsList.map((sub, subIndex) => {
                // La cantidad que el ALUMNO va a ver de verdad: un reemplazo sin cantidad propia
                // (hoy, todos) se le muestra ya resuelto en la porción que IGUALA las kcal de lo
                // prescrito. Hasta acá el coach autorizaba a ciegas — sólo veía el nombre.
                // `null` = no hay macros vigentes con qué calcular ⇒ no se pinta número: mejor
                // vacío que un 0 inventado.
                const equivalence = subsItem ? qeSubstitutionEquivalence(subsItem.item, sub) : null
                return (
                  <View
                    key={(sub.foodId ?? sub.customName ?? 'sub') + '-' + subIndex}
                    className="flex-row items-start gap-2 rounded-control border border-subtle bg-surface-card p-2.5"
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-semibold leading-5 text-strong" numberOfLines={2}>
                        {sub.displayName ?? sub.customName ?? 'Alimento'}
                      </Text>
                      {equivalence ? (
                        <>
                          <Text className="text-xs font-semibold leading-5 text-body">
                            {equivalence.label}
                          </Text>
                          {equivalence.note ? (
                            <Text className="text-xs leading-5 text-muted">{equivalence.note}</Text>
                          ) : null}
                          {equivalence.warning ? (
                            <View className="mt-0.5 flex-row items-start gap-1">
                              {/* Color imperativo (prop de SVG): el token `warning` del tema, que
                                  es el mismo que pinta `text-warning-700` en la línea de al lado. */}
                              <AlertTriangle color={theme.warning} size={12} style={{ marginTop: 3 }} />
                              <Text className="min-w-0 flex-1 text-xs font-medium leading-5 text-warning-700">
                                {equivalence.warning}
                              </Text>
                            </View>
                          ) : null}
                        </>
                      ) : sub.quantity != null && sub.unit ? (
                        <Text className="text-xs leading-5 text-muted">
                          {sub.quantity + ' ' + sub.unit}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={'Quitar reemplazo ' + (sub.displayName ?? sub.customName ?? '')}
                      onPress={() => {
                        if (subsTarget) handleRemoveSubstitution(subsTarget, sub, subIndex)
                      }}
                      className="h-11 w-11 items-center justify-center rounded-control"
                    >
                      <Trash2 color={theme.destructive} size={17} />
                    </Pressable>
                  </View>
                )
              })}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={EDITOR_COPY.addSubstitution}
            accessibilityState={{ disabled: subsList.length >= MAX_ITEM_SUBSTITUTIONS }}
            disabled={subsList.length >= MAX_ITEM_SUBSTITUTIONS}
            onPress={() => {
              if (!subsTarget) return
              setSearchTarget({ mode: 'substitution', ...subsTarget })
              setSubsTarget(null)
            }}
            className={
              'min-h-12 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3 ' +
              (subsList.length >= MAX_ITEM_SUBSTITUTIONS ? 'opacity-50' : '')
            }
          >
            <ListPlus color={theme.textSecondary} size={16} />
            <Text className="text-sm font-semibold text-strong">{EDITOR_COPY.addSubstitution}</Text>
          </Pressable>
          {subsList.length >= MAX_ITEM_SUBSTITUTIONS ? (
            <Text className="text-xs leading-5 text-muted">
              {EDITOR_COPY.substitutionLimit(MAX_ITEM_SUBSTITUTIONS)}
            </Text>
          ) : null}
        </View>
      </Sheet>

      {/* Duplicar ESTE dia como otro (W2): clona metas y franjas del dia elegido, no del base. */}
      <Sheet
        open={duplicateDayVariant !== null}
        onClose={() => setDuplicateDayKey(null)}
        nativeModal
        dynamicSizing
        title={EDITOR_COPY.duplicateDayTitle}
        accessibilityLabel={EDITOR_COPY.duplicateDayTitle}
      >
        <View className="gap-3">
          <Text className="text-xs leading-5 text-muted">{EDITOR_COPY.duplicateDayHint}</Text>
          <DayPickerRow
            selected={[]}
            taken={takenDays}
            onToggle={(dayOfWeek) => {
              if (duplicateDayVariant) handleDuplicateDay(duplicateDayVariant.key, dayOfWeek)
            }}
          />
        </View>
      </Sheet>

      {/* Copiar el dia a VARIOS dias (W3a): modo Reemplazar/Sumar + quick-select + aviso previo. */}
      <Sheet
        open={copyDayVariant !== null}
        onClose={() => setCopyDayKey(null)}
        nativeModal
        dynamicSizing
        title={EDITOR_COPY.copyDayTitle(copyDayVariant?.label ?? '')}
        accessibilityLabel={EDITOR_COPY.copyDayTitle(copyDayVariant?.label ?? '')}
      >
        <View className="gap-3">
          <Text className="text-xs leading-5 text-muted">{EDITOR_COPY.copyDayHint}</Text>
          <View className="flex-row gap-2">
            {(
              [
                ['replace', EDITOR_COPY.copyDayModeReplace],
                ['append', EDITOR_COPY.copyDayModeAppend],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: copyDayMode === value }}
                accessibilityLabel={label}
                onPress={() => setCopyDayMode(value)}
                className={
                  'min-h-11 flex-1 items-center justify-center rounded-control border px-3 ' +
                  (copyDayMode === value ? 'border-primary bg-primary/10' : 'border-default bg-surface-card')
                }
              >
                <Text
                  className={
                    'text-sm font-semibold ' + (copyDayMode === value ? 'text-primary' : 'text-strong')
                  }
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Quick-select: presets con nombre + "proximos N" relativo (solo con dia de origen). */}
          <View className="flex-row flex-wrap gap-1.5">
            {COPY_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={preset.label}
                onPress={() =>
                  setCopyDayDays(
                    daysForCopyPreset(preset, {
                      takenDays: new Set(takenDays),
                      sourceDayOfWeek: copyDayVariant?.dayOfWeek ?? null,
                    })
                      .map((day) => day.dayOfWeek)
                      .filter((day) => day !== copyDayVariant?.dayOfWeek),
                  )
                }
                className="min-h-11 items-center justify-center rounded-pill border border-default bg-surface-card px-3"
              >
                <Text className="text-xs font-semibold text-strong">{preset.label}</Text>
              </Pressable>
            ))}
            {copyDaySourceDow != null
              ? NEXT_DAYS_QUICK_PICKS.map((count) => (
                  <Pressable
                    key={count}
                    accessibilityRole="button"
                    accessibilityLabel={EDITOR_COPY.copyDayNextDays(count)}
                    onPress={() =>
                      setCopyDayDays(
                        nextDaysFrom(copyDaySourceDow, count).filter((day) => day !== copyDaySourceDow),
                      )
                    }
                    className="min-h-11 items-center justify-center rounded-pill border border-default bg-surface-card px-3"
                  >
                    <Text className="text-xs font-semibold text-strong">
                      {EDITOR_COPY.copyDayNextDays(count)}
                    </Text>
                  </Pressable>
                ))
              : null}
          </View>

          <DayPickerRow
            selected={copyDayDays}
            taken={copyDaySourceDow != null ? [copyDaySourceDow] : []}
            onToggle={(dayOfWeek) =>
              setCopyDayDays((current) =>
                current.includes(dayOfWeek)
                  ? current.filter((day) => day !== dayOfWeek)
                  : [...current, dayOfWeek],
              )
            }
          />

          {copyDayWarning ? (
            <View className="flex-row items-start gap-2 rounded-control border border-warning-500/30 bg-warning-500/10 px-3 py-2">
              <AlertTriangle color={theme.warning} size={14} />
              <Text className="min-w-0 flex-1 text-xs leading-5 text-body">{copyDayWarning}</Text>
            </View>
          ) : null}

          <NutritionMotionButton
            accessibilityLabel={EDITOR_COPY.copyDayCta(Math.max(copyDayEffectiveCount, 1))}
            disabled={copyDayDays.length === 0 || copyDayEffectiveCount === 0}
            onPress={handleCopyDay}
          >
            {EDITOR_COPY.copyDayCta(Math.max(copyDayEffectiveCount, 1))}
          </NutritionMotionButton>
        </View>
      </Sheet>

      {/* FD5 — alta de días: multi-select Lu-Do + origen del contenido. Sin Pro, upsell. */}
      <Sheet
        open={addDayOpen}
        onClose={() => setAddDayOpen(false)}
        nativeModal
        dynamicSizing
        title={QUICK_EDIT_COPY.addDayTitle}
        accessibilityLabel={QUICK_EDIT_COPY.addDayTitle}
      >
        {!hasNutritionPro ? (
          <View className="gap-3">
            <View className="flex-row items-start gap-2">
              <Lock color={theme.primary} size={18} />
              <Text className="min-w-0 flex-1 text-sm leading-5 text-body">
                {QUICK_EDIT_COPY.multiDayLocked}
              </Text>
            </View>
            <NutritionMotionButton
              accessibilityLabel="Ver módulos"
              onPress={() => {
                setAddDayOpen(false)
                router.push('/coach/modules')
              }}
            >
              Ver módulos
            </NutritionMotionButton>
          </View>
        ) : (
          <View className="gap-3">
            <Text className="text-xs leading-5 text-muted">{QUICK_EDIT_COPY.addDayHint}</Text>
            <DayPickerRow
              selected={addDays}
              taken={takenDays}
              onToggle={(dayOfWeek) =>
                setAddDays((current) =>
                  current.includes(dayOfWeek)
                    ? current.filter((day) => day !== dayOfWeek)
                    : [...current, dayOfWeek],
                )
              }
            />
            <View className="gap-1.5">
              <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
                {QUICK_EDIT_COPY.addDaySourceLabel}
              </Text>
              {(
                [
                  ['clone', QUICK_EDIT_COPY.addDaySourceClone],
                  ['empty', QUICK_EDIT_COPY.addDaySourceEmpty],
                ] as const
              ).map(([value, label]) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: addSource === value }}
                  accessibilityLabel={label}
                  onPress={() => setAddSource(value)}
                  className={
                    'min-h-12 flex-row items-center justify-center rounded-control border px-3 ' +
                    (addSource === value
                      ? 'border-primary bg-primary/10'
                      : 'border-default bg-surface-card')
                  }
                >
                  <Text
                    className={
                      'text-sm font-semibold ' + (addSource === value ? 'text-primary' : 'text-strong')
                    }
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <NutritionMotionButton
              accessibilityLabel={addDayCta(addDays.length)}
              disabled={addDays.length === 0}
              onPress={handleAddDays}
            >
              {addDayCta(addDays.length)}
            </NutritionMotionButton>
            {addDays.length === 0 ? (
              <Text className="text-xs leading-5 text-muted">
                {QUICK_EDIT_COPY.addDayEmptySelection}
              </Text>
            ) : null}
          </View>
        )}
      </Sheet>

      {/* FD5 — menú del día: cambiar día / renombrar / eliminar (el base solo se renombra). */}
      <Sheet
        open={dayMenuVariant !== null}
        onClose={() => setDayMenuKey(null)}
        nativeModal
        dynamicSizing
        title={dayMenuVariant?.label ?? QUICK_EDIT_COPY.dayMenuTitle}
        accessibilityLabel={QUICK_EDIT_COPY.dayMenuTitle}
      >
        <View className="gap-3">
          {dayMenuVariant && !dayMenuVariant.isDefault ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={QUICK_EDIT_COPY.changeDay}
              onPress={() => {
                setChangeDayKey(dayMenuVariant.key)
                setDayMenuKey(null)
              }}
              className="min-h-12 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3"
            >
              <CalendarDays color={theme.textSecondary} size={16} />
              <Text className="text-sm font-semibold text-strong">{QUICK_EDIT_COPY.changeDay}</Text>
            </Pressable>
          ) : null}
          {/* Editor unico (W2/W3a): duplicar este dia como otro, y copiarlo a varios dias en un
              gesto. El quick-edit clasico no las ofrece (gate `state.meta`). */}
          {state.meta && dayMenuVariant ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={EDITOR_COPY.duplicateDay}
              onPress={() => {
                setDuplicateDayKey(dayMenuVariant.key)
                setDayMenuKey(null)
              }}
              className="min-h-12 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3"
            >
              <CopyCheck color={theme.textSecondary} size={16} />
              <Text className="text-sm font-semibold text-strong">{EDITOR_COPY.duplicateDay}</Text>
            </Pressable>
          ) : null}
          {state.meta && dayMenuVariant && dayMenuVariant.slots.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={EDITOR_COPY.copyDayMenu}
              onPress={() => {
                setCopyDayKey(dayMenuVariant.key)
                setCopyDayMode('replace')
                setCopyDayDays([])
                setDayMenuKey(null)
              }}
              className="min-h-12 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3"
            >
              <CalendarRange color={theme.textSecondary} size={16} />
              <Text className="text-sm font-semibold text-strong">{EDITOR_COPY.copyDayMenu}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={QUICK_EDIT_COPY.renameDay}
            onPress={() => {
              if (!dayMenuVariant) return
              setRenameDraft(dayMenuVariant.label)
              setRenameKey(dayMenuVariant.key)
              setDayMenuKey(null)
            }}
            className="min-h-12 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3"
          >
            <Pencil color={theme.textSecondary} size={16} />
            <Text className="text-sm font-semibold text-strong">{QUICK_EDIT_COPY.renameDay}</Text>
          </Pressable>
          {dayMenuVariant && !dayMenuVariant.isDefault ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={QUICK_EDIT_COPY.removeDay}
              onPress={() => handleRemoveDay(dayMenuVariant)}
              className="min-h-12 flex-row items-center gap-2 rounded-control border border-danger-500/40 bg-surface-card px-3"
            >
              <Trash2 color={theme.destructive} size={16} />
              <Text className="text-sm font-semibold text-danger-600">{QUICK_EDIT_COPY.removeDay}</Text>
            </Pressable>
          ) : null}
          {dayMenuVariant?.isDefault ? (
            <View className="flex-row items-start gap-1.5">
              <Info color={theme.textSecondary} size={14} />
              <Text className="min-w-0 flex-1 text-xs leading-5 text-muted">
                {QUICK_EDIT_COPY.baseDayHint}
              </Text>
            </View>
          ) : null}
        </View>
      </Sheet>

      {/* FD5 — cambiar el día de una variante específica (días ocupados deshabilitados). */}
      <Sheet
        open={changeDayVariant !== null}
        onClose={() => setChangeDayKey(null)}
        nativeModal
        dynamicSizing
        title={QUICK_EDIT_COPY.changeDayTitle}
        accessibilityLabel={QUICK_EDIT_COPY.changeDayTitle}
      >
        <View className="gap-3">
          <Text className="text-xs leading-5 text-muted">{QUICK_EDIT_COPY.changeDayHint}</Text>
          <DayPickerRow
            selected={changeDayVariant?.dayOfWeek == null ? [] : [changeDayVariant.dayOfWeek]}
            taken={takenDays}
            onToggle={(dayOfWeek) => {
              if (!changeDayVariant) return
              dispatch({ type: 'SET_VARIANT_DAY', variantKey: changeDayVariant.key, dayOfWeek })
              setChangeDayKey(null)
            }}
          />
        </View>
      </Sheet>

      {/* FD5 — renombrar el día (el nombre manual gana sobre la etiqueta automática). */}
      <Sheet
        open={renameKey !== null}
        onClose={() => setRenameKey(null)}
        nativeModal
        dynamicSizing
        title={QUICK_EDIT_COPY.renameDayTitle}
        accessibilityLabel={QUICK_EDIT_COPY.renameDayTitle}
      >
        <View className="gap-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
            {QUICK_EDIT_COPY.dayNameLabel}
          </Text>
          <TextInput
            accessibilityLabel={QUICK_EDIT_COPY.dayNameLabel}
            value={renameDraft}
            onChangeText={setRenameDraft}
            maxLength={VARIANT_LABEL_MAX}
            placeholder={QUICK_EDIT_COPY.dayNamePlaceholder}
            placeholderTextColor={theme.mutedForeground}
            className="min-h-12 rounded-control border border-default bg-surface-card px-3 text-base text-strong"
          />
          <NutritionMotionButton
            accessibilityLabel={QUICK_EDIT_COPY.renameDay}
            disabled={renameDraft.trim().length === 0}
            onPress={() => {
              if (renameKey === null || renameDraft.trim().length === 0) return
              dispatch({ type: 'SET_VARIANT_LABEL', variantKey: renameKey, value: renameDraft.trim() })
              setRenameKey(null)
            }}
          >
            {QUICK_EDIT_COPY.renameDay}
          </NutritionMotionButton>
        </View>
      </Sheet>

      {/* CE-5 — menú de la franja: copiar a otros días (hoja multi-select) o aplicar a todos.
          Solo existe en planes multi-día: con un solo día no hay destino posible. */}
      <Sheet
        open={slotMenu !== null && slotMenuSlot !== null}
        onClose={() => setSlotMenu(null)}
        nativeModal
        dynamicSizing
        title={slotMenuSlot?.name.trim() || QUICK_EDIT_COPY.slotMenuTitle}
        accessibilityLabel={QUICK_EDIT_COPY.slotMenuTitle}
      >
        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={QUICK_EDIT_COPY.copySlot}
            disabled={publishing}
            onPress={() => {
              if (!slotMenu) return
              setCopySource(slotMenu)
              setCopyTargetKeys([])
              setSlotMenu(null)
            }}
            className="min-h-12 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3"
          >
            <Copy color={theme.textSecondary} size={16} />
            <Text className="text-sm font-semibold text-strong">{QUICK_EDIT_COPY.copySlot}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={QUICK_EDIT_COPY.copySlotAll}
            disabled={publishing}
            onPress={() => {
              if (!slotMenu) return
              applySlotCopy(
                slotMenu,
                state.variants.filter((v) => v.key !== slotMenu.variantKey).map((v) => v.key),
              )
            }}
            className="min-h-12 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3"
          >
            <CopyCheck color={theme.textSecondary} size={16} />
            <Text className="text-sm font-semibold text-strong">{QUICK_EDIT_COPY.copySlotAll}</Text>
          </Pressable>
          {/* «Eliminar franja» vive ACÁ, como en la web. Antes era un tacho suelto en el header,
              a un toque de distancia del control de contraer (QA del dueño 17-08). Va última y
              separada por el filete: es la única destructiva de la hoja. `handleRemoveSlot` ya trae
              su propia confirmación. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Eliminar franja ${slotMenuSlot?.name || ''}`.trim()}
            disabled={publishing}
            onPress={() => {
              if (!slotMenu) return
              const target = slotMenu
              setSlotMenu(null)
              handleRemoveSlot(target.variantKey, target.slotKey)
            }}
            className="mt-1 min-h-12 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3"
          >
            <Trash2 color={theme.destructive} size={16} />
            <Text className="text-sm font-semibold text-danger-600">Eliminar franja</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* CE-5 — destinos de la copia: multi-select de los OTROS días, cada uno diciendo por
          adelantado si reemplaza su franja homónima o si se agrega al final. */}
      <Sheet
        open={copySource !== null && copySourceSlot !== null}
        onClose={() => setCopySource(null)}
        nativeModal
        dynamicSizing
        title={QUICK_EDIT_COPY.copySlotTitle}
        accessibilityLabel={QUICK_EDIT_COPY.copySlotTitle}
        // CTA anclado: con 6 destinos la lista scrollea sola en vez de empujar el botón fuera
        // de la hoja (mismo problema que el `max-h` de la web, resuelto con el footer del DS).
        footer={
          <NutritionMotionButton
            accessibilityLabel={copySlotCta(copyTargetKeys.length)}
            disabled={publishing || copyTargetKeys.length === 0}
            onPress={() => {
              if (!copySource) return
              applySlotCopy(copySource, copyTargetKeys)
            }}
          >
            {copySlotCta(copyTargetKeys.length)}
          </NutritionMotionButton>
        }
      >
        <View className="gap-3">
          <Text className="text-xs leading-5 text-muted">{QUICK_EDIT_COPY.copySlotHint}</Text>
          {copyCandidates.map(({ variant, replaces }) => {
            const checked = copyTargetKeys.includes(variant.key)
            const dayCaption = variant.isDefault
              ? QUICK_EDIT_COPY.baseDayEyebrow
              : (formatNutritionDayOfWeek(variant.dayOfWeek) ?? QUICK_EDIT_COPY.specificDayEyebrow)
            return (
              <Pressable
                key={variant.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={
                  variant.label + (replaces ? ' — ' + QUICK_EDIT_COPY.copySlotReplaces : '')
                }
                onPress={() =>
                  setCopyTargetKeys((current) =>
                    current.includes(variant.key)
                      ? current.filter((key) => key !== variant.key)
                      : [...current, variant.key],
                  )
                }
                className={
                  'min-h-12 flex-row items-center gap-2.5 rounded-control border px-3 py-2 ' +
                  (checked ? 'border-primary bg-primary/10' : 'border-default bg-surface-card')
                }
              >
                {checked ? <Check color={theme.primary} size={16} /> : null}
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-strong" numberOfLines={1}>
                    {variant.label}
                  </Text>
                  <Text className="text-xs leading-4 text-muted" numberOfLines={1}>
                    {dayCaption}
                  </Text>
                </View>
                {replaces ? (
                  <View className="rounded-pill border border-subtle bg-surface-sunken px-2 py-0.5">
                    <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {QUICK_EDIT_COPY.copySlotReplaces}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </View>
      </Sheet>
    </View>
    </TourTargetsProvider>
  )
}

/**
 * Tira Lu-Do de UNA variante dentro del modo edición (QW-13). Resuelve la variante por `id`
 * para no arrastrar un non-null assertion al render del día; si no la encuentra (imposible con
 * el estado actual, pero barato de sostener) no pinta nada.
 */
function VariantWeekStrip({
  variants,
  variantKey,
  todayIso,
}: {
  variants: readonly WeekVariantLike[]
  variantKey: string
  todayIso: string
}) {
  const variant = variants.find((candidate) => candidate.id === variantKey)
  if (!variant) return null
  return <DayVariantWeekStrip variants={variants} variant={variant} todayIso={todayIso} />
}

/**
 * Índice de días (P1-1), espejo nativo del `DayAnchorNav` web: fila de anclas arriba de la
 * pila para saltar a un día sin scrollear a ciegas. NO selecciona ni filtra nada — el
 * contenido sigue siendo el plan completo; solo mueve el scroll.
 *
 * Cada chip lleva el día de semana corto (o "Base") + la etiqueta libre del coach truncada,
 * así que sirve igual con nombres tipo "Día de entrenamiento". El día que aplica HOY va con
 * acento, mismo patrón que `DayVariantWeekStrip`.
 */
function DayAnchorRow({
  variants,
  todayVariantKey,
  activeVariantKey = null,
  onJump,
}: {
  variants: readonly QeVariant[]
  todayVariantKey: string | null
  /** Editor: dia en edicion (chip marcado). Ausente = indice de anclas del quick-edit clasico. */
  activeVariantKey?: string | null
  onJump: (variantKey: string) => void
}) {
  return (
    <ScrollView
      horizontal
      // Indicador VISIBLE a propósito: la barra de días del builder lo apaga y por eso nadie
      // sabe que hay más días fuera de pantalla (hallazgo H-05 de la auditoría).
      keyboardShouldPersistTaps="handled"
      className="mt-2 min-h-12"
      contentContainerClassName="items-center gap-1.5 pr-4"
      accessibilityLabel={QUICK_EDIT_COPY.dayIndexLabel}
    >
      {variants.map((variant) => {
        const isToday = todayVariantKey != null && variant.key === todayVariantKey
        // En el editor manda el dia ACTIVO: marcar el de hoy mientras se edita otro mentiria
        // sobre que se esta tocando.
        const isMarked = activeVariantKey != null ? variant.key === activeVariantKey : isToday
        // Sin día fijo y sin ser la base (dato inválido, tolerado en lectura) el chip se queda
        // solo con la etiqueta: no se inventa un día de semana.
        const short = variant.isDefault
          ? QUICK_EDIT_COPY.baseDayShort
          : formatNutritionDayOfWeek(variant.dayOfWeek, { short: true })
        return (
          <Pressable
            key={variant.key}
            accessibilityRole="button"
            accessibilityLabel={
              dayIndexJump(variant.label) + (isToday ? ' — ' + QUICK_EDIT_COPY.dayAppliesToday : '')
            }
            onPress={() => onJump(variant.key)}
            hitSlop={4}
            className={
              'min-h-11 flex-row items-center gap-1.5 rounded-pill border px-3 ' +
              (isMarked ? 'border-primary bg-primary/10' : 'border-subtle bg-surface-card')
            }
          >
            {short ? (
              <Text className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                {short}
              </Text>
            ) : null}
            <Text
              className={'text-sm font-semibold ' + (isMarked ? 'text-primary' : 'text-body')}
              numberOfLines={1}
              style={{ maxWidth: 140 }}
            >
              {variant.label}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

/**
 * Tira Lu-Do seleccionable (FD5), espejo del `DayPicker` web. `taken` = días que ya tienen
 * su propia variante: quedan deshabilitados salvo que sean el día actualmente seleccionado
 * (caso "Cambiar día", donde el propio día de la variante se muestra activo).
 */
function DayPickerRow({
  selected,
  taken,
  onToggle,
}: {
  selected: readonly number[]
  taken: readonly number[]
  onToggle: (dayOfWeek: number) => void
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {NUTRITION_WEEK_ORDER.map((dayOfWeek) => {
        const isSelected = selected.includes(dayOfWeek)
        const isTaken = taken.includes(dayOfWeek) && !isSelected
        return (
          <Pressable
            key={dayOfWeek}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: isTaken }}
            accessibilityLabel={
              (formatNutritionDayOfWeek(dayOfWeek) ?? '') +
              (isTaken ? ' — ' + QUICK_EDIT_COPY.dayTaken : '')
            }
            disabled={isTaken}
            onPress={() => onToggle(dayOfWeek)}
            className={
              'h-12 min-w-12 flex-1 items-center justify-center rounded-control border px-2 ' +
              (isSelected
                ? 'border-primary bg-primary/15'
                : isTaken
                  ? 'border-subtle bg-surface-sunken opacity-60'
                  : 'border-default bg-surface-card')
            }
          >
            <Text
              className={
                'text-sm font-semibold ' +
                (isSelected ? 'text-primary' : isTaken ? 'text-muted' : 'text-strong')
              }
            >
              {formatNutritionDayOfWeek(dayOfWeek, { short: true })}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
