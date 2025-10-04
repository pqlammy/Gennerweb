export type User = {
  id: string;
  username: string;
  role: string;
  email?: string | null;
};

export type PaymentMethod = 'twint' | 'cash';

export type PaymentStatus =
  | 'unpaid'
  | 'twint_pending'
  | 'cash_pending'
  | 'twint_paid'
  | 'cash_paid';

export type Contribution = {
  id: string;
  user_id: string;
  amount: number;
  first_name: string;
  last_name: string;
  email: string;
  address: string;
  city: string;
  postal_code: string;
  phone: string | null;
  gennervogt_id: string | null;
  paid: boolean;
  created_at: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  settlement_code: string | null;
  gennervogt_username?: string | null;
};

export type ContributionWithUser = Contribution & {
  user: Pick<User, 'username' | 'email'>;
  gennervogt?: Pick<User, 'username' | 'email'>;
};

export type LoginLog = {
  id: string;
  user_id: string;
  ip_address: string;
  success: boolean;
  created_at: string;
};

export type UpdateLogEntry = {
  version: string;
  date: string | null;
  changes: string[];
};

export type FormFieldMode = 'required' | 'optional' | 'hidden';

export type ContributionFormFieldsConfig = {
  email: FormFieldMode;
  address: FormFieldMode;
  city: FormFieldMode;
  postal_code: FormFieldMode;
  phone: FormFieldMode;
};

export type ContributionFormConfiguration = {
  fields: ContributionFormFieldsConfig;
  consentText: string | null;
  consentRequired: boolean;
  amountPresets: number[];
};

export type FeatureFlags = {
  leaderboard: boolean;
  healthMonitor: boolean;
};

export type LeaderboardEntry = {
  userId: string | null;
  username: string;
  contributions: number;
  totalAmount: number;
};

export type LeaderboardResponse = {
  generatedAt: string;
  entries: LeaderboardEntry[];
};

export type FooterLink = {
  label: string;
  url: string;
};

export type SocialLink = {
  label: string;
  url: string;
  icon?: string | null;
};

export type BrandingBackground = {
  gradient?: string | null;
  imageUrl?: string | null;
  overlayColor?: string | null;
  overlayOpacity?: number | null;
};

export type SiteSettings = {
  id?: string | null;
  primaryColor: string;
  primaryColorDark: string;
  accentColor: string;
  mailAccentColor: string;
  brandMotto: string;
  navTitle: string;
  navSubtitle: string;
  targetAmount: number;
  goalDeadline: string | null;
  welcomeMessage: string;
  successMessage: string;
  autoMailSubject: string;
  autoMailBody: string;
  autoMailTemplate: string | null;
  versionLabel: string;
  updateLog: UpdateLogEntry[];
  legalContact: string;
  privacyPolicy: string;
  loginLogo: string | null;
  loginLogoColor: string;
  loginLogoSize: number;
  landingCtaTitle: string;
  landingCtaBody: string;
  landingCtaButtonLabel: string;
  landingCtaButtonUrl: string;
  footerText: string;
  footerLinks: FooterLink[];
  socialLinks: SocialLink[];
  formConfiguration: ContributionFormConfiguration;
  backgroundStyle: BrandingBackground;
  featureFlags: FeatureFlags;
  updatedAt?: string | null;
};

export type PublicSiteSettings = Pick<SiteSettings,
  'primaryColor'
  | 'primaryColorDark'
  | 'accentColor'
  | 'brandMotto'
  | 'navTitle'
  | 'navSubtitle'
  | 'targetAmount'
  | 'goalDeadline'
  | 'welcomeMessage'
  | 'successMessage'
  | 'versionLabel'
  | 'updateLog'
  | 'legalContact'
  | 'privacyPolicy'
  | 'loginLogo'
  | 'loginLogoColor'
  | 'loginLogoSize'
  | 'landingCtaTitle'
  | 'landingCtaBody'
  | 'landingCtaButtonLabel'
  | 'landingCtaButtonUrl'
  | 'footerText'
  | 'footerLinks'
  | 'socialLinks'
  | 'formConfiguration'
  | 'backgroundStyle'
  | 'featureFlags'
>;
