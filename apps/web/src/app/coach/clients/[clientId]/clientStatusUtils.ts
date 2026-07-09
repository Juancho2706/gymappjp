// Estado unificado del alumno para el Hero de la ficha (Fase 1 quick-win #1).
// La logica (funcion PURA) vive ahora en @eva/profile-analytics (fuente unica, E3-09) y se
// re-exporta aca para no romper a los consumidores existentes (ClientProfileHero).
export { deriveClientStatus } from '@eva/profile-analytics'
export type { ClientStatus, ClientStatusInput, ClientStatusLevel } from '@eva/profile-analytics'
