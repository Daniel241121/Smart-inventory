import './globals.css';

export const metadata = {
  title: 'Smart Inventory',
  description: 'Gestor de inventario y préstamos'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <main style={{ padding: 20 }}>{children}</main>
      </body>
    </html>
  );
}
