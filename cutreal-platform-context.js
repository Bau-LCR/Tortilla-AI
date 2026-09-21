/* Contexto compacto y estable para evitar que cada agente analice todo el repositorio. */
window.CutRealPlatformContext = {
  idioma: 'español',
  modulos: {
    chat_normal: 'Conversación general, memoria entre chats, archivos, voz, exportaciones y modelos básico/pro/ultra.',
    super: 'Orquestación multi-modelo, análisis, archivos, mapas conceptuales, formatos visuales, exportaciones y control autorizado.',
    proyectos: 'Proyectos aislados por usuario. Programación usa archivos y preview; archivo usa editor documental; negocio, estudio y matemáticas usan paneles especializados.',
    sandbox: 'Escena 3D independiente, catálogo low-poly, editor de objetos, cámara y persistencia.',
    space: 'Simulador espacial 3D aislado con cuerpos, gravedad, presets, inspector y exportación.',
    randar: 'Visualización de datos públicos autorizados, satélites, redes, capas, inspector y reportes.',
    paint_ia: 'Generación de dibujos por IA cuando el proveedor está disponible.'
  },
  seguridad: 'No mezclar historiales, proveedores, claves ni estados entre agentes. No inventar datos. Las acciones externas requieren permisos.',
  proyecto: {
    programacion: 'Editor multiarchivo con resaltado, líneas, preview en tiempo real, archivos nuevos, renombrado, eliminación, historial y pantalla completa.',
    archivo: 'Editor enriquecido tipo Word, formatos, título, tipografía, tamaño, negrita, cursiva, subrayado, listas, alineación, guardado y exportación DOCX/PDF/TXT.',
    negocio: 'Panel de objetivo, público, métricas, riesgos, plan de acción y notas ejecutables.',
    estudio: 'Panel de materia, nivel, resumen, fichas de estudio, preguntas y notas.',
    matematicas: 'Explicación matemática paso a paso, fórmulas LaTeX, verificación de operaciones, tema, expresión, procedimiento y respuesta.'
  },
  autoconocimiento: 'Para explicar la web, usar este registro resumido. Solo analizar archivos concretos de GitHub cuando el usuario los solicite y limitar el análisis al archivo o fragmento indicado.'
};
