'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Identidad de Sentry del ALUMNO — espejo mínimo de `IdentifyOnMount`, que sólo cubre al coach.
 *
 * Sin esto, TODOS los issues de la superficie `/c` llegaban con «Users Impacted: 0». Eso no era un
 * dato sino un ARTEFACTO: `Sentry.setUser` no se llamaba nunca fuera del panel del coach, así que
 * un issue real del alumno (el fallback del Despegue, la cola offline de nutrición) se
 * despriorizaba solo y no se podía saber si eran 2 dispositivos o 15 alumnos distintos.
 *
 * Qué viaja: SOLO el UUID de `auth.users.id` — un pseudónimo opaco, sin email ni nombre.
 * Deliberadamente NO toca PostHog: la identificación de personas exige el consentimiento explícito
 * (ver `IdentifyOnMount`), y el alumno no tiene ese banner en su árbol. Sentry sí recibe el id
 * siempre porque es monitoreo de errores del propio servicio.
 */
export function IdentifyStudentOnMount({ userId }: { userId: string }) {
    useEffect(() => {
        Sentry.setUser({ id: userId })
    }, [userId])

    return null
}
