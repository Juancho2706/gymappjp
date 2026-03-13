import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceKey) {
    console.error('Error: missing Supabase URL or Service Role Key in .env.local')
    process.exit(1)
}

const adminDb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

const BULK_FOODS = [
    // PROTEÍNAS (Carnes, Pescados, Huevos)
    { name: 'Pechuga de Pollo (cocida)', serving_size_g: 100, calories: 165, protein_g: 31, carbs_g: 0, fats_g: 4 },
    { name: 'Muslo de Pollo (sin piel, cocido)', serving_size_g: 100, calories: 174, protein_g: 24, carbs_g: 0, fats_g: 8 },
    { name: 'Carne de Res Magra (cocida)', serving_size_g: 100, calories: 250, protein_g: 26, carbs_g: 0, fats_g: 15 },
    { name: 'Solomillo de Cerdo (cocido)', serving_size_g: 100, calories: 143, protein_g: 26, carbs_g: 0, fats_g: 4 },
    { name: 'Carne Molida 90/10 (cocida)', serving_size_g: 100, calories: 176, protein_g: 26, carbs_g: 0, fats_g: 10 },
    { name: 'Huevo Entero (Grande)', serving_size_g: 50, calories: 72, protein_g: 6, carbs_g: 0, fats_g: 5 },
    { name: 'Clara de Huevo', serving_size_g: 100, calories: 52, protein_g: 11, carbs_g: 1, fats_g: 0 },
    { name: 'Salmón (cocido)', serving_size_g: 100, calories: 208, protein_g: 22, carbs_g: 0, fats_g: 13 },
    { name: 'Atún en Agua (lata)', serving_size_g: 100, calories: 116, protein_g: 26, carbs_g: 0, fats_g: 1 },
    { name: 'Pescado Blanco (Tilapia/Merluza, cocido)', serving_size_g: 100, calories: 128, protein_g: 26, carbs_g: 0, fats_g: 3 },
    { name: 'Pavo (Pechuga, cocida)', serving_size_g: 100, calories: 135, protein_g: 30, carbs_g: 0, fats_g: 1 },
    { name: 'Camarones (cocidos)', serving_size_g: 100, calories: 99, protein_g: 24, carbs_g: 0, fats_g: 0 },
    { name: 'Lomo de Cerdo (cocido)', serving_size_g: 100, calories: 242, protein_g: 27, carbs_g: 0, fats_g: 14 },
    { name: 'Jamón Serrano', serving_size_g: 100, calories: 241, protein_g: 31, carbs_g: 0, fats_g: 13 },
    { name: 'Tofu Firme', serving_size_g: 100, calories: 83, protein_g: 10, carbs_g: 2, fats_g: 5 },
    { name: 'Tempeh', serving_size_g: 100, calories: 192, protein_g: 19, carbs_g: 9, fats_g: 11 },
    { name: 'Bistec de Ternera', serving_size_g: 100, calories: 218, protein_g: 27, carbs_g: 0, fats_g: 12 },
    { name: 'Sardinas en Tomate (lata)', serving_size_g: 100, calories: 180, protein_g: 18, carbs_g: 3, fats_g: 11 },

    // CARBOHIDRATOS (Arroz, Pasta, Tubérculos, Cereales)
    { name: 'Arroz Blanco (cocido)', serving_size_g: 100, calories: 130, protein_g: 2, carbs_g: 28, fats_g: 0 },
    { name: 'Arroz Integral (cocido)', serving_size_g: 100, calories: 111, protein_g: 3, carbs_g: 23, fats_g: 1 },
    { name: 'Quinoa (cocida)', serving_size_g: 100, calories: 120, protein_g: 4, carbs_g: 21, fats_g: 2 },
    { name: 'Avena en Hojuelas', serving_size_g: 100, calories: 389, protein_g: 17, carbs_g: 66, fats_g: 7 },
    { name: 'Papa/Patata (cocida)', serving_size_g: 100, calories: 77, protein_g: 2, carbs_g: 17, fats_g: 0 },
    { name: 'Camote/Batata (cocido)', serving_size_g: 100, calories: 86, protein_g: 2, carbs_g: 20, fats_g: 0 },
    { name: 'Pasta de Trigo (cocida)', serving_size_g: 100, calories: 158, protein_g: 6, carbs_g: 31, fats_g: 1 },
    { name: 'Pasta Integral (cocida)', serving_size_g: 100, calories: 124, protein_g: 5, carbs_g: 25, fats_g: 1 },
    { name: 'Pan Integral (rebanada)', serving_size_g: 30, calories: 80, protein_g: 3, carbs_g: 15, fats_g: 1 },
    { name: 'Pan Blanco (rebanada)', serving_size_g: 30, calories: 79, protein_g: 3, carbs_g: 14, fats_g: 1 },
    { name: 'Tortilla de Maíz', serving_size_g: 30, calories: 52, protein_g: 1, carbs_g: 11, fats_g: 1 },
    { name: 'Cuscús (cocido)', serving_size_g: 100, calories: 112, protein_g: 4, carbs_g: 23, fats_g: 0 },
    { name: 'Granola (promedio)', serving_size_g: 100, calories: 471, protein_g: 10, carbs_g: 64, fats_g: 20 },
    { name: 'Maíz Desgranado', serving_size_g: 100, calories: 86, protein_g: 3, carbs_g: 19, fats_g: 1 },
    { name: 'Yuca (Hervida)', serving_size_g: 100, calories: 159, protein_g: 1, carbs_g: 38, fats_g: 0 },

    // GRASAS (Aceites, Frutos Secos)
    { name: 'Aceite de Oliva', serving_size_g: 10, calories: 88, protein_g: 0, carbs_g: 0, fats_g: 10 },
    { name: 'Aguacate / Palta', serving_size_g: 100, calories: 160, protein_g: 2, carbs_g: 9, fats_g: 15 },
    { name: 'Almendras', serving_size_g: 30, calories: 173, protein_g: 6, carbs_g: 6, fats_g: 15 },
    { name: 'Nueces', serving_size_g: 30, calories: 196, protein_g: 4, carbs_g: 4, fats_g: 20 },
    { name: 'Mantequilla de Maní (Cacahuate)', serving_size_g: 16, calories: 94, protein_g: 4, carbs_g: 3, fats_g: 8 },
    { name: 'Aceitunas Verdes', serving_size_g: 100, calories: 115, protein_g: 1, carbs_g: 6, fats_g: 11 },
    { name: 'Semillas de Chía', serving_size_g: 10, calories: 49, protein_g: 2, carbs_g: 4, fats_g: 3 },
    { name: 'Semillas de Girasol', serving_size_g: 30, calories: 175, protein_g: 6, carbs_g: 6, fats_g: 15 },
    { name: 'Mantequilla', serving_size_g: 10, calories: 72, protein_g: 0, carbs_g: 0, fats_g: 8 },
    { name: 'Aceite de Coco', serving_size_g: 10, calories: 86, protein_g: 0, carbs_g: 0, fats_g: 10 },

    // FRUTAS
    { name: 'Plátano / Banano', serving_size_g: 100, calories: 89, protein_g: 1, carbs_g: 23, fats_g: 0 },
    { name: 'Manzana (con piel)', serving_size_g: 100, calories: 52, protein_g: 0, carbs_g: 14, fats_g: 0 },
    { name: 'Arándanos', serving_size_g: 100, calories: 57, protein_g: 1, carbs_g: 14, fats_g: 0 },
    { name: 'Fresa', serving_size_g: 100, calories: 32, protein_g: 1, carbs_g: 8, fats_g: 0 },
    { name: 'Naranja', serving_size_g: 100, calories: 47, protein_g: 1, carbs_g: 12, fats_g: 0 },
    { name: 'Uvas', serving_size_g: 100, calories: 69, protein_g: 1, carbs_g: 18, fats_g: 0 },
    { name: 'Piña', serving_size_g: 100, calories: 50, protein_g: 1, carbs_g: 13, fats_g: 0 },
    { name: 'Mango', serving_size_g: 100, calories: 60, protein_g: 1, carbs_g: 15, fats_g: 0 },
    { name: 'Sandía', serving_size_g: 100, calories: 30, protein_g: 1, carbs_g: 8, fats_g: 0 },
    { name: 'Melón', serving_size_g: 100, calories: 34, protein_g: 1, carbs_g: 8, fats_g: 0 },
    { name: 'Papaya', serving_size_g: 100, calories: 43, protein_g: 0, carbs_g: 11, fats_g: 0 },
    { name: 'Pera', serving_size_g: 100, calories: 57, protein_g: 0, carbs_g: 15, fats_g: 0 },
    { name: 'Kiwi', serving_size_g: 100, calories: 61, protein_g: 1, carbs_g: 15, fats_g: 1 },
    { name: 'Melocotón / Durazno', serving_size_g: 100, calories: 39, protein_g: 1, carbs_g: 10, fats_g: 0 },

    // VEGETALES
    { name: 'Brócoli (cocido)', serving_size_g: 100, calories: 35, protein_g: 2, carbs_g: 7, fats_g: 0 },
    { name: 'Espinacas (crudas)', serving_size_g: 100, calories: 23, protein_g: 3, carbs_g: 4, fats_g: 0 },
    { name: 'Zanahoria (cruda)', serving_size_g: 100, calories: 41, protein_g: 1, carbs_g: 10, fats_g: 0 },
    { name: 'Lechuga (promedio)', serving_size_g: 100, calories: 15, protein_g: 1, carbs_g: 3, fats_g: 0 },
    { name: 'Tomate', serving_size_g: 100, calories: 18, protein_g: 1, carbs_g: 4, fats_g: 0 },
    { name: 'Pepino (con piel)', serving_size_g: 100, calories: 15, protein_g: 1, carbs_g: 4, fats_g: 0 },
    { name: 'Calabacín / Zucchini (cocido)', serving_size_g: 100, calories: 17, protein_g: 1, carbs_g: 3, fats_g: 0 },
    { name: 'Espárragos (cocidos)', serving_size_g: 100, calories: 20, protein_g: 2, carbs_g: 4, fats_g: 0 },
    { name: 'Champiñones / Setas', serving_size_g: 100, calories: 22, protein_g: 3, carbs_g: 3, fats_g: 0 },
    { name: 'Pimiento Rojo / Pimentón', serving_size_g: 100, calories: 31, protein_g: 1, carbs_g: 6, fats_g: 0 },
    { name: 'Coliflor (cocida)', serving_size_g: 100, calories: 25, protein_g: 2, carbs_g: 5, fats_g: 0 },
    { name: 'Berenjena (cocida)', serving_size_g: 100, calories: 25, protein_g: 1, carbs_g: 6, fats_g: 0 },
    { name: 'Cebolla', serving_size_g: 100, calories: 40, protein_g: 1, carbs_g: 9, fats_g: 0 },
    { name: 'Ajo (por diente)', serving_size_g: 3, calories: 4, protein_g: 0, carbs_g: 1, fats_g: 0 },

    // LÁCTEOS Y ALTERNATIVAS
    { name: 'Leche Descremada', serving_size_g: 200, calories: 68, protein_g: 7, carbs_g: 10, fats_g: 0 },
    { name: 'Leche Entera', serving_size_g: 200, calories: 122, protein_g: 7, carbs_g: 10, fats_g: 7 },
    { name: 'Yogur Griego Natural (sin grasa)', serving_size_g: 100, calories: 59, protein_g: 10, carbs_g: 4, fats_g: 0 },
    { name: 'Queso Cottage (bajo en grasa)', serving_size_g: 100, calories: 82, protein_g: 11, carbs_g: 4, fats_g: 2 },
    { name: 'Queso Mozzarella (fresco)', serving_size_g: 100, calories: 280, protein_g: 22, carbs_g: 2, fats_g: 20 },
    { name: 'Queso Parmesano', serving_size_g: 30, calories: 122, protein_g: 11, carbs_g: 1, fats_g: 8 },
    { name: 'Leche de Almendras (sin azúcar)', serving_size_g: 200, calories: 30, protein_g: 1, carbs_g: 1, fats_g: 3 },
    { name: 'Kéfir Natural', serving_size_g: 200, calories: 104, protein_g: 7, carbs_g: 9, fats_g: 5 },

    // LEGUMBRES
    { name: 'Lentejas (cocidas)', serving_size_g: 100, calories: 116, protein_g: 9, carbs_g: 20, fats_g: 0 },
    { name: 'Garbanzos (cocidos)', serving_size_g: 100, calories: 164, protein_g: 9, carbs_g: 27, fats_g: 3 },
    { name: 'Frijoles Negros (cocidos)', serving_size_g: 100, calories: 132, protein_g: 9, carbs_g: 24, fats_g: 1 },
    { name: 'Edamame (sin cáscara, cocido)', serving_size_g: 100, calories: 121, protein_g: 12, carbs_g: 9, fats_g: 5 },
    { name: 'Judías Verdes / Vainitas', serving_size_g: 100, calories: 31, protein_g: 2, carbs_g: 7, fats_g: 0 },

    // OTROS Y SNACKS
    { name: 'Chocolate Negro 85%', serving_size_g: 20, calories: 120, protein_g: 2, carbs_g: 4, fats_g: 9 },
    { name: 'Hojuelas de Maíz (Cereal)', serving_size_g: 30, calories: 110, protein_g: 2, carbs_g: 24, fats_g: 0 },
    { name: 'Miel de Abeja', serving_size_g: 20, calories: 60, protein_g: 0, carbs_g: 17, fats_g: 0 },
    { name: 'Salsa de Tomate / Ketchup', serving_size_g: 20, calories: 20, protein_g: 0, carbs_g: 5, fats_g: 0 },
    { name: 'Mostaza', serving_size_g: 10, calories: 6, protein_g: 0, carbs_g: 1, fats_g: 0 },
    { name: 'Mayonesa Light', serving_size_g: 15, calories: 35, protein_g: 0, carbs_g: 1, fats_g: 3 },
    { name: 'Salsa Soya', serving_size_g: 15, calories: 8, protein_g: 1, carbs_g: 1, fats_g: 0 },
    { name: 'Palomitas de Maíz (sin mantequilla)', serving_size_g: 30, calories: 110, protein_g: 4, carbs_g: 23, fats_g: 1 },
];

async function main() {
    console.log(`🚀 Iniciando carga masiva de ${BULK_FOODS.length} alimentos...`);

    // Limpiamos los existentes para evitar duplicados si se corre varias veces (opcional)
    // Pero solo los globales (coach_id is null)
    const { error: deleteError } = await adminDb
        .from('foods')
        .delete()
        .is('coach_id', null);

    if (deleteError) {
        console.warn('⚠️ No se pudieron limpiar los alimentos existentes:', deleteError.message);
    }

    const { error: insertError } = await adminDb
        .from('foods')
        .insert(BULK_FOODS.map(f => ({ ...f, coach_id: null })));

    if (insertError) {
        console.error('❌ Error al insertar alimentos:', insertError.message);
    } else {
        console.log('✅ Base de datos poblada exitosamente con alimentos genéricos.');
    }
}

main().catch(console.error);
