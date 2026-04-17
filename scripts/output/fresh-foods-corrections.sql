-- Correcciones nutricionales sugeridas por USDA FoodData Central
-- Generado: 2026-04-17T00:23:34.660Z
-- REVISAR ANTES DE APLICAR: comparar con etiquetas locales si existen

BEGIN;

-- Caqui / Kaki
-- App: cal=70 prot=1 carbs=19 fats=0
-- USDA (Persimmons, japanese, raw): cal=70 prot=0.58 carbs=18.6 fats=0.19
UPDATE foods SET
  calories  = 70.0,
  protein_g = 0.6,
  carbs_g   = 18.6,
  fats_g    = 0.2
WHERE name = 'Caqui / Kaki' AND coach_id IS NULL;

-- Cerezas
-- App: cal=63 prot=1 carbs=16 fats=0
-- USDA (Cherries, sweet, raw): cal=63 prot=1.06 carbs=16 fats=0.2
UPDATE foods SET
  calories  = 63.0,
  protein_g = 1.1,
  carbs_g   = 16.0,
  fats_g    = 0.2
WHERE name = 'Cerezas' AND coach_id IS NULL;

-- Ciruela fresca
-- App: cal=46 prot=1 carbs=11 fats=0
-- USDA (Plums, raw): cal=46 prot=0.7 carbs=11.4 fats=0.28
UPDATE foods SET
  calories  = 46.0,
  protein_g = 0.7,
  carbs_g   = 11.4,
  fats_g    = 0.3
WHERE name = 'Ciruela fresca' AND coach_id IS NULL;

-- Damasco / Albaricoque
-- App: cal=48 prot=1 carbs=11 fats=0
-- USDA (Apricots, raw): cal=48 prot=1.4 carbs=11.1 fats=0.39
UPDATE foods SET
  calories  = 48.0,
  protein_g = 1.4,
  carbs_g   = 11.1,
  fats_g    = 0.4
WHERE name = 'Damasco / Albaricoque' AND coach_id IS NULL;

-- Higo fresco
-- App: cal=74 prot=1 carbs=19 fats=0
-- USDA (Figs, raw): cal=74 prot=0.75 carbs=19.2 fats=0.3
UPDATE foods SET
  calories  = 74.0,
  protein_g = 0.8,
  carbs_g   = 19.2,
  fats_g    = 0.3
WHERE name = 'Higo fresco' AND coach_id IS NULL;

-- Limón (1 unidad)
-- App: cal=29 prot=1 carbs=9 fats=0
-- USDA (Lemon juice, raw): cal=22 prot=0.35 carbs=6.9 fats=0.24
UPDATE foods SET
  calories  = 22.0,
  protein_g = 0.3,
  carbs_g   = 6.9,
  fats_g    = 0.2
WHERE name = 'Limón (1 unidad)' AND coach_id IS NULL;

-- Mandarina
-- App: cal=53 prot=1 carbs=13 fats=0
-- USDA (Tangerines, (mandarin oranges), raw): cal=53 prot=0.81 carbs=13.3 fats=0.31
UPDATE foods SET
  calories  = 53.0,
  protein_g = 0.8,
  carbs_g   = 13.3,
  fats_g    = 0.3
WHERE name = 'Mandarina' AND coach_id IS NULL;

-- Mango
-- App: cal=60 prot=1 carbs=15 fats=0
-- USDA (Mangos, raw): cal=60 prot=0.82 carbs=15 fats=0.38
UPDATE foods SET
  calories  = 60.0,
  protein_g = 0.8,
  carbs_g   = 15.0,
  fats_g    = 0.4
WHERE name = 'Mango' AND coach_id IS NULL;

-- Maracuyá / Maracuya
-- App: cal=97 prot=2 carbs=23 fats=1
-- USDA (Passion-fruit juice, purple, raw): cal=51 prot=0.39 carbs=13.6 fats=0.05
UPDATE foods SET
  calories  = 51.0,
  protein_g = 0.4,
  carbs_g   = 13.6,
  fats_g    = 0.1
WHERE name = 'Maracuyá / Maracuya' AND coach_id IS NULL;

-- Melón
-- App: cal=34 prot=1 carbs=8 fats=0
-- USDA (Melons, cantaloupe, raw): cal=34 prot=0.84 carbs=8.16 fats=0.19
UPDATE foods SET
  calories  = 34.0,
  protein_g = 0.8,
  carbs_g   = 8.2,
  fats_g    = 0.2
WHERE name = 'Melón' AND coach_id IS NULL;

-- Naranja
-- App: cal=47 prot=1 carbs=12 fats=0
-- USDA (Orange peel, raw): cal=97 prot=1.5 carbs=25 fats=0.2
UPDATE foods SET
  calories  = 97.0,
  protein_g = 1.5,
  carbs_g   = 25.0,
  fats_g    = 0.2
WHERE name = 'Naranja' AND coach_id IS NULL;

-- Papaya
-- App: cal=43 prot=1 carbs=11 fats=0
-- USDA (Papayas, raw): cal=43 prot=0.47 carbs=10.8 fats=0.26
UPDATE foods SET
  calories  = 43.0,
  protein_g = 0.5,
  carbs_g   = 10.8,
  fats_g    = 0.3
WHERE name = 'Papaya' AND coach_id IS NULL;

-- Pomelo
-- App: cal=42 prot=1 carbs=11 fats=0
-- USDA (Grapefruit juice, pink, raw): cal=39 prot=0.5 carbs=9.2 fats=0.1
UPDATE foods SET
  calories  = 39.0,
  protein_g = 0.5,
  carbs_g   = 9.2,
  fats_g    = 0.1
WHERE name = 'Pomelo' AND coach_id IS NULL;

-- Sandía
-- App: cal=30 prot=1 carbs=8 fats=0
-- USDA (Watermelon, raw): cal=30 prot=0.61 carbs=7.55 fats=0.15
UPDATE foods SET
  calories  = 30.0,
  protein_g = 0.6,
  carbs_g   = 7.5,
  fats_g    = 0.1
WHERE name = 'Sandía' AND coach_id IS NULL;

-- Coco rallado sin azúcar
-- App: cal=354 prot=3 carbs=15 fats=34
-- USDA (Beverages, Coconut water, ready-to-drink, unsweetened): cal=18 prot=0.22 carbs=4.24 fats=0
UPDATE foods SET
  calories  = 18.0,
  protein_g = 0.2,
  carbs_g   = 4.2,
  fats_g    = 0.0
WHERE name = 'Coco rallado sin azúcar' AND coach_id IS NULL;

-- Arveja cocida
-- App: cal=84 prot=5 carbs=16 fats=0
-- USDA (Peas, green, cooked, boiled, drained, with salt): cal=84 prot=5.36 carbs=15.6 fats=0.22
UPDATE foods SET
  calories  = 84.0,
  protein_g = 5.4,
  carbs_g   = 15.6,
  fats_g    = 0.2
WHERE name = 'Arveja cocida' AND coach_id IS NULL;

-- Garbanzos cocidos
-- App: cal=164 prot=9 carbs=27 fats=3
-- USDA (Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, with salt): cal=164 prot=8.86 carbs=27.4 fats=2.59
UPDATE foods SET
  calories  = 164.0,
  protein_g = 8.9,
  carbs_g   = 27.4,
  fats_g    = 2.6
WHERE name = 'Garbanzos cocidos' AND coach_id IS NULL;

-- Lenteja roja cocida
-- App: cal=116 prot=9 carbs=20 fats=0
-- USDA (Lentils, pink or red, raw): cal=358 prot=23.9 carbs=63.1 fats=2.17
UPDATE foods SET
  calories  = 358.0,
  protein_g = 23.9,
  carbs_g   = 63.1,
  fats_g    = 2.2
WHERE name = 'Lenteja roja cocida' AND coach_id IS NULL;

-- Lentejas cocidas
-- App: cal=116 prot=9 carbs=20 fats=0
-- USDA (Lentils, mature seeds, cooked, boiled, with salt): cal=114 prot=9.02 carbs=19.5 fats=0.38
UPDATE foods SET
  calories  = 114.0,
  protein_g = 9.0,
  carbs_g   = 19.5,
  fats_g    = 0.4
WHERE name = 'Lentejas cocidas' AND coach_id IS NULL;

-- Porotos negros cocidos
-- App: cal=132 prot=9 carbs=24 fats=1
-- USDA (Beans, black, mature seeds, cooked, boiled, with salt): cal=132 prot=8.86 carbs=23.7 fats=0.54
UPDATE foods SET
  calories  = 132.0,
  protein_g = 8.9,
  carbs_g   = 23.7,
  fats_g    = 0.5
WHERE name = 'Porotos negros cocidos' AND coach_id IS NULL;

-- Soya cocida
-- App: cal=173 prot=17 carbs=10 fats=9
-- USDA (Oil, soybean, salad or cooking): cal=884 prot=0 carbs=0 fats=100
UPDATE foods SET
  calories  = 884.0,
  protein_g = 0.0,
  carbs_g   = 0.0,
  fats_g    = 100.0
WHERE name = 'Soya cocida' AND coach_id IS NULL;

-- Chorizo de pavo
-- App: cal=180 prot=15 carbs=2 fats=13
-- USDA (Sausage, Italian, turkey, smoked): cal=158 prot=15 carbs=4.65 fats=8.75
UPDATE foods SET
  calories  = 158.0,
  protein_g = 15.0,
  carbs_g   = 4.7,
  fats_g    = 8.8
WHERE name = 'Chorizo de pavo' AND coach_id IS NULL;

-- Conejo magro cocido
-- App: cal=173 prot=33 carbs=0 fats=4
-- USDA (Game meat, rabbit, domesticated, composite of cuts, cooked, roasted): cal=197 prot=29.1 carbs=0 fats=8.05
UPDATE foods SET
  calories  = 197.0,
  protein_g = 29.1,
  carbs_g   = 0.0,
  fats_g    = 8.1
WHERE name = 'Conejo magro cocido' AND coach_id IS NULL;

-- Huevo entero cocido
-- App: cal=155 prot=13 carbs=1 fats=11
-- USDA (Egg, whole, cooked, hard-boiled): cal=155 prot=12.6 carbs=1.12 fats=10.6
UPDATE foods SET
  calories  = 155.0,
  protein_g = 12.6,
  carbs_g   = 1.1,
  fats_g    = 10.6
WHERE name = 'Huevo entero cocido' AND coach_id IS NULL;

-- Jaiva / Centolla cocida
-- App: cal=83 prot=17 carbs=0 fats=1
-- USDA (Crustaceans, crab, blue, cooked, moist heat): cal=83 prot=17.9 carbs=0 fats=0.74
UPDATE foods SET
  calories  = 83.0,
  protein_g = 17.9,
  carbs_g   = 0.0,
  fats_g    = 0.7
WHERE name = 'Jaiva / Centolla cocida' AND coach_id IS NULL;

-- Jamón serrano (crudo curado)
-- App: cal=196 prot=27 carbs=1 fats=10
-- USDA (HORMEL, Cure 81 Ham): cal=106 prot=18.4 carbs=0.21 fats=3.59
UPDATE foods SET
  calories  = 106.0,
  protein_g = 18.4,
  carbs_g   = 0.2,
  fats_g    = 3.6
WHERE name = 'Jamón serrano (crudo curado)' AND coach_id IS NULL;

-- Pato sin piel cocido
-- App: cal=201 prot=28 carbs=0 fats=10
-- USDA (Potatoes, boiled, cooked in skin, skin, without salt): cal=78 prot=2.86 carbs=17.2 fats=0.1
UPDATE foods SET
  calories  = 78.0,
  protein_g = 2.9,
  carbs_g   = 17.2,
  fats_g    = 0.1
WHERE name = 'Pato sin piel cocido' AND coach_id IS NULL;

-- Pechuga de pollo horneada
-- App: cal=165 prot=31 carbs=0 fats=4
-- USDA (Chicken breast, roll, oven-roasted): cal=134 prot=14.6 carbs=1.79 fats=7.65
UPDATE foods SET
  calories  = 134.0,
  protein_g = 14.6,
  carbs_g   = 1.8,
  fats_g    = 7.7
WHERE name = 'Pechuga de pollo horneada' AND coach_id IS NULL;

-- Seitan
-- App: cal=107 prot=21 carbs=4 fats=2
-- USDA (Vital wheat gluten): cal=370 prot=75.2 carbs=13.8 fats=1.85
UPDATE foods SET
  calories  = 370.0,
  protein_g = 75.2,
  carbs_g   = 13.8,
  fats_g    = 1.9
WHERE name = 'Seitan' AND coach_id IS NULL;

-- Vieiras cocidas
-- App: cal=97 prot=18 carbs=4 fats=1
-- USDA (Mollusks, scallop, (bay and sea), cooked, steamed): cal=111 prot=20.5 carbs=5.41 fats=0.84
UPDATE foods SET
  calories  = 111.0,
  protein_g = 20.5,
  carbs_g   = 5.4,
  fats_g    = 0.8
WHERE name = 'Vieiras cocidas' AND coach_id IS NULL;

-- Yema de huevo
-- App: cal=322 prot=16 carbs=4 fats=27
-- USDA (Egg, whole, cooked, hard-boiled): cal=155 prot=12.6 carbs=1.12 fats=10.6
UPDATE foods SET
  calories  = 155.0,
  protein_g = 12.6,
  carbs_g   = 1.1,
  fats_g    = 10.6
WHERE name = 'Yema de huevo' AND coach_id IS NULL;

-- Acelga cocida
-- App: cal=20 prot=2 carbs=4 fats=0
-- USDA (Chard, swiss, cooked, boiled, drained, with salt): cal=20 prot=1.88 carbs=4.13 fats=0.08
UPDATE foods SET
  calories  = 20.0,
  protein_g = 1.9,
  carbs_g   = 4.1,
  fats_g    = 0.1
WHERE name = 'Acelga cocida' AND coach_id IS NULL;

-- Ajo
-- App: cal=149 prot=6 carbs=33 fats=1
-- USDA (Garlic, raw): cal=143 prot=6.62 carbs=28.2 fats=0.38
UPDATE foods SET
  calories  = 143.0,
  protein_g = 6.6,
  carbs_g   = 28.2,
  fats_g    = 0.4
WHERE name = 'Ajo' AND coach_id IS NULL;

-- Alcachofa cocida
-- App: cal=53 prot=4 carbs=11 fats=0
-- USDA (Artichokes, (globe or french), cooked, boiled, drained, with salt): cal=51 prot=2.89 carbs=11.4 fats=0.34
UPDATE foods SET
  calories  = 51.0,
  protein_g = 2.9,
  carbs_g   = 11.4,
  fats_g    = 0.3
WHERE name = 'Alcachofa cocida' AND coach_id IS NULL;

-- Cebolla
-- App: cal=40 prot=1 carbs=9 fats=0
-- USDA (Onions, raw): cal=40 prot=1.1 carbs=9.34 fats=0.1
UPDATE foods SET
  calories  = 40.0,
  protein_g = 1.1,
  carbs_g   = 9.3,
  fats_g    = 0.1
WHERE name = 'Cebolla' AND coach_id IS NULL;

-- Champiñones
-- App: cal=22 prot=3 carbs=3 fats=0
-- USDA (Mushrooms, Chanterelle, raw): cal=32 prot=1.49 carbs=6.86 fats=0.53
UPDATE foods SET
  calories  = 32.0,
  protein_g = 1.5,
  carbs_g   = 6.9,
  fats_g    = 0.5
WHERE name = 'Champiñones' AND coach_id IS NULL;

-- Espárrago
-- App: cal=20 prot=2 carbs=4 fats=0
-- USDA (Asparagus, raw): cal=20 prot=2.2 carbs=3.88 fats=0.12
UPDATE foods SET
  calories  = 20.0,
  protein_g = 2.2,
  carbs_g   = 3.9,
  fats_g    = 0.1
WHERE name = 'Espárrago' AND coach_id IS NULL;

-- Espinaca
-- App: cal=23 prot=3 carbs=4 fats=0
-- USDA (Spinach, raw): cal=23 prot=2.86 carbs=3.63 fats=0.39
UPDATE foods SET
  calories  = 23.0,
  protein_g = 2.9,
  carbs_g   = 3.6,
  fats_g    = 0.4
WHERE name = 'Espinaca' AND coach_id IS NULL;

-- Nabo
-- App: cal=28 prot=1 carbs=6 fats=0
-- USDA (Turnips, raw): cal=28 prot=0.9 carbs=6.43 fats=0.1
UPDATE foods SET
  calories  = 28.0,
  protein_g = 0.9,
  carbs_g   = 6.4,
  fats_g    = 0.1
WHERE name = 'Nabo' AND coach_id IS NULL;

-- Palmito
-- App: cal=20 prot=2 carbs=3 fats=0
-- USDA (Hearts of palm, canned): cal=28 prot=2.52 carbs=4.62 fats=0.62
UPDATE foods SET
  calories  = 28.0,
  protein_g = 2.5,
  carbs_g   = 4.6,
  fats_g    = 0.6
WHERE name = 'Palmito' AND coach_id IS NULL;

-- Puerro
-- App: cal=61 prot=2 carbs=14 fats=0
-- USDA (Leeks, (bulb and lower leaf-portion), raw): cal=61 prot=1.5 carbs=14.2 fats=0.3
UPDATE foods SET
  calories  = 61.0,
  protein_g = 1.5,
  carbs_g   = 14.2,
  fats_g    = 0.3
WHERE name = 'Puerro' AND coach_id IS NULL;

-- Rábano
-- App: cal=16 prot=1 carbs=3 fats=0
-- USDA (Radishes, raw): cal=16 prot=0.68 carbs=3.4 fats=0.1
UPDATE foods SET
  calories  = 16.0,
  protein_g = 0.7,
  carbs_g   = 3.4,
  fats_g    = 0.1
WHERE name = 'Rábano' AND coach_id IS NULL;

-- Remolacha cocida
-- App: cal=44 prot=2 carbs=10 fats=0
-- USDA (Beets, cooked, boiled, drained): cal=44 prot=1.68 carbs=9.96 fats=0.18
UPDATE foods SET
  calories  = 44.0,
  protein_g = 1.7,
  carbs_g   = 10.0,
  fats_g    = 0.2
WHERE name = 'Remolacha cocida' AND coach_id IS NULL;

-- Repollo / Col
-- App: cal=25 prot=1 carbs=6 fats=0
-- USDA (Cabbage, raw): cal=25 prot=1.28 carbs=5.8 fats=0.1
UPDATE foods SET
  calories  = 25.0,
  protein_g = 1.3,
  carbs_g   = 5.8,
  fats_g    = 0.1
WHERE name = 'Repollo / Col' AND coach_id IS NULL;

-- Rúcula
-- App: cal=25 prot=3 carbs=4 fats=1
-- USDA (Arugula, raw): cal=25 prot=2.58 carbs=3.65 fats=0.66
UPDATE foods SET
  calories  = 25.0,
  protein_g = 2.6,
  carbs_g   = 3.6,
  fats_g    = 0.7
WHERE name = 'Rúcula' AND coach_id IS NULL;

-- Tomate
-- App: cal=18 prot=1 carbs=4 fats=0
-- USDA (Tomatoes, red, ripe, raw, year round average): cal=18 prot=0.88 carbs=3.89 fats=0.2
UPDATE foods SET
  calories  = 18.0,
  protein_g = 0.9,
  carbs_g   = 3.9,
  fats_g    = 0.2
WHERE name = 'Tomate' AND coach_id IS NULL;

-- Zanahoria
-- App: cal=41 prot=1 carbs=10 fats=0
-- USDA (Carrots, raw): cal=41 prot=0.93 carbs=9.58 fats=0.24
UPDATE foods SET
  calories  = 41.0,
  protein_g = 0.9,
  carbs_g   = 9.6,
  fats_g    = 0.2
WHERE name = 'Zanahoria' AND coach_id IS NULL;

COMMIT;
