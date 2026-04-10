-- Actualización de ejercicios traducidos - Parte 39
-- Objetivo: Actualizar los nombres e instrucciones de Hombros

-- dumbbell seated alternate front raise
UPDATE public.exercises
SET 
    name = 'Elevación frontal alterna sentado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies completamente apoyados en el suelo.',
        'Sostén una mancuerna en cada mano con las palmas mirando hacia tu cuerpo y los brazos extendidos a los lados.',
        'Manteniendo los brazos estirados, levanta una mancuerna frente a ti hasta que quede paralela al suelo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la mancuerna a la posición inicial.',
        'Repite con el otro brazo.',
        'Alterna entre ambos brazos por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated alternate front raise%';

-- dumbbell seated alternate press
UPDATE public.exercises
SET 
    name = 'Press alterno sentado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con una mancuerna en cada mano y las palmas mirando hacia adelante.',
        'Levanta las mancuernas a la altura de los hombros, con los codos flectados y las palmas hacia adelante.',
        'Empuja una mancuerna hacia arriba, por encima de tu cabeza, estirando el brazo por completo.',
        'Baja la mancuerna de regreso a la altura del hombro.',
        'Repite con el otro brazo.',
        'Continúa alternando los brazos por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated alternate press%';

-- dumbbell seated alternate shoulder
UPDATE public.exercises
SET 
    name = 'Press de hombros alterno sentado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies planos en el suelo.',
        'Sostén una mancuerna en cada mano, con las palmas mirando hacia adentro, y levántalas a la altura de los hombros.',
        'Empuja una mancuerna por encima de tu cabeza mientras mantienes la otra a la altura del hombro.',
        'Baja la mancuerna elevada a la altura del hombro mientras, de forma simultánea, empujas la otra mancuerna hacia arriba.',
        'Continúa alternando entre brazos por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated alternate shoulder%';

-- dumbbell seated bent arm lateral raise
UPDATE public.exercises
SET 
    name = 'Elevación lateral sentado con brazos flectados y mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies planos en el suelo.',
        'Sostén una mancuerna en cada mano con las palmas mirando hacia tu cuerpo y los brazos flectados en un ángulo de 90 grados.',
        'Manteniendo los codos flectados, levanta los brazos hacia los lados hasta que queden paralelos al suelo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated bent arm lateral raise%';

-- dumbbell seated front raise
UPDATE public.exercises
SET 
    name = 'Elevación frontal sentado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con los pies apoyados planos en el suelo y una mancuerna en cada mano, descansando sobre tus muslos.',
        'Mantén la espalda recta y el core activado.',
        'Levanta las mancuernas frente a ti, con las palmas mirando hacia abajo, hasta que lleguen a la altura de los hombros.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated front raise%';

-- dumbbell seated lateral raise
UPDATE public.exercises
SET 
    name = 'Elevación lateral sentado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con los pies planos en el suelo y una mancuerna en cada mano, descansando sobre tus muslos.',
        'Mantén la espalda recta y tu core contraído.',
        'Levanta las mancuernas hacia los lados con una leve flexión en tus codos, hasta que tus brazos queden paralelos al suelo.',
        'Haz una pausa por un momento en la parte superior, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated lateral raise' OR name = 'dumbbell seated lateral raise';

-- dumbbell seated lateral raise v. 2
UPDATE public.exercises
SET 
    name = 'Elevación lateral sentado con mancuernas v. 2',
    instructions = ARRAY[
        'Siéntate en un banco con los pies planos en el suelo y una mancuerna en cada mano, descansando sobre tus muslos.',
        'Mantén la espalda recta y tu core contraído.',
        'Levanta las mancuernas hacia los lados con una leve flexión en tus codos, hasta que tus brazos queden paralelos al suelo.',
        'Haz una pausa por un momento en la parte superior, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated lateral raise v. 2%';

-- dumbbell seated shoulder press
UPDATE public.exercises
SET 
    name = 'Press de hombros sentado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con una mancuerna en cada mano, descansándolas sobre tus muslos.',
        'Levanta las mancuernas a la altura de los hombros, con las palmas mirando hacia adelante.',
        'Empuja las mancuernas hacia arriba hasta que tus brazos estén completamente estirados por encima de tu cabeza.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas de vuelta a la altura de los hombros.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated shoulder press' OR name = 'dumbbell seated shoulder press';

-- dumbbell seated shoulder press (parallel grip)
UPDATE public.exercises
SET 
    name = 'Press de hombros sentado con mancuernas - agarre neutro/paralelo',
    instructions = ARRAY[
        'Siéntate en un banco con una mancuerna en cada mano, con las palmas mirando hacia adentro.',
        'Levanta las mancuernas a la altura de los hombros, con los codos flectados y las palmas mirando hacia adelante. (Nota: mantén el agarre indicado en la máquina aunque parezca contra-intuitivo).',
        'Empuja las mancuernas hacia arriba hasta que tus brazos estén completamente estirados por encima de tu cabeza.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas de vuelta a la altura de los hombros.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell seated shoulder press (parallel grip)%';

-- dumbbell standing alternate raise
UPDATE public.exercises
SET 
    name = 'Elevación alterna de pie con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano con las palmas mirando hacia tu cuerpo.',
        'Mantén la espalda recta y tu core activado.',
        'Levanta una mancuerna hacia el lado, manteniendo tu brazo estirado y la palma mirando hacia abajo.',
        'Continúa levantando hasta que tu brazo esté paralelo al suelo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la mancuerna a la posición inicial.',
        'Repite con el otro brazo.',
        'Alterna entre brazos por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell standing alternate raise%';

-- dumbbell standing front raise above head
UPDATE public.exercises
SET 
    name = 'Elevación frontal por encima de la cabeza de pie con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano con un agarre prono.',
        'Mantén los brazos rectos y levanta las mancuernas frente a ti, subiéndolas hasta por encima de tu cabeza.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell standing front raise above head%';

-- dumbbell standing one arm palm in press
UPDATE public.exercises
SET 
    name = 'Press a un brazo de pie con mancuerna y palma hacia adentro',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en una mano a la altura del hombro con la palma mirando hacia adentro.',
        'Contrae tu core y mantén la espalda recta.',
        'Empuja la mancuerna hacia arriba hasta que tu brazo esté completamente estirado.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la mancuerna a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia al otro brazo.'
    ]
WHERE name ILIKE 'dumbbell standing one arm palm in press%';

-- dumbbell standing overhead press
UPDATE public.exercises
SET 
    name = 'Press de hombros de pie con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano a la altura de los hombros con las palmas mirando hacia adelante.',
        'Empuja las mancuernas hacia arriba hasta que tus brazos estén completamente extendidos por encima de tu cabeza.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas a la altura de los hombros.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell standing overhead press%';

-- dumbbell standing palms in press
UPDATE public.exercises
SET 
    name = 'Press de hombros de pie con agarre neutro / palmas hacia adentro',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano a la altura de los hombros con las palmas mirando hacia adentro.',
        'Manteniendo el core contraído y la espalda recta, empuja las mancuernas hacia arriba hasta que tus brazos estén completamente estirados por encima de tu cabeza.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell standing palms in press%';

-- dumbbell upright row
UPDATE public.exercises
SET 
    name = 'Remo al mentón con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano con un agarre prono (palmas hacia abajo).',
        'Deja que las mancuernas cuelguen frente a tus muslos, con los brazos completamente estirados.',
        'Manteniendo tu espalda recta y el core activado, exhala y levanta las mancuernas directamente hacia tu mentón, guiando el movimiento con los codos.',
        'Haz una pausa por un momento arriba, luego inhala y baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell upright row' OR name = 'dumbbell upright row';

-- dumbbell upright row (back pov)
UPDATE public.exercises
SET 
    name = 'Remo al mentón con mancuernas - vista posterior',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano con un agarre prono.',
        'Deja que las mancuernas cuelguen frente a tus muslos, con los brazos completamente estirados y las palmas mirando hacia tu cuerpo.',
        'Manteniendo la espalda recta y el core contraído, exhala y levanta las mancuernas directamente hacia tu mentón, guiando el movimiento con los codos.',
        'Continúa subiendo hasta que las mancuernas estén a la altura de los hombros, con los codos apuntando hacia los lados.',
        'Haz una pausa por un momento arriba, luego inhala y baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell upright row (back pov)%';

-- dumbbell w-press
UPDATE public.exercises
SET 
    name = 'Press en W con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con una mancuerna en cada mano y las palmas mirando hacia adelante.',
        'Levanta las mancuernas a la altura de los hombros, con los codos flectados y las palmas hacia adelante.',
        'Empuja las mancuernas hacia arriba hasta que tus brazos estén completamente estirados por encima de tu cabeza.',
        'Baja las mancuernas de vuelta a la altura de los hombros.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell w-press%';

-- ez barbell anti gravity press
UPDATE public.exercises
SET 
    name = 'Press antigravedad con barra EZ',
    instructions = ARRAY[
        'Comienza de pie, con los pies separados al ancho de los hombros y sosteniendo la barra EZ con un agarre prono.',
        'Levanta la barra a la altura de los hombros, manteniendo los codos levemente flectados y las palmas mirando hacia adelante.',
        'Empuja la barra por encima de tu cabeza, estirando los brazos por completo.',
        'Baja la barra a la altura de los hombros y repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'ez barbell anti gravity press%';

-- kettlebell alternating press
UPDATE public.exercises
SET 
    name = 'Press alterno con pesas rusas / kettlebells',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una pesa rusa en cada mano a la altura de los hombros.',
        'Empuja una pesa rusa por encima de tu cabeza, extendiendo el brazo por completo.',
        'Baja la pesa rusa de regreso a la altura del hombro.',
        'Repite con el otro brazo.',
        'Continúa alternando los brazos por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell alternating press%';

-- kettlebell arnold press
UPDATE public.exercises
SET 
    name = 'Press Arnold con pesas rusas / kettlebells',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una pesa rusa en cada mano a la altura de los hombros y con las palmas mirando hacia ti.',
        'Contrae tu core y empuja las pesas rusas por encima de tu cabeza, rotando las palmas para que queden mirando hacia adelante mientras estiras los brazos.',
        'Haz una pausa en la parte alta del movimiento, y luego baja lentamente las pesas rusas a la posición inicial (rotando las palmas hacia ti nuevamente).',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell arnold press%';

-- kettlebell double jerk
UPDATE public.exercises
SET 
    name = 'Envión o Jerk doble con pesas rusas / kettlebells',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una pesa rusa en cada mano a la altura de los hombros.',
        'Flecta levemente las rodillas y activa tu core.',
        'Empuja las pesas rusas por encima de tu cabeza, extendiendo los brazos por completo.',
        'Flecta tus rodillas y déjate caer rápidamente en una sentadilla parcial.',
        'Extiende de forma explosiva tus caderas y rodillas, impulsando las pesas rusas hacia arriba.',
        'Bloquea tus brazos y recibe las pesas rusas por encima de tu cabeza, manteniendo las rodillas levemente flectadas.',
        'Párate derecho y regresa a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell double jerk%';

-- kettlebell one arm jerk
UPDATE public.exercises
SET 
    name = 'Envión o Jerk a un brazo con pesa rusa / kettlebell',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una pesa rusa en una mano a la altura del hombro.',
        'Flecta levemente las rodillas y activa tu core.',
        'Empuja la pesa rusa por encima de tu cabeza en línea recta, extendiendo completamente tu brazo.',
        'A medida que empujas la pesa hacia arriba, baja las rodillas de forma simultánea y estíralas rápido para generar impulso.',
        'Cuando la pesa alcance su punto más alto, métete rápidamente debajo de ella flectando tus rodillas y caderas.',
        'Recibe la pesa rusa con una leve flexión en tus rodillas y caderas, y el brazo totalmente extendido por encima de tu cabeza.',
        'Párate derecho, estirando por completo caderas y rodillas, y estabiliza la pesa rusa arriba.',
        'Baja la pesa rusa a la posición inicial flectando caderas y rodillas, y repite por la cantidad de repeticiones deseadas.'
    ]
WHERE name ILIKE 'kettlebell one arm jerk%';

-- kettlebell seated press
UPDATE public.exercises
SET 
    name = 'Press sentado con pesas rusas / kettlebells',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies apoyados planos en el suelo.',
        'Sostén una pesa rusa en cada mano a la altura de los hombros, con las palmas mirando hacia adelante.',
        'Empuja las pesas rusas por encima de tu cabeza, estirando los brazos por completo.',
        'Baja las pesas rusas de vuelta a la altura de los hombros.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell seated press%';

-- kettlebell seesaw press
UPDATE public.exercises
SET 
    name = 'Press balancín con pesas rusas / kettlebells',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una pesa rusa en cada mano a la altura de los hombros.',
        'Empuja una pesa rusa por encima de tu cabeza mientras mantienes la otra a la altura del hombro.',
        'Baja la pesa rusa que presionaste de vuelta a la altura del hombro mientras, de forma simultánea, empujas la otra pesa hacia arriba.',
        'Continúa alternando el movimiento de empuje, creando un movimiento similar a un balancín.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell seesaw press%';
