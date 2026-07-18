# VERIFY/FIX — `directory-create-import`

Fecha: 2026-07-12
Fuente de verdad viva: `CreateClientModal.tsx`, `clients/import/_components/*`
y `import/_actions/import.actions.ts` de `apps/web`.

## Resultado

Unidad cerrada a nivel código/spec. El alta individual recupera los tres estados
web (formulario, éxito con WhatsApp y límite de plan). El importador recupera
XLSX/XLS/CSV, mapeo, preview, consentimiento, resultado por fila y el upsell de
Starter. Ambos respetan el workspace activo elegido en RN y el servidor vuelve
a autorizar ese scope contra la base de datos.

## Alta individual

- Formulario con copy web actual, nombre, email, teléfono, fecha opcional,
  contraseña visible/ocultable y confirmación real de edad Ley 21.719.
- Validación Zod local más validación calendario `AAAA-MM-DD`; errores se pintan
  junto al campo sin cambiar el árbol del `TextInput` por focus.
- Pending bloquea backdrop, X y Android Back para impedir un éxito tardío sobre
  un modal ya cerrado.
- Éxito conserva nombre/teléfono/login URL y ofrece “Enviar link por WhatsApp” u
  “Omitir por ahora”; sin teléfono refresca la cartera y cierra.
- `UPGRADE_REQUIRED` muestra el límite y las acciones “Ver planes →” / “Ahora
  no”. Un `maxClients=0` transitorio no reemplaza el límite real del endpoint.
- El refresh posterior al alta corre en background: no desmonta el estado de
  éxito antes de que el coach pueda usar WhatsApp.

## Importación

- `DocumentPicker` + SheetJS leen `.xlsx`, `.xls` y `.csv`; límites 5 MB y 1.000
  filas, además del pegado CSV y descarga del template.
- Stepper, auto/sugerido, campos requeridos, tabla de preview, estados por fila,
  resumen, tiempo estimado, consentimiento Ley 19.628/21.719 y DPA alineados con
  el wizard web actual.
- Free standalone ve el upsell “Importar Alumnos desde Excel” con copy/features
  y CTA de Starter del web; tier aún no resuelto muestra carga y un fallo de
  perfil degrada cerrado. Enterprise coach se bloquea antes del wizard; owner y
  admin pueden continuar. El servidor conserva el gate autoritativo.
- Un único endpoint batch crea `client_imports`, sanitiza celdas, deduplica,
  procesa chunks de 10, genera contraseñas criptográficas y devuelve resumen y
  errores con el número de fila original.
- La fecha ausente queda `null`; no se inventa un día UTC ni Santiago.
- El body incluye el workspace RN activo. Standalone, team y enterprise se
  validan por membresía/rol en servidor; un ID manipulado u obsoleto devuelve
  `WORKSPACE_MISMATCH`.
- `NativeDialog` desmonta el wizard al cerrar. Durante SheetJS/import bloquea X
  y Android Back; al reabrir siempre parte en el paso 1.

## Tokens y adaptaciones RN

- Superficies, texto, bordes, radios y CTAs usan roles del theme/NativeWind.
- Verde WhatsApp `#25D366` se conserva por ser color oficial y excepción citada
  por la spec/web.
- Selector web se traduce a chips tocables; dialog/ruta se traduce a modal
  nativo centrado con scroll acotado. Se preservan contenido y efectos.
- No se tocó `apps/mobile/app/alumno` ni `components/alumno`.

## Gates

- `pnpm exec tsc --noEmit` mobile — PASS.
- `pnpm exec tsc --noEmit` web — PASS.
- `node scripts/check-token-parity.mjs` — PASS, 86/86.
- `pnpm exec expo export --platform android` — PASS.
- Smoke device light/dark × EVA/custom — pendiente de build/device.
