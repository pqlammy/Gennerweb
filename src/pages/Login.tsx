import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import { LogIn } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { Footer } from '../components/Footer';

const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'Benutzername muss mindestens 3 Zeichen lang sein')
    .regex(/^[a-z0-9_.-]+$/i, 'Nur Buchstaben, Zahlen sowie ._- sind erlaubt'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function Login() {
  const { signIn } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError('');
      const { error: authError } = await signIn(data.username, data.password);
      
      if (authError) throw authError;

      // Check if admin
      navigate('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      setError('Ungültiger Benutzername oder Passwort');
    }
  };

  const navTitle = settings?.navTitle?.trim().length ? settings.navTitle.trim() : 'Genner Gibelguuger';
  const navSubtitle = settings?.navSubtitle?.trim() ?? '';
  const brandMotto = settings?.brandMotto?.trim() ?? '';

  const backgroundGradient = useMemo(
    () => (
      settings.backgroundStyle?.gradient?.trim()?.length
        ? settings.backgroundStyle.gradient
        : 'var(--background-gradient)'
    ),
    [settings.backgroundStyle?.gradient]
  );
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

  const customLogo = settings.loginLogo?.trim() ?? '';
  const customLogoLower = customLogo.toLowerCase();
  const customLogoIsSvg = customLogoLower.startsWith('<svg');
  const customLogoIsImageSource = customLogoLower.startsWith('data:image/') || /^https?:\/\//i.test(customLogo);
  const rawLogoSize = Number.isFinite(settings.loginLogoSize) ? settings.loginLogoSize : 96;
  const logoSize = Math.min(Math.max(rawLogoSize, 48), 220);
  const logoColor = settings.loginLogoColor && settings.loginLogoColor.trim().length > 0
    ? settings.loginLogoColor
    : settings.primaryColor;

  const renderLogo = () => {
    if (!customLogo) {
      return (
        <LogIn aria-hidden className="h-16 w-16" style={{ color: logoColor }} />
      );
    }

    if (customLogoIsSvg) {
      return (
        <div
          className="inline-flex items-center justify-center [&_svg]:h-full [&_svg]:w-full [&_svg_path]:fill-current [&_svg_path]:stroke-current"
          style={{ height: logoSize, width: 'auto', maxWidth: '100%', color: logoColor }}
          aria-hidden
          dangerouslySetInnerHTML={{ __html: customLogo }}
        />
      );
    }

    if (customLogoIsImageSource) {
      return (
        <img
          src={customLogo}
          alt={`${navTitle} Logo`}
          className="object-contain"
          style={{ maxHeight: logoSize, width: 'auto' }}
        />
      );
    }

    return <LogIn aria-hidden className="h-16 w-16" style={{ color: logoColor }} />;
  };

  return (
    <div className="relative flex min-h-screen flex-col" style={{ background: backgroundGradient }}>
      {backgroundImage && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={overlayStyle} />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6 rounded-2xl bg-white/10 p-8 shadow-2xl backdrop-blur-xl">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex items-center justify-center" style={{ maxHeight: logoSize }}>
              {renderLogo()}
              <span className="sr-only">{navTitle} Logo</span>
            </div>
            <h1 className="text-3xl font-bold text-white">{navTitle}</h1>
            {navSubtitle && <p className="text-sm text-gray-200">{navSubtitle}</p>}
            {brandMotto && <p className="text-xs text-gray-400">{brandMotto}</p>}
            <p className="text-sm text-gray-300">Bitte melde dich mit deinen Zugangsdaten an.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300">
                Benutzername
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                {...register('username')}
                className="mt-1 block w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                placeholder="z.B. genner"
              />
              {errors.username && (
                <p className="mt-1 text-sm text-red-400">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                Passwort
              </label>
              <input
                id="password"
                type="password"
                {...register('password')}
                className="mt-1 block w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-500/80 bg-red-500/10 p-3">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-[var(--primary-color)] px-4 py-2 text-white transition-colors hover:bg-[var(--primary-color-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-black/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Wird angemeldet…' : 'Anmelden'}
            </button>
          </form>
        </div>
      </main>
      <div className="relative z-10 px-4 pb-6">
        <Footer disableVersionHistory />
      </div>
    </div>
  );
}
