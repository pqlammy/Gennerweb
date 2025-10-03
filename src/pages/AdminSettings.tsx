import React, { useEffect, useMemo, useState } from 'react';
import {
  Palette,
  Save,
  Plus,
  Trash2,
  ListChecks,
  Mail,
  Target,
  Loader2,
  ShieldCheck,
  Shield,
  KeyRound,
  Server,
  TerminalSquare,
  Database,
  ChevronDown,
  LogIn,
  Link2,
  Megaphone,
  Activity,
  RefreshCw
} from 'lucide-react';
import type {
  SiteSettings,
  UpdateLogEntry,
  PublicSiteSettings,
  FormFieldMode,
  ContributionFormFieldsConfig,
  FooterLink,
  SocialLink,
  FeatureFlags
} from '../types';
import { api } from '../lib/api';
import { useSettings } from '../context/SettingsContext';
import { MarkdownEditor } from '../components/MarkdownEditor';
import { EmailDesignEditor } from '../components/EmailDesignEditor';
import { DEFAULT_PRIVACY_POLICY } from '../lib/defaultPrivacyPolicy';
import { AnimatePresence, motion } from 'framer-motion';

type CollapsibleSectionProps = {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

function CollapsibleSection({ title, description, icon: Icon, open, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]"
      >
        <span className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-[var(--accent-color)]" />
          <span>
            {title}
            {description && <span className="block text-xs font-normal text-gray-400">{description}</span>}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden border-t border-white/10"
          >
            <div className="space-y-3 px-4 py-4 text-sm text-gray-200">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type SectionKey =
  | 'branding'
  | 'goals'
  | 'cta'
  | 'form'
  | 'mail'
  | 'modules'
  | 'footer'
  | 'updates'
  | 'legal'
  | 'privacy'
  | 'operations';

type UpdateInfo = {
  branch: string;
  updateAvailable: boolean;
  ahead: number;
  behind: number;
  localCommit: string;
  remoteCommit: string;
  instructions: string;
  lastCheckedAt: string;
};

const FORM_FIELD_DEFS: Array<{ field: keyof ContributionFormFieldsConfig; label: string; hint?: string }> = [
  { field: 'email', label: 'E-Mail-Adresse', hint: 'Pflicht für automatische Bestätigungsmails.' },
  { field: 'address', label: 'Adresse' },
  { field: 'city', label: 'Ort' },
  { field: 'postal_code', label: 'PLZ' },
  { field: 'phone', label: 'Telefon', hint: 'Optional für kurzfristige Rückfragen.' }
];

const FORM_FIELD_MODES: Array<{ value: FormFieldMode; label: string }> = [
  { value: 'required', label: 'Pflichtfeld' },
  { value: 'optional', label: 'Optional' },
  { value: 'hidden', label: 'Ausblenden' }
];

const toPublicSettings = (settings: SiteSettings): PublicSiteSettings => ({
  primaryColor: settings.primaryColor,
  primaryColorDark: settings.primaryColorDark,
  accentColor: settings.accentColor,
  brandMotto: settings.brandMotto,
  navTitle: settings.navTitle,
  navSubtitle: settings.navSubtitle,
  targetAmount: settings.targetAmount,
  goalDeadline: settings.goalDeadline,
  welcomeMessage: settings.welcomeMessage,
  successMessage: settings.successMessage,
  versionLabel: settings.versionLabel,
  updateLog: settings.updateLog,
  legalContact: settings.legalContact,
  privacyPolicy: settings.privacyPolicy,
  loginLogo: settings.loginLogo,
  loginLogoColor: settings.loginLogoColor,
  loginLogoSize: settings.loginLogoSize,
  landingCtaTitle: settings.landingCtaTitle,
  landingCtaBody: settings.landingCtaBody,
  landingCtaButtonLabel: settings.landingCtaButtonLabel,
  landingCtaButtonUrl: settings.landingCtaButtonUrl,
  footerText: settings.footerText,
  footerLinks: settings.footerLinks,
  socialLinks: settings.socialLinks,
  formConfiguration: settings.formConfiguration,
  backgroundStyle: settings.backgroundStyle,
  featureFlags: settings.featureFlags
});

const formatChanges = (entry: UpdateLogEntry) => entry.changes.join('\n');

const DEFAULT_EMAIL_TEMPLATE_SNIPPET = `
<div class="email-header">
  <h1>Danke für deinen Beitrag!</h1>
</div>
<p>Hallo {{firstName}} {{lastName}},</p>
<p>
  wir bestätigen dir den Eingang deines Beitrags über <strong>CHF {{amount}}</strong> via <strong>{{paymentMethod}}</strong>.
</p>
<p>
  Dein Beitrag wurde von {{gennervogt}} am {{createdAt}} erfasst. Gemeinsam erreichen wir unser Ziel von CHF {{targetAmount}}.
</p>
<p>
  {{successMessage}}
</p>
<p>Herzlichen Dank und bis bald!</p>
<p style="margin-top: 24px; font-weight: 600;">Genner Gibelguuger</p>
`;

const wrapUserTemplateClient = (
  markup: string,
  settings: Pick<SiteSettings, 'autoMailSubject' | 'primaryColor' | 'accentColor'>
) => {
  const trimmed = (markup ?? '').trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/<!DOCTYPE/i.test(trimmed) || /<html/i.test(trimmed)) {
    return trimmed;
  }

  const primaryColor = settings.primaryColor || '#dc2626';
  const accentColor = settings.accentColor || '#f97316';
  const subject = settings.autoMailSubject || 'Genner Gibelguuger';

  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>${subject}</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5; color: #111827; margin: 0; padding: 0; }
      .email-wrapper { width: 100%; padding: 24px 0; }
      .email-container { width: 100%; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 20px; box-shadow: 0 24px 48px rgba(15, 23, 42, 0.14); overflow: hidden; }
      .email-header {
        border-bottom: 4px solid ${accentColor};
        background: ${primaryColor};
        background-color: ${primaryColor};
        background-image: linear-gradient(135deg, ${primaryColor}, ${accentColor});
        background-repeat: no-repeat;
        background-size: cover;
        color: #ffffff;
        padding: 24px;
        text-align: center;
      }
      .email-header h1 { margin: 0; font-size: 24px; letter-spacing: 0.02em; }
      .email-content { padding: 32px 28px; }
      .email-content p { margin: 0 0 16px 0; line-height: 1.6; }
      .email-content ul { padding-left: 20px; margin: 0 0 16px 0; }
      .email-content li { margin: 6px 0; }
      .email-footer { padding: 20px 28px 28px; background: #f8fafc; color: #475569; font-size: 12px; text-align: center; }
      .email-footer p { margin: 6px 0; }
      .button { display: inline-block; background: ${accentColor}; color: #ffffff !important; text-decoration: none; padding: 12px 20px; border-radius: 999px; font-weight: 600; }
      @media (max-width: 600px) { .email-content { padding: 24px 20px; } }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <div class="email-container">
        <div class="email-header" style="background-color: ${primaryColor}; border-bottom: 4px solid ${accentColor}; background-image: linear-gradient(135deg, ${primaryColor}, ${accentColor}); background-repeat: no-repeat; background-size: cover;">
          <!--[if mso]>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${primaryColor};" bgcolor="${primaryColor}">
            <tr>
              <td align="center" style="padding:24px;">
          <![endif]-->
          <h1>${subject}</h1>
          <!--[if mso]>
              </td>
            </tr>
          </table>
          <![endif]-->
        </div>
        <div class="email-content">
          ${trimmed}
        </div>
        <div class="email-footer">
          <p>Diese Nachricht wurde automatisch generiert.</p>
          <p>Bitte antworte nicht auf dieses E-Mail.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
};

;

export function AdminSettings() {
  const { refresh, applyTheme } = useSettings();
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showMailGuide, setShowMailGuide] = useState(false);
  const [showSecurityOverview, setShowSecurityOverview] = useState(false);
  const [showKeyGuide, setShowKeyGuide] = useState(false);
  const [showDeploymentGuide, setShowDeploymentGuide] = useState(false);
  const [showBackupGuide, setShowBackupGuide] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [mailTemplateError, setMailTemplateError] = useState<string | null>(null);
  const [mailEditorMode, setMailEditorMode] = useState<'visual' | 'html'>('visual');
  const [newPresetAmount, setNewPresetAmount] = useState('');
  const [sectionOpen, setSectionOpen] = useState<Record<SectionKey, boolean>>({
    branding: false,
    goals: false,
    cta: false,
    form: false,
    mail: false,
    modules: false,
    footer: false,
    updates: false,
    legal: false,
    privacy: false,
    operations: false
  });
  const [updateStatus, setUpdateStatus] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const toggleSection = (key: SectionKey) => {
    setSectionOpen((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await api.getAdminSettings();
        setForm({
          ...data,
          privacyPolicy: data.privacyPolicy && data.privacyPolicy.trim().length > 0
            ? data.privacyPolicy
            : DEFAULT_PRIVACY_POLICY,
          loginLogo: data.loginLogo ?? null,
          loginLogoColor: data.loginLogoColor && data.loginLogoColor.trim().length > 0
            ? data.loginLogoColor
            : (data.primaryColor ?? '#dc2626'),
          loginLogoSize: Number.isFinite(data.loginLogoSize) ? data.loginLogoSize : 96,
          autoMailTemplate: data.autoMailTemplate ?? null,
          featureFlags: {
            leaderboard: data.featureFlags?.leaderboard ?? false,
            healthMonitor: data.featureFlags?.healthMonitor ?? false
          }
        });
        setLogoError(null);
        setMailTemplateError(null);
      } catch (err) {
        console.error('Failed to load admin settings', err);
        setError('Einstellungen konnten nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const updateLogDrafts = useMemo(() => form?.updateLog ?? [], [form]);

  useEffect(() => {
    if (!form) {
      return;
    }

    const latestVersion = form.updateLog
      .map((entry) => entry.version?.trim?.() ?? '')
      .filter((version) => version.length > 0)
      .at(-1);

    if (latestVersion && latestVersion !== form.versionLabel) {
      setForm((prev) => (prev ? { ...prev, versionLabel: latestVersion } : prev));
    }
  }, [form]);

  const handleFieldChange = (field: keyof SiteSettings, value: unknown) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleBackgroundStyleChange = (field: keyof SiteSettings['backgroundStyle'], value: unknown) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        backgroundStyle: {
          ...(prev.backgroundStyle ?? {}),
          [field]: value
        }
      };
    });
  };

  const handleFormFieldModeChange = (field: keyof ContributionFormFieldsConfig, mode: FormFieldMode) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        formConfiguration: {
          ...prev.formConfiguration,
          fields: {
            ...(prev.formConfiguration?.fields ?? {}),
            [field]: mode
          }
        }
      };
    });
  };

  const handleFeatureFlagToggle = (flag: keyof FeatureFlags, value: boolean) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        featureFlags: {
          ...prev.featureFlags,
          [flag]: value
        }
      };
    });
  };

  const handleConsentToggle = (consentRequired: boolean) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        formConfiguration: {
          ...prev.formConfiguration,
          consentRequired
        }
      };
    });
  };

  const handleConsentTextChange = (value: string) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        formConfiguration: {
          ...prev.formConfiguration,
          consentText: value.trim().length > 0 ? value : null
        }
      };
    });
  };

  const handleAmountPresetRemove = (index: number) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        formConfiguration: {
          ...prev.formConfiguration,
          amountPresets: prev.formConfiguration.amountPresets.filter((_, i) => i !== index)
        }
      };
    });
  };

  const handleAmountPresetAdd = () => {
    const parsed = Number.parseFloat(newPresetAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      if (prev.formConfiguration.amountPresets.length >= 8) {
        return prev;
      }
      if (prev.formConfiguration.amountPresets.includes(parsed)) {
        return prev;
      }
      return {
        ...prev,
        formConfiguration: {
          ...prev.formConfiguration,
          amountPresets: [...prev.formConfiguration.amountPresets, parsed].sort((a, b) => a - b)
        }
      };
    });
    setNewPresetAmount('');
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateError(null);
    try {
      const result = await api.checkUpdates();
      setUpdateStatus(result);
    } catch (err) {
      console.error('Update check failed', err);
      const message = err instanceof Error ? err.message : 'Update konnte nicht geprüft werden';
      setUpdateError(message);
      setUpdateStatus(null);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const updateBranchLabel = updateStatus?.branch ?? 'main';

  const handleFooterLinkChange = (index: number, field: keyof FooterLink, value: string) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      const nextLinks = prev.footerLinks.map((link, linkIndex) =>
        linkIndex === index
          ? {
              ...link,
              [field]: value
            }
          : link
      );
      return { ...prev, footerLinks: nextLinks };
    });
  };

  const handleAddFooterLink = () => {
    setForm((prev) => (
      prev
        ? {
            ...prev,
            footerLinks: [...prev.footerLinks, { label: '', url: '' } as FooterLink]
          }
        : prev
    ));
  };

  const handleRemoveFooterLink = (index: number) => {
    setForm((prev) => (
      prev
        ? {
            ...prev,
            footerLinks: prev.footerLinks.filter((_, linkIndex) => linkIndex !== index)
          }
        : prev
    ));
  };

  const handleSocialLinkChange = (index: number, field: keyof SocialLink, value: string | null) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      const nextLinks = prev.socialLinks.map((link, linkIndex) =>
        linkIndex === index
          ? {
              ...link,
              [field]: value
            }
          : link
      );
      return { ...prev, socialLinks: nextLinks };
    });
  };

  const handleAddSocialLink = () => {
    setForm((prev) => (
      prev
        ? {
            ...prev,
            socialLinks: [...prev.socialLinks, { label: '', url: '', icon: '' } as SocialLink]
          }
        : prev
    ));
  };

  const handleRemoveSocialLink = (index: number) => {
    setForm((prev) => (
      prev
        ? {
            ...prev,
            socialLinks: prev.socialLinks.filter((_, linkIndex) => linkIndex !== index)
          }
        : prev
    ));
  };

  const MAX_LOGO_BYTES = 120 * 1024;
  const MIN_LOGO_SIZE = 48;
  const MAX_LOGO_SIZE = 220;

  const handleLogoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setLogoError('Logo darf maximal 120 KB gross sein.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        setLogoError('Logo konnte nicht verarbeitet werden.');
        return;
      }

      const lowerName = file.name.toLowerCase();
      const isSvg = file.type === 'image/svg+xml' || lowerName.endsWith('.svg');
      const value = isSvg ? result.trim() : result;

      setLogoError(null);
      handleFieldChange('loginLogo', value);
    };
    reader.onerror = () => {
      setLogoError('Datei konnte nicht gelesen werden.');
    };

    const lowerName = file.name.toLowerCase();
    if (file.type === 'image/svg+xml' || lowerName.endsWith('.svg')) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  const handleLogoRemove = () => {
    setLogoError(null);
    handleFieldChange('loginLogo', null);
  };

  const handleLogoTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLogoError(null);
    handleFieldChange('loginLogo', event.target.value);
  };

  const handleUpdateLogChange = (index: number, update: Partial<UpdateLogEntry>) => {
    setForm((prev) => {
      if (!prev) {
        return prev;
      }
      const nextLog = prev.updateLog.map((entry, entryIndex) => {
        if (entryIndex !== index) {
          return entry;
        }
        return {
          ...entry,
          ...update,
          changes:
            update.changes !== undefined
              ? update.changes
              : entry.changes
        };
      });
      return { ...prev, updateLog: nextLog };
    });
  };

  const handleUpdateLogChangesText = (index: number, value: string) => {
    const changes = value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    handleUpdateLogChange(index, { changes });
  };

  const handleAddUpdateLogEntry = () => {
    setForm((prev) => (
      prev
        ? {
            ...prev,
            updateLog: [
              ...prev.updateLog,
              { version: '', date: null, changes: [] }
            ]
          }
        : prev
    ));
  };

  const handleRemoveUpdateLogEntry = (index: number) => {
    setForm((prev) => (
      prev
        ? {
            ...prev,
            updateLog: prev.updateLog.filter((_, entryIndex) => entryIndex !== index)
          }
        : prev
    ));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await api.updateSiteSettings(form);
      setForm(updated);
      setSuccess('Einstellungen gespeichert.');
      setLogoError(null);
      setMailTemplateError(null);
      applyTheme(toPublicSettings(updated));
      await refresh();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save settings', err);
      const message = err instanceof Error ? err.message : 'Speichern fehlgeschlagen';
      setError(message);
      if (typeof message === 'string' && message.toLowerCase().includes('vorlage')) {
        setMailTemplateError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!form) {
      return;
    }

    const trimmedTemplate = typeof form.autoMailTemplate === 'string' ? form.autoMailTemplate.trim() : '';
    const supported =
      trimmedTemplate.length === 0
      || (!/^<!DOCTYPE/i.test(trimmedTemplate) && !/^<html/i.test(trimmedTemplate));

    if (!supported && mailEditorMode === 'visual') {
      setMailEditorMode('html');
    }
  }, [form, mailEditorMode]);

  const emailPreviewHtml = useMemo(() => {
    const templateSource = typeof form?.autoMailTemplate === 'string' ? form.autoMailTemplate : '';
    const previewSettings: Pick<SiteSettings, 'autoMailSubject' | 'primaryColor' | 'accentColor'> = {
      autoMailSubject: form?.autoMailSubject ?? '',
      primaryColor: form?.primaryColor ?? '',
      accentColor: form?.accentColor ?? ''
    };
    const wrapped = wrapUserTemplateClient(templateSource, previewSettings);
    if (wrapped) {
      return wrapped;
    }
    return wrapUserTemplateClient(DEFAULT_EMAIL_TEMPLATE_SNIPPET, previewSettings);
  }, [form?.autoMailTemplate, form?.autoMailSubject, form?.primaryColor, form?.accentColor]);

  if (loading || !form) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex items-center space-x-3 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Lade Einstellungen...</span>
        </div>
      </div>
    );
  }

  const trimmedLogo = typeof form.loginLogo === 'string' ? form.loginLogo.trim() : '';
  const loweredLogo = trimmedLogo.toLowerCase();
  const isInlineSvgLogo = loweredLogo.startsWith('<svg');
  const isImageSourceLogo = loweredLogo.startsWith('data:image/') || /^https?:\/\//i.test(trimmedLogo);
  const previewSize = Math.min(Math.max(form.loginLogoSize ?? 96, MIN_LOGO_SIZE), MAX_LOGO_SIZE);
  const logoTint = form.loginLogoColor && form.loginLogoColor.trim().length > 0
    ? form.loginLogoColor
    : form.primaryColor;
  const trimmedMailTemplate = typeof form.autoMailTemplate === 'string' ? form.autoMailTemplate.trim() : '';
  const visualEditorSupported =
    trimmedMailTemplate.length === 0
    || (!/^<!DOCTYPE/i.test(trimmedMailTemplate) && !/^<html/i.test(trimmedMailTemplate));
  return (
    <div className="pb-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="bg-white/10 backdrop-blur-lg rounded-lg p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-full bg-black/40">
              <Palette className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-white">Website Einstellungen</h1>
              <p className="text-sm text-gray-300">
                Passe Branding, Ziele, automatische Kommunikation und Versionsinformationen an.
              </p>
            </div>
          </div>
          <div className="text-sm text-gray-300">
            <p>Aktuelle Version: <span className="font-semibold text-white">{form.versionLabel}</span></p>
            {form.updatedAt && (
              <p className="text-xs text-gray-400">Zuletzt geändert am {new Date(form.updatedAt).toLocaleString('de-CH')}</p>
            )}
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="bg-red-600/20 border border-red-600/40 text-red-100 rounded-lg p-4">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/20 border border-green-500/40 text-green-100 rounded-lg p-4">
              {success}
            </div>
          )}

          <CollapsibleSection
            title="Branding & Navigation"
            description="Farben, Navigationstitel, Motto und Login-Darstellung anpassen."
            icon={Palette}
            open={sectionOpen.branding}
            onToggle={() => toggleSection('branding')}
          >
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col text-sm text-gray-300">
                Navigationstitel
                <input
                  type="text"
                  value={form.navTitle}
                  onChange={(event) => handleFieldChange('navTitle', event.target.value)}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                />
              </label>
              <label className="flex flex-col text-sm text-gray-300">
                Untertitel
                <input
                  type="text"
                  value={form.navSubtitle}
                  onChange={(event) => handleFieldChange('navSubtitle', event.target.value)}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                />
              </label>
              <label className="flex flex-col text-sm text-gray-300">
                Motto / Claim
                <input
                  type="text"
                  value={form.brandMotto}
                  onChange={(event) => handleFieldChange('brandMotto', event.target.value)}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <label className="text-sm text-gray-300 flex flex-col">
                Primärfarbe
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(event) => handleFieldChange('primaryColor', event.target.value)}
                  className="mt-2 h-12 w-full cursor-pointer rounded-md border border-white/20 bg-transparent"
                />
              </label>
              <label className="text-sm text-gray-300 flex flex-col">
                Primärfarbe Hover
                <input
                  type="color"
                  value={form.primaryColorDark}
                  onChange={(event) => handleFieldChange('primaryColorDark', event.target.value)}
                  className="mt-2 h-12 w-full cursor-pointer rounded-md border border-white/20 bg-transparent"
                />
              </label>
              <label className="text-sm text-gray-300 flex flex-col">
                Akzentfarbe
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(event) => handleFieldChange('accentColor', event.target.value)}
                  className="mt-2 h-12 w-full cursor-pointer rounded-md border border-white/20 bg-transparent"
                />
              </label>
              <label className="text-sm text-gray-300 flex flex-col">
                Logofarben-Fallback
                <input
                  type="color"
                  value={form.loginLogoColor}
                  onChange={(event) => handleFieldChange('loginLogoColor', event.target.value)}
                  className="mt-2 h-12 w-full cursor-pointer rounded-md border border-white/20 bg-transparent"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[160px]">
                <p className="text-xs uppercase tracking-wide text-gray-400">Primär</p>
                <div className="mt-2 h-12 rounded-md shadow-inner" style={{ backgroundColor: form.primaryColor }}></div>
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-xs uppercase tracking-wide text-gray-400">Hover</p>
                <div className="mt-2 h-12 rounded-md shadow-inner" style={{ backgroundColor: form.primaryColorDark }}></div>
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-xs uppercase tracking-wide text-gray-400">Akzent</p>
                <div className="mt-2 h-12 rounded-md shadow-inner" style={{ backgroundColor: form.accentColor }}></div>
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-xs uppercase tracking-wide text-gray-400">Logo</p>
                <div className="mt-2 h-12 rounded-md shadow-inner" style={{ backgroundColor: form.loginLogoColor }}></div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-gray-300">
                Hintergrund (CSS-Gradient)
                <textarea
                  value={form.backgroundStyle?.gradient ?? ''}
                  onChange={(event) => handleBackgroundStyleChange('gradient', event.target.value)}
                  rows={2}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  placeholder="z. B. linear-gradient(135deg, rgba(220,38,38,0.92), rgba(17,24,39,0.94))"
                />
                <span className="mt-1 text-xs text-gray-500">Nutze jeden gültigen CSS-Hintergrundverlauf.</span>
              </label>
              <label className="flex flex-col text-sm text-gray-300">
                Hintergrundbild (URL)
                <input
                  type="url"
                  value={form.backgroundStyle?.imageUrl ?? ''}
                  onChange={(event) => handleBackgroundStyleChange('imageUrl', event.target.value)}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  placeholder="https://example.ch/background.jpg"
                />
                <span className="mt-1 text-xs text-gray-500">Optional: Bild wird über dem Verlauf angezeigt.</span>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-gray-300">
                Overlay-Farbe
                <input
                  type="text"
                  value={form.backgroundStyle?.overlayColor ?? ''}
                  onChange={(event) => handleBackgroundStyleChange('overlayColor', event.target.value)}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  placeholder="z. B. rgba(0,0,0,0.6)"
                />
              </label>
              <div className="flex flex-col text-sm text-gray-300">
                <span>Overlay-Deckkraft</span>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={form.backgroundStyle?.overlayOpacity ?? 0.65}
                    onChange={(event) => handleBackgroundStyleChange('overlayOpacity', Number.parseFloat(event.target.value))}
                    className="flex-1 accent-[var(--primary-color)]"
                  />
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={Number(form.backgroundStyle?.overlayOpacity ?? 0.65).toFixed(2)}
                    onChange={(event) => handleBackgroundStyleChange('overlayOpacity', Number.parseFloat(event.target.value))}
                    className="w-20 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                  />
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-gray-400">
              <p className="text-sm font-semibold text-white">Vorschau</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div
                  className="h-32 rounded-lg border border-white/10"
                  style={{
                    background: form.backgroundStyle?.gradient ?? '',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {form.backgroundStyle?.imageUrl && (
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${form.backgroundStyle.imageUrl})` }}
                    />
                  )}
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      backgroundColor: form.backgroundStyle?.overlayColor ?? 'rgba(0,0,0,0.6)',
                      opacity: Number(form.backgroundStyle?.overlayOpacity ?? 0.65)
                    }}
                  />
                  <div className="relative flex h-full items-center justify-center">
                    <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] text-white">
                      Hintergrund
                    </span>
                  </div>
                </div>
                <div className="space-y-2 text-[11px]">
                  <p>Nutze die Werte auch direkt in CSS, wenn du im Frontend eigene Bereiche gestalten möchtest:</p>
                  <code className="block rounded bg-black/60 px-3 py-2 text-[10px] text-gray-200">
                    background: {form.backgroundStyle?.gradient ?? 'var(--background-gradient)'};<br />
                    background-image: url({form.backgroundStyle?.imageUrl ?? '—'});<br />
                    overlay: {form.backgroundStyle?.overlayColor ?? 'rgba(0,0,0,0.6)'} /{' '}
                    {Number(form.backgroundStyle?.overlayOpacity ?? 0.65).toFixed(2)}
                  </code>
                </div>
              </div>
            </div>
            <div className="space-y-4 rounded-lg border border-white/10 bg-black/30 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Login-Logo</p>
                  <p className="text-xs text-gray-400">Optionales SVG oder Bild (max. 120 KB)</p>
                </div>
                {trimmedLogo && (
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    className="text-xs font-medium text-red-300 transition-colors hover:text-red-100"
                  >
                    Logo entfernen
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-white/30 bg-black/20 px-4 py-3 text-center text-xs text-gray-300 transition-colors hover:border-white/60 sm:w-auto sm:min-w-[200px]">
                  <span>Datei wählen</span>
                  <span className="text-[11px] text-gray-500">SVG, PNG, JPG, WebP</span>
                  <input
                    type="file"
                    accept="image/svg+xml,image/png,image/jpeg,image/webp"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                </label>
                <div className="flex-1 space-y-3">
                  <div
                    className="flex items-center justify-center rounded-md border border-white/10 bg-black/30 p-3 text-center"
                    style={{ minHeight: `${previewSize + 24}px` }}
                  >
                    {trimmedLogo ? (
                      <>
                        <span className="sr-only">Logo-Vorschau</span>
                        <div className="flex items-center justify-center" style={{ maxHeight: previewSize }}>
                          {isInlineSvgLogo ? (
                            <div
                              aria-hidden
                              className="inline-flex items-center justify-center [&_svg]:h-full [&_svg]:w-full [&_svg_path]:fill-current [&_svg_path]:stroke-current"
                              style={{ height: previewSize, width: 'auto', maxWidth: '100%', color: logoTint }}
                              dangerouslySetInnerHTML={{ __html: trimmedLogo }}
                            />
                          ) : isImageSourceLogo ? (
                            <img
                              src={trimmedLogo}
                              alt="Logo-Vorschau"
                              className="object-contain"
                              style={{ maxHeight: previewSize, width: 'auto' }}
                            />
                          ) : (
                            <span className="text-xs text-gray-400">
                              Logo wird beim Speichern geprüft.
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs text-gray-500">Noch kein Logo hinterlegt</span>
                    )}
                  </div>
                  <label className="flex flex-col gap-2 text-xs text-gray-400">
                    Direkte Eingabe (URL, Data-URL oder SVG)
                    <textarea
                      value={form.loginLogo ?? ''}
                      onChange={handleLogoTextareaChange}
                      rows={3}
                      className="rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                      placeholder="z.B. https://example.ch/logo.svg oder &lt;svg ...&gt;"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-xs text-gray-400">
                    Grösse im Login (Pixel)
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={MIN_LOGO_SIZE}
                        max={MAX_LOGO_SIZE}
                        value={Math.round(previewSize)}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          handleFieldChange('loginLogoSize', next);
                        }}
                        className="w-full accent-[var(--primary-color)]"
                      />
                      <input
                        type="number"
                        min={MIN_LOGO_SIZE}
                        max={MAX_LOGO_SIZE}
                        value={Math.round(form.loginLogoSize ?? previewSize)}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isFinite(next)) {
                            handleFieldChange('loginLogoSize', Math.max(MIN_LOGO_SIZE, Math.min(MAX_LOGO_SIZE, next)));
                          }
                        }}
                        className="w-20 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                      />
                    </div>
                    <span className="text-[11px] text-gray-500">Empfohlen: 96–160 px. SVGs ohne feste Farbe übernehmen automatisch die Logofarbe.</span>
                  </label>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>Login Vorschau</span>
                      <span>{Math.round(previewSize)} px</span>
                    </div>
                    <div className="mt-3 flex justify-center">
                      <div className="w-full max-w-sm rounded-2xl bg-white/10 p-6 text-center shadow-lg backdrop-blur">
                        <div className="flex flex-col items-center gap-3">
                          <div className="flex items-center justify-center" style={{ maxHeight: previewSize }}>
                            {trimmedLogo ? (
                              isInlineSvgLogo ? (
                                <div
                                  className="inline-flex items-center justify-center [&_svg]:h-full [&_svg]:w-full [&_svg_path]:fill-current [&_svg_path]:stroke-current"
                                  style={{ height: previewSize, width: 'auto', maxWidth: '100%', color: logoTint }}
                                  aria-hidden
                                  dangerouslySetInnerHTML={{ __html: trimmedLogo }}
                                />
                              ) : isImageSourceLogo ? (
                                <img
                                  src={trimmedLogo}
                                  alt="Logo-Vorschau"
                                  className="object-contain"
                                  style={{ maxHeight: previewSize, width: 'auto' }}
                                />
                              ) : (
                                <LogIn
                                  aria-hidden
                                  className="h-16 w-16"
                                  style={{ color: logoTint }}
                                />
                              )
                            ) : (
                              <LogIn
                                aria-hidden
                                className="h-16 w-16"
                                style={{ color: logoTint }}
                              />
                            )}
                          </div>
                          <h3 className="text-lg font-semibold text-white">{form.navTitle}</h3>
                          <p className="text-xs text-gray-300">{form.navSubtitle || 'Bitte melde dich mit deinen Zugangsdaten an.'}</p>
                        </div>
                        <div className="mt-5 space-y-3 text-left text-xs text-gray-300">
                          <div className="rounded-md border border-white/15 bg-black/30 px-3 py-2">
                            Benutzername
                          </div>
                          <div className="rounded-md border border-white/15 bg-black/30 px-3 py-2">
                            Passwort
                          </div>
                          <button
                            type="button"
                            className="w-full rounded-md bg-[var(--primary-color)] px-4 py-2 text-sm font-medium text-white"
                            disabled
                          >
                            Anmelden
                          </button>
                        </div>
                        <p className="mt-6 text-[10px] text-gray-500">© {new Date().getFullYear()} {form.navTitle}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {logoError && <p className="text-xs text-red-400">{logoError}</p>}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Footer & Links"
            description="Text im Seitenfuß, Links und Social Media verwalten."
            icon={Link2}
            open={sectionOpen.footer}
            onToggle={() => toggleSection('footer')}
          >
            <div className="space-y-6">
              <label className="flex flex-col text-sm text-gray-300">
                Footer-Text
                <textarea
                  value={form.footerText}
                  onChange={(event) => handleFieldChange('footerText', event.target.value)}
                  rows={2}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  placeholder="© {{year}} Verein. Alle Rechte vorbehalten."
                />
                <span className="mt-1 text-xs text-gray-500">Platzhalter: {'{{year}}'}, {'{{title}}'}, {'{{motto}}'}.</span>
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Footer-Links</p>
                  <button
                    type="button"
                    onClick={handleAddFooterLink}
                    className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    <Plus className="h-3.5 w-3.5" /> Link hinzufügen
                  </button>
                </div>
                {form.footerLinks.length === 0 && (
                  <p className="text-xs text-gray-500">Noch keine Links vorhanden.</p>
                )}
                <div className="space-y-3">
                  {form.footerLinks.map((link, index) => (
                    <div key={`${link.label}-${index}`} className="grid gap-3 rounded-lg border border-white/10 bg-black/30 p-4 md:grid-cols-2">
                      <label className="flex flex-col text-xs text-gray-300">
                        Label
                        <input
                          type="text"
                          value={link.label}
                          onChange={(event) => handleFooterLinkChange(index, 'label', event.target.value)}
                          className="mt-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                        />
                      </label>
                      <label className="flex flex-col text-xs text-gray-300">
                        URL
                        <input
                          type="text"
                          value={link.url}
                          onChange={(event) => handleFooterLinkChange(index, 'url', event.target.value)}
                          className="mt-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                          placeholder="/privacy oder https://…"
                        />
                      </label>
                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveFooterLink(index)}
                          className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Entfernen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Social Links</p>
                  <button
                    type="button"
                    onClick={handleAddSocialLink}
                    className="inline-flex items-center gap-1 rounded-md bg-primary-soft px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                  >
                    <Plus className="h-3.5 w-3.5" /> Account hinzufügen
                  </button>
                </div>
                {form.socialLinks.length === 0 && (
                  <p className="text-xs text-gray-500">Trage Instagram, Facebook oder weitere Kanäle ein.</p>
                )}
                <div className="space-y-3">
                  {form.socialLinks.map((link, index) => (
                    <div key={`${link.label}-${index}`} className="grid gap-3 rounded-lg border border-white/10 bg-black/30 p-4 md:grid-cols-3">
                      <label className="flex flex-col text-xs text-gray-300">
                        Label
                        <input
                          type="text"
                          value={link.label}
                          onChange={(event) => handleSocialLinkChange(index, 'label', event.target.value)}
                          className="mt-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                        />
                      </label>
                      <label className="flex flex-col text-xs text-gray-300">
                        URL
                        <input
                          type="text"
                          value={link.url}
                          onChange={(event) => handleSocialLinkChange(index, 'url', event.target.value)}
                          className="mt-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                          placeholder="https://instagram.com/…"
                        />
                      </label>
                      <label className="flex flex-col text-xs text-gray-300">
                        Icon (optional)
                        <input
                          type="text"
                          value={link.icon ?? ''}
                          onChange={(event) => handleSocialLinkChange(index, 'icon', event.target.value)}
                          className="mt-1 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                          placeholder="instagram, facebook, mail…"
                        />
                        <span className="mt-1 text-[11px] text-gray-500">Bekannte Werte: instagram, facebook, twitter, youtube, mail.</span>
                      </label>
                      <div className="md:col-span-3 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveSocialLink(index)}
                          className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Entfernen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Formular & Felder"
            description="Steuere welche Angaben Pflicht, optional oder verborgen sind."
            icon={ListChecks}
            open={sectionOpen.form}
            onToggle={() => toggleSection('form')}
          >
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                {FORM_FIELD_DEFS.map(({ field, label, hint }) => (
                  <div key={field} className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{label}</p>
                      <select
                        value={form.formConfiguration.fields[field]}
                        onChange={(event) => handleFormFieldModeChange(field, event.target.value as FormFieldMode)}
                        className="rounded-md border border-white/20 bg-black/60 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                      >
                        {FORM_FIELD_MODES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {hint && <p className="mt-2 text-xs text-gray-400">{hint}</p>}
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Betrags-Vorgaben</p>
                    <p className="text-xs text-gray-400">Bis zu 8 Presets erleichtern den Schnellstart.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      value={newPresetAmount}
                      onChange={(event) => setNewPresetAmount(event.target.value)}
                      className="w-28 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary-color)]"
                      placeholder="CHF"
                    />
                    <button
                      type="button"
                      onClick={handleAmountPresetAdd}
                      className="inline-flex items-center rounded-md bg-primary-soft px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Hinzufügen
                    </button>
                  </div>
                </div>
                {form.formConfiguration.amountPresets.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {form.formConfiguration.amountPresets.map((amount, index) => (
                      <span
                        key={`${amount}-${index}`}
                        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs text-white"
                      >
                        CHF {amount.toFixed(2)}
                        <button
                          type="button"
                          onClick={() => handleAmountPresetRemove(index)}
                          className="text-gray-400 transition-colors hover:text-white"
                          aria-label="Preset entfernen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Datenschutz-Checkbox</p>
                    <p className="text-xs text-gray-400">Zeige eine Zustimmung direkt im Formular an.</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={form.formConfiguration.consentRequired}
                      onChange={(event) => handleConsentToggle(event.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-black/40 text-[var(--primary-color)] focus:ring-[var(--primary-color)]"
                    />
                    <span className="text-gray-200">Zustimmung erforderlich</span>
                  </label>
                </div>
                <textarea
                  value={form.formConfiguration.consentText ?? ''}
                  onChange={(event) => handleConsentTextChange(event.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  placeholder="z. B. Ich bestätige, dass ich die Daten gemäss Datenschutzbestimmungen erfasse."
                />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Module & Monitoring"
            description="Steuere optionale Auswertungen und Systemchecks."
            icon={Activity}
            open={sectionOpen.modules}
            onToggle={() => toggleSection('modules')}
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Leaderboard</p>
                  <p className="text-xs text-gray-400">
                    Motiviert Sammler:innen mit einer Topliste nach Anzahl Beiträge und Summe. Sichtbar im Dashboard, sobald aktiviert.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-gray-200">
                  <input
                    type="checkbox"
                    checked={Boolean(form.featureFlags?.leaderboard)}
                    onChange={(event) => handleFeatureFlagToggle('leaderboard', event.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-black/40 text-[var(--primary-color)] focus:ring-[var(--primary-color)]"
                  />
                  <span>{form.featureFlags?.leaderboard ? 'Aktiv' : 'Inaktiv'}</span>
                </label>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Health Monitor</p>
                  <p className="text-xs text-gray-400">
                    Zeigt Backend-Verfügbarkeit, Cache-Status und Datenbank-Latenzen im Admin-Dashboard an.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs text-gray-200">
                  <input
                    type="checkbox"
                    checked={Boolean(form.featureFlags?.healthMonitor)}
                    onChange={(event) => handleFeatureFlagToggle('healthMonitor', event.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-black/40 text-[var(--primary-color)] focus:ring-[var(--primary-color)]"
                  />
                  <span>{form.featureFlags?.healthMonitor ? 'Aktiv' : 'Inaktiv'}</span>
                </label>
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Updates prüfen</p>
                    <p className="text-xs text-gray-400">
                      Vergleicht den aktuellen Stand mit <code className="bg-black/50 px-1">origin/{updateBranchLabel}</code> und liefert die Update-Anleitung.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdate}
                    className="inline-flex items-center gap-2 self-start rounded-md bg-white/10 px-3 py-1 text-xs text-gray-200 transition-colors hover:bg-white/20 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                    {checkingUpdate ? 'Prüfe …' : 'Jetzt prüfen'}
                  </button>
                </div>

                {updateError && (
                  <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                    {updateError}
                  </p>
                )}

                {updateStatus && (
                  <div className="rounded-md border border-white/10 bg-black/40 px-3 py-3 text-xs text-gray-200">
                    <p className="text-sm font-semibold text-white">
                      {updateStatus.updateAvailable ? 'Neue Version verfügbar' : 'Alles auf dem neuesten Stand'}
                    </p>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      <p>Branch: <span className="text-white">{updateStatus.branch}</span></p>
                      <p>Remote ahead: <span className="text-white">{updateStatus.ahead}</span></p>
                      <p>Remote commit: <span className="font-mono text-gray-300">{updateStatus.remoteCommit.slice(0, 10)}</span></p>
                      <p>Lokaler commit: <span className="font-mono text-gray-300">{updateStatus.localCommit.slice(0, 10)}</span></p>
                    </div>
                    <p className="mt-2 text-gray-400">
                      Ausführung: <code className="bg-black/50 px-2 py-1">{updateStatus.instructions}</code>
                    </p>
                    <p className="mt-1 text-[11px] text-gray-500">Zuletzt geprüft: {new Date(updateStatus.lastCheckedAt).toLocaleString('de-CH')}</p>
                    {updateStatus.updateAvailable && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-gray-300">
                        <li>Skript mit ausreichenden Rechten ausführen (z. B. <code className="bg-black/50 px-1">{updateStatus.instructions}</code>).</li>
                        <li>Nach erfolgreichem Lauf Services testen und Version in den Einstellungen aktualisieren.</li>
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Landing & Call-to-Action"
            description="Text und Button für die Startkarten im Dashboard konfigurieren."
            icon={Megaphone}
            open={sectionOpen.cta}
            onToggle={() => toggleSection('cta')}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-gray-300">
                CTA Titel
                <input
                  type="text"
                  value={form.landingCtaTitle}
                  onChange={(event) => handleFieldChange('landingCtaTitle', event.target.value)}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                />
              </label>
              <label className="flex flex-col text-sm text-gray-300">
                Button-Label
                <input
                  type="text"
                  value={form.landingCtaButtonLabel}
                  onChange={(event) => handleFieldChange('landingCtaButtonLabel', event.target.value)}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm text-gray-300 md:col-span-2">
                Beschreibung
                <textarea
                  value={form.landingCtaBody}
                  onChange={(event) => handleFieldChange('landingCtaBody', event.target.value)}
                  rows={3}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  placeholder="Beschreibe kurz, warum Mitglieder aktiv werden sollen."
                />
              </label>
              <label className="flex flex-col text-sm text-gray-300">
                Button-Link
                <input
                  type="text"
                  value={form.landingCtaButtonUrl}
                  onChange={(event) => handleFieldChange('landingCtaButtonUrl', event.target.value)}
                  className="mt-2 rounded-md border border-white/20 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  placeholder="/dashboard/collect oder https://…"
                />
                <span className="mt-1 text-xs text-gray-500">Interne Links starten mit /, externe öffnen in neuem Tab.</span>
              </label>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 p-5">
              <p className="text-xs uppercase tracking-widest text-[var(--accent-color)]">Vorschau</p>
              <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <h3 className="text-xl font-semibold text-white">{form.landingCtaTitle}</h3>
                  {form.landingCtaBody && (
                    <p className="max-w-xl text-sm text-gray-200">
                      {form.landingCtaBody}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center rounded-full bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white shadow">
                  {form.landingCtaButtonLabel}
                </span>
              </div>
              <p className="mt-3 text-[11px] text-gray-500">
                Platzhalter wie <code className="rounded bg-black/60 px-1">{'{{year}}'}</code> werden aktuell nicht ersetzt. Nutze klare Sprache für maximale Wirkung.
              </p>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Ziele & Dashboard-Texte"
            description="Spendenziel, Fristen und Erfolgsnachricht definieren."
            icon={Target}
            open={sectionOpen.goals}
            onToggle={() => toggleSection('goals')}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-gray-300 flex flex-col">
                Zielbetrag (CHF)
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  value={form.targetAmount}
                  onChange={(event) => handleFieldChange('targetAmount', Number(event.target.value))}
                  className="mt-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                />
              </label>
              <label className="text-sm text-gray-300 flex flex-col">
                Ziel-Datum
                <input
                  type="date"
                  value={form.goalDeadline ? form.goalDeadline.slice(0, 10) : ''}
                  onChange={(event) => handleFieldChange('goalDeadline', event.target.value ? event.target.value : null)}
                  className="mt-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                />
              </label>
            </div>
            <label className="text-sm text-gray-300 flex flex-col">
              Begrüssungstext Dashboard
              <textarea
                value={form.welcomeMessage}
                onChange={(event) => handleFieldChange('welcomeMessage', event.target.value)}
                rows={3}
                className="mt-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
              />
            </label>
            <label className="text-sm text-gray-300 flex flex-col">
              Erfolgsnachricht (Anzeige nach Beitrag)
              <textarea
                value={form.successMessage}
                onChange={(event) => handleFieldChange('successMessage', event.target.value)}
                rows={3}
                className="mt-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
              />
            </label>
          </CollapsibleSection>

          <CollapsibleSection
            title="Automatisches Bestätigungs-Mail"
            description="SMTP-Anbindung konfigurieren und E-Mail-Vorlagen pflegen."
            icon={Mail}
            open={sectionOpen.mail}
            onToggle={() => toggleSection('mail')}
          >
            <CollapsibleSection
              title="SMTP / Mail-Anbindung Schritt für Schritt"
              description="Alles was du für verlässliche Bestätigungs-Mails benötigst."
              icon={Mail}
              open={showMailGuide}
              onToggle={() => setShowMailGuide((prev) => !prev)}
            >
              <div className="space-y-2 text-xs sm:text-sm">
                <p className="font-semibold text-white">Technischer Überblick</p>
                <ul className="list-disc space-y-1 pl-5 text-gray-200">
                  <li>
                    Der Mailversand läuft über <code>backend/server.js</code>. Nach erfolgreicher Beitragserfassung ruft die API <code>sendContributionConfirmationEmail</code> auf und ersetzt alle Platzhalter mit den Beitrag-Daten.
                  </li>
                  <li>
                    Konfiguriert wird alles über <code>backend/.env</code> (oder Docker-Umgebungsvariablen). Beim Start legt das Backend einen Nodemailer-Transport an; Fehler erscheinen im Container-Log.
                  </li>
                  <li>
                    Das HTML-Layout liegt unter <code>backend/templates/contribution-confirmation.html</code>. Falls die Datei fehlt, wird auf den Text aus den Einstellungen zurückgegriffen.
                  </li>
                  <li>
                    Platzhalter wie <code>{'{{firstName}}'}</code> werden serverseitig ersetzt, bevor die Nachricht verschickt wird. Zusätzliche Platzhalter sind dokumentiert unterhalb des Editors.
                  </li>
                </ul>
              </div>
              <ol className="list-decimal space-y-3 pl-5 text-xs sm:text-sm">
                <li>
                  <span className="font-semibold text-white">Zugangsdaten hinterlegen</span><br />
                  Trage die SMTP-Daten im <code className="rounded bg-black/60 px-2 py-0.5">backend/.env</code> oder in deinen Docker-Umgebungsvariablen ein:
                  <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                    <code>MAIL_SMTP_HOST=mail.example.ch</code>
                    <code>MAIL_SMTP_PORT=465</code>
                    <code>MAIL_SMTP_SECURE=true</code>
                    <code>MAIL_SMTP_USER=portal@example.ch</code>
                    <code>MAIL_SMTP_PASS=&lt;dein_passwort&gt;</code>
                    <code>MAIL_FROM="Genner Gibelguuger &lt;portal@example.ch&gt;"</code>
                    <code>ENABLE_OUTBOUND_MAIL=true</code>
                  </div>
                  <p className="mt-2 text-gray-300">
                    Falls du Zugangsdaten nur verschlüsselt hinterlegen kannst, stehen zusätzlich
                    <code className="mx-1 rounded bg-black/60 px-2 py-0.5">MAIL_SMTP_USER_BASE64</code>
                    und
                    <code className="mx-1 rounded bg-black/60 px-2 py-0.5">MAIL_SMTP_PASS_BASE64</code>
                    (sowie die entsprechenden <code>SMTP_*</code>-Varianten) bereit. Lege dort Base64-codierte Werte ab –
                    das Backend dekodiert sie automatisch.
                  </p>
                  Alternativ funktionieren auch die Variablen <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASSWORD</code> und <code>SMTP_FROM</code>.
                </li>
                <li>
                  <span className="font-semibold text-white">Server aktualisieren</span><br />
                  Speichere die Datei und starte den Backend-Container neu, damit die neuen Werte geladen werden:<br />
                  <code className="mt-1 inline-block rounded bg-black/50 px-2 py-0.5">docker compose restart backend</code><br />
                  Prüfe anschließend die Logs auf erfolgreiche Verbindung oder Fehler:
                  <code className="mt-1 inline-block rounded bg-black/50 px-2 py-0.5">docker compose logs -f backend | grep -i mail</code><br />
                  Meldungen wie <code>"Email template missing"</code> oder <code>"Failed to load site settings"</code> geben sofort Auskunft, was noch fehlt.
                </li>
                <li>
                  <span className="font-semibold text-white">SMTP-Server testen</span><br />
                  Sende dir selbst eine Test-Mail, indem du im Mitgliederbereich einen kleinen Test-Beitrag erfasst. Beachte dabei:<br />
                  • Firewall oder Provider dürfen Port <code>465</code> (oder deinen SMTP-Port) nicht blockieren.<br />
                  • SPF/DKIM müssen für deine Absenderdomain korrekt gesetzt sein, sonst landen Mails im Spam.<br />
                  • Bei Problemen zeigt das Log den Grund an (z. B. Authentifizierung fehlgeschlagen, Host nicht erreichbar, TLS nicht möglich).
                </li>
                <li>
                  <span className="font-semibold text-white">Inhalt gestalten</span><br />
                  Passe Betreff, Text, die Erfolgsmeldung sowie (optional) die Vorlage <code>backend/templates/contribution-confirmation.html</code> an. Die Platzhalter aus dieser Sektion werden automatisch ersetzt. Markdown-Formatierung ist hier erlaubt (Listen, Fettdruck, Links).
                  </li>
                <li>
                  <span className="font-semibold text-white">Fallbacks & Wartung</span><br />
                  Wenn der Mailversand vorübergehend deaktiviert werden soll, setze <code>ENABLE_OUTBOUND_MAIL=false</code>. Der Code protokolliert weiterhin jede versuchte Zustellung, sodass du fehlende Mails nachvollziehen kannst.
                </li>
              </ol>
            </CollapsibleSection>
            <p className="text-sm text-gray-300">
              Du kannst folgende Platzhalter verwenden: <code className="text-xs bg-black/60 px-2 py-1 rounded">{'{{firstName}}'}</code>,{' '}
              <code className="text-xs bg-black/60 px-2 py-1 rounded">{'{{lastName}}'}</code>,{' '}
              <code className="text-xs bg-black/60 px-2 py-1 rounded">{'{{amount}}'}</code>,{' '}
              <code className="text-xs bg-black/60 px-2 py-1 rounded">{'{{paymentMethod}}'}</code>,{' '}
              <code className="text-xs bg-black/60 px-2 py-1 rounded">{'{{gennervogt}}'}</code>,{' '}
              <code className="text-xs bg-black/60 px-2 py-1 rounded">{'{{createdAt}}'}</code> sowie <code className="text-xs bg-black/60 px-2 py-1 rounded">{'{{successMessage}}'}</code> und{' '}
              <code className="text-xs bg-black/60 px-2 py-1 rounded">{'{{targetAmount}}'}</code> aus den Einstellungen.
            </p>
            <label className="text-sm text-gray-300 flex flex-col">
              Betreff
              <input
                type="text"
                value={form.autoMailSubject}
                onChange={(event) => handleFieldChange('autoMailSubject', event.target.value)}
                className="mt-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
              />
            </label>
            <label className="text-sm text-gray-300 flex flex-col">
              Mail-Inhalt
              <textarea
                value={form.autoMailBody}
                onChange={(event) => handleFieldChange('autoMailBody', event.target.value)}
                rows={6}
                className="mt-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
              />
            </label>
            <div className="text-sm text-gray-300">
              <div className="flex items-center justify-between">
                <span className="font-medium">HTML-Vorlage (optional)</span>
                <button
                  type="button"
                  onClick={() => {
                    setMailTemplateError(null);
                    handleFieldChange('autoMailTemplate', null);
                    setMailEditorMode('visual');
                  }}
                  className="text-xs text-[var(--accent-color)] hover:text-white"
                >
                  Standardvorlage verwenden
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Lässt du dieses Feld leer, wird die Standardvorlage mit rotem Akzent geladen. Du kannst hier eine komplette HTML-Mail inkl. Inline-CSS hinterlegen. Die Platzhalter aus dem Text bleiben erhalten.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMailEditorMode('visual')}
                  disabled={!visualEditorSupported}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    mailEditorMode === 'visual'
                      ? 'bg-[var(--primary-color)] text-white'
                      : 'bg-black/30 text-gray-200 hover:bg-black/40'
                  } ${visualEditorSupported ? '' : 'opacity-40 cursor-not-allowed'}`}
                >
                  Designer
                </button>
                <button
                  type="button"
                  onClick={() => setMailEditorMode('html')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    mailEditorMode === 'html'
                      ? 'bg-[var(--primary-color)] text-white'
                      : 'bg-black/30 text-gray-200 hover:bg-black/40'
                  }`}
                >
                  HTML-Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMailTemplateError(null);
                    handleFieldChange('autoMailTemplate', DEFAULT_EMAIL_TEMPLATE_SNIPPET);
                    if (visualEditorSupported) {
                      setMailEditorMode('visual');
                    }
                  }}
                  className="rounded-md bg-black/30 px-3 py-1 text-xs font-medium text-gray-200 transition-colors hover:bg-black/40"
                >
                  Vorlage einfügen
                </button>
                {!visualEditorSupported && (
                  <span className="text-[11px] text-yellow-300">
                    Visualer Editor deaktiviert – der Inhalt enthält ein komplettes HTML-Dokument.
                  </span>
                )}
              </div>
              {mailEditorMode === 'visual' && visualEditorSupported ? (
                <div className="mt-3">
                  <EmailDesignEditor
                    value={form.autoMailTemplate ?? ''}
                    onChange={(html) => handleFieldChange('autoMailTemplate', html)}
                    placeholder="Gestalte deinen Mail-Inhalt …"
                    accentColor={form.accentColor}
                    loginLogo={form.loginLogo}
                  />
                </div>
              ) : (
                <textarea
                  value={form.autoMailTemplate ?? ''}
                  onChange={(event) => {
                    setMailTemplateError(null);
                    handleFieldChange('autoMailTemplate', event.target.value);
                  }}
                  rows={14}
                  className="mt-3 w-full rounded bg-black/30 font-mono text-xs text-gray-100 border border-white/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                  placeholder="<!DOCTYPE html>..."
                />
              )}
              {mailTemplateError && (
                <p className="mt-1 text-xs text-red-400">{mailTemplateError}</p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Unterstützte Platzhalter: <code className="bg-black/40 px-1">{'{{firstName}}'}</code>, <code className="bg-black/40 px-1">{'{{lastName}}'}</code>, <code className="bg-black/40 px-1">{'{{amount}}'}</code>, <code className="bg-black/40 px-1">{'{{paymentMethod}}'}</code>, <code className="bg-black/40 px-1">{'{{gennervogt}}'}</code>, <code className="bg-black/40 px-1">{'{{createdAt}}'}</code>, <code className="bg-black/40 px-1">{'{{successMessage}}'}</code>, <code className="bg-black/40 px-1">{'{{targetAmount}}'}</code>.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Live Vorschau</span>
                <span>{mailEditorMode === 'visual' ? 'Designer' : 'HTML'} · {form.autoMailSubject || 'Betreff'}</span>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-white text-sm text-gray-900 shadow-xl">
                <iframe
                  title="Mail Vorschau"
                  className="h-[560px] w-full border-0"
                  srcDoc={emailPreviewHtml || '<div style="padding:24px;font-family:Arial,sans-serif;color:#555">Keine Vorlage hinterlegt.</div>'}
                />
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Die Vorschau zeigt die Desktop-Ansicht. Mobile Clients können Inhalte anders umbrechen.
              </p>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Update Log"
            description="Versionseinträge erfassen und dokumentieren."
            icon={ListChecks}
            open={sectionOpen.updates}
            onToggle={() => toggleSection('updates')}
          >

            {updateLogDrafts.length === 0 && (
              <p className="text-sm text-gray-300">Noch keine Einträge vorhanden. Erfasse deine erste Version, um die Änderungen zu dokumentieren.</p>
            )}

            <div className="space-y-6">
              {updateLogDrafts.map((entry, index) => (
                <div key={index} className="rounded-lg border border-white/10 p-4 space-y-4 bg-black/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <ShieldCheck className="w-4 h-4 text-white" />
                      <h3 className="text-white font-semibold">Eintrag {index + 1}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveUpdateLogEntry(index)}
                      className="inline-flex items-center text-sm text-red-300 hover:text-red-200"
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Entfernen
                    </button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm text-gray-300 flex flex-col">
                      Version
                      <input
                        type="text"
                        value={entry.version}
                        onChange={(event) => handleUpdateLogChange(index, { version: event.target.value })}
                        className="mt-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                      />
                    </label>
                    <label className="text-sm text-gray-300 flex flex-col">
                      Datum
                      <input
                        type="date"
                        value={entry.date ? entry.date.slice(0, 10) : ''}
                        onChange={(event) => handleUpdateLogChange(index, { date: event.target.value || null })}
                        className="mt-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
                      />
                    </label>
                  </div>
                  <MarkdownEditor
                    label="Änderungen"
                    description="Nutze Markdown für deine Notizen – Überschriften, Listen, Links und Hervorhebungen werden in der Vorschau dargestellt."
                    value={formatChanges(entry)}
                    onChange={(next) => handleUpdateLogChangesText(index, next)}
                    rows={6}
                    mode="document"
                    placeholder="z. B. Neue Statistik für TWINT hinzugefügt"
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddUpdateLogEntry}
              className="inline-flex items-center px-4 py-2 rounded-md bg-black/40 text-gray-200 hover:bg-black/50"
            >
              <Plus className="w-4 h-4 mr-2" /> Eintrag hinzufügen
            </button>
          </CollapsibleSection>

          <CollapsibleSection
            title="Rechtlicher Hinweis & Kontakt"
            description="Impressum und Datenschutzkontakt pflegen."
            icon={ShieldCheck}
            open={sectionOpen.legal}
            onToggle={() => toggleSection('legal')}
          >
            <label className="text-sm text-gray-300 flex flex-col">
              Kontaktinformationen für Datenschutz & Impressum
              <textarea
                value={form.legalContact}
                onChange={(event) => handleFieldChange('legalContact', event.target.value)}
                rows={3}
                placeholder="z. B. Verein, Adresse, Ansprechpartner, E-Mail"
                className="mt-2 px-3 py-2 rounded bg-black/40 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)]"
              />
            </label>
          </CollapsibleSection>

          <CollapsibleSection
            title="Datenschutzerklärung"
            description="Öffentlichen Text für /privacy bearbeiten."
            icon={Shield}
            open={sectionOpen.privacy}
            onToggle={() => toggleSection('privacy')}
          >
            <p className="text-sm text-gray-300">
              Gestalte hier die veröffentlichte Datenschutzerklärung für Mitglieder. Du kannst Überschriften, Listen,
              Hervorhebungen sowie Links nutzen. Das Ergebnis wird automatisch auf der öffentlichen Seite{' '}
              <span className="text-white">/privacy</span> angezeigt.
            </p>
            <MarkdownEditor
              label="Inhalt"
              description="Markdown-Formatierung wird unterstützt. Nutze # Titel, - Listenpunkte, **fette** oder *kursiv* markierte Stellen."
              value={form.privacyPolicy}
              onChange={(next) => handleFieldChange('privacyPolicy', next)}
              rows={14}
              mode="document"
              placeholder="## Neuer Abschnitt\nBeschreibe hier den Zweck der Datenbearbeitung …"
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Security & Betrieb"
            description="Best Practices, Migration und Backup-Hinweise."
            icon={TerminalSquare}
            open={sectionOpen.operations}
            onToggle={() => toggleSection('operations')}
          >
            <div className="space-y-3">
              <CollapsibleSection
                title="Security Features"
                description="Überblick über alle Schutzmechanismen und Compliance-Hinweise."
                icon={Shield}
                open={showSecurityOverview}
                onToggle={() => setShowSecurityOverview((prev) => !prev)}
              >
                <ul className="list-disc space-y-2 pl-5 text-xs sm:text-sm">
                  <li>
                    <strong>AES-256-GCM Verschlüsselung:</strong> Personenbezogene Felder in Beiträgen sowie IP-Adressen in den Login-Logs werden mit einem 32-Byte Schlüssel verschlüsselt gespeichert.
                  </li>
                  <li>
                    <strong>JWT mit Ablauf & Signatur:</strong> Zugriffstokens laufen nach 24&nbsp;Stunden ab und werden mit einem geheimen Schlüssel signiert. Der Schlüssel lässt sich jederzeit rotieren.
                  </li>
                  <li>
                    <strong>Ratenbegrenzung & Bruteforce-Schutz:</strong> Globales Throttling für alle Requests und ein strenges Limit für Login- und Registrierungsversuche.
                  </li>
                  <li>
                    <strong>Web Application Firewall:</strong> Verdächtige Payloads (SQL- oder XSS-Muster) werden serverseitig verworfen; sämtliche Request-Bodies werden zusätzlich gegen Prototype-Pollution gesichert.
                  </li>
                  <li>
                    <strong>Security-Header & CSP:</strong> Helmet setzt HSTS, Referrer-Policy und Content-Security-Policy (Scripts nur von <code>'self'</code>, Styles eingeschränkt). Optional kannst du mit <code>REQUIRE_HTTPS=true</code> HTTP automatisch auf HTTPS umleiten.
                  </li>
                  <li>
                    <strong>CORS & Origin Whitelist:</strong> Nur explizit erlaubte Hosts dürfen auf die API zugreifen; Token werden nicht an fremde Origins ausgeliefert.
                  </li>
                  <li>
                    <strong>Audit Log:</strong> Jeder Login-Versuch wird mitsamt verschlüsselter IP gespeichert. Diese Historie hilft bei forensischen Analysen ohne Datenschutz zu verletzen.
                  </li>
                  <li>
                    <strong>Parametrisierte Datenbankzugriffe:</strong> Alle Queries verwenden vorbereitete Statements, wodurch SQL-Injection verhindert wird.
                  </li>
                </ul>
                <p className="text-xs text-gray-400">
                  Hinweis: Für maximale Sicherheit sollten Reverse-Proxies (z.&nbsp;B. nginx, Traefik) TLS terminieren und die Anwendung hinter einer Firewall laufen.
                </p>
              </CollapsibleSection>

              <CollapsibleSection
                title="Backups & Wiederherstellung"
                description="Regelmäßige Sicherungen für Datenbank, Konfiguration und statische Dateien."
                icon={Database}
                open={showBackupGuide}
                onToggle={() => setShowBackupGuide((prev) => !prev)}
              >
                <ol className="list-decimal space-y-3 pl-5 text-xs sm:text-sm">
                  <li>
                    <strong>Datenbank sichern</strong>
                    <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                      <code>mkdir -p backups</code>
                      <code>timestamp=$(date +"%Y%m%d-%H%M%S")</code>
                      <code>docker compose exec genner-db pg_dump --no-owner --format=c --file=/tmp/genner-$timestamp.backup postgres</code>
                      <code>docker cp genner-db:/tmp/genner-$timestamp.backup ./backups/</code>
                      <code>docker compose exec genner-db rm /tmp/genner-$timestamp.backup</code>
                    </div>
                    Bewahre die Dumps außerhalb des Repositories auf und lege sie zusätzlich verschlüsselt ab (z.&nbsp;B. <code>gpg --symmetric backups/*.backup</code>).
                  </li>
                  <li>
                    <strong>Konfiguration & statische Dateien sichern</strong>
                    <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                      <code>tar czf configs-$timestamp.tar.gz backend/.env backend/templates</code>
                      <code>tar czf app-dist-$timestamp.tar.gz dist</code>
                    </div>
                    Ergänze die Archive um weitere Assets (z.&nbsp;B. <code>public/uploads</code>), sofern vorhanden.
                  </li>
                  <li>
                    <strong>Automatisierung per Cron (optional)</strong>
                    <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                      <code>crontab -e</code>
                      <code>0 2 * * * /usr/bin/docker compose -f /home/user/genner/docker-compose.yml exec genner-db pg_dump --no-owner --format=c --file=/tmp/genner-nightly.backup postgres &amp;&gt;/tmp/backup.log</code>
                      <code>5 2 * * * /usr/bin/docker cp genner-db:/tmp/genner-nightly.backup /home/user/backups/ &gt;&gt;/tmp/backup.log 2&gt;&amp;1</code>
                      <code>10 2 * * * /usr/bin/rclone sync /home/user/backups remote:genner-backups &gt;&gt;/tmp/backup.log 2&gt;&amp;1</code>
                    </div>
                    Kontrolliere das Log (<code>cat /tmp/backup.log</code>) regelmäßig und führe Testwiederherstellungen durch.
                  </li>
                  <li>
                    <strong>Wiederherstellung im Ernstfall</strong>
                    <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                      <code>docker compose down</code>
                      <code>docker compose up -d genner-db</code>
                      <code>docker compose exec -T genner-db dropdb --if-exists postgres</code>
                      <code>docker compose exec -T genner-db createdb postgres</code>
                      <code>docker compose cp ./backups/genner-latest.backup genner-db:/tmp/restore.backup</code>
                      <code>docker compose exec -T genner-db pg_restore --clean --no-owner --dbname=postgres /tmp/restore.backup</code>
                      <code>docker compose up -d</code>
                    </div>
                    Spiele anschließend <code>backend/.env</code>, Templates und (falls vorhanden) weitere Assets zurück und teste die Anwendung.
                  </li>
                </ol>
                <p className="text-xs text-gray-400">
                  Lösche temporäre Restore-Dateien (<code>rm /tmp/restore.backup</code>) und halte mindestens zwei Generationen an Backups bereit (z.&nbsp;B. täglich + wöchentlich). Bewahre sensible Archive separat verschlüsselt auf.
                </p>
              </CollapsibleSection>

              <CollapsibleSection
                title="Verschlüsselungs-Keys & Geheimnisse sicher wechseln"
                description="Anleitung für ENCRYPTION_KEY, JWT_SECRET und weitere geheime Werte."
                icon={KeyRound}
                open={showKeyGuide}
                onToggle={() => setShowKeyGuide((prev) => !prev)}
              >
                <ol className="list-decimal space-y-3 pl-5 text-xs sm:text-sm">
                  <li>
                    <strong>Downtime & Backup planen:</strong> Informiere Nutzer über eine kurze Wartung. Sichere die Datenbank vollständig – z.&nbsp;B. mit
                    <code className="mt-1 block rounded bg-black/50 px-2 py-0.5">docker compose exec genner-db pg_dump --no-owner --format=c --file=/tmp/genner.backup postgres</code>
                    und lade das Backup per <code>docker cp genner-db:/tmp/genner.backup ./genner.backup</code> herunter. Optional kannst du zusätzlich den kompletten Ordner <code>backend/.env</code> und <code>backend/templates</code> sichern.
                  </li>
                  <li>
                    <strong>Neue Schlüssel generieren:</strong> Erzeuge robuste Keys mittels OpenSSL:
                    <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                      <code>openssl rand -hex 32 # neuer ENCRYPTION_KEY</code>
                      <code>openssl rand -base64 48 # neuer JWT_SECRET</code>
                    </div>
                  </li>
                  <li>
                    <strong>Daten neu verschlüsseln:</strong> Exportiere die bisherige und neue Verschlüsselung als Umgebungsvariablen und führe das Rotations-Skript aus:
                    <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                      <code>cd backend</code>
                      <code>OLD_ENCRYPTION_KEY=&lt;alt&gt; NEW_ENCRYPTION_KEY=&lt;neu&gt; \
node scripts/rotate-encryption-key.js</code>
                    </div>
                    Das Skript liest alle verschlüsselten Felder, entschlüsselt sie mit dem alten Key und verschlüsselt sie mit dem neuen. Bei Abbruch kannst du das Datenbank-Backup wiederherstellen.
                  </li>
                  <li>
                    <strong>Konfigurationsdateien aktualisieren:</strong> Setze in <code>backend/.env</code> den neuen <code>ENCRYPTION_KEY</code> und <code>JWT_SECRET</code>. Aktualisiere ggf. weitere Secrets (API-Keys, SMTP-Passwörter) und prüfe die Dateirechte (<code>chmod 600</code> für .env-Dateien).
                  </li>
                  <li>
                    <strong>Restore testen & Daten verifizieren:</strong> Öffne ein zweites Terminal und spiele das Backup testweise lokal zurück, damit du weißt, wie die Wiederherstellung funktioniert:
                    <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                      <code>docker compose exec -T genner-db dropdb --if-exists restore_test</code>
                      <code>docker compose exec -T genner-db createdb restore_test</code>
                      <code>docker compose exec -T genner-db pg_restore --no-owner --dbname=restore_test /tmp/genner.backup</code>
                    </div>
                    Prüfe stichprobenartig, ob Daten lesbar sind (<code>SELECT first_name FROM contributions LIMIT 3</code>). Wenn der Test erfolgreich war, lösche die temporäre Datenbank wieder.
                  </li>
                  <li>
                    <strong>Dienste neu starten & testen:</strong> Starte die Container neu (<code>docker compose restart backend app</code>) und überprüfe, ob bestehende Beiträge entschlüsselt werden können und der Login funktioniert. Bitte alle Nutzer, sich neu anzumelden, damit alte JWTs ungültig werden.
                  </li>
                </ol>
                <p className="text-xs text-gray-400">
                  Achtung: Das Rotations-Skript darf nur ausgeführt werden, solange der alte Schlüssel noch in der Umgebung aktiv ist. Nach erfolgreicher Rotation entferne <code>OLD_ENCRYPTION_KEY</code> sofort wieder aus deinen Konfigurationsdateien.
                </p>
              </CollapsibleSection>

              <CollapsibleSection
                title="Neuinstallation auf frischem Ubuntu-Server"
                description="Schritt-für-Schritt Setup inkl. Docker, Zertifikate und Start der Container."
                icon={Server}
                open={showDeploymentGuide}
                onToggle={() => setShowDeploymentGuide((prev) => !prev)}
              >
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold text-white">A) Vorbereitung auf dem bestehenden Server</p>
                    <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs sm:text-sm">
                      <li>
                        <strong>Versionsstand sichern:</strong> Stelle sicher, dass alle Änderungen committet sind.
                        <code className="mt-1 block rounded bg-black/50 px-2 py-0.5">git status && git add . && git commit -m "Server snapshot"</code>
                        Falls du noch kein Remote verwendest, richte eines ein und pushe den Stand:
                        <code className="mt-1 block rounded bg-black/50 px-2 py-0.5">git remote add origin &lt;git-url&gt; && git push origin main</code>
                      </li>
                      <li>
                        <strong>Konfiguration & Daten exportieren:</strong> Erstelle ein aktuelles Datenbank-Backup und sichere Konfigurationsdateien.
                        <div className="mt-1 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                          <code>docker compose exec genner-db pg_dump --no-owner --format=c --file=/tmp/genner.backup postgres</code>
                          <code>docker cp genner-db:/tmp/genner.backup ./genner.backup</code>
                          <code>cp backend/.env ./env.backup</code>
                          <code>tar czf attachments.tar.gz backend/templates dist</code>
                        </div>
                        Übertrage die Dateien an einen sicheren Ort (z.&nbsp;B. verschlüsselte Cloud oder lokalen Tresor).
                      </li>
                      <li>
                        <strong>Secrets dokumentieren:</strong> Bewahre Passwörter, Tokens und API-Keys in einem Passwortmanager auf. Notiere zudem, welche Cronjobs oder zusätzlichen Dienste aktiv sind.
                      </li>
                    </ol>
                  </div>

                  <div>
                    <p className="font-semibold text-white">B) Neuer Ubuntu-Server</p>
                    <ol className="mt-2 list-decimal space-y-3 pl-5 text-xs sm:text-sm">
                      <li>
                        <strong>Grundpakete installieren</strong>
                        <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                          <code>sudo apt update && sudo apt upgrade -y</code>
                          <code>sudo apt install -y ca-certificates curl git ufw</code>
                        </div>
                      </li>
                      <li>
                        <strong>Docker & Compose-Plugin einrichten</strong>
                        <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                          <code>curl -fsSL https://get.docker.com | sudo sh</code>
                          <code>sudo usermod -aG docker $USER</code>
                          <code>newgrp docker</code>
                          <code>docker --version && docker compose version</code>
                        </div>
                      </li>
                      <li>
                        <strong>Projekt klonen & vorbereiten</strong>
                        <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                          <code>git clone https://&lt;dein-repo&gt; genner</code>
                          <code>cd genner</code>
                          <code>cp backend/.env.example backend/.env</code>
                        </div>
                        Trage die gesicherten Secrets in <code>backend/.env</code> ein (Datenbank-URL, <code>ENCRYPTION_KEY</code>, <code>JWT_SECRET</code>, SMTP usw.). Neue Schlüssel kannst du bei Bedarf mit <code>openssl rand -hex 32</code> erzeugen.
                      </li>
                      <li>
                        <strong>Backups importieren</strong>
                        <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                          <code>scp ./genner.backup user@server:/home/user/genner/genner.backup</code>
                          <code>scp ./env.backup user@server:/home/user/genner/backend/.env</code>
                          <code>scp attachments.tar.gz user@server:/home/user/genner/</code>
                          <code>tar xzf attachments.tar.gz</code>
                        </div>
                        Achte darauf, dass sensible Dateien nur für den Server-Benutzer lesbar sind (<code>chmod 600 backend/.env</code>).
                      </li>
                      <li>
                        <strong>Datenbank initialisieren & Container starten</strong>
                        <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                          <code>docker compose up -d --build</code>
                          <code>docker compose logs -f backend</code>
                        </div>
                        Sobald „Backend running on port 3001“ erscheint, kannst du das Backup einspielen:
                        <code className="mt-1 block rounded bg-black/50 px-2 py-0.5">docker compose exec -T genner-db pg_restore --clean --no-owner --dbname=postgres /app/genner.backup</code>
                      </li>
                      <li>
                        <strong>Admin-Zugang anlegen & HTTPS aktivieren</strong>
                        <div className="mt-2 grid gap-1 rounded bg-black/50 p-3 font-mono text-[11px] sm:text-xs">
                          <code>./create-admin.sh</code>
                          <code>sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable</code>
                        </div>
                        Richte einen Reverse-Proxy mit TLS ein (z.&nbsp;B. Caddy, Traefik, nginx + Let’s Encrypt) und setze <code>REQUIRE_HTTPS=true</code>, sobald HTTPS aktiv ist.
                      </li>
                    </ol>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Weitere Wartungsskripte findest du im Projekt (z.&nbsp;B. <code>fix-database-*</code>). Bewahre SSH- und Datenbank-Zugangsdaten sicher auf und plane regelmäßige Backups (siehe Abschnitt „Backups & Wiederherstellung“).
                </p>
              </CollapsibleSection>
            </div>
          </CollapsibleSection>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-6 py-3 rounded-lg bg-[var(--primary-color)] text-white hover:bg-[var(--primary-color-dark)] transition-colors disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Speichere...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Änderungen speichern
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
