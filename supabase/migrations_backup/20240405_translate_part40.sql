-- Actualización de ejercicios traducidos - Parte 40
-- Objetivo: Actualizar los nombres e instrucciones de Hombros, Isquiotibiales y Lumbar

-- kettlebell two arm clean
UPDATE public.exercises
SET 
    name = 'Cargada a dos brazos con pesas rusas / kettlebells',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una pesa rusa frente a tus muslos con ambas manos, y con las palmas mirando hacia ti.',
        'Flecta levemente las rodillas e inclínate desde las caderas, bajando la pesa hacia el suelo.',
        'Extiende explosivamente tus caderas y rodillas, usando el impulso para tirar de la pesa rusa hacia tus hombros.',
        'A medida que la pesa rusa alcanza la altura de los hombros, rota tus muñecas y recíbela en la posición de "rack" (soporte frontal), con los codos pegados al cuerpo y la pesa descansando en la parte posterior de tu antebrazo.',
        'Baja la pesa rusa a la posición inicial y repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell two arm clean%';

-- kettlebell two arm military press
UPDATE public.exercises
SET 
    name = 'Press militar a dos brazos con pesas rusas / kettlebells',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una pesa rusa en cada mano a la altura de los hombros con las palmas hacia adelante.',
        'Contrae tu core y empuja las pesas rusas por encima de tu cabeza, extendiendo los brazos por completo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las pesas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell two arm military press%';

-- landmine lateral raise
UPDATE public.exercises
SET 
    name = 'Elevación lateral en landmine / mina terrestre',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y las rodillas levemente flectadas.',
        'Sostén la barra con un agarre prono (palmas hacia abajo), apoyándola en la parte delantera de tus hombros.',
        'Manteniendo tu core activado y la espalda recta, levanta la barra hacia arriba y alejándola de tu cuerpo, elevándola a la altura del hombro.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la barra a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'landmine lateral raise%';

-- lever military press
UPDATE public.exercises
SET 
    name = 'Press militar en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y ubícate en la máquina con la espalda contra el respaldo.',
        'Toma los agarres con un agarre prono y coloca tus manos a un ancho un poco mayor que el de los hombros.',
        'Empuja los agarres hacia arriba hasta que tus brazos estén completamente estirados, pero sin bloquear los codos.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los agarres a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever military press%';

-- lever one arm shoulder press
UPDATE public.exercises
SET 
    name = 'Press de hombros a un brazo en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y ubícate en la máquina con la espalda apoyada contra la almohadilla.',
        'Toma el agarre de la palanca con una mano y posiciona tu codo en un ángulo de 90 grados.',
        'Empuja el agarre hacia arriba hasta que tu brazo esté completamente extendido por encima de tu cabeza.',
        'Haz una pausa por un momento arriba, y luego baja lentamente el agarre a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'lever one arm shoulder press%';

-- lever seated reverse fly
UPDATE public.exercises
SET 
    name = 'Vuelos inversos sentado en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y colócate en la máquina con tu pecho apoyado contra la almohadilla y los pies planos en el suelo.',
        'Toma los agarres con un agarre prono y mantén los brazos levemente flectados.',
        'Exhala y junta tus escápulas mientras tiras de los agarres hacia atrás y hacia afuera, alejándolos de tu cuerpo.',
        'Haz una pausa por un momento en el punto de máxima contracción, luego inhala y regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever seated reverse fly' OR name = 'lever seated reverse fly';

-- lever seated reverse fly (parallel grip)
UPDATE public.exercises
SET 
    name = 'Vuelos inversos sentado en máquina - agarre neutro',
    instructions = ARRAY[
        'Ajusta la altura del asiento y colócate en la máquina con tu pecho apoyado contra la almohadilla y los pies planos en el suelo.',
        'Toma los agarres con un agarre paralelo (las palmas mirándose entre sí) y mantén los brazos levemente flectados.',
        'Exhala y junta tus escápulas mientras tiras de los agarres hacia atrás y hacia afuera, alejándolos de tu cuerpo.',
        'Haz una pausa por un momento en el punto de máxima contracción, luego inhala y regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever seated reverse fly (parallel grip)%';

-- lever shoulder press
UPDATE public.exercises
SET 
    name = 'Press de hombros en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y ubícate en la máquina con la espalda contra el respaldo.',
        'Toma los agarres con un agarre prono y posiciona tus manos a la altura de los hombros.',
        'Empuja los agarres hacia arriba hasta que tus brazos estén completamente extendidos, pero sin bloquear los codos.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los agarres a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever shoulder press' OR name = 'lever shoulder press';

-- lever shoulder press v. 2
UPDATE public.exercises
SET 
    name = 'Press de hombros en máquina v. 2',
    instructions = ARRAY[
        'Ajusta la altura del asiento y el respaldo de la máquina a una posición cómoda.',
        'Siéntate en la máquina con la espalda apoyada contra el respaldo y los pies planos en el suelo.',
        'Toma los agarres de la máquina con un agarre prono, un poco más separados que el ancho de los hombros.',
        'Empuja los agarres hacia arriba y hacia adelante hasta que tus brazos estén completamente extendidos, pero no bloqueados.',
        'Haz una pausa por un momento en la parte alta, y luego baja lentamente los agarres a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever shoulder press v. 2%';

-- lever shoulder press v. 3
UPDATE public.exercises
SET 
    name = 'Press de hombros en máquina v. 3',
    instructions = ARRAY[
        'Ajusta la altura del asiento y el respaldo de la máquina a una posición cómoda.',
        'Siéntate en la máquina con la espalda contra el respaldo y los pies planos en el suelo.',
        'Toma los agarres de la máquina con un agarre prono, levemente más anchos que tus hombros.',
        'Empuja los agarres hacia arriba y hacia adelante hasta que tus brazos queden estirados, sin bloquear los codos.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los agarres a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever shoulder press v. 3%';

-- smith rear delt row
UPDATE public.exercises
SET 
    name = 'Remo para deltoides posterior en máquina Smith',
    instructions = ARRAY[
        'Ajusta la altura del asiento y ubícate en la máquina con el pecho contra la almohadilla y los pies apoyados en el suelo. (Nota: Sigue las instrucciones de apoyo según la máquina descrita).',
        'Toma los agarres con un agarre prono, con las manos un poco más separadas que el ancho de los hombros.',
        'Mantén la espalda recta y el core activado mientras tiras de los agarres hacia tu pecho, apretando las escápulas.',
        'Haz una pausa por un momento en la parte superior del movimiento, y luego suelta lentamente los agarres de regreso a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith rear delt row%';

-- smith shoulder press
UPDATE public.exercises
SET 
    name = 'Press de hombros en máquina Smith',
    instructions = ARRAY[
        'Ajusta la altura del asiento y colócate en la máquina Smith con los pies separados al ancho de los hombros.',
        'Toma la barra con un agarre prono, levemente más separado que el ancho de los hombros.',
        'Saca la barra del soporte y posiciónala a nivel de los hombros, con los codos flectados y las palmas hacia adelante.',
        'Empuja la barra hacia arriba hasta que tus brazos estén completamente estirados por encima de tu cabeza.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la barra de vuelta a nivel de los hombros.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith shoulder press%';

-- smith standing behind head military press
UPDATE public.exercises
SET 
    name = 'Press militar de pie tras nuca en máquina Smith',
    instructions = ARRAY[
        'Ajusta la altura de la máquina Smith para que la barra quede a la altura de los hombros.',
        'Párate con los pies separados al ancho de los hombros y las rodillas levemente flectadas.',
        'Toma la barra con un agarre prono, un poco más abierto que el ancho de tus hombros.',
        'Saca la barra del soporte y da un paso hacia atrás, manteniendo una postura estable.',
        'Posiciona la barra detrás de tu cabeza, apoyada sobre tus trapecios superiores.',
        'Mantén el core apretado y el pecho arriba durante todo el ejercicio.',
        'Empuja la barra por encima de tu cabeza extendiendo y estirando los brazos por completo.',
        'Haz una breve pausa en la parte alta, y luego baja lentamente la barra a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith standing behind head military press%';

-- smith standing military press
UPDATE public.exercises
SET 
    name = 'Press militar de pie en máquina Smith',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y las rodillas levemente flectadas.',
        'Toma la barra con un agarre prono, un poco más separado que el ancho de los hombros.',
        'Levanta la barra del soporte y llévala hacia abajo a la altura de los hombros, con las palmas mirando hacia adelante.',
        'Empuja la barra hacia arriba hasta que tus brazos estén estirados por encima de tu cabeza.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la barra a la altura de los hombros.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith standing military press%';

-- standing behind neck press
UPDATE public.exercises
SET 
    name = 'Press tras nuca de pie',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén la barra detrás de tu cuello con un agarre prono.',
        'Mantén tu espalda recta y el core activado.',
        'Empuja la barra por encima de tu cabeza extendiendo tus brazos, estirando los codos por completo.',
        'Haz una pausa por un momento en la parte superior, y luego baja lentamente la barra a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'standing behind neck press%';

-- weighted front raise
UPDATE public.exercises
SET 
    name = 'Elevación frontal con peso',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano con las palmas apuntando hacia tus muslos.',
        'Manteniendo los brazos estirados, exhala y levanta las mancuernas frente a ti hasta que estén a la altura de los hombros.',
        'Haz una pausa por un momento arriba, luego inhala y baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'weighted front raise%';

-- weighted round arm
UPDATE public.exercises
SET 
    name = 'Círculos de brazos con peso',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una mancuerna en cada mano.',
        'Flecta levemente las rodillas e inclínate hacia adelante desde las caderas, manteniendo la espalda recta.',
        'Levanta los brazos hacia los lados, manteniendo una ligera flexión en tus codos.',
        'Sigue levantando los brazos hasta que queden paralelos al piso.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'weighted round arm%';

-- barbell straight leg deadlift
UPDATE public.exercises
SET 
    name = 'Peso muerto piernas rígidas con barra',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y las puntas de los pies mirando hacia adelante.',
        'Toma la barra con un agarre prono, con las manos un poco más separadas que el ancho de los hombros.',
        'Inclínate desde tus caderas y baja la barra hacia el suelo, manteniendo la espalda recta y las rodillas levemente flectadas.',
        'Baja la barra hasta que sientas el estiramiento en tus femorales (isquiotibiales).',
        'Contrae tus femorales y glúteos para levantar la barra y volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell straight leg deadlift%';

-- inverse leg curl (on pull-up cable machine)
UPDATE public.exercises
SET 
    name = 'Curl femoral inverso en máquina de poleas',
    instructions = ARRAY[
        'Ajusta la máquina de cables para que las tobilleras estén en la posición más baja.',
        'Acuéstate boca abajo en el banco con las piernas extendidas y las tobilleras puestas en tus pies.',
        'Sujétate de los agarres del banco para tener estabilidad.',
        'Flecta tus rodillas y haz el curl llevando tus piernas hacia los glúteos, apretando tus femorales.',
        'Haz una pausa por un momento en la parte superior del movimiento, y luego baja lentamente tus piernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'inverse leg curl (on pull-up cable machine)%';

-- kick out sit
UPDATE public.exercises
SET 
    name = 'Patada sentada',
    instructions = ARRAY[
        'Siéntate en el borde de un banco o silla con los pies planos en el suelo y las rodillas flectadas en 90 grados.',
        'Inclínate levemente hacia atrás y coloca tus manos en el borde del banco para apoyarte.',
        'Contrayendo tus femorales, levanta los pies del suelo y estira las piernas hacia el frente.',
        'Haz una pausa por un momento, y luego flecta lentamente las rodillas para acercar los pies hacia tu cuerpo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kick out sit%';

-- leg up hamstring stretch
UPDATE public.exercises
SET 
    name = 'Estiramiento de femorales con pierna elevada',
    instructions = ARRAY[
        'Acuéstate boca arriba con las piernas estiradas.',
        'Flecta una rodilla y llévala hacia tu pecho, sujetando tu muslo o pantorrilla.',
        'Estira la pierna lo más que puedas mientras la mantienes elevada.',
        'Mantén el estiramiento por 20 a 30 segundos.',
        'Repite con la otra pierna.'
    ]
WHERE name ILIKE 'leg up hamstring stretch%';

-- lever lying two-one leg curl
UPDATE public.exercises
SET 
    name = 'Curl femoral acostado en máquina',
    instructions = ARRAY[
        'Ajusta la máquina a tu cuerpo y siéntate con la espalda apoyada contra el respaldo (Nota: se mantiene la instrucción original de la máquina a pesar del título del ejercicio).',
        'Ubica tus piernas sobre la almohadilla de la palanca, justo por encima de tus tobillos.',
        'Toma los agarres a los lados de la máquina para estabilizarte.',
        'Manteniendo el torso quieto, exhala y flecta las piernas hacia arriba en dirección a tus glúteos.',
        'Haz una pausa por un momento arriba, luego inhala y baja lentamente las piernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever lying two-one leg curl%';

-- reclining big toe pose with rope
UPDATE public.exercises
SET 
    name = 'Postura del dedo gordo reclinada con cuerda',
    instructions = ARRAY[
        'Acuéstate boca arriba con las piernas estiradas y los brazos a los lados.',
        'Engancha la cuerda alrededor de la planta de tu pie derecho y sostén los extremos de la cuerda con tus manos.',
        'Levanta lentamente tu pierna derecha hacia el pecho, manteniendo la rodilla estirada y el pie flectado apuntando hacia ti.',
        'Mantén el estiramiento por unos segundos, y luego baja lentamente tu pierna a la posición inicial.',
        'Repite con tu pierna izquierda.',
        'Continúa alternando las piernas por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'reclining big toe pose with rope%';

-- seated wide angle pose sequence
UPDATE public.exercises
SET 
    name = 'Secuencia de postura de ángulo amplio sentado',
    instructions = ARRAY[
        'Siéntate en el suelo con las piernas extendidas y abiertas en un ángulo amplio.',
        'Flecta tus pies apuntando los dedos hacia ti y contrae los cuádriceps.',
        'Coloca tus manos en el suelo detrás de ti para darte apoyo.',
        'Manteniendo tu espalda recta, inclínate hacia adelante desde las caderas.',
        'Sigue inclinándote hacia adelante hasta que sientas un estiramiento en tus femorales.',
        'Mantén esta posición durante algunas respiraciones.',
        'Libera lentamente el estiramiento y regresa a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'seated wide angle pose sequence%';

-- self assisted inverse leg curl
UPDATE public.exercises
SET 
    name = 'Curl femoral inverso auto-asistido',
    instructions = ARRAY[
        'Acuéstate boca abajo en la máquina de curl de pierna, con las piernas extendidas y los tobillos enganchados bajo la almohadilla.',
        'Toma los agarres laterales de la máquina como apoyo.',
        'Manteniendo la parte superior de tu cuerpo quieta, exhala y haz un curl llevando tus piernas hacia arriba lo más que puedas.',
        'Sostén la posición contraída por una breve pausa mientras aprietas tus isquiotibiales.',
        'Baja lentamente las piernas hacia la posición inicial mientras inhalas.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'self assisted inverse leg curl' OR name = 'self assisted inverse leg curl';

-- self assisted inverse leg curl v.2
UPDATE public.exercises
SET 
    name = 'Curl femoral inverso auto-asistido V.2',
    instructions = ARRAY[
        'Acuéstate boca arriba en una colchoneta o banco con las piernas extendidas.',
        'Coloca tus manos a los costados o debajo de tus glúteos para darte apoyo.',
        'Flecta tus rodillas y levanta los pies del suelo, acercando tus muslos hacia tu pecho.',
        'Haz una pausa por un momento en la parte superior, y luego baja lentamente las piernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'self assisted inverse leg curl v.2%';

-- band straight leg deadlift
UPDATE public.exercises
SET 
    name = 'Peso muerto piernas rígidas con banda elástica',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y pisa la banda elástica con los pies.',
        'Toma la banda con ambas manos, las palmas mirando hacia tu cuerpo, y mantén los brazos estirados.',
        'Activa tu core y mantén una leve flexión en las rodillas.',
        'Inclínate lentamente hacia adelante desde las caderas, manteniendo la espalda recta y el pecho levantado.',
        'Baja la banda hacia el suelo mientras mantienes las piernas rectas.',
        'Haz una pausa por un momento abajo, y luego aprieta tus glúteos y femorales para regresar a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'band straight leg deadlift%';

-- exercise ball back extension with hands behind head
UPDATE public.exercises
SET 
    name = 'Extensión lumbar en fitball con manos tras la nuca',
    instructions = ARRAY[
        'Coloca el balón de estabilidad (fitball) en el suelo y acuéstate boca abajo sobre él, de forma que tus caderas queden descansando en el balón.',
        'Apoya tus pies contra una pared u otra superficie firme para ganar estabilidad.',
        'Cruza los brazos detrás de tu cabeza, con las manos tocando tu nuca.',
        'Activa el core y levanta lentamente la parte superior de tu torso del balón, extendiendo la espalda hasta que tu cuerpo forme una línea recta desde tu cabeza hasta las caderas.',
        'Haz una pausa por un momento arriba, y luego baja lentamente tu torso de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'exercise ball back extension with hands behind head%';
