-- ============================================================================
-- PERF — private.nutrition_v2_valid_timezone(text) sin escanear pg_timezone_names
-- ----------------------------------------------------------------------------
-- Version vigente (20260728121000:49-59, NUT-016), leida de LIVE con pg_get_functiondef:
--     language sql stable set search_path = ''
--     select p_tz is not null
--        and exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz);
--
-- Problema: `pg_timezone_names` es una SRF, no una tabla: no hay indice y el filtro
-- `name = p_tz` se aplica DESPUES de materializar las ~1.194 filas del catalogo (cada
-- fila abre el archivo de zona del sistema). Medido en PROD 2026-09-05:
--     explain analyze select private.nutrition_v2_valid_timezone('America/Santiago')
--       => Execution Time 56.066 ms
--     promedio sobre 200 llamadas en loop plpgsql => 55.760 ms por llamada
--
-- Quien la llama (grep en supabase/migrations, todas en 20260728121000):
--   · :74  private.nutrition_v2_safe_timezone(text)      -> case when valid then p_tz else 'America/Santiago'
--   · :109 private.nutrition_v2_ensure_day_snapshot(...)  -> guard `nutrition_v2_invalid_timezone`
--   · :235 wrapper publico ensure_nutrition_day_snapshot_v2 -> mismo guard, error temprano
-- Esas tres cuelgan de los RPC de nutricion V2 mas calientes de pg_stat_statements
-- (p_timezone en el payload): 7.146 + 4.633 + 2.182 + 1.894 llamadas.
--
-- NOTA sobre la cifra "374 llamadas a 260 ms" del brief: en pg_stat_statements esa
-- entrada es `SELECT name FROM pg_timezone_names` con rows=446.556 (= 1.194 filas por
-- llamada), o sea un cliente que se baja la LISTA COMPLETA (Studio / algun panel), NO
-- esta funcion — el `where n.name = p_tz` devolveria 1 fila. El costo de esta funcion
-- no aparece con query propia porque se contabiliza dentro del RPC que la invoca.
-- El escaneo igual es real y es lo que se corrige aca.
--
-- Fix: intentar la conversion barata `now() at time zone p_tz` y atrapar 22023
-- (invalid_parameter_value). Se pasa a plpgsql (sql no tiene EXCEPTION), manteniendo
-- firma, STABLE y `set search_path = ''` (pg_catalog sigue implicito, igual se califica).
--
-- EQUIVALENCIA (esto es lo delicado): `at time zone` acepta cosas que
-- pg_timezone_names NO lista — offsets numericos ('+05'), POSIX ('UTC+5', '<+05>-5') y
-- las abreviaturas de pg_timezone_abbrevs ('CLT'). Para no ensanchar el guard se usa un
-- camino hibrido barato: si el texto trae '/' es un nombre IANA y el try alcanza
-- (ninguna abreviatura ni spec POSIX lleva '/'); si NO trae '/' se cae al exists() de
-- siempre, que es el caso raro (EST, UTC, Japan, GB...) y ademas ya era el costo actual.
--   · UNICA diferencia conocida y ACEPTADA: el camino con '/' es case-insensitive,
--     porque la resolucion de zonas de Postgres lo es. 'america/santiago' hoy da false
--     y con esta version da true. Es un ensanche inocuo — `now() at time zone
--     'america/santiago'` devuelve exactamente lo mismo que con 'America/Santiago' — y
--     de hecho arregla un bug latente: hoy safe_timezone() manda cualquier nombre en
--     minuscula al fallback 'America/Santiago' (un alumno con 'europe/madrid' terminaba
--     con el dia local de Chile).
--
-- TESTS ejecutados en PROD dentro de BEGIN … ROLLBACK (2026-09-05), viejo vs nuevo:
--   input               antes    despues
--   'America/Santiago'  true     true
--   'Europe/Madrid'     true     true
--   'Invalid/Zone'      false    false
--   'America/Invalid'   -        false
--   ''                  false    false
--   '  '                false    false
--   null                false    false
--   'EST'               true     true    (fallback exists, sin '/')
--   'UTC'               -        true    (fallback)
--   'Japan'             -        true    (fallback)
--   'Etc/GMT+5'         -        true
--   'CLT'               false    false   (abreviatura: fallback la rechaza)
--   '+05'               false    false
--   'UTC+5'             false    false
--   '<+05>-5'           -        false
--   Tiempos (explain analyze, misma sesion):
--     antes  'America/Santiago' => 56.066 ms   |  promedio 200 loops: 55.760 ms
--     despues'America/Santiago' =>  0.618 ms   |  promedio 200 loops:  0.014 ms
--     despues'EST' (fallback)   => 56.184 ms   (esperado: cae al catalogo)
--   => ~93x mas rapido en el camino que usan RN y web (siempre nombre IANA con '/').
--
-- ROLLBACK: re-aplicar el bloque `create or replace function
-- private.nutrition_v2_valid_timezone` de 20260728121000 (lineas 49-59).
-- Los GRANT/REVOKE no se tocan: create or replace preserva el ACL existente; igual se
-- repite el revoke por idempotencia.
-- ============================================================================

create or replace function private.nutrition_v2_valid_timezone(p_tz text)
returns boolean
language plpgsql
stable
set search_path = ''
as $fn$
begin
  if p_tz is null or pg_catalog.btrim(p_tz) = '' then
    return false;
  end if;

  -- Sin '/': abreviatura ('CLT'), spec POSIX ('UTC+5', '<+05>-5') o uno de los pocos
  -- nombres planos del catalogo ('EST', 'UTC', 'Japan'). Camino exacto y poco frecuente.
  if pg_catalog.strpos(p_tz, '/') = 0 then
    return exists (
      select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz
    );
  end if;

  -- Camino caliente: nombre IANA. Si la zona no existe, `at time zone` lanza 22023.
  perform pg_catalog.now() at time zone p_tz;
  return true;
exception
  when invalid_parameter_value then
    return false;
end;
$fn$;

revoke all on function private.nutrition_v2_valid_timezone(text)
  from public, anon, authenticated;

comment on function private.nutrition_v2_valid_timezone(text) is
  'True si el texto es un timezone reconocido por esta instancia de Postgres. NUT-016. 2026-09-05: sin escaneo de pg_timezone_names para nombres IANA con "/" (56 ms -> 0.6 ms); los nombres sin "/" siguen yendo al catalogo para no aceptar abreviaturas ni offsets POSIX.';
