import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupDatabase() {
  console.log('Starting database cleanup...');

  try {
    // 1. Delete from recipe_ingredients
    const { error: err1 } = await supabase.from('recipe_ingredients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err1) throw err1;
    console.log('Cleaned recipe_ingredients');

    // 2. Delete from recipes
    const { error: err2 } = await supabase.from('recipes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err2) throw err2;
    console.log('Cleaned recipes');

    // 3. Delete from food_items (part of nutrition plans)
    const { error: err3 } = await supabase.from('food_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err3) throw err3;
    console.log('Cleaned food_items');

    // 4. Delete from saved_meal_items
    const { error: err4 } = await supabase.from('saved_meal_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err4) throw err4;
    console.log('Cleaned saved_meal_items');

    // 5. Delete from saved_meals
    const { error: err5 } = await supabase.from('saved_meals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (err5) throw err5;
    console.log('Cleaned saved_meals');

    console.log('Database cleanup completed successfully.');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupDatabase();
