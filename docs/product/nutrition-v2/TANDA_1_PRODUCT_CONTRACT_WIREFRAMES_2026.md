# EVA Nutrición V2 — Tanda 1

## Contrato de producto, arquitectura de información y wireframes

**Estado:** completada  
**Fecha:** 14 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`  
**Base:** `rnmobiledenuevo`  
**PR:** #121, draft  
**Supabase:** producción; sin cambios durante esta tanda

> “Arquitectura de información” no significa inteligencia artificial. EVA Nutrición V2 continúa sin IA generativa ni costos por tokens.

---

# 1. Objetivo y decisiones cerradas

Esta tanda define qué construirá el coach, qué recibirá el alumno, cómo se registrará el consumo, cómo se preservará el historial y cómo se verá cada flujo antes de programar el dominio V2.

Decisiones cerradas:

1. Nutrición tendrá tres estrategias: estructurada, flexible por macros e híbrida.
2. El consumo nuevo tendrá una sola fuente canónica.
3. Marcar una comida prescrita no sumará macros por separado.
4. El coach publicará versiones; no editará destructivamente el plan histórico.
5. El alumno navegará por `Hoy`, `Plan` e `Historial`.
6. El coach navegará por `Centro`, `Ficha nutricional` y `Builder`.
7. El Builder mostrará una preview real de la experiencia del alumno.
8. Base permite prescribir, cumplir y registrar; Pro agrega herramientas profesionales, no el derecho básico a usar la nutrición.
9. Las microanimaciones forman parte del comportamiento de los componentes, no un adorno final.
10. Web responsive/PWA, desktop y React Native compartirán contratos y vocabulario.

---

# 2. Modelo mental del producto

## 2.1 Prescripción

Es lo que el profesional establece:

- objetivos;
- estrategia;
- comidas o anclas;
- alimentos/recetas sugeridos u obligatorios;
- cantidades o presupuestos;
- reglas de flexibilidad;
- restricciones;
- protocolo y observaciones;
- vigencia.

## 2.2 Consumo real

Es lo que el alumno declara haber consumido:

- alimento/receta;
- cantidad y unidad;
- franja;
- hora;
- origen del registro;
- vínculo opcional con una prescripción;
- nota/foto opcional futura;
- actor y correcciones.

## 2.3 Adherencia

Es una comparación explicable entre prescripción y consumo real.

Nunca será:

- un score opaco;
- una recomendación médica automática;
- una forma de castigar al alumno;
- una suma entre comidas “marcadas” y alimentos registrados.

## 2.4 Plan, versión y día

- **Plan lógico:** relación nutricional continua con un alumno.
- **Versión:** prescripción publicada e inmutable durante una vigencia.
- **Borrador:** versión todavía editable y no visible al alumno.
- **Día:** snapshot de versión, objetivos y variante aplicables a una fecha local.
- **Intake:** consumo real del día.

---

# 3. Roles y alcance

## 3.1 Alumno

Puede:

- ver el plan publicado;
- registrar, editar y eliminar su consumo real;
- confirmar una prescripción como consumida, ajustando cantidades;
- usar búsqueda, recientes, favoritos y barcode;
- ver restante y progreso;
- escoger sustituciones cuando estén autorizadas;
- ver comentarios/protocolo destinados a él;
- consultar su historial.

No puede:

- alterar objetivos publicados;
- editar la versión del plan;
- modificar reglas clínicas/profesionales;
- ver notas privadas;
- convertir un alimento no verificado en global.

## 3.2 Coach

Puede:

- crear y publicar planes Base;
- escoger estrategia;
- definir kcal/P/C/G, comidas y flexibilidad;
- administrar biblioteca propia;
- revisar consumo/adherencia;
- comentar y ajustar mediante una versión nueva;
- corregir un intake cuando su scope lo permite, dejando auditoría.

## 3.3 Nutricionista / Nutrición Pro

Añade:

- evaluación más completa;
- micronutrientes;
- intercambios/equivalencias;
- variantes de días;
- protocolos y suplementos;
- recetas profesionales;
- notas privadas;
- reportes longitudinales;
- herramientas de revisión y exportación;
- mayor profundidad de ficha, no automatización médica.

## 3.4 EVA Teams

- scopes visibles;
- autor y última edición;
- permisos por rol;
- edición concurrente controlada;
- audit log;
- biblioteca compartida según permiso;
- publicación identificada por profesional.

---

# 4. Diferenciación Base y Pro

## 4.1 Nutrición Base

Debe resolver por completo:

- plan estructurado o macros flexibles simples;
- objetivo diario kcal/P/C/G;
- registro real;
- catálogo, recientes, favoritos y barcode;
- cantidades g/ml/un;
- recetas compartidas;
- lista de compras básica;
- comentarios visibles;
- resumen e historial básico;
- adherencia transparente.

## 4.2 Nutrición Pro

Añade valor profesional:

- plan híbrido avanzado;
- intercambios;
- objetivos por día/franja;
- entrenamiento/descanso;
- micronutrientes;
- recetas estructuradas y plantillas clínicas;
- protocolos/suplementos;
- notas privadas;
- composición corporal vinculada a revisión;
- reportes y exportación;
- auditoría avanzada Teams.

## 4.3 Regla comercial

El registro cotidiano no se bloquea tras Pro. Pro monetiza evaluación, construcción, control, documentación y análisis profesional.

---

# 5. Estrategias del Builder

# 5.1 Estrategia A — Plan estructurado

## Coach define

- objetivo del día;
- franjas/comidas;
- alimentos, recetas o grupos;
- cantidades;
- alternativas permitidas;
- opcionalidad/obligatoriedad;
- instrucciones.

## Alumno ve

- qué corresponde a cada franja;
- cantidad esperada;
- alternativas;
- CTA `Comí esto`;
- CTA `Registrar algo distinto`;
- esperado frente a real.

## Registro

`Comí esto` abre una confirmación editable:

- alimentos precargados;
- cantidades modificables;
- posibilidad de quitar/agregar;
- al confirmar se crean entradas reales;
- no se crea un total paralelo de “comida completada”.

## Adherencia

Dimensiones visibles:

- energía/macros frente al objetivo;
- anclas cumplidas;
- similitud con la prescripción;
- registro completo/incompleto.

No se reduce todo a un único número sin explicación.

---

# 5.2 Estrategia B — Objetivos flexibles de macros

Esta es la funcionalidad descrita por el coach en el feedback.

## Coach define

- kcal;
- proteína;
- carbohidratos;
- grasas;
- opcionalmente fibra, sodio, agua y distribución por franja;
- alimentos recomendados;
- alimentos restringidos;
- rango/tolerancia visible.

## Alumno ve

- consumido;
- restante;
- porcentaje por macro;
- timeline de lo comido;
- sugerencias de su biblioteca, no recomendaciones automáticas;
- favoritos y frecuentes;
- posibilidad de armar su día libremente.

## Adherencia

Por macro:

```txt
cumplimiento = consumido / objetivo
```

La UI presenta:

- bajo;
- dentro del rango;
- sobre el rango;
- diferencia absoluta.

Rangos configurables iniciales sugeridos —sujetos a validación profesional—:

- proteína: objetivo mínimo o rango;
- energía/macros: tolerancia porcentual definida por el coach;
- sin declarar “bueno/malo” automáticamente.

---

# 5.3 Estrategia C — Plan híbrido

## Coach define

- objetivos globales;
- comidas/anclas obligatorias o recomendadas;
- remanente flexible;
- mínimos por franja;
- sustituciones;
- días de entrenamiento/descanso.

## Ejemplo

- desayuno prescrito;
- post-entreno obligatorio;
- almuerzo con mínimo de proteína;
- cena libre dentro del remanente.

## Alumno ve

- anclas dentro de su timeline;
- macros restantes después de las anclas;
- contenido flexible en la misma pantalla;
- progreso separado pero relacionado.

## Adherencia

- cumplimiento de anclas;
- cumplimiento de objetivos;
- registro completo;
- cada dimensión explicada.

---

# 5.4 Intercambios

- herramienta de construcción del profesional;
- alimenta estructurado/híbrido;
- el alumno ve equivalencias simples y autorizadas;
- no se presenta como un módulo paralelo desconectado;
- sustituir recalcula preview, no cambia una versión publicada hasta volver a publicar.

---

# 6. Ciclo de vida de un plan

```txt
Sin plan
  ↓ Crear
Borrador v1
  ↓ Revisar
Listo para publicar
  ↓ Publicar
Publicado v1
  ↓ Crear cambio
Borrador v2
  ↓ Publicar en fecha
Publicado v2 / v1 superseded
```

## 6.1 Borrador

- no visible al alumno;
- autosave;
- editable;
- estado guardando/guardado/error;
- conflictos visibles.

## 6.2 Revisión

Checklist:

- estrategia y objetivos completos;
- kcal/macros coherentes;
- días definidos;
- restricciones verificadas;
- alimentos sin verificar identificados;
- contenido vacío detectado;
- preview alumno web/RN;
- resumen de cambios respecto a versión anterior.

## 6.3 Publicación

El coach define:

- inicio inmediato o fecha;
- notificar sí/no;
- mensaje opcional;
- versión reemplazada.

Publicar es una operación transaccional futura.

## 6.4 Corrección

Un error histórico no se arregla mutando silenciosamente la versión.

- corregir borrador: edición normal;
- corregir publicado: crear versión nueva;
- corregir intake: correction chain con actor y motivo cuando corresponda.

---

# 7. Arquitectura de información — Alumno

Navegación principal:

1. `Hoy`
2. `Plan`
3. `Historial`

Accesos contextuales:

- Registrar alimento;
- Scanner;
- Recetas;
- Lista de compras;
- Comentarios;
- Equivalencias;
- Ayuda.

No se muestran todos los módulos como una pila vertical permanente.

---

# 8. Alumno — pantalla Hoy

## 8.1 Jerarquía

1. fecha y sincronización;
2. progreso de kcal/P/C/G;
3. CTA `Registrar alimento`;
4. timeline por franja;
5. prescripción/anclas dentro de cada franja;
6. intake real;
7. recomendaciones relevantes;
8. cierre del día.

## 8.2 Mobile/RN/PWA compacta

```txt
┌──────────────────────────────────┐
│ Nutrición                    ● Sync│
│ Hoy, martes 14                   │
├──────────────────────────────────┤
│ 1.420 / 2.100 kcal               │
│ [█████████████░░░░░] 680 restantes│
│ P 124/160  C 148/230  G 48/65    │
│                                  │
│ [ + Registrar alimento ]         │
├──────────────────────────────────┤
│ DESAYUNO                 07:30    │
│ Esperado: Desayuno proteína      │
│ ✓ Huevos 2 un                    │
│ ✓ Pan 80 g                       │
│ [Editar] [Copiar]                │
├──────────────────────────────────┤
│ ALMUERZO                         │
│ Ancla: ≥40 g proteína            │
│ Aún no registras alimentos       │
│ [Registrar almuerzo]             │
├──────────────────────────────────┤
│ CENA                             │
│ Flexible · 480 kcal disponibles  │
│ [Agregar]                        │
└──────────────────────────────────┘
 Bottom nav: Hoy · Plan · Historial
```

## 8.3 Desktop

```txt
┌────────────────────────────────────────────────────────────┐
│ Nutrición · Hoy       fecha ◀ 14 Jul ▶       estado sync   │
├──────────────────────────────────────┬─────────────────────┤
│ TIMELINE                             │ RESUMEN             │
│ Desayuno                             │ 1.420 / 2.100 kcal  │
│  esperado + intake real             │ P / C / G           │
│                                      │ Agua / hábitos       │
│ Colación                             │                     │
│  vacío + CTA                         │ Coach dice           │
│                                      │ “Prioriza…”          │
│ Almuerzo                             │                     │
│  ancla + contenido                   │ [Registrar alimento] │
│                                      │                     │
│ Cena                                 │                     │
└──────────────────────────────────────┴─────────────────────┘
```

## 8.4 Card de franja

Debe contener, sin duplicar:

- nombre/hora;
- prescripción o regla;
- intake real;
- subtotal;
- estado;
- acciones.

Estados:

- sin prescripción/sin intake;
- prescrito pendiente;
- parcialmente registrado;
- confirmado igual a prescripción;
- registrado diferente;
- corregido;
- offline pendiente.

---

# 9. Alumno — Registrar alimento

## 9.1 Entrada universal

Se abre como bottom sheet móvil o dialog/command surface desktop.

Tabs/segmentos:

- Buscar;
- Escanear;
- Recientes;
- Favoritos;
- Recetas.

## 9.2 Flujo

```txt
Abrir
  → elegir franja o usar contexto
  → buscar/escanear
  → seleccionar alimento
  → definir cantidad/unidad
  → revisar macros
  → guardar optimista
  → confirmar/sincronizar
```

## 9.3 Cantidad

Siempre muestra base:

- `por 100 g`;
- `por 100 ml`;
- `1 un ≈ X g`;
- `por porción` cuando corresponde.

No presenta kcal por 100 g como si fueran kcal de una porción.

## 9.4 Scanner

```txt
┌────────────────────────────┐
│ Escanear producto       ✕  │
│ ┌────────────────────────┐ │
│ │      ┌──────────┐      │ │
│ │      │  GTIN    │      │ │
│ │      └──────────┘      │ │
│ └────────────────────────┘ │
│ Centra el código de barras │
│ [Ingresar código] [Foto]   │
└────────────────────────────┘
```

Resultado conocido:

- feedback lock;
- ficha compacta;
- cantidad;
- guardar.

Resultado desconocido:

- “Este producto aún no está en EVA”;
- guardar GTIN en cola;
- captura opcional de nombre/foto/etiqueta;
- no inventar nutrientes;
- opción registrar un alimento genérico equivalente claramente identificado.

---

# 10. Alumno — Plan

## 10.1 Objetivo

Explicar qué espera el coach y qué libertad tiene el alumno.

Contenido:

- nombre del plan;
- profesional;
- versión y vigencia;
- estrategia;
- metas;
- variante del día;
- reglas;
- comidas/anclas;
- equivalencias;
- protocolo/suplementos;
- comentario visible;
- próxima revisión.

## 10.2 Wireframe móvil

```txt
┌──────────────────────────────┐
│ Mi plan                      │
│ Fuerza · v3 · desde 14 Jul   │
│ Híbrido                      │
├──────────────────────────────┤
│ Objetivo                     │
│ 2.100 kcal · P160 C230 G65   │
├──────────────────────────────┤
│ Tus anclas                   │
│ • Desayuno proteína          │
│ • Post-entreno               │
├──────────────────────────────┤
│ Flexible                     │
│ Puedes elegir la cena dentro │
│ de tus macros restantes.     │
├──────────────────────────────┤
│ Cambios permitidos           │
│ [Ver equivalencias]          │
├──────────────────────────────┤
│ Indicaciones del profesional │
└──────────────────────────────┘
```

---

# 11. Alumno — Historial

## 11.1 Resumen

- selector semana/mes;
- días registrados;
- objetivo vs real;
- consistencia del registro;
- tendencias explicables;
- sin score punitivo.

## 11.2 Día histórico

- fecha y zona horaria;
- versión vigente;
- objetivos congelados;
- intake congelado;
- correcciones;
- comentarios;
- datos legacy claramente etiquetados cuando no exista detalle real.

## 11.3 Wireframe

```txt
┌──────────────────────────────┐
│ Historial        Semana 28   │
│ L  M  X  J  V  S  D          │
│ ●  ●  ○  ●  ●  ○  ○          │
├──────────────────────────────┤
│ Martes 14                    │
│ 2.040 / 2.100 kcal           │
│ P 158/160 · C 225/230        │
│ 5 registros                  │
│ [Ver detalle]                │
├──────────────────────────────┤
│ Tendencia                    │
│ Registro 5/7 días            │
│ Proteína en rango 4/5        │
└──────────────────────────────┘
```

Legacy:

- “Historial anterior: comida marcada como completada”;
- no mostrar alimentos inventados;
- preservar plan/objetivo snapshot cuando exista.

---

# 12. Arquitectura de información — Coach

Nivel 1: Centro de Nutrición.

Tabs principales:

1. Resumen
2. Alumnos
3. Biblioteca

Nivel 2: Ficha nutricional del alumno.

Tabs:

1. Resumen
2. Plan
3. Diario
4. Progreso
5. Notas y protocolo

Nivel 3: Builder V2.

Pasos:

1. Estrategia
2. Objetivos
3. Construcción
4. Experiencia del alumno
5. Revisión
6. Publicación

---

# 13. Coach — Centro de Nutrición

## 13.1 Resumen

Cards:

- necesitan revisión;
- sin registro reciente;
- planes en borrador;
- planes por iniciar/vencer;
- productos pendientes;
- comentarios nuevos.

Cada alerta explica por qué aparece.

No usar “riesgo” clínico si el cálculo solo representa falta de datos.

## 13.2 Alumnos

Columnas desktop / datos de card móvil:

- nombre;
- estrategia;
- plan/version;
- registro de hoy;
- adherencia 7 días;
- última interacción;
- profesional/team;
- estado.

Filtros:

- requiere atención;
- sin plan;
- estrategia;
- team/profesional;
- adherencia;
- fecha de última actividad.

## 13.3 Biblioteca

Secciones:

- alimentos;
- recetas;
- comidas guardadas;
- plantillas;
- intercambios;
- productos por verificar.

No precargar datasets de tabs cerrados.

## 13.4 Wireframe desktop

```txt
┌─────────────────────────────────────────────────────────────┐
│ Nutrición                     [Ayuda] [+ Nuevo plan]         │
│ Resumen | Alumnos | Biblioteca                              │
├─────────────────────────────────────────────────────────────┤
│ [5 requieren revisión] [3 borradores] [2 GTIN pendientes]  │
├─────────────────────────────────────────────────────────────┤
│ Prioridad de hoy                                            │
│ Juan P. · sin registro 3 días · [Abrir ficha]              │
│ María R. · comentó su plan · [Revisar]                      │
├─────────────────────────────────────────────────────────────┤
│ Actividad reciente                                          │
└─────────────────────────────────────────────────────────────┘
```

## 13.5 Wireframe móvil

```txt
┌──────────────────────────────┐
│ Nutrición               +    │
│ Resumen Alumnos Biblioteca   │
├──────────────────────────────┤
│ 5 requieren revisión         │
│ [Ver alumnos]                │
├──────────────────────────────┤
│ Juan P.                      │
│ Sin registro hace 3 días     │
│ [Abrir]                      │
├──────────────────────────────┤
│ Borradores · 3               │
└──────────────────────────────┘
```

---

# 14. Coach — Ficha nutricional

## 14.1 Resumen

- plan/versión actual;
- estrategia;
- intake de hoy;
- objetivos;
- adherencia 7/30 días;
- hábitos;
- alertas explicadas;
- comentarios recientes;
- CTA editar/publicar versión.

## 14.2 Plan

- versión publicada;
- historial de versiones;
- vigencia;
- cambios;
- preview del alumno;
- duplicar como borrador.

## 14.3 Diario

- timeline real por fecha;
- esperado vs real;
- actor/correcciones;
- comentarios;
- edición profesional auditada.

## 14.4 Progreso

- kcal/macros;
- registro;
- anclas;
- hábitos;
- peso/medidas relacionados;
- reportes lazy.

## 14.5 Notas y protocolo

- nota privada;
- comentario visible;
- suplementos;
- protocolo;
- documentos futuros;
- autor y fecha.

## 14.6 Desktop master-detail

```txt
┌─────────────────────────────────────────────────────────────┐
│ ← Alumnos   Camila Soto      Híbrido · v3 · Activo          │
│ Resumen | Plan | Diario | Progreso | Notas                  │
├──────────────────────────────────────┬──────────────────────┤
│ Consumo de hoy                       │ Plan actual          │
│ Timeline / objetivos                 │ metas / vigencia     │
│                                      │ [Editar borrador]    │
│ Tendencias                           │                      │
│                                      │ Alertas explicadas   │
└──────────────────────────────────────┴──────────────────────┘
```

---

# 15. Builder V2

# 15.1 Paso 1 — Estrategia

Cards:

- Estructurado;
- Macros flexibles;
- Híbrido.

Cada card explica:

- cuándo usarla;
- qué verá el alumno;
- qué debe registrar;
- qué métricas estarán disponibles.

Selección no borra contenido existente sin confirmación.

# 15.2 Paso 2 — Objetivos

- kcal/P/C/G;
- cálculo manual o asistencia no-IA basada en fórmulas existentes;
- días entrenamiento/descanso;
- rangos/tolerancias;
- agua/hábitos;
- vigencia;
- restricciones del alumno visibles.

# 15.3 Paso 3 — Construcción

Según estrategia:

### Estructurado

- días;
- franjas;
- alimentos/recetas/grupos;
- cantidades;
- alternativas.

### Flexible

- objetivos;
- distribución opcional;
- recomendados/restringidos;
- mínimos.

### Híbrido

- anclas;
- remanente;
- reglas por franja;
- equivalencias.

# 15.4 Paso 4 — Experiencia del alumno

El coach define:

- puede cambiar cantidades: sí/no/rango;
- puede sustituir: sí/no/lista;
- puede mover franja: sí/no;
- puede registrar libremente: sí/no;
- comentarios y mensajes;
- qué CTA verá.

Preview:

- móvil claro;
- móvil oscuro;
- desktop;
- white label resuelto.

# 15.5 Paso 5 — Revisión

Checks:

- contenido completo;
- macros coherentes;
- conflictos con restricciones;
- elementos sin verificar;
- días vacíos;
- objetivos fuera de rangos configurados;
- cambios frente a versión actual;
- experiencia del alumno.

Los checks se clasifican:

- bloquea publicación;
- advertencia;
- información.

# 15.6 Paso 6 — Publicación

- fecha de inicio;
- notificación;
- mensaje;
- resumen de cambios;
- confirmación del scope;
- publicar.

## 15.7 Desktop

```txt
┌─────────────┬──────────────────────────────┬───────────────┐
│ OUTLINE     │ CANVAS                       │ INSPECTOR     │
│ Lunes       │ Desayuno                     │ Objetivos     │
│  Desayuno   │ [Huevos] [Pan] [+]           │ P/C/G         │
│  Almuerzo   │                              │ Restricciones │
│ Martes      │ Almuerzo                     │ Alertas       │
│             │ [Pollo] [Arroz] [+]          │               │
├─────────────┴──────────────────────────────┴───────────────┤
│ Guardado ✓       [Vista alumno] [Guardar borrador] [Sig.] │
└────────────────────────────────────────────────────────────┘
```

## 15.8 Móvil coach

```txt
┌──────────────────────────────┐
│ Nuevo plan · Paso 3 de 6     │
│ Construcción                 │
├──────────────────────────────┤
│ Lunes                        │
│ Desayuno                     │
│ Huevos · 2 un                │
│ Pan · 80 g                   │
│ [+ Agregar]                  │
├──────────────────────────────┤
│ [Anterior]       [Siguiente] │
└──────────────────────────────┘
```

No intenta replicar las tres columnas desktop.

---

# 16. Permisos del alumno por estrategia

| Acción | Estructurado | Flexible | Híbrido |
|---|---|---|---|
| Registrar alimento libre | configurable | sí | sí |
| Confirmar prescripción | sí | no aplica | sí para anclas |
| Cambiar cantidad prescrita | configurable | no aplica | configurable |
| Sustituir alimento | lista autorizada | libre según restricciones | lista/anclas |
| Mover de franja | configurable | sí | configurable |
| Ver macros restantes | sí | sí, principal | sí |
| Ver esperado vs real | sí | objetivo vs real | anclas + objetivo |

Las configuraciones se congelan por versión.

---

# 17. Adherencia y métricas

## 17.1 Principios

- mostrar datos base;
- explicar por qué una alerta aparece;
- distinguir falta de registro de incumplimiento;
- nunca diagnosticar;
- no asumir que menos calorías es mejor;
- no usar color como única señal.

## 17.2 Dimensiones

### Registro

```txt
franjas con intake / franjas esperadas
```

Solo cuando hay franjas esperadas.

### Energía y macros

- consumido;
- objetivo;
- diferencia;
- rango configurado.

### Anclas

```txt
anclas confirmadas con intake / anclas aplicables
```

### Similitud estructurada

Compara items vinculados y cantidades, sin impedir registrar alimentos diferentes.

### Consistencia

Días con información suficiente dentro de un periodo.

## 17.3 Presentación

En vez de:

> Adherencia: 62 — mala

Mostrar:

> Registraste 5 de 7 días.  
> Proteína estuvo dentro de tu rango en 4 de esos 5 días.  
> Dos anclas quedaron sin registro.

---

# 18. Efecto en otras áreas de EVA

## 18.1 Dashboard alumno

Widget compacto:

- macros restantes;
- próxima franja/ancla;
- estado de sync;
- CTA a Hoy.

No duplica timeline ni registro completo.

## 18.2 Dashboard coach

- alumnos que requieren revisión;
- borradores;
- actividad reciente;
- productos por verificar.

## 18.3 Check-ins y progreso

- peso/medidas sirven de contexto;
- no modifican automáticamente objetivos publicados;
- el coach crea y publica una versión nueva.

## 18.4 Notificaciones

Eventos:

- plan publicado;
- plan empieza mañana;
- comentario del profesional;
- recordatorio configurable de registro;
- producto faltante verificado;
- draft pendiente para coach.

No enviar macros ni información sensible en la pantalla bloqueada.

## 18.5 PDFs/exportación

- exportar versión publicada;
- fecha y profesional;
- branding permitido;
- no exportar borrador accidentalmente;
- permisos y auditoría.

## 18.6 Teams

- scope visible;
- actor;
- última edición;
- conflicto de borrador;
- publicación auditada;
- biblioteca personal/team separada.

---

# 19. Estados de interfaz

Cada superficie debe diseñar:

## 19.1 Loading inicial

- skeleton estructural;
- navegación visible;
- dimensiones finales;
- datasets secundarios diferidos.

## 19.2 Refetch

- contenido anterior permanece;
- pequeño estado `Actualizando`;
- no bloquear.

## 19.3 Vacío

Ejemplos:

- alumno sin plan;
- día sin intake;
- coach sin alumnos;
- biblioteca sin recetas;
- historial sin registros;
- GTIN desconocido.

Cada vacío explica y ofrece una acción real.

## 19.4 Error

- mensaje humano;
- detalle técnico solo para logs;
- retry;
- preservar cambios locales;
- foco accesible.

## 19.5 Offline

- plan cacheado visible;
- intake en cola;
- estado pendiente;
- retry automático moderado;
- acción manual;
- no prometer sincronización ya realizada.

## 19.6 Permiso denegado

Scanner:

- explicar por qué se necesita cámara;
- abrir ajustes cuando la plataforma lo permita;
- ingreso manual siempre disponible.

## 19.7 Conflicto

Builder Teams:

- “Este borrador cambió mientras trabajabas”;
- comparar/reload/guardar copia;
- no sobrescribir silenciosamente.

---

# 20. Tooltips, ayuda y microcopy

## 20.1 Regla

Un tooltip no reemplaza una interfaz comprensible.

Usar tooltip para:

- definición corta de un concepto;
- fórmula;
- estado de verificación;
- alcance de una acción secundaria.

Usar texto visible para:

- qué se publicará;
- qué verá el alumno;
- cambios históricos;
- acciones destructivas;
- permisos.

## 20.2 Ejemplos

### Macros flexibles

Título:

> Objetivos flexibles

Descripción:

> Defines las metas del día y el alumno registra los alimentos que elige para acercarse a ellas.

### Publicar

> El alumno verá esta versión desde el 20 de julio. La versión actual seguirá disponible en su historial.

### Intake desconocido

> Este código todavía no existe en EVA. Puedes enviarlo para revisión o registrar un alimento genérico equivalente.

### Prescripción frente a consumo

> “Esperado” muestra el plan del profesional. “Consumido” muestra lo que registraste realmente.

### Adherencia

> Se calcula con los días que tienen suficiente información. Un día sin registro no se interpreta automáticamente como incumplimiento.

---

# 21. Sistema de microanimaciones

Las microanimaciones se diseñan junto con cada componente. No quedan relegadas a la tanda de celebraciones.

## 21.1 Tokens de motion propuestos

```ts
const motion = {
  instant: 100,
  fast: 160,
  standard: 220,
  emphasis: 320,
  celebration: 600,
}
```

Easing conceptual:

- entrada/salida: ease-out/ease-in;
- selección: spring corta sin rebote excesivo;
- valores: interpolación estable;
- rechazo: desplazamiento mínimo, no sacudida agresiva.

## 21.2 Matriz de componentes

| Evento | Visual | RN | Web | Duración |
|---|---|---|---|---:|
| Press de botón | scale 0.98 + fill | Reanimated/Moti | CSS/Framer | 100–140 ms |
| Card seleccionada | borde/fill + check | Reanimated | Framer layout | 160–220 ms |
| Check confirmado | trazo + scale | Reanimated/SVG | SVG/Framer | 180–260 ms |
| Error de campo | pulse/translate corto + foco | Reanimated + haptic | CSS/Framer | 180–300 ms |
| Toggle | thumb + color semántico | Reanimated | CSS | 160–220 ms |
| Añadir alimento | inserción + subtotal | Layout animation | AnimatePresence | 180–300 ms |
| Editar cantidad | número interpola | Reanimated | motion value | 160–260 ms |
| Eliminar | colapso + undo | Reanimated | AnimatePresence | 180–260 ms |
| Guardar draft | spinner local → check | Moti | Framer/CSS | 220–400 ms |
| Publicar | progreso → success | Reanimated | Framer | 320–600 ms |
| Sync offline | pending → sync | Moti | CSS/Framer | 220–360 ms |
| Barcode lock | retícula se fija + haptic | Reanimated/Haptics | CSS/Framer | 160–240 ms |
| Barcode fallo | marco warning + texto | Reanimated | CSS | 220–320 ms |
| Macro progress | arco/barra interpola | Skia/Reanimated | SVG/Framer | 220–450 ms |
| Tab | indicador se desliza | Reanimated | layoutId | 180–260 ms |
| Sheet/dialog | slide/fade | RNGH/Reanimated | Base UI/Framer | 220–320 ms |
| Skeleton | shimmer suave | Moti | CSS | loop controlado |
| Toast success | entrada + check | notify kit/Moti | Sonner | 180–260 ms |
| Toast error | entrada + icono/texto | notify kit/Moti | Sonner | 180–260 ms |

## 21.3 Confirmaciones

Ejemplo `Comí esto`:

1. botón baja 2%;
2. aparece progreso local;
3. card cambia de `Esperado` a `Consumido`;
4. check se dibuja;
5. macros interpolan;
6. haptic success RN;
7. mensaje accesible `Comida registrada`.

No se lanza confetti por cada comida.

## 21.4 Rechazo/error

Ejemplo cantidad inválida:

1. input conserva valor;
2. borde pasa a danger;
3. desplazamiento horizontal de 2–4 px una sola vez;
4. mensaje explica el rango;
5. foco permanece;
6. haptic warning opcional;
7. reduced motion elimina desplazamiento.

## 21.5 Cards

- press state inmediato;
- selección persistente evidente;
- expansión con layout animation;
- no animar todas las cards al hacer scroll;
- listas virtualizadas reciclan sin reanimar cada aparición.

## 21.6 Progreso

- animar del valor anterior al nuevo;
- no arrancar siempre desde cero;
- números y gráficos terminan simultáneamente;
- el color macro es sistema;
- completar un rango puede emitir check pequeño;
- exceder no dispara una animación castigadora.

## 21.7 Guardado

Estados visibles:

```txt
Sin cambios → Guardando… → Guardado ✓
                    ↘ Error · Reintentar
```

El check permanece brevemente y vuelve a texto neutro.

## 21.8 Celebraciones mayores

Reservadas para:

- primer intake;
- primer plan publicado;
- cierre del día;
- siete días registrados;
- primera semana con objetivo definido cumplido;
- coach deja su bandeja sin pendientes.

Se implementarán después del spike Rive/Lottie. Las microanimaciones anteriores no dependen de esa decisión.

## 21.9 Reduced motion

- desactiva desplazamientos y springs;
- mantiene cambio de color, icono y texto;
- progress puede actualizar sin interpolación o con fade corto;
- confetti/loops desactivados;
- nunca elimina feedback funcional.

## 21.10 White label y motion

Puede usar marca:

- selección;
- CTA;
- focus;
- partículas secundarias;
- progreso global autorizado.

Debe usar sistema:

- success/error/warning;
- macros;
- verificación;
- restricciones;
- estados offline.

---

# 22. Tema claro, oscuro y white label

## 22.1 Matriz obligatoria

Cada componente se revisa en:

1. EVA claro;
2. EVA oscuro;
3. white label claro con marca clara;
4. white label oscuro con marca saturada/oscura.

## 22.2 Contraste

- texto normal WCAG AA;
- focus visible;
- badges no dependen solo del color;
- charts tienen label/tooltip/tabla accesible;
- tint de marca se deriva con `@eva/brand-kit`;
- no usar hex de coach directamente sobre texto/surface.

## 22.3 Superficies

- fondos/card/bordes: sistema;
- primary CTA: white label;
- Nutrición: Ember para identidad de dominio;
- macros: paleta fija;
- success/warning/danger: sistema;
- dark mode no es invertir colores manualmente.

---

# 23. Responsive y desktop

## 23.1 Alumno

### < 768 px

- una columna;
- bottom nav/segmentos;
- bottom sheets;
- CTA sticky cuando sea útil;
- cards completas.

### 768–1199 px

- dos columnas selectivas;
- timeline + resumen compacto;
- dialogs/sheets según tarea.

### ≥1200 px

- timeline principal;
- rail de resumen;
- ancho de lectura controlado;
- no estirar cards de alimento a todo viewport.

## 23.2 Coach

### Móvil

- tabs;
- cards;
- stepper Builder;
- acciones sticky.

### Tablet

- master-detail adaptable;
- inspector colapsable.

### Desktop

- sidebar/outline;
- canvas;
- inspector;
- preview;
- tablas virtualizadas/paginadas.

---

# 24. Accesibilidad

## Web

- HTML semántico;
- teclado completo;
- focus management en dialog/sheet;
- `aria-live` para guardado/sync;
- labels visibles;
- tooltips accesibles;
- skip/heading hierarchy;
- reduced motion.

## RN

- `accessibilityRole`;
- labels/hints;
- orden lógico;
- Dynamic Type probado;
- TalkBack/VoiceOver;
- targets ≥44 px;
- haptics nunca como única señal;
- safe areas/orientation.

## Reorder

Drag tiene alternativa:

- mover arriba;
- mover abajo;
- elegir posición.

---

# 25. Eventos de analytics permitidos

Permitidos, sin payload nutricional sensible:

- `nutrition_v2_opened`;
- `nutrition_tab_changed`;
- `food_search_started`;
- `barcode_scan_result` con `known: boolean`;
- `intake_saved` con source/franja, sin nombre de alimento;
- `plan_draft_saved`;
- `plan_review_blocked` con tipo de regla;
- `plan_published` con strategy/version;
- `nutrition_offline_queued`;
- `nutrition_sync_completed`;
- `nutrition_ui_error` con código técnico.

No enviar:

- nombres de alimentos;
- cantidades;
- notas;
- alergias;
- peso/medidas;
- suplementos;
- contenido del plan.

---

# 26. Casos críticos y respuestas

## Alumno registra dos veces

- idempotency key;
- UI bloquea repetición mientras guarda;
- servidor no duplica;
- sync reconcilia.

## Coach publica mientras otro edita

- version/etag;
- conflicto explícito;
- no sobrescribir.

## Plan cambia a mitad del día

- snapshot del día conserva versión aplicable;
- nueva versión inicia en fecha configurada;
- no muta objetivo ya registrado sin decisión explícita.

## Alumno cruza medianoche

- fecha local y timezone congeladas;
- intake asignado según regla de día local;
- pruebas DST/Santiago.

## Producto desconocido

- cola GTIN;
- sin macros inventados;
- genérico equivalente opcional y etiquetado.

## Offline

- ver plan cacheado;
- registrar en cola;
- actor/timezone/source persistidos;
- reintento idempotente.

---

# 27. Criterios de aceptación de Tanda 1

- [x] tres estrategias definidas;
- [x] roles Base/Pro/Teams definidos;
- [x] prescripción, intake y adherencia separados;
- [x] ciclo draft/review/publish/version definido;
- [x] IA alumno cerrada;
- [x] IA coach cerrada;
- [x] Builder V2 definido;
- [x] permisos del alumno definidos;
- [x] impacto transversal documentado;
- [x] wireframes móvil y desktop;
- [x] estados loading/error/empty/offline/permisos;
- [x] tooltips y microcopy contratados;
- [x] microanimaciones por componente;
- [x] reduced motion;
- [x] claro/oscuro/white label;
- [x] responsive/tablet/desktop;
- [x] accesibilidad;
- [x] analytics sin datos sensibles;
- [x] cero migraciones;
- [x] cero cambio funcional productivo.

**Tanda 1: completada.**

---

# 28. Tablero preparado para Tanda 2

## Design tokens y motion

- motion durations/easing/springs;
- tokens de estado sync/offline;
- tokens de Nutrición adicionales solo si son necesarios;
- ampliar parity gate web/RN.

## Componentes

- `NutritionPageShell`;
- `NutritionHeader`;
- `NutritionTabs`;
- `MacroBudget`;
- `MacroProgress`;
- `MealTimeline`;
- `MealSlotCard`;
- `PrescriptionBlock`;
- `IntakeFoodRow`;
- `FoodThumbnail`;
- `PlanVersionBadge`;
- `SyncState`;
- `NutritionSkeletons`;
- `NutritionEmptyState`;
- `NutritionErrorState`;
- `CoachAttentionCard`;
- `BuilderStep`;
- `BuilderInspector`;
- `StudentPreview`.

## Pruebas

- visual snapshots;
- contraste;
- token parity;
- microanimation reduced motion;
- keyboard/focus;
- RN accessibility;
- component contracts.

## Restricción

Tanda 2 construirá el kit visual y contratos de componentes. Tanda 3 podrá comenzar en paralelo solo cuando sus contratos de datos no obliguen a inventar UI fuera de este documento.
