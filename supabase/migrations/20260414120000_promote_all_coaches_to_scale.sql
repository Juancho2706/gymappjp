-- =============================================================================
-- Promoción ONE-SHOT para entorno de prueba (solo filas ya existentes al aplicar)
-- =============================================================================
-- Cómo funciona Supabase/Postgres con migraciones:
--   - Este script corre UNA SOLA VEZ cuando aplicas las migraciones en ese proyecto.
--   - Solo actualiza filas que YA están en `public.coaches` en ese momento.
--   - Los coaches que se registren DESPUÉS entran por el flujo normal de la app
--     (register → checkout MP → tier/ciclo que eligieron). Este UPDATE no los toca.
--
-- Producción / go-live:
--   - Si no quieres este “bump” en un entorno nuevo, elimina este archivo del historial
--     antes de desplegar, o no ejecutes esta migración en ese proyecto.
--   - Si solo quieres subir a Scale a cuentas concretas, sustituye el WHERE por IDs:
--       WHERE id in ('uuid-1', 'uuid-2');
-- =============================================================================

update public.coaches
set
    subscription_tier = 'scale',
    max_clients = 100,
    billing_cycle = case
        when billing_cycle in ('quarterly', 'annual') then billing_cycle
        else 'quarterly'
    end;
