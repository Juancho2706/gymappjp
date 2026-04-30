# Runbook Saneamiento Nutricion - Planes con Comidas Vacias

Generado: 2026-04-30T03:59:30.372Z

Casos detectados: **17** filas de comida vacia

## Reglas de seguridad

- No borrar `daily_nutrition_logs` ni `nutrition_meal_logs`.
- No borrar planes activos en produccion para corregir vacios.
- Correccion in-place en builder (agregar >= 1 alimento por comida vacia).

## Checklist operativo por caso

- [ ] Abrir plan en builder del coach.
- [ ] Completar cada comida vacia con al menos 1 alimento.
- [ ] Guardar y verificar vista alumno (checks/anillos).
- [ ] Verificar vista coach (historial y macros).
- [ ] Marcar caso como resuelto en este runbook.

## Coach Joaquin antonio Miranda ruiz (joaquinamr7)

### Alumno: alejandro martinez
- Plan: Plan nutricional Alejandro Martinez
- Plan ID: `0ada20f9-0eb2-4815-9326-58c1d96f6992`
- Ultimo log: 2026-04-29
- Logs: 2 | Completadas: 4
- Comidas vacias: `Comida 1`, `Comida 2`, `Comida 3`, `Comida 4`
- Estado: [ ] Pendiente  [ ] En proceso  [ ] Resuelto

### Alumno: carolina janampa
- Plan: Plan Nutricional Carolina Janampa
- Plan ID: `97118616-55e7-4c53-aa43-edbddfc21134`
- Ultimo log: 2026-04-29
- Logs: 3 | Completadas: 4
- Comidas vacias: `meal 4`
- Estado: [ ] Pendiente  [ ] En proceso  [ ] Resuelto

### Alumno: carolina valero 
- Plan: dieta carolina valero
- Plan ID: `4fc4e52e-fccb-4c73-bfa4-b735684c3a5b`
- Ultimo log: 2026-04-28
- Logs: 5 | Completadas: 0
- Comidas vacias: `Comida 1`, `Comida 2`, `Comida 3`, `Comida 4`, `Comida 5`
- Estado: [ ] Pendiente  [ ] En proceso  [ ] Resuelto

### Alumno: linda blanco
- Plan: Plan Nutricional Linda Blanco
- Plan ID: `5e7d7436-0413-4f96-8529-14940e52198e`
- Ultimo log: 2026-04-29
- Logs: 5 | Completadas: 11
- Comidas vacias: `Comida 5`
- Estado: [ ] Pendiente  [ ] En proceso  [ ] Resuelto

### Alumno: Macarena Hernández 
- Plan: plan nutricional macarena hernandez
- Plan ID: `8902e0f6-73ee-4062-b5b7-2f9bd666feae`
- Ultimo log: 2026-04-26
- Logs: 4 | Completadas: 0
- Comidas vacias: `Comida 1`, `Comida 2`, `Comida 3`, `Comida 4`
- Estado: [ ] Pendiente  [ ] En proceso  [ ] Resuelto

### Alumno: paula aguirre
- Plan: Déficit calórico paula
- Plan ID: `f767021a-dc64-48d0-9bbd-5e40ce572205`
- Ultimo log: 2026-04-25
- Logs: 3 | Completadas: 1
- Comidas vacias: `Comida 1`, `Comida 5`
- Estado: [ ] Pendiente  [ ] En proceso  [ ] Resuelto

