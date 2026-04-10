-- Actualización de ejercicios traducidos - Parte 43
-- Objetivo: Actualizar los nombres e instrucciones de Pectorales

-- kettlebell alternating press on floor
UPDATE public.exercises
SET 
    name = 'Press alterno en el suelo con pesas rusas / kettlebells',
    instructions = ARRAY[
        'Comienza acostado boca arriba en el suelo con las rodillas flectadas y los pies planos.',
        'Sostén una pesa rusa en cada mano, con las palmas mirando hacia tus pies y los brazos completamente estirados hacia el techo.',
        'Baja una pesa rusa hacia tu hombro, manteniendo la otra pesa extendida hacia arriba.',
        'Empuja la pesa rusa bajada de vuelta a la posición inicial, mientras de forma simultánea bajas la otra pesa rusa hacia tu hombro.',
        'Continúa alternando este movimiento de press con cada pesa rusa por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell alternating press on floor%';

-- kettlebell plyo push-up
UPDATE public.exercises
SET 
    name = 'Flexiones pliométricas sobre pesas rusas / kettlebells',
    instructions = ARRAY[
        'Comienza en una posición de plancha alta con tus manos apoyadas sobre las pesas rusas, separadas al ancho de los hombros.',
        'Baja tu pecho hacia el suelo, manteniendo los codos cerca de tu cuerpo.',
        'Empuja a través de tus manos de manera explosiva, separándolas de las pesas rusas y extendiendo los brazos por completo en el aire.',
        'Aterriza suavemente de nuevo sobre las pesas rusas e inmediatamente baja tu pecho para la siguiente repetición.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell plyo push-up%';

-- kneeling push-up (male)
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos de rodillas - hombre',
    instructions = ARRAY[
        'Comienza arrodillado en el suelo con las manos separadas al ancho de los hombros y los dedos apuntando hacia adelante.',
        'Extiende tus piernas hacia atrás, descansando sobre las rodillas o apoyando las puntas de los pies si prefieres, de manera que tu cuerpo forme una línea recta desde la cabeza hasta los talones o rodillas.',
        'Activa tu core y baja tu cuerpo hacia el suelo flectando los codos, manteniéndolos cerca de tus costados.',
        'Continúa bajando hasta que tu pecho esté justo por encima del suelo, y luego empújate hacia arriba para volver a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kneeling push-up (male)%';

-- lever chest press
UPDATE public.exercises
SET 
    name = 'Press de pecho en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y colócate en la máquina con la espalda plana contra el respaldo.',
        'Toma los agarres con un agarre prono (palmas hacia abajo) y posiciona tus codos en un ángulo de 90 grados.',
        'Empuja los agarres hacia adelante hasta que tus brazos estén completamente estirados, exhalando durante el movimiento.',
        'Haz una breve pausa al final del movimiento, y luego regresa lentamente a la posición inicial, inhalando mientras lo haces.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever chest press' OR name = 'lever chest press';

-- lever decline chest press
UPDATE public.exercises
SET 
    name = 'Press de pecho declinado en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y el respaldo de la máquina a una posición cómoda para el ángulo declinado.',
        'Siéntate en la máquina con tu espalda apoyada contra el respaldo y los pies planos en el suelo.',
        'Toma los agarres con un agarre prono y las manos separadas un poco más que el ancho de los hombros.',
        'Empuja los agarres hacia adelante y alejándolos de tu cuerpo hasta que tus brazos estén completamente extendidos.',
        'Baja lentamente los agarres de regreso hacia tu pecho, manteniendo los codos levemente flectados.',
        'Haz una pausa por un momento abajo, y luego empuja los agarres de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever decline chest press%';

-- lever incline chest press
UPDATE public.exercises
SET 
    name = 'Press de pecho inclinado en máquina',
    instructions = ARRAY[
        'Ajusta el asiento y el respaldo de la máquina a una posición cómoda.',
        'Siéntate en la máquina con tu espalda contra el respaldo y los pies planos en el suelo.',
        'Toma los agarres con un agarre prono y las manos separadas un poco más que el ancho de los hombros.',
        'Empuja los agarres hacia adelante y alejándolos de tu cuerpo hasta que tus brazos estén completamente extendidos.',
        'Haz una pausa por un momento, y luego flecta lentamente los codos bajando los agarres hacia tu pecho.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever incline chest press' OR name = 'lever incline chest press';

-- lever incline chest press v. 2
UPDATE public.exercises
SET 
    name = 'Press de pecho inclinado en máquina v. 2',
    instructions = ARRAY[
        'Ajusta la altura del asiento y el ángulo del respaldo de la máquina a una posición cómoda.',
        'Siéntate en la máquina con la espalda contra el respaldo y los pies planos en el suelo.',
        'Toma los agarres con un agarre prono, colocando las manos levemente más separadas que el ancho de tus hombros.',
        'Empuja los agarres hacia adelante y alejándolos de tu cuerpo hasta que tus brazos estén estirados, pero sin bloquear los codos.',
        'Haz una pausa por un momento en la posición de extensión completa, y luego flecta lentamente tus codos bajando los agarres hacia tu pecho.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever incline chest press v. 2%';

-- lever seated fly
UPDATE public.exercises
SET 
    name = 'Aperturas sentadas en máquina Peck Deck / Fly',
    instructions = ARRAY[
        'Ajusta la altura del asiento y colócate en la máquina con tu espalda apoyada contra el respaldo.',
        'Toma los agarres con un agarre prono y mantén los codos levemente flectados.',
        'Exhala y empuja los agarres hacia adelante, juntándolos frente a tu pecho en un movimiento de "abrazo".',
        'Haz una pausa por un momento, apretando bien los músculos de tu pecho.',
        'Inhala y regresa lentamente a la posición inicial, permitiendo que tus músculos pectorales se estiren.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever seated fly%';

-- lever standing chest press
UPDATE public.exercises
SET 
    name = 'Press de pecho de pie en máquina',
    instructions = ARRAY[
        'Ajusta la altura del agarre y colócate frente a la máquina con los pies planos en el suelo.',
        'Toma los agarres con un agarre prono y posiciónalos a la altura de tu pecho.',
        'Empuja los agarres hacia adelante hasta que tus brazos estén completamente estirados, manteniendo una leve flexión en los codos.',
        'Haz una pausa por un momento, y luego lleva lentamente los agarres de regreso hacia tu pecho, manteniendo el control durante todo el movimiento.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever standing chest press%';

-- machine inner chest press
UPDATE public.exercises
SET 
    name = 'Press de pecho interno en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y ubícate en la máquina con tu espalda plana contra el respaldo.',
        'Toma los agarres con un agarre prono y coloca tus codos en un ángulo de 90 grados.',
        'Empuja los agarres hacia adelante y ligeramente hacia el centro hasta que tus brazos estén estirados, exhalando durante el movimiento.',
        'Haz una pausa por un momento al final del movimiento, y luego regresa lentamente a la posición inicial, inhalando mientras lo haces.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'machine inner chest press%';

-- push up on bosu ball
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos sobre balón bosu',
    instructions = ARRAY[
        'Coloca el balón bosu en el suelo con el lado plano mirando hacia arriba.',
        'Posiciónate en postura de flexiones (plancha alta) apoyando tus manos en los bordes exteriores del bosu.',
        'Activa tu core y baja tu cuerpo hacia el balón bosu flectando los codos.',
        'Empújate hacia arriba volviendo a la posición inicial al estirar tus brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'push up on bosu ball%';

-- push-up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos tradicionales',
    instructions = ARRAY[
        'Comienza en una posición de plancha alta con las manos levemente más separadas que el ancho de los hombros y los pies juntos.',
        'Activa tu core y baja tu cuerpo hacia el suelo flectando los codos, manteniendo el cuerpo en una línea recta.',
        'Haz una pausa por un momento cuando tu pecho esté justo por encima del suelo, y luego empújate hacia arriba a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name = 'push-up' OR name ILIKE 'push-up %';

-- raise single arm push-up
UPDATE public.exercises
SET 
    name = 'Elevación a un brazo desde posición de flexión',
    instructions = ARRAY[
        'Comienza en una posición de flexiones con las manos levemente más separadas que el ancho de los hombros y los pies juntos.',
        'Estira un brazo directamente hacia el lado, paralelo al piso.',
        'Baja tu cuerpo hacia el suelo flectando los codos, manteniendo la espalda recta y el core activado.',
        'Empújate de vuelta a la posición inicial usando los músculos de tu pecho para levantar tu cuerpo.',
        'Repite con el otro brazo extendido.'
    ]
WHERE name ILIKE 'raise single arm push-up%';

-- resistance band seated chest press
UPDATE public.exercises
SET 
    name = 'Press de pecho sentado con banda elástica',
    instructions = ARRAY[
        'Siéntate en una silla o banco con la espalda recta y los pies planos en el suelo.',
        'Sostén los agarres de la banda elástica en cada mano (pasando la banda por detrás de tu espalda), con las palmas mirando hacia abajo y los codos flectados en un ángulo de 90 grados.',
        'Estira los brazos hacia adelante, empujando la banda elástica lejos de tu pecho.',
        'Haz una pausa por un momento al final del movimiento, y luego regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'resistance band seated chest press%';
