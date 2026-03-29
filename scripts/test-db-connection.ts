
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

async function testConnection() {
  console.log('Conectando a Supabase...');
  
  // Intentar contar ejercicios como prueba
  const { data, count, error } = await supabase
    .from('exercises')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error al conectar:', error.message);
  } else {
    console.log('✅ Conexión exitosa.');
    console.log(`Total de ejercicios en la base de datos: ${count}`);
  }
}

testConnection();
