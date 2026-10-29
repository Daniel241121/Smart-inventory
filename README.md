# Smart Inventory

Control de préstamos y cobros de una bodega de tenis en San Andresito. Cada par lleva un QR
(`P-000123`); los trabajadores lo escanean al prestarlo a un local y al recogerlo.

## Qué hace

- **Resumen**: pares en la calle, lo que falta por cobrar, lo cobrado hoy y alertas de pares con muchos días afuera.
- **Locales**: por cada local, los pares que tiene, lo vendido, lo pagado y lo que debe, con historial.
- **Prestar**: elegir el local y escanear en ráfaga (la cámara queda abierta y suena un pitido por par).
- **Recoger**: la app muestra lo que debería haber en el local, se escanea lo que devuelven, se marca lo vendido y se registra el pago, todo en una sola visita.
- **Inventario**: catálogo de modelos con foto, ingreso de pares por talla (sugiere modelos existentes para no duplicar), impresión y reimpresión de etiquetas QR de 50 × 30 mm, edición de precios y unión de modelos duplicados.

## Puesta en marcha

1. En Supabase > SQL Editor, ejecuta `supabase/001_esquema.sql` (**borra el esquema anterior y sus datos**) y luego `supabase/002_catalogo.sql`.
2. Copia `.env.example` a `.env.local` y llena las claves del proyecto.
3. `npm install` y `npm run dev`. Abre http://localhost:3000.

Los usuarios se crean en Supabase > Authentication > Users.

> La cámara del celular solo funciona con HTTPS. Para probar en el celular dentro de la misma red usa
> `npx next dev --experimental-https -H 0.0.0.0`, o despliega en Vercel.

## Estructura

- `supabase/001_esquema.sql`: tablas, vista `store_balances` (saldo = vendido − pagado) y las funciones atómicas `register_intake`, `lend_units` y `settle_visit`.
- `supabase/002_catalogo.sql`: foto del modelo (bucket `product-photos`) y las funciones `update_product` y `merge_products`.
- `src/lib/api.ts`: todas las consultas a Supabase.
- `src/components/`: interfaz compartida (escáner, selector de local, modales).
- `app/(app)/`: pantallas con la navegación; `app/login` y `app/etiquetas` van sin ella.
