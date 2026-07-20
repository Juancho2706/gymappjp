---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-20 @ 34b09d8f"
canonical: false
role: execution-policy
source_of_truth: specs/rn-mobile-parity-redesign/PLAN.md
---

# Política de olas de paridad 1:1

Reglas estables para dividir y cerrar el port. El orden vivo está en [`TASKS.md`](../../specs/rn-mobile-parity-redesign/TASKS.md) y el estado efectivo en [`MOBILE_PARITY.md`](../status/MOBILE_PARITY.md).

## Entrada de una tarea

Una diferencia entra a una ola cuando:

1. existe evidencia actual en web responsive;
2. RN difiere de forma observable o funcional;
3. no es una adaptación nativa inevitable que preserve el resultado;
4. la spec define una comprobación objetiva.

También entran diferencias P2 de layout, copy, tipografía, color, animación, estados y branding. No entran refactors sin efecto observable, ideas de producto ausentes en web ni migraciones preventivas.

Si web parece contener un bug, se documenta y se decide si el arreglo debe aterrizar en ambas superficies. No se replica silenciosamente ni se “mejora” solo RN.

## Tamaño y aislamiento

- Ola recomendada: 3–5 unidades y 10–15 superficies como máximo.
- Un solo owner por archivo durante la ola.
- Unidades que editan el mismo monolito corren secuencialmente.
- Primitivas compartidas tienen una unidad dueña y regresión explícita de consumidores.
- Dependencias nativas se agrupan; no se agregan a mitad de una ola sin recalcular el build gate.

## Gates

Por unidad:

- spec y revisión adversarial;
- lente de lógica/estado;
- typecheck y pruebas afectadas;
- cero diferencias accionables.

Por ola:

- paridad de tokens;
- export Android;
- build de cada plataforma afectada;
- matriz device light/dark × EVA/custom brand;
- smoke de flujos modificados;
- actualización de tareas y estado canónico.

Un artefacto construido no equivale a QA aprobado.

## Datos y Supabase

Las unidades de UI no deben crear cambios de DB por conveniencia. Si una unidad necesita schema, GRANT o RLS:

1. confirmar primero el estado real de Supabase Pro/Branching;
2. con Branching disponible: `create_branch` → migración aditiva e idempotente → seed sintético y pruebas RLS con rol real → advisors sin críticos → snapshot de prod → `merge_branch` → `db pull` y tipos → `delete_branch` el mismo día;
3. sin Branching disponible: protocolo aditivo-en-LIVE con snapshot, prueba sintética, advisors y verificación posterior;
4. nunca `db push` ciego, DDL destructiva ni pruebas con `service_role` para demostrar RLS.

Toda mutación de módulos pagos mantiene el gate server-side; la UI nunca sustituye `assertModule` o RLS.

## Checkpoint y rollback

- Rama de entrega: `rnmobiledenuevo`; producción: `master` mediante merge revisado.
- Un checkpoint coherente por ola, sin pantallas parcialmente expuestas.
- OTA solo para cambios compatibles con el runtime instalado.
- Cambios nativos requieren binario nuevo.
- Rollback preferido: revert del checkpoint o artefacto anterior; las migraciones deben ser forward-only.

## Evidencia

La spec de cada unidad conserva evidencia útil. Capturas finales pueden vivir en `docs/audits/rn-parity-qa/` mientras formen parte de una certificación activa. Prompts, logs de agentes y reportes redundantes no forman parte del producto documental.
