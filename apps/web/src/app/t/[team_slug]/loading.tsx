import { ClientLoadingShell } from '@/components/ui/EvaRouteLoader'

// Skeleton de carga del arbol nativo /t (login, consent, holding dashboard).
// loading.tsx no recibe params, asi que usa branding neutral de EVA: nunca filtra
// la marca personal del coach al alumno de pool mientras carga.
export default function TeamRouteLoading() {
    return <ClientLoadingShell top="route" />
}
