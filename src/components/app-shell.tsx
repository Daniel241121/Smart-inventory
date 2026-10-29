'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowDownToLine, ArrowUpFromLine, Boxes, History, LayoutDashboard, LogOut, Store } from 'lucide-react';
import type { ReactNode } from 'react';
import { signOut } from '@/lib/api';
import { cn } from './ui';

const NAV = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/locales', label: 'Locales', icon: Store },
  { href: '/prestar', label: 'Prestar', icon: ArrowUpFromLine },
  { href: '/recoger', label: 'Recoger', icon: ArrowDownToLine },
  { href: '/inventario', label: 'Inventario', icon: Boxes },
  { href: '/movimientos', label: 'Historial', icon: History }
];

// En celular solo caben 5 pestañas: el historial queda dentro de cada local.
const MOBILE_NAV = NAV.filter((item) => item.href !== '/movimientos');

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <Logo />
          <div>
            <p className="text-sm font-semibold text-slate-900">Smart Inventory</p>
            <p className="text-xs text-slate-500">Bodega de tenis</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive(pathname, href) ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <button
          onClick={handleSignOut}
          className="m-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </aside>

      {/* Barra superior (celular) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-sm font-semibold text-slate-900">Smart Inventory</span>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/movimientos" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Historial">
            <History className="h-5 w-5" />
          </Link>
          <button onClick={handleSignOut} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar sesión">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="px-4 pb-28 pt-5 sm:px-6 lg:ml-60 lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Navegación inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE_NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
              isActive(pathname, href) ? 'text-brand-600' : 'text-slate-500'
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">SI</div>
  );
}
