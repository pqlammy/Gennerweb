import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { renderMarkdownDocument } from '../lib/markdown';
import { DEFAULT_PRIVACY_POLICY } from '../lib/defaultPrivacyPolicy';

export function PrivacyPolicy() {
  const navigate = useNavigate();
  const { settings } = useSettings();

  const gradientStyle = useMemo(
    () => ({
      background: `linear-gradient(135deg, ${settings.primaryColorDark} 0%, rgba(0, 0, 0, 0.92) 65%)`
    }),
    [settings.primaryColorDark]
  );

  const policyMarkdown = useMemo(() => {
    const value = settings.privacyPolicy?.trim();
    return value && value.length > 0 ? value : DEFAULT_PRIVACY_POLICY;
  }, [settings.privacyPolicy]);

  const policyHtml = useMemo(() => renderMarkdownDocument(policyMarkdown), [policyMarkdown]);

  return (
    <div className="min-h-screen" style={gradientStyle}>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate(-1)}
          className="mb-8 flex items-center text-gray-300 transition-colors hover:text-white"
        >
          <ArrowLeft className="mr-2 h-5 w-5" />
          Zurück
        </button>

        <div className="space-y-6 rounded-2xl bg-white/10 p-8 shadow-xl backdrop-blur-lg">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold text-white">Datenschutzerklärung</h1>
            <p className="text-sm text-gray-300">Stand: {new Date().toLocaleDateString('de-CH')}</p>
          </header>

          <section className="space-y-4 text-sm leading-relaxed text-gray-200">
            {policyHtml ? (
              <div className="privacy-content space-y-4" dangerouslySetInnerHTML={{ __html: policyHtml }} />
            ) : (
              <p>Die Datenschutzerklärung ist derzeit nicht verfügbar.</p>
            )}
          </section>

          {settings.legalContact && settings.legalContact.trim().length > 0 && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-gray-200">
              <h2 className="text-lg font-semibold text-white">Kontakt</h2>
              <p className="mt-2 whitespace-pre-line">{settings.legalContact}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
