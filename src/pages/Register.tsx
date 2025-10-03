import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import { UserPlus } from 'lucide-react';

const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Benutzername muss mindestens 3 Zeichen lang sein')
    .regex(/^[a-z0-9_.-]+$/i, 'Nur Buchstaben, Zahlen sowie ._- sind erlaubt'),
  email: z.union([
    z.string().email('Ungültige E-Mail-Adresse'),
    z.literal('')
  ]),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setError('');
      const normalizedEmail = data.email.trim();
      await signUp(
        data.username,
        data.password,
        normalizedEmail === '' ? undefined : normalizedEmail
      );
      navigate('/dashboard');
    } catch (err) {
      console.error('Registration error:', err);
      setError('Failed to create account');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-900 to-black p-4">
      <div className="w-full max-w-md bg-white/10 backdrop-blur-lg rounded-lg shadow-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <UserPlus className="w-12 h-12 text-red-500 mx-auto" />
          <h1 className="text-3xl font-bold text-white">Create Account</h1>
          <p className="text-gray-300">Register a new user account</p>
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
              className="mt-1 block w-full rounded-md bg-white/5 border border-gray-600 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="z.B. gibelguuger"
            />
            {errors.username && (
              <p className="mt-1 text-sm text-red-400">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">
              Email (optional)
            </label>
            <input
              id="email"
              type="email"
              {...register('email')}
              className="mt-1 block w-full rounded-md bg-white/5 border border-gray-600 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Optional: deine E-Mail"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              {...register('password')}
              className="mt-1 block w-full rounded-md bg-white/5 border border-gray-600 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Enter your password"
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              {...register('confirmPassword')}
              className="mt-1 block w-full rounded-md bg-white/5 border border-gray-600 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Confirm your password"
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-400">{errors.confirmPassword.message}</p>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-md p-3">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[var(--primary-color)] text-white rounded-md py-2 px-4 hover:bg-[var(--primary-color-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>

          <p className="text-center text-sm text-gray-400">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-red-400 hover:text-red-300 focus:outline-none focus:underline"
            >
              Sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
