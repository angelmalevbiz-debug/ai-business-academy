import type { Metadata } from 'next';
import { brand } from '@/lib/brand';
import '@fontsource-variable/manrope';
import './globals.css';
import './evolution.css';
import './product-review.css';
import './reference.css';
import './premium.css';

export const metadata: Metadata = {
  title: `${brand.name} Community | AI обучение и практика`,
  description: brand.description,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="bg"><body>{children}</body></html>;
}
