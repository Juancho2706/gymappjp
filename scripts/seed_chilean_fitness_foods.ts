
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

const foods = [
  // Proteínas Animales
  { name: 'Pechuga de pollo cocida', protein_g: 31, carbs_g: 0, fats_g: 4, calories: 165, serving_size_g: 100, coach_id: null },
  { name: 'Pechuga de pavo cocida', protein_g: 29, carbs_g: 0, fats_g: 2, calories: 135, serving_size_g: 100, coach_id: null },
  { name: 'Huevo entero cocido', protein_g: 13, carbs_g: 1, fats_g: 11, calories: 155, serving_size_g: 100, coach_id: null },
  { name: 'Claras de huevo', protein_g: 11, carbs_g: 1, fats_g: 0, calories: 52, serving_size_g: 100, coach_id: null },
  { name: 'Atún al agua (lata)', protein_g: 24, carbs_g: 0, fats_g: 1, calories: 116, serving_size_g: 100, coach_id: null },
  { name: 'Salmón fresco', protein_g: 20, carbs_g: 0, fats_g: 13, calories: 208, serving_size_g: 100, coach_id: null },
  { name: 'Reineta (pescado)', protein_g: 19, carbs_g: 0, fats_g: 1, calories: 90, serving_size_g: 100, coach_id: null },
  { name: 'Merluza (pescado)', protein_g: 17, carbs_g: 0, fats_g: 1, calories: 78, serving_size_g: 100, coach_id: null },
  { name: 'Posta Rosada (carne vacuna)', protein_g: 21, carbs_g: 0, fats_g: 4, calories: 120, serving_size_g: 100, coach_id: null },
  { name: 'Posta Negra (carne vacuna)', protein_g: 21, carbs_g: 0, fats_g: 4, calories: 115, serving_size_g: 100, coach_id: null },
  { name: 'Lomo Liso (limpio)', protein_g: 20, carbs_g: 0, fats_g: 6, calories: 145, serving_size_g: 100, coach_id: null },
  { name: 'Camarones cocidos', protein_g: 24, carbs_g: 0, fats_g: 1, calories: 100, serving_size_g: 100, coach_id: null },

  // Lácteos y Huevos (Chilean specific)
  { name: 'Yogurt Protein Soprole (Vainilla/Frutilla)', protein_g: 10, carbs_g: 5, fats_g: 0, calories: 60, serving_size_g: 100, coach_id: null },
  { name: 'Yogurt Griego natural (sin azúcar)', protein_g: 9, carbs_g: 4, fats_g: 0, calories: 55, serving_size_g: 100, coach_id: null },
  { name: 'Leche descremada (colun/soprole)', protein_g: 3, carbs_g: 5, fats_g: 0, calories: 33, serving_size_g: 100, coach_id: null },
  { name: 'Quesillo (colun)', protein_g: 12, carbs_g: 3, fats_g: 4, calories: 96, serving_size_g: 100, coach_id: null },
  { name: 'Queso Crema Light', protein_g: 6, carbs_g: 4, fats_g: 15, calories: 180, serving_size_g: 100, coach_id: null },

  // Carbohidratos Complex
  { name: 'Avena instantánea', protein_g: 13, carbs_g: 68, fats_g: 7, calories: 389, serving_size_g: 100, coach_id: null },
  { name: 'Avena integral machacada', protein_g: 14, carbs_g: 66, fats_g: 7, calories: 380, serving_size_g: 100, coach_id: null },
  { name: 'Arroz blanco cocido', protein_g: 3, carbs_g: 28, fats_g: 0, calories: 130, serving_size_g: 100, coach_id: null },
  { name: 'Arroz integral cocido', protein_g: 3, carbs_g: 23, fats_g: 1, calories: 111, serving_size_g: 100, coach_id: null },
  { name: 'Quinoa cocida', protein_g: 4, carbs_g: 21, fats_g: 2, calories: 120, serving_size_g: 100, coach_id: null },
  { name: 'Fideos blancos cocidos', protein_g: 5, carbs_g: 31, fats_g: 1, calories: 158, serving_size_g: 100, coach_id: null },
  { name: 'Fideos integrales cocidos', protein_g: 6, carbs_g: 26, fats_g: 1, calories: 124, serving_size_g: 100, coach_id: null },
  { name: 'Pan integral (molde)', protein_g: 8, carbs_g: 45, fats_g: 4, calories: 250, serving_size_g: 100, coach_id: null },
  { name: 'Pan de centeno', protein_g: 9, carbs_g: 48, fats_g: 3, calories: 259, serving_size_g: 100, coach_id: null },
  { name: 'Marraqueta (migas removidas)', protein_g: 8, carbs_g: 55, fats_g: 1, calories: 270, serving_size_g: 100, coach_id: null },
  { name: 'Papa cocida', protein_g: 2, carbs_g: 17, fats_g: 0, calories: 77, serving_size_g: 100, coach_id: null },
  { name: 'Camote cocido', protein_g: 2, carbs_g: 20, fats_g: 0, calories: 86, serving_size_g: 100, coach_id: null },

  // Legumbres
  { name: 'Lentejas cocidas', protein_g: 9, carbs_g: 20, fats_g: 0, calories: 116, serving_size_g: 100, coach_id: null },
  { name: 'Porotos granados cocidos', protein_g: 7, carbs_g: 18, fats_g: 1, calories: 110, serving_size_g: 100, coach_id: null },
  { name: 'Garbanzos cocidos', protein_g: 9, carbs_g: 27, fats_g: 3, calories: 164, serving_size_g: 100, coach_id: null },

  // Grasas Saludables
  { name: 'Palta Hass', protein_g: 2, carbs_g: 9, fats_g: 15, calories: 160, serving_size_g: 100, coach_id: null },
  { name: 'Nueces', protein_g: 15, carbs_g: 14, fats_g: 65, calories: 654, serving_size_g: 100, coach_id: null },
  { name: 'Almendras', protein_g: 21, carbs_g: 22, fats_g: 49, calories: 579, serving_size_g: 100, coach_id: null },
  { name: 'Maní tostado sin sal', protein_g: 26, carbs_g: 16, fats_g: 49, calories: 567, serving_size_g: 100, coach_id: null },
  { name: 'Mantequilla de maní natural', protein_g: 25, carbs_g: 20, fats_g: 50, calories: 588, serving_size_g: 100, coach_id: null },
  { name: 'Aceite de oliva extra virgen', protein_g: 0, carbs_g: 0, fats_g: 100, calories: 884, serving_size_g: 100, coach_id: null },
  { name: 'Semillas de Chía', protein_g: 17, carbs_g: 42, fats_g: 31, calories: 486, serving_size_g: 100, coach_id: null },

  // Frutas y Verduras (Fitness oriented)
  { name: 'Plátano', protein_g: 1, carbs_g: 23, fats_g: 0, calories: 89, serving_size_g: 100, coach_id: null },
  { name: 'Manzana roja', protein_g: 0, carbs_g: 14, fats_g: 0, calories: 52, serving_size_g: 100, coach_id: null },
  { name: 'Frutillas', protein_g: 1, carbs_g: 8, fats_g: 0, calories: 33, serving_size_g: 100, coach_id: null },
  { name: 'Arándanos', protein_g: 1, carbs_g: 14, fats_g: 0, calories: 57, serving_size_g: 100, coach_id: null },
  { name: 'Espinaca cruda', protein_g: 3, carbs_g: 4, fats_g: 0, calories: 23, serving_size_g: 100, coach_id: null },
  { name: 'Brócoli cocido', protein_g: 2, carbs_g: 7, fats_g: 0, calories: 35, serving_size_g: 100, coach_id: null },

  // Suplementos y Otros
  { name: 'Whey Protein (promedio)', protein_g: 80, carbs_g: 5, fats_g: 5, calories: 390, serving_size_g: 100, coach_id: null },
  { name: 'Caseína (promedio)', protein_g: 85, carbs_g: 3, fats_g: 1, calories: 360, serving_size_g: 100, coach_id: null },
  { name: 'Creatina Monohidrato', protein_g: 0, carbs_g: 0, fats_g: 0, calories: 0, serving_size_g: 100, coach_id: null },
  { name: 'Tofu firme', protein_g: 8, carbs_g: 2, fats_g: 5, calories: 76, serving_size_g: 100, coach_id: null },
  { name: 'Seitán', protein_g: 25, carbs_g: 4, fats_g: 2, calories: 135, serving_size_g: 100, coach_id: null },
  { name: 'Galletas de arroz (unidad ~10g)', protein_g: 1, carbs_g: 8, fats_g: 0, calories: 38, serving_size_g: 10, coach_id: null },
  
  // Nuevos para llegar a 50+
  { name: 'Champiñones crudos', protein_g: 3, carbs_g: 3, fats_g: 0, calories: 22, serving_size_g: 100, coach_id: null },
  { name: 'Zapallo italiano cocido', protein_g: 1, carbs_g: 3, fats_g: 0, calories: 15, serving_size_g: 100, coach_id: null },
  { name: 'Pechuga de pollo a la plancha', protein_g: 31, carbs_g: 0, fats_g: 4, calories: 165, serving_size_g: 100, coach_id: null },
  { name: 'Huevos revueltos (sin aceite)', protein_g: 10, carbs_g: 1, fats_g: 11, calories: 148, serving_size_g: 100, coach_id: null },
  { name: 'Hummus tradicional', protein_g: 8, carbs_g: 14, fats_g: 10, calories: 166, serving_size_g: 100, coach_id: null }
];

async function seedFoods() {
  console.log('🚀 Iniciando seeding de alimentos fitness chilenos...');

  const { data: existingFoods, error: fetchError } = await supabase
    .from('foods')
    .select('name');

  if (fetchError) {
    console.error('Error al consultar alimentos existentes:', fetchError);
    return;
  }

  const existingNames = new Set(existingFoods?.map(f => f.name.toLowerCase()));
  const foodsToInsert = foods.filter(f => !existingNames.has(f.name.toLowerCase()));

  if (foodsToInsert.length === 0) {
    console.log('✨ No hay alimentos nuevos para insertar.');
    return;
  }

  console.log(`📦 Insertando ${foodsToInsert.length} alimentos...`);

  const { error: insertError } = await supabase
    .from('foods')
    .insert(foodsToInsert);

  if (insertError) {
    console.error('❌ Error al insertar alimentos:', insertError.message);
  } else {
    console.log('✅ Seeding completado con éxito.');
    console.log(`📊 Total insertados: ${foodsToInsert.length}`);
  }
}

seedFoods();
