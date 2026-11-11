# Listavy

Marketplace de servicios del hogar para Santo Domingo. Un profesional verificado, cotización por foto, pago por la plataforma, fotos antes y después.

Estado: **Sprint 1 (Perfiles y búsqueda)** en desarrollo. Sprint 0 abierto en WhatsApp y prueba en dispositivo. Ver `Sprint status` abajo.

---

## Stack

| Capa | Herramienta | Nota |
|---|---|---|
| Frontend | Next.js (App Router) + React + TypeScript | PWA desde un solo código. Sin app nativa en v1. |
| Backend y DB | Supabase: Postgres, Auth, Storage, Edge Functions | RLS activo en todas las tablas. |
| Hosting | Vercel | Ver nota de plan comercial en Costos. |
| Mensajes | WhatsApp Cloud API | Solo avisos de trabajo en v1. Sin chat en la app. |
| Pagos | Stripe (US), USD. Pagos a pros en DOP vía Connect | Sprint 3. Interfaz `PaymentProvider` para Azul en Fase 2. |

---

## Requisitos

- Node.js 20 o superior
- npm
- Un proyecto de Supabase (Sprint 0 solo necesita URL y clave anónima)

## Configuración local

```bash
npm install
cp .env.example .env.local     # llena las dos variables
npm run dev                    # http://localhost:3000
```

### Variables de entorno

| Variable | Dónde se usa | Secreta |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor | No, pero solo es seguro porque RLS está activo |

Regla: ningún secreto de servidor usa prefijo `NEXT_PUBLIC_`. La clave `service_role` nunca entra al frontend. Se añadirá en Sprint 3 solo en Edge Functions.

### Base de datos

La migración vive en `supabase/migrations/0001_init.sql`.

Aplicar en un proyecto de Supabase (elige una vía):

- Panel SQL de Supabase: pega el contenido del archivo y ejecuta.
- CLI: `supabase link --project-ref <id>` y luego `supabase db push`.

Crear el primer administrador (una sola vez, desde el SQL editor):

```sql
update public.profiles set role = 'admin' where phone = '+1XXXXXXXXXX';
```

El trigger de auth crea el perfil al primer inicio de sesión. Ejecuta esta línea después de que el usuario haya entrado una vez.

### Autenticación por WhatsApp

Supabase necesita un proveedor de OTP con soporte para WhatsApp. Ese proveedor es una dependencia de pago y requiere aprobación previa. Pasos:

1. Verificar el negocio en WhatsApp Business (tarea de Fabian).
2. Configurar el proveedor en Supabase: Authentication > Providers > Phone.
3. Probar con un número de prueba.

Sin proveedor configurado, el envío del código falla y la app muestra un mensaje en español.

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build |
| `npm run typecheck` | Chequeo de tipos sin emitir archivos |
| `npm run test:rls` | Prueba RLS, guardas, función de búsqueda y políticas de Storage (PGlite, datos TEST). 23 pruebas. |

---

## Estructura

```
src/
  app/                 Rutas (App Router). Páginas y acciones de servidor.
  components/          Componentes compartidos.
  lib/
    data/              Capa de acceso a datos. Única puerta a las tablas.
    supabase/          Clientes de Supabase (navegador y servidor).
    i18n/es.ts         Todo el texto visible. Español dominicano, sin texto fijo en componentes.
    types/database.ts  Tipos de filas. Reemplazar por tipos generados al enlazar el proyecto.
    env.ts             Lectura de variables de entorno con error claro.
  proxy.ts             Renueva la sesión y protege /cuenta (verificación optimista; RLS es el control real).
public/
  sw.js                Service worker mínimo. Solo para instalar la PWA. No cachea datos todavía.
  icon.svg             Ícono provisional con la letra L. Reemplazar con la marca aprobada.
supabase/
  migrations/          SQL versionado. 0001: esquema y RLS. 0002: permisos de funciones.
  tests/rls.test.mjs   Pruebas de seguridad de la base de datos.
```

### Reglas de diseño

- **Acceso a datos:** toda lectura o escritura va por `src/lib/data/`. Ningún componente hace consultas directas.
- **Pagos:** toda la lógica de cobro vive detrás de `PaymentProvider` (Sprint 3). Cada pago guarda `provider` y `currency`.
- **Archivos:** las fotos irán detrás de una interfaz de almacenamiento (Sprint 2).
- **Sin SQL de Supabase exclusivo:** solo Postgres estándar y `auth.users`.
- **Mobile-first:** estilos en `src/app/globals.css`. Sin fuentes externas (carga rápida con señal débil). Botones de al menos 52 px.
- **Privilegios sensibles:** rol, verificación, plan y pagos no se cambian desde el cliente. Lo impide RLS y los triggers de `0001_init.sql`.

---

## Aprobar un profesional (Sprint 1)

Hasta Sprint 4 no hay panel de administración. Para aprobar una solicitud, usa el SQL editor de Supabase. Ese contexto no tiene sesión de usuario, así que las guardas dejan pasar el cambio.

```sql
-- 1. Revisa la solicitud: cédula y fotos están en Storage (buckets privados).
select p.id, pr.full_name, p.trade, p.zone, p.verification_status
from public.pros p join public.profiles pr on pr.id = p.id
where p.verification_status = 'pending';

-- 2. Aprueba (reemplaza <pro_id>). Sin esto no hay insignia verificada.
update public.pros
   set verification_status = 'approved', verified_at = now()
 where id = '<pro_id>';
update public.profiles set role = 'pro' where id = '<pro_id>';
```

El mismo cambio desde la app pasa por `admin_review_pro(uuid, text)`, que solo ejecuta un administrador con sesión. Sprint 4 lo expone en el panel.

Zonas: la lista en `src/lib/domain/catalog.ts` y en la migración 0003 es PROVISIONAL. Confírmala con el verificador antes del lanzamiento.

### Checklist: empresas (RNC)

Aplica solo a profesionales con `pro_type = 'company'`. Los profesionales físicos no envían RNC.

1. Abre el certificado de RNC o Registro Mercantil en `pro-documents` (tipo `company_document`).
2. Busca el RNC (9 dígitos) en la consulta pública de RNC de la DGII.
3. Confirma que la razón social coincide con el nombre de la empresa en la solicitud.
4. Confirma que el estado no es "Suspendido".
5. Ejecuta `select public.admin_verify_rnc('<pro_id>');`.
6. Aprueba con `admin_review_pro`. La función rechaza la aprobación si el RNC no está verificado.

El RNC nunca aparece en búsqueda ni en el perfil público. La consulta DGII es manual: el sistema no la hace.

### Checklist: foto de perfil

1. Revisa la foto en `pro_files` (tipo `avatar`, estado `pending`). Solo un administrador puede cambiar el estado.
2. Aprueba o rechaza con `select public.admin_review_avatar('<file_id>', 'approved' | 'rejected');`.
3. Si la rechazas, borra también el objeto del bucket público `pro-avatars` (Storage en el dashboard de Supabase o la API de Storage). No dejes la foto rechazada en el bucket.
4. Una foto pendiente bloquea la aprobación del profesional. Una foto rechazada no la bloquea.

### Checklist: cuentas de usuario (eliminación)

1. Nunca borres un usuario de `auth.users` desde el dashboard de Supabase. Elimínalo solo con la función `delete-account`, que borra las fotos y el usuario en el orden correcto.
2. Un borrado directo deja datos personales en el perfil anonimizado. El perfil se conserva como registro.
3. Para cerrar un perfil profesional de un cliente con cuenta dual, hazlo manualmente antes de que el cliente elimine su cuenta.

### Checklist: antes de lanzar (pendiente)

1. Eliminar `public.test_mark_job_paid` (migración 0011) antes de la Sprint 5. Sustituirla por el webhook de Stripe (Sprint 3).
2. Aviso de anti-ghosting a 3 solicitudes sin contratar. Requiere canal de notificaciones.
3. Programar `public.expire_quotes()` (Edge Function o pg_cron, solo service role).
4. Cobro y devolución de la diferencia de cambios de precio (`jobs.pending_difference_dop`). Sprint 3.
5. Crédito del diagnóstico contra la reparación. Sprint 3.
6. Borrado de archivos en `delete-account`: si falla el borrado en Storage, registrar el fallo y crear una tabla de pendientes (`storage_cleanup`) con reintento. Un fallo no puede dejar una foto huérfana en el bucket sin rastro.
7. D11 (abogado, antes de Sprint 5): decidir la retención de fotos de antes y después del profesional que muestran el hogar del cliente. Propuesta actual: se borran las fotos de la solicitud del cliente; se conservan las fotos del profesional como evidencia de disputas y contracargos (planes 1.4 y 2.3). Confirmar esta división.

---

## Seguridad de la base de datos

- RLS activo en las siete tablas.
- `pros.verification_status`, `pros.plan` y `profiles.role` solo cambian con sesión de administrador. Lo impone un trigger, no solo la UI.
- Las tablas `payments` y `disputes` no aceptan escrituras de clientes para pagos. Los pagos se escriben desde Edge Functions con `service_role` (Sprint 3).
- Las funciones auxiliares `SECURITY DEFINER` evitan recursión entre políticas de `jobs` y `quotes`.

- Sprint 1: documentos de identidad en bucket privado `pro-documents`, visibles solo al dueño y a administradores. Fotos de trabajo en `pro-work-photos`, visibles a usuarios con sesión solo si el profesional está aprobado.
- Sprint 1: la búsqueda y el perfil público son anónimos (migración 0006). Fotos de trabajo y solicitudes requieren sesión.
- Sprint 1: el teléfono nunca aparece en búsqueda. La búsqueda pasa por `list_pro_cards()`, que devuelve solo columnas seguras de profesionales aprobados.
- Avisos del advisor de Supabase: 0 errores. Quedan avisos WARN de funciones `SECURITY DEFINER` que los usuarios con sesión deben poder llamar. Cada una valida el rol dentro de la función.

Pendiente para Sprint 4: `reviews` solo para trabajos completados y pagados por la plataforma.

---

## Ruta de migración

Hoy: Supabase (plan gratuito).

Orden de crecimiento. Cada paso no requiere reescribir la app:

1. Supabase Pro.
2. Postgres dedicado (Neon, RDS o Supabase dedicado).
3. Vercel Pro o un host más grande.

Disparadores sugeridos:

| Paso | Disparador |
|---|---|
| Supabase Pro | Pago en vivo, o pausa del proyecto gratuito, o pico de DB o almacenamiento que lo justifique. |
| Postgres dedicado | Más de 10.000 trabajos al mes, o más de 100 GB de almacenamiento. |
| Host más grande | Más de 500 usuarios concurrentes sostenidos, o límites del plan actual. |

Antes de cualquier migración, la capa `src/lib/data/` y los clientes de `src/lib/supabase/` son los únicos puntos a cambiar.

---

## Costos (piloto)

Objetivo: US$50 a US$120 al mes en cuotas de plataforma, más comisiones de pago.

Los precios son de referencia. Verifica la tarifa vigente antes de aprobar cada cuenta.

| Servicio | Plan inicial | Costo mensual aprox. | Estado |
|---|---|---|---|
| Supabase | Free | US$0 | Pausa por inactividad. Insuficiente para pago en vivo. |
| Supabase | Pro | Verificar (referencia: ~US$25) | Requerido antes de Sprint 5. |
| Vercel | Hobby | US$0 | Uso no comercial. No sirve para un marketplace que cobra. |
| Vercel | Pro | Verificar (referencia: ~US$20 por miembro) | Requerido antes de Sprint 5. |
| WhatsApp Cloud API | Por conversación | Varía por país y tipo | Pendiente de verificación de negocio. |
| Proveedor de OTP | Por mensaje | Verificar | Dependencia de pago. Requiere aprobación. |
| Dominio | Anual | Verificar | Pendiente de Fabian. |
| Stripe | Por transacción | 2.9% + US$0.30 (EE. UU.) | Sprint 3. Cobros locales: ver brief. |

Dependencia que supere US$150 al mes: se consulta antes de agregarla.

---

## Sprint status

Sprint 1 — Perfiles y búsqueda

| Criterio | Estado | Evidencia |
|---|---|---|
| Registro de profesional: oficio, zona, precio, cédula, fotos | Hecho | `/pro/registro`. Fotos se comprimen en el teléfono antes de subir. |
| Insignia verificada solo por administrador | Hecho | Trigger `pros_guard` y función `admin_review_pro`. Probado en RLS. |
| Búsqueda por oficio y zona, solo Santo Domingo | Hecho | `/buscar`. Zona validada en base de datos. Visible sin sesión. |
| Búsqueda en menos de 60 s en Android de US$150 | Pendiente | Requiere prueba en dispositivo. |

Sprint 0 — Fundación (Semana 1)

| Criterio | Estado | Evidencia |
|---|---|---|
| Repo, Next.js + TypeScript + PWA | Hecho | `npm run build` y `npm run typecheck` pasan. |
| Manifest y service worker | Hecho | `/manifest.webmanifest` y `/sw.js` responden 200. |
| Interfaz en español | Hecho | `lang="es-DO"`. Página 404 y error en español. |
| Esquema de Supabase con RLS | Hecho | 10 de 10 pruebas en `npm run test:rls`. |
| Esquema aplicado en Supabase | Hecho | Proyecto `listavy` (us-east-2). Migraciones 0001 y 0002 aplicadas. 7 tablas, RLS activo, 18 políticas. |
| Advisor de seguridad | Hecho con avisos WARN aceptados | Quedan 4 avisos de funciones `SECURITY DEFINER` (`is_admin`, `is_job_party`, `is_job_homeowner`, `has_quoted_job`). Son necesarias para RLS y solo las ejecuta `authenticated`. |
| Login por teléfono y WhatsApp | Código listo, sin probar en vivo | Requiere proveedor de OTP con WhatsApp configurado en Supabase. |
| App arranca en Android e iPhone | Pendiente | Requiere prueba manual en dispositivo. |
| README con costos y migración | Hecho | Este archivo. |

Pendiente para completar Sprint 0: proveedor de OTP con WhatsApp configurado, prueba de login en vivo, y prueba manual en un Android de US$150 y en un iPhone.

---

## Fuera de alcance en v1

Apps nativas, app de escritorio, chat dentro de la app, GPS en vivo, motor de precios con IA, escrow de semanas, badges de "certificado", difusión masiva a 5 pros, despacho tipo Uber, pagos en efectivo, fondos fuera de la pasarela regulada.
