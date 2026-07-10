// P1: FAQ del coach (mobile) — ampliada y categorizada. Fuente única, reusable.
export interface FaqEntry {
  category: string
  q: string
  a: string
}

export const SUPPORT_FAQ: FaqEntry[] = [
  // Alumnos
  { category: 'Alumnos', q: '¿Cómo agrego un alumno?', a: 'En "Alumnos" toca el botón +. Completa nombre y email; el alumno recibe una contraseña temporal. También puedes compartirle tu código o enlace desde "Mi Marca".' },
  { category: 'Alumnos', q: '¿Puedo importar varios alumnos de una vez?', a: 'Sí. En "Alumnos" usa "Importar": sube un CSV con columnas nombre,email,telefono (una fila por alumno) o pega el texto. Verás un preview con los válidos antes de crear.' },
  { category: 'Alumnos', q: '¿Qué pasa si un alumno pierde su contraseña?', a: 'Desde el detalle del alumno puedes resetear su contraseña: se genera una nueva temporal que puedes compartirle. El alumno la cambia al entrar.' },
  { category: 'Alumnos', q: '¿Cómo pauso o archivo a un alumno?', a: 'En el detalle del alumno puedes archivarlo (deja de contar en tu límite de plan) o pausarlo. Puedes reactivarlo cuando quieras, sujeto al límite de tu plan.' },

  // Programas
  { category: 'Programas', q: '¿Cómo creo un programa de entrenamiento?', a: 'En "Programas" crea uno nuevo, arma los días y agrega ejercicios desde el buscador. Defines series, reps, peso, tempo, RIR, descanso, superseries y secciones (calentamiento/principal/enfriamiento).' },
  { category: 'Programas', q: '¿Qué son las semanas A/B?', a: 'Permiten alternar dos rutinas en microciclos (semana A y semana B). Activalas en la configuración del programa para que el alumno vea la variante correcta cada semana.' },
  { category: 'Programas', q: '¿Cómo armo una superserie?', a: 'En el builder, toca "Superserie" entre dos ejercicios de la MISMA sección para enlazarlos. Si mueves uno a otra sección, el enlace se limpia automáticamente.' },
  { category: 'Programas', q: '¿Para qué sirve el botón "Sync"?', a: 'Sync propaga los cambios de tu plantilla al plan ya asignado de un alumno: actualiza los bloques que vienen de la plantilla y CONSERVA los que marcaste como override (ajustes manuales del alumno). Igual que en la web.' },
  { category: 'Programas', q: '¿Qué diferencia hay entre Duplicar y Sync?', a: 'Duplicar crea una copia nueva del programa. Sync no copia: actualiza un plan asignado existente desde su plantilla, respetando los overrides.' },

  // Nutrición
  { category: 'Nutrición', q: '¿Cómo creo un plan de nutrición?', a: 'En "Nutri" creas el plan del alumno, agregas comidas y alimentos desde el buscador (con filtros por categoría y origen). Los macros se calculan automáticamente.' },
  { category: 'Nutrición', q: '¿Cómo agrego un alimento que no existe?', a: 'En el buscador de alimentos toca + para crear uno propio con sus macros y porción. Queda disponible en tu biblioteca ("Míos").' },
  { category: 'Nutrición', q: '¿Puedo dar alternativas de un alimento?', a: 'Sí. Puedes definir swaps (alternativas) para una comida; el alumno elige entre las opciones equivalentes que cargues.' },

  // Seguimiento
  { category: 'Seguimiento', q: '¿Cómo veo el progreso de un alumno?', a: 'En el detalle del alumno tienes Resumen, Análisis (entrenos, volumen, fuerza), Progreso (peso, IMC, fotos) y Nutrición. Puedes exportar un PDF de progreso branded.' },
  { category: 'Seguimiento', q: '¿Qué es el check-in?', a: 'Es el registro semanal del alumno: peso, fotos y energía. Te permite seguir su evolución y detectar a tiempo a quién necesita atención.' },
  { category: 'Seguimiento', q: 'Un alumno entrena sin registrar peso, ¿se ve igual?', a: 'Sí. El análisis muestra el historial de sesiones y el volumen por series aunque no registre carga (calistenia/cardio). Las tarjetas de 1RM solo aparecen cuando hay peso.' },

  // Marca y código
  { category: 'Marca y código', q: '¿Cómo personalizo mi marca?', a: 'En "Mi Marca" cambias tu logo, color, loader y mensaje de bienvenida. Tus alumnos ven la app con tu identidad. Puedes previsualizarla a pantalla completa.' },
  { category: 'Marca y código', q: '¿Qué es mi código y por qué no puedo cambiarlo?', a: 'Tu código es tu identificador público permanente: tus alumnos entran con él (eva-app.cl/c/TU-CODIGO). Es fijo para que el acceso nunca se rompa. Si ya tenías una URL personalizada (slug), sigues pudiendo usarla como enlace legacy.' },

  // Cobros y plan
  { category: 'Cobros y plan', q: '¿Cómo cobro a mis alumnos?', a: 'Registras los pagos manualmente en el detalle de cada alumno (monto, fecha, período). EVA no procesa el cobro a tus alumnos; tú defines el medio.' },
  { category: 'Cobros y plan', q: '¿Cómo pago mi suscripción a EVA?', a: 'Tu suscripción a EVA se gestiona y paga desde la web. Si vence, algunas funciones quedan limitadas hasta regularizar.' },
  { category: 'Cobros y plan', q: '¿Qué pasa si llego al límite de alumnos de mi plan?', a: 'No vas a poder activar más alumnos hasta liberar cupos (archivando) o subir de plan. Los alumnos archivados no cuentan para el límite.' },

  // Datos y cuenta
  { category: 'Datos y cuenta', q: '¿Mis datos están seguros?', a: 'Sí. Usamos cifrado y aislamiento por fila (RLS): cada coach solo accede a sus datos. Cumplimos la Ley 21.719 de protección de datos de Chile.' },
  { category: 'Datos y cuenta', q: '¿Cómo doy de baja mi cuenta?', a: 'Por seguridad, la cuenta no se borra desde la app. Escríbenos a contacto@eva-app.cl desde el correo de tu cuenta y gestionamos la baja y el borrado de tus datos.' },
]
