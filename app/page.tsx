import Link from 'next/link';

export default function Home() {
  return (
    <section className="page-shell intro-shell">
      <p className="eyebrow">SMART INVENTORY</p>
      <h1>Controla cada par.</h1>
      <p className="muted">Inventario, préstamos y movimientos en un solo lugar.</p>
      <Link className="button-link" href="/login">Entrar al sistema</Link>
    </section>
  );
}
