-- Beta / prueba: todos los coaches al tier más alto (Scale) con cupo y ciclo válidos.
-- Scale solo admite trimestral o anual; si venían en mensual, se normaliza a trimestral.

update public.coaches
set
    subscription_tier = 'scale',
    max_clients = 100,
    billing_cycle = case
        when billing_cycle in ('quarterly', 'annual') then billing_cycle
        else 'quarterly'
    end;
