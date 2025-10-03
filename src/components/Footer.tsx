import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Clock,
  History,
  X,
  Globe2,
  Link2,
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  Youtube,
  Mail
} from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { renderMarkdownDocument, renderMarkdownInline } from '../lib/markdown';

type FooterProps = {
  disableVersionHistory?: boolean;
};

const formatDate = (value: string | null) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString('de-CH', { year: 'numeric', month: 'short', day: 'numeric' });
};

export function Footer({ disableVersionHistory = false }: FooterProps = {}) {
  const { settings } = useSettings();
  const [showLog, setShowLog] = useState(false);

  const updateLogEntries = useMemo(() => settings.updateLog.slice().reverse(), [settings.updateLog]);

  const currentYear = new Date().getFullYear();
  const footerText = useMemo(() => {
    const raw = settings.footerText?.trim();
    if (!raw) {
      return `© ${currentYear} ${settings.navTitle || 'Genner Gibelguuger'}`;
    }

    const replacements: Record<string, string> = {
      year: `${currentYear}`,
      title: settings.navTitle ?? '',
      navTitle: settings.navTitle ?? '',
      subtitle: settings.navSubtitle ?? '',
      navSubtitle: settings.navSubtitle ?? '',
      motto: settings.brandMotto ?? '',
      brandMotto: settings.brandMotto ?? ''
    };

    return raw.replace(/\{\{\s*(\w+)\s*}}/g, (_, key: string) => {
      const normalizedKey = key.trim();
      return Object.prototype.hasOwnProperty.call(replacements, normalizedKey)
        ? replacements[normalizedKey]
        : '';
    });
  }, [settings.footerText, settings.navTitle, settings.navSubtitle, settings.brandMotto, currentYear]);

  const socialIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    facebook: Facebook,
    instagram: Instagram,
    linkedin: Linkedin,
    twitter: Twitter,
    youtube: Youtube,
    mail: Mail,
    email: Mail,
    website: Globe2,
    globe: Globe2
  };

  const resolveSocialIcon = (icon?: string | null) => {
    if (!icon) {
      return Link2;
    }
    const normalized = icon.toLowerCase().trim();
    return socialIconMap[normalized] ?? Link2;
  };

  return (
    <footer className="mt-12 border-t border-white/10 pt-6 pb-10 text-sm text-gray-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="whitespace-pre-line text-gray-200">{footerText}</p>
          {settings.legalContact && (
            <p className="text-xs text-gray-400 whitespace-pre-line">{settings.legalContact}</p>
          )}
        </div>
        <div className="flex flex-col items-start gap-4 sm:items-end">
          {(settings.footerLinks?.length ?? 0) > 0 && (
            <div className="flex flex-wrap justify-end gap-3 text-sm">
              {settings.footerLinks.map((link) => {
                const href = link.url?.trim();
                const label = link.label?.trim() || href;
                if (!href) {
                  return null;
                }
                const isInternal = href.startsWith('/');
                return isInternal ? (
                  <Link key={`${label}-${href}`} to={href} className="hover:text-white transition-colors">
                    {label}
                  </Link>
                ) : (
                  <a
                    key={`${label}-${href}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-4">
            <Link to="/privacy" className="hover:text-white transition-colors">
              Datenschutz
            </Link>
            {disableVersionHistory ? (
              <span className="inline-flex items-center gap-1 text-gray-400">
                <History className="w-4 h-4" aria-hidden /> Version {settings.versionLabel}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowLog(true)}
                className="inline-flex items-center gap-1 hover:text-white transition-colors"
              >
                <History className="w-4 h-4" /> Version {settings.versionLabel}
              </button>
            )}
          </div>
          {(settings.socialLinks?.length ?? 0) > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {settings.socialLinks.map((link) => {
                const href = link.url?.trim();
                const label = link.label?.trim() || href;
                if (!href) {
                  return null;
                }
                const Icon = resolveSocialIcon(link.icon ?? label);
                return (
                  <a
                    key={`${label}-${href}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs text-gray-200 transition-colors hover:border-white/40 hover:text-white"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!disableVersionHistory && (
        <AnimatePresence>
          {showLog && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
          >
            <motion.div
              className="relative w-full max-w-2xl bg-slate-950/95 border border-white/10 rounded-2xl p-6 text-white shadow-2xl"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <button
                type="button"
                onClick={() => setShowLog(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
                aria-label="Schließen"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-[var(--accent-color)]" />
                <h2 className="text-xl font-semibold">Update-Log</h2>
              </div>
              {updateLogEntries.length === 0 ? (
                <p className="text-sm text-gray-300">Noch keine Einträge vorhanden.</p>
              ) : (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  {updateLogEntries.map((entry) => (
                    <div key={`${entry.version}-${entry.date ?? 'na'}`} className="rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-lg font-semibold">Version {entry.version}</span>
                        {entry.date && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-300">
                            <Clock className="w-3 h-3" />
                            {formatDate(entry.date)}
                          </span>
                        )}
                      </div>
                      {entry.changes.length > 0 && (() => {
                        const markdown = entry.changes.join('\n').trim();
                        if (markdown.length === 0) {
                          return null;
                        }
                        const html = renderMarkdownDocument(markdown)
                          || `<p class="leading-relaxed">${renderMarkdownInline(markdown)}</p>`;

                        return (
                          <div
                            className="mt-3 space-y-2 text-sm text-gray-200"
                            dangerouslySetInnerHTML={{ __html: html }}
                          />
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </footer>
  );
}
