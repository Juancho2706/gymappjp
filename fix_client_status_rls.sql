-- Script para permitir que los coaches actualicen el estado 'is_active' de sus propios clientes en la tabla 'clients'.
-- EJECUTAR MANUALMENTE EN EL SQL EDITOR DE SUPABASE.

-- Aseguramos que RLS esté habilitado
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Eliminamos la política si ya existe para evitar duplicados
DROP POLICY IF EXISTS "Coaches can update their own clients" ON public.clients;

-- Creamos la política que permite a los coaches actualizar sus propios clientes
CREATE POLICY "Coaches can update their own clients"
ON public.clients
FOR UPDATE
TO authenticated
USING (auth.uid() = coach_id)
WITH CHECK (auth.uid() = coach_id);

-- NOTA: Esta política permite actualizar cualquier columna del registro del cliente
-- siempre que el 'coach_id' coincida con el ID del coach autenticado.
