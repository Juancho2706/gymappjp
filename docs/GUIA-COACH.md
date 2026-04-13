# Guia Coach - Uso Completo de Herramientas

> Documento para coaches no tecnicos.  
> Objetivo: entender cada herramienta de la app y para que sirve cada boton importante.

---

## 1) Que puedes hacer como coach

Con esta app puedes:

- Crear y administrar alumnos.
- Diseñar programas de entrenamiento.
- Asignar planes de nutricion.
- Ver progreso real (entreno, check-ins, adherencia, peso).
- Detectar alumnos en riesgo antes de que abandonen.
- Personalizar la app con tu marca.

Piensalo como tu "centro de operaciones" diario.

---

## 2) Flujo recomendado de trabajo semanal

1. Revisar `Dashboard` para ver alertas.
2. Entrar a `Alumnos` para ordenar prioridades.
3. Abrir `Ficha del Alumno` para analizar datos completos.
4. Ajustar plan en `Constructor de Planes`.
5. Ajustar nutricion en `Planes Nutricionales` y `Alimentos`.
6. Hacer seguimiento en check-ins y adherencia.

---

## 3) Dashboard del coach (resumen ejecutivo)

## Para que sirve

Es tu vista rapida para saber:

- quien esta bien,
- quien necesita atencion hoy,
- que acciones debes hacer primero.

## Botones y acciones comunes en Dashboard

- `Registrar alumno`: abre creacion de alumno nuevo.
- `Programas`: te lleva al area de programas.
- `Nutricion`: te lleva al area de planes de comida.
- `Ver alumno en riesgo`: abre directo su ficha para intervenir.

## Como usarlo bien

- No intentes revisar todo en detalle desde aqui.
- Usalo para priorizar y luego entrar a ficha individual.

---

## 4) Directorio de alumnos (lista operativa)

## Para que sirve

Es donde administras toda tu cartera de alumnos.

## Botones/filtros clave

- `Buscar`: encuentra por nombre o correo.
- `Filtro riesgo`: muestra solo alumnos con alertas.
- `Filtro estado`: activos/inactivos.
- `Ordenar`: organiza por prioridad, nombre u otros criterios.
- `Vista tabla`: ideal para gestionar volumen.
- `Vista tarjetas`: ideal para lectura rapida individual.

## Acciones por alumno (menu de acciones)

- `Crear alumno`: genera cuenta nueva.
- `Resetear contrasena`: crea contrasena temporal.
- `Activar/Desactivar`: controla si puede entrar a su app.
- `Eliminar`: borra la cuenta del alumno (accion sensible).

## Que significa "riesgo"

El riesgo normalmente sube cuando hay combinacion de:

- muchos dias sin check-in,
- baja adherencia de entrenamiento,
- baja adherencia de nutricion,
- programa por vencer,
- señales de estancamiento.

---

## 5) Ficha completa del alumno (la herramienta mas importante)

Esta es la seccion clave para tomar decisiones de coaching.

## 5.1 Estructura de la ficha por pestañas

Dentro de la ficha veras pestañas tipo:

- `Overview` (resumen)
- `Training` (entrenamiento)
- `Nutrition` (nutricion)
- `Progress` (progreso corporal)
- `Program` (programa activo)
- `Billing` (pagos)

Cada una te muestra una parte distinta del estado del alumno.

## 5.2 Botones/acciones de la ficha (explicacion practica)

### Acciones generales

- `Cambiar pestaña`: te mueve a la capa de analisis que necesitas.
- `Ir al builder / Editar programa`: abre el constructor para ajustar el plan actual.
- `WhatsApp` (si aparece en acciones rapidas): contacto inmediato con el alumno.
- `Ver check-in`: abre datos recientes para feedback rapido.

### En pestaña Overview

- `Ver alerta principal`: te muestra el motivo mas urgente de intervencion.
- `Ver prox. entrenamiento`: confirma que tiene sesion asignada.
- `Ver snapshot de check-in`: revisas estado rapido (peso/energia/fotos).

### En pestaña Training

- `Ver PRs`: identifica mejoras reales por ejercicio.
- `Ver volumen`: evalua carga acumulada.
- `Ver tendencia`: detecta mejora o estancamiento.

### En pestaña Nutrition

- `Ver adherencia 30 dias`: lectura de consistencia.
- `Editar plan nutricional`: abre editor para ajustar calorias/macros/comidas.
- `Ir a vista alumno`: validas como lo esta viendo el alumno.

### En pestaña Progress

- `Ver grafico de peso`: detectas tendencia semanal/mensual.
- `Comparar fotos`: revisas cambio corporal visual.

### En pestaña Program

- `Editar programa`: abre constructor con contexto del alumno.
- `Ver semana A/B`: revisas que variante corresponde.

### En pestaña Billing

- `Agregar pago`: registra un cobro manual.
- `Eliminar pago`: corrige error o anula registro.

## 5.3 Como leer la ficha para decidir mejor

Regla rapida:

1. Si entrena y no progresa -> ajustar carga/volumen.
2. Si no cumple nutricion -> simplificar plan.
3. Si baja energia repetida -> revisar recuperacion y estres.
4. Si no hace check-in -> priorizar comunicacion, no mas complejidad.

---

## 6) Constructor de planes (explicado boton por boton)

Este modulo es el corazon de tu servicio.

## 6.1 Objetivo del constructor

Diseñar o ajustar programas de entrenamiento por alumno (o desde plantilla).

## 6.2 Estructura visual del constructor

Normalmente veras:

- encabezado del programa,
- dias de entrenamiento,
- catalogo de ejercicios,
- bloques por dia,
- panel de balance muscular,
- modales para plantilla/asignacion/impresion.

## 6.3 Botones principales del constructor

### Encabezado

- `Nombre del programa`: define el titulo visible para ti y el alumno.
- `Fechas` (inicio/fin): marca ventana del programa.
- `Guardar`: guarda todo el programa en la base de datos.

Que hace `Guardar`:

- guarda estructura del programa,
- guarda dias y bloques,
- guarda prescripciones (series/reps/peso/etc).

### Barra de fases / semanas

- `Semana A/B` (si aplica): controla variante de semana.
- `Cambiar fase`: organiza periodizacion.

### Catalogo de ejercicios

- `Buscar ejercicio`: filtra rapido por nombre.
- `Arrastrar ejercicio`: lo llevas al dia correspondiente.

### En cada bloque de ejercicio

- `Editar bloque`: abre configuracion detallada.
- `Eliminar bloque`: quita ese ejercicio del dia.
- `Mover orden`: reordena secuencia.

### Dentro de editar bloque (Block Edit)

- `Series`: cuantas series debe hacer.
- `Reps`: rango o objetivo de repeticiones.
- `Peso objetivo`: referencia de carga.
- `RIR/RPE` (si lo usas): intensidad objetivo.
- `Descanso`: tiempo entre series.
- `Tempo`: ritmo de ejecucion.
- `Notas`: cues tecnicos para el alumno.
- `Guardar cambios`: confirma edicion del bloque.

### Plantillas y asignacion

- `Usar plantilla`: carga programa base.
- `Asignar a alumnos`: replica programa a varios alumnos.
- `Imprimir / Exportar`: genera version imprimible/PDF.

## 6.4 Recomendacion de uso profesional

- Diseña una base simple.
- Duplica por tipo de alumno.
- Ajusta solo lo que cambia por persona (progresion, volumen, notas).
- Evita sobrecargar de ejercicios "bonitos" pero innecesarios.

---

## 7) Biblioteca de programas

## Para que sirve

Reusar lo que ya te funciona.

## Botones comunes

- `Nuevo programa`: crea desde cero.
- `Duplicar`: clona un programa existente.
- `Previsualizar`: revisa estructura antes de asignar.
- `Filtrar`: separa plantillas y programas activos.

## Mejor practica

Crea 4-6 plantillas madre por objetivo y personaliza desde ahi.

---

## 8) Nutricion coach (hub completo)

Esta area tiene tres partes: plantillas, planes activos y biblioteca de alimentos.

## 8.1 Plantillas de nutricion

### Botones clave

- `Nueva plantilla`: crear plan nutricional base.
- `Editar`: ajustar una plantilla guardada.
- `Duplicar`: clonar plantilla para otra estrategia.
- `Asignar a alumno`: convertir plantilla en plan activo para una persona.
- `Desasignar` (si aplica): retirar plan activo.
- `Eliminar`: borrar plantilla.

### Que recomienda la app

Trabajar con pocas plantillas de alta calidad y luego personalizar.

## 8.2 Planes activos

### Que ves

- alumnos con plan activo,
- avance de cumplimiento,
- señales de adherencia baja.

### Botones/acciones

- `Ver alumno`: salto directo a su contexto.
- `Editar plan`: ajuste inmediato del plan actual.

---

## 9) Biblioteca de alimentos (explicado boton por boton)

Este punto te lo detallo a fondo porque es clave para que nutricion sea util.

## 9.1 Objetivo de la biblioteca

Tener un inventario de alimentos con macros claros para construir comidas reales.

## 9.2 Campos basicos de cada alimento

- Nombre.
- Calorias.
- Proteina.
- Carbohidratos.
- Grasas.
- Tamaño porcion y unidad.

## 9.3 Botones y funciones

### En lista de alimentos

- `Buscar`: encuentra alimento por nombre.
- `Filtrar categoria` (si esta disponible): separa por tipo.
- `Editar alimento`: corrige macros o porcion.
- `Eliminar alimento`: quita duplicados o errores.

### Boton `Agregar alimento`

Abre formulario para crear alimento custom.

Campos importantes:

- nombre exacto,
- porcion realista (ej. 100 g, 1 unidad),
- macros por porcion.

### En el constructor de comidas

- `Agregar alimento a comida`: inserta item en desayuno/almuerzo/etc.
- `Cantidad`: ajusta gramos/unidades.
- `Unidad`: define tipo de medida.
- `Eliminar item`: quita alimento de esa comida.

## 9.4 Buenas practicas en alimentos

1. Evita duplicados con nombres parecidos.
2. Define porciones estandar para no confundir al alumno.
3. Usa alimentos comunes de tu contexto local.
4. Prioriza claridad sobre perfeccion extrema.

---

## 10) Ejercicios coach (catalogo)

## Para que sirve

Gestionar tu banco de ejercicios para programar rapido.

## Botones comunes

- `Buscar ejercicio`.
- `Filtrar por grupo muscular`.
- `Ver detalle` (GIF/video/instrucciones).
- `Crear ejercicio` (si trabajas con custom).
- `Editar ejercicio`.
- `Eliminar ejercicio`.

## Consejo

Manten nomenclatura consistente para que el alumno no se confunda.

---

## 11) Mi Marca (branding) explicado

## Para que sirve

Dar experiencia profesional con tu identidad.

## Botones/campos comunes

- `Nombre de marca`.
- `Color principal`.
- `Subir logo`.
- `Mensaje de bienvenida`.
- `Guardar cambios`.
- `Preview` (si esta disponible): ver como lo vera el alumno.

## Recomendaciones

- Usa color con buen contraste.
- Mensaje de bienvenida corto y humano.
- Logo legible en movil.

---

## 12) Acciones sensibles: que hacer con cuidado

- `Eliminar alumno`: solo si de verdad no continuara.
- `Eliminar pago`: revisa 2 veces para no perder historial.
- `Desactivar alumno`: usar cuando pausa servicio.
- `Resetear contrasena`: avisar al alumno para evitar confusion.

---

## 13) Playbook rapido: que boton tocar segun problema

### "El alumno no progresa"

1. `Alumnos` -> abrir `Ficha`.
2. Revisar `Training` + `Nutrition` + `Check-ins`.
3. `Editar programa` o `Editar plan nutricional`.

### "El alumno no cumple plan"

1. En ficha, revisar adherencia.
2. Ajustar complejidad del plan.
3. Programar seguimiento semanal.

### "Tengo muchos alumnos y poco tiempo"

1. Ir a `Dashboard`.
2. Priorizar alertas.
3. Usar `Biblioteca` + `Duplicar` + `Asignar`.

---

## 14) Indicadores que debes mirar siempre

- Adherencia de entrenamiento.
- Adherencia de nutricion.
- Frecuencia de check-ins.
- Tendencia de peso/energia.
- Records personales (PRs).

Si estos 5 estan claros, tus decisiones seran mucho mejores.

---

## 15) Resumen final para coach

La app te da tres superpoderes:

1. Estandarizar (programas y nutricion reutilizables).
2. Personalizar (ficha completa del alumno).
3. Priorizar (alertas de riesgo y accion rapida).

Si usas bien constructor + ficha + alimentos, puedes escalar calidad sin perder cercania.

