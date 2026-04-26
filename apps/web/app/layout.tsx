import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Wakacje Aggregator — Porównaj oferty biur podróży',
  description: 'Porównaj oferty all-inclusive z R.pl, Exim Tours, Coral Travel, Itaka, Grecos i TUI. Filtruj po hotelu, terminie, lotnisku i ocenach.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" className={inter.variable}>
      <body>
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              {/* Logo */}
              <a href="/" className="flex items-center gap-2 font-bold text-blue-600 text-lg">
                <span className="text-2xl">✈</span>
                <span>Wakacje</span>
              </a>

              {/* Desktop nav */}
              <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
                <a href="/" className="hover:text-slate-900 transition-colors">Szukaj</a>
                <a href="/compare" className="hover:text-slate-900 transition-colors">Porównaj</a>
                <a href="/history" className="hover:text-slate-900 transition-colors">Historia</a>
                <a href="/map" className="hover:text-slate-900 transition-colors">Mapa</a>
              </nav>

              {/* Mobile nav */}
              <nav className="flex sm:hidden items-center gap-4 text-sm font-medium text-slate-600">
                <a href="/" className="hover:text-slate-900">Szukaj</a>
                <a href="/compare" className="hover:text-slate-900">Porównaj</a>
                <a href="/map" className="hover:text-slate-900">Mapa</a>
              </nav>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        <footer className="border-t border-slate-200 mt-12 py-6 text-center text-xs text-slate-400">
          Wakacje Aggregator — dane pobierane z publicznych serwisów biur podróży
        </footer>
      </body>
    </html>
  );
}
