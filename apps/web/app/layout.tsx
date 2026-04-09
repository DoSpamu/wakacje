import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wakacje Aggregator — Porównaj oferty biur podróży',
  description: 'Porównaj oferty all-inclusive z R.pl, Exim Tours, Coral Travel, Itaka, Grecos i TUI. Filtruj po hotelu, terminie, lotnisku i ocenach.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              <a href="/" className="flex items-center gap-2 font-bold text-blue-600 text-lg">
                <span className="text-2xl">✈</span>
                <span>Wakacje</span>
              </a>
              <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-600">
                <a href="/" className="hover:text-slate-900 transition-colors">Szukaj</a>
                <a href="/compare" className="hover:text-slate-900 transition-colors">Porównaj</a>
                <a href="/history" className="hover:text-slate-900 transition-colors">Historia</a>
              </nav>
              <div className="flex items-center gap-2">
                <a href="/history" className="btn-secondary text-xs hidden sm:inline-flex">
                  Historia scrapów
                </a>
              </div>
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
