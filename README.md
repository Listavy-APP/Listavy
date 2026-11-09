# Listavy

Marketplace de servicios del hogar para Santo Domingo. Un profesional verificado, cotización por foto, pago por la plataforma, fotos antes y después.

Estado: **Sprint 0 (Fundación)**. Ver `Sprint status` abajo.

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
| `npm run test:rls` | Prueba RLS y los guardas de privilegios contra la migración (PGlite, datos TEST) |

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

## Seguridad de la base de datos

- RLS activo en las siete tablas.
- `pros.verification_status`, `pros.plan` y `profiles.role` solo cambian con sesión de administrador. Lo impone un trigger, no solo la UI.
- Las tablas `payments` y `disputes` no aceptan escrituras de clientes para pagos. Los pagos se escriben desde Edge Functions con `service_role` (Sprint 3).
- Las funciones auxiliares `SECURITY DEFINER` evitan recursión entre políticas de `jobs` y `quotes`.

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

Sprint 0 — Fundación (Semana 1)

| Criterio | Estado | Evidencia |
|---|---|---|
| Repo, Next.js + TypeScript + PWA | Hecho | `npm run build` y `npm run typecheck` pasan. |
| Manifest y service worker | Hecho | `/manifest.webmanifest` y `/sw.js` responden 200. |
| Interfaz en español | Hecho | `lang="es-DO"`. Página 404 y error en español. |
| Esquema de Supabase con RLS | Hecho | 10 de 10 pruebas en `npm run test:rls`. |
| Esquema aplicado en Supabase | Hecho | Proyecto `listavy` (us-east-2). Migraciones 0001 y 0002 aplicadas. 7 tablas, RLS activo, 18 políticas. |
| Advisor de seguridad | Hecho con 4 avisos aceptados | Quedan 4 avisos de funciones `SECURITY DEFINER` (`is_admin`, `is_job_party`, `is_job_homeowner`, `has_quoted_job`). Son necesarias para RLS y solo las ejecuta `authenticated`. |
| Login por teléfono y WhatsApp | Código listo, sin probar en vivo | Requiere proveedor de OTP con WhatsApp configurado en Supabase. |
| App arranca en Android e iPhone | Pendiente | Requiere prueba manual en dispositivo. |
| README con costos y migración | Hecho | Este archivo. |

Pendiente para completar Sprint 0: proveedor de OTP con WhatsApp configurado, prueba de login en vivo, y prueba manual en un Android de US$150 y en un iPhone.

---

## Fuera de alcance en v1

Apps nativas, app de escritorio, chat dentro de la app, GPS en vivo, motor de precios con IA, escrow de semanas, badges de "certificado", difusión masiva a 5 pros, despacho tipo Uber, pagos en efectivo, fondos fuera de la pasarela regulada.
