import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface OpenFoodFactsProduct {
  product_name?: string;
  product_name_es?: string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
}

function cleanName(name: string): string {
  // Eliminar contenido entre paréntesis
  let cleaned = name.replace(/\s*\([^)]*\)/g, '').trim();
  
  // Capitalizar la primera letra de cada palabra
  cleaned = cleaned
    .toLowerCase()
    .split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Limitar a 100 caracteres
  return cleaned.substring(0, 100);
}

async function seedFoods() {
  console.log('Iniciando fetch de Open Food Facts (Multi-page v2)...');
  
  try {
    const totalPages = 5;
    const pageSize = 100;
    let allProducts: OpenFoodFactsProduct[] = [];

    for (let page = 1; page <= totalPages; page++) {
      console.log(`Fetching página ${page}...`);
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/search?sort_by=unique_scans_n&page_size=${pageSize}&page=${page}&fields=product_name,product_name_es,nutriments`
      );
      
      if (!response.ok) {
        console.error(`Error en página ${page}: ${response.status}`);
        break;
      }

      const data = await response.json();
      const products: OpenFoodFactsProduct[] = data.products || [];
      allProducts = [...allProducts, ...products];
      
      console.log(`Recibidos ${products.length} productos.`);
      if (products.length < pageSize) break;

      // Pequeño delay para ser amigables con la API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Encontrados ${allProducts.length} productos en total. Procesando...`);

    const foodsToInsert = allProducts
      .map(p => {
        const name = p.product_name_es || p.product_name;
        const calories = p.nutriments?.['energy-kcal_100g'];
        const protein = p.nutriments?.proteins_100g;
        const carbs = p.nutriments?.carbohydrates_100g;
        const fats = p.nutriments?.fat_100g;

        if (!name || calories === undefined || protein === undefined || carbs === undefined || fats === undefined) {
          return null;
        }

        return {
          name: cleanName(name),
          calories: Math.round(calories),
          protein_g: Math.round(protein),
          carbs_g: Math.round(carbs),
          fats_g: Math.round(fats),
          serving_size_g: 100, // Estándar de Open Food Facts
          coach_id: null // Globales
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null && f.name.length > 0);

    console.log(`${foodsToInsert.length} productos válidos después de filtrar y limpiar.`);

    // Insertar en lotes de 100 para evitar límites
    const batchSize = 100;
    let totalInserted = 0;

    for (let i = 0; i < foodsToInsert.length; i += batchSize) {
      const batch = foodsToInsert.slice(i, i + batchSize);
      const { error } = await supabase.from('foods').insert(batch);

      if (error) {
        console.error(`Error insertando lote ${i / batchSize + 1}:`, error.message);
      } else {
        totalInserted += batch.length;
        console.log(`Insertados ${totalInserted}/${foodsToInsert.length} alimentos...`);
      }
    }

    console.log(`\n¡Sembrado completado! Total de alimentos añadidos: ${totalInserted}`);
  } catch (error) {
    console.error('Error durante el proceso de sembrado:', error);
  }
}

seedFoods();
