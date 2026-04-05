import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: exercises, error } = await supabase
    .from('exercises')
    .select('name, muscle_group, instructions')
    .order('muscle_group')
    .order('name');

  if (error) {
    console.error('Error fetching exercises:', error);
    return;
  }

  // Any exercise that starts with a lowercase letter a-z is likely untranslated
  const untranslated = exercises.filter(ex => {
    const firstChar = ex.name.charAt(0);
    return firstChar >= 'a' && firstChar <= 'z';
  });

  const output = untranslated.map(ex => {
    let instructionsText = 'Sin instrucciones';
    if (ex.instructions && Array.isArray(ex.instructions)) {
      instructionsText = ex.instructions.map((inst: string) => `  - ${inst}`).join('\n');
    } else if (ex.instructions) {
      instructionsText = `  - ${ex.instructions}`;
    }
    return `- **${ex.name}** (Grupo Muscular: ${ex.muscle_group})\n  Instrucciones:\n${instructionsText}`;
  }).join('\n\n');
  
  fs.writeFileSync('EJERCICIOS_FALTANTES.md', '# Ejercicios pendientes de traducción (en Inglés)\n\n' + output);
  console.log(`Found ${untranslated.length} untranslated exercises. Output written to EJERCICIOS_FALTANTES.md`);
}

main();