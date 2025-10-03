import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { PublicSiteSettings } from '../types';
import { DEFAULT_PRIVACY_POLICY } from '../lib/defaultPrivacyPolicy';

type SettingsContextValue = {
  settings: PublicSiteSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  applyTheme: (next: PublicSiteSettings | null) => void;
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const defaultTheme: PublicSiteSettings = {
  primaryColor: '#dc2626',
  primaryColorDark: '#b91c1c',
  accentColor: '#f97316',
  brandMotto: 'Mit Leidenschaft für unseren Verein.',
  navTitle: 'Genner Gibelguuger',
  navSubtitle: 'Mitgliederbereich',
  targetAmount: 100,
  goalDeadline: null,
  welcomeMessage: 'Herzlich willkommen beim Genner Gibelguuger!',
  successMessage: 'Danke für deinen Beitrag! Gemeinsam erreichen wir unser Ziel.',
  versionLabel: 'v1.0.0',
  updateLog: [],
  legalContact: '',
  privacyPolicy: DEFAULT_PRIVACY_POLICY,
  loginLogo: null,
  loginLogoColor: '#dc2626',
  loginLogoSize: 96,
  landingCtaTitle: 'Jetzt Beitrag erfassen',
  landingCtaBody: 'Unterstütze unser gemeinsames Ziel und erfasse deinen Beitrag in wenigen Schritten.',
  landingCtaButtonLabel: 'Beitrag sammeln',
  landingCtaButtonUrl: '/dashboard/collect',
  footerText: '© {{year}} Genner Gibelguuger. Alle Rechte vorbehalten.',
  footerLinks: [],
  socialLinks: [],
  formConfiguration: {
    fields: {
      email: 'required',
      address: 'required',
      city: 'required',
      postal_code: 'required',
      phone: 'optional'
    },
    consentText: null,
    consentRequired: false,
    amountPresets: [20, 40]
  },
  backgroundStyle: {
    gradient: 'linear-gradient(135deg, rgba(220,38,38,0.92) 0%, rgba(17,24,39,0.94) 65%)',
    imageUrl: null,
    overlayColor: 'rgba(0,0,0,0.6)',
    overlayOpacity: 0.65
  },
  featureFlags: {
    leaderboard: false,
    healthMonitor: false
  }
};

const setCssVariables = (data: PublicSiteSettings) => {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty('--primary-color', data.primaryColor);
  root.style.setProperty('--primary-color-dark', data.primaryColorDark);
  root.style.setProperty('--accent-color', data.accentColor);
  root.style.setProperty('--logo-color', data.loginLogoColor ?? data.primaryColor);
  root.style.setProperty('--target-amount', `${data.targetAmount}`);
  const backgroundGradient = data.backgroundStyle?.gradient || defaultTheme.backgroundStyle.gradient || '';
  const overlayColor = data.backgroundStyle?.overlayColor || defaultTheme.backgroundStyle.overlayColor || 'rgba(0,0,0,0.6)';
  const overlayOpacity =
    typeof data.backgroundStyle?.overlayOpacity === 'number'
      ? data.backgroundStyle.overlayOpacity
      : defaultTheme.backgroundStyle.overlayOpacity ?? 0.65;
  root.style.setProperty('--background-gradient', backgroundGradient ?? '');
  root.style.setProperty('--background-overlay-color', overlayColor ?? 'rgba(0,0,0,0.6)');
  root.style.setProperty('--background-overlay-opacity', `${overlayOpacity}`);
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PublicSiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyTheme = useCallback((next: PublicSiteSettings | null) => {
    setCssVariables(next ?? defaultTheme);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPublicSettings();
      const normalizedBackground = {
        ...defaultTheme.backgroundStyle,
        ...(data.backgroundStyle ?? {})
      } as PublicSiteSettings['backgroundStyle'];

      const normalizedFormConfiguration = {
        ...defaultTheme.formConfiguration,
        ...(data.formConfiguration ?? {}),
        fields: {
          ...defaultTheme.formConfiguration.fields,
          ...(data.formConfiguration?.fields ?? {})
        }
      } satisfies PublicSiteSettings['formConfiguration'];

      const normalized = {
        ...defaultTheme,
        ...data,
        privacyPolicy:
          data.privacyPolicy && data.privacyPolicy.trim().length > 0
            ? data.privacyPolicy
            : DEFAULT_PRIVACY_POLICY,
        brandMotto:
          data.brandMotto && data.brandMotto.trim().length > 0
            ? data.brandMotto
            : defaultTheme.brandMotto,
        navTitle:
          data.navTitle && data.navTitle.trim().length > 0
            ? data.navTitle
            : defaultTheme.navTitle,
        navSubtitle:
          data.navSubtitle && data.navSubtitle.trim().length > 0
            ? data.navSubtitle
            : defaultTheme.navSubtitle,
        loginLogo: data.loginLogo ?? null,
        loginLogoColor:
          data.loginLogoColor && data.loginLogoColor.trim().length > 0
            ? data.loginLogoColor
            : (data.primaryColor ?? defaultTheme.loginLogoColor),
        loginLogoSize: Number.isFinite(data.loginLogoSize) ? data.loginLogoSize : defaultTheme.loginLogoSize,
        footerLinks: Array.isArray(data.footerLinks) ? data.footerLinks : defaultTheme.footerLinks,
        socialLinks: Array.isArray(data.socialLinks) ? data.socialLinks : defaultTheme.socialLinks,
        landingCtaTitle:
          data.landingCtaTitle && data.landingCtaTitle.trim().length > 0
            ? data.landingCtaTitle
            : defaultTheme.landingCtaTitle,
        landingCtaBody:
          data.landingCtaBody && data.landingCtaBody.trim().length > 0
            ? data.landingCtaBody
            : defaultTheme.landingCtaBody,
        landingCtaButtonLabel:
          data.landingCtaButtonLabel && data.landingCtaButtonLabel.trim().length > 0
            ? data.landingCtaButtonLabel
            : defaultTheme.landingCtaButtonLabel,
        landingCtaButtonUrl:
          data.landingCtaButtonUrl && data.landingCtaButtonUrl.trim().length > 0
            ? data.landingCtaButtonUrl
            : defaultTheme.landingCtaButtonUrl,
        footerText:
          data.footerText && data.footerText.trim().length > 0
            ? data.footerText
            : defaultTheme.footerText,
        formConfiguration: normalizedFormConfiguration,
        backgroundStyle: normalizedBackground,
        featureFlags: {
          ...defaultTheme.featureFlags,
          ...(data.featureFlags ?? {})
        }
      } satisfies PublicSiteSettings;
      setSettings(normalized);
      applyTheme(normalized);
    } catch (err) {
      console.error('Failed to load settings', err);
      setError('Website Einstellungen konnten nicht geladen werden');
      setSettings(defaultTheme);
      applyTheme(defaultTheme);
    } finally {
      setLoading(false);
    }
  }, [applyTheme]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (!settings) {
      applyTheme(defaultTheme);
    }
  }, [settings, applyTheme]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings: settings ?? defaultTheme,
      loading,
      error,
      refresh: loadSettings,
      applyTheme
    }),
    [settings, loading, error, loadSettings, applyTheme]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
