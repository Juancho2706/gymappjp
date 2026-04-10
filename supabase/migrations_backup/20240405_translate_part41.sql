-- Actualización de ejercicios traducidos - Parte 41
-- Objetivo: Actualizar los nombres e instrucciones de Lumbar, Pantorrillas y Pectorales

-- spine stretch
UPDATE public.exercises
SET 
    name = 'Estiramiento de columna',
    instructions = ARRAY[
        'Siéntate en el suelo con las piernas extendidas frente a ti.',
        'Apoya las manos en el suelo detrás de ti, con los dedos apuntando hacia tu cuerpo.',
        'Activa tu core e inclínate lentamente hacia atrás, manteniendo la espalda recta.',
        'Continúa inclinándote hacia atrás hasta que sientas un estiramiento en tu columna.',
        'Mantén el estiramiento por unos segundos, y luego regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'spine stretch%';

-- two toe touch (male)
UPDATE public.exercises
SET 
    name = 'Toque de punta de pies a dos manos - hombre',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y los brazos extendidos hacia los lados.',
        'Inclínate hacia adelante desde la cintura, manteniendo la espalda recta y las rodillas levemente flectadas.',
        'Alcanza las puntas de tus pies bajando con ambas manos, manteniendo las piernas estiradas.',
        'Haz una pausa por un momento abajo, y luego regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'two toe touch (male)%';

-- weighted hyperextension (on stability ball)
UPDATE public.exercises
SET 
    name = 'Hiperextensión con peso en fitball',
    instructions = ARRAY[
        'Posiciónate boca abajo sobre un balón de estabilidad (fitball), apoyando tus caderas en el balón y con los pies contra una pared para tener estabilidad.',
        'Coloca tus manos (sosteniendo el peso) detrás de tu cabeza o crúzalas sobre tu pecho.',
        'Contrae tu core y levanta lentamente la parte superior de tu cuerpo del balón, extendiendo tu espalda hasta que formes una línea recta desde la cabeza hasta las caderas.',
        'Haz una pausa por un momento arriba, y luego baja lentamente tu torso de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'weighted hyperextension (on stability ball)%';

-- barbell standing rocking leg calf raise
UPDATE public.exercises
SET 
    name = 'Elevación de pantorrillas de pie con balanceo y barra',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una barra apoyada en la parte superior de tu espalda (trapecios).',
        'Levanta los talones del suelo lo más alto posible, equilibrándote sobre las puntas (metatarsos) de tus pies.',
        'Baja lentamente los talones de regreso a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell standing rocking leg calf raise%';

-- hack calf raise
UPDATE public.exercises
SET 
    name = 'Elevación de pantorrillas en máquina hack',
    instructions = ARRAY[
        'Ajusta la máquina a un peso que te resulte cómodo.',
        'Párate en la plataforma de la máquina con las puntas de los pies apoyadas y los talones colgando por el borde.',
        'Sujétate de los agarres para mantener la estabilidad.',
        'Levanta los talones lo más alto posible empujando a través de las puntas de tus pies.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los talones a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'hack calf raise' OR name = 'hack calf raise';

-- hack one leg calf raise
UPDATE public.exercises
SET 
    name = 'Elevación de pantorrilla a una pierna en máquina hack',
    instructions = ARRAY[
        'Ajusta la máquina a un peso adecuado.',
        'Párate en la máquina apoyando solo un pie, manteniendo el otro pie en el aire.',
        'Sujétate de los agarres para mantener la estabilidad.',
        'Levanta el talón lo más alto posible, elevando tu cuerpo sobre la punta de tu pie.',
        'Haz una pausa por un momento arriba, y luego baja lentamente el talón a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.',
        'Cambia de pierna y repite el ejercicio.'
    ]
WHERE name ILIKE 'hack one leg calf raise%';

-- lever donkey calf raise
UPDATE public.exercises
SET 
    name = 'Elevación de pantorrillas tipo burro en máquina',
    instructions = ARRAY[
        'Ajusta la máquina a la altura adecuada para tu cuerpo.',
        'Posiciónate mirando hacia la máquina, con las puntas de los pies en la plataforma y los talones colgando por el borde.',
        'Coloca tus manos en los agarres o barras de soporte para estabilizarte.',
        'Contrae tus pantorrillas y levanta los talones lo más alto posible, usando las puntas de tus pies.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los talones a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever donkey calf raise%';

-- lever seated calf raise
UPDATE public.exercises
SET 
    name = 'Elevación de pantorrillas sentado en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento para que tus rodillas queden levemente flectadas y tus pies estén planos sobre la plataforma.',
        'Apoya las puntas de tus pies en la plataforma dejando que los talones cuelguen por el borde.',
        'Toma los agarres o los bordes del asiento para mantener la estabilidad.',
        'Empuja a través de las puntas de tus pies para levantar los talones lo más alto posible.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los talones a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever seated calf raise' OR name = 'lever seated calf raise';

-- lever seated squat calf raise on leg press machine
UPDATE public.exercises
SET 
    name = 'Elevación de pantorrillas tipo sentadilla en prensa de piernas',
    instructions = ARRAY[
        'Ajusta el asiento de la prensa de piernas para que tus rodillas queden levemente flectadas cuando apoyes los pies en la plataforma.',
        'Siéntate en la máquina con tu espalda apoyada en el respaldo y los pies planos en la plataforma, separados al ancho de los hombros.',
        'Coloca las puntas de tus pies en la parte inferior de la plataforma, manteniendo los talones fuera del borde.',
        'Suelta los seguros y empuja la plataforma alejándola de ti extendiendo las rodillas.',
        'Una vez que tus rodillas estén casi completamente extendidas, baja lentamente los talones flectando las pantorrillas.',
        'Haz una pausa por un momento abajo, y luego empuja la plataforma hacia arriba extendiendo las pantorrillas.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever seated squat calf raise on leg press machine%';

-- seated calf stretch (male)
UPDATE public.exercises
SET 
    name = 'Estiramiento de pantorrilla sentado - hombre',
    instructions = ARRAY[
        'Siéntate en el borde de una silla o banco con los pies planos en el suelo.',
        'Estira una pierna recta frente a ti, manteniendo el talón apoyado en el suelo.',
        'Inclínate levemente hacia adelante, sintiendo el estiramiento en el músculo de tu pantorrilla.',
        'Mantén el estiramiento entre 20 y 30 segundos.',
        'Cambia de pierna y repite el estiramiento.'
    ]
WHERE name ILIKE 'seated calf stretch (male)%';

-- sled 45° calf press
UPDATE public.exercises
SET 
    name = 'Prensa de pantorrillas a 45°',
    instructions = ARRAY[
        'Ajusta la prensa de piernas a un ángulo de 45 grados.',
        'Coloca los pies en la plataforma con las puntas apuntando hacia adelante.',
        'Empuja la plataforma alejándola de ti extendiendo los tobillos y las pantorrillas.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la plataforma a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'sled 45° calf press' OR name = 'sled 45° calf press';

-- sled calf press on leg press
UPDATE public.exercises
SET 
    name = 'Prensa de pantorrillas en máquina de prensa de piernas',
    instructions = ARRAY[
        'Ajusta el asiento de la prensa para que tus rodillas estén levemente flectadas al apoyar los pies en la plataforma.',
        'Posiciona los pies separados al ancho de los hombros en la plataforma, con las puntas mirando hacia adelante.',
        'Libera los seguros y empuja la plataforma alejándola de ti extendiendo tus rodillas y tobillos.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la plataforma flectando rodillas y tobillos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'sled calf press on leg press%';

-- sled one leg calf press on leg press
UPDATE public.exercises
SET 
    name = 'Prensa de pantorrilla a una pierna en máquina de prensa',
    instructions = ARRAY[
        'Ajusta el asiento de la prensa para que tu rodilla esté levemente flectada al apoyar el pie en la plataforma.',
        'Siéntate en la máquina con tu espalda apoyada en el respaldo y ubica tu pie en la plataforma, al ancho de los hombros.',
        'Coloca la punta y la bola de tu pie en la plataforma, manteniendo el talón fuera del borde.',
        'Empuja la plataforma hacia adelante extendiendo el tobillo, manteniendo la rodilla levemente flectada.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la plataforma flectando el tobillo.',
        'Repite por la cantidad de repeticiones que desees y luego cambia de pierna.'
    ]
WHERE name ILIKE 'sled one leg calf press on leg press%';

-- assisted wide-grip chest dip (kneeling)
UPDATE public.exercises
SET 
    name = 'Fondos de pecho asistidos con agarre ancho - de rodillas',
    instructions = ARRAY[
        'Ajusta la máquina a la altura deseada y asegura tus rodillas en la almohadilla.',
        'Toma los agarres con un agarre ancho y mantén los codos levemente flectados.',
        'Baja tu cuerpo flectando los codos hasta que la parte superior de tus brazos esté paralela al piso.',
        'Empuja hacia arriba para volver a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'assisted wide-grip chest dip (kneeling)%';

-- barbell decline wide-grip press
UPDATE public.exercises
SET 
    name = 'Press declinado con barra y agarre ancho',
    instructions = ARRAY[
        'Acuéstate en un banco declinado asegurando tus pies, con tu cabeza a un nivel más bajo que tus caderas.',
        'Toma la barra con un agarre amplio, un poco más separado que el ancho de tus hombros.',
        'Baja la barra hacia tu pecho, manteniendo los codos apuntando hacia afuera.',
        'Empuja la barra hacia arriba regresando a la posición inicial, extendiendo los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell decline wide-grip press%';

-- barbell reverse grip decline bench press
UPDATE public.exercises
SET 
    name = 'Press declinado con barra y agarre supino / inverso',
    instructions = ARRAY[
        'Acuéstate en un banco declinado asegurando tus pies, con tu cabeza más abajo que tus caderas.',
        'Toma la barra con un agarre supino (palmas hacia ti), con una separación ligeramente mayor al ancho de los hombros.',
        'Saca la barra del soporte y bájala lentamente hacia tu pecho, manteniendo los codos pegados a tu cuerpo.',
        'Haz una pausa por un momento abajo, y luego empuja la barra hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell reverse grip decline bench press%';

-- barbell wide reverse grip bench press
UPDATE public.exercises
SET 
    name = 'Press de banca con barra, agarre ancho y supino',
    instructions = ARRAY[
        'Acuéstate boca arriba en un banco plano con los pies completamente apoyados en el suelo y la espalda presionada contra el banco.',
        'Toma la barra con un agarre ancho y supino (palmas hacia ti), levemente más abierto que el ancho de los hombros.',
        'Saca la barra del soporte y sostenla directamente sobre tu pecho con los brazos completamente estirados.',
        'Baja la barra lentamente hacia tu pecho, manteniendo los codos pegados al cuerpo y las muñecas rectas.',
        'Haz una pausa por un momento cuando la barra toque tu pecho, y luego empújala de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell wide reverse grip bench press%';

-- cable decline press
UPDATE public.exercises
SET 
    name = 'Press declinado en polea',
    instructions = ARRAY[
        'Ajusta la máquina de cables a una posición baja (declinada).',
        'Siéntate en el banco declinado mirando hacia la máquina de poleas.',
        'Toma los agarres con un agarre prono y colócalos a la altura de tu pecho.',
        'Mantén los pies apoyados planos en el suelo y la espalda firmemente contra el banco.',
        'Exhala y empuja los agarres alejándolos de tu cuerpo, estirando los brazos por completo.',
        'Haz una pausa por un momento al final del movimiento, apretando los músculos de tu pecho.',
        'Inhala y regresa lentamente los agarres a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable decline press%';

-- cable incline bench press
UPDATE public.exercises
SET 
    name = 'Press inclinado en polea',
    instructions = ARRAY[
        'Ajusta el banco a una inclinación de 45 grados.',
        'Engancha los agarres a las poleas altas.',
        'Siéntate en el banco mirando hacia la máquina de poleas con los pies planos en el suelo.',
        'Toma los agarres con un agarre prono y llévalos a la altura de los hombros.',
        'Empuja los agarres hacia adelante y hacia arriba hasta que tus brazos estén completamente estirados.',
        'Haz una pausa por un momento, y luego baja lentamente los agarres a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable incline bench press%';

-- cable low fly
UPDATE public.exercises
SET 
    name = 'Aperturas bajas en polea',
    instructions = ARRAY[
        'Engancha los agarres a las poleas bajas de la máquina y selecciona un peso adecuado.',
        'Párate en el centro de la máquina con los pies separados al ancho de los hombros y las rodillas levemente flectadas.',
        'Toma los agarres con un agarre prono y estira los brazos hacia los lados, manteniendo una leve flexión en los codos.',
        'Manteniendo el control, lleva lentamente tus brazos hacia adelante en un movimiento de barrido, cruzándolos frente a tu cuerpo.',
        'Haz una pausa por un momento en el punto máximo del movimiento, sintiendo el estiramiento en tus pectorales.',
        'Revierte el movimiento y regresa lentamente los brazos a la posición inicial, manteniendo la tensión en el pecho en todo momento.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable low fly%';

-- cable lying fly
UPDATE public.exercises
SET 
    name = 'Aperturas acostado en polea',
    instructions = ARRAY[
        'Engancha los agarres a los cables y acuéstate boca arriba en un banco plano con los pies apoyados en el suelo.',
        'Sostén los agarres con las palmas mirándose entre sí y los brazos estirados directamente sobre tu pecho.',
        'Manteniendo una leve flexión en tus codos, baja los brazos hacia los lados en un arco amplio hasta que sientas un estiramiento en tu pecho.',
        'Haz una pausa por un momento, y luego aprieta los músculos de tu pecho para llevar los brazos de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable lying fly%';

-- cable middle fly
UPDATE public.exercises
SET 
    name = 'Aperturas medias en polea',
    instructions = ARRAY[
        'Engancha los cables a ambos lados de la máquina a la altura del pecho.',
        'Párate en el centro de la máquina con un pie ligeramente más adelante que el otro.',
        'Toma los agarres con un agarre prono y estira los brazos hacia los lados.',
        'Mantén una leve flexión en tus codos y una ligera inclinación hacia adelante.',
        'Contrae tu pecho y lleva los brazos hacia adelante en un movimiento de abrazo (barrido).',
        'Haz una pausa por un momento en el centro, y luego regresa lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable middle fly%';
