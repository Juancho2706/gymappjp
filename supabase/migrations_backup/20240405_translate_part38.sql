-- Actualización de ejercicios traducidos - Parte 38
-- Objetivo: Actualizar los nombres e instrucciones de Hombros

-- cable rear delt row (with rope)
UPDATE public.exercises
SET 
    name = 'Remo para deltoides posterior en polea con cuerda',
    instructions = ARRAY[
        'Engancha un agarre de cuerda a una máquina de polea baja.',
        'Párate de frente a la máquina con los pies separados al ancho de los hombros.',
        'Toma la cuerda con un agarre prono (con las palmas mirándose entre sí).',
        'Flecta levemente las rodillas e inclínate hacia adelante desde las caderas, manteniendo la espalda recta.',
        'Mantén los codos levemente flectados y tira de la cuerda hacia tu pecho, juntando y apretando las escápulas.',
        'Haz una pausa por un momento en la parte superior del movimiento, y luego suelta lentamente la tensión para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable rear delt row%(with rope)%';

-- cable shoulder press
UPDATE public.exercises
SET 
    name = 'Press de hombros en polea',
    instructions = ARRAY[
        'Ajusta la máquina de poleas para que los agarres queden a la altura de tus hombros.',
        'Párate dándole la espalda a la máquina con los pies separados al ancho de los hombros.',
        'Toma los agarres con un agarre prono (palmas hacia adelante) y llévalos a la altura de los hombros, con los codos flectados y apuntando hacia afuera.',
        'Empuja los agarres hacia arriba hasta que tus brazos estén completamente estirados por encima de tu cabeza.',
        'Haz una pausa por un momento en la parte alta, y luego baja lentamente los agarres de vuelta a la altura de los hombros.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable shoulder press%';

-- cable standing cross-over high reverse fly
UPDATE public.exercises
SET 
    name = 'Vuelos inversos altos cruzados de pie en polea',
    instructions = ARRAY[
        'Engancha un agarre individual (tipo D) a cada lado de la polea a la altura de los hombros.',
        'Párate en el centro de la máquina con los pies separados al ancho de los hombros.',
        'Toma los agarres con un agarre prono (cruzando los cables) y extiende tus brazos hacia los lados, con las palmas mirando hacia adelante.',
        'Mantén una leve flexión en tus codos y la espalda recta durante todo el ejercicio.',
        'Activa los músculos de tus hombros y junta tus escápulas mientras tiras de los agarres por delante de tu cuerpo.',
        'Haz una pausa por un momento en el punto de máxima contracción, y luego regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable standing cross-over high reverse fly%';

-- cable standing rear delt row (with rope)
UPDATE public.exercises
SET 
    name = 'Remo para deltoides posterior de pie en polea con cuerda',
    instructions = ARRAY[
        'Párate frente a una máquina de poleas con los pies separados al ancho de los hombros.',
        'Toma el agarre de cuerda con ambas manos, palmas mirándose entre sí, y da un paso hacia atrás para crear tensión en el cable.',
        'Mantén tu espalda recta y el core activado.',
        'Tira del cable hacia tu cuerpo, juntando y apretando las escápulas.',
        'Haz una pausa por un momento en el pico del movimiento, y luego suelta lentamente el cable de regreso a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable standing rear delt row%(with rope)%';

-- cable supine reverse fly
UPDATE public.exercises
SET 
    name = 'Vuelos inversos acostado en polea',
    instructions = ARRAY[
        'Engancha un agarre en D a una polea baja y acuéstate boca abajo en un banco plano.',
        'Toma el agarre en D con cada mano, con las palmas mirando hacia abajo, y estira los brazos directamente frente a ti.',
        'Manteniendo los brazos estirados, levántalos hacia los lados hasta que queden paralelos al piso.',
        'Haz una pausa por un momento en la parte más alta, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable supine reverse fly%';

-- cable upright row
UPDATE public.exercises
SET 
    name = 'Remo al mentón en polea',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, rodillas levemente flectadas, y sostén el agarre de la polea con un agarre prono (palmas hacia abajo).',
        'Mantén la espalda recta y el core contraído durante todo el ejercicio.',
        'Tira del accesorio de la polea directamente hacia arriba en dirección a tu mentón, guiando el movimiento con tus codos.',
        'Haz una pausa por un momento arriba, apretando tus escápulas.',
        'Baja lentamente el agarre de la polea de vuelta a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable upright row%';

-- dumbbell bench seated press
UPDATE public.exercises
SET 
    name = 'Press de hombros sentado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco con una mancuerna en cada mano, descansándolas sobre tus muslos.',
        'Inclínate hacia atrás y posiciona las mancuernas a los lados de tu pecho, con las palmas mirando hacia adelante.',
        'Empuja las mancuernas hacia arriba hasta que tus brazos estén completamente estirados.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell bench seated press%';

-- dumbbell front raise
UPDATE public.exercises
SET 
    name = 'Elevación frontal con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano con las palmas mirando hacia tus muslos.',
        'Manteniendo los brazos estirados, exhala y levanta las mancuernas frente a ti hasta que lleguen a la altura de los hombros.',
        'Haz una pausa por un momento en la parte superior, luego inhala y baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell front raise' OR name = 'dumbbell front raise';

-- dumbbell full can lateral raise
UPDATE public.exercises
SET 
    name = 'Elevación lateral con mancuernas - Full Can',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros, sosteniendo una mancuerna en cada mano con las palmas mirando hacia tu cuerpo.',
        'Mantén la espalda recta y activa tu core.',
        'Levanta los brazos hacia los lados, manteniendo una leve flexión en tus codos, hasta que queden paralelos al suelo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell full can lateral raise%';

-- dumbbell incline one arm lateral raise
UPDATE public.exercises
SET 
    name = 'Elevación lateral a un brazo inclinado con mancuerna',
    instructions = ARRAY[
        'Siéntate en un banco inclinado con una mancuerna en una mano, descansándola en tu muslo.',
        'Inclínate hacia adelante y apoya la parte superior de tu brazo contra la cara interna de tu muslo.',
        'Levanta la mancuerna hacia el costado, manteniendo el brazo levemente flectado y la palma mirando hacia abajo.',
        'Continúa levantando hasta que tu brazo esté paralelo al piso.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la mancuerna a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell incline one arm lateral raise%';

-- dumbbell incline raise
UPDATE public.exercises
SET 
    name = 'Elevación en banco inclinado con mancuernas',
    instructions = ARRAY[
        'Siéntate en un banco inclinado con una mancuerna en cada mano, descansándolas sobre tus muslos.',
        'Apóyate en el respaldo del banco y levanta las mancuernas a la altura de los hombros, con las palmas mirando hacia adelante.',
        'Manteniendo tu espalda pegada al banco, exhala y levanta las mancuernas por encima de tu cabeza, estirando los brazos por completo.',
        'Haz una pausa por un momento arriba, luego inhala y baja lentamente las mancuernas de vuelta a la altura de los hombros.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline raise%';

-- dumbbell incline t-raise
UPDATE public.exercises
SET 
    name = 'Elevación en T en banco inclinado con mancuernas',
    instructions = ARRAY[
        'Ajusta un banco a una inclinación de 45 grados y siéntate en él con una mancuerna en cada mano, palmas mirándose entre sí.',
        'Inclínate hacia adelante y deja que tus brazos cuelguen rectos hacia abajo, perpendiculares al piso.',
        'Manteniendo los brazos estirados, levántalos hacia los lados hasta que queden paralelos al suelo, formando una ''T'' con tu cuerpo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell incline t-raise%';

-- dumbbell lateral raise
UPDATE public.exercises
SET 
    name = 'Elevación lateral con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una mancuerna en cada mano, con las palmas mirando hacia tu cuerpo.',
        'Mantén tu espalda recta y contrae tu core.',
        'Levanta los brazos hacia los lados hasta que estén paralelos al suelo, manteniendo una leve flexión en los codos.',
        'Haz una pausa por un momento en la parte superior, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell lateral raise' OR name = 'dumbbell lateral raise';

-- dumbbell lying one arm deltoid rear
UPDATE public.exercises
SET 
    name = 'Vuelo posterior a un brazo acostado con mancuerna',
    instructions = ARRAY[
        'Acuéstate boca abajo en un banco plano con una mancuerna en una mano, palma mirando hacia adentro.',
        'Estira tu brazo directamente hacia el piso, manteniéndolo cerca de tu cuerpo.',
        'Levanta tu brazo hacia arriba y hacia atrás, apretando la escápula hacia tu columna vertebral.',
        'Haz una pausa por un momento arriba, y luego baja lentamente tu brazo a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell lying one arm deltoid rear%';

-- dumbbell one arm reverse fly (with support)
UPDATE public.exercises
SET 
    name = 'Vuelo inverso a un brazo con apoyo usando mancuerna',
    instructions = ARRAY[
        'Siéntate en un banco con los pies apoyados planos en el suelo y tu espalda recta.',
        'Sostén una mancuerna con una mano, con la palma mirando hacia adentro.',
        'Inclínate hacia adelante y apoya tu mano libre en el banco para darte estabilidad.',
        'Mantén el brazo levemente flectado y levántalo hacia el lado hasta que quede paralelo al suelo.',
        'Haz una pausa por un momento en la parte superior, y luego baja lentamente tu brazo a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell one arm reverse fly (with support)%';

-- dumbbell one arm shoulder press
UPDATE public.exercises
SET 
    name = 'Press de hombro a un brazo con mancuerna',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una mancuerna en una mano a la altura del hombro, con la palma mirando hacia adelante.',
        'Empuja la mancuerna hacia arriba hasta que tu brazo esté completamente estirado por encima de tu cabeza.',
        'Haz una pausa por un momento arriba, y luego baja lentamente la mancuerna a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees, y luego cambia de brazo.'
    ]
WHERE name ILIKE 'dumbbell one arm shoulder press%';

-- dumbbell raise
UPDATE public.exercises
SET 
    name = 'Elevación con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una mancuerna en cada mano, con las palmas mirando hacia tu cuerpo.',
        'Mantén la espalda recta y el core activado.',
        'Levanta los brazos hacia los lados hasta que queden paralelos al suelo, manteniendo una leve flexión en los codos.',
        'Haz una pausa por un momento en la parte alta, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell raise' OR name = 'dumbbell raise';

-- dumbbell rear delt row_shoulder
UPDATE public.exercises
SET 
    name = 'Vuelo posterior inclinado para hombros con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y las rodillas levemente flectadas.',
        'Sostén una mancuerna en cada mano, con las palmas mirando hacia tu cuerpo.',
        'Inclínate hacia adelante desde la cintura, manteniendo la espalda recta y el core activado.',
        'Estira los brazos hacia el piso, manteniendo una leve flexión en los codos.',
        'Levanta las mancuernas hacia los lados, juntando y apretando las escápulas.',
        'Haz una pausa por un momento arriba, y luego baja lentamente las mancuernas a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell rear delt row_shoulder%';

-- dumbbell rear fly
UPDATE public.exercises
SET 
    name = 'Vuelo inverso con mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y toma una mancuerna en cada mano.',
        'Flecta levemente las rodillas e inclínate hacia adelante desde las caderas, manteniendo la espalda recta.',
        'Estira los brazos hacia el suelo, con las palmas mirándose entre sí.',
        'Manteniendo una leve flexión en tus codos, levanta los brazos hacia los lados y aprieta tus escápulas.',
        'Haz una pausa por un momento en la parte más alta, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell rear fly' OR name = 'dumbbell rear fly';

-- dumbbell rear lateral raise
UPDATE public.exercises
SET 
    name = 'Elevación lateral posterior con mancuernas',
    instructions = ARRAY[
        'Párate con los pies al ancho de los hombros y sostén una mancuerna en cada mano, palmas mirando hacia tu cuerpo.',
        'Flecta levemente las rodillas e inclínate hacia adelante desde las caderas, con la espalda recta y el core contraído.',
        'Levanta los brazos hacia los lados, manteniendo una ligera flexión en los codos, hasta que queden paralelos al suelo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell rear lateral raise' OR name = 'dumbbell rear lateral raise';

-- dumbbell rear lateral raise (support head)
UPDATE public.exercises
SET 
    name = 'Elevación lateral posterior con mancuernas - con apoyo en la cabeza',
    instructions = ARRAY[
        'Párate con los pies al ancho de los hombros y sostén una mancuerna en cada mano.',
        'Flecta levemente las rodillas e inclínate hacia adelante desde las caderas, manteniendo tu espalda recta.',
        'Levanta los brazos hacia los lados, con una ligera flexión en tus codos, hasta que queden paralelos al piso.',
        'Haz una pausa por un momento arriba, y luego baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell rear lateral raise (support head)%';

-- dumbbell rotation reverse fly
UPDATE public.exercises
SET 
    name = 'Vuelo inverso con rotación usando mancuernas',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén una mancuerna en cada mano, palmas hacia adentro.',
        'Flecta levemente las rodillas e inclínate hacia adelante desde las caderas, manteniendo la espalda recta y el pecho levantado.',
        'Levanta los brazos hacia los lados, manteniendo una leve flexión de codos, hasta quedar paralelos al suelo.',
        'Rota tus brazos para que las palmas de tus manos queden mirando hacia abajo.',
        'Baja lentamente los brazos a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'dumbbell rotation reverse fly%';
