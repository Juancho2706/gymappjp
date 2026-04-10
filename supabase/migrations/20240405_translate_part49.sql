-- Actualización de ejercicios traducidos - Parte 49
-- Objetivo: Actualizar los nombres e instrucciones de Tríceps

-- ring dips
UPDATE public.exercises
SET 
    name = 'Fondos en anillas',
    instructions = ARRAY[
        'Comienza colgando de las anillas con los brazos completamente estirados y tu cuerpo recto.',
        'Baja tu cuerpo flectando los codos hasta que tus hombros queden por debajo de la altura de tus codos.',
        'Empújate hacia arriba regresando a la posición inicial estirando los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'ring dips%';

-- ski ergometer
UPDATE public.exercises
SET 
    name = 'Máquina de ski / SkiErg sentado',
    instructions = ARRAY[
        'Ajusta la altura del asiento y los apoyos para los pies a una posición cómoda.',
        'Toma los agarres con un agarre prono, palmas mirando hacia abajo.',
        'Siéntate derecho con los pies apoyados planos en los apoyos.',
        'Estira los brazos hacia adelante, manteniendo una leve flexión en los codos.',
        'Contrae tus tríceps y empuja los agarres hacia abajo, en dirección a tus muslos.',
        'Haz una pausa por un momento abajo, y luego regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'ski ergometer%';

-- smith machine decline close grip bench press
UPDATE public.exercises
SET 
    name = 'Press de banca declinado con agarre estrecho en máquina Smith',
    instructions = ARRAY[
        'Ajusta el banco de la máquina Smith a una posición declinada.',
        'Acuéstate en el banco con los pies firmemente apoyados en el suelo (o asegurados en los rodillos).',
        'Toma la barra con un agarre estrecho, levemente más cerrado que el ancho de los hombros.',
        'Saca la barra del soporte y bájala lentamente hacia tu pecho, manteniendo los codos bien pegados a tu cuerpo.',
        'Haz una pausa por un momento cuando la barra esté justo por encima de tu pecho.',
        'Empuja la barra hacia arriba regresando a la posición inicial, extendiendo los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith machine decline close grip bench press%';

-- smith machine incline tricep extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps en banco inclinado en máquina Smith',
    instructions = ARRAY[
        'Ajusta el asiento de la máquina Smith para que la barra quede a la altura de los hombros.',
        'Siéntate en el banco con la espalda apoyada contra el respaldo y los pies planos en el suelo.',
        'Toma la barra con un agarre prono, levemente más ancho que tus hombros.',
        'Saca la barra del soporte extendiendo los brazos por completo y sosténdola directamente sobre tu pecho.',
        'Baja lentamente la barra hacia tu frente flectando los codos, manteniendo la parte superior de los brazos cerca de tu cabeza.',
        'Haz una pausa por un momento abajo, y luego empuja la barra hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith machine incline tricep extension%';

-- three bench dip
UPDATE public.exercises
SET 
    name = 'Fondos de tríceps entre bancos',
    instructions = ARRAY[
        'Siéntate en un banco agarrando el borde con las manos y los dedos apuntando hacia adelante.',
        'Desliza tus glúteos fuera del banco, soportando el peso de tu cuerpo con las manos (si usas bancos adicionales, apoya los pies en el banco de enfrente).',
        'Flecta tus codos y baja tu cuerpo hasta que la parte superior de tus brazos esté paralela al piso.',
        'Empújate hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'three bench dip%';

-- triceps dip
UPDATE public.exercises
SET 
    name = 'Fondos de tríceps',
    instructions = ARRAY[
        'Siéntate en el borde de un banco o silla agarrando el borde con las manos, dedos apuntando hacia adelante.',
        'Desliza tus glúteos fuera del banco, soportando el peso de tu cuerpo con las manos.',
        'Flecta tus codos y baja tu cuerpo hacia el suelo, manteniendo la espalda muy cerca del banco.',
        'Haz una pausa por un momento en la parte inferior, y luego empújate hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name = 'triceps dip' OR name ILIKE 'triceps dip %';

-- weighted bench dip
UPDATE public.exercises
SET 
    name = 'Fondos de tríceps en banco con peso',
    instructions = ARRAY[
        'Siéntate en un banco agarrando el borde con las manos y los dedos apuntando hacia adelante (conducir el peso sobre tus muslos).',
        'Desliza tus glúteos fuera del banco, soportando tu peso con las manos.',
        'Baja tu cuerpo flectando los codos hasta que la parte superior de tus brazos quede paralela al suelo.',
        'Empújate hacia arriba a la posición inicial estirando los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'weighted bench dip%';

-- weighted tricep dips
UPDATE public.exercises
SET 
    name = 'Fondos de tríceps con piernas estiradas y peso',
    instructions = ARRAY[
        'Siéntate en el borde de un banco o silla, agarrando el borde con las manos junto a tus caderas.',
        'Desliza tus glúteos fuera del banco con las piernas completamente estiradas frente a ti.',
        'Mantén tu espalda muy cerca del banco y los codos levemente flectados.',
        'Baja tu cuerpo flectando los codos hasta que la parte superior de tus brazos quede paralela al piso.',
        'Empújate hacia arriba a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'weighted tricep dips%';
