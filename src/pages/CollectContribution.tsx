import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { CreditCard, ChevronRight, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSettings } from '../context/SettingsContext';

type UserData = {
  id: string;
  username: string;
  email?: string | null;
};

type ContributionFormData = {
  amount: number;
  first_name: string;
  last_name: string;
  email?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  gennervogt_id: string;
  payment_method?: 'twint' | 'cash';
  consentAccepted?: boolean;
};

const DEFAULT_FORM_CONFIGURATION = {
  fields: {
    email: 'required' as const,
    address: 'required' as const,
    city: 'required' as const,
    postal_code: 'required' as const,
    phone: 'optional' as const
  },
  consentText: null,
  consentRequired: false,
  amountPresets: [20, 40]
};
const CONFETTI_COLORS = ['#f97316', '#22d3ee', '#facc15', '#f43f5e', '#a855f7'];

export function CollectContribution() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const formConfig = settings?.formConfiguration ?? DEFAULT_FORM_CONFIGURATION;
  const fieldConfig = formConfig.fields ?? DEFAULT_FORM_CONFIGURATION.fields;
  const amountPresets = (formConfig.amountPresets?.length ?? 0) > 0
    ? formConfig.amountPresets
    : DEFAULT_FORM_CONFIGURATION.amountPresets;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  const fieldLabel = (label: string, mode: 'required' | 'optional' | 'hidden') =>
    mode === 'optional' ? `${label} (optional)` : label;

  const contributionSchema = useMemo(() => {
    const shape: Record<string, z.ZodTypeAny> = {
      amount: z.number().min(1, 'Bitte einen Betrag wählen'),
      first_name: z.string().min(1, 'Vorname ist erforderlich'),
      last_name: z.string().min(1, 'Nachname ist erforderlich'),
      gennervogt_id: z.string().min(1, 'Bitte eine erfassende Person auswählen'),
      payment_method: z.enum(['twint', 'cash']).optional()
    };

    const emailMode = fieldConfig.email ?? 'required';
    if (emailMode === 'hidden') {
      shape.email = z.string().optional();
    } else if (emailMode === 'required') {
      shape.email = z
        .string()
        .min(1, 'E-Mail-Adresse ist erforderlich')
        .refine((value) => emailPattern.test(value.trim().toLowerCase()), 'Ungültige E-Mail-Adresse');
    } else {
      shape.email = z
        .string()
        .optional()
        .refine((value) => {
          if (!value) {
            return true;
          }
          const trimmed = value.trim();
          if (trimmed.length === 0) {
            return true;
          }
          return emailPattern.test(trimmed.toLowerCase());
        }, 'Ungültige E-Mail-Adresse');
    }

    const stringSchema = (mode: typeof fieldConfig.email, label: string, options?: { max?: number }) => {
      const maxLength = options?.max ?? 200;
      if (mode === 'required') {
        return z.string().min(1, `${label} darf nicht leer sein`).max(maxLength, `${label} ist zu lang`);
      }
      if (mode === 'hidden') {
        return z.string().optional();
      }
      return z.string().max(maxLength, `${label} ist zu lang`).optional();
    };

    shape.address = stringSchema(fieldConfig.address ?? 'required', 'Adresse');
    shape.city = stringSchema(fieldConfig.city ?? 'required', 'Ort');
    shape.postal_code = stringSchema(fieldConfig.postal_code ?? 'required', 'PLZ', { max: 12 });

    const phoneMode = fieldConfig.phone ?? 'optional';
    if (phoneMode === 'hidden') {
      shape.phone = z.string().optional();
    } else if (phoneMode === 'required') {
      shape.phone = z
        .string()
        .min(3, 'Telefonnummer ist erforderlich')
        .max(60, 'Telefonnummer ist zu lang');
    } else {
      shape.phone = z.string().max(60, 'Telefonnummer ist zu lang').optional();
    }

    if (formConfig.consentRequired) {
      shape.consentAccepted = z.literal(true, {
        errorMap: () => ({ message: 'Bitte bestätige deine Zustimmung' })
      });
    } else {
      shape.consentAccepted = z.boolean().optional();
    }

    return z.object(shape);
  }, [fieldConfig.address, fieldConfig.city, fieldConfig.email, fieldConfig.phone, fieldConfig.postal_code, formConfig.consentRequired]);

  const resolver = useMemo(() => zodResolver(contributionSchema), [contributionSchema]);
  const [step, setStep] = useState(1);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [pendingContribution, setPendingContribution] = useState<ContributionFormData | null>(null);
  const [confirmingMethod, setConfirmingMethod] = useState<'twint' | 'cash' | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationDetails, setCelebrationDetails] = useState<{ amount: number; name: string } | null>(null);
  const [celebrationKey, setCelebrationKey] = useState(0);

  const confettiPieces = useMemo(() => {
    if (!showCelebration) {
      return [];
    }

    return Array.from({ length: 36 }, (_, index) => ({
      id: `${celebrationKey}-${index}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 1.5 + Math.random() * 1.5,
      rotation: Math.random() * 360,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length]
    }));
  }, [celebrationKey, showCelebration]);

  const successMessage = settings?.successMessage ?? 'Danke für deinen Beitrag! Gemeinsam erreichen wir unser Ziel.';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    getValues,
    reset,
  } = useForm<ContributionFormData>({
    resolver,
    defaultValues: {
      amount: 0,
      first_name: '',
      last_name: '',
      email: '',
      address: '',
      city: '',
      postal_code: '',
      consentAccepted: formConfig.consentRequired ? false : undefined,
      phone: ''
    }
  });

  useEffect(() => {
    if (fieldConfig.email === 'hidden') {
      setValue('email', '');
    }
    if (fieldConfig.address === 'hidden') {
      setValue('address', '');
    }
    if (fieldConfig.city === 'hidden') {
      setValue('city', '');
    }
    if (fieldConfig.postal_code === 'hidden') {
      setValue('postal_code', '');
    }
    if (fieldConfig.phone === 'hidden') {
      setValue('phone', '');
    }
  }, [fieldConfig.address, fieldConfig.city, fieldConfig.email, fieldConfig.phone, fieldConfig.postal_code, setValue]);

  useEffect(() => {
    if (formConfig.consentRequired) {
      setValue('consentAccepted', false, { shouldDirty: false });
    }
  }, [formConfig.consentRequired, setValue]);

  useEffect(() => {
    async function fetchUsers() {
      try {
        setLoadingUsers(true);
        const data = await api.getGennervogts();
        setUsers(
          data.map((item) => ({
            id: item.id,
            username: item.username,
            email: item.email
          }))
        );

        const currentSelection = getValues('gennervogt_id');
        if (!currentSelection) {
          const defaultId = user && data.some((item) => item.id === user.id)
            ? user.id
            : data[0]?.id ?? '';
          if (defaultId) {
            setValue('gennervogt_id', defaultId);
          }
        }
      } catch (err) {
        console.error('Error fetching users:', err);
        if (user) {
          setUsers([
            {
              id: user.id,
              username: user.username,
              email: user.email
            }
          ]);
          const currentSelection = getValues('gennervogt_id');
          if (!currentSelection) {
            setValue('gennervogt_id', user.id);
          }
        }
      } finally {
        setLoadingUsers(false);
      }
    }

    fetchUsers();
  }, [user, getValues, setValue]);

  useEffect(() => {
    if (user) {
      const current = getValues('gennervogt_id');
      if (!current) {
        setValue('gennervogt_id', user.id);
      }
    }
  }, [user, setValue, getValues]);

  const handleAmountSelection = (amount: number | null) => {
    setError(null);
    setPendingContribution(null);
    setSelectedAmount(amount);
    if (amount !== null) {
      setValue('amount', amount);
      setCustomAmount('');
    }
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomAmount(value);
    setSelectedAmount(null);
    setPendingContribution(null);
    setError(null);
    setValue('amount', parseFloat(value) || 0);
  };

  const onSubmit = async (data: ContributionFormData) => {
    try {
      setError(null);
      
      if (!user) {
        throw new Error('You must be logged in to submit a contribution');
      }

      if (!data.amount || data.amount <= 0) {
        throw new Error('Please select or enter a valid amount');
      }

      const prepared: ContributionFormData = {
        ...data,
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        email: data.email ? data.email.trim().toLowerCase() : '',
        address: data.address ? data.address.trim() : '',
        city: data.city ? data.city.trim() : '',
        postal_code: data.postal_code ? data.postal_code.trim() : '',
        phone: data.phone ? data.phone.trim() : '',
        consentAccepted: data.consentAccepted ?? false
      };

      setPendingContribution(prepared);
      setStep(3);
    } catch (err) {
      console.error('Error submitting contribution:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit contribution');
    }
  };

  const handlePaymentChoice = async (method: 'twint' | 'cash') => {
    if (!pendingContribution || !user) {
      setError('Bitte Formular zuerst ausfüllen.');
      return;
    }

    try {
      setError(null);
      setConfirmingMethod(method);
      await api.createContribution({
        ...pendingContribution,
        payment_method: method
      });
      setPendingContribution(null);
      reset({
        amount: 0,
        first_name: '',
        last_name: '',
        email: '',
        address: '',
        city: '',
        postal_code: '',
        phone: '',
        gennervogt_id: user?.id ?? '',
        consentAccepted: formConfig.consentRequired ? false : undefined
      });
      setSelectedAmount(null);
      setCustomAmount('');
      setStep(1);
      setCelebrationDetails({
        amount: pendingContribution.amount,
        name: `${pendingContribution.first_name} ${pendingContribution.last_name}`.trim()
      });
      setCelebrationKey((prev) => prev + 1);
      setShowCelebration(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Error submitting contribution:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit contribution');
    } finally {
      setConfirmingMethod(null);
    }
  };

  const handleCloseCelebration = () => {
    setShowCelebration(false);
    setCelebrationDetails(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-10">
      <div>
        <h1 className="mb-8 text-3xl font-bold text-white">Beitrag Sammeln</h1>

        {step === 1 && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {amountPresets.map((amount) => (
                <button
                  key={amount}
                  onClick={() => handleAmountSelection(amount)}
                  className={`p-6 rounded-lg text-center transition-colors ${
                    selectedAmount === amount
                      ? 'bg-[var(--primary-color)] text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  <CreditCard className="w-6 h-6 mx-auto mb-2" />
                  <div className="text-2xl font-bold">CHF {Number(amount).toLocaleString('de-CH', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2
                  })}</div>
                  {selectedAmount === amount && (
                    <Check className="w-5 h-5 mx-auto mt-2 text-white" />
                  )}
                </button>
              ))}
              <div className={`p-6 rounded-lg ${
                selectedAmount === null && customAmount
                  ? 'bg-[var(--primary-color)]'
                  : 'bg-white/10'
              }`}>
                <label className="block text-center mb-2 text-gray-300">
                  Custom Amount
                </label>
                <input
                  type="number"
                  value={customAmount}
                  onChange={handleCustomAmountChange}
                  className="w-full bg-white/5 border border-white/20 rounded px-3 py-2 text-white text-center"
                  placeholder="CHF"
                />
              </div>
            </div>

            <button
              onClick={() => {
                setError(null);
                setPendingContribution(null);
                setStep(2);
              }}
              disabled={!selectedAmount && !customAmount}
              className="w-full mt-6 px-6 py-3 bg-[var(--primary-color)] text-white rounded-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Weiter
              <ChevronRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    First Name
                  </label>
                  <input
                    type="text"
                    {...register('first_name')}
                    className="mt-1 block w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2"
                  />
                  {errors.first_name && (
                    <p className="mt-1 text-sm text-red-500">{errors.first_name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    Last Name
                  </label>
                  <input
                    type="text"
                    {...register('last_name')}
                    className="mt-1 block w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2"
                  />
                  {errors.last_name && (
                    <p className="mt-1 text-sm text-red-500">{errors.last_name.message}</p>
                  )}
                </div>
              </div>

              {fieldConfig.email === 'hidden' && <input type="hidden" {...register('email')} />}
              {fieldConfig.email !== 'hidden' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    {fieldLabel('Email', fieldConfig.email ?? 'required')}
                  </label>
                  <input
                    type="email"
                    {...register('email')}
                    className="mt-1 block w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-500">{errors.email.message as string}</p>
                  )}
                </div>
              )}

              {fieldConfig.address === 'hidden' && <input type="hidden" {...register('address')} />}
              {fieldConfig.address !== 'hidden' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    {fieldLabel('Adresse', fieldConfig.address ?? 'required')}
                  </label>
                  <input
                    type="text"
                    {...register('address')}
                    className="mt-1 block w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2"
                  />
                  {errors.address && (
                    <p className="mt-1 text-sm text-red-500">{errors.address.message as string}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {fieldConfig.city === 'hidden' && <input type="hidden" {...register('city')} />}
                {fieldConfig.city !== 'hidden' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      {fieldLabel('Ort', fieldConfig.city ?? 'required')}
                    </label>
                    <input
                      type="text"
                      {...register('city')}
                      className="mt-1 block w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2"
                    />
                    {errors.city && (
                      <p className="mt-1 text-sm text-red-500">{errors.city.message as string}</p>
                    )}
                  </div>
                )}

                {fieldConfig.postal_code === 'hidden' && <input type="hidden" {...register('postal_code')} />}
                {fieldConfig.postal_code !== 'hidden' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      {fieldLabel('PLZ', fieldConfig.postal_code ?? 'required')}
                    </label>
                    <input
                      type="text"
                      {...register('postal_code')}
                      className="mt-1 block w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2"
                    />
                    {errors.postal_code && (
                      <p className="mt-1 text-sm text-red-500">{errors.postal_code.message as string}</p>
                    )}
                  </div>
                )}
              </div>

              {fieldConfig.phone === 'hidden' && <input type="hidden" {...register('phone')} />}
              {fieldConfig.phone !== 'hidden' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300">
                    {fieldLabel('Telefon', fieldConfig.phone ?? 'optional')}
                  </label>
                  <input
                    type="text"
                    {...register('phone')}
                    className="mt-1 block w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2"
                  />
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-500">{errors.phone.message as string}</p>
                  )}
                </div>
              )}

              {formConfig.consentText && (
                <label className="flex items-start gap-3 rounded-lg bg-white/5 px-4 py-3 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    {...register('consentAccepted')}
                    className="mt-1 h-4 w-4 rounded border-white/20 bg-white/10 text-[var(--accent-color)] focus:ring-[var(--accent-color)]"
                  />
                  <span className="leading-snug whitespace-pre-line">{formConfig.consentText}</span>
                </label>
              )}
              {errors.consentAccepted && (
                <p className="text-sm text-red-500">{errors.consentAccepted.message as string}</p>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300">
                  Gennervogt
                </label>
                <select
                  {...register('gennervogt_id')}
                  className="mt-1 block w-full rounded-md bg-white/5 border border-white/20 text-white px-3 py-2"
                  disabled={loadingUsers}
                >
                  {loadingUsers ? (
                    <option value="">Lade Mitglieder...</option>
                  ) : (
                    users.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.email
                          ? `${candidate.username} (${candidate.email})`
                          : candidate.username}
                      </option>
                    ))
                  )}
                </select>
                {errors.gennervogt_id && (
                  <p className="mt-1 text-sm text-red-500">{errors.gennervogt_id.message}</p>
                )}
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500 rounded-md p-3">
                  <p className="text-sm text-red-500">{error}</p>
                </div>
              )}

              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => {
                    setPendingContribution(null);
                    setError(null);
                    setStep(1);
                  }}
                  className="px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20"
                >
                  Zurück
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                className="flex-1 px-6 py-3 bg-[var(--primary-color)] text-white rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? 'Prüfe Eingaben...' : 'Weiter zur Bestätigung'}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-8 space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-white">Zahlungsmethode bestätigen</h2>
              <p className="text-gray-300 mt-2">
                Bitte wähle, wie der Beitrag von CHF{' '}
                <span className="font-semibold text-white">
                  {pendingContribution ? pendingContribution.amount.toFixed(2) : '0.00'}
                </span>{' '}
                bezahlt wird.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handlePaymentChoice('twint')}
                disabled={confirmingMethod !== null}
                className={`p-6 rounded-lg border border-white/20 text-white bg-white/5 hover:bg-white/10 transition-colors ${
                  confirmingMethod === 'twint' ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {confirmingMethod === 'twint' ? 'Speichere...' : 'TWINT'}
              </button>
              <button
                type="button"
                onClick={() => handlePaymentChoice('cash')}
                disabled={confirmingMethod !== null}
                className={`p-6 rounded-lg border border-white/20 text-white bg-white/5 hover:bg-white/10 transition-colors ${
                  confirmingMethod === 'cash' ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {confirmingMethod === 'cash' ? 'Speichere...' : 'Bargeld'}
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500 rounded-md p-3">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20"
              disabled={confirmingMethod !== null}
            >
              Zurück
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCelebration && celebrationDetails && (
          <motion.div
            key={`celebration-${celebrationKey}`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {confettiPieces.map((piece) => (
                <motion.span
                  key={piece.id}
                  className="absolute block w-2 h-5 rounded-full"
                  style={{ left: `${piece.left}%`, backgroundColor: piece.color }}
                  initial={{ y: '-10%', opacity: 0, rotate: piece.rotation }}
                  animate={{ y: '110%', opacity: [1, 1, 0], rotate: piece.rotation + 120 }}
                  transition={{ duration: piece.duration, delay: piece.delay, repeat: Infinity, repeatDelay: 1.5 }}
                />
              ))}
            </div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative max-w-md w-full bg-black/70 border border-white/10 rounded-2xl p-8 text-center space-y-5"
            >
              <div className="text-xs uppercase tracking-widest text-gray-400">Erfolgreich erfasst</div>
              <h2 className="text-3xl font-bold text-white">Danke!</h2>
              <p className="text-gray-200 leading-relaxed">{successMessage}</p>
              <div className="text-3xl font-semibold text-white">CHF {celebrationDetails.amount.toFixed(2)}</div>
              <p className="text-sm text-gray-300">Für {celebrationDetails.name}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={handleCloseCelebration}
                  className="px-5 py-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
                >
                  Weiter sammeln
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCloseCelebration();
                    navigate('/dashboard');
                  }}
                  className="px-5 py-2 rounded-lg bg-[var(--primary-color)] text-white hover:bg-[var(--primary-color-dark)]"
                >
                  Zum Dashboard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
