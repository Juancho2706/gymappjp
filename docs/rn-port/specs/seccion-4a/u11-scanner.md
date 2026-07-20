# 4A-11 — Scanner de código de barras

Archivo RN: `apps/mobile/app/alumno/nutrition-v2/scanner.tsx`. Disjunto.
Referencias web: `nutrition-v2/scanner/page.tsx` + `components/nutrition-v2/FoodScannerClient.tsx`
+ `missing-food-report-key.ts` + `scanned-food-intake.logic.ts`.

## Afirmaciones y deltas

1. **Registro del escaneado con cantidad/unidad/franja (FALTA).**
   Web `FoodScannerClient.tsx:337-524`: CTA "Registrar" abre `RegisterScannedFoodDialog` con cantidad
   (default servingSize), unidad `[servingUnit,'g','ml','porción','unidad']`, select "Franja (opcional)"
   con las franjas del día (contexto `registration` armado en `scanner/page.tsx:38-47`), payload con
   `captureMethod 'barcode'`; al registrar → "Registrado en tu día" + link "Ver mi día" (614-633).
   RN `scanner.tsx:123-176,431-444`: "Agregar al día" registra DIRECTO con servingSize y unidad g/ml,
   sin diálogo, sin franja, sin cantidad. **Delta funcional mayor.**
   Cierre: diálogo/sheet de cantidad+unidad+franja idéntico al de 4A-10, estado "Registrado en tu día"
   + acceso "Ver mi día" (navegar al Hoy).

2. **Idempotencia del reporte de faltante.**
   Web `FoodScannerClient.tsx:200-225` + `missing-food-report-key.ts`: clave ESTABLE por contenido
   (alumno+gtin+día) — reintento no duplica; el comentario web documenta que `Date.now()` estaba MAL.
   RN `scanner.tsx:282`: ``missing:{userId}:{gtin}:{Date.now()}`` — reproduce el bug corregido.
   **Delta funcional (bug).** Cierre: misma clave estable (helper compartido o copia con test).

3. **Errores del reporte/lookup.** Web: fallo del lookup → "No se pudo consultar el catálogo local…"
   (103); fallo del reporte → "No se pudo guardar el reporte del producto." (221).
   RN: lookup fallido deja `result=null` silencioso (91-92); reporte sin catch visible (270-287).
   Delta: estados de error visibles con copys web.

4. **Copys y estados del resultado.**
   - Inválido: paridad de título/copy; web con ilustración `error-amable` y CTA "Probar otro"
     (`FoodScannerClient.tsx:551-561`); RN "Escanear otro" sin ilustración (361-370). Delta copy+ilustración.
   - No encontrado: web descripción "Puedes reportarlo para revisión antes de incorporarlo al catálogo
     chileno." + ilustración `catalogo-vacio` + botones en fila (564-588); RN copy distinto
     ("…después de la revisión nutricional"), sin ilustración, botones apilados (373-396). Delta.
   - Encontrado: card tone success/warning + "Verificado"/"Pendiente de verificación" — paridad; en el
     diálogo web además badge ámbar "Pendiente de verificación" (475-479) → llega con el diálogo del punto 1.
5. **Header de la página.** Web `scanner/page.tsx:50-62`: eyebrow "Catálogo local Chile", título
   "Escanear producto", descripción "Consulta códigos EAN y UPC almacenados en EVA. La cámara nunca
   llama a un proveedor externo.", acción "Nutrición" con flecha de vuelta.
   RN `scanner.tsx:223-227`: descripción distinta ("EAN/UPC consultado únicamente en la base de datos
   de EVA."), SIN acción de volver. Delta copy + volver (con 4A-01 la pantalla queda bajo (tabs);
   igual necesita un back/acción explícita como web).
6. **Cámara.** Web: BarcodeDetector + getUserMedia con botones "Activar cámara"/"Reiniciar"/"Detener",
   panel 4:3 `bg-slate-950`, torch condicionado a capacidades (240-282).
   RN: expo-camera SIEMPRE activa hasta pausar por resultado, alto fijo h-72, torch siempre visible.
   Adaptación nativa legítima (expo-camera) — ESCRIBIRLA; el estado "pausado mientras revisas el
   resultado" (239-244) es un extra razonable de la adaptación. Sin cambio de código salvo decisión owner.
7. **Permiso de cámara.** RN 194-214 (panel permission + manual): sin contraparte web directa
   (web degrada con mensajes 143-148,176-183). Adaptación válida; copys ya es-CL.
8. **Deduplicación de scans** 2s: paridad (web 118-121; RN 100-105).
9. **Celebración scanner-hit** (RN 86-90): no existe en web. **RN-extra** → 4A-12.
10. **Atribución ODbL** (RN 399,428-430): adaptación legal escrita, se conserva.

## Comprobación objetiva

Escanear producto existente y uno inexistente en ambos lados: flujo registrar con franja, reporte
idempotente (2 taps → 1 fila en la tabla de reportes), copys/ilustraciones según lista.

## Veredicto (2026-07-19) — APLICADA a nivel código; pendiente QA device

Los 10 puntos, cerrados contra `scanner.tsx` + lógica pura hermana nueva
`apps/mobile/lib/nutrition-v2-scanner.logic.ts`:

1. **Registro con cantidad/unidad/franja** ✅ — "Agregar al día" directo ELIMINADO; la card
   found/pending gana CTA primario "Registrar" que abre `RegisterScannedFoodSheet`
   (espejo `RegisterScannedFoodDialog`, `FoodScannerClient.tsx:365-525`): cantidad default
   `String(servingSize)` sanitizada `[^0-9.]`, unidades `scannedFoodUnitOptions` =
   `[servingUnit,'g','ml','porción','unidad']` (web :389-391), franja "Sin franja" + franjas
   del día, mismo `canSubmit` (web :393-395), badge ámbar "Pendiente de verificación" en el
   resumen (web :475-479, tokens warning). Payload = `buildScannedFoodIntakeMutation`
   (espejo `buildScannedFoodIntakePayload`: source 'offplan', snapshot POR PORCIÓN del food,
   captureMethod 'barcode', planVersionId + daySnapshotId del contexto) con idempotency-key
   estable RN (clientId+deviceId+operationId) y cola offline por `submitRecordIntake`
   (recorded Y queued ⇒ registrado). Tras registrar: "Registrado en tu día" con check
   success (web emerald → rampa success del contrato) + "Ver mi día" que navega al hub
   (web :614-633; `revalidatePath` web no aplica en RN — navegación). Contexto de registro
   = read-model del Hoy reducido (`registrationContextFromToday`, espejo
   `scanner/page.tsx:38-47`), fetch al montar con fallback a la caché existente del Hoy;
   sin contexto ⇒ solo-consulta sin CTA (misma degradación web sin `registration`).
2. **Idempotencia del reporte** ✅ — `missingFoodReportKey` (copia 1:1 del canon web
   `missing-food-report-key.ts`, que tiene test allá; comentario anti-drift en la copia):
   clave `missing:{clientId}:{gtin}:{díaLocal}`; el `Date.now()` que reproducía el bug se
   fue. Mobile no tiene runner de tests configurado — la copia queda documentada como
   espejo del canon testeado (mismo patrón que `student-access-copy.ts`).
3. **Errores visibles** ✅ — estado `notice` (espejo `cameraError`): lookup fallido ⇒
   "No se pudo consultar el catálogo local. Revisa tu conexión." (web :103, el resultado
   ya no se borra en silencio); reporte fallido ⇒ catch con "No se pudo guardar el reporte
   del producto." (web :221; antes la promesa quedaba sin catch). Panel warning "Scanner
   disponible con alternativa manual" (web :308-315). En el sheet, error inline danger con
   `humanizeStudentWriteError` + fallback "No pudimos guardar tu registro…" (web :421-426).
4. **Copys/estados del resultado** ✅ — invalid: CTA "Probar otro" + ilustración
   `error-amable`; not-found: descripción web "Puedes reportarlo para revisión antes de
   incorporarlo al catálogo chileno." + ilustración `catalogo-vacio` + botones en fila
   (flex-row flex-wrap, web :573-585) + pending en el botón de reporte; found/pending: card
   success/warning con "Verificado"/"Pendiente de verificación" (ya paridad) y el badge del
   diálogo llegó con el punto 1. Ilustraciones cableadas al kit de 4A-07
   (`NutritionStatePanel illustration`).
5. **Header** ✅ — descripción web verbatim ("Consulta códigos EAN y UPC almacenados en
   EVA. La cámara nunca llama a un proveedor externo.") + acción "Nutrición" con ArrowLeft
   (espejo del Link `scanner/page.tsx:54-61`) vía `router.navigate` al hub.
6. **Cámara** — sin cambio; adaptación expo-camera + pausa por resultado ya escrita en el
   archivo (línea de "Scanner pausado…").
7. **Permiso** — sin cambio (adaptación válida).
8. **Dedup 2s** — sin cambio (paridad previa).
9. **Celebración scanner-hit** — conservada tal cual; su veredicto es de 4A-12
   (DECISIONES-OWNER #2).
10. **Atribución ODbL** — conservada.

Adaptaciones nativas escritas (en comentarios del código): `TodayModal` web → `Sheet
nativeModal` (gorhom 5.2.14 incompatible reanimated 4, gotcha de clase); `<select>` de
unidad/franja → pills seleccionables (patrón del selector de unidad de add-food-v2) con
las MISMAS opciones/defaults; `notice` se limpia al iniciar un lookup nuevo (en RN el
scanner sigue vivo tras un error; la web muere con la cámara detenida).

Gate corrido: `npx tsc --noEmit` mobile — archivos de la unidad sin errores.
Pendiente: QA device de la comprobación objetiva (registro con franja visible en el Hoy,
reporte con 2 taps = 1 fila en la tabla de reportes, offline ⇒ queued).
