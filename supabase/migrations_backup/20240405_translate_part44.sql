-- Actualización de ejercicios traducidos - Parte 44
-- Objetivo: Actualizar los nombres e instrucciones de Pectorales y Trapecios

-- smith decline bench press
UPDATE public.exercises
SET 
    name = 'Press de banca declinado en máquina Smith',
    instructions = ARRAY[
        'Ajusta el banco declinado al ángulo deseado y ubícalo bajo la máquina Smith.',
        'Acuéstate en el banco con tus pies asegurados debajo de los rodillos.',
        'Toma la barra con un agarre prono (palmas hacia adelante) un poco más separado que el ancho de tus hombros.',
        'Saca la barra del soporte y bájala lentamente hacia tu pecho, manteniendo los codos apuntando hacia afuera.',
        'Haz una pausa por un momento abajo, y luego empuja la barra hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith decline bench press%';

-- smith decline reverse-grip press
UPDATE public.exercises
SET 
    name = 'Press declinado con agarre supino / inverso en máquina Smith',
    instructions = ARRAY[
        'Ajusta el banco declinado y ubícalo bajo la máquina Smith.',
        'Acuéstate en el banco con tus pies bien asegurados en los rodillos.',
        'Toma la barra con un agarre supino (palmas hacia ti), con las manos un poco más separadas que el ancho de los hombros.',
        'Saca la barra del soporte y bájala hacia tu pecho, manteniendo los codos pegados a tu cuerpo.',
        'Haz una pausa por un momento abajo, y luego empuja la barra de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith decline reverse-grip press%';

-- smith incline bench press
UPDATE public.exercises
SET 
    name = 'Press de banca inclinado en máquina Smith',
    instructions = ARRAY[
        'Ajusta el banco a una inclinación de 30 a 45 grados bajo la máquina Smith.',
        'Siéntate en el banco con la espalda plana contra el respaldo y los pies firmemente apoyados en el suelo.',
        'Toma la barra con un agarre prono, levemente más ancho que tus hombros.',
        'Saca la barra del soporte y bájala lentamente hacia la parte superior de tu pecho, manteniendo los codos levemente metidos hacia adentro.',
        'Haz una pausa por un momento abajo, y luego empuja la barra hacia arriba a la posición inicial, estirando los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith incline bench press%';

-- smith incline reverse-grip press
UPDATE public.exercises
SET 
    name = 'Press inclinado con agarre supino / inverso en máquina Smith',
    instructions = ARRAY[
        'Ajusta el asiento del banco a un ángulo inclinado cómodo bajo la máquina Smith.',
        'Siéntate en la máquina con la espalda contra el respaldo y los pies planos en el suelo.',
        'Toma la barra con un agarre supino que sea un poco más ancho que tus hombros.',
        'Saca la barra del soporte y bájala lentamente hacia tu pecho, manteniendo los codos cerca de tu cuerpo.',
        'Haz una pausa por un momento cuando la barra esté justo por encima de tu pecho.',
        'Empuja la barra de vuelta a la posición inicial, extendiendo los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith incline reverse-grip press%';

-- smith machine reverse decline close grip bench press
UPDATE public.exercises
SET 
    name = 'Press declinado con agarre inverso estrecho en máquina Smith',
    instructions = ARRAY[
        'Ajusta la máquina Smith y coloca el banco en posición declinada.',
        'Acuéstate en el banco asegurando tus pies bajo los rodillos.',
        'Toma la barra con un agarre supino estrecho, levemente más cerrado que el ancho de los hombros.',
        'Saca la barra del soporte y bájala lentamente hacia tu pecho, manteniendo los codos pegados a tu cuerpo.',
        'Haz una pausa por un momento abajo, y luego empuja la barra hacia arriba a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith machine reverse decline close grip bench press%';

-- smith reverse-grip press
UPDATE public.exercises
SET 
    name = 'Press con agarre supino / inverso en máquina Smith',
    instructions = ARRAY[
        'Ajusta la altura de la barra en la máquina Smith a nivel de tu pecho.',
        'Párate de frente a la barra con los pies separados al ancho de los hombros.',
        'Toma la barra con un agarre supino (palmas hacia ti), con las manos levemente más separadas que el ancho de los hombros.',
        'Da un paso atrás y posiciónate con una leve flexión en tus rodillas.',
        'Mantén el pecho levantado y el core activado durante todo el ejercicio.',
        'Baja la barra hacia tu pecho, manteniendo los codos pegados a tu cuerpo.',
        'Haz una pausa por un momento abajo, y luego empuja la barra hacia arriba a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith reverse-grip press%';

-- smith wide grip bench press
UPDATE public.exercises
SET 
    name = 'Press de banca con agarre ancho en máquina Smith',
    instructions = ARRAY[
        'Ajusta el banco en posición plana bajo la máquina Smith.',
        'Acuéstate en el banco con los pies planos en el suelo.',
        'Toma la barra con un agarre amplio, levemente más ancho que tus hombros.',
        'Saca la barra del soporte y bájala lentamente hacia tu pecho, manteniendo los codos apuntando hacia afuera.',
        'Haz una pausa por un momento cuando la barra toque tu pecho.',
        'Empuja la barra hacia arriba a la posición inicial, extendiendo los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith wide grip bench press%';

-- smith wide grip decline bench press
UPDATE public.exercises
SET 
    name = 'Press declinado con agarre ancho en máquina Smith',
    instructions = ARRAY[
        'Ajusta el banco declinado al ángulo deseado bajo la máquina Smith.',
        'Acuéstate en el banco con tus pies asegurados en los rodillos.',
        'Toma la barra con un agarre amplio, un poco más separado que el ancho de los hombros.',
        'Saca la barra del soporte y bájala lentamente hacia tu pecho, manteniendo los codos apuntando hacia afuera.',
        'Haz una pausa por un momento cuando la barra toque tu pecho.',
        'Empuja la barra hacia arriba a la posición inicial, extendiendo los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith wide grip decline bench press%';

-- weighted drop push up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos con caída / pliométricas con peso',
    instructions = ARRAY[
        'Comienza en una posición de plancha alta (con chaleco de peso o disco asegurado), con las manos un poco más separadas que el ancho de los hombros y los pies juntos.',
        'Baja tu pecho hacia el suelo, manteniendo los codos cerca de tu cuerpo.',
        'Una vez que tu pecho esté justo por encima del suelo, empújate explosivamente hacia arriba, levantando las manos del suelo.',
        'Mientras te empujas hacia arriba, mueve rápidamente tus manos hacia los lados y ligeramente hacia adelante, permitiendo que tu cuerpo caiga nuevamente hacia el piso.',
        'Amortigua la caída recibiéndote con las manos en la posición más ancha y baja inmediatamente tu pecho hacia el suelo de nuevo.',
        'Repite el movimiento de flexión pliométrica, cayendo y recibiéndote nuevamente con las manos en la posición más estrecha.',
        'Continúa alternando entre las posiciones de manos anchas y estrechas por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'weighted drop push up%';

-- wide hand push up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos con agarre ancho',
    instructions = ARRAY[
        'Comienza en una posición de plancha alta con las manos ubicadas más abiertas que el ancho de los hombros.',
        'Mantén tu cuerpo en una línea recta desde la cabeza hasta los pies.',
        'Baja tu pecho hacia el suelo flectando los codos, manteniéndolos cerca de tus costados.',
        'Empuja a través de las palmas de tus manos para estirar los brazos y regresar a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'wide hand push up%';

-- wide-grip chest dip on high parallel bars
UPDATE public.exercises
SET 
    name = 'Fondos de pecho con agarre ancho en barras paralelas altas',
    instructions = ARRAY[
        'Posiciónate en las barras paralelas con los brazos completamente estirados y el cuerpo suspendido en el aire.',
        'Inclínate levemente hacia adelante y baja tu cuerpo flectando los codos hasta que tu pecho esté justo por encima de las barras.',
        'Haz una pausa por un momento, y luego empújate de vuelta a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'wide-grip chest dip on high parallel bars%';

-- cable shrug
UPDATE public.exercises
SET 
    name = 'Encogimiento de hombros en polea',
    instructions = ARRAY[
        'Párate de frente a la máquina de polea baja con los pies separados al ancho de los hombros.',
        'Toma los agarres de la polea con un agarre prono y deja que tus brazos cuelguen frente a ti.',
        'Manteniendo los brazos estirados, encoge los hombros hacia arriba, en dirección a tus orejas.',
        'Sostén la contracción por un momento, y luego baja lentamente los hombros a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable shrug' OR name = 'cable shrug';

-- dumbbell shrug
UPDATE public.exercises
SET 
    name = 'Encogimiento de hombros con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una mancuerna en cada mano, con las palmas mirando hacia tu cuerpo.',
        'Mantén los brazos estirados y deja que las mancuernas cuelguen a tus lados.',
        'Levanta los hombros lo más alto posible, como si intentaras tocar tus orejas con ellos.',
        'Sostén la contracción por un segundo, y luego baja lentamente los hombros a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell shrug' OR name = 'dumbbell shrug';
