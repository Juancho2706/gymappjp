-- Actualización de ejercicios traducidos - Parte 37
-- Objetivo: Actualizar los nombres e instrucciones de Glúteos y Hombros

-- sled lying squat
UPDATE public.exercises
SET 
    name = 'Sentadilla acostado en máquina',
    instructions = ARRAY[
        'Ajusta la máquina a un peso que te resulte cómodo.',
        'Acuéstate boca arriba en la máquina con los pies apoyados en la plataforma.',
        'Separa los pies al ancho de los hombros con las puntas mirando levemente hacia afuera.',
        'Sujétate de los agarres de la máquina para mantener la estabilidad.',
        'Contrae tus glúteos y los músculos de tu core.',
        'Empuja a través de tus talones y extiende las piernas para levantar el peso.',
        'Baja el peso nuevamente flectando las rodillas y las caderas.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'sled lying squat%';

-- smith full squat
UPDATE public.exercises
SET 
    name = 'Sentadilla profunda en máquina Smith',
    instructions = ARRAY[
        'Ajusta la máquina Smith con la barra a la altura de tus hombros.',
        'Párate con los pies separados al ancho de los hombros y las puntas mirando levemente hacia afuera.',
        'Colócate debajo de la barra y apóyala en la parte superior de tu espalda, descansando sobre tus trapecios.',
        'Toma la barra con las manos un poco más separadas que el ancho de tus hombros.',
        'Saca la barra del soporte y da un paso hacia atrás, manteniendo una postura firme y estable.',
        'Manteniendo el pecho arriba y el core contraído, inicia la sentadilla empujando tus caderas hacia atrás y flectando las rodillas.',
        'Baja tu cuerpo hasta que tus muslos estén paralelos al suelo, o tan bajo como tu flexibilidad te lo permita.',
        'Haz una pausa por un momento abajo, y luego empuja a través de tus talones para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith full squat%';

-- smith hack squat
UPDATE public.exercises
SET 
    name = 'Sentadilla hack en máquina Smith',
    instructions = ARRAY[
        'Ajusta la barra en la máquina Smith a una altura adecuada para ti.',
        'Párate con los pies separados al ancho de los hombros, con las puntas mirando levemente hacia afuera.',
        'Colócate debajo de la barra, apoyándola sobre la parte superior de tus trapecios y hombros.',
        'Toma la barra con un agarre prono (palmas hacia adelante), con las manos un poco más separadas que el ancho de los hombros.',
        'Contrae tu core y mantén el pecho arriba al sacar la barra del soporte.',
        'Da un paso hacia adelante y posiciona tus pies un poco más abiertos que el ancho de tus hombros (para quedar en ángulo de sentadilla hack).',
        'Flecta las rodillas y baja tu cuerpo, manteniendo el pecho arriba y la espalda recta.',
        'Sigue bajando hasta que tus muslos queden paralelos al suelo o un poco más abajo.',
        'Haz una pausa por un momento en la parte inferior, y luego empuja desde tus talones para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith hack squat%';

-- smith leg press
UPDATE public.exercises
SET 
    name = 'Prensa de piernas en máquina Smith',
    instructions = ARRAY[
        'Ajusta el asiento y la plataforma para los pies debajo de la máquina Smith a una posición cómoda.',
        'Siéntate en la máquina con la espalda apoyada en el respaldo y ubica tus pies, separados al ancho de los hombros, empujando la barra.',
        'Sujétate de los agarres o de los lados de la máquina para estabilizarte.',
        'Empuja la barra alejándola de ti extendiendo las piernas, manteniendo siempre la espalda pegada al respaldo.',
        'Haz una pausa por un momento en la posición de extensión completa.',
        'Flecta lentamente las rodillas y baja la barra de regreso hacia ti, volviendo a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith leg press%';

-- smith low bar squat
UPDATE public.exercises
SET 
    name = 'Sentadilla con barra baja en máquina Smith',
    instructions = ARRAY[
        'Ajusta la máquina Smith a una altura que te permita apoyar la barra cómodamente más abajo en tu espalda.',
        'Párate con los pies separados al ancho de los hombros, con las puntas mirando levemente hacia afuera.',
        'Colócate debajo de la barra y apóyala a lo ancho de la parte posterior de tus hombros y omóplatos.',
        'Toma la barra con las manos un poco más separadas que el ancho de los hombros.',
        'Saca la barra estirando las piernas y asume tu posición de inicio.',
        'Toma una respiración profunda y aprieta tu core.',
        'Inicia la sentadilla empujando las caderas hacia atrás y flectando las rodillas.',
        'Baja tu cuerpo hasta que tus muslos estén paralelos al suelo o un poco más abajo.',
        'Mantén el pecho arriba y la espalda recta durante todo el movimiento.',
        'Empuja a través de los talones para volver a ponerte de pie, extendiendo las caderas y rodillas.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith low bar squat%';

-- smith sprint lunge
UPDATE public.exercises
SET 
    name = 'Estocada tipo sprint en máquina Smith',
    instructions = ARRAY[
        'Ajusta la máquina Smith con la barra a la altura de tu cadera.',
        'Párate de espaldas a la máquina con los pies separados al ancho de los hombros.',
        'Da un paso hacia atrás con el pie derecho y apóyalo en la barra, descansando el empeine (la parte superior del pie) sobre ella.',
        'Flecta la rodilla izquierda y baja tu cuerpo a una posición de estocada, manteniendo la espalda recta.',
        'Empuja a través de tu talón izquierdo para volver a la posición inicial.',
        'Repite hacia el otro lado, dando el paso atrás con tu pie izquierdo.',
        'Continúa alternando los lados por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith sprint lunge%';

-- smith squat
UPDATE public.exercises
SET 
    name = 'Sentadilla en máquina Smith',
    instructions = ARRAY[
        'Ajusta la máquina Smith con la barra a una altura adecuada para tu sentadilla.',
        'Párate con los pies separados al ancho de los hombros, con las puntas apuntando levemente hacia afuera.',
        'Colócate debajo de la barra, apoyándola sobre la parte superior de tus trapecios y hombros.',
        'Toma la barra con un agarre amplio, un poco más separado que el ancho de los hombros.',
        'Contrae tu core, saca la barra del soporte y posiciónate adecuadamente.',
        'Manteniendo el pecho arriba y la espalda recta, inicia la sentadilla flectando las caderas y rodillas.',
        'Baja tu cuerpo hasta que tus muslos queden paralelos al suelo o un poco más abajo.',
        'Haz una pausa por un momento en la parte inferior, y luego empuja desde tus talones para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith squat' OR name = 'smith squat';

-- smith sumo squat
UPDATE public.exercises
SET 
    name = 'Sentadilla sumo en máquina Smith',
    instructions = ARRAY[
        'Ajusta la máquina Smith con la barra a una altura adecuada.',
        'Párate con los pies más separados que el ancho de los hombros, con las puntas apuntando marcadamente hacia afuera.',
        'Colócate debajo de la barra, apoyándola sobre la parte superior de tu espalda y hombros.',
        'Contrae tu core y mantén el pecho arriba mientras bajas tu cuerpo a una posición de sentadilla, empujando las caderas hacia atrás y flectando las rodillas.',
        'Baja hasta que tus muslos estén paralelos al suelo, o tan bajo como te resulte cómodo.',
        'Haz una pausa por un momento abajo, y luego empuja a través de los talones para volver a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'smith sumo squat%';

-- swimmer kicks v. 2 (male)
UPDATE public.exercises
SET 
    name = 'Patada de nadador versión 2 - hombre',
    instructions = ARRAY[
        'Acuéstate boca abajo sobre una colchoneta con los brazos extendidos por encima de tu cabeza.',
        'Contrae tu core y levanta tu pecho y tus piernas del suelo de manera simultánea.',
        'Patea con las piernas hacia arriba y hacia abajo alternadamente con un movimiento rápido, como si estuvieras nadando.',
        'Sigue pateando por la cantidad de repeticiones que desees.',
        'Baja el pecho y las piernas para volver a la posición inicial.'
    ]
WHERE name ILIKE 'swimmer kicks v. 2 (male)%';

-- weighted cossack squats (male)
UPDATE public.exercises
SET 
    name = 'Sentadilla cosaca con peso - hombre',
    instructions = ARRAY[
        'Párate con los pies bien separados (más anchos que los hombros) y las puntas apuntando levemente hacia afuera.',
        'Sostén una mancuerna o pesa frente a tu pecho con ambas manos.',
        'Desplaza el peso de tu cuerpo hacia un lado y baja flectando la rodilla de ese lado, mientras mantienes la pierna contraria completamente estirada.',
        'Baja lo más que puedas mientras mantienes el equilibrio y el pecho bien arriba.',
        'Empuja con fuerza a través del talón de la pierna flectada para regresar a la posición inicial.',
        'Repite hacia el otro lado, alternando ambas piernas.'
    ]
WHERE name ILIKE 'weighted cossack squats (male)%';

-- weighted stretch lunge
UPDATE public.exercises
SET 
    name = 'Estocada profunda con peso',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de tus hombros sosteniendo tus pesas.',
        'Da un paso amplio hacia adelante con tu pie derecho, manteniendo la espalda recta.',
        'Baja tu cuerpo flectando las rodillas hasta que tu muslo derecho quede paralelo al suelo y sientas el estiramiento.',
        'Empuja a través de tu talón derecho para impulsarte y volver a la posición inicial.',
        'Repite el mismo movimiento con tu pierna izquierda.',
        'Continúa alternando las piernas por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'weighted stretch lunge%';

-- barbell standing wide military press
UPDATE public.exercises
SET 
    name = 'Press militar de pie con barra y agarre ancho',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y sostén la barra con un agarre prono (palmas hacia adelante), bastante más abierto que el ancho de tus hombros.',
        'Levanta la barra a la altura de tus hombros, manteniendo los codos levemente por delante de la barra.',
        'Empuja la barra directamente por encima de tu cabeza, extendiendo los brazos por completo.',
        'Baja la barra de regreso a la altura de los hombros controladamente y repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'barbell standing wide military press%';

-- cable cross-over revers fly
UPDATE public.exercises
SET 
    name = 'Vuelos inversos cruzados en polea',
    instructions = ARRAY[
        'Engancha un agarre en forma de D a cada polea baja y párate exactamente en el medio de la máquina de cables.',
        'Toma los agarres con un agarre prono (palmas mirando hacia abajo) cruzando los cables y da un paso al frente para quedar con los pies al ancho de los hombros.',
        'Flecta levemente las rodillas e inclínate un poco hacia adelante desde la cintura, manteniendo la espalda recta y tu core activado.',
        'Con los brazos apuntando hacia abajo y levemente flectados, exhala y junta tus escápulas mientras tiras de los cables hacia atrás y hacia arriba (movimiento de vuelo inverso).',
        'Haz una pausa de un segundo en el punto de máxima contracción, luego inhala y regresa lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable cross-over revers fly%';

-- cable front raise
UPDATE public.exercises
SET 
    name = 'Elevación frontal en polea',
    instructions = ARRAY[
        'Párate con los pies al ancho de los hombros, dándole la espalda a la máquina, y toma el agarre de la polea por debajo o entre tus piernas con un agarre prono (palmas hacia abajo).',
        'Mantén tu espalda recta y el core activado.',
        'Levanta el cable frente a ti, manteniendo los brazos casi estirados y las palmas siempre mirando hacia el piso.',
        'Sigue subiendo hasta que tus brazos queden paralelos al suelo.',
        'Haz una pausa por un momento arriba, y luego baja lentamente el agarre regresando a la posición inicial.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable front raise' OR name = 'cable front raise';

-- cable front shoulder raise
UPDATE public.exercises
SET 
    name = 'Elevación frontal de hombros en polea',
    instructions = ARRAY[
        'Párate con los pies separados al ancho de los hombros y toma el agarre de la polea baja con un agarre prono.',
        'Mantén la espalda recta y tu core firme.',
        'Levanta el agarre frente a tu cuerpo, con los brazos rectos y las palmas mirando hacia abajo.',
        'Sigue levantando hasta que tus brazos estén en línea paralela con el piso.',
        'Pausa por un segundo arriba, para luego bajar lentamente controlando el peso hasta la posición de inicio.',
        'Repite por la cantidad de repeticiones que desees.'
    ]
WHERE name ILIKE 'cable front shoulder raise%';

-- cable one arm lateral raise
UPDATE public.exercises
SET 
    name = 'Elevación lateral a un brazo en polea',
    instructions = ARRAY[
        'Párate de lado junto a la máquina de polea baja, con los pies separados al ancho de los hombros.',
        'Toma el agarre con la mano que está más alejada de la máquina, con la palma mirando hacia tu cuerpo, asegurándote de dar un paso al costado para que el cable ya tenga tensión.',
        'Mantén el brazo casi completamente estirado y levántalo lateralmente hasta que quede paralelo al suelo.',
        'Haz una pausa por un momento arriba, y luego baja el brazo lentamente a la posición inicial.',
        'Repite por la cantidad de repeticiones deseadas y luego cambia de brazo.'
    ]
WHERE name ILIKE 'cable one arm lateral raise%';

-- cable rear delt row (stirrups)
UPDATE public.exercises
SET 
    name = 'Remo para deltoides posterior en polea - agarre estribo',
    instructions = ARRAY[
        'Engancha un agarre individual (tipo estribo) en la polea baja y párate frente a la máquina.',
        'Toma el agarre con tu mano izquierda y da un paso hacia atrás con el pie derecho, girando tu cuerpo levemente.',
        'Flecta un poco tus rodillas e inclínate hacia adelante desde las caderas, manteniendo la espalda recta y el core apretado.',
        'Con el brazo estirado y la palma hacia abajo, tira del agarre hacia tu pecho juntando fuertemente tu omóplato.',
        'Haz una pausa en la parte alta del tirón, contrayendo el hombro posterior.',
        'Libera lentamente el agarre para volver al inicio y repite las veces que necesites.',
        'Cambia de lado y haz el mismo ejercicio con tu brazo derecho.'
    ]
WHERE name ILIKE 'cable rear delt row (stirrups)%';
