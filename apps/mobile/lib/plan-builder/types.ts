// Los tipos del estado del builder viven en @eva/plan-builder (fuente de verdad única
// web+mobile, E5-01/E5-02). Se re-exportan acá para no romper los imports existentes de
// `./types` en el builder mobile (serialize.ts, skeleton.ts, componentes y pantalla).
//
// El BuilderBlock del paquete es la forma COMPLETA de web (incl. section_template_id +
// campos polimórficos) + el `_raw?` del passthrough mobile → el guardado no-destructivo de
// serialize.ts sigue funcionando y ahora el editor mobile ve todos los campos de web.
export type {
  BuilderSection,
  BuilderBlock,
  DayState,
  ProgramPhase,
  ProgramStructureType,
  DurationType,
  ProgramMeta,
} from '@eva/plan-builder'
