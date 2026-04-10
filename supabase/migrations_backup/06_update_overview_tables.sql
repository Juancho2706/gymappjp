-- Create meal_completions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.meal_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    meal_id UUID, -- Optional, can refer to a specific meal in a plan
    date DATE NOT NULL,
    status BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add index for faster queries by client and date
CREATE INDEX IF NOT EXISTS idx_meal_completions_client_date ON public.meal_completions(client_id, date);

-- Enable RLS
ALTER TABLE public.meal_completions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own meal completions"
    ON public.meal_completions FOR SELECT
    USING (auth.uid() = client_id);

CREATE POLICY "Users can insert their own meal completions"
    ON public.meal_completions FOR INSERT
    WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Users can update their own meal completions"
    ON public.meal_completions FOR UPDATE
    USING (auth.uid() = client_id);

CREATE POLICY "Coaches can view their clients' meal completions"
    ON public.meal_completions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.coach_clients
            WHERE coach_clients.client_id = meal_completions.client_id
            AND coach_clients.coach_id = auth.uid()
        )
    );
