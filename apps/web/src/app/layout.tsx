import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'NeuroStudy — Tutor IA Adaptativo',
  description: 'Recupere matérias acumuladas com um tutor de IA que aprende como você aprende.',
  manifest: '/manifest.json',
  themeColor: '#6366f1',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NeuroStudy',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: { borderRadius: '12px', fontSize: '14px' },
            success: { iconTheme: { primary: '#6366f1', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  );
}
