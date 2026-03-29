
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Faltan variables de entorno en .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verify() {
  const { count, error } = await supabase
    .from('foods')
    .select('*', { count: 'exact', head: true })
    .is('coach_id', null);

  if (error) {
    console.error('Error al verificar:', error.message);
  } else {
    console.log(`✅ Total de alimentos globales (coach_id is null): ${count}`);
  }
}

verify();
