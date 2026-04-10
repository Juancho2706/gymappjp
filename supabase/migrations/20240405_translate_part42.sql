-- Actualización de ejercicios traducidos - Parte 42
-- Objetivo: Actualizar los nombres e instrucciones de Pectorales

-- cable standing up straight crossovers
UPDATE public.exercises
SET 
    name = 'Cruces en polea de pie',
    instructions = ARRAY[
        'Párate en el medio de una máquina de poleas con los pies separados al ancho de los hombros.',
        'Sostén los agarres de los cables con las palmas mirando hacia abajo y los brazos extendidos hacia los lados.',
        'Manteniendo los brazos estirados, junta las manos frente a tu cuerpo, cruzando una sobre la otra.',
        'Haz una pausa por un momento, y luego regresa lentamente a la posición inicial, manteniendo los brazos extendidos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable standing up straight crossovers%';

-- cable upper chest crossovers
UPDATE public.exercises
SET 
    name = 'Cruces en polea para pecho superior',
    instructions = ARRAY[
        'Engancha los agarres a los cables a la altura del pecho.',
        'Párate en el centro de la máquina de poleas con un pie levemente por delante del otro.',
        'Toma los agarres con las palmas mirando hacia abajo y los brazos extendidos hacia los lados.',
        'Mantén una leve flexión en tus codos y activa tu core.',
        'Tira de los cables juntándolos frente a tu pecho, cruzando uno sobre el otro.',
        'Aprieta tus músculos pectorales en el punto máximo del movimiento.',
        'Libera lentamente los cables de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable upper chest crossovers%';

-- chest dip (on dip-pull-up cage)
UPDATE public.exercises
SET 
    name = 'Fondos de pecho en estructura de fondos/dominadas',
    instructions = ARRAY[
        'Ajusta las barras de fondos a una altura que te permita agarrarlas cómodamente.',
        'Párate entre las barras y coloca tus manos en cada una, separadas un poco más que el ancho de los hombros.',
        'Da un salto y estira tus brazos, soportando el peso de tu cuerpo sobre las barras.',
        'Flecta las rodillas y cruza los tobillos detrás de ti.',
        'Baja tu cuerpo flectando los codos, manteniendo el pecho arriba y los hombros hacia abajo.',
        'Sigue bajando hasta que tus hombros estén por debajo de tus codos o hasta que sientas un estiramiento en tu pecho.',
        'Empuja a través de las palmas de tus manos y extiende los codos para levantar tu cuerpo de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'chest dip (on dip-pull-up cage)%';

-- deep push up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos profundas',
    instructions = ARRAY[
        'Comienza en una posición de plancha alta con las manos levemente más separadas que el ancho de tus hombros y el cuerpo formando una línea recta.',
        'Baja tu pecho hacia el suelo flectando los codos, manteniéndolos cerca de tu cuerpo.',
        'Empuja a través de las palmas de tus manos para estirar los brazos y regresar a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'deep push up%';

-- dumbbell decline bench press
UPDATE public.exercises
SET 
    name = 'Press de banca declinado con mancuernas',
    instructions = ARRAY[
        'Acuéstate en un banco declinado asegurando bien tus pies, con tu cabeza más abajo que las caderas.',
        'Sostén una mancuerna en cada mano y estira los brazos directamente sobre tu pecho, con las palmas mirando hacia adelante.',
        'Baja las mancuernas lentamente a los lados de tu pecho, manteniendo los codos en un ángulo de 90 grados.',
        'Empuja las mancuernas hacia arriba, regresando a la posición inicial al estirar por completo los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell decline bench press%';

-- dumbbell decline hammer press
UPDATE public.exercises
SET 
    name = 'Press martillo declinado con mancuernas',
    instructions = ARRAY[
        'Acuéstate en un banco declinado con los pies asegurados y la cabeza más abajo que tus caderas.',
        'Sostén una mancuerna en cada mano con las palmas mirándose entre sí (agarre neutro) y los brazos extendidos sobre tu pecho.',
        'Baja las mancuernas a los lados de tu pecho, manteniendo los codos levemente flectados.',
        'Empuja las mancuernas de vuelta a la posición inicial, estirando los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell decline hammer press%';

-- dumbbell decline twist fly
UPDATE public.exercises
SET 
    name = 'Vuelos declinados con giro usando mancuernas',
    instructions = ARRAY[
        'Acuéstate en un banco declinado con la cabeza más abajo que tus caderas.',
        'Sostén una mancuerna en cada mano con las palmas mirándose entre sí y los brazos extendidos directamente sobre tu pecho.',
        'Baja las mancuernas hacia los lados en un arco amplio hasta que sientas un estiramiento en tu pecho.',
        'A medida que bajas las mancuernas, gira las muñecas para que las palmas miren hacia adelante en la parte inferior del movimiento.',
        'Revierte el movimiento y lleva las mancuernas de vuelta a la posición inicial, apretando tus músculos pectorales en la parte alta.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell decline twist fly%';

-- dumbbell incline bench press
UPDATE public.exercises
SET 
    name = 'Press de banca inclinado con mancuernas',
    instructions = ARRAY[
        'Ajusta un banco inclinado a un ángulo de 45 grados.',
        'Siéntate en el banco con los pies apoyados planos en el suelo y la espalda presionada firmemente contra el respaldo.',
        'Sostén una mancuerna en cada mano, con las palmas mirando hacia adelante, y levántalas a la altura de los hombros.',
        'Baja lentamente las mancuernas a los lados de tu pecho, manteniendo los codos en un ángulo de 90 grados.',
        'Empuja las mancuernas de vuelta a la posición inicial, estirando los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline bench press%';

-- dumbbell incline breeding
UPDATE public.exercises
SET 
    name = 'Press inclinado / Aperturas con mancuernas',
    instructions = ARRAY[
        'Ajusta un banco inclinado a un ángulo de 45 grados.',
        'Siéntate en el banco con la espalda apoyada contra el respaldo y los pies planos en el suelo.',
        'Sostén una mancuerna en cada mano con un agarre prono (palmas mirando hacia adelante).',
        'Comienza con los brazos completamente estirados, perpendiculares al suelo.',
        'Baja las mancuernas lentamente a los lados de tu pecho, manteniendo los codos en un ángulo de 90 grados.',
        'Haz una pausa por un momento abajo, y luego empuja las mancuernas de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline breeding%';

-- dumbbell incline fly
UPDATE public.exercises
SET 
    name = 'Aperturas en banco inclinado con mancuernas',
    instructions = ARRAY[
        'Ajusta un banco inclinado a un ángulo de 45 grados.',
        'Siéntate en el banco con una mancuerna en cada mano y las palmas mirándose entre sí.',
        'Acuéstate en el banco y empuja las mancuernas a la posición inicial, directamente sobre tu pecho.',
        'Baja las mancuernas hacia los lados en un arco amplio hasta que sientas un estiramiento en tu pecho.',
        'Haz una pausa por un momento, y luego aprieta los músculos de tu pecho para llevar las mancuernas de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline fly' OR name = 'dumbbell incline fly';

-- dumbbell incline palm-in press
UPDATE public.exercises
SET 
    name = 'Press inclinado con agarre neutro / palmas hacia adentro',
    instructions = ARRAY[
        'Ajusta un banco inclinado a un ángulo de 45 grados.',
        'Siéntate en el banco con una mancuerna en cada mano, con las palmas mirándose entre sí.',
        'Planta tus pies firmemente en el suelo y mantén la espalda recta contra el banco.',
        'Comienza con las mancuernas a la altura de los hombros, los codos flectados y las palmas mirándose entre sí.',
        'Empuja las mancuernas hacia arriba y alejándolas de tu cuerpo, extendiendo los brazos por completo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline palm-in press%';

-- dumbbell incline press on exercise ball
UPDATE public.exercises
SET 
    name = 'Press inclinado con mancuernas sobre fitball',
    instructions = ARRAY[
        'Siéntate en un balón de ejercicios (fitball) con una mancuerna en cada mano, con las palmas mirando hacia adelante.',
        'Camina lentamente hacia adelante con los pies, rodando tu cuerpo hacia abajo por el balón hasta que tu cabeza, cuello y la parte superior de la espalda estén apoyados en él.',
        'Sostén las mancuernas a nivel de los hombros, con los codos flectados y apuntando hacia afuera.',
        'Empuja las mancuernas hacia arriba, estirando los brazos por completo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline press on exercise ball%';

-- dumbbell incline twisted flyes
UPDATE public.exercises
SET 
    name = 'Aperturas inclinadas con giro usando mancuernas',
    instructions = ARRAY[
        'Ajusta un banco inclinado a un ángulo de 45 grados y siéntate con una mancuerna en cada mano, palmas mirándose entre sí.',
        'Acuéstate en el banco y empuja las mancuernas hacia arriba a la posición inicial, directamente sobre tu pecho, con los brazos estirados.',
        'Baja las mancuernas hacia los lados en un arco amplio hasta que sientas un estiramiento en tu pecho.',
        'A medida que bajas las mancuernas, gira tus muñecas para que las palmas miren hacia adelante en la parte inferior del movimiento.',
        'Revierte el movimiento y lleva las mancuernas de vuelta a la posición inicial, apretando los músculos de tu pecho arriba.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline twisted flyes%';

-- dumbbell lying hammer press
UPDATE public.exercises
SET 
    name = 'Press martillo acostado con mancuernas',
    instructions = ARRAY[
        'Acuéstate en un banco plano con una mancuerna en cada mano, palmas mirándose entre sí y brazos estirados hacia arriba.',
        'Baja las mancuernas a los lados de tu pecho, manteniendo los codos en un ángulo de 90 grados.',
        'Empuja las mancuernas de vuelta a la posición inicial, estirando los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell lying hammer press%';

-- dumbbell one arm decline chest press
UPDATE public.exercises
SET 
    name = 'Press de pecho declinado a un brazo con mancuerna',
    instructions = ARRAY[
        'Acuéstate en un banco declinado con una mancuerna en una mano, descansando sobre tu pecho.',
        'Apoya los pies completamente en el suelo y mantén tu espalda presionada contra el banco.',
        'Estira tu brazo y empuja la mancuerna hacia el techo, extendiendo tu codo por completo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la mancuerna a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell one arm decline chest press%';

-- dumbbell one leg fly on exercise ball
UPDATE public.exercises
SET 
    name = 'Aperturas a una pierna en fitball con mancuernas',
    instructions = ARRAY[
        'Siéntate en un balón de ejercicios (fitball) con una mancuerna en cada mano, con las palmas mirándose entre sí.',
        'Apoya un pie en el suelo y estira la otra pierna frente a ti.',
        'Inclínate levemente hacia adelante y abre tus brazos hacia los lados, manteniendo una leve flexión en los codos.',
        'Baja lentamente las mancuernas hacia los lados, sintiendo un estiramiento en tu pecho.',
        'Haz una pausa por un momento abajo, y luego aprieta los músculos de tu pecho para llevar las mancuernas de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, luego cambia de pierna y repite.'
    ]
WHERE name ILIKE 'dumbbell one leg fly on exercise ball%';

-- dumbbell pullover hip extension on exercise ball
UPDATE public.exercises
SET 
    name = 'Pullover con extensión de cadera en fitball usando mancuerna',
    instructions = ARRAY[
        'Siéntate en un balón de ejercicios con los pies planos en el suelo y la mancuerna apoyada en tus muslos.',
        'Camina lentamente con los pies hacia adelante, rodando tu cuerpo sobre el balón hasta que tu cabeza, cuello y parte superior de la espalda estén apoyados en él.',
        'Sostén la mancuerna con ambas manos y estira los brazos directamente sobre tu pecho, manteniendo una leve flexión en los codos.',
        'Baja la mancuerna por detrás de tu cabeza, manteniendo los brazos rectos y controlando el movimiento en todo momento.',
        'Haz una pausa por un momento, y luego levanta la mancuerna de vuelta a la posición inicial.',
        'Mientras mantienes los brazos estirados, levanta tus caderas del suelo, apretando los glúteos y contrayendo tu core.',
        'Baja tus caderas de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell pullover hip extension on exercise ball%';

-- dumbbell reverse bench press
UPDATE public.exercises
SET 
    name = 'Press de banca inverso / supino con mancuernas',
    instructions = ARRAY[
        'Acuéstate boca arriba en un banco plano con los pies completamente apoyados en el suelo y las rodillas flectadas.',
        'Sostén una mancuerna en cada mano con un agarre en el que las palmas miren hacia tus pies (agarre supino en relación a tu cara).',
        'Estira tus brazos directamente hacia el techo, manteniendo una leve flexión en los codos.',
        'Baja lentamente las mancuernas hacia tu pecho, permitiendo que tus codos bajen pegados al cuerpo.',
        'Haz una pausa por un momento abajo, y luego empuja las mancuernas de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell reverse bench press%';

-- incline push-up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos inclinadas',
    instructions = ARRAY[
        'Apoya tus manos en una superficie elevada, como un banco o un cajón o step, separadas un poco más que el ancho de los hombros.',
        'Estira tus piernas hacia atrás, apoyándote en las puntas de tus pies, creando una línea recta desde tu cabeza hasta tus talones.',
        'Baja tu pecho hacia la superficie elevada flectando los codos, manteniendo tu cuerpo como una tabla recta.',
        'Haz una pausa por un momento abajo, y luego empújate para regresar a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'incline push-up' OR name = 'incline push-up';

-- incline push-up (on box)
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos inclinadas en cajón de salto',
    instructions = ARRAY[
        'Coloca tus manos en el borde de un cajón o superficie elevada, levemente más separadas que el ancho de los hombros.',
        'Estira tus piernas hacia atrás, apoyándote sobre las puntas de tus pies, creando una línea recta desde tu cabeza hasta tus talones.',
        'Baja tu pecho hacia el cajón flectando los codos, manteniendo la línea recta de tu cuerpo.',
        'Haz una pausa por un momento abajo, y luego empújate para volver a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'incline push-up (on box)%';

-- incline reverse grip push-up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos inclinadas con agarre supino / inverso',
    instructions = ARRAY[
        'Apoya tus manos en el borde de un banco o superficie elevada, levemente más separadas que el ancho de tus hombros (con los dedos apuntando hacia ti).',
        'Estira tus piernas hacia atrás, apoyándote en las puntas de los pies, formando una línea recta desde la cabeza hasta los talones.',
        'Baja tu pecho hacia el banco flectando los codos, manteniéndolos bien cerca de tus costados.',
        'Haz una pausa por un momento abajo, y luego empújate hacia arriba para volver a la posición inicial estirando tus brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'incline reverse grip push-up%';
