# Especificación del Sistema de Inventario y Préstamos — Bodega de Tenis

## 1. Resumen ejecutivo

Reemplazar el proceso manual actual (cuaderno físico + lista aparte al final del día + recolección presencial por centros comerciales) por una aplicación web conectada a Supabase, operada principalmente desde celular (equipo de bodega en campo) y desde un panel de escritorio (administración).

El control se hace por **par individual de tenis**, identificado con un **código QR permanente pegado físicamente al zapato**, generado únicamente en el momento de ingreso a bodega.

Dos flujos conviven sobre la misma base:
1. **Préstamo diario**: salida de un par hacia un local, con expectativa de devolución o venta el mismo día/días siguientes.
2. **Mostrario**: ~5 locales, ~300 pares cada uno, inventario de exhibición de largo plazo en esos mismos locales, que se gestiona por separado aunque comparta la tienda física.

---

## 2. Roles y usuarios

- **Todo el uso de la app es interno** (equipo de bodega). Los locales comerciales no tienen acceso ni login.
- Hasta **3 personas simultáneas** en campo, cada una cubriendo una ruta de centros comerciales.
- Un **panel de administración** (desktop) para: operación del día a día, inventario general, historial de movimientos.
- Para el MVP, todos los usuarios internos comparten el mismo nivel de permiso (operador = admin). Dejar la puerta abierta a diferenciar roles (`admin` / `operador`) más adelante vía una tabla `user_roles` o metadata en `auth.users`, sin bloquear el desarrollo inicial por esto.

---

## 3. Modelo de datos (Supabase / Postgres)

### 3.1 Cambios sobre el esquema actual

- Se agrega **talla** a `shoe_units` (cada par físico = una talla específica).
- Se reemplaza `current_store_id` (apuntando directo a `stores`) por `current_location_id`, apuntando a una nueva tabla **`store_locations`**, que separa "préstamo diario" de "mostrario" dentro del mismo local.
- Se agrega tabla de **rutas diarias** para asignar centros comerciales a cada operador por día.
- Se agrega tabla de **cierres de día** (snapshot) para conservar el histórico de pendientes, incluso cuando arrastran varios días.
- `movements.store_id` pasa a `movements.location_id` (mismo criterio que `shoe_units`).

### 3.2 Esquema propuesto

```sql
-- Ya existente, sin cambios
CREATE TABLE public.shopping_centers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  route_order integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shopping_centers_pkey PRIMARY KEY (id)
);

-- Ya existente, sin cambios
CREATE TABLE public.stores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shopping_center_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stores_pkey PRIMARY KEY (id),
  CONSTRAINT stores_shopping_center_id_fkey FOREIGN KEY (shopping_center_id) REFERENCES public.shopping_centers(id)
);

-- NUEVA: separa "préstamo diario" de "mostrario" dentro del mismo local
CREATE TABLE public.store_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['prestamo'::text, 'mostrario'::text])),
  name text, -- ej. "Mostrario principal", opcional
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT store_locations_pkey PRIMARY KEY (id),
  CONSTRAINT store_locations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id),
  CONSTRAINT store_locations_unique_type UNIQUE (store_id, type)
);

-- Ya existente, sin cambios
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  default_price numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id)
);

-- MODIFICADA: se agrega size, y current_store_id -> current_location_id
CREATE TABLE public.shoe_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  qr_code text NOT NULL UNIQUE,
  size text NOT NULL, -- ej. "9.5 US", "42 EU"
  status text NOT NULL DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'loaned'::text, 'sold'::text])),
  current_location_id uuid, -- antes: current_store_id
  price numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shoe_units_pkey PRIMARY KEY (id),
  CONSTRAINT shoe_units_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT shoe_units_current_location_id_fkey FOREIGN KEY (current_location_id) REFERENCES public.store_locations(id)
);

-- MODIFICADA: store_id -> location_id
CREATE TABLE public.movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shoe_unit_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['ingreso'::text, 'salida'::text, 'devolucion'::text, 'venta'::text, 'ajuste'::text])),
  location_id uuid, -- antes: store_id
  requested_by_text text,
  payment_method text CHECK (payment_method = ANY (ARRAY['cash'::text, 'transfer'::text, 'card'::text, 'pending'::text])),
  sale_price numeric,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT movements_pkey PRIMARY KEY (id),
  CONSTRAINT movements_shoe_unit_id_fkey FOREIGN KEY (shoe_unit_id) REFERENCES public.shoe_units(id),
  CONSTRAINT movements_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.store_locations(id),
  CONSTRAINT movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

-- NUEVA: ruta diaria por operador (hasta 3 personas simultáneas)
CREATE TABLE public.daily_routes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_date date NOT NULL,
  operator_id uuid NOT NULL,
  shopping_center_id uuid NOT NULL,
  order_in_route integer,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'done'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_routes_pkey PRIMARY KEY (id),
  CONSTRAINT daily_routes_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES auth.users(id),
  CONSTRAINT daily_routes_shopping_center_id_fkey FOREIGN KEY (shopping_center_id) REFERENCES public.shopping_centers(id)
);

-- NUEVA: snapshot de cierre de día (reemplaza la "lista aparte" en papel)
CREATE TABLE public.day_closings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  closing_date date NOT NULL,
  location_id uuid NOT NULL,
  pending_units_count integer NOT NULL DEFAULT 0,
  pending_units_snapshot jsonb, -- array de shoe_unit_id + referencia + hora salida
  closed_by uuid NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT day_closings_pkey PRIMARY KEY (id),
  CONSTRAINT day_closings_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.store_locations(id),
  CONSTRAINT day_closings_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id)
);
```

### 3.3 Notas sobre el modelo

- `store_locations` con `UNIQUE (store_id, type)` asegura máximo una ubicación de préstamo y una de mostrario por tienda.
- Un `shoe_unit` con `current_location_id = NULL` se interpreta como "en bodega".
- `day_closings.pending_units_snapshot` guarda una foto de qué quedó pendiente ese día, aunque el par siga apareciendo en consultas en vivo hasta que se resuelva — así se puede reconstruir el histórico exacto de lo que se reportó cada día, incluso si después cambia el estado.
- `daily_routes` permite que el panel admin arme la ruta de cada operador y que la app en campo sepa "hoy te toca cubrir estos centros comerciales, en este orden".

---

## 4. Procesos funcionales

### 4.1 Ingreso de producto nuevo (único punto de entrada de QR)

1. Se crea/selecciona el `product` (referencia, precio base) si no existe.
2. Por cada par físico que llega: se registra `shoe_unit` (talla, precio si difiere del base) → se genera QR único → se envía a imprimir en la Zebra.
3. Se crea `movement` tipo `ingreso`, `location_id = NULL` (queda en bodega), `status = available`.
4. La etiqueta impresa se pega físicamente al zapato.

### 4.2 Salida (préstamo diario) hacia un local

Este es el flujo de uso diario y debe ser lo más simple posible: **elegir local y escanear**, sin pedir al operador que piense en tipo de ubicación.

1. Operador selecciona el **local** (no la sub-ubicación) destino.
2. Escanea el QR de cada par que se lleva. Repetible en lote: varios pares seguidos antes de confirmar (así se replica el "1P, 2R, ½..." del cuaderno pero validado par por par).
3. Al confirmar, la app resuelve automáticamente la `store_location` de tipo `prestamo` de ese local (la crea si no existe todavía) y la usa como destino — el operador nunca elige entre `prestamo`/`mostrario` en este flujo.
4. Se crea `movement` tipo `salida` por cada par, se actualiza `shoe_unit.status = loaned`, `current_location_id = <location de tipo prestamo del local>`.

> El mostrario **nunca** se toca desde este flujo. Solo se mueve inventario hacia/desde `mostrario` en el proceso descrito en 4.4, que es aparte y esporádico.

### 4.3 Recolección / devolución con reconciliación (el punto crítico del negocio)

Este es el flujo que hoy causa más fricción (no se sabe qué se vendió hasta llegar al local). Flujo híbrido acordado:

1. Antes de llegar al local, la app muestra **lo que debería estar ahí** (todos los `shoe_units` con `status = loaned` y `current_location_id` = ese local).
2. El operador **escanea todo lo que físicamente encuentra** en el local.
   - Cada par escaneado que coincide con la lista esperada → se marca automáticamente como `devolucion` (o se deja en mostrario si aplica) y vuelve a bodega o queda disponible.
3. Al terminar de escanear, la app muestra el **listado de diferencias**: pares esperados que NO fueron escaneados.
4. Para cada par en la lista de diferencias, el operador **confirma manualmente** una de estas opciones:
   - **Vendido** → `movement` tipo `venta` (método de pago, precio), `status = sold`.
   - **Sigue pendiente** (no lo tenían listo, lo dejan un día más) → queda `loaned`, se refleja en el cierre de día.
   - **Extraviado / ajuste** → `movement` tipo `ajuste`, con nota.
5. Este flujo no cobra penalidades ni recargos — solo deja registro claro de qué pasó con cada par, para que el seguimiento (y el cobro fuera de la app, si aplica) sea eficiente.

### 4.4 Gestión de mostrario (proceso aparte, no diario)

Esta gestión es **independiente del flujo diario de la sección 4.2** y ocurre con baja frecuencia (máximo ~2 veces al mes). Tiene su propia pantalla, donde ahí sí es explícito que se está trabajando sobre mostrario:

- Alta inicial / reposición: mover en lote pares desde bodega hacia `store_location` tipo `mostrario` de cada uno de los 5 locales (`salida`, con `location.type = mostrario` seleccionado explícitamente en esta pantalla).
- Revisión periódica: mismo mecanismo de escaneo + reconciliación del punto 4.3 (esperado vs. escaneado), aplicado a la ubicación de mostrario, ejecutado en las visitas quincenales/mensuales.
- Reportes de mostrario se filtran siempre por `location.type = mostrario`, separados de los préstamos diarios de ese mismo local.
- Importante para el diseño de pantallas (sección 5.1): esta pantalla **no debe mezclarse** con la de salida/recolección diaria, precisamente para no obligar al operador a elegir tipo de ubicación en su flujo del día a día.

### 4.5 Cierre de día

- Al final del día (o cuando el operador termine su ruta), se genera un `day_closing` por cada `location` con pendientes: cuenta y snapshot de los pares que quedaron sin resolver.
- El panel admin muestra tanto el histórico de cierres (`day_closings`) como una vista en vivo (consulta directa a `shoe_units` con `status = loaned` y fecha de salida > X días) para lo que sigue pendiente hoy, sin importar cuántos días lleve arrastrándose.

---

## 5. Pantallas necesarias

### 5.1 App de campo (mobile-first, PWA)

- **Login** simple (Supabase Auth).
- **Mi ruta de hoy**: lista de centros comerciales asignados, orden sugerido.
- **Escanear / Salida (diaria)**: elegir local → cámara → lista de pares escaneados en la sesión → confirmar. Sin selector de tipo de ubicación; siempre va a `prestamo`.
- **Recolección (diaria)**: por local, lista esperada vs. escaneado en vivo, con pantalla de diferencias y resolución manual (vendido / pendiente / ajuste).
- **Mostrario (pantalla aparte, uso quincenal/mensual)**: elegir local → elegir acción (reponer / revisar) → escanear, con reconciliación igual a la de recolección diaria pero contra la ubicación de mostrario.
- **Ingreso de producto nuevo**: alta de producto + talla + generación e impresión de QR.
- **Historial rápido**: últimos movimientos del operador.

### 5.2 Panel de administración (desktop)

- **Dashboard**: pendientes por local, pendientes por más de X días, resumen del día.
- **Inventario**: filtrable por producto, talla, estado, ubicación (bodega / local-préstamo / local-mostrario).
- **Historial de movimientos**: por par, por local, por operador, por rango de fechas.
- **Gestión de rutas**: asignar centros comerciales a cada operador por día.
- **Gestión de catálogo**: productos, locales, centros comerciales.
- **Cierres de día**: histórico de `day_closings`, exportable.

---

## 6. Códigos QR

- Se generan **solo** en el punto de ingreso (4.1), uno por `shoe_unit`, contenido = `id` (uuid) o `qr_code` propio (string corto legible, ej. `SHU-000123`) — recomendado usar un código corto propio en vez del uuid completo, más fácil de imprimir y depurar visualmente.
- Impresión en impresora térmica Zebra: generar el QR en el navegador (librería `qrcode` en JS) y mandarlo a imprimir en formato de etiqueta (la mayoría de impresoras Zebra aceptan ZPL o impresión directa vía navegador/driver — validar el modelo exacto antes de definir el método de impresión en el documento técnico de Codex).
- El QR es permanente: no se regenera aunque el par cambie de estado o ubicación.

---

## 7. Stack técnico recomendado

- **Next.js (App Router)**, no React puro con Vite, porque:
  - Se necesitan dos superficies claramente distintas (app de campo mobile + panel admin desktop) que comparten lógica de datos — las rutas de Next.js organizan esto bien sin duplicar proyecto.
  - Los flujos de reconciliación e impresión de QR se benefician de Server Actions/Route Handlers para hablar con Supabase de forma segura (ej. generación de QR, cierres de día) sin exponer lógica sensible en el cliente.
  - Despliegue directo en Vercel, sin infraestructura adicional.
- **Supabase**: Auth (usuarios internos), Postgres (esquema de la sección 3), Row Level Security por rol cuando se implementen roles diferenciados.
- **PWA**: dado que hay wifi confiable en los centros comerciales, no es indispensable soporte offline robusto para el MVP, pero se recomienda instalar como PWA (ícono en pantalla de inicio, acceso rápido a cámara) para agilidad en campo.
- Librería QR: `qrcode` (generación) + `html5-qrcode` o `@zxing/browser` (lectura vía cámara del navegador).

---

## 8. Plan de fases sugerido

**Fase 1 — MVP operativo**
- Migración de esquema (sección 3).
- Ingreso de producto + generación/impresión de QR.
- Salida y devolución simples (sin reconciliación automática todavía).
- Panel admin básico: inventario + historial.

**Fase 2 — Reconciliación y mostrario**
- Flujo de recolección con lista esperada vs. escaneado (sección 4.3).
- Gestión de mostrario como ubicación separada.
- Cierres de día (`day_closings`).

**Fase 3 — Rutas y refinamiento**
- Gestión de rutas diarias por operador.
- Reportes más ricos (por referencia, por talla, tiempos promedio de préstamo).
- Roles diferenciados (admin/operador) si se vuelve necesario.

---

## 9. Supuestos abiertos (a validar con Codex o antes de empezar)

- Modelo exacto de impresora Zebra, para definir si la impresión de etiquetas es vía ZPL directo, driver del sistema, o servicio intermedio.
- Formato final del `qr_code` (uuid completo vs. código corto legible).
- Si se requiere en el futuro que los locales confirmen recepción (hoy: no).
- Diferenciación de roles admin/operador: no bloqueante para el MVP, pero dejar la estructura de datos abierta a agregarla sin romper nada (`auth.users` + tabla de roles futura).
