import { ClientNav } from '@/components/client/ClientNav'
import {
    getStudentMovementNavEnabled,
    getStudentBodyCompositionNavEnabled,
    getStudentNutritionNavEnabled,
} from '../_data/client-root.queries'

interface Props {
    coachSlug: string
    basePath: string
    coachBrand: string
    coachLogoUrl: string
    coachLogoDarkUrl?: string
}

/**
 * Gates de NAV del alumno, aislados del layout a proposito (TTFB QW1).
 *
 * Los tres espejos (movimiento, composicion, dominio Nutricion) son lecturas a DB: mientras el
 * `await` vivia en el cuerpo del layout, NADA del arbol podia salir — ni el shell, ni el
 * `loading.tsx` de la page — porque `children` solo se renderiza cuando el layout retorna. Aca
 * el layout monta este componente dentro de un `<Suspense>` y la page empieza a streamear de
 * inmediato; el nav entra apenas resuelven los gates.
 *
 * La SEMANTICA no cambia ni un pelo: mismos tres helpers, mismo `Promise.all`, mismos props.
 * Siguen siendo render-only (mostrar/ocultar el tab); el gate real vive en cada page.
 */
export async function ClientNavGates({
    coachSlug,
    basePath,
    coachBrand,
    coachLogoUrl,
    coachLogoDarkUrl,
}: Props) {
    // Espejo de los modulos movement_assessment + body_composition con el contexto del PROPIO
    // alumno (pool => su team; standalone => su coach) — mismo gate que la page.
    const [showMovement, showBodyComposition, showNutrition] = await Promise.all([
        getStudentMovementNavEnabled(),
        getStudentBodyCompositionNavEnabled(),
        // Master switch del dominio Nutricion (plan §4.8): si el coach lo apago para este alumno,
        // el tab "Plan Alimenticio" del nav NO se monta (render-only; la page tambien gatea).
        getStudentNutritionNavEnabled(),
    ])

    return (
        <ClientNav
            coachSlug={coachSlug}
            basePath={basePath}
            coachBrand={coachBrand}
            coachLogoUrl={coachLogoUrl}
            coachLogoDarkUrl={coachLogoDarkUrl}
            showMovement={showMovement}
            showBodyComposition={showBodyComposition}
            showNutrition={showNutrition}
        />
    )
}
