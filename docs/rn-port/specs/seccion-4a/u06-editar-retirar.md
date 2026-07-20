# 4A-06 — Editar cantidad / Retirar registro (correcciones)

Archivos RN: `apps/mobile/app/alumno/nutrition-v2/index.tsx` (bloque `EntryActionSheet` 1025-1115 y
handlers `onEditEntry`/`onVoidEntry` 389-481). Comparte archivo con 4A-02/03/04/05 → wave separada.
Referencia web: `TodayExperience.tsx:940-1062` (`EditQuantityDialog`, `VoidEntryDialog`) +
`nutrition-today.logic.ts` (`buildCorrectionPayload`, `buildVoidPayload`).

## Web (fuente de verdad)

- **Dos diálogos separados** (lápiz → editar; papelera → retirar), no un sheet combinado.
- Editar (`940-1004`): título "Editar cantidad"; descripción "{nombre} · registrado como {qty} {unit}";
  input "Nueva cantidad ({unit})" decimal; input "Motivo del cambio" con placeholder
  "Ej: comí un poco menos"; ayuda "Mínimo 3 caracteres. Se conserva el registro original.";
  submit "Guardar corrección" deshabilitado hasta cantidad válida Y motivo ≥3 chars; botón "Cancelar".
- Retirar (`1006-1062`): título "Retirar registro"; descripción "{nombre} · {qty} {unit}"; párrafo
  "El registro dejará de contar en tu día, pero se conserva en el historial para tu coach.";
  input "Motivo" placeholder "Ej: lo registré por error", mínimo 3; submit `tone="danger"`
  "Retirar registro"; botón "Cancelar".
- Errores del server se muestran DENTRO del diálogo (`DialogError`, 427-439) y el diálogo NO se
  cierra en fallo (`TodayExperience.tsx:114-121`).

## RN actual y deltas

1. **Sheet combinado sin motivo.** RN `EntryActionSheet`: un solo sheet con cantidad + unidad
   (`g|un` / `ml|un`) y dos botones "Guardar cambios" / "Retirar registro". **Faltan** ambos campos
   de motivo, la ayuda "Mínimo 3 caracteres…", la descripción con la cantidad original, el párrafo
   explicativo del retiro y la confirmación separada del retiro (en RN retirar es un tap directo sin
   motivo ni confirmación). **Delta funcional mayor** (el motivo viaja al coach en la corrección web).
2. **Unidad editable.** Web NO permite cambiar la unidad al corregir (solo cantidad, en la unidad
   original — input label "Nueva cantidad ({entry.unit})"). RN agrega selector de unidad
   (`index.tsx:1048,1074-1093`). **Delta RN-extra**: retirar el selector; la corrección conserva la unidad.
3. **Copys de botón.** Web "Guardar corrección" vs RN "Guardar cambios". Delta de copy.
4. **Manejo de error.** Web: error humanizado dentro del diálogo, diálogo abierto; RN: `Alert.alert`
   con mensaje crudo y sheet ya cerrado (`setActionEntry(null)` ANTES de enviar, `index.tsx:392,424`).
   **Delta de flujo**: en fallo definitivo el alumno pierde el contexto. Cierre: no cerrar hasta
   outcome; error dentro del sheet con copy humanizado (mismos textos que `humanizeStudentWriteError`).
5. **Payload.** RN `buildEditIntakeCorrection`/`buildVoidIntakeCorrection` deben transportar el motivo
   (verificar contra `intake.actions.ts` y el mutation schema; si el canal RN no acepta `reason`,
   documentarlo como bloqueo de backend ANTES de implementar UI).
6. **Optimista + cola offline en correcciones** (RN 436-445, 394): adaptación nativa conservada.

## Comprobación objetiva

Editar y retirar un registro en web móvil y RN: mismos títulos, descripciones, campos (cantidad +
motivo), validación (motivo <3 deshabilita), tono danger en retirar, error de server visible dentro
del diálogo sin cerrarse.
