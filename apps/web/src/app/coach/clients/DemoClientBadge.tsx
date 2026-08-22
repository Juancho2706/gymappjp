import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Etiqueta «Alumno de ejemplo» (SPEC coach-onboarding-v2 §4, TASKS F3.7).
 *
 * El sustantivo lo pone la persona del coach: «Alumno» · «Paciente» · «Atleta» de ejemplo
 * (`demoLabelFor` en `coach/_data/onboarding-empty.queries`). Se muestra en TODAS las
 * superficies donde el demo aparece — directorio, ficha y selectores — para que nadie confunda
 * contenido de demostración con un alumno real. Fuera de pantalla no cuenta cupo, ni KPIs de
 * facturación, ni recibe correos (W1 F1.3).
 */
export function DemoClientBadge({
    label,
    className,
    size = 'sm',
}: {
    label: string
    className?: string
    size?: 'sm' | 'md'
}) {
    return (
        <Badge tone="info" variant="soft" size={size} className={cn('shrink-0', className)}>
            {label}
        </Badge>
    )
}
