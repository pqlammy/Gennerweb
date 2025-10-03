import React from 'react';
import { Shield, Mail, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AdminProfile() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 flex items-center space-x-4">
        <div className="p-4 bg-red-600/60 rounded-full">
          <Shield className="w-10 h-10 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">Admin Profil</h1>
          <p className="text-gray-300">Verwalte deine Kontoinformationen.</p>
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-lg rounded-lg p-6 space-y-6">
        <div>
          <p className="text-sm text-gray-400 uppercase tracking-wide">Benutzername</p>
          <div className="flex items-center mt-2 space-x-3 text-white">
            <UserIcon className="w-5 h-5 text-gray-300" />
            <span>{user.username}</span>
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-400 uppercase tracking-wide">E-Mail</p>
          <div className="flex items-center mt-2 space-x-3 text-white">
            <Mail className="w-5 h-5 text-gray-300" />
            <span>{user.email ?? 'Keine E-Mail hinterlegt'}</span>
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-400 uppercase tracking-wide">Rolle</p>
          <p className="text-white mt-2">{user.role}</p>
        </div>

        <div className="bg-red-600/10 border border-red-600/40 rounded-lg p-4 text-sm text-gray-200">
          <p>
            Falls du Unterstützung benötigst oder dein Passwort ändern willst, kontaktiere bitte den Systemadministrator.
          </p>
        </div>
      </div>
    </div>
  );
}
