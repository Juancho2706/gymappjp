-- Actualización de ejercicios traducidos - Parte 47
-- Objetivo: Actualizar los nombres e instrucciones de Tríceps (principalmente con mancuernas y peso corporal)

-- cable two arm tricep kickback
UPDATE public.exercises
SET 
    name = 'Patada de tríceps a dos brazos en polea',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y las rodillas levemente flectadas.',
        'Sostén el agarre de la polea en cada mano con las palmas mirando hacia adentro y los brazos flectados en un ángulo de 90 grados.',
        'Manteniendo la parte superior de los brazos inmóvil, estira tus antebrazos hacia atrás hasta que los brazos estén completamente extendidos.',
        'Haz una pausa por un momento, y luego regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable two arm tricep kickback%';

-- close-grip push-up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos con agarre estrecho',
    instructions = ARRAY[
        'Comienza en una posición de plancha alta con las manos ubicadas muy juntas, directamente debajo de tus hombros.',
        'Activa tu core y baja tu cuerpo hacia el suelo, manteniendo los codos bien pegados a tus costados.',
        'Empuja a través de las palmas de tus manos para estirar los brazos y regresar a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name = 'close-grip push-up' OR name ILIKE 'close-grip push-up%';

-- diamond push-up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos en diamante',
    instructions = ARRAY[
        'Comienza en una posición de plancha alta con las manos muy juntas, formando un diamante con tus pulgares y dedos índices.',
        'Mantén tu cuerpo en una línea recta desde la cabeza hasta la punta de los pies, apretando el core y los glúteos.',
        'Baja tu pecho hacia el diamante formado por tus manos, manteniendo los codos muy cerca de tu cuerpo.',
        'Haz una pausa por un momento abajo, y luego empújate hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'diamond push-up%';

-- dumbbell close grip press
UPDATE public.exercises
SET 
    name = 'Press con agarre estrecho con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco plano con una mancuerna en cada mano, apoyándolas sobre tus muslos.',
        'Usando tus muslos como ayuda para levantar el peso, sube las mancuernas una a la vez para sostenerlas frente a ti al ancho de los hombros.',
        'Una vez a la altura de los hombros, gira las muñecas hacia adelante para que las palmas de tus manos miren hacia afuera (alejándose de ti). Esta será tu posición inicial.',
        'Mientras inhalas, baja lentamente las mancuernas hacia tus costados hasta que queden aproximadamente al nivel de tu pecho.',
        'Mientras exhalas, usa tus tríceps para levantar las mancuernas de vuelta a la posición inicial. Asegúrate de usar solo tus tríceps y no ayudarte con los antebrazos ni los bíceps.',
        'Tras una breve pausa en la posición de máxima contracción, repite el movimiento por la cantidad de repeticiones indicadas.'
    ]
WHERE name ILIKE 'dumbbell close grip press%' OR name ILIKE 'dumbbell close-grip press%';

-- dumbbell decline triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps declinada con mancuernas',
    instructions = ARRAY[
        'Acuéstate en un banco declinado asegurando bien tus pies, con tu cabeza más abajo que las caderas, y sostén una mancuerna en cada mano, palmas mirándose entre sí.',
        'Estira tus brazos por completo, manteniendo los codos apuntando hacia tu cabeza (cerca de ella).',
        'Baja lentamente las mancuernas por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego levanta las mancuernas de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell decline triceps extension%';

-- dumbbell incline hammer press on exercise ball
UPDATE public.exercises
SET 
    name = 'Press martillo inclinado sobre fitball con mancuernas',
    instructions = ARRAY[
        'Siéntate en un balón de ejercicios (fitball) con una mancuerna en cada mano, palmas mirándose entre sí.',
        'Camina con los pies hacia adelante y rueda tu cuerpo sobre el balón hasta que tu cabeza, cuello y la parte superior de la espalda estén apoyados en él.',
        'Sostén las mancuernas a la altura de los hombros, con los codos flectados y apuntando hacia los lados.',
        'Empuja las mancuernas hacia arriba y levemente hacia adentro, manteniendo las palmas mirándose entre sí.',
        'Estira los brazos por completo, apretando tus tríceps en la parte superior del movimiento.',
        'Baja lentamente las mancuernas regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline hammer press on exercise ball%';

-- dumbbell incline triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps en banco inclinado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco inclinado con una mancuerna en cada mano, palmas mirando hacia adentro.',
        'Estira tus brazos por completo por encima de tu cabeza, manteniendo los codos pegados a tu cabeza.',
        'Baja las mancuernas por detrás de tu cabeza flectando los codos, manteniendo la parte superior de tus brazos inmóvil.',
        'Haz una pausa por un momento, y luego levanta las mancuernas regresando a la posición inicial al estirar los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline triceps extension%';

-- dumbbell kickback
UPDATE public.exercises
SET 
    name = 'Patada de tríceps con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una mancuerna en cada mano.',
        'Flecta levemente las rodillas e inclínate hacia adelante desde las caderas, manteniendo la espalda recta.',
        'Lleva la parte superior de tus brazos pegada a tus costados, con los codos flectados en un ángulo de 90 grados.',
        'Estira tus brazos directamente hacia atrás, apretando tus tríceps en el punto de máxima extensión.',
        'Haz una pausa por un momento, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell kickback' OR name = 'dumbbell kickback';

-- dumbbell lying alternate extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps alterna acostado con mancuernas',
    instructions = ARRAY[
        'Acuéstate en un banco plano con una mancuerna en cada mano, con las palmas mirándose entre sí.',
        'Estira tus brazos directamente sobre tu pecho, manteniendo una leve flexión en los codos.',
        'Baja una mancuerna hacia tu cabeza flectando el codo, mientras mantienes el otro brazo completamente estirado.',
        'Haz una pausa por un momento abajo, y luego estira el brazo para regresar la mancuerna a la posición inicial.',
        'Repite con el otro brazo, alternando lados por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell lying alternate extension%';

-- dumbbell lying extension (across face)
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps cruzando la cara con mancuerna',
    instructions = ARRAY[
        'Acuéstate en un banco plano con los pies apoyados en el suelo y tu cabeza en el borde del banco.',
        'Sostén una mancuerna con ambas manos y estira tus brazos directamente sobre tu pecho, palmas mirándose entre sí.',
        'Manteniendo la parte superior de los brazos quieta, baja lentamente la mancuerna en un arco por detrás de tu cabeza hasta que tus antebrazos queden paralelos al suelo.',
        'Haz una pausa por un momento, y luego contrae los tríceps para regresar la mancuerna a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell lying extension (across face)%';

-- dumbbell lying one arm pronated triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps a un brazo acostado con agarre prono y mancuerna',
    instructions = ARRAY[
        'Acuéstate en un banco plano con tu espalda y cabeza totalmente apoyadas, y los pies planos en el suelo.',
        'Sostén una mancuerna en una mano con la palma mirando hacia adelante (agarre prono), y estira tu brazo directamente sobre tu hombro.',
        'Manteniendo la parte superior de tu brazo quieta, baja lentamente la mancuerna por detrás de tu cabeza flectando el codo.',
        'Haz una pausa por un momento abajo, y luego estira tu brazo para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell lying one arm pronated triceps extension%';

-- dumbbell lying one arm supinated triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps a un brazo acostado con agarre supino y mancuerna',
    instructions = ARRAY[
        'Acuéstate en un banco plano con tu espalda y cabeza apoyadas, y los pies planos en el suelo.',
        'Sostén una mancuerna en una mano con un agarre supino (la palma mirando hacia ti), y estira el brazo directamente sobre tu hombro.',
        'Manteniendo la parte superior de tu brazo completamente quieta, baja lentamente la mancuerna por detrás de tu cabeza flectando tu codo.',
        'Haz una pausa por un momento abajo, y luego estira tu brazo para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell lying one arm supinated triceps extension%';

-- dumbbell lying single extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps a un brazo acostado con mancuerna',
    instructions = ARRAY[
        'Acuéstate en un banco plano con una mancuerna en una mano y tu brazo completamente estirado sobre tu pecho.',
        'Baja la mancuerna de manera controlada hacia tu frente, manteniendo la parte superior del brazo completamente quieta.',
        'Haz una breve pausa en el punto inferior del movimiento, y luego estira tu brazo para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell lying single extension%';

-- dumbbell one arm french press on exercise ball
UPDATE public.exercises
SET 
    name = 'Press francés a un brazo sobre fitball con mancuerna',
    instructions = ARRAY[
        'Siéntate en un balón de ejercicios (fitball) con los pies planos en el suelo y la espalda recta.',
        'Sostén una mancuerna en una mano con la palma apuntando hacia arriba y tu codo flectado en un ángulo de 90 grados.',
        'Estira tu brazo completamente hacia el techo, manteniendo tu codo inmóvil.',
        'Baja lentamente la mancuerna regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell one arm french press on exercise ball%';

-- dumbbell pronate-grip triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps con agarre prono con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco o silla con la espalda recta y los pies planos en el suelo.',
        'Sostén una mancuerna con ambas manos, palmas hacia abajo (agarre prono), y estira tus brazos por encima de tu cabeza.',
        'Manteniendo la parte superior de los brazos cerca de tu cabeza y los codos apuntando hacia adelante, baja lentamente la mancuerna por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego estira los brazos hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell pronate-grip triceps extension%';

-- dumbbell seated bench extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps sentado en banco con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies planos en el suelo.',
        'Sostén una mancuerna con ambas manos y estira tus brazos directamente por encima de tu cabeza.',
        'Baja lentamente la mancuerna por detrás de tu cabeza, manteniendo los codos cerca de tus orejas.',
        'Haz una pausa por un momento, y luego levanta la mancuerna regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated bench extension%';

-- dumbbell seated kickback
UPDATE public.exercises
SET 
    name = 'Patada de tríceps sentado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con los pies planos en el suelo y sostén una mancuerna en cada mano.',
        'Flecta levemente las rodillas e inclínate hacia adelante desde las caderas, manteniendo la espalda recta.',
        'Lleva la parte superior de tus brazos pegada a tus costados y mantén los codos flectados a 90 grados.',
        'Estira tus brazos completamente hacia atrás, apretando tus tríceps en la parte superior del movimiento.',
        'Haz una pausa por un momento, y luego baja lentamente las mancuernas regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated kickback%';
