'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../src/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError('Correo o contraseña incorrectos.');
      setLoading(false);
      return;
    }

    router.replace('/inventory');
  }

  return (
    <section className="auth-shell">
      <div className="auth-panel">
        <p className="eyebrow">SMART INVENTORY</p>
        <h1>Iniciar sesión</h1>
        <p className="muted">Acceso para el equipo interno de bodega.</p>
        <form onSubmit={handleSubmit} className="stack-form">
          <label>
            Correo
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Contraseña
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Validando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </section>
  );
}
