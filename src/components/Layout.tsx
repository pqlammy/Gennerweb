import React, { useMemo } from 'react';
import { Navigation } from './Navigation';
import { Footer } from './Footer';
import { useSettings } from '../context/SettingsContext';

type LayoutProps = {
  children: React.ReactNode;
};

export function Layout({ children }: LayoutProps) {
  const { settings } = useSettings();

  const backgroundGradient = settings.backgroundStyle?.gradient?.trim()?.length
    ? settings.backgroundStyle.gradient
    : 'var(--background-gradient)';
  const backgroundImage = settings.backgroundStyle?.imageUrl?.trim()?.length
    ? settings.backgroundStyle.imageUrl
    : null;
  const overlayColor = settings.backgroundStyle?.overlayColor?.trim()?.length
    ? settings.backgroundStyle.overlayColor
    : 'var(--background-overlay-color)';
  const overlayOpacityFallback = useMemo(() => {
    if (typeof window === 'undefined') {
      return 0.65;
    }
    const raw = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--background-overlay-opacity')
    );
    return Number.isFinite(raw) ? raw : 0.65;
  }, []);
  const overlayOpacity = typeof settings.backgroundStyle?.overlayOpacity === 'number'
    ? Math.min(Math.max(settings.backgroundStyle.overlayOpacity, 0), 1)
    : overlayOpacityFallback;

  const overlayStyle = useMemo(
    () => ({
      backgroundColor: overlayColor,
      opacity: overlayOpacity
    }),
    [overlayColor, overlayOpacity]
  );

  return (
    <div className="relative min-h-screen" style={{ background: backgroundGradient }}>
      {backgroundImage && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={overlayStyle} />

      <div className="relative z-10 flex min-h-screen flex-col">
        <Navigation />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-28 sm:px-6 lg:px-8">
          {children}
        </main>
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <Footer />
        </div>
      </div>
    </div>
  );
}
