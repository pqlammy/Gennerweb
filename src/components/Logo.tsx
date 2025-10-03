import React, { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';

export function Logo({ className = '' }: { className?: string }) {
  const { settings } = useSettings();
  const navTitle = useMemo(
    () => (settings?.navTitle?.trim()?.length ? settings.navTitle.trim() : 'Genner Gibelguuger'),
    [settings?.navTitle]
  );

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src="/logo.svg"
        alt={`${navTitle} Logo`}
        className="h-full w-full"
        style={{ filter: 'invert(19%) sepia(92%) saturate(3868%) hue-rotate(353deg) brightness(85%) contrast(114%)' }}
      />
    </div>
  );
}
