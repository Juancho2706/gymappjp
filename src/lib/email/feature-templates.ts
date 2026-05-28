import { wrapEmailLayout, ctaButton, divider, featureRow, badge } from './base-layout'

type FeatureAnnouncementCtx = {
    coachName: string | null
    baseUrl: string
}

function coachDisplay(ctx: FeatureAnnouncementCtx): string {
    return ctx.coachName?.trim() || 'Coach'
}

export function buildFeatureAnnouncementEmail(ctx: FeatureAnnouncementCtx): { subject: string; html: string } {
    const coach = coachDisplay(ctx)
    const exercises = `${ctx.baseUrl}/coach/exercises`
    const clients = `${ctx.baseUrl}/coach/clients`

    const body = `
${badge('Nuevas funciones — Mayo 2026')}
<h1 style="margin:12px 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">
  ${coach}, llegaron dos features que pedían 🚀
</h1>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;">
  Esta semana lanzamos el <strong>Creador de ejercicios propios</strong> y la <strong>Importación masiva de alumnos</strong>. Los dos ya están disponibles en tu cuenta.
</p>

${featureRow('🎬', 'Creador de ejercicios personalizados', 'Creá ejercicios con tu propio nombre, grupo muscular y medios. Subí un GIF demostrativo, una imagen o pegá un link de YouTube. Tus alumnos los ven exactamente como vos los diseñás.')}
${featureRow('🔍', 'Filtrá "Mis ejercicios"', 'El catálogo ahora tiene un filtro que separa los ejercicios del sistema de los tuyos. Encontrás y editás los propios en segundos.')}
${featureRow('✏️', 'Editar y eliminar desde el preview', 'Abrís el preview de cualquier ejercicio tuyo y podés editarlo o eliminarlo directamente — sin menús escondidos.')}

${divider()}

${featureRow('📋', 'Importación masiva de alumnos', 'Descargá la plantilla Excel, completá los datos de tus alumnos (nombre, correo, contraseña) y subila. EVA crea todas las cuentas de una vez. Ideal si estás arrancando o migrando desde otro sistema.')}
${featureRow('⚡', 'En segundos, no en horas', 'Lo que antes requería cargar alumno por alumno ahora se hace en un archivo. Subís la planilla y listo.')}

${divider()}

<div style="margin-bottom:16px;">
  ${ctaButton('Crear mi primer ejercicio →', exercises)}
</div>
<div style="margin-bottom:24px;">
  <a href="${clients}" target="_blank" style="font-size:13px;color:#6b7280;text-decoration:underline;">Ir a Alumnos (Importar desde Excel)</a>
</div>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:8px;">
  <tr>
    <td>
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#065f46;">¿Encontrás algún problema?</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">
        Reportalo desde el menú <strong>Soporte</strong> en tu dashboard o respondé este correo directamente. Revisamos todo.
      </p>
    </td>
  </tr>
</table>`

    return {
        subject: `${coach}, ya podés crear ejercicios propios y subir alumnos en lote 🎬`,
        html: wrapEmailLayout(body, {
            previewText: 'Creador de ejercicios + importación masiva de alumnos — ya disponibles en tu cuenta.',
            headerTitle: 'Nuevas funciones — EVA',
        }),
    }
}
