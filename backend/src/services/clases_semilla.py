"""Las 6 series con las que arranca recursos.atvos.io, tal como las armó Juan.

Se cargan una sola vez, cuando la tabla está vacía (`clases_services.sembrar`). A partir de
ahí todo se edita desde Ops: esto es el punto de partida, no la fuente de verdad.
"""

SERIES = [
    {
        "numero": 1,
        "titulo": "Cómo no depender de anuncios",
        "llamada": {
            "titulo": "De dónde vienen las ideas de contenido ganadoras",
            "minutos": 69,
            "descripcion": "La clase completa de la que salen los tres playbooks de la serie: de las métricas a la estrategia y recién después a la creación, el método de las semillas para no quedarte sin ideas y el embudo orgánico que califica sin perder alcance.",
            "url": "https://fathom.video/share/J8RMqAjB7TKFWEYz6FaHXRPmVwhypiPV",
            "portada": "s1-llamada.jpg"
        },
        "playbooks": [
            {
                "titulo": "Cómo hacer que tu contenido se cree solo",
                "descripcion": "De las métricas a la estrategia y recién después a la creación: la cuenta que te dice qué subir cada semana.",
                "url": "https://drive.google.com/file/d/1LL1bM6kPEBxuopaEeSpsvXTC4fghBTge/view",
                "portada": "s1-pb1.jpg"
            },
            {
                "titulo": "Cómo crear contenido sin quedarte sin ideas",
                "descripcion": "El método de las semillas: de dónde salen las ideas, cómo se juntan y cómo se convierten en un formato que repetís.",
                "url": "https://drive.google.com/file/d/1gK-OXIVGnewbbAjUf2RXyZcCOBmGgdsw/view",
                "portada": "s1-pb2.jpg"
            },
            {
                "titulo": "Cómo atraer leads calificados con orgánico sin perder alcance",
                "descripcion": "El embudo orgánico como equilibrio: qué le mostrás a muchos, qué a pocos y cómo entretener sin dejar de calificar.",
                "url": "https://drive.google.com/file/d/1WJn82sC7d2mDss2pv6R43irW-A4Da7sw/view",
                "portada": "s1-pb3.jpg"
            }
        ]
    },
    {
        "numero": 2,
        "titulo": "Cómo crear una marca personal de 0",
        "llamada": {
            "titulo": "Cómo crear una marca personal de 0",
            "minutos": 72,
            "descripcion": "Juan arma en vivo el plan de 90 días para lanzar una marca personal desde cero: por qué definir ICP, diferencial y oferta antes de grabar un solo video, cómo estructurar reels, historias y YouTube en cada fase, y cómo lanzar el primer producto para conseguir casos de éxito rápido.",
            "url": "https://fathom.video/share/Nuymso8ZcUDSQ6jYYj9ybFoWbEpjuxK9",
            "portada": "s2-llamada.jpg"
        },
        "playbooks": [
            {
                "titulo": "Cómo definir las bases de tu marca personal antes de grabar",
                "descripcion": "Los primeros diez días: a quién le hablás, qué te hace distinto, qué vendés y cómo se ve tu perfil.",
                "url": "https://drive.google.com/file/d/1n7-N4cE8oLzoH4G27oa708JDnYiGnJYD/view",
                "portada": "s2-pb1.jpg"
            },
            {
                "titulo": "Cómo armar tus primeros 30 días de contenido",
                "descripcion": "Del día 10 al 40: volumen con intención, cuatro reels por semana, un video de YouTube y las historias como laboratorio.",
                "url": "https://drive.google.com/file/d/1ZYEq_c5R5nBvDiiZGoTZmfgDq63ScJRT/view",
                "portada": "s2-pb2.jpg"
            },
            {
                "titulo": "Cómo pasar de views y guardados a DMs calificados que agendan",
                "descripcion": "Del día 40 al 90: duplicar lo que funcionó, pasar de valor a venta y medir DMs en vez de views.",
                "url": "https://drive.google.com/file/d/1OKUb7GsItBX3NUScJkJqzXac4-V7VtxD/view",
                "portada": "s2-pb3.jpg"
            }
        ]
    },
    {
        "numero": 3,
        "titulo": "Rendimiento en el contenido",
        "llamada": {
            "titulo": "Rendimiento de contenido",
            "minutos": 66,
            "descripcion": "Sesión de preguntas donde Juan destraba tres casos reales: historias que no convierten (marco punto A → punto B → vehículo), cómo sacar ideas de referentes para YouTube, reels y stories, y cómo diferenciarte cuando todos venden la misma oferta. El hilo: probar siempre algo distinto.",
            "url": "https://fathom.video/share/4Mofjg1qgbgTeJ8k6xzXvs5LFP82jNhT",
            "portada": "s3-llamada.jpg"
        },
        "playbooks": [
            {
                "titulo": "Cómo hacer historias que venden sin parecer marketing",
                "descripcion": "El marco A → B → vehículo: hablar de lo que la gente quiere y camuflar en el medio lo que vendés.",
                "url": "https://drive.google.com/file/d/1DEbl5-cMI359uAuObmo06_TsM9tfoXph/view",
                "portada": "s3-pb1.jpg"
            },
            {
                "titulo": "Cómo encontrar siempre el formato que funciona con un registro de pruebas",
                "descripcion": "Cambiar de proyector, apagar lámparas y construir el edificio: la mentalidad con la que se afronta el marketing.",
                "url": "https://drive.google.com/file/d/1sJtEhIr-pAa8lPivoMJ3Plc4SWcuPXul/view",
                "portada": "s3-pb2.jpg"
            },
            {
                "titulo": "De dónde sacar ideas y cómo organizar tu semana de contenido",
                "descripcion": "Las dos fuentes de ideas, la hoja de una página y los referentes que ya tienen los datos que a vos te faltan.",
                "url": "https://drive.google.com/file/d/111v43f0tdgZvD7Aj0DmaV4vvFdfw0YtZ/view",
                "portada": "s3-pb3.jpg"
            }
        ]
    },
    {
        "numero": 4,
        "titulo": "Entender las métricas para tener resultados",
        "llamada": {
            "titulo": "Cómo entender las métricas para tener resultados",
            "minutos": 65,
            "descripcion": "Un 1 a 1 donde Juan convierte las métricas de tres negocios de creadores en acción: ingeniería inversa de los clientes que pagaron, un único documento de conclusiones del que sale todo el contenido y objetivos mensuales simples para cada persona del equipo.",
            "url": "https://fathom.video/share/6dWpnFuJGtpXx4X4AKZkxje3ZgTygbSZ",
            "portada": "s4-llamada.jpg"
        },
        "playbooks": [
            {
                "titulo": "Cómo saber qué atrae y qué convierte a tu cliente ideal",
                "descripcion": "Ingeniería inversa de tus veinte mejores clientes: de qué historias vinieron, qué dolor los trajo y desde qué posicionamiento compraron.",
                "url": "https://drive.google.com/file/d/1trBmZAK2NrISrDPR-LAekspJkD5Ry4JX/view",
                "portada": "s4-pb1.jpg"
            },
            {
                "titulo": "Cómo arreglar una métrica baja con una sola acción por mes",
                "descripcion": "Las métricas solo te dicen dónde estás; el crecimiento sale de resolver un problema grande por mes y de objetivos simples.",
                "url": "https://drive.google.com/file/d/1gvey_MfRLnnAghGqedX0degNtFQyYWNj/view",
                "portada": "s4-pb2.jpg"
            },
            {
                "titulo": "Cómo convertir tu estrategia de marketing en tareas simples que se cumplen",
                "descripcion": "Sos el traductor: del qué al cómo, un formulario para el setter, un calendario para el creador, un solo documento para todo.",
                "url": "https://drive.google.com/file/d/1SVwFYDGv-i86cpolYphPMOMQI6AnGkzi/view",
                "portada": "s4-pb3.jpg"
            }
        ]
    },
    {
        "numero": 5,
        "titulo": "Cómo crear contenido",
        "llamada": {
            "titulo": "Cómo creo contenido",
            "minutos": 72,
            "descripcion": "Juan muestra cómo convertir las ideas que salen en flow state durante las llamadas en reels que compitan de verdad: por qué el contenido dirigido solo al nicho se estanca, cómo abrir el hook, cómo desarmar videos de referentes sin copiarlos y qué bases armar antes de alimentar el funnel.",
            "url": "https://fathom.video/share/jT84JVnbFb-wXsX8bPdYskEShM5bS8YJ",
            "portada": "s5-llamada.jpg"
        },
        "playbooks": [
            {
                "titulo": "Cómo convertir lo que explicás en llamadas en contenido grabado",
                "descripcion": "El flow state: capturar tus mejores respuestas, pensar el hook en vivo y grabar apenas cortás, con la misma voz que usás en la llamada.",
                "url": "https://drive.google.com/file/d/1M-GFDcBOm5HYkK8v15VgGUnTWiP0KaZS/view",
                "portada": "s5-pb1.jpg"
            },
            {
                "titulo": "Cómo hacer que un reel de nicho lo vea mucha gente",
                "descripcion": "Engañar al algoritmo: hook abierto, mostrar cosas, revelar tarde y camuflar el caso de éxito en valor.",
                "url": "https://drive.google.com/file/d/1JcRVcMl5mu6DyCHaA1HBuuzqp7cTamb0/view",
                "portada": "s5-pb2.jpg"
            },
            {
                "titulo": "Cómo explicar tu mecanismo en un video de YouTube y ponerle una promesa que venda",
                "descripcion": "El mecanismo explicado sin nombrarlo, los fijados, las destacadas y por qué las bases se renuevan cada tres a seis meses.",
                "url": "https://drive.google.com/file/d/1YHW8--g96wjmgXsg2Myz7d6XPvDHVnht/view",
                "portada": "s5-pb3.jpg"
            }
        ]
    },
    {
        "numero": 6,
        "titulo": "Estrategia de contenido: reels, historias y YouTube",
        "llamada": {
            "titulo": "1 a 1 con Álvaro y Olga: estrategia de contenido",
            "minutos": 44,
            "descripcion": "Por qué los videos de YouTube no traen clientes y cómo arreglarlo: los reels e historias que redirigen a YouTube tienen que funcionar como tráiler del video largo, no como anuncio. Cadencia sostenible, cómo saber qué videos venden y cómo desarmar la objeción de garantías.",
            "url": "https://fathom.video/share/kxzJx_ZysvbwAy3M8dxTYJ3rE-FcAonz",
            "portada": "s6-llamada.jpg"
        },
        "playbooks": [
            {
                "titulo": "Cómo hacer que tus reels lleven gente a YouTube",
                "descripcion": "El reel como tráiler, no como anuncio: un insight parcial y una pregunta que solo se cierra en el video largo.",
                "url": "https://drive.google.com/file/d/1YnS-_yexm6UJQrHKs5HyBP_BLA3XMkMz/view",
                "portada": "s6-pb1.jpg"
            },
            {
                "titulo": "Cómo tener muchas respuestas en tus CTAs",
                "descripcion": "La urgencia en el CTA, la pieza que falta del rompecabezas y las historias que educan antes de la llamada.",
                "url": "https://drive.google.com/file/d/1CFQ8j4ORqDrPktiGTsLO9TQbWzcjFgZg/view",
                "portada": "s6-pb2.jpg"
            },
            {
                "titulo": "Cómo adaptar lo que le funciona a otro a tu propia marca",
                "descripcion": "Entender la intención detrás de cada formato, la calidad como idea y no como edición, y tus sistemas como contenido.",
                "url": "https://drive.google.com/file/d/15Wz7pQH796PWeNjIvUB_MuhBhKkgpbtq/view",
                "portada": "s6-pb3.jpg"
            }
        ]
    }
]
