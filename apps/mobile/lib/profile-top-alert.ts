// Reexport de @eva/profile-analytics — el motor de triage del perfil vive en el package compartido
// (fuente unica web + mobile, E3-09). Consumidores mobile importan desde aca sin cambios.
export { getProfileTopAlert } from '@eva/profile-analytics'
export type { ProfileAlertType, ProfileTopAlert } from '@eva/profile-analytics'
