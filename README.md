# Smart Inventory — MVP

Scaffold inicial para el gestor de inventario según la especificación.

Rápido inicio (instalar dependencias):

```bash
npm install
npm run dev
```

Configura las variables de entorno en `.env.local` copiando `.env.example` y rellenando los valores de Supabase.

Migraciones: ejecuta `migrations/001_create_schema.sql` en una base nueva. Si ya ejecutaste
esa migración y aparece un error de Row Level Security, ejecuta también
`migrations/002_enable_mvp_rls.sql` en Supabase SQL Editor. Para hacer la talla
opcional en el ingreso, ejecuta finalmente `migrations/003_make_size_optional.sql`.
