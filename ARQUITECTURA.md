# AguaGasExpress — Plan y arquitectura

App web progresiva (PWA, se instala en el celular) para negocios peruanos que reparten **balones de gas** y/o **bidones de agua**. Tres perfiles en una sola app:

| Perfil | Qué hace | Cómo entra |
|---|---|---|
| **Cliente** | Pide gas/agua, marca su ubicación en el mapa, elige cómo pagar (Yape, Plin, efectivo) y sigue al repartidor en vivo | Google o celular + PIN de 4 dígitos |
| **Dueño del negocio** | Ve todos los pedidos, asigna repartidores, ve el mapa en vivo, valida los pagos contra-entrega y revisa ingresos | Google o celular + PIN |
| **Repartidor (despachador)** | Recibe pedidos, comparte su GPS, navega hasta el cliente, marca la entrega y registra el cobro | Celular + PIN (el dueño le crea la cuenta) |

## 1. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend + API | **Next.js 16** (App Router, TypeScript, Tailwind 4) | Un solo proyecto, se despliega en Vercel con cada push a GitHub |
| Base de datos | **Supabase (PostgreSQL)** con Row Level Security | Cada usuario ve solo lo suyo, reglas en la base de datos |
| Autenticación | **Supabase Auth**: Google OAuth + PIN propio | Gmail para quien lo prefiera; PIN de 4 dígitos para el día a día |
| Tiempo real | **Supabase Realtime** (cambios de Postgres) | Pedidos y posición del repartidor se actualizan sin recargar |
| Mapas | **Leaflet + OpenStreetMap**, rutas con **OSRM** | Gratis y sin tarjeta; se puede cambiar a Google Maps/Mapbox luego |
| Navegación | Enlaces directos a **Google Maps** y **Waze** | El repartidor usa el navegador que ya conoce |

## 2. Arquitectura general

```
 Celular cliente ─┐                      ┌─ Supabase Auth (Google / PIN)
 Celular repartidor ─┼─► Next.js (Vercel) ─┼─ PostgreSQL + RLS (pedidos, pagos, productos)
 PC/celular dueño ─┘    · páginas React    ├─ Funciones SQL (crear pedido, cambiar estado, validar pago)
                        · API PIN/repartidor └─ Realtime (pedidos, ubicación del repartidor)
                        · proxy de sesión
        Mapas: tiles OpenStreetMap · rutas OSRM · enlaces Google Maps/Waze
```

- El navegador habla directo con Supabase usando la **clave pública**; la seguridad la da RLS.
- Las operaciones sensibles (crear pedido con precio real, cambiar estado, validar pago) pasan por **funciones SQL `security definer`** que verifican quién llama y en qué estado está el pedido.
- La clave de servicio solo se usa en el servidor (login con PIN y alta de repartidores).

## 3. Acceso: Google y PIN de 4 dígitos

- **Google**: botón "Continuar con Google" → Supabase OAuth → `/auth/callback` → si es nuevo, pantalla de bienvenida (nombre, celular, "soy cliente" o "tengo un negocio").
- **PIN**: celular (9 dígitos) + PIN de 4 dígitos.
  - El PIN nunca se guarda en texto: se deriva una contraseña larga con `HMAC-SHA256(PIN_PEPPER, celular:PIN)` en el servidor.
  - Bloqueo tras **5 intentos fallidos en 15 minutos** por celular (tabla `pin_attempts`).
  - Un usuario de Google también puede crear su PIN para entrar rápido desde otro celular.
- El dueño crea a sus repartidores con nombre, celular y PIN; ellos entran solo con PIN.

## 4. Modelo de datos (resumen)

| Tabla | Campos clave |
|---|---|
| `profiles` | id, nombre, celular, rol (cliente/dueño/repartidor), dirección y coordenadas por defecto |
| `businesses` | dueño, nombre, slug (enlace para compartir), celular, número Yape/Plin, ubicación |
| `business_members` | negocio, usuario, rol repartidor, activo |
| `products` | negocio, nombre, categoría gas/agua, precio, activo |
| `orders` | código, negocio, cliente, repartidor, estado, método y estado de pago, total, "paga con", dirección, referencia, lat/lng, tiempos de cada etapa |
| `order_items` | pedido, producto, precio unitario, cantidad |
| `driver_locations` | repartidor, lat/lng, rumbo, velocidad, hora (una fila por repartidor, se actualiza en vivo) |
| `pin_attempts` | celular, hora, éxito |

**Estados del pedido:** `pendiente → aceptado → en_camino → entregado` (o `cancelado`).
**Estados del pago:** `pendiente → reportado` (repartidor registró el cobro) `→ validado` (dueño confirmó que el dinero llegó) o `rechazado`.

## 5. Ubicación y seguimiento en tiempo real (estilo Yango / inDrive)

1. **Cliente** marca el punto de entrega: botón "Usar mi ubicación" (GPS) + pin arrastrable en el mapa + referencia escrita ("puerta verde, 2do piso").
2. **Repartidor** pulsa "Iniciar ruta": el celular comparte su GPS con `watchPosition` (alta precisión), cada ~4 s o 15 m, a `driver_locations`.
3. **Cliente y dueño** se suscriben por Realtime a la ubicación del repartidor: ven el ícono moverse, la **ruta trazada** y el **tiempo estimado de llegada** (OSRM).
4. El repartidor tiene botones **Google Maps** y **Waze** para navegar paso a paso, y botones de **llamar / WhatsApp** al cliente.
5. Al entregar o cancelar, se deja de compartir la ubicación.

## 6. Pago contra-entrega y validación

1. Al pedir, el cliente elige **Yape, Plin o efectivo** (con "pago con S/ ___" para preparar el vuelto).
2. En la puerta, el repartidor pulsa **"Entregado"** y se abre la hoja de cobro:
   - **Efectivo**: confirma el monto recibido y la app calcula el vuelto.
   - **Yape/Plin**: el cliente ve el número del negocio; el repartidor anota el **código de operación** o los últimos dígitos.
3. El pago queda **reportado**. En el dashboard, el dueño revisa su app de Yape/Plin o recibe el efectivo y pulsa **"Validar pago"** (o "Rechazar").
4. El dashboard separa **ingresos validados** de **por validar**, por método.

## 7. Dashboard del dueño

- Indicadores del día: pedidos, entregados, en curso, ingresos validados, por validar.
- Ingresos por método (Yape / Plin / Efectivo).
- Mapa en vivo con repartidores y pedidos pendientes.
- Tablero de pedidos con filtros por estado, asignación de repartidor y validación de pagos.
- Gestión de productos y precios, repartidores y datos del negocio (número Yape/Plin, enlace para compartir por WhatsApp).

## 8. Rutas de la app

| Ruta | Para |
|---|---|
| `/` | Portada y entrada según rol |
| `/ingresar`, `/registro`, `/bienvenida` | Acceso con Google o PIN, alta y onboarding |
| `/n/[slug]` | Tienda del negocio (enlace que el dueño comparte) |
| `/cliente`, `/cliente/pedido/[id]` | Mis pedidos y seguimiento en vivo |
| `/repartidor`, `/repartidor/pedido/[id]` | Pedidos asignados, ruta, entrega y cobro |
| `/panel`, `/panel/pedidos`, `/panel/productos`, `/panel/repartidores`, `/panel/negocio` | Dashboard del dueño |

## 9. Seguridad

- RLS en todas las tablas; funciones SQL verifican rol y estado.
- El precio total se calcula en la base de datos (el cliente no puede mandar precios falsos).
- PIN con HMAC + pepper secreto + bloqueo por intentos.
- La ubicación del repartidor solo la ven su negocio y el cliente con pedido activo con él.

## 10. Hoja de ruta

| Fase | Contenido |
|---|---|
| **1 (esta entrega)** | Acceso Google/PIN, pedidos, mapas en vivo, entrega y cobro contra-entrega, dashboard |
| 2 | Notificaciones push, foto del comprobante Yape, recompra con un toque, pedidos recurrentes de agua |
| 3 | Comprobantes SUNAT, inventario de balones llenos/vacíos, reportes descargables |
| 4 | Suscripciones de pago (S/ 39 / 79 / 149), multi-sede, estadísticas avanzadas |
