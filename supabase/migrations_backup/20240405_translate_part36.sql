-- Actualización de ejercicios traducidos - Parte 36
-- Objetivo: Actualizar los nombres e instrucciones de Abdominales, Espalda Alta y Glúteos/Cuádriceps

-- barbell sitted alternate leg raise
UPDATE public.exercises
SET 
    name = 'Elevación alterna de piernas sentado con barra',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y sostén una barra sobre tus muslos.',
        'Manteniendo las piernas estiradas, levanta una pierna lo más alto posible mientras mantienes la otra apoyada en el suelo.',
        'Baja la pierna levantada a la posición inicial y repite con la otra pierna.',
        'Continúa alternando las piernas por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell sitted alternate leg raise' OR name = 'barbell sitted alternate leg raise';

-- barbell sitted alternate leg raise (female)
UPDATE public.exercises
SET 
    name = 'Elevación alterna de piernas sentado con barra - mujer',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y sostén una barra sobre tus muslos.',
        'Apoya tus manos en los bordes del banco para tener mayor estabilidad.',
        'Manteniendo las piernas estiradas, levanta una pierna lo más alto posible manteniéndola paralela al suelo.',
        'Baja la pierna y repite el movimiento con la otra.',
        'Continúa alternando las piernas por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell sitted alternate leg raise%(female)%';

-- sit-up with arms on chest
UPDATE public.exercises
SET 
    name = 'Sit-up con brazos cruzados en el pecho',
    instructions = ARRAY[
        'Acuéstate boca arriba con las rodillas flectadas y los pies completamente apoyados en el suelo.',
        'Cruza los brazos sobre tu pecho.',
        'Contrayendo tus abdominales, levanta la parte superior de tu cuerpo del suelo en dirección a tus rodillas.',
        'Haz una pausa por un momento en la parte superior, y luego baja lentamente la parte superior de tu cuerpo de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'sit-up with arms on chest%';

-- lever alternating narrow grip seated row
UPDATE public.exercises
SET 
    name = 'Remo sentado alterno con agarre estrecho en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y la posición de la plataforma para los pies para asegurar una postura correcta.',
        'Siéntate en la máquina con la espalda recta y los pies completamente apoyados en la plataforma.',
        'Toma los agarres con un agarre estrecho, con las palmas mirándose entre sí (agarre neutro).',
        'Mantén el pecho arriba y los hombros hacia atrás durante todo el ejercicio.',
        'Tira de un agarre hacia tu torso mientras mantienes el otro fijo.',
        'Junta y aprieta tus escápulas al final del movimiento.',
        'Regresa lentamente el agarre a la posición inicial y repite con el otro lado.',
        'Continúa alternando los lados por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever alternating narrow grip seated row%';

-- lever bent over row
UPDATE public.exercises
SET 
    name = 'Remo inclinado en máquina',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y las rodillas levemente flectadas.',
        'Sostén la barra con un agarre prono (palmas hacia abajo), con las manos separadas a un ancho ligeramente mayor que el de los hombros.',
        'Inclínate hacia adelante desde las caderas, manteniendo la espalda recta y el pecho arriba.',
        'Tira de la barra hacia la parte inferior de tu pecho, apretando tus escápulas al mismo tiempo.',
        'Haz una pausa por un momento en la parte superior, y luego baja lentamente la barra de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever bent over row%';

-- lever bent-over row with v-bar
UPDATE public.exercises
SET 
    name = 'Remo inclinado en máquina con barra en V',
    instructions = ARRAY[
        'Ajusta la altura del asiento y colócate frente a la máquina.',
        'Toma la barra en V con un agarre prono, manteniendo la espalda recta y las rodillas levemente flectadas.',
        'Tira de la barra en V hacia tu abdomen, juntando y apretando tus escápulas.',
        'Haz una pequeña pausa en la parte superior del movimiento, y luego suelta lentamente el peso de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever bent-over row with v-bar%';

-- lever high row
UPDATE public.exercises
SET 
    name = 'Remo alto en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y la plataforma para los pies en una posición cómoda.',
        'Siéntate en la máquina apoyando el pecho contra la almohadilla y con los pies planos sobre la plataforma.',
        'Toma los agarres con un agarre prono, separando las manos un poco más que el ancho de tus hombros.',
        'Mantén tu espalda recta y aprieta tu core.',
        'Tira de los agarres hacia tu cuerpo, juntando y apretando las escápulas.',
        'Haz una pausa por un momento en el punto de máxima contracción, y luego suelta lentamente los agarres para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever high row%';

-- lever narrow grip seated row
UPDATE public.exercises
SET 
    name = 'Remo sentado con agarre estrecho en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y los apoyos para los pies para asegurar una técnica correcta.',
        'Siéntate en la máquina con los pies apoyados y las rodillas levemente flectadas.',
        'Toma los agarres con un agarre estrecho, con las palmas mirándose entre sí.',
        'Mantén la espalda recta e inclínate ligeramente hacia adelante.',
        'Tira de los agarres hacia tu torso, apretando tus escápulas.',
        'Haz una pausa por un momento en la contracción máxima del movimiento.',
        'Regresa lentamente los agarres y vuelve a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever narrow grip seated row%';

-- lever one arm bent over row
UPDATE public.exercises
SET 
    name = 'Remo inclinado a un brazo en máquina',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, rodillas levemente flectadas y toma la barra con un agarre prono.',
        'Inclínate hacia adelante desde las caderas, manteniendo la espalda recta y la cabeza en alto.',
        'Deja que la barra cuelgue frente a ti con los brazos completamente estirados.',
        'Tira de la barra hacia tu pecho, manteniendo los codos pegados a tu cuerpo.',
        'Aprieta tus escápulas en la parte superior del movimiento.',
        'Baja la barra a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever one arm bent over row%';

-- lever one arm lateral high row
UPDATE public.exercises
SET 
    name = 'Remo alto lateral a un brazo en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y colócate mirando hacia la máquina.',
        'Toma el agarre con una mano y mantén la espalda recta.',
        'Tira del agarre hacia tu cuerpo, manteniendo el codo cerca de tu costado.',
        'Aprieta los músculos de tu espalda en la parte superior del movimiento.',
        'Regresa lentamente el agarre a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever one arm lateral high row%';

-- lever reverse grip vertical row
UPDATE public.exercises
SET 
    name = 'Remo vertical con agarre supino en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y la plataforma para los pies para asegurar una alineación correcta.',
        'Siéntate en la máquina apoyando tu pecho en la almohadilla y con los pies planos en la plataforma.',
        'Toma los agarres con un agarre supino (palmas mirando hacia arriba).',
        'Mantén tu espalda recta y aprieta tu core.',
        'Tira de los agarres hacia tu pecho, juntando y apretando tus escápulas.',
        'Haz una pausa por un momento en la parte alta del movimiento, y luego estira los brazos lentamente volviendo a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever reverse grip vertical row%';

-- lever reverse t-bar row
UPDATE public.exercises
SET 
    name = 'Remo en T invertido en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y la plataforma en la máquina.',
        'Siéntate apoyando tu pecho contra la almohadilla y con los pies planos en la plataforma.',
        'Toma los agarres con un agarre prono, con las manos levemente más separadas que el ancho de los hombros.',
        'Mantén la espalda recta y aprieta tu core.',
        'Tira de los agarres hacia tu pecho, apretando tus escápulas.',
        'Haz una pausa por un momento en el punto máximo del movimiento, y luego extiende lentamente tus brazos hacia la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever reverse t-bar row%';

-- lever seated row
UPDATE public.exercises
SET 
    name = 'Remo sentado en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y los apoyos para los pies a una posición cómoda.',
        'Siéntate en la máquina apoyando el pecho contra la almohadilla y con los pies en los apoyos.',
        'Toma los agarres con un agarre prono, separados al ancho de los hombros.',
        'Mantén la espalda recta y tu core activado.',
        'Tira de los agarres hacia tu cuerpo, juntando y apretando las escápulas.',
        'Haz una pausa por un momento en la máxima contracción del movimiento.',
        'Suelta lentamente los agarres y vuelve a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever seated row' OR name = 'lever seated row';

-- lever t bar row
UPDATE public.exercises
SET 
    name = 'Remo en T en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y la plataforma para los pies asegurando una alineación adecuada.',
        'Siéntate en la máquina apoyando el pecho en la almohadilla y con los pies planos.',
        'Toma los agarres con un agarre prono, con las manos separadas un poco más que el ancho de tus hombros.',
        'Mantén tu espalda recta y contrae tu core.',
        'Tira de los agarres hacia tu torso, apretando tus escápulas.',
        'Haz una pausa por un momento en la máxima contracción, y luego suelta lentamente volviendo a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever t bar row%';

-- lever t-bar reverse grip row
UPDATE public.exercises
SET 
    name = 'Remo en T con agarre supino en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y colócate en la máquina con tu pecho apoyado contra la almohadilla y los pies planos en el suelo.',
        'Toma los agarres con un agarre supino (palmas hacia arriba), separando las manos más allá del ancho de los hombros.',
        'Mantén la espalda recta y aprieta tu core.',
        'Tira de los agarres hacia tu pecho, juntando las escápulas.',
        'Haz una pausa por un momento arriba, y luego estira los brazos lentamente regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever t-bar reverse grip row%';

-- lever unilateral row
UPDATE public.exercises
SET 
    name = 'Remo unilateral en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y colócate de frente a la máquina.',
        'Toma los agarres con un agarre prono y mantén tu espalda recta.',
        'Tira de los agarres hacia tu cuerpo, apretando las escápulas.',
        'Haz una pausa por un momento en el punto máximo del movimiento, y luego estira tus brazos volviendo a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever unilateral row%';

-- sled 45° leg press
UPDATE public.exercises
SET 
    name = 'Prensa de piernas a 45°',
    instructions = ARRAY[
        'Ajusta el asiento y la plataforma de la prensa a una posición cómoda.',
        'Siéntate apoyando tu espalda completamente en el respaldo y apoya los pies en la plataforma, separados al ancho de los hombros.',
        'Sujétate de los agarres laterales del asiento para mayor estabilidad.',
        'Empuja la plataforma alejándola de ti estirando las piernas, siempre empujando desde los talones.',
        'Sigue empujando hasta que tus piernas estén casi estiradas por completo, pero evita bloquear las rodillas.',
        'Haz una pequeña pausa arriba, y luego baja lentamente la plataforma flectando las rodillas.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'sled 45° leg press' OR name = 'sled 45° leg press';

-- sled 45° leg press (back pov)
UPDATE public.exercises
SET 
    name = 'Prensa de piernas a 45° - vista posterior',
    instructions = ARRAY[
        'Ajusta el asiento de la prensa para que tus rodillas queden en un ángulo de 45 grados.',
        'Siéntate apoyando la espalda en el respaldo y ubica tus pies separados al ancho de los hombros en la plataforma.',
        'Sujétate de los agarres laterales para mantener la estabilidad.',
        'Empuja la plataforma alejándola de ti extendiendo las piernas, aplicando la fuerza a través de los talones.',
        'Haz una pausa en la posición con las piernas extendidas.',
        'Flecta lentamente las rodillas y baja la plataforma hacia ti, controlando el movimiento.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'sled 45° leg press (back pov)%';

-- sled 45° leg wide press
UPDATE public.exercises
SET 
    name = 'Prensa de piernas a 45° postura abierta',
    instructions = ARRAY[
        'Ajusta la prensa de piernas a un ángulo de 45 grados.',
        'Siéntate con tu espalda apoyada en el respaldo y coloca los pies en la plataforma.',
        'Separa tus pies a una distancia mayor que el ancho de tus hombros.',
        'Empuja la plataforma para extender tus piernas y estirar tus rodillas.',
        'Haz una pausa al final del movimiento, y luego flecta lentamente las rodillas regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'sled 45° leg wide press%';

-- sled hack squat
UPDATE public.exercises
SET 
    name = 'Sentadilla hack en máquina',
    instructions = ARRAY[
        'Ajusta la máquina de sentadilla hack a una posición cómoda según tu estatura.',
        'Párate con los pies separados al ancho de los hombros sobre la plataforma, con las puntas de los pies mirando levemente hacia afuera.',
        'Sujétate de los agarres o barras de la máquina para estabilizarte.',
        'Baja tu cuerpo flectando las caderas y las rodillas, manteniendo la espalda recta y sacando pecho.',
        'Continúa bajando hasta que tus muslos estén paralelos al suelo o un poco más abajo.',
        'Haz una pausa por un momento, y luego empuja a través de los talones para levantar tu cuerpo de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'sled hack squat%';
