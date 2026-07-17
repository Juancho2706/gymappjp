# EVA Nutrición V2 — Tanda 3

## Dominio aditivo, versionado, snapshots y consumo canónico

**Estado:** completada  
**Fecha:** 14 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`  
**Base:** `rnmobiledenuevo`  
**PR:** #121, draft  
**Supabase:** `constant` (`jikjeokundmaafuytdcx`) — migraciones aditivas aplicadas

---

## 1. Resultado

Esta tanda añadió el dominio versionado de Nutrición V2 sin sustituir tablas legacy, reinterpretar historial ni activar nuevas pantallas para usuarios.

Principios aplicados:

- V1 permanece operativa;
- las nuevas entidades usan sufijo `_v2`;
- la tabla canónica existente de intake se amplió con columnas paralelas;
- ninguna columna o tabla legacy se eliminó;
- los checks legacy de `source`, `capture_method` y `meal_slot` no se modificaron;
- las escrituras V2 traducen valores ricos a valores legacy compatibles;
- no se migró historial antiguo a alimentos inventados;
- no se activó `nutrition_v2`;
- no se añadió tráfico productivo hacia las tablas nuevas.

---

## 2. Migraciones aplicadas

Archivos Git:

```txt
supabase/migrations/20260714190000_nutrition_v2_domain.sql
supabase/migrations/20260714190500_nutrition_v2_security_rpc.sql
supabase/migrations/20260714191000_nutrition_v2_hardening.sql
supabase/migrations/20260714191500_nutrition_v2_private_notes.sql
supabase/migrations/20260714192000_nutrition_v2_history_adapter_fix.sql
supabase/migrations/20260714192500_nutrition_v2_draft_delete_and_effective_versions.sql
```

Versiones registradas por Supabase:

```txt
20260714185641 nutrition_v2_domain
20260714185900 nutrition_v2_security_rpc
20260714190012 nutrition_v2_hardening
20260714190159 nutrition_v2_private_notes
20260714190542 nutrition_v2_history_adapter_fix
20260714192500 nutrition_v2_draft_delete_and_effective_versions
```

Las marcas de tiempo de Git son identificadores ordenados del repositorio; Supabase registra la hora real de aplicación.

---

## 3. Modelo de prescripción V2

### `nutrition_plans_v2`

Representa la relación nutricional lógica con un alumno:

- alumno;
- coach propietario;
- scope org/team;
- nombre;
- estrategia;
- estado activo/archivado;
- última versión publicada;
- actores y timestamps.

La identidad del plan —alumno, coach, org y team— es inmutable mediante trigger para usuarios autenticados.

### `nutrition_plan_versions_v2`

Representa una prescripción versionada:

- número de versión;
- estado `draft / published / superseded / archived`;
- estrategia;
- fecha efectiva;
- timezone;
- permisos del alumno;
- notas visibles y protocolo;
- versión padre;
- publicación e idempotencia;
- `lock_version` para concurrencia optimista.

Reglas:

- solo un borrador puede editarse directamente;
- estado y publicación cambian mediante RPC;
- una publicación no muta el contenido histórico;
- cada actualización directa de borrador incrementa `lock_version`;
- el cliente deberá filtrar por el `lock_version` leído para detectar conflictos.

### `nutrition_day_variants_v2`

Contiene:

- variante por día;
- objetivo energético y macros;
- fibra, sodio y agua;
- variante predeterminada;
- orden.

### `nutrition_meal_slots_v2`

Contiene:

- franja/ancla;
- hora;
- modo `anchor / flexible`;
- obligatoriedad;
- objetivos por franja;
- instrucciones.

### `nutrition_prescription_items_v2`

Contiene:

- alimento, receta o item custom;
- cantidad/unidad;
- rango permitido;
- opcionalidad;
- grupo de sustitución;
- snapshot nutricional;
- orden.

Variantes, franjas e items pueden eliminarse únicamente mientras la versión siga en borrador. Las versiones publicadas no cumplen la policy de borrador y permanecen inmutables.

---

## 4. Publicación y vigencia

RPC:

```txt
publish_nutrition_plan_v2
```

Garantías:

- autenticación y scope profesional;
- solo borradores;
- idempotency key;
- al menos una variante;
- estructurado/híbrido requieren una franja;
- publicación transaccional;
- cierre de vigencia de la versión anterior;
- actualización del puntero lógico;
- audit log.

### Versiones programadas

Al publicar una versión futura:

- la versión anterior pasa a `superseded` con `effective_to`;
- continúa siendo la versión efectiva hasta ese día;
- los snapshots resuelven `published` o `superseded` según el rango de fechas;
- desde la nueva fecha se resuelve la versión nueva.

Se probó con rollback:

- versión 1 efectiva antes del cambio;
- versión 2 efectiva después del cambio;
- objetivos correctos en ambos snapshots.

---

## 5. Snapshot diario

Tabla:

```txt
nutrition_day_snapshots_v2
```

RPC:

```txt
ensure_nutrition_day_snapshot_v2
```

Cada snapshot congela:

- fecha local;
- timezone;
- plan y versión aplicables;
- variante;
- estrategia;
- objetivos;
- permisos del alumno;
- árbol prescrito serializado.

Garantías:

- único por alumno/fecha;
- idempotente;
- inmutable para clientes;
- un día sin plan puede tener snapshot vacío honesto;
- publicar posteriormente no reescribe un día ya congelado.

---

## 6. Consumo canónico

Se conserva:

```txt
nutrition_intake_entries
```

Columnas V2 añadidas:

- `idempotency_key`;
- `actor_user_id`;
- `actor_role`;
- `entry_status`;
- `corrects_entry_id`;
- `corrected_by_entry_id`;
- `correction_reason`;
- `occurred_at`;
- `timezone`;
- `plan_version_id`;
- `day_snapshot_id`;
- `prescription_item_id`;
- `intake_source_v2`;
- `capture_method_v2`;
- `meal_slot_v2`;
- `revision`.

Las columnas y checks legacy permanecen intactos.

### Registro

RPC:

```txt
record_nutrition_intake_v2
```

Garantías:

- student self o profesional dentro de scope;
- idempotencia por alumno;
- alimento o nombre custom requerido;
- cantidad positiva;
- fecha, hora y timezone explícitos;
- validación de versión/item contra el alumno;
- snapshot diario automático;
- snapshot nutricional del alimento;
- mapeo compatible hacia columnas legacy;
- audit log.

Una fila V2 no puede editarse ni eliminarse directamente. El trigger reconoce V2 por `idempotency_key`; las filas V1 continúan con su comportamiento actual.

### Corrección

RPC:

```txt
correct_nutrition_intake_v2
```

No modifica silenciosamente el dato original:

1. crea una nueva entrada;
2. enlaza `corrects_entry_id`;
3. aumenta `revision`;
4. marca la anterior como `corrected`;
5. enlaza `corrected_by_entry_id`;
6. registra motivo y auditoría.

---

## 7. Historial legacy

RPC:

```txt
get_nutrition_history_adapter_v2
```

Devuelve en una sola forma:

- intake canónico V2 activo;
- completitud legacy de comidas.

Los registros antiguos se etiquetan:

```txt
legacy_completion_without_food_detail
```

No se inventan:

- alimentos;
- cantidades por item;
- macros consumidos;
- timestamps inexistentes.

---

## 8. Notas privadas

Se detectó que RLS no oculta una columna dentro de una fila que el alumno sí puede leer. Por ello las notas privadas se separaron en:

```txt
nutrition_plan_private_notes_v2
```

Garantías:

- solo profesionales con scope;
- el alumno obtiene cero filas;
- `private_notes` dentro de la versión quedó deprecada antes del rollout;
- authenticated no tiene privilegio de SELECT sobre esa columna;
- versiones exponen únicamente columnas seguras mediante column grants.

---

## 9. RLS y permisos

Todas las tablas V2 públicas tienen RLS activo.

Scopes considerados:

- alumno sobre sí mismo;
- coach standalone;
- org owner/admin;
- coach asignado dentro de org;
- owner/team member activo.

Principios:

- `USING` y `WITH CHECK`;
- funciones con `search_path` vacío;
- anon no ejecuta RPCs V2;
- authenticated ejecuta solamente gateways públicos y helpers booleanos requeridos por RLS;
- helpers de audit/snapshot/actor no son ejecutables directamente;
- no hay INSERT/UPDATE directo sobre snapshots o auditoría;
- no hay DELETE de planes/versiones;
- DELETE estructural solo en borradores;
- publicación e intake V2 pasan por RPC.

Auditoría SQL posterior confirmó:

- RLS activo en ocho tablas V2;
- policies explícitas por operación;
- funciones V2 con `search_path` fijo;
- anon sin EXECUTE en los cinco RPCs públicos;
- private helpers sensibles sin EXECUTE authenticated.

---

## 10. Índices

Índices añadidos para:

- plan activo por alumno;
- coach/alumno;
- org/team/alumno;
- versiones por vigencia;
- una versión publicada abierta;
- publicación idempotente;
- variante por día;
- franjas/items ordenados;
- alimentos/recetas;
- snapshot por alumno/fecha;
- intake por alumno/fecha/estado;
- intake por versión/snapshot/prescripción;
- correction chain;
- auditoría por alumno/versión.

No se eliminó ningún índice legacy. Los advisors marcarán inicialmente varios índices V2 como “unused” porque las tablas todavía no reciben tráfico; eso no es motivo para retirarlos antes del canary.

---

## 11. Pruebas ejecutadas

Se ejecutó una transacción integral que terminó con `ROLLBACK` y validó:

- scope coach;
- creación de plan/version/variante/franja/item;
- notas privadas;
- publicación;
- idempotencia de publicación;
- bloqueo del puntero publicado;
- aislamiento de notas privadas;
- bloqueo de columna privada;
- alumno sin UPDATE de versión publicada;
- snapshot idempotente;
- intake idempotente;
- intake inmutable;
- correction chain;
- historial V2;
- BOLA/IDOR negativo.

Se ejecutó además un rollback específico de versiones programadas.

Después de los rollbacks se verificó:

```txt
planes de prueba: 0
versiones de prueba: 0
intakes de prueba: 0
snapshots de prueba: 0
```

Test repetible añadido:

```txt
supabase/tests/nutrition_v2_domain_rollback.sql
```

El archivo elige un scope standalone existente, usa IDs aleatorios, una fecha de 2099 y siempre termina con `ROLLBACK`.

---

## 12. Estado productivo

Aplicado en producción:

- esquema/tablas/columnas V2;
- RLS;
- índices;
- triggers;
- RPCs;
- grants.

No activado:

- feature flag;
- rutas V2;
- dual-write;
- migración de alumnos;
- backfill de planes;
- UI nueva;
- jobs automáticos;
- bucket de imágenes.

Por lo tanto, el cambio actual consume prácticamente cero tráfico adicional y no altera lo que ve o escribe V1.

---

## 13. Criterios de cierre

- [x] dominio paralelo/aditivo;
- [x] planes lógicos;
- [x] versiones;
- [x] variantes/franjas/items;
- [x] publicación transaccional;
- [x] vigencia futura;
- [x] snapshots diarios;
- [x] intake canónico ampliado;
- [x] idempotencia;
- [x] actor/source/método;
- [x] correcciones inmutables;
- [x] adaptador legacy honesto;
- [x] notas privadas aisladas;
- [x] RLS alumno/coach/org/team;
- [x] BOLA negativo;
- [x] fixed search path;
- [x] grants mínimos;
- [x] índices;
- [x] rollback integral;
- [x] rollback de programación futura;
- [x] cero residuos de prueba;
- [x] V1 intacta;
- [x] flag apagado.

**Tanda 3: completada.**
