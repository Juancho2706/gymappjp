import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const adminDb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

// Catálogo curado de recetas Fitness altamente populares
const RECIPES = [
    // --- DESAYUNOS ---
    {
        title: "Avena Proteica con Mantequilla de Maní",
        description: "Desayuno clásico de volumen, alto en carbohidratos complejos y energía.",
        prepTime: 10,
        calories: 520, protein: 32, carbs: 55, fat: 18,
        image: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Calienta la leche en una olla.\n2. Agrega la avena y revuelve a fuego lento por 5 minutos.\n3. Retira del fuego, añade la proteína en polvo y mezcla bien.\n4. Sirve con mantequilla de maní y plátano rebanado encima.",
        ingredients: [
            { name: "Avena en hojuelas", quantity: 60, unit: "g" },
            { name: "Leche descremada", quantity: 200, unit: "ml" },
            { name: "Proteína Whey (Sabor Vainilla)", quantity: 30, unit: "g" },
            { name: "Mantequilla de maní", quantity: 15, unit: "g" },
            { name: "Plátano", quantity: 0.5, unit: "unidad" }
        ]
    },
    {
        title: "Huevos Revueltos con Espinaca y Tostadas",
        description: "Ideal para definición. Alto en proteína y fibra, bajo en calorías.",
        prepTime: 10,
        calories: 340, protein: 24, carbs: 22, fat: 16,
        image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Rocía un sartén con aceite en spray.\n2. Saltea la espinaca hasta que se reduzca.\n3. Bate los huevos con las claras, sal y pimienta.\n4. Añade los huevos al sartén y revuelve a fuego medio.\n5. Sirve junto a las tostadas integrales.",
        ingredients: [
            { name: "Huevos enteros", quantity: 2, unit: "unidad" },
            { name: "Claras de huevo", quantity: 100, unit: "g" },
            { name: "Espinaca fresca", quantity: 50, unit: "g" },
            { name: "Pan integral (rebanada)", quantity: 1, unit: "unidad" }
        ]
    },
    {
        title: "Pancakes de Proteína y Plátano",
        description: "Un desayuno dulce y anabólico perfecto para fines de semana.",
        prepTime: 15,
        calories: 410, protein: 35, carbs: 45, fat: 8,
        image: "https://images.unsplash.com/photo-1528207776546-384cb11362fc?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Licúa la avena hasta hacerla polvo.\n2. Añade a la licuadora el plátano, claras, proteína y polvo de hornear. Licúa hasta que quede homogéneo.\n3. Calienta un sartén con un poco de aceite.\n4. Vierte la mezcla en porciones y cocina 2 min por lado.",
        ingredients: [
            { name: "Avena", quantity: 40, unit: "g" },
            { name: "Claras de huevo", quantity: 150, unit: "g" },
            { name: "Proteína Whey", quantity: 25, unit: "g" },
            { name: "Plátano", quantity: 1, unit: "unidad" }
        ]
    },

    // --- ALMUERZOS / CENAS (DEFINICIÓN) ---
    {
        title: "Pollo a la Plancha con Espárragos y Arroz",
        description: "El estándar de oro del fitness. Limpio, simple y efectivo.",
        prepTime: 20,
        calories: 450, protein: 45, carbs: 40, fat: 10,
        image: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Condimenta el pollo con sal, pimienta, ajo en polvo y paprika.\n2. Cocina el pollo a la plancha con una cucharadita de aceite de oliva, 6-7 min por lado.\n3. Saltea los espárragos en el mismo sartén.\n4. Sirve con arroz blanco cocido.",
        ingredients: [
            { name: "Pechuga de Pollo", quantity: 150, unit: "g" },
            { name: "Arroz blanco (cocido)", quantity: 120, unit: "g" },
            { name: "Espárragos", quantity: 100, unit: "g" },
            { name: "Aceite de oliva", quantity: 5, unit: "ml" }
        ]
    },
    {
        title: "Salmón al Horno con Camote y Brócoli",
        description: "Cena rica en grasas saludables (Omega 3) y carbohidratos fibrosos.",
        prepTime: 25,
        calories: 520, protein: 34, carbs: 35, fat: 24,
        image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Precalienta el horno a 200°C.\n2. Corta el camote en dados y el brócoli en floretes. Colócalos en una bandeja con el salmón.\n3. Rocía aceite de oliva, sal y limón.\n4. Hornea todo por 20 minutos.",
        ingredients: [
            { name: "Salmón fresco", quantity: 150, unit: "g" },
            { name: "Camote/Batata", quantity: 150, unit: "g" },
            { name: "Brócoli", quantity: 100, unit: "g" },
            { name: "Aceite de oliva", quantity: 10, unit: "ml" }
        ]
    },
    {
        title: "Ensalada Rápida de Atún",
        description: "Alta en proteína y cero cocción requerida. Ideal para llevar.",
        prepTime: 5,
        calories: 310, protein: 32, carbs: 12, fat: 14,
        image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Escurre el atún.\n2. Pica el tomate, cebolla morada y lechuga.\n3. Mezcla todo en un bol grande.\n4. Aliña con aceite de oliva, limón, sal y pimienta.",
        ingredients: [
            { name: "Atún al agua (escurrido)", quantity: 120, unit: "g" },
            { name: "Lechuga", quantity: 100, unit: "g" },
            { name: "Tomate", quantity: 100, unit: "g" },
            { name: "Cebolla morada", quantity: 30, unit: "g" },
            { name: "Aceite de oliva", quantity: 10, unit: "ml" }
        ]
    },

    // --- ALMUERZOS / CENAS (VOLUMEN) ---
    {
        title: "Pasta Boloñesa con Carne Magra",
        description: "Clásico de volumen. Mucha energía y fácil de digerir.",
        prepTime: 25,
        calories: 750, protein: 42, carbs: 85, fat: 22,
        image: "https://images.unsplash.com/photo-1622973536968-3ead9e780960?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Cocina la pasta en agua hirviendo según el empaque.\n2. En un sartén, dora la cebolla y agrega la carne magra.\n3. Cuando la carne esté cocida, añade la salsa de tomate natural y orégano.\n4. Mezcla la pasta con la salsa y sirve con queso parmesano.",
        ingredients: [
            { name: "Pasta de trigo (cruda)", quantity: 100, unit: "g" },
            { name: "Carne de res magra (90/10)", quantity: 150, unit: "g" },
            { name: "Salsa de tomate natural", quantity: 100, unit: "g" },
            { name: "Queso parmesano", quantity: 15, unit: "g" }
        ]
    },
    {
        title: "Burritos de Pollo y Frijoles",
        description: "Comida densa calóricamente, perfecta para un post-entreno pesado.",
        prepTime: 20,
        calories: 680, protein: 48, carbs: 70, fat: 20,
        image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Corta el pollo en tiras y cocínalo con especias fajita.\n2. Calienta los frijoles negros.\n3. Toma las tortillas grandes, rellénalas con pollo, frijoles, arroz y aguacate.\n4. Enrolla firmemente y dora en la sartén por 1 minuto de cada lado.",
        ingredients: [
            { name: "Pechuga de Pollo", quantity: 150, unit: "g" },
            { name: "Tortillas de harina (grandes)", quantity: 2, unit: "unidad" },
            { name: "Frijoles negros cocidos", quantity: 100, unit: "g" },
            { name: "Aguacate", quantity: 50, unit: "g" },
            { name: "Arroz cocido", quantity: 50, unit: "g" }
        ]
    },

    // --- SNACKS / BATIDOS ---
    {
        title: "Batido Gainer Casero de Chocolate",
        description: "Licuado de más de 800 calorías para quienes les cuesta subir de peso.",
        prepTime: 5,
        calories: 820, protein: 45, carbs: 105, fat: 26,
        image: "https://images.unsplash.com/photo-1556881286-fc6915169721?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Pon todos los ingredientes en la licuadora.\n2. Añade hielo al gusto.\n3. Licúa por 1 minuto a potencia alta hasta que la avena quede completamente triturada.\n4. Bebe inmediatamente.",
        ingredients: [
            { name: "Leche entera", quantity: 400, unit: "ml" },
            { name: "Avena", quantity: 80, unit: "g" },
            { name: "Mantequilla de maní", quantity: 30, unit: "g" },
            { name: "Plátano", quantity: 1, unit: "unidad" },
            { name: "Proteína Whey sabor Chocolate", quantity: 30, unit: "g" }
        ]
    },
    {
        title: "Yogur Griego con Frutos Rojos y Almendras",
        description: "Snack saciante de media tarde con caseína de absorción lenta.",
        prepTime: 3,
        calories: 280, protein: 22, carbs: 18, fat: 12,
        image: "https://images.unsplash.com/photo-1488477181946-6428a0291777?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Sirve el yogur griego en un bol.\n2. Agrega los arándanos o fresas por encima.\n3. Trocea las almendras y espárcelas para darle un toque crujiente.",
        ingredients: [
            { name: "Yogur griego natural (sin azúcar)", quantity: 200, unit: "g" },
            { name: "Arándanos", quantity: 50, unit: "g" },
            { name: "Almendras", quantity: 20, unit: "g" }
        ]
    },
    {
        title: "Tostadas de Aguacate y Huevo Poché",
        description: "Snack de media mañana lleno de grasas buenas y proteína.",
        prepTime: 10,
        calories: 360, protein: 16, carbs: 24, fat: 22,
        image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Tuesta las rebanadas de pan.\n2. Haz un puré con el aguacate, sal y jugo de limón, y úntalo en el pan.\n3. Prepara huevos poché (o a la plancha) y colócalos encima.\n4. Espolvorea pimienta negra y chili flakes.",
        ingredients: [
            { name: "Pan integral (rebanada)", quantity: 2, unit: "unidad" },
            { name: "Aguacate", quantity: 80, unit: "g" },
            { name: "Huevos enteros", quantity: 2, unit: "unidad" }
        ]
    },
    // --- MÁS DESAYUNOS ---
    {
        title: "Tostadas Francesas Altas en Proteína",
        description: "Versión fitness de las tostadas francesas. Perfectas para un domingo.",
        prepTime: 15,
        calories: 380, protein: 30, carbs: 45, fat: 9,
        image: "https://images.unsplash.com/photo-1484723091792-c195600833eb?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. En un plato hondo, mezcla las claras de huevo, un chorrito de leche, proteína en polvo (sabor vainilla), canela y stevia.\n2. Remoja las rebanadas de pan en la mezcla hasta que se absorba bien.\n3. Cocina en una sartén antiadherente con un toque de aceite de coco a fuego medio.\n4. Sirve con sirope sin azúcar y frutos rojos.",
        ingredients: [
            { name: "Pan de molde integral", quantity: 2, unit: "rebanada" },
            { name: "Claras de huevo", quantity: 150, unit: "ml" },
            { name: "Proteína Whey Vainilla", quantity: 15, unit: "g" },
            { name: "Leche de almendras", quantity: 30, unit: "ml" }
        ]
    },
    {
        title: "Tortilla de Claras con Champiñones y Pavo",
        description: "Desayuno súper bajo en carbohidratos, alto volumen y mucha saciedad.",
        prepTime: 12,
        calories: 220, protein: 35, carbs: 8, fat: 5,
        image: "https://images.unsplash.com/photo-1510693206972-df098062cb71?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Saltea los champiñones picados y el jamón de pavo en una sartén con spray antiadherente.\n2. Bate las claras de huevo con sal y pimienta.\n3. Vierte las claras sobre la mezcla en la sartén y cocina a fuego medio-bajo tapado hasta que cuaje.\n4. Dobla a la mitad y sirve.",
        ingredients: [
            { name: "Claras de huevo", quantity: 200, unit: "ml" },
            { name: "Huevo entero", quantity: 1, unit: "unidad" },
            { name: "Champiñones frescos", quantity: 100, unit: "g" },
            { name: "Pechuga de pavo (fiambre)", quantity: 50, unit: "g" }
        ]
    },
    {
        title: "Pudín de Chía y Proteína",
        description: "Desayuno que puedes preparar la noche anterior. Cero tiempo en la mañana.",
        prepTime: 5,
        calories: 320, protein: 28, carbs: 20, fat: 15,
        image: "https://images.unsplash.com/photo-1495535359489-064b8e8f8eb0?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. En un frasco de vidrio, mezcla la leche de almendras con la proteína en polvo hasta que no haya grumos.\n2. Agrega las semillas de chía y mezcla vigorosamente.\n3. Deja reposar 5 minutos, vuelve a mezclar y refrigera toda la noche.\n4. Al día siguiente, agrega un poco de fruta encima antes de comer.",
        ingredients: [
            { name: "Semillas de Chía", quantity: 30, unit: "g" },
            { name: "Leche de almendras", quantity: 200, unit: "ml" },
            { name: "Proteína Whey", quantity: 25, unit: "g" }
        ]
    },
    // --- MÁS ALMUERZOS / CENAS (DEFINICIÓN) ---
    {
        title: "Wrap Bajo en Carbohidratos de Pavo y Queso",
        description: "Comida rápida, ideal para la oficina o la universidad.",
        prepTime: 10,
        calories: 350, protein: 40, carbs: 15, fat: 14,
        image: "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Toma una tortilla integral o baja en carbohidratos.\n2. Unta mostaza o yogur griego.\n3. Añade hojas de espinaca o lechuga, rebanadas de pavo, queso light y tomate.\n4. Enrolla apretado, córtalo a la mitad y disfruta.",
        ingredients: [
            { name: "Tortilla integral", quantity: 1, unit: "unidad" },
            { name: "Pechuga de pavo (fiambre)", quantity: 120, unit: "g" },
            { name: "Queso bajo en grasa", quantity: 30, unit: "g" },
            { name: "Lechuga y Tomate", quantity: 100, unit: "g" }
        ]
    },
    {
        title: "Pescado Blanco al Limón con Zucchini",
        description: "Cena ultra ligera. La tilapia o merluza es excelente fuente de proteína magra.",
        prepTime: 15,
        calories: 210, protein: 38, carbs: 8, fat: 3,
        image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Sazona el pescado con jugo de limón, sal, pimienta y ajo.\n2. Corta el zucchini (calabacín) en rodajas o espirales.\n3. Saltea el zucchini ligeramente con una gota de aceite.\n4. En otra sartén o freidora de aire, cocina el pescado hasta que esté blanco y desmenuzable (aprox 8-10 min).",
        ingredients: [
            { name: "Pescado Blanco (Tilapia/Merluza)", quantity: 180, unit: "g" },
            { name: "Zucchini (Calabacín)", quantity: 150, unit: "g" },
            { name: "Limón", quantity: 1, unit: "unidad" }
        ]
    },
    {
        title: "Tazón de Carne Molida Magra y Arroz Integral",
        description: "Comida contundente pero con macros limpios. Estilo 'Meal Prep'.",
        prepTime: 20,
        calories: 480, protein: 35, carbs: 45, fat: 16,
        image: "https://images.unsplash.com/photo-1622973536968-3ead9e780960?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Cocina el arroz integral por separado.\n2. En una olla, cocina la carne molida 95% magra con cebolla picada, ajo, sal y especias para taco.\n3. Una vez dorada, puedes añadir salsa de tomate sin azúcar si deseas.\n4. Sirve la carne sobre una cama de arroz integral en un tazón.",
        ingredients: [
            { name: "Carne molida magra (95%)", quantity: 150, unit: "g" },
            { name: "Arroz integral (cocido)", quantity: 150, unit: "g" },
            { name: "Cebolla", quantity: 50, unit: "g" }
        ]
    },
    // --- MÁS ALMUERZOS / CENAS (VOLUMEN) ---
    {
        title: "Hamburguesa Casera de Ternera con Pan Integral",
        description: "No hay por qué evitar las hamburguesas si los ingredientes son limpios.",
        prepTime: 20,
        calories: 650, protein: 45, carbs: 55, fat: 25,
        image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Forma la carne molida en una hamburguesa y sazona por ambos lados.\n2. Cocina en la plancha al término deseado (unos 4-5 minutos por lado).\n3. Tuesta el pan de hamburguesa.\n4. Arma la hamburguesa con lechuga, tomate, la carne y un poco de kétchup o mostaza.",
        ingredients: [
            { name: "Carne molida magra (90%)", quantity: 180, unit: "g" },
            { name: "Pan de hamburguesa integral", quantity: 1, unit: "unidad" },
            { name: "Lechuga y Tomate", quantity: 50, unit: "g" },
            { name: "Queso cheddar (opcional)", quantity: 20, unit: "g" }
        ]
    },
    {
        title: "Tazón Extra Grande de Pollo Teriyaki con Arroz",
        description: "Bomba calórica deliciosa y alta en carbohidratos.",
        prepTime: 25,
        calories: 820, protein: 55, carbs: 120, fat: 12,
        image: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Corta el pollo en dados y séllalo en un wok.\n2. Añade salsa teriyaki baja en azúcar o soya oscura y deja caramelizar.\n3. Saltea brócoli y zanahoria al vapor.\n4. Sirve una gran porción de arroz blanco, el pollo teriyaki encima y los vegetales al lado.",
        ingredients: [
            { name: "Pechuga de pollo", quantity: 200, unit: "g" },
            { name: "Arroz blanco (cocido)", quantity: 300, unit: "g" },
            { name: "Salsa Teriyaki", quantity: 30, unit: "ml" },
            { name: "Mix de vegetales", quantity: 150, unit: "g" }
        ]
    },
    // --- SNACKS Y POST-ENTRENO ADICIONALES ---
    {
        title: "Tortitas de Arroz con Crema de Maní y Fresas",
        description: "Carbohidratos rápidos y grasas buenas. Excelente pre-entreno (1 hora antes).",
        prepTime: 2,
        calories: 250, protein: 8, carbs: 32, fat: 10,
        image: "https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Toma las tortitas de arroz inflado.\n2. Unta la mantequilla de maní uniformemente.\n3. Corta las fresas en láminas y ponlas por encima.",
        ingredients: [
            { name: "Tortitas de arroz inflado", quantity: 3, unit: "unidad" },
            { name: "Mantequilla de maní", quantity: 20, unit: "g" },
            { name: "Fresas", quantity: 50, unit: "g" }
        ]
    },
    {
        title: "Batido de Proteína y Frutos Rojos (Definición)",
        description: "Bajo en calorías pero súper alto en proteína y antioxidantes.",
        prepTime: 5,
        calories: 180, protein: 26, carbs: 15, fat: 2,
        image: "https://images.unsplash.com/photo-1556881286-fc6915169721?q=80&w=2000&auto=format&fit=crop",
        instructions: "1. Añade a la licuadora los frutos rojos congelados.\n2. Agrega el scoop de proteína, agua fría o leche de almendras, y hielo.\n3. Licúa hasta que tenga textura de frappé.",
        ingredients: [
            { name: "Proteína Whey", quantity: 30, unit: "g" },
            { name: "Mix de frutos rojos congelados", quantity: 100, unit: "g" },
            { name: "Leche de almendras sin azúcar", quantity: 250, unit: "ml" }
        ]
    }
]

async function main() {
    console.log(`🚀 Iniciando creación de Catálogo Global de Recetas Fitness...`);

    // 1. Limpiar recetas globales existentes para evitar duplicados
    console.log("Limpiando catálogo global antiguo...");
    const { error: delErr } = await adminDb
        .from('recipes')
        .delete()
        .eq('source_api', 'omnicoach-global');
        
    if (delErr) console.error("Error limpiando recetas:", delErr);

    const { error: delFoodErr } = await adminDb
        .from('foods')
        .delete()
        .like('name', '[Receta]%')
        .is('coach_id', null);

    if (delFoodErr) console.error("Error limpiando alimentos virtuales:", delFoodErr);

    // 2. Insertar nuevas recetas
    console.log(`Insertando ${RECIPES.length} recetas premium...`);
    
    for (const recipe of RECIPES) {
        // Insertar en recipes
        const { data: newRecipe, error: recipeErr } = await adminDb
            .from('recipes')
            .insert({
                name: recipe.title,
                description: recipe.description,
                instructions: recipe.instructions,
                prep_time_minutes: recipe.prepTime,
                calories: recipe.calories,
                protein_g: recipe.protein,
                carbs_g: recipe.carbs,
                fats_g: recipe.fat,
                image_url: recipe.image,
                source_api: 'omnicoach-global',
                source_api_id: recipe.title.toLowerCase().replace(/\s+/g, '-'),
                coach_id: null // DISPONIBLE PARA TODOS
            })
            .select()
            .single();

        if (recipeErr || !newRecipe) {
            console.error(`❌ Error insertando ${recipe.title}:`, recipeErr);
            continue;
        }

        // Insertar ingredientes
        const ingredientsToInsert = recipe.ingredients.map(ing => ({
            recipe_id: newRecipe.id,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            food_id: null
        }));

        const { error: ingErr } = await adminDb
            .from('recipe_ingredients')
            .insert(ingredientsToInsert);

        if (ingErr) console.error(`❌ Error con ingredientes de ${recipe.title}:`, ingErr);

        // Insertar el alimento virtual para el Nutrition Builder
        const { error: foodErr } = await adminDb
            .from('foods')
            .insert({
                name: `[Receta] ${recipe.title}`,
                serving_size_g: 100, // Representa 1 porción
                calories: recipe.calories,
                protein_g: recipe.protein,
                carbs_g: recipe.carbs,
                fats_g: recipe.fat,
                coach_id: null // DISPONIBLE PARA TODOS
            });
            
        if (foodErr) console.error(`❌ Error creando alimento virtual de ${recipe.title}:`, foodErr);
    }

    console.log('✅ Catálogo global de recetas creado exitosamente. Ahora todos los coaches pueden acceder a ellas.');
}

main().catch(console.error);
