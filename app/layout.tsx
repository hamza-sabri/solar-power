import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AppShell } from './components/AppShell';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono  = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
    title: 'Solar — Qalqiliya',
    description: 'Live home-solar + grid dashboard',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    viewportFit: 'cover',
    themeColor: '#0b1018',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${inter.variable} ${mono.variable}`} style={{ colorScheme: 'dark' }}>
            <body className="font-sans bg-ink text-fg">
                <AppShell>{children}</AppShell>
            </body>
        </html>
    );
}
