import { supabase } from './supabaseClient';

export type InventoryStatus = 'available' | 'loaned' | 'sold';

export type InventoryUnit = {
  id: string;
  qr_code: string;
  status: InventoryStatus;
  price: number | null;
  product: {
    reference: string;
  } | null;
};

export async function listInventory(): Promise<InventoryUnit[]> {
  const { data, error } = await supabase
    .from('shoe_units')
    .select('id, qr_code, status, price, product:products(reference)')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`No se pudo cargar el inventario: ${error.message}`);
  }

  return (data ?? []).map((unit) => ({
    ...unit,
    status: unit.status as InventoryStatus,
    product: Array.isArray(unit.product) ? unit.product[0] ?? null : unit.product
  })) as InventoryUnit[];
}

export type StoreOption = { id: string; name: string };

export async function listStores(): Promise<StoreOption[]> {
  const { data, error } = await supabase.from('stores').select('id, name').order('name');
  if (error) throw new Error(`No se pudieron cargar los locales: ${error.message}`);
  return data ?? [];
}

export async function registerLoanBatch(storeId: string, qrCodes: string[]) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('La sesión no está activa. Inicia sesión nuevamente.');

  const uniqueCodes = [...new Set(qrCodes.map((code) => code.trim()).filter(Boolean))];
  if (uniqueCodes.length === 0) throw new Error('Agrega al menos un código QR.');

  const { data: units, error: unitsError } = await supabase
    .from('shoe_units')
    .select('id, qr_code, status, current_location_id')
    .in('qr_code', uniqueCodes);
  if (unitsError) throw new Error(`No se pudieron validar los QR: ${unitsError.message}`);

  const foundCodes = new Set((units ?? []).map((unit) => unit.qr_code));
  const missingCodes = uniqueCodes.filter((code) => !foundCodes.has(code));
  if (missingCodes.length > 0) throw new Error(`QR no encontrados: ${missingCodes.join(', ')}`);

  const unavailable = (units ?? []).filter((unit) => unit.status !== 'available' || unit.current_location_id);
  if (unavailable.length > 0) {
    throw new Error(`Estos pares no están disponibles: ${unavailable.map((unit) => unit.qr_code).join(', ')}`);
  }

  const { data: existingLocation, error: locationLookupError } = await supabase
    .from('store_locations')
    .select('id')
    .eq('store_id', storeId)
    .eq('type', 'prestamo')
    .maybeSingle();
  if (locationLookupError) throw new Error(`No se pudo buscar la ubicación: ${locationLookupError.message}`);

  let locationId = existingLocation?.id;
  if (!locationId) {
    const { data: location, error: locationError } = await supabase
      .from('store_locations')
      .insert({ store_id: storeId, type: 'prestamo', name: 'Préstamo diario' })
      .select('id')
      .single();
    if (locationError || !location) throw new Error(`No se pudo crear la ubicación: ${locationError?.message ?? 'respuesta vacía'}`);
    locationId = location.id;
  }

  const { error: updateError } = await supabase
    .from('shoe_units')
    .update({ status: 'loaned', current_location_id: locationId })
    .in('id', (units ?? []).map((unit) => unit.id));
  if (updateError) throw new Error(`No se pudieron actualizar los pares: ${updateError.message}`);

  const { error: movementError } = await supabase.from('movements').insert(
    (units ?? []).map((unit) => ({
      shoe_unit_id: unit.id,
      type: 'salida' as const,
      location_id: locationId,
      created_by: userData.user.id
    }))
  );
  if (movementError) throw new Error(`Los pares se actualizaron, pero falló el historial: ${movementError.message}`);

  return units ?? [];
}

export async function registerEntry(input: {
  reference: string;
  quantity: number;
  price: number | null;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('La sesión no está activa. Inicia sesión antes de registrar pares.');
  }

  const { data: existingProduct, error: productLookupError } = await supabase
    .from('products')
    .select('id')
    .eq('reference', input.reference)
    .maybeSingle();

  if (productLookupError) {
    throw new Error(`No se pudo buscar el producto: ${productLookupError.message}`);
  }

  let productId = existingProduct?.id;
  if (!productId) {
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({ reference: input.reference, default_price: input.price })
      .select('id')
      .single();

    if (productError || !product) {
      throw new Error(`No se pudo crear el producto: ${productError?.message ?? 'respuesta vacía'}`);
    }
    productId = product.id;
  }

  const units = Array.from({ length: input.quantity }, () => ({
    product_id: productId,
    qr_code: `SHU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    price: input.price,
    status: 'available' as const
  }));

  const { data: createdUnits, error: unitsError } = await supabase
    .from('shoe_units')
    .insert(units)
    .select('id, qr_code');

  if (unitsError || !createdUnits) {
    throw new Error(`No se pudieron registrar los pares: ${unitsError?.message ?? 'respuesta vacía'}`);
  }

  const movements = createdUnits.map((unit) => ({
    shoe_unit_id: unit.id,
    type: 'ingreso' as const,
    created_by: userData.user.id
  }));
  const { error: movementsError } = await supabase.from('movements').insert(movements);

  if (movementsError) {
    throw new Error(`Los pares se crearon, pero falló el historial: ${movementsError.message}`);
  }

  return createdUnits;
}
