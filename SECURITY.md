# Seguridad de AguaGasExpress

## Secretos: qué nunca se sube a git

| Archivo / valor | Dónde vive | Quién lo ve |
|---|---|---|
| `.env.local` (claves reales) | Solo tu PC | Nadie más; está en `.gitignore` |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` y variables de **Vercel** | Solo el servidor; nunca el navegador |
| `PIN_PEPPER` | `.env.local` y variables de **Vercel** | Solo el servidor |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | `.env.local` y Vercel | Público por diseño; la seguridad la da RLS |
| `.env.example` | Repositorio | Plantilla **sin valores** |

Tres capas impiden subir un secreto:

1. **`.gitignore`**: ignora `.env*` (salvo `.env.example`), `.vercel`, `supabase/.temp`.
2. **Hook `pre-commit`** (`.githooks/pre-commit` + `scripts/check-secrets.mjs`): bloquea el commit si hay un `.env`, llaves privadas o claves (JWT/Supabase, AWS, GitHub, Google, Anthropic…). Se activa solo con `npm install` (script `prepare`).
3. **GitHub Actions** (`.github/workflows/seguridad.yml`): repite la revisión en cada push y audita dependencias.

Comprobar a mano: `npm run check:secrets`.

### Si una clave se expone
1. **Rotarla de inmediato** (Supabase → Project Settings → API Keys → regenerar). Borrar el archivo del historial **no** basta.
2. Actualizar `.env.local` y las variables de Vercel.
3. Si cambias `PIN_PEPPER`, todos los PIN dejan de funcionar (hay que volver a crearlos).

## Medidas en la app

- **Base de datos:** RLS en todas las tablas; el cliente no puede insertar pedidos ni cambiar precios, rol o estado; todo pasa por funciones `security definer` que verifican quién llama.
- **PIN:** nunca se guarda; se deriva `HMAC-SHA256(PIN_PEPPER, id:PIN)` solo en el servidor. Bloqueo escalonado (5 fallos/15 min; 15 fallos/24 h) y se rechazan PIN triviales (1234, 0000, repetidos, secuencias).
- **Clave de servicio:** solo en código de servidor (`server-only`), nunca en el navegador.
- **Redirecciones:** `safePath()` evita *open redirect* (`//`, `\`, URLs externas).
- **Equipo:** un dueño no puede convertir cuentas ajenas de clientes en repartidores.
- **Cabeceras HTTP:** HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (ubicación solo para la propia app).

## Pendiente recomendado

- Content-Security-Policy estricta (requiere probar con mapas OSM, Supabase y OSRM).
- Límite de registros por IP (anti-spam) y CAPTCHA en el registro.
- Activar *secret scanning* y *push protection* de GitHub (gratis en repos públicos; en privados requiere GitHub Advanced Security).
- Servidor de rutas y de direcciones propio (hoy se usan los públicos de OSRM y Nominatim, con límites de uso).

## Administrador, invitaciones y cobros

- **Un solo administrador.** Su celular está reservado (`ADMIN_PHONE`): nadie más puede registrarlo por las rutas públicas. Se activa una vez en `/activar-admin` con el código secreto `ADMIN_SETUP_CODE` (solo servidor) y un PIN que elige la propia persona; después ese código ya no sirve.
- **`is_admin` no es editable por nadie desde la app.** Solo lo escribe el servidor con la clave de servicio. Las funciones del administrador (`admin_*`, `review_subscription_payment`) comprueban `is_admin()` dentro de la base de datos.
- **Los negocios solo se crean por invitación.** `create_business` ya no es ejecutable por usuarios; la única vía es `admin_create_business`, accesible únicamente con la clave de servicio, tras validar una invitación.
- **Invitaciones:** el enlace tiene 256 bits de azar, vence (7 a 30 días), se usa una sola vez (se reclama de forma atómica) y en la base solo se guarda su hash SHA-256.
- **Eliminar un dueño** exige ser administrador (verificado en el servidor) y escribir el nombre del negocio; borra en cascada negocio, pedidos, pagos y repartidores propios.
- **Datos de cobro:** solo los ven el administrador y los dueños (RLS). Un dueño no puede ver pagos de otros, validarse su propio pago ni cambiar su monto.- **Repartidores y clientes sin PIN propio.** El dueño registra a su repartidor solo con nombre y celular; la persona crea su PIN en `/api/driver/activar`, solo si sigue sin PIN y dentro de 72 horas (`pin_setup_until`), con bloqueo por intentos (`setup:<celular>`). Si el celular ya tenía cuenta, queda una invitación que la propia persona debe aceptar.
- **Reinicio de PIN por el dueño.** Un dueño puede reiniciar el PIN de los repartidores de su equipo (`PATCH /api/drivers`) y de los clientes de su negocio (`PATCH /api/customers`). No se puede sobre administradores, dueños ni cuentas que trabajan en otro negocio. Riesgo conocido: durante el plazo, quien conozca el celular podría elegir el PIN primero; se reduce enviando el enlace de inmediato y con el bloqueo por intentos.
- **Invitaciones de clientes.** Enlaces con token aleatorio (solo se guarda su hash), vencimiento, anulables y reutilizables; una cuenta existente solo se vincula verificando su PIN actual.
