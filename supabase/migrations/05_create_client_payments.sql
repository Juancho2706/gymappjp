-- Create client_payments table
CREATE TABLE IF NOT EXISTS public.client_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    service_description TEXT NOT NULL,
    period_months INT,
    receipt_image_url TEXT,
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

-- Policies for coaches (can manage payments of their clients)
CREATE POLICY "Coaches can manage payments for their clients"
    ON public.client_payments
    FOR ALL
    TO authenticated
    USING (coach_id IN (
        SELECT id FROM public.coaches WHERE auth_id = auth.uid()
    ))
    WITH CHECK (coach_id IN (
        SELECT id FROM public.coaches WHERE auth_id = auth.uid()
    ));


-- Index for performance
CREATE INDEX IF NOT EXISTS idx_client_payments_client_id ON public.client_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_coach_id ON public.client_payments(coach_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_client_payments_updated_at
    BEFORE UPDATE ON public.client_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
