# Plan de Autenticación, Acceso y Seguridad (Coach & Alumno)

Este documento detalla la estrategia recomendada para manejar la incorporación de alumnos (Onboarding), el control de acceso (pagos/suscripciones), la instalación manual de la PWA y la seguridad de los datos.

---

## 1. El Problema de los Pagos: ¿Qué pasa si el alumno no paga?
Actualmente, si un alumno deja de pagar, el coach tendría que eliminarlo. Pero si lo elimina, pierde todo su historial, progreso y métricas. 

**Solución Propuesta:**
*   **Estado de Cuenta (`is_active`):** Añadir una columna booleana `is_active` (por defecto `true`) a la tabla `clients`.
*   **Botón de "Suspender":** En el dashboard del Coach, añadir un switch para "Suspender Acceso".
*   **Pantalla de Bloqueo:** Si `is_active` es `false`, el alumno aún puede iniciar sesión, pero el middleware lo redirige a una pantalla estática que dice: *"Tu acceso está pausado. Por favor, contacta a [Nombre del Coach] para reactivar tu cuenta"*. No podrá ver rutinas ni registrar datos, pero su historial queda intacto en la base de datos para cuando regrese.

---

## 2. Flujo de Onboarding: El enlace único y la Contraseña
¿Deberíamos quitar el correo? **No.** Supabase Auth necesita un identificador único (correo o teléfono). Usar teléfono requiere pagar servicios de SMS, por lo que el correo es obligatorio, gratuito y seguro.

**El Flujo Ideal (WhatsApp-Friendly):**
1.  El Coach hace clic en "Nuevo Alumno". Ingresa el Nombre y el Correo del alumno.
2.  El sistema de OmniCoach **genera una contraseña temporal aleatoria de 6 dígitos** (ej. `839211`).
3.  El sistema crea el usuario y le muestra al Coach un botón: *"Copiar mensaje para WhatsApp"*.
4.  El mensaje copiado dice: 
    > *"¡Hola! Ya tienes tu cuenta lista en mi app. \nEntra a: omnicoach.app/c/josefit/login \nTu usuario: juan@email.com \nTu clave temporal: 839211"*
5.  El alumno entra, se loguea y el sistema detecta que es su primer ingreso (gracias a la variable `force_password_change` que ya tienes en tu base de datos). 
6.  **Pantalla obligatoria:** *"Crea tu propia contraseña para continuar"*. El alumno la cambia y listo.

*Ventaja:* Cero fricción. El coach no tiene que inventar contraseñas y el alumno siente que la experiencia es súper personalizada y guiada por su entrenador.

---

## 3. Instalación PWA: Botón Permanente para el Alumno
Depender de que el navegador decida mostrar el "Pop-up" automático de instalación es frustrante. Como la app está enfocada en el alumno, vamos a darle el control.

**Solución Propuesta:**
*   En la barra de navegación inferior (o menú lateral) del Alumno, añadiremos un botón fijo y bonito que diga **"📱 Instalar App"**.
*   Al presionarlo, si el dispositivo lo permite (Android), forzaremos el evento de instalación nativo.
*   Si está en un iPhone (iOS), abriremos el Modal que ya construiste (`InstallPrompt.tsx`) con las instrucciones gráficas (*"Toca compartir y luego Añadir a Inicio"*).
*   *Bonus:* Si detectamos que la app ya está instalada (Standalone mode), ocultamos ese botón automáticamente.

---

## 4. Control del Coach sobre las Contraseñas
Es súper común que el alumno escriba diciendo: *"Coach, olvidé mi clave y no sé cómo recuperarla"*.

**Solución Propuesta:**
*   En el perfil del alumno (vista del Coach), añadir un botón: **"Restablecer Contraseña"**.
*   Al presionarlo, se usa la API Admin de Supabase (`@supabase/supabase-js` auth admin) para sobreescribir la contraseña del alumno por un nuevo PIN de 6 dígitos.
*   El coach le dice al alumno: *"Tu nueva clave es 554433, entra y cámbiala"*.
*   *Nota:* Para hacer esto, necesitamos habilitar el cliente de Supabase con el `SERVICE_ROLE_KEY` (ya vi que tienes la función `createAdminClient` creada en tu código, ¡estamos listos para usarla!).

---

## 5. Seguridad Base (Row Level Security - RLS)
Todavía no hemos revisado el SQL de Supabase, pero esto es **crítico antes de lanzar**:
*   Si un alumno experto en tecnología inspecciona la web, no debería poder consultar la base de datos y ver los datos de otros alumnos.
*   **Acción requerida en Supabase:** Asegurarnos de que las políticas RLS estén activas.
    *   *Regla Alumnos:* `auth.uid() == client_id` (Solo puedo ver y editar mis propios check-ins y mis propias rutinas).
    *   *Regla Coaches:* `auth.uid() == coach_id` (Solo puedo ver a los clientes que me pertenecen).