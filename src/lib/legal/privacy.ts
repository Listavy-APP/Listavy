import type { LegalDocument } from "./types";

/**
 * Privacy policy content. The page in src/app/privacidad renders whatever is here.
 *
 * To publish the final text from legal counsel:
 *   1. Replace `sections` with the approved sections (a title and one or more paragraphs each).
 *   2. Set `updatedOn` to the approval date, as YYYY-MM-DD.
 *   3. Set `status` to "final". The draft notice then disappears.
 *   4. Change `version` only when the text changes in a material way. Users are then asked to accept again.
 * No other file needs to change.
 *
 * Source: Corotos policies, adapted to Listavy (draft approved by Fabian, 2026-11-15). Not reviewed by counsel.
 */

export const PRIVACY_POLICY: LegalDocument = {
  id: "privacy",
  status: "draft",
  version: "2026-11-15",
  updatedOn: null,
  sections: [
    {
      title: null,
      paragraphs: [
        "LISTAVY, cuya titular es la entidad Espiga Capital LLC, ofrece servicios de conexión entre dueños de casa y profesionales de servicios para el hogar a través de su sitio web y aplicación (en lo adelante \"la Plataforma\"), mediante las cuales los usuarios podrán solicitar y contratar servicios de plomería, electricidad, aire acondicionado, pintura, cerrajería, carpintería y herrería.",
        "Este documento abarca el ámbito de privacidad y el grado de confidencialidad que protege la información que el usuario facilita durante el proceso de registro y el uso de la Plataforma (listavy.com y la aplicación para dispositivos inteligentes) y de los servicios de LISTAVY. El usuario podrá, en cualquier momento y a su entera discreción, permitir o prohibir la recogida y uso de su información personal, según se describe abajo.",
        "Esta Política de Privacidad es aplicable a la Plataforma, propiedad de y gestionada por Espiga Capital LLC, sociedad debidamente constituida conforme a las normas del estado de Pensilvania, Estados Unidos de América (en lo adelante \"LISTAVY\"). Al usar la Plataforma, el usuario da su consentimiento para que LISTAVY pueda recoger, usar y distribuir la información personal del usuario de acuerdo con las normas y estipulaciones de esta Política. LISTAVY proclama y acepta su responsabilidad de proteger la información privada del usuario. Este documento contiene las normas bajo las que dicha información es recogida y utilizada, y las razones de la divulgación de dicha información. Estas normas se aplican a cualquier información personal recogida en/por LISTAVY.",
        "Durante el uso y registro en la Plataforma, podría recogerse automáticamente información técnica y no personal sobre el usuario, como el tipo de dispositivo, el idioma y la versión de la app. La información personal del usuario es recogida únicamente tras el consentimiento previo del usuario, permitiéndonos recoger y usar cierta información dentro de estas normas. Al dar dicho consentimiento, el usuario proporciona su información voluntariamente.",
      ],
    },
    {
      title: "Conceptos claves",
      paragraphs: [
        "**Controlador de datos personales:** ESPIGA CAPITAL LLC es la responsable de asegurar que el tratamiento se realice de acuerdo con la legislación aplicable sobre datos personales, Ley No. 172-13 de la República Dominicana y cualquier otra normativa aplicable.",
        "**Los Servicios** (cada uno individualmente un \"Servicio\") son los servicios de LISTAVY conectados a su cuenta.",
        "**Datos personales:** información que puede estar directa o indirectamente vinculada a una persona física. Ejemplos: nombre, dirección, número de teléfono.",
        "**Tratamiento de datos personales:** cubre todo uso de datos personales, tales como recopilación, intercambio y almacenamiento.",
      ],
    },
    {
      title: "Qué información recopilamos",
      paragraphs: [
        "Recopilamos datos personales relacionados con el registro de su cuenta y el uso posterior de dicha cuenta en los Servicios. Para darle una visión general de cómo se lleva a cabo el procesamiento de datos, hemos dividido los datos personales en dos categorías en función de cómo se recopilan.",
        "**Datos proporcionados por usted.** Al crear una cuenta, utilizar su cuenta y otro tipo de actividades en el marco de su cuenta, usted proporciona activamente información sobre usted. Esta información incluye, por ejemplo: nombre, número de teléfono, oficio (para profesionales), zona y ciudad, rango de precios (para profesionales), y la descripción, fotos y notas de voz de los trabajos que solicita. También almacenaremos el contenido de cualquier solicitud de trabajo, cotización, mensaje, reseña o respuesta que publique en la Plataforma durante 5 años.",
        "Los profesionales, al registrarse, proporcionan además: foto de su documento de identidad y de 1 a 3 fotos de trabajos realizados. Las empresas proporcionan además: razón social, RNC y documento de la empresa (Registro Mercantil o certificado de RNC). Esta información se guarda en almacenamiento privado y solo la revisan administradores; usted también puede ver su propio archivo.",
        "**Datos recopilados cuando usa los Servicios.** Cuando utiliza LISTAVY con su cuenta, recopilamos información sobre su uso. Esta información incluye los Servicios que utiliza y cómo se comporta en la Plataforma. La información se puede dividir en las siguientes categorías:",
        "**Información técnica sobre su dispositivo y la conexión a internet.** Utilizamos registros de servidor y otras herramientas para registrar información sobre su dispositivo y su conexión a nuestros servicios. Esta información puede incluir sistema operativo, versión de la app e idioma. No capturamos su dirección IP para analítica.",
        "**Información sobre el uso de su cuenta y de los Servicios; comportamiento del usuario.** Registramos información sobre cómo usa los Servicios: cuándo inicia o cierra sesión, las solicitudes de trabajo que crea, las cotizaciones, los pagos y las reseñas. La analítica de uso está desactivada por defecto; usted puede activarla o desactivarla en /ajustes. Cuando está activa, la analítica registra solo páginas vistas (sin números de trabajo), idioma, tipo de dispositivo y versión de la app. Procesador: PostHog (nube, plan gratuito). Sin nombres, teléfonos, direcciones, descripciones, fotos ni notas de voz. Sin datos de pago. Sin grabación de sesión. Sin captura de dirección IP.",
        "**Información de ubicación.** La ubicación está desactivada por defecto. Solo se guarda su elección (sí o no) y la hora en que la dio, si la permite en una pantalla aparte. No se guardan coordenadas y la app no tiene código de geolocalización. El profesional asignado ve su elección después de que el pago se confirme. Procesador: Supabase (base de datos de Listavy).",
        "**Cookies y otras tecnologías que almacenan datos localmente en su dispositivo.** Usamos cookies y almacenamiento local solo para mantener su sesión iniciada y para la analítica descrita arriba (cuando usted la activa). No usamos cookies publicitarias ni de terceros para publicidad. Usted puede configurar su navegador para no aceptar cookies, en cuyo caso deberá iniciar sesión cada vez que visite la Plataforma. Vea la Política de Cookies para el detalle.",
      ],
    },
    {
      title: "Datos que podremos recopilar en el futuro",
      paragraphs: [
        "LISTAVY crecerá y podrá recopilar otros tipos de datos en el futuro, incluyendo su dirección de correo electrónico, dirección postal, fecha de nacimiento y otra información necesaria para nuevas funciones, métodos de pago o el cumplimiento de la ley. Hoy no recogemos correo electrónico; lo recogeremos más adelante. Antes de empezar a recopilar un nuevo tipo de datos, actualizaremos esta Política y se lo notificaremos, y pediremos su consentimiento cuando la ley lo requiera. Esta Política se actualizará a medida que LISTAVY crezca.",
      ],
    },
    {
      title: "Por qué procesamos y compartimos su información",
      paragraphs: [
        "Procesamos y compartimos datos anónimos con la autoridad pública competente, siempre y cuando legalmente sea requerido para dar cumplimiento a las leyes siguientes: Ley No. 172-13 sobre Protección de Datos; Ley 126-02 sobre Comercio Electrónico; Ley 42-08 sobre Defensa de la Competencia; y Ley 358-05 sobre Protección de los Derechos del Consumidor y Usuario. De igual forma, procesamos sus datos personales para: (i) proporcionar y administrar su cuenta; (ii) atender asuntos de servicio al cliente y corregir errores; (iii) mejorar su experiencia de usuario en los Servicios; (iv) conectar dueños de casa con profesionales y gestionar solicitudes, cotizaciones, pagos, disputas y reseñas; (v) analizar las tendencias del mercado y las demandas futuras; y (vi) prevenir, limitar e investigar el abuso de la cuenta y de los servicios.",
        "**Para mejorar la experiencia del usuario.** Utilizamos datos personales para ofrecerle servicios más fáciles de usar. Esto se relaciona principalmente con su experiencia con el registro, inicio de sesión y contratación de servicios.",
        "**Para prevenir, limitar e investigar abuso.** Es importante que ofrezcamos un mercado seguro y confiable. Hacemos todo lo posible para prevenir e investigar el abuso dentro y alrededor de nuestros servicios. Lo hacemos en parte a través de la recolección y procesamiento de datos personales sobre las actividades de los usuarios, datos analíticos y técnicos. Por \"abuso\" se entiende, entre otras cosas, la presentación de perfiles falsos, el acoso, los intentos de iniciar sesión en la cuenta de otra persona y un comportamiento que viola los Términos de Uso o los términos y políticas de los Servicios.",
        "Los mensajes y las reseñas se revisan mediante un proceso automatizado de moderación de lenguaje. Si descubrimos comportamiento sospechoso o ilegal, nuestro equipo de seguridad seguirá esta información directamente.",
      ],
    },
    {
      title: "Intercambio de información",
      paragraphs: [
        "No compartiremos, venderemos, transferiremos ni divulgaremos datos personales que no sean los establecidos en esta Política de Privacidad, a menos que seamos obligados a hacerlo por decisiones judiciales o si hemos recibido su consentimiento para dicha divulgación.",
        "**Teléfono de contacto:** su número de teléfono solo se comparte con la otra parte de un trabajo cuando el trabajo está pagado y aceptado (en curso o completado), para que puedan coordinar. No se muestra en la búsqueda pública ni en los perfiles de profesionales. No compartimos su información de contacto con socios comerciales, concesionarios, bancos u otras empresas para ofrecerle productos o servicios.",
        "Si existe la sospecha de que usted ha cometido un delito en relación con el uso de su cuenta o de los Servicios, podemos divulgar información a las autoridades públicas a petición de las partes interesadas, todo según la Ley No. 172-13 sobre Protección de Datos Personales. La información personal de los usuarios será protegida con medidas de seguridad adecuadas y solo será compartida con empresas que cumplan con estándares similares de seguridad y privacidad.",
        "**Procesadores:** Stripe (pagos), el proveedor de SMS (códigos de verificación), Resend (correo electrónico), Vercel (alojamiento), PostHog (analítica de uso, solo si usted la activa) y Supabase (base de datos).",
      ],
    },
    {
      title: "Retención y eliminación de información",
      paragraphs: [
        "Conservaremos sus datos personales durante el tiempo que su cuenta esté activa o luego de desactivada, por un período de 5 años, según sea necesario para cumplir con los propósitos de procesamiento descritos en esta Política de Privacidad y la seguridad de nuestros usuarios. Cuando sus datos personales ya no sean relevantes para los fines para los cuales han sido recopilados, los eliminaremos o los convertiremos en anónimos, incluyendo los registros u otra información de copia de seguridad, con el fin de mantener la integridad de la información del uso de nuestra plataforma e histórico de nuestros reportes internos.",
      ],
    },
    {
      title: "Rectificar, bloquear o eliminar su información",
      paragraphs: [
        "Usted puede solicitar un extracto de registro que contenga información sobre los datos personales que estamos procesando sobre usted de acuerdo con la norma aplicable No. 172-13, Ley de datos personales de la República Dominicana. También tiene derecho a recibir esta información de forma gratuita de acuerdo con los requisitos legales aplicables. Puede descargar sus datos en /ajustes.",
        "Además, en cualquier momento, puede solicitar por correo a listavyapp@gmail.com que rectifiquemos, bloqueemos o eliminemos datos personales conforme con la norma aplicable No. 172-13, Ley de datos personales de la República Dominicana. Puede eliminar su cuenta en /cuenta.",
      ],
    },
    {
      title: "Cierre de su cuenta de Listavy",
      paragraphs: [
        "Si elige cancelar o cerrar su cuenta, se colocará en cuarentena durante 90 días. Aplicamos este período de cuarentena para evitar el acceso fraudulento y otros actos ilícitos cuando las cuentas son borradas de forma deliberada o errónea por personas distintas del titular de la cuenta. LISTAVY le notificará, vía el correo electrónico registrado, toda acción que lleve a cabo con relación a su cuenta.",
        "Después del período de cuarentena, eliminamos y convertimos en anónimos sus datos personales de nuestros sistemas. Sin embargo, hay dos excepciones.",
        "Por razones contables, estamos obligados por ley a mantener por un período de tiempo cierta información sobre las transacciones de pago.",
        "Por razones de seguridad, conservamos la información que usted nos ha proporcionado personalmente, así como el historial de inicio de sesión para que podamos investigar y prevenir el fraude o el abuso.",
        "Podemos bloquear el acceso a las cuentas si tenemos motivos para sospechar fraude o abuso de nuestros Términos de Uso. En el caso de que hayamos bloqueado una cuenta, procederemos con el almacenamiento de información de la cuenta durante un período de tiempo más largo para prevenir violaciones recurrentes o violaciones de los Términos de Uso.",
      ],
    },
    {
      title: "Seguridad",
      paragraphs: [
        "Mantenemos rutinas y medidas para garantizar que ninguna persona no autorizada tenga acceso a sus datos personales y que todo el procesamiento de datos personales se realice de acuerdo con la Ley No. 172-13 de Datos Personales. Estas medidas incluyen evaluaciones de riesgos, implementación de medidas organizacionales y físicas, así como rutinas para el manejo de datos y solicitudes de seguimiento en cuanto al acceso, rectificación, bloqueo y eliminación de datos personales.",
      ],
    },
    {
      title: "Cambios a esta Política",
      paragraphs: [
        "LISTAVY podrá actualizar esta Política de Privacidad a medida que el servicio crezca y se añadan nuevas funciones o nuevos tipos de datos. Cuando un cambio sea importante, se lo notificaremos en la Plataforma (y por correo electrónico cuando LISTAVY recoja correos) antes de que el cambio entre en vigor. El uso continuado de la Plataforma después de un cambio significa que usted acepta la Política actualizada.",
      ],
    },
    {
      title: "Controladores de datos personales",
      paragraphs: [
        "Espiga Capital LLC es la controladora de los datos procesados sobre sus usuarios.",
      ],
    },
    {
      title: "Cómo contactarnos",
      paragraphs: [
        "Si tiene preguntas o comentarios sobre esta Política de Privacidad, comuníquese con nosotros a listavyapp@gmail.com.",
        "El controlador de sus datos personales es Espiga Capital LLC, operadora de Listavy. Contacto: listavyapp@gmail.com.",
      ],
    },
  ],
};
