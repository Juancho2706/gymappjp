// Motor determinista de triage del perfil (plan B3) — sin IA.
// La logica vive ahora en @eva/profile-analytics (fuente unica web + mobile, E3-09) y se re-exporta
// aca para no romper a los consumidores (ClientProfileDashboard, ProfileTopAlertBanner).
export { getProfileTopAlert } from '@eva/profile-analytics'
export type { ProfileAlertType, ProfileTopAlert } from '@eva/profile-analytics'
