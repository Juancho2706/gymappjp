-- Actualización de ejercicios traducidos - Parte 48
-- Objetivo: Actualizar los nombres e instrucciones de Tríceps

-- dumbbell seated reverse grip one arm overhead tricep extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps sobre la cabeza a un brazo sentado con agarre supino y mancuerna',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies planos en el suelo.',
        'Sostén una mancuerna con un agarre supino (la palma mirando hacia ti) y estira el brazo directamente hacia arriba por encima de tu cabeza.',
        'Baja la mancuerna por detrás de tu cabeza flectando tu codo, manteniendo la parte superior del brazo completamente quieta.',
        'Haz una pausa por un momento, y luego estira tu brazo hacia arriba para regresar a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell seated reverse grip one arm overhead tricep extension%';

-- dumbbell seated triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps sentado con mancuerna',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies planos en el suelo.',
        'Sostén una mancuerna con ambas manos y estira los brazos directamente por encima de tu cabeza.',
        'Flecta tus codos y baja la mancuerna por detrás de tu cabeza, manteniendo la parte superior de tus brazos cerca de tus orejas.',
        'Haz una pausa por un momento, y luego estira tus brazos regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated triceps extension%';

-- dumbbell standing alternating tricep kickback
UPDATE public.exercises
SET 
    name = 'Patada de tríceps alterna de pie con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano.',
        'Flecta levemente tus rodillas e inclínate hacia adelante desde las caderas, manteniendo la espalda recta.',
        'Estira tus brazos directamente hacia atrás, manteniendo los codos pegados a tu cuerpo.',
        'Haz una pausa por un momento en la parte superior, y luego baja lentamente las mancuernas de vuelta a la posición inicial.',
        'Repite con el otro brazo, alternando los lados en cada repetición.'
    ]
WHERE name ILIKE 'dumbbell standing alternating tricep kickback%';

-- dumbbell standing bent over two arm triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps a dos brazos inclinado de pie con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una mancuerna en cada mano.',
        'Inclínate hacia adelante desde la cintura, manteniendo tu espalda recta y las rodillas levemente flectadas.',
        'Estira tus brazos directamente hacia atrás, manteniendo los codos muy cerca de tu cuerpo.',
        'Baja lentamente las mancuernas regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell standing bent over two arm triceps extension%';

-- dumbbell standing one arm extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps a un brazo de pie con mancuerna',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en una mano.',
        'Levanta la mancuerna por encima de tu cabeza, extendiendo tu brazo por completo.',
        'Mantén la parte superior de tu brazo pegada a tu cabeza y perpendicular al piso.',
        'Baja lentamente la mancuerna por detrás de tu cabeza flectando tu codo.',
        'Haz una pausa por un momento, y luego levanta la mancuerna de vuelta a la posición inicial al estirar el brazo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell standing one arm extension%';

-- dumbbell standing triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps de pie con mancuerna',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una mancuerna en una mano.',
        'Levanta la mancuerna por encima de tu cabeza, manteniendo tu brazo estirado.',
        'Flecta tu codo y baja la mancuerna por detrás de tu cabeza, manteniendo la parte superior de tu brazo completamente quieta.',
        'Estira tu brazo hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell standing triceps extension%';

-- exercise ball dip
UPDATE public.exercises
SET 
    name = 'Fondos de tríceps en fitball',
    instructions = ARRAY[
        'Siéntate en un balón de estabilidad (fitball) con los pies planos en el suelo y las rodillas flectadas en un ángulo de 90 grados.',
        'Pon tus manos sobre el balón justo al lado de tus caderas, con los dedos apuntando hacia adelante.',
        'Activa tus tríceps y empuja a través de tus manos para levantar tu cuerpo del balón, estirando los brazos por completo.',
        'Baja tu cuerpo nuevamente flectando los codos, manteniéndolos bien pegados a tus costados.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'exercise ball dip%';

-- ez bar french press on exercise ball
UPDATE public.exercises
SET 
    name = 'Press francés con barra EZ sobre fitball',
    instructions = ARRAY[
        'Siéntate en un balón de ejercicios y sostén una barra EZ con un agarre prono.',
        'Estira tus brazos directamente hacia arriba, manteniendo los codos cerca de tu cabeza.',
        'Baja lentamente la barra por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego estira los brazos regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'ez bar french press on exercise ball%';

-- ez barbell decline close grip face press
UPDATE public.exercises
SET 
    name = 'Press a la cara declinado con agarre estrecho y barra EZ',
    instructions = ARRAY[
        'Acuéstate en un banco declinado con la cabeza más abajo que los pies.',
        'Toma la barra EZ con un agarre estrecho, palmas mirándose entre sí (o siguiendo la curvatura de la barra).',
        'Estira tus brazos directamente sobre tu pecho, manteniendo los codos cerca de tu cuerpo.',
        'Baja la barra hacia tu frente flectando tus codos.',
        'Haz una pausa por un momento, y luego empuja la barra de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'ez barbell decline close grip face press%';

-- ez barbell decline triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps declinada con barra EZ',
    instructions = ARRAY[
        'Acuéstate en un banco declinado con los pies asegurados y la cabeza más abajo que los pies.',
        'Toma la barra EZ con un agarre prono (palmas hacia adelante) y las manos separadas al ancho de los hombros.',
        'Estira tus brazos por completo, manteniendo los codos cerca de tu cabeza.',
        'Baja lentamente la barra hacia tu frente flectando los codos.',
        'Haz una pausa por un momento, y luego estira los brazos regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'ez barbell decline triceps extension%';

-- ez barbell incline triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps en banco inclinado con barra EZ',
    instructions = ARRAY[
        'Ajusta un banco inclinado a un ángulo de 45 grados.',
        'Siéntate en el banco apoyando tu espalda contra el respaldo y sostén la barra EZ con un agarre prono.',
        'Estira tus brazos completamente por encima de tu cabeza, manteniendo los codos cerca de ella.',
        'Baja la barra por detrás de tu cabeza flectando los codos, manteniendo inmóvil la parte superior de tus brazos.',
        'Haz una pausa por un momento, y luego estira los brazos regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'ez barbell incline triceps extension%';

-- ez barbell seated triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps sentado con barra EZ',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies planos en el suelo.',
        'Toma la barra EZ con un agarre prono, con las manos separadas al ancho de los hombros.',
        'Levanta la barra por encima de tu cabeza, estirando los brazos por completo.',
        'Manteniendo la parte superior de tus brazos fija, baja la barra por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego levanta la barra de vuelta a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'ez barbell seated triceps extension%';

-- ez-bar close-grip bench press
UPDATE public.exercises
SET 
    name = 'Press de banca con agarre estrecho y barra EZ',
    instructions = ARRAY[
        'Acuéstate en un banco plano con los pies planos en el suelo y tu espalda presionada contra el banco.',
        'Toma la barra EZ con un agarre estrecho, las manos al ancho de los hombros y las palmas apuntando hacia adelante (agarre prono).',
        'Saca la barra del soporte y sostenla directamente sobre tu pecho con los brazos completamente estirados.',
        'Baja lentamente la barra hacia tu pecho, manteniendo los codos bien pegados a tu cuerpo.',
        'Haz una pausa por un momento cuando la barra toque tu pecho.',
        'Empuja la barra de vuelta a la posición inicial, extendiendo los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'ez-bar close-grip bench press%';

-- lever overhand triceps dip
UPDATE public.exercises
SET 
    name = 'Fondos de tríceps en máquina con agarre prono',
    instructions = ARRAY[
        'Ajusta la máquina a una altura adecuada y asegura tu cuerpo en su posición.',
        'Toma los agarres con un agarre prono y posiciona tu cuerpo para que tus brazos estén completamente extendidos.',
        'Baja tu cuerpo flectando los codos, manteniendo la parte superior de los brazos pegada a tus costados.',
        'Continúa bajando hasta que la parte superior de tus brazos quede paralela al suelo.',
        'Haz una pausa por un momento, y luego empuja tu cuerpo hacia arriba regresando a la posición inicial estirando los codos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever overhand triceps dip%';

-- lever triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y ubícate en la máquina con la espalda contra la almohadilla.',
        'Toma los agarres con un agarre prono y estira tus brazos por completo hacia adelante.',
        'Manteniendo inmóvil la parte superior de tus brazos, baja lentamente los agarres hacia tu frente flectando los codos.',
        'Haz una pausa por un momento en la parte de mayor contracción, y luego empuja los agarres de vuelta a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever triceps extension%';

-- medicine ball close grip push up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos con agarre estrecho sobre balón medicinal',
    instructions = ARRAY[
        'Comienza en una posición de plancha alta con tus manos apoyadas sobre el balón medicinal, separadas al ancho de los hombros.',
        'Baja tu cuerpo hacia el suelo flectando los codos, manteniéndolos bien pegados a tus costados.',
        'Empújate hacia arriba a la posición inicial, estirando los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'medicine ball close grip push up%';

-- olympic barbell triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps con barra olímpica',
    instructions = ARRAY[
        'Comienza de pie, con los pies separados al ancho de los hombros y sosteniendo la barra con un agarre prono.',
        'Levanta la barra por encima de tu cabeza, extendiendo los brazos por completo.',
        'Manteniendo la parte superior de tus brazos pegada a tu cabeza, baja lentamente la barra por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego estira los brazos regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'olympic barbell triceps extension%';

-- one arm dip
UPDATE public.exercises
SET 
    name = 'Fondo de tríceps a un brazo',
    instructions = ARRAY[
        'Párate dándole la espalda a un banco o silla, con los pies separados al ancho de los hombros.',
        'Pon una mano en el banco o silla detrás de ti, con los dedos apuntando hacia tu cuerpo.',
        'Estira las piernas hacia adelante, manteniendo los talones en el suelo.',
        'Flecta tu codo y baja tu cuerpo hacia el suelo, manteniendo tu espalda muy cerca del banco o silla.',
        'Haz una pausa por un momento en la parte inferior, y luego empuja a través de tu palma para estirar el brazo y regresar a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, luego cambia de lado y repite con el otro brazo.'
    ]
WHERE name ILIKE 'one arm dip%';

-- push-up close-grip off dumbbell
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos con agarre estrecho sobre mancuernas',
    instructions = ARRAY[
        'Comienza en una posición de flexiones con las manos ubicadas muy juntas, directamente debajo de tus hombros.',
        'Sostén una mancuerna en cada mano, apoyadas firmemente en el suelo.',
        'Baja tu cuerpo hacia el suelo flectando los codos, manteniéndolos pegados a tus costados.',
        'Empuja a través de tus palmas para estirar tus brazos y regresar a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'push-up close-grip off dumbbell%';
