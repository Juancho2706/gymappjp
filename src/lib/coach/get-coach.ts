import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/lib/database.types';

export async function getCoach() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: coachData } = await supabase
    .from('coaches')
    .select('id, full_name, brand_name, subscription_status, primary_color, use_brand_colors_coach')
    .eq('id', user.id)
    .maybeSingle() as any;

  if (!coachData) return null;

  return coachData as Pick<Tables<'coaches'>, 'id' | 'full_name' | 'brand_name' | 'subscription_status' | 'primary_color'> & { use_brand_colors_coach?: boolean };
}
