import { supabase } from './supabase/client';
import { startOfTodayBogota } from './format';
import type {
  Movement,
  MovementType,
  Payment,
  PaymentMethod,
  Product,
  ProductSummary,
  ShoppingCenter,
  StoreBalance,
  Unit
} from './types';

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const UNIT_SELECT = 'id, code, size, price, status, store_id, loaned_at, created_at, product:products(reference, brand, color, photo_url), store:stores(name)';
const MOVEMENT_SELECT =
  'id, type, amount, notes, created_at, unit:shoe_units(code, size, product:products(reference, color)), store:stores(id, name)';

// ---------- Locales ----------

export async function listStoreBalances(): Promise<StoreBalance[]> {
  return check(await supabase.from('store_balances').select('*').order('name'));
}

export async function getStoreBalance(id: string): Promise<StoreBalance> {
  return check(await supabase.from('store_balances').select('*').eq('id', id).single());
}

export async function listShoppingCenters(): Promise<ShoppingCenter[]> {
  return check(await supabase.from('shopping_centers').select('id, name').order('name'));
}

export async function createStore(input: {
  shoppingCenterId: string | null;
  newShoppingCenter: string;
  name: string;
  localNumber: string;
  contactName: string;
  phone: string;
}) {
  let centerId = input.shoppingCenterId;
  if (!centerId) {
    const center = check(
      await supabase.from('shopping_centers').insert({ name: input.newShoppingCenter.trim() }).select('id').single()
    );
    centerId = center.id;
  }
  return check(
    await supabase
      .from('stores')
      .insert({
        shopping_center_id: centerId,
        name: input.name.trim(),
        local_number: input.localNumber.trim() || null,
        contact_name: input.contactName.trim() || null,
        phone: input.phone.trim() || null
      })
      .select('id')
      .single()
  );
}

// ---------- Pares ----------

export async function listUnitsAtStore(storeId: string): Promise<Unit[]> {
  return check(
    await supabase
      .from('shoe_units')
      .select(UNIT_SELECT)
      .eq('store_id', storeId)
      .eq('status', 'prestado')
      .order('loaned_at', { ascending: true })
  ) as unknown as Unit[];
}

export async function findUnitByCode(code: string): Promise<Unit | null> {
  return check(
    await supabase.from('shoe_units').select(UNIT_SELECT).eq('code', code.trim().toUpperCase()).maybeSingle()
  ) as unknown as Unit | null;
}

export async function listUnitsByIds(ids: string[]): Promise<Unit[]> {
  return check(await supabase.from('shoe_units').select(UNIT_SELECT).in('id', ids).order('code')) as unknown as Unit[];
}

export async function listUnitsOfProduct(productId: string): Promise<Unit[]> {
  return check(
    await supabase.from('shoe_units').select(UNIT_SELECT).eq('product_id', productId).order('code')
  ) as unknown as Unit[];
}

export async function lendUnits(storeId: string, codes: string[]): Promise<number> {
  return check(await supabase.rpc('lend_units', { p_store_id: storeId, p_codes: codes }));
}

export async function settleVisit(input: {
  storeId: string;
  returned: string[];
  sold: string[];
  paymentMethod: PaymentMethod;
  notes: string;
}): Promise<{ returned: number; sold: number; sold_amount: number; credit_used: number; received: number }> {
  return check(
    await supabase.rpc('settle_visit', {
      p_store_id: input.storeId,
      p_returned: input.returned,
      p_sold: input.sold,
      p_payment_method: input.paymentMethod,
      p_notes: input.notes.trim() || null
    })
  );
}

// ---------- Productos e ingreso ----------

export async function listProductSummaries(): Promise<ProductSummary[]> {
  const products = check(
    await supabase.from('products').select('id, reference, brand, color, default_price, photo_url, shoe_units(status)').order('reference')
  ) as (Product & { shoe_units: { status: string }[] })[];

  return products.map(({ shoe_units, ...product }) => ({
    ...product,
    total: shoe_units.length,
    en_bodega: shoe_units.filter((u) => u.status === 'en_bodega').length,
    prestado: shoe_units.filter((u) => u.status === 'prestado').length,
    vendido: shoe_units.filter((u) => u.status === 'vendido').length
  }));
}

export async function upsertProduct(input: {
  reference: string;
  brand: string;
  color: string;
  price: number;
}): Promise<Product> {
  const reference = input.reference.trim();
  const color = input.color.trim() || null;

  let query = supabase.from('products').select('id, reference, brand, color, default_price, photo_url').ilike('reference', reference);
  query = color ? query.ilike('color', color) : query.is('color', null);
  const existing = check(await query.maybeSingle()) as Product | null;
  if (existing) return existing;

  return check(
    await supabase
      .from('products')
      .insert({ reference, brand: input.brand.trim() || null, color, default_price: input.price })
      .select('id, reference, brand, color, default_price, photo_url')
      .single()
  );
}

export async function getProduct(id: string): Promise<Product> {
  return check(await supabase.from('products').select('id, reference, brand, color, default_price, photo_url').eq('id', id).single());
}

/** Devuelve cuántos pares en bodega cambiaron de precio. */
export async function updateProduct(input: {
  id: string;
  reference: string;
  brand: string;
  color: string;
  price: number;
  applyToStock: boolean;
}): Promise<number> {
  const result = await supabase.rpc('update_product', {
    p_product_id: input.id,
    p_reference: input.reference,
    p_brand: input.brand,
    p_color: input.color,
    p_price: input.price,
    p_apply_to_stock: input.applyToStock
  });
  if (result.error?.code === '23505') {
    throw new Error('Ya existe un modelo con esa referencia y color. Usa "Unir con otro modelo".');
  }
  return check(result);
}

/** Mueve los pares de `fromId` a `intoId` y borra `fromId`. */
export async function mergeProducts(fromId: string, intoId: string): Promise<number> {
  return check(await supabase.rpc('merge_products', { p_from: fromId, p_into: intoId }));
}

const PHOTO_BUCKET = 'product-photos';

/** Reduce la foto en el navegador (máx. 800 px, JPEG) y la sube. */
export async function uploadProductPhoto(productId: string, file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))), 'image/jpeg', 0.82)
  );

  const path = `${productId}/${Date.now()}.jpg`;
  const upload = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (upload.error) throw new Error(upload.error.message);

  const url = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  const previous = check(await supabase.from('products').select('photo_url').eq('id', productId).single()) as { photo_url: string | null };
  check(await supabase.from('products').update({ photo_url: url }).eq('id', productId));
  if (previous.photo_url) await removeStoredPhoto(previous.photo_url);
  return url;
}

export async function removeProductPhoto(productId: string, url: string) {
  check(await supabase.from('products').update({ photo_url: null }).eq('id', productId));
  await removeStoredPhoto(url);
}

async function removeStoredPhoto(url: string) {
  const path = url.split(`/${PHOTO_BUCKET}/`)[1];
  // Si falla, solo queda un archivo huérfano: no bloquea al usuario.
  if (path) await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

export async function registerIntake(productId: string, sizes: string[], price: number): Promise<{ id: string }[]> {
  return check(await supabase.rpc('register_intake', { p_product_id: productId, p_sizes: sizes, p_price: price }));
}

// ---------- Pagos ----------

/** Abono suelto a la cuenta del local (fuera de una recogida). */
export async function registerAbono(input: { storeId: string; amount: number; method: PaymentMethod; notes: string }) {
  check(
    await supabase.from('payments').insert({
      store_id: input.storeId,
      amount: input.amount,
      method: input.method,
      kind: 'abono',
      notes: input.notes.trim() || null
    })
  );
}

export async function listPayments(storeId?: string, limit = 50): Promise<Payment[]> {
  let query = supabase
    .from('payments')
    .select('id, store_id, amount, method, kind, notes, created_at, store:stores(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (storeId) query = query.eq('store_id', storeId);
  return check(await query) as unknown as Payment[];
}

// ---------- Movimientos ----------

export async function listMovements(filters: { storeId?: string; type?: MovementType; limit?: number } = {}): Promise<Movement[]> {
  let query = supabase
    .from('movements')
    .select(MOVEMENT_SELECT)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 100);
  if (filters.storeId) query = query.eq('store_id', filters.storeId);
  if (filters.type) query = query.eq('type', filters.type);
  return check(await query) as unknown as Movement[];
}

// ---------- Resumen del día ----------

export async function getTodaySummary() {
  const since = startOfTodayBogota();
  const [movements, payments, inStock] = await Promise.all([
    supabase.from('movements').select('type, amount').gte('created_at', since).in('type', ['prestamo', 'devolucion', 'venta']),
    supabase.from('payments').select('amount').gte('created_at', since),
    supabase.from('shoe_units').select('id', { count: 'exact', head: true }).eq('status', 'en_bodega')
  ]);
  const rows = check(movements) as { type: MovementType; amount: number | null }[];
  const paid = check(payments) as { amount: number }[];
  if (inStock.error) throw new Error(inStock.error.message);

  return {
    lentToday: rows.filter((r) => r.type === 'prestamo').length,
    returnedToday: rows.filter((r) => r.type === 'devolucion').length,
    soldToday: rows.filter((r) => r.type === 'venta').length,
    collectedToday: paid.reduce((sum, p) => sum + Number(p.amount), 0),
    inStock: inStock.count ?? 0
  };
}

// ---------- Sesión ----------

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Correo o contraseña incorrectos.');
}

export async function signOut() {
  await supabase.auth.signOut();
}
