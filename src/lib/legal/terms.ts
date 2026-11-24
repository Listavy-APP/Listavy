import type { LegalDocument } from "./types";

/**
 * Terms of use. Rendered at /terminos by LegalDocumentView. Status stays "draft" until counsel approves.
 * Source: Corotos policies, adapted to Listavy (draft approved by Fabian, 2026-11-15). Not reviewed by counsel.
 * Paragraphs that start with **bold text** render that part bold. Other markdown is not supported.
 */
export const TERMS_OF_USE: LegalDocument = {
  id: "terms",
  status: "draft",
  version: "2026-11-15",
  updatedOn: null,
  sections: [
    {
      title: "Introducción",
      paragraphs: [
        "LISTAVY y la aplicación de Listavy (la \"Plataforma\") es operada por Espiga Capital LLC (en lo adelante \"LISTAVY\"). Estos términos de uso (\"Términos de Uso\") rigen el uso de la Plataforma y del servicio de inicio de sesión de LISTAVY.",
        "Le recomendamos que lea detenidamente estos Términos de Uso.",
        "LISTAVY revisará y modificará los Términos de Uso en cualquier momento, teniendo la obligación de notificar al usuario los cambios que se efectúen en los mismos. En ese sentido, LISTAVY, previo a cualquier acción por parte del usuario, le notificará sobre los cambios de los términos y condiciones. El aviso se efectuará presentando al usuario la obligatoriedad de aceptación de los términos y condiciones previo a suscribir o continuar cualquier gestión o contratación en la Plataforma, por lo que, como es habitual en el mercado, el usuario para poder concretizar la contratación que esté llevando a cabo deberá aceptar que muestra conformidad absoluta con los términos y condiciones de la Plataforma.",
      ],
    },
    {
      title: "Su Cuenta",
      paragraphs: [
        "**Sus datos de acceso.** Debe registrar una cuenta en el servicio de acceso (la \"Cuenta\") para acceder a la Plataforma y a los Servicios. Para crear una cuenta y usar Listavy, usted debe tener al menos 18 años y poder formar contratos legalmente vinculantes. El registro es por número de teléfono, con un código de verificación por SMS. Toda la información que usted proporcione en relación con su registro debe ser correcta y usted es personalmente responsable de mantenerla actualizada. Siempre puede cambiar su información registrada utilizando las páginas de su Cuenta.",
      ],
    },
    {
      title: "Violación de estos Términos de Uso",
      paragraphs: [
        "Si resulta que su uso de la Plataforma, su Cuenta o los Servicios ha violado estos Términos de Uso o los términos y condiciones especiales de un Servicio, o en caso de que LISTAVY tenga motivos razonables para creer que dicha violación ha tenido lugar, LISTAVY cerrará o bloqueará temporalmente su acceso al sistema de inicio de sesión, a la Plataforma o a un Servicio inmediatamente, previo aviso sobre lo acontecido.",
      ],
    },
    {
      title: "Accesibilidad",
      paragraphs: [
        "Su acceso a la Plataforma, al servicio de inicio de sesión o a cualquier otro Servicio puede cada cierto tiempo ser total o parcialmente inaccesible debido al mantenimiento del sistema. En un plazo máximo de cuarenta y ocho (48) horas, le proporcionaremos información sobre cualquier limitación en la accesibilidad.",
      ],
    },
    {
      title: "Derechos de Propiedad Intelectual",
      paragraphs: [
        "LISTAVY posee los derechos de propiedad intelectual del presente software o plataforma. De igual manera, LISTAVY es la única propietaria de la marca LISTAVY y otros sub-signos ligados a ésta. El usuario se presume titular de las marcas que publicite a través de nuestra Plataforma, por lo que LISTAVY se desvincula de cualquier reclamación de propiedad intelectual que no corresponda al software, marca o signos utilizados para distinguir a LISTAVY en su sentido más amplio.",
        "Usted es responsable de asegurar que cualquier material protegido (texto, imágenes, video, música, signos distintivos, invenciones u obras artísticas, científicas o literarias) que usted haga disponible a través de la Plataforma o el servicio de inicio de sesión no viole los derechos de propiedad intelectual de terceros y que no viole ningún estatuto o práctica generalmente aceptada.",
      ],
    },
    {
      title: "Prohibición de Extracción de Datos (Scraping)",
      paragraphs: [
        "Usted acepta y reconoce que la práctica de la extracción de datos no autorizada (conocida como \"scraping\" o \"rastreo web\") de nuestra Plataforma, las aplicaciones de Listavy y cualquier servicio ofrecido por LISTAVY está estrictamente prohibida y será considerada una violación grave de estos Términos de Uso.",
        "El scraping incluye, pero no se limita a, el uso de sistemas automatizados o software para extraer datos de nuestra Plataforma, incluyendo listados, descripciones y, de manera especial, el contenido gráfico (imágenes y videos).",
        "LISTAVY se reserva el derecho de tomar todas las medidas legales y técnicas necesarias para prevenir y detener el scraping no autorizado, incluyendo cerrar o bloquear temporal o permanentemente su acceso al sistema de inicio de sesión, a la Plataforma o a cualquier Servicio, previo aviso sobre lo acontecido, sin perjuicio de las acciones legales pertinentes por daños y perjuicios.",
      ],
    },
    {
      title: "Cambios en la oferta",
      paragraphs: [
        "LISTAVY puede, en cualquier momento y bajo la condición de previo aviso vía correo electrónico registrado o mediante anuncio en la Plataforma, decidir interrumpir o reemplazar la Plataforma, el servicio de inicio de sesión o los Servicios con una solución diferente. En tal caso, LISTAVY terminará su acceso a la Plataforma, al servicio de inicio de sesión o a los Servicios que se llevarán a cabo después de haber recibido información sobre dicha terminación. La información puede ser dada a través de notificación a su dirección de correo electrónico registrada.",
      ],
    },
    {
      title: "Ofertas de Terceros",
      paragraphs: [
        "Por el presente, usted aprueba que al participar en ofertas de terceros está aceptando su política de términos y condiciones. Asimismo, Listavy no asume ninguna responsabilidad ni garantiza la obtención de los productos y servicios, ya que cada empresa llevará a cabo su debido proceso de diligencia, siendo LISTAVY un mero intermediario de dicha oferta publicitada a través de nuestra Plataforma.",
        "La Plataforma puede contener enlaces a otros sitios de Internet y a recursos de terceros que son completamente independientes a esta Plataforma. Se hace esto para facilitarle la localización de información y complementar los servicios ofrecidos por LISTAVY.",
        "LISTAVY no se responsabiliza ni garantiza, en modo alguno, la exactitud, insuficiencia o autenticidad de la información suministrada por cualquier persona o entidad, física o jurídica, con o sin personalidad jurídica propia, a través de dichos enlaces de hipertexto.",
        "LISTAVY no garantiza que los enlaces a otros lugares sean exactos en el momento de su acceso. Estos enlaces se proporcionan solo para su conveniencia.",
        "Las eventuales referencias que se hagan en la Plataforma a cualquier producto, servicio, proceso, enlace, hipertexto o cualquier otra información que sean de titularidad de terceros, no constituyen ni implican respaldo, patrocinio o recomendación por parte de LISTAVY.",
        "Usted es el único responsable de comprender cualquier término y condición que pudieran aplicarse durante su visita en el sitio de un tercero.",
        "El establecimiento del hipervínculo no implica en ningún caso la existencia de relación comercial alguna entre LISTAVY y el titular de la página web en la que se establezca el mismo.",
      ],
    },
    {
      title: "Cómo funcionan los pagos",
      paragraphs: [
        "Usted paga al reservar. LISTAVY guarda el dinero hasta que apruebe el trabajo, y el profesional recibe su pago 24 horas después de su aprobación.",
        "La comisión de LISTAVY se calcula sobre el monto del trabajo: 15% para trabajos de menos de RD$5,000 (mínimo RD$400, sin mínimo para diagnósticos), 12% para trabajos de RD$5,000 a RD$25,000, y 10% para trabajos de más de RD$25,000, con un tope de RD$15,000 por trabajo. Los profesionales con plan Pro pagan 8%, sin mínimo. El diagnóstico cuesta de RD$500 a RD$1,000 y se acredita al costo de la reparación si el mismo profesional hace el trabajo.",
        "El pago se realiza con tarjeta a través de Stripe. LISTAVY no guarda los datos de su tarjeta.",
      ],
    },
    {
      title: "Disputas, reembolsos y rehacer el trabajo",
      paragraphs: [
        "Si hay un problema con un trabajo, usted puede abrir una disputa dentro de las 48 horas siguientes a la aprobación del trabajo. Ambas partes tendrán 48 horas para presentar evidencia (texto). El administrador de LISTAVY decidirá y su decisión es final en la Plataforma. Las opciones son: liberar el pago al profesional, reembolso parcial, reembolso total, o rehacer el trabajo. Mientras la disputa está abierta, el pago queda congelado y las reseñas de ese trabajo quedan ocultas hasta que se cierre. Cuando la disputa se cierra, no se puede reabrir.",
        "Si el trabajo debe rehacerse, el pago se mantiene retenido hasta que el rehacer se complete y se apruebe.",
      ],
    },
    {
      title: "Reseñas",
      paragraphs: [
        "Después de un trabajo completado, el dueño de casa puede dejar una reseña del profesional (hasta 500 caracteres) y el profesional puede responder (hasta 500 caracteres). Usted puede editar su reseña durante 24 horas después de publicarla; después queda fija. Las reseñas están ocultas mientras haya una disputa abierta sobre ese trabajo. Las reseñas y respuestas con lenguaje ofensivo se ocultan automáticamente para revisión. LISTAVY no se hace responsable del contenido de las reseñas publicadas por los usuarios, pero se reserva el derecho de moderarlas y retirarlas cuando violen estos Términos de Uso.",
      ],
    },
    {
      title: "Verificación de Profesionales",
      paragraphs: [
        "LISTAVY verifica la identidad de cada profesional antes de aprobarlo. Para ser aprobado como profesional independiente, usted proporciona una foto de su cédula de identidad, una selfie para confirmar que usted es el dueño del documento, un certificado de buena conducta vigente (emitido dentro de los últimos 30 días), que debe renovar cada año para mantener su insignia de verificado, y de 1 a 3 fotos de trabajos realizados. Puede aportar documentos de apoyo opcionales, como diplomas, certificaciones o licencias de su oficio; fortalecen su perfil, pero no son obligatorios. Las empresas proporcionan además el RNC activo de la empresa, el Registro Mercantil vigente, y la identificación del representante que abre la cuenta junto con el documento que lo autoriza a representar a la empresa. Un administrador revisa la solicitud dentro de 2 días laborables. LISTAVY nunca aprueba profesionales automáticamente: la insignia de verificado es la promesa central del servicio.",
        "Si la solicitud es rechazada, el profesional verá la razón en la app y podrá corregirla y reenviar la solicitud. No hay límite de reenvíos.",
        "La insignia de verificado indica que verificamos la identidad del dueño de la cuenta y sus documentos. No indica ni garantiza la calidad de los servicios del profesional o de la empresa que los ofrece. Se recomienda no compartir con terceros la información relacionada con la cuenta. El dueño de la cuenta tiene la responsabilidad de cuidar la información de acceso para evitar que un tercero la use.",
      ],
    },
    {
      title: "Plan Pro",
      paragraphs: [
        "LISTAVY ofrece el plan Pro para profesionales: RD$2,950 al mes. Con el plan Pro, la comisión es de 8% por trabajo, sin mínimo. El pago del plan Pro es anticipado y se renueva mensualmente. El usuario acepta que se realicen cobros recurrentes según el período elegido. El usuario se compromete a notificar a LISTAVY al correo soporte@listavy.com en caso de que no quiera que se genere el siguiente cobro, mínimo 5 días hábiles antes de su próxima fecha de cobro.",
        "Las compras realizadas son finales y no existe devolución del período ya pagado. Si el usuario no utiliza el servicio contratado, no tendrá el derecho de solicitar reembolso, desembolso o devolución de la totalidad o una fracción del monto pagado.",
      ],
    },
    {
      title: "Actualizaciones de plan (Upgrades)",
      paragraphs: [
        "Un profesional puede subir de plan en cualquier momento desde /cuenta. Al subir del plan gratis al plan Pro, el cambio entra en vigor de inmediato: la comisión Pro de 8% aplica a los trabajos desde la fecha del cambio, y el cobro mensual de RD$2,950 se genera en esa fecha y cada mes a partir de ahí. Si LISTAVY añade niveles superiores en el futuro, el profesional podrá subir a un nivel superior; el precio y la fecha de cobro se mostrarán antes de confirmar el cambio. Para bajar de plan o cancelar, aplica lo dicho arriba: notifique a LISTAVY mínimo 5 días hábiles antes de su próxima fecha de cobro.",
      ],
    },
    {
      title: "Profesional destacado (Boost)",
      paragraphs: [
        "\"Profesional destacado\" es un producto mediante el cual los profesionales pueden aumentar su visibilidad en la Plataforma. Precios: 7 días por RD$500, 30 días por RD$1,500. En ningún momento LISTAVY garantiza que el profesional recibirá trabajos por haber contratado este producto.",
        "Otros términos generales: las ventas son finales y no existe devolución. Aplica solo para profesionales aprobados y con perfil activo. El profesional no puede contratar un nuevo período mientras no haya expirado el período original. El perfil tendrá un distintivo, resaltando que tiene la promoción activa. El producto no se puede personalizar. No puede ser traspasado de cuenta. En caso de que el usuario no utilice el servicio contratado, no tendrá el derecho de solicitar reembolso, desembolso o devolución de la totalidad o una fracción del monto pagado. Si el profesional es suspendido mientras la promoción está activa, la promoción se pausa y se reanuda al desbloquearlo, moviendo la fecha de fin por el tiempo pausado.",
      ],
    },
    {
      title: "Cesión",
      paragraphs: [
        "Por el presente, usted aprueba que el acuerdo que haya suscrito con LISTAVY al aceptar estos Términos de Uso podrá ser cedido sin su consentimiento a otra compañía que sea total o parcialmente propiedad de LISTAVY, o a un tercero en conexión con una venta de activos o venta de negocios que incluya la Plataforma, el servicio de inicio de sesión o los Servicios. En dado caso, la cesión estaría sujeta a las condiciones y reglas establecidas en estos términos y condiciones.",
      ],
    },
    {
      title: "Confidencialidad",
      paragraphs: [
        "LISTAVY respeta la confidencialidad de la información personal y privada de todas las partes colaboradoras. Para más información sobre nuestro proceso de recogida, uso y distribución de la información personal del usuario, vea la \"Política de Privacidad\". Aconsejamos al usuario que se familiarice con este documento.",
      ],
    },
    {
      title: "Actualización de la Plataforma",
      paragraphs: [
        "LISTAVY actualiza regularmente el contenido técnico y la información de la Plataforma. Sin embargo, LISTAVY no garantiza la entereza, exactitud y conformidad de la información disponible en la Plataforma. LISTAVY podrá añadir, modificar o eliminar la información, recursos y servicios disponibles en la Plataforma. Además, LISTAVY podrá modificar la Plataforma sin aviso previo.",
      ],
    },
    {
      title: "Retiro de Publicaciones",
      paragraphs: [
        "En caso de que el usuario quisiese retirar su perfil o una solicitud de trabajo de la Plataforma, él mismo, accediendo a su cuenta, la podrá retirar al momento que considere necesario.",
        "El retiro de un perfil o una solicitud llevada a cabo por un usuario o a solicitud del mismo no corresponde ni implica la devolución, reembolso o retorno del monto total o fracción del monto pagado por los días restantes vigentes de una promoción o suscripción.",
        "LISTAVY se reserva el derecho de poder eliminar, bloquear y suspender los perfiles, solicitudes, anuncios, información, imágenes, videos, diseños y demás contenido de las cuentas que no cumplan con las reglas que regulan el uso de la Plataforma.",
      ],
    },
    {
      title: "Limitación de responsabilidad",
      paragraphs: [
        "El usuario confirma que entiende y se hace responsable y asume todos los riesgos resultantes del uso de la Plataforma.",
        "LISTAVY es una plataforma que conecta dueños de casa con profesionales independientes. LISTAVY no es el empleador de los profesionales, no realiza los trabajos y no garantiza la calidad, el plazo ni el resultado de ningún trabajo. La relación de servicio se establece entre el dueño de casa y el profesional.",
      ],
    },
    {
      title: "Ley aplicable y resolución de conflictos",
      paragraphs: [
        "Estos Términos de Uso y el uso de la Plataforma, el servicio de acceso y el servicio de inicio de sesión y los Servicios se rigen por las leyes del estado de Pensilvania, Estados Unidos de América. Cualquier controversia, reclamo o asunto relacionado con estos Términos de Uso o con el uso de la Plataforma será resuelto exclusivamente por los tribunales del estado de Pensilvania, Estados Unidos de América. Usted acepta someterse a la jurisdicción exclusiva de dichos tribunales. Sus derechos sobre sus datos personales bajo la Ley 172-13 de la República Dominicana (acceso, rectificación y eliminación) se ejercen a través de la Plataforma: descargue sus datos en /ajustes, elimine su cuenta en /cuenta, o solicítelo por correo a hola@listavy.com.",
      ],
    },
    {
      title: "Cómo contactarnos",
      paragraphs: [
        "Si tiene preguntas o comentarios sobre estos Términos de Uso, por favor póngase en contacto con nosotros en: Espiga Capital LLC, operadora de Listavy. Correo: hola@listavy.com.",
      ],
    },
  ],
};
