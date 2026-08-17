'use client'

/**
 * Guía Viva del Centro de Nutrición (SPEC `nutrition-onboarding-tour`) — el «?» del hub y su velo.
 *
 * Por qué es un componente propio y no vive dentro de `NutritionHubTabs`:
 *
 *  - D2 fija el lugar del «?» del hub: **inline junto al título «Centro de Nutrición»**, que lo
 *    pinta el shell (`NutritionPageShell`) y no las pestañas. Este componente entra por la ranura
 *    `actions` del shell, que es la única pieza de esa fila del encabezado que la página compone;
 *  - el «?» y el velo tienen que compartir el estado del tour (`useTourController`), así que
 *    conviene que los monte el MISMO componente. El velo se portalea al `<body>` y busca sus
 *    targets en todo el documento, así que dónde se lo declara no cambia nada de lo que ilumina.
 *
 * La página es un Server Component: no puede pasarle un `onClick` a un botón. Por eso el `coachId`
 * llega como prop (dato serializable) y el estado nace acá, del lado del cliente.
 */

import { useSearchParams } from 'next/navigation'
import { TourHelpButton, TourOverlay, tourSteps, useTourController } from '@/components/nutrition-v2'
import { parseTabParam } from './NutritionHubTabs'

/** Param de la URL que elige la pestaña; el hub lo lee igual en `NutritionHubTabs`. */
const TAB_PARAM = 'tab'

export function HubTourGuide({ coachId }: { coachId: string }) {
  const searchParams = useSearchParams()
  // D4: el auto-arranque es «al ENTRAR a la pestaña Alumnos». Acá se traduce a «la pestaña con la
  // que se montó la página es el roster»: si el coach llega con `?tab=plantillas` a mirar sus
  // plantillas, el tour del roster no le salta encima — queda a un click del «?». Es el MISMO
  // helper que usa el tablist para elegir su pestaña inicial, así que no pueden discrepar.
  //
  // El valor se lee una sola vez, en el primer render: `useTourController` lo congela al montar
  // (cambiar de pestaña después no auto-arranca nada, que es exactamente lo que pide la SPEC).
  const rosterFirst = parseTabParam(searchParams.get(TAB_PARAM)) === 'roster'
  const tour = useTourController({ tourId: 'hub', coachId, autoStart: rosterFirst })

  return (
    <>
      {/* El guion del hub es el mismo en las cuatro superficies (D1): no hay versión corta. La
          tarjeta sí cambia de forma sola bajo 768 (variante dock, la decide el motor). */}
      <TourHelpButton tourId="hub" coachId={coachId} variant="inline" onOpen={tour.start} />
      <TourOverlay steps={tourSteps('hub', false)} active={tour.active} onEnd={tour.end} />
    </>
  )
}
