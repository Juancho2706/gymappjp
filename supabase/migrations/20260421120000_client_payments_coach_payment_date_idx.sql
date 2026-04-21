-- Speed up coach dashboard revenue aggregation by payment_date window
create index if not exists idx_client_payments_coach_id_payment_date
  on public.client_payments (coach_id, payment_date desc);
