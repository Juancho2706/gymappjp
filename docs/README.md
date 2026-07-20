---
status: active
owner: platform
last_verified: 2026-07-20
canonical: true
---

# EVA documentation

Leer primero [CURRENT.md](status/CURRENT.md). Este es el único índice manual del proyecto.

## Fuentes canónicas

| Tema | Documento |
|---|---|
| Estado y siguiente trabajo | [status/CURRENT.md](status/CURRENT.md) |
| Producto, actores y capacidades | [product/PRODUCT_OVERVIEW.md](product/PRODUCT_OVERVIEW.md) |
| Estructura y dependencias | [architecture/PROJECT_STRUCTURE.md](architecture/PROJECT_STRUCTURE.md) |
| Flujos, permisos y componentes | [architecture/FLOWS_AND_COMPONENTS.md](architecture/FLOWS_AND_COMPONENTS.md) |
| Tokens de diseño web/native | [architecture/design-system/TOKENS.md](architecture/design-system/TOKENS.md) |
| Paridad web ↔ React Native | [status/MOBILE_PARITY.md](status/MOBILE_PARITY.md) |
| Pruebas y gates | [testing/TEST_STATUS.md](testing/TEST_STATUS.md) |
| Personas E2E | [testing/E2E_PERSONAS.md](testing/E2E_PERSONAS.md) |
| Acciones manuales pendientes | [operations/MANUAL_TASKS.md](operations/MANUAL_TASKS.md) |
| Incidentes y operación | [operations/RUNBOOK.md](operations/RUNBOOK.md) |

## Runbooks especializados

- [Nutrition V2 rollout](operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md)
- [Importación del catálogo chileno](operations/FOOD_CATALOG_CL_IMPORT.md)
- [Releases OTA móvil](operations/MOBILE_RELEASES_OTA.md)
- [Checklist DB de paridad RN](operations/RN-PARITY-DB-CHECKLIST.md)
- [Notas seguras para revisión de stores](operations/APP_REVIEW_NOTES.md)

## Evidencia e historia

- [Política de auditorías](audits/README.md)
- [Política de archivo](archive/README.md)

Estas carpetas aportan contexto puntual o trazabilidad; nunca reemplazan estado, runbooks ni specs activas.

## Legal

- [Términos de servicio](legal/tos.md)
- [Política de privacidad](legal/privacy-policy.md)
- [Contrato Enterprise](legal/enterprise-contract-template.md)

Los textos legales requieren revisión humana antes de cambios productivos.

## Specs activas

Una feature nueva usa:

```text
specs/<feature>/
├── SPEC.md
├── PLAN.md
└── TASKS.md
```

`specs/` contiene únicamente trabajo real en diseño o ejecución. Al terminar o cancelar una feature, se extrae cualquier decisión duradera y el material deja el árbol activo. Git conserva el historial; no mantener un segundo backlog en documentación.

## Reglas de ciclo de vida

Todo documento canónico comienza con:

```yaml
---
status: active
owner: <equipo responsable>
last_verified: YYYY-MM-DD
canonical: true
---
```

- Un solo documento `canonical: true` por tema.
- `status: active` exige mantenimiento en el mismo cambio que altera su verdad.
- `canonical: false` identifica referencia o evidencia puntual; no gobierna decisiones.
- `archive/`, auditorías, planes cerrados y reportes point-in-time son históricos.
- Handoffs, prompts, session logs, `_exec`, portlogs y fixlogs no pertenecen a documentación activa.
- No guardar credenciales, secretos, datos personales, PDFs privados ni exports generados.
- No declarar “completo” sin evidencia en testing/paridad.

## Validación

```bash
pnpm docs:check
```

El check documental debe impedir enlaces internos rotos, secretos obvios y handoffs activos. No reemplaza la revisión de contenido contra código, configuración y estado remoto.

## Prioridad ante contradicciones

1. Seguridad y RLS ejecutable.
2. Código, migraciones y configuración del entorno.
3. Documento canónico de este índice.
4. Spec activa.
5. Evidencia/auditoría histórica.

Si dos fuentes difieren, corregir o retirar la menos confiable; no agregar una tercera explicación.
