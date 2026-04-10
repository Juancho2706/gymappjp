-- Actualización de ejercicios traducidos - Parte 46
-- Objetivo: Actualizar los nombres e instrucciones de Tríceps (principalmente en polea)

-- cable high pulley overhead tricep extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps sobre la cabeza en polea alta',
    instructions = ARRAY[
        'Engancha una cuerda a la polea alta y párate dándole la espalda a la máquina.',
        'Toma la cuerda con ambas manos y estira tus brazos por encima de tu cabeza.',
        'Mantén los codos cerca de tu cabeza y la parte superior de tus brazos inmóvil.',
        'Baja lentamente la cuerda por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego estira los brazos para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable high pulley overhead tricep extension%';

-- cable kneeling triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps de rodillas en polea',
    instructions = ARRAY[
        'Engancha una cuerda a la polea alta y arrodíllate de frente a la máquina de poleas.',
        'Toma la cuerda con un agarre neutro (las palmas mirándose entre sí) y lleva tus manos a los lados de tu cabeza.',
        'Mantén los codos cerca de tu cabeza y la parte superior de tus brazos inmóvil durante todo el ejercicio.',
        'Estira tus antebrazos contrayendo los tríceps hasta que tus brazos estén completamente extendidos.',
        'Haz una pausa por un momento, y luego regresa lentamente a la posición inicial flectando los codos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable kneeling triceps extension%';

-- cable lying triceps extension v. 2
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps acostado en polea v. 2',
    instructions = ARRAY[
        'Engancha una cuerda a la polea baja.',
        'Acuéstate boca arriba en un banco plano, con tu cabeza apuntando hacia la máquina de poleas.',
        'Toma la cuerda con ambas manos, las palmas mirándose entre sí, y estira los brazos directamente sobre tu pecho.',
        'Manteniendo inmóvil la parte superior de tus brazos, baja lentamente la cuerda hacia tu frente flectando los codos.',
        'Haz una pausa por un momento abajo, y luego estira los brazos hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable lying triceps extension v. 2%';

-- cable one arm tricep pushdown
UPDATE public.exercises
SET 
    name = 'Tríceps en polea / Pushdown a un brazo',
    instructions = ARRAY[
        'Párate frente a la máquina de poleas con un agarre individual (o barra recta pequeña) enganchado a la altura del pecho.',
        'Toma el agarre con un agarre prono y da un paso atrás para crear tensión en el cable.',
        'Separa los pies al ancho de los hombros y flecta levemente las rodillas.',
        'Mantén tu espalda recta y el core activado durante todo el ejercicio.',
        'Comienza con tu brazo completamente extendido y perpendicular al piso.',
        'Manteniendo inmóvil la parte superior de tu brazo, exhala y empuja el agarre hacia abajo hasta que tu brazo esté completamente estirado.',
        'Haz una pausa por un momento, luego inhala y regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'cable one arm tricep pushdown%';

-- cable overhead triceps extension (rope attachment)
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps sobre la cabeza en polea con cuerda',
    instructions = ARRAY[
        'Engancha una cuerda a la polea en una posición alta.',
        'Párate dándole la espalda a la máquina con los pies separados al ancho de los hombros.',
        'Toma la cuerda con ambas manos, las palmas mirándose entre sí, y lleva tus manos por encima de tu cabeza.',
        'Mantén la parte superior de tus brazos pegada a tu cabeza y los codos apuntando hacia adelante.',
        'Baja lentamente la cuerda por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego estira los brazos hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable overhead triceps extension%(rope attachment)%';

-- cable pushdown (with rope attachment)
UPDATE public.exercises
SET 
    name = 'Pushdown de tríceps en polea con cuerda',
    instructions = ARRAY[
        'Engancha una cuerda a la polea alta de la máquina.',
        'Párate de frente a la máquina con los pies separados al ancho de los hombros y una leve flexión en tus rodillas.',
        'Toma la cuerda con un agarre firme, con las palmas mirándose entre sí.',
        'Mantén los codos pegados a tus costados y la parte superior de tus brazos inmóvil durante todo el ejercicio.',
        'Exhala y empuja la cuerda hacia abajo extendiendo los codos hasta que tus brazos queden completamente estirados.',
        'Haz una pausa por un momento, luego inhala y regresa lentamente a la posición inicial permitiendo que tus codos se flecten.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable pushdown%(with rope attachment)%';

-- cable rear drive
UPDATE public.exercises
SET 
    name = 'Patada de tríceps hacia atrás en polea / Rear drive',
    instructions = ARRAY[
        'Engancha un agarre individual a la polea baja y párate dándole la espalda a la máquina.',
        'Toma el agarre con un agarre prono y estira tu brazo hacia adelante.',
        'Manteniendo tu codo inmóvil, tira del agarre hacia atrás (en dirección a tu cuerpo), apretando el tríceps al final del movimiento.',
        'Regresa lentamente el agarre a la posición inicial y repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable rear drive%';

-- cable reverse grip triceps pushdown (sz-bar) (with arm blaster)
UPDATE public.exercises
SET 
    name = 'Pushdown de tríceps con agarre supino en polea usando barra Z y arm blaster',
    instructions = ARRAY[
        'Engancha una barra Z a la polea en su posición más alta.',
        'Párate de frente a la máquina de poleas con los pies separados al ancho de los hombros.',
        'Toma la barra con un agarre supino (las palmas mirando hacia arriba) y las manos separadas al ancho de los hombros.',
        'Apoya bien tus brazos en el arm blaster, manteniendo los codos pegados a tus costados y la parte superior de tus brazos quieta durante todo el ejercicio.',
        'Contrae tus tríceps y empuja lentamente la barra hacia abajo hasta que tus brazos estén completamente estirados.',
        'Haz una pausa por un momento abajo, y luego regresa lentamente la barra a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable reverse grip triceps pushdown%(sz-bar)%(with arm blaster)%';

-- cable reverse-grip pushdown
UPDATE public.exercises
SET 
    name = 'Pushdown de tríceps con agarre supino en polea',
    instructions = ARRAY[
        'Engancha una barra recta a la polea alta de la máquina.',
        'Párate frente a la máquina con los pies separados al ancho de los hombros.',
        'Toma la barra con un agarre supino (palmas hacia arriba), con las manos separadas al ancho de los hombros.',
        'Mantén los codos pegados a tus costados y la parte superior de tus brazos inmóvil durante todo el ejercicio.',
        'Usando tus tríceps, empuja la barra hacia abajo hasta que tus brazos estén completamente estirados y tus tríceps contraídos.',
        'Haz una pausa por un momento, y luego regresa lentamente la barra a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable reverse-grip pushdown%';

-- cable rope high pulley overhead tricep extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps sobre la cabeza en polea alta con cuerda',
    instructions = ARRAY[
        'Engancha una cuerda a la polea alta y ajusta el peso a usar.',
        'Párate dándole la espalda a la máquina con los pies separados al ancho de los hombros.',
        'Toma la cuerda con ambas manos, palmas hacia abajo, y lleva tus manos por encima de tu cabeza.',
        'Mantén la parte superior de tus brazos cerca de tu cabeza y perpendiculares al piso.',
        'Baja lentamente la cuerda por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego estira los brazos regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable rope high pulley overhead tricep extension%';

-- cable rope incline tricep extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps en banco inclinado con polea y cuerda',
    instructions = ARRAY[
        'Engancha una cuerda a la polea alta y ajusta el banco inclinado a un ángulo cómodo.',
        'Ubícate dándole la espalda a la polea con los pies separados al ancho de los hombros.',
        'Toma la cuerda con un agarre firme y estira los brazos por completo sobre tu cabeza.',
        'Mantén los codos pegados a tu cabeza y la parte superior de tus brazos inmóvil durante todo el ejercicio.',
        'Baja la cuerda por detrás de tu cabeza flectando los codos hasta que tus antebrazos toquen (o casi toquen) tus bíceps.',
        'Haz una pausa por un momento, y luego estira los brazos regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable rope incline tricep extension%';

-- cable rope lying on floor tricep extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps acostado en el piso con polea y cuerda',
    instructions = ARRAY[
        'Engancha una cuerda a la máquina de poleas y ajústala en la posición más baja.',
        'Acuéstate boca arriba en el piso, apuntando tu cabeza hacia la máquina.',
        'Sostén la cuerda con ambas manos, las palmas mirándose entre sí, y estira los brazos rectos hacia el techo.',
        'Mantén la parte superior de tus brazos fija y baja lentamente la cuerda hacia tu frente, flectando los codos.',
        'Haz una pausa por un momento, y luego estira los brazos hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable rope lying on floor tricep extension%';

-- cable standing one arm triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps a un brazo de pie en polea',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, mirando hacia la máquina de poleas.',
        'Sostén el agarre con tu mano derecha (palma hacia abajo), y posiciona tu brazo de modo que quede completamente extendido y paralelo al piso.',
        'Mantén tu codo fijo y cerca de tu cuerpo.',
        'Flecta lentamente tu codo, bajando el agarre de la polea hacia la parte posterior de tu cabeza.',
        'Haz una pausa por un momento en la parte de mayor contracción, y luego estira el brazo regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de lado para hacerlo con tu brazo izquierdo.'
    ]
WHERE name ILIKE 'cable standing one arm triceps extension%';

-- cable standing reverse grip one arm overhead tricep extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps sobre la cabeza a un brazo de pie con agarre supino',
    instructions = ARRAY[
        'Párate dándole la espalda a la máquina de poleas, con los pies separados al ancho de los hombros.',
        'Sostén el agarre con toma supina (la palma mirando hacia ti) y estira el brazo por encima de tu cabeza, manteniendo el codo cerca de la misma.',
        'Mantén la parte superior de tu brazo quieta y baja lentamente el agarre por detrás de tu cabeza flectando el codo.',
        'Haz una pausa por un momento abajo, y luego estira tu brazo para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'cable standing reverse grip one arm overhead tricep extension%';

-- cable triceps pushdown (v-bar)
UPDATE public.exercises
SET 
    name = 'Pushdown de tríceps en polea con barra en V',
    instructions = ARRAY[
        'Engancha una barra en V a la máquina de poleas en la posición más alta.',
        'Párate de frente a la máquina con los pies separados al ancho de los hombros.',
        'Toma la barra en V con un agarre prono (palmas hacia abajo) y las manos juntas a la forma de la barra.',
        'Mantén los codos pegados a tus costados y la parte superior de tus brazos quieta durante todo el ejercicio.',
        'Contrae tus tríceps y exhala mientras empujas la barra en V hacia abajo hasta que tus brazos queden totalmente estirados.',
        'Haz una pausa por un momento abajo, apretando bien tus tríceps.',
        'Inhala mientras regresas lentamente la barra a la posición inicial, siempre controlando el peso.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable triceps pushdown (v-bar)' OR name = 'cable triceps pushdown (v-bar)';

-- cable triceps pushdown (v-bar) (with arm blaster)
UPDATE public.exercises
SET 
    name = 'Pushdown de tríceps en polea con barra en V y arm blaster',
    instructions = ARRAY[
        'Engancha una barra en V a la máquina de poleas en la posición más alta.',
        'Párate de frente a la máquina con los pies separados al ancho de los hombros.',
        'Toma la barra en V con un agarre prono (palmas hacia abajo).',
        'Apoya bien tus brazos en el arm blaster, manteniendo los codos pegados a tus costados y la parte superior de tus brazos quieta durante todo el ejercicio.',
        'Contrae tus tríceps y exhala mientras empujas la barra en V hacia abajo hasta que tus brazos queden totalmente estirados.',
        'Haz una pausa por un momento abajo, apretando bien tus tríceps.',
        'Inhala mientras regresas lentamente la barra a la posición inicial, siempre controlando el movimiento.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable triceps pushdown (v-bar) (with arm blaster)%';
