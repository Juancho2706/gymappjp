-- Actualización de ejercicios traducidos - Parte 45
-- Objetivo: Actualizar los nombres e instrucciones de Trapecios y Tríceps

-- kettlebell sumo high pull
UPDATE public.exercises
SET 
    name = 'Tirón alto sumo con pesa rusa / kettlebell',
    instructions = ARRAY[
        'Párate con los pies más separados que el ancho de los hombros, con las puntas de los pies apuntando hacia afuera.',
        'Sostén una pesa rusa con ambas manos frente a tu cuerpo, con los brazos estirados hacia abajo.',
        'Flecta tus rodillas y baja las caderas a una posición de sentadilla, manteniendo la espalda recta.',
        'Empuja a través de tus talones y extiende explosivamente tus caderas y rodillas, tirando de la pesa rusa hacia arriba en dirección a tu mentón.',
        'A medida que tiras de la pesa rusa hacia arriba, mantén los codos altos y apuntando hacia afuera, y junta las escápulas.',
        'Baja la pesa rusa de regreso a la posición inicial y repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'kettlebell sumo high pull%';

-- lever shrug
UPDATE public.exercises
SET 
    name = 'Encogimiento de hombros en máquina',
    instructions = ARRAY[
        'Ajusta la altura del asiento y ubícate en la máquina con la espalda apoyada contra el respaldo.',
        'Toma los agarres con un agarre prono y mantén los brazos estirados.',
        'Manteniendo la espalda recta, encoge y levanta los hombros hacia tus orejas lo más alto posible.',
        'Sostén la contracción por un momento, y luego baja lentamente los hombros a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'lever shrug' OR name = 'lever shrug';

-- scapular pull-up
UPDATE public.exercises
SET 
    name = 'Dominadas escapulares',
    instructions = ARRAY[
        'Comienza colgando de una barra de dominadas con las palmas mirando hacia adelante (agarre prono) y los brazos completamente estirados.',
        'Retrae tus escápulas tirando de ellas hacia abajo y hacia atrás.',
        'Activa los músculos de tu espalda y levanta tu cuerpo un poco hacia la barra, enfocándote únicamente en juntar y apretar las escápulas.',
        'Haz una pausa por un momento en la parte superior del movimiento, y luego baja lentamente tu cuerpo a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'scapular pull-up%';

-- band close-grip push-up
UPDATE public.exercises
SET 
    name = 'Flexiones de brazos con agarre estrecho y banda elástica',
    instructions = ARRAY[
        'Coloca una banda elástica alrededor de la parte superior de tus brazos, justo por encima de los codos.',
        'Posiciónate en postura de plancha alta para hacer flexiones, con las manos directamente debajo de tus hombros y tu cuerpo formando una línea recta desde la cabeza hasta los talones.',
        'Flecta tus codos y baja tu pecho hacia el suelo, manteniendo los codos bien pegados a tus costados.',
        'Empuja a través de las palmas de tus manos para estirar los brazos y regresar a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'band close-grip push-up%';

-- band side triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps lateral con banda elástica',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén la banda con ambas manos, con las palmas mirando hacia abajo.',
        'Estira tus brazos hacia los lados, manteniéndolos paralelos al suelo.',
        'Flecta lentamente tus codos y lleva las manos hacia tus hombros, manteniendo la parte superior de tus brazos inmóvil.',
        'Haz una pausa por un momento, y luego estira lentamente los brazos hacia afuera regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'band side triceps extension%';

-- barbell incline close grip bench press
UPDATE public.exercises
SET 
    name = 'Press de banca inclinado con agarre estrecho y barra',
    instructions = ARRAY[
        'Ajusta un banco inclinado a un ángulo de 45 grados.',
        'Acuéstate en el banco con los pies apoyados planos en el suelo.',
        'Toma la barra con un agarre estrecho, un poco más cerrado que el ancho de los hombros.',
        'Saca la barra del soporte y bájala lentamente hacia tu pecho, manteniendo los codos pegados a tu cuerpo.',
        'Haz una pausa por un momento cuando la barra toque tu pecho.',
        'Empuja la barra de vuelta a la posición inicial, estirando los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell incline close grip bench press%';

-- barbell incline reverse-grip press
UPDATE public.exercises
SET 
    name = 'Press inclinado con agarre supino / inverso y barra',
    instructions = ARRAY[
        'Ajusta un banco inclinado a un ángulo de 45 grados.',
        'Acuéstate en el banco y toma la barra con un agarre supino (palmas hacia ti), con las manos levemente más separadas que el ancho de los hombros.',
        'Saca la barra del soporte y bájala hacia la parte superior de tu pecho, manteniendo los codos pegados a tu cuerpo.',
        'Haz una pausa por un momento en la parte inferior, y luego empuja la barra hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell incline reverse-grip press%';

-- barbell jm bench press
UPDATE public.exercises
SET 
    name = 'Press JM en banco con barra',
    instructions = ARRAY[
        'Acuéstate boca arriba en un banco plano con los pies planos en el suelo y la espalda presionada firmemente contra el banco.',
        'Toma la barra con un agarre prono, levemente más separado que el ancho de los hombros.',
        'Baja la barra hacia tu pecho superior / cuello, manteniendo los codos flectados y cerca de tu cuerpo.',
        'Empuja la barra hacia arriba y ligeramente hacia atrás a la posición inicial, estirando los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell jm bench press%';

-- barbell lying back of the head tricep extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps tras nuca acostado con barra',
    instructions = ARRAY[
        'Acuéstate boca arriba en un banco plano con los pies apoyados en el suelo y tu cabeza justo en el borde del banco.',
        'Sostén una barra con un agarre prono, las manos al ancho de los hombros, y estira los brazos directamente sobre tu pecho.',
        'Manteniendo inmóvil la parte superior de tus brazos, baja lentamente la barra por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego estira los brazos hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell lying back of the head tricep extension%';

-- barbell lying extension
UPDATE public.exercises
SET 
    name = 'Rompecráneos / Extensión acostado con barra',
    instructions = ARRAY[
        'Acuéstate en un banco plano con los pies en el suelo y la cabeza cerca del borde del banco.',
        'Sostén la barra con un agarre prono, manos al ancho de los hombros, y estira los brazos directamente sobre tu pecho.',
        'Manteniendo la parte superior de los brazos firme, baja lentamente la barra hacia tu frente flectando los codos.',
        'Haz una pausa por un momento, y luego extiende los brazos regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell lying extension' OR name = 'barbell lying extension';

-- barbell lying triceps extension skull crusher
UPDATE public.exercises
SET 
    name = 'Rompecráneos con barra',
    instructions = ARRAY[
        'Acuéstate en un banco plano con los pies apoyados en el suelo y la cabeza en el borde del banco.',
        'Sostén la barra con un agarre prono, manos al ancho de los hombros, y extiende los brazos directamente sobre tu pecho.',
        'Manteniendo inmóvil la parte superior de tus brazos, baja lentamente la barra hacia tu frente flectando los codos.',
        'Haz una pausa por un momento cuando la barra esté justo por encima de tu frente, y luego extiende los brazos para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell lying triceps extension skull crusher%';

-- barbell reverse close-grip bench press
UPDATE public.exercises
SET 
    name = 'Press de banca con agarre inverso estrecho y barra',
    instructions = ARRAY[
        'Acuéstate en un banco plano con los pies planos en el suelo y tu espalda presionada contra el banco.',
        'Toma la barra con un agarre supino (palmas hacia ti), con las manos separadas al ancho de los hombros.',
        'Saca la barra del soporte y sostenla directamente sobre tu pecho con los brazos completamente estirados.',
        'Baja lentamente la barra hacia tu pecho, manteniendo los codos pegados a tu cuerpo.',
        'Haz una pausa por un momento cuando la barra esté apenas por encima de tu pecho.',
        'Empuja la barra hacia arriba regresando a la posición inicial, extendiendo los brazos por completo.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell reverse close-grip bench press%';

-- barbell reverse grip skullcrusher
UPDATE public.exercises
SET 
    name = 'Rompecráneos con agarre supino / inverso con barra',
    instructions = ARRAY[
        'Acuéstate boca arriba en un banco plano con los pies planos en el suelo y la cabeza en el borde del banco.',
        'Sostén la barra con un agarre supino (palmas mirando hacia tu cara) y las manos separadas al ancho de los hombros.',
        'Estira tus brazos directamente sobre tu pecho, manteniendo los codos cerrados y las muñecas rectas.',
        'Baja lentamente la barra hacia tu frente flectando los codos, manteniendo inmóvil la parte superior de los brazos.',
        'Haz una pausa por un momento en la parte inferior, y luego extiende tus brazos de regreso a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell reverse grip skullcrusher%';

-- barbell seated close grip behind neck triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps tras nuca sentado con agarre estrecho y barra',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies planos en el suelo.',
        'Sostén la barra con un agarre estrecho detrás de tu cuello, con las palmas mirando hacia adelante.',
        'Mantén los codos cerca de tu cabeza y empuja la barra lentamente hacia arriba, para luego bajarla hacia la parte posterior de tu cabeza.',
        'Haz una pausa por un momento, y luego estira los brazos hacia arriba regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell seated close grip behind neck triceps extension%';

-- barbell seated overhead triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps por encima de la cabeza sentado con barra',
    instructions = ARRAY[
        'Siéntate en un banco con la espalda recta y los pies planos en el suelo.',
        'Toma una barra con un agarre prono, con las manos separadas al ancho de los hombros, y levántala por encima de tu cabeza.',
        'Baja la barra por detrás de tu cabeza flectando los codos, manteniendo la parte superior de los brazos cerca de tu cabeza.',
        'Haz una pausa por un momento, y luego extiende los brazos para levantar la barra de regreso a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell seated overhead triceps extension%';

-- barbell standing overhead triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps por encima de la cabeza de pie con barra',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una barra con un agarre prono.',
        'Levanta la barra por encima de tu cabeza, estirando los brazos por completo.',
        'Manteniendo la parte superior de los brazos cerca de tu cabeza, baja lentamente la barra por detrás de tu cabeza flectando los codos.',
        'Haz una pausa por un momento, y luego levanta la barra de vuelta a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell standing overhead triceps extension%';

-- bench dip (knees bent)
UPDATE public.exercises
SET 
    name = 'Fondos en banco con rodillas flectadas',
    instructions = ARRAY[
        'Siéntate en el borde de un banco o silla sujetando el borde con las manos, justo al lado de tus caderas.',
        'Desliza tus glúteos fuera del banco y estira tus piernas frente a ti (manteniendo una leve flexión de rodillas), con los talones apoyados en el suelo.',
        'Flecta tus codos y baja tu cuerpo hacia el suelo, manteniendo tu espalda muy cerca del banco.',
        'Haz una pausa por un momento abajo, y luego empújate hacia arriba a la posición inicial estirando los brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'bench dip (knees bent)%';

-- bench dip on floor
UPDATE public.exercises
SET 
    name = 'Fondos de tríceps en el suelo',
    instructions = ARRAY[
        'Siéntate en el suelo imitando la postura de estar en un banco, apoyando tus manos detrás de ti con los dedos apuntando hacia adelante.',
        'Levanta tus glúteos del suelo, soportando tu peso con tus manos y pies.',
        'Baja tu cuerpo flectando los codos hasta que la parte superior de tus brazos esté paralela al suelo.',
        'Empújate de vuelta a la posición inicial estirando tus brazos.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'bench dip on floor%';

-- body-up
UPDATE public.exercises
SET 
    name = 'Flexiones Body-Up para tríceps',
    instructions = ARRAY[
        'Comienza colocando tus manos (y antebrazos) sobre una superficie elevada, como un banco o barras paralelas, con las palmas mirando hacia abajo y los dedos apuntando hacia adelante.',
        'Estira tus piernas hacia atrás, manteniendo los talones en el suelo y el cuerpo recto como una tabla.',
        'Baja tu cuerpo flectando los codos y manteniéndolos pegados a los costados, hasta que tus antebrazos toquen la superficie.',
        'Haz una pausa por un momento, y luego empuja a través de tus palmas para estirar los brazos y levantar tu cuerpo de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'body-up' OR name = 'body-up';

-- cable alternate triceps extension
UPDATE public.exercises
SET 
    name = 'Extensión alterna de tríceps en polea / Patada trasera alternada',
    instructions = ARRAY[
        'Párate de frente a la máquina de poleas con los pies separados al ancho de los hombros.',
        'Sostén el agarre (sin accesorio o con un estribo pequeño) con tu mano derecha y levanta el brazo para que quede paralelo al suelo y tu codo flectado a 90 grados.',
        'Mantén la parte superior de tu brazo inmóvil y extiende tu antebrazo hacia atrás, estirando el brazo por completo.',
        'Haz una pausa por un momento, y luego regresa lentamente a la posición inicial.',
        'Repite con tu brazo izquierdo.',
        'Continúa alternando los brazos por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable alternate triceps extension%';

-- cable concentration extension (on knee)
UPDATE public.exercises
SET 
    name = 'Extensión de tríceps concentrada en polea apoyado en rodilla',
    instructions = ARRAY[
        'Siéntate en un banco o silla con las rodillas flectadas y los pies planos en el suelo.',
        'Sostén el agarre de la polea alta con tu mano derecha y apoya tu codo en la parte interna de tu rodilla derecha.',
        'Estira tu brazo por completo hacia abajo, manteniendo tu codo fijo y pegado a la rodilla.',
        'Haz una pausa por un momento abajo, y luego permite lentamente que tu brazo vuelva a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de lado.'
    ]
WHERE name ILIKE 'cable concentration extension (on knee)%';
