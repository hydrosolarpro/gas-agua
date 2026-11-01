# AguaGasExpress

Gas y agua a domicilio con seguimiento en vivo, para negocios peruanos. Plan y arquitectura: [ARQUITECTURA.md](ARQUITECTURA.md).

## Puesta en marcha

1. **Crear el proyecto en Supabase** (gratis): https://supabase.com/dashboard → *New project* (región São Paulo).
2. **Crear las tablas**: *SQL Editor* → ejecuta, en orden, los archivos de `supabase/migrations/` → *Run*.
3. **Claves**: *Project Settings → API*. Copia `.env.example` a `.env.local` y completa:
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (secreta)
   - `PIN_PEPPER`: un texto largo y aleatorio (no lo cambies después o los PIN dejarán de funcionar).
4. **Auth → Providers → Email**: desactiva *Confirm email* (las cuentas con PIN usan un correo interno).
5. `npm install` y `npm run dev` → http://localhost:3000

## Vercel

Importa el repositorio y agrega las variables de entorno del paso 3 (más ADMIN_PHONE y ADMIN_SETUP_CODE).

## Probar el flujo completo

1. Activa al administrador en `/activar-admin` (código `ADMIN_SETUP_CODE`), completa *Mis datos* e invita a un dueño. El dueño crea su negocio con el enlace, ajusta precios y copia el enlace de su tienda.
2. En otro navegador, registra un cliente y pide desde `/n/<slug>`.
3. El dueño acepta/asigna el pedido; el repartidor abre `/repartidor`, toma el pedido, "Salir a entregar".
   La ubicación GPS se comparte en vivo (en celular o con permiso de ubicación en el navegador).
4. El cliente ve el mapa, la ruta y el tiempo estimado. El repartidor pulsa "Entregué" y registra el cobro.
5. El dueño valida el pago en *Pedidos → Por validar*.

> El GPS del navegador exige HTTPS (Vercel lo da) o `localhost`.
