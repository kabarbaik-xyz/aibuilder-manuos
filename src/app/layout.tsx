import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ManuOS · Manufacturing Orchestration System',
  description: 'ManuOS interactive prototype for manufacturing operations, recovery studio, and factory network.',
  icons: {
    icon: '/assets/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#f5f7fb" />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
