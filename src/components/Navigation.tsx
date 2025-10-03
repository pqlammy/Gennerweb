import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  PlusCircle,
  User,
  LogOut,
  BarChart3,
  Users,
  Menu,
  X,
  ClipboardList,
  Settings,
  Activity
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AnimatePresence, motion } from 'framer-motion';
import { useSettings } from '../context/SettingsContext';

type AdminView = 'member' | 'admin';

export function Navigation() {
  const { user, signOut } = useAuth();
  const { settings } = useSettings();
  const isAdmin = user?.role === 'admin';
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia('(max-width: 639px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const handleMediaChange = (event: MediaQueryListEvent) => {
      setIsSmallScreen(event.matches);
    };

    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else {
      mediaQuery.addListener(handleMediaChange);
    }

    return () => {
      if ('removeEventListener' in mediaQuery) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else {
        mediaQuery.removeListener(handleMediaChange);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const handleScroll = () => {
      const shouldCompact = window.scrollY > 120;
      setIsCompact(shouldCompact);
      if (shouldCompact) {
        setMobileOpen(false);
      } else {
        setBubbleOpen(false);
      }
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isSmallScreen]);

  const [adminView, setAdminView] = useState<AdminView>('member');

  useEffect(() => {
    if (!isAdmin) {
      setAdminView('member');
      return;
    }

    if (location.pathname.startsWith('/admin')) {
      setAdminView('admin');
    } else if (location.pathname.startsWith('/dashboard')) {
      setAdminView('member');
    }
  }, [isAdmin, location.pathname]);

  const memberNavItems = useMemo(
    () => [
      { to: '/dashboard', icon: Home, label: 'Übersicht' },
      { to: '/dashboard/collect', icon: PlusCircle, label: 'Beitrag Sammeln' },
      { to: '/dashboard/settlement', icon: ClipboardList, label: 'Abrechnung' },
      { to: '/dashboard/profile', icon: User, label: 'Profil' }
    ],
    []
  );

  const adminNavItems = useMemo(() => {
    const base = [
      { to: '/admin', icon: Home, label: 'Übersicht' },
      { to: '/admin/stats', icon: BarChart3, label: 'Auswertung' },
      { to: '/admin/members', icon: Users, label: 'Mitglieder' },
      { to: '/admin/settings', icon: Settings, label: 'Einstellungen' },
      { to: '/admin/profile', icon: User, label: 'Profil' }
    ];

    if (settings?.featureFlags?.healthMonitor) {
      base.splice(2, 0, { to: '/admin/health', icon: Activity, label: 'Health Monitor' });
    }

    return base;
  }, [settings?.featureFlags?.healthMonitor]);

  const isAdminView = isAdmin && adminView === 'admin';
  const navItems = isAdmin ? (isAdminView ? adminNavItems : memberNavItems) : memberNavItems;

  const handleViewSwitch = (nextView: AdminView) => {
    if (!isAdmin || nextView === adminView) {
      return;
    }

    setAdminView(nextView);
    const target = nextView === 'admin' ? '/admin' : '/dashboard';
    if (!location.pathname.startsWith(target)) {
      navigate(target);
    }
    setMobileOpen(false);
    setBubbleOpen(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setMobileOpen(false);
      setBubbleOpen(false);
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  const handleNavItemClick = () => {
    setMobileOpen(false);
    setBubbleOpen(false);
  };

  const navItemClass =
    'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors';

  const navTitle = settings?.navTitle?.trim().length ? settings.navTitle.trim() : 'Genner Gibelguuger';
  const navSubtitle = settings?.navSubtitle?.trim().length ? settings.navSubtitle.trim() : 'Mitgliederbereich';
  const brandMotto = settings?.brandMotto?.trim() ?? '';

  const brandClasses = useMemo(
    () =>
      `font-bold text-white transition-[font-size] duration-300 ${
        isCompact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
      }`,
    [isCompact]
  );

  const sublineClasses = useMemo(
    () =>
      `text-xs text-gray-300 hidden sm:block transition-opacity duration-300 ${
        isCompact ? 'opacity-70' : 'opacity-100'
      }`,
    [isCompact]
  );

  const areaLabel = isAdmin
    ? isAdminView
      ? 'Admin Bereich'
      : 'Mitgliederbereich'
    : 'Mitgliederbereich';

  const computedSubtitle = useMemo(() => {
    if (!navSubtitle) {
      return areaLabel;
    }
    if (navSubtitle === areaLabel) {
      return navSubtitle;
    }
    return `${navSubtitle} · ${areaLabel}`;
  }, [areaLabel, navSubtitle]);

  const viewSwitchClass = (mode: AdminView) =>
    `px-3 py-1 text-xs font-medium transition-colors rounded-full ${
      adminView === mode
        ? 'bg-primary text-white shadow'
        : 'text-gray-300 hover:text-white hover:bg-white/10'
    }`;

  const renderNavLink = (item: typeof navItems[number]) => (
    <NavLink
      key={item.to}
      to={item.to}
      onClick={handleNavItemClick}
      className={({ isActive }) =>
        `${navItemClass} ${
          isActive
            ? 'bg-primary text-white'
            : 'text-gray-300 hover:bg-primary-soft hover:text-white'
        }`
      }
    >
      <item.icon className="w-4 h-4 mr-2" />
      {item.label}
    </NavLink>
  );
  const showExpanded = !isCompact || mobileOpen;

  return (
    <nav className="pointer-events-none fixed inset-x-0 top-0 z-40">
      <AnimatePresence initial={false} mode="wait">
        {showExpanded ? (
          <motion.div
            key="expanded"
            layout
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="pointer-events-auto"
          >
            <div
              className="mx-auto mt-2 flex max-w-7xl items-center justify-between gap-4 rounded-3xl bg-black/70 px-4 py-3 shadow-2xl backdrop-blur-xl sm:mt-4 sm:px-6"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (isSmallScreen) {
                      setBubbleOpen(false);
                      setMobileOpen((prev) => !prev);
                    }
                  }}
                  className={`text-left ${
                    isSmallScreen ? 'flex-1' : 'cursor-default'
                  } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]`}
                >
                  <h1 className={brandClasses}>{navTitle}</h1>
                  <p className={sublineClasses}>{computedSubtitle}</p>
                </button>

                {isAdmin && (
                  <div className="hidden items-center sm:flex">
                    <div className="mr-3 inline-flex rounded-full bg-white/10 p-1">
                      <button
                        type="button"
                        onClick={() => handleViewSwitch('member')}
                        className={viewSwitchClass('member')}
                      >
                        Mitglieder
                      </button>
                      <button
                        type="button"
                        onClick={() => handleViewSwitch('admin')}
                        className={viewSwitchClass('admin')}
                      >
                        Admin
                      </button>
                    </div>
                  </div>
                )}

                <div className="hidden items-center space-x-3 sm:flex">
                  {navItems.map(renderNavLink)}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {user?.username && (
                  <span
                    className={`hidden text-gray-300 transition-opacity sm:block ${
                      isCompact && !isSmallScreen ? 'opacity-70' : 'opacity-100'
                    }`}
                  >
                    Hallo, {user.username}
                  </span>
                )}
                <button
                  onClick={handleSignOut}
                  className="hidden items-center rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-primary-soft hover:text-white sm:flex"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Abmelden</span>
                </button>
                <button
                  onClick={() => {
                    setBubbleOpen(false);
                    setMobileOpen((prev) => !prev);
                  }}
                  className="rounded-md p-2 text-gray-200 transition-colors hover:bg-primary-soft hover:text-white sm:hidden"
                  aria-label={mobileOpen ? 'Menü schließen' : 'Menü öffnen'}
                >
                  {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                {isCompact && (
                  <button
                    type="button"
                    onClick={() => setBubbleOpen(false)}
                    className="inline-flex rounded-md p-2 text-gray-300 transition-colors hover:bg-white/10"
                    aria-label="Navigation minimieren"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="bubble"
            type="button"
            initial={{ opacity: 0, scale: 0.85, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={() => {
              if (isSmallScreen) {
                setMobileOpen(false);
              }
              setBubbleOpen(true);
            }}
            className="pointer-events-auto ml-auto mr-4 mt-3 flex items-center gap-3 rounded-full bg-black/75 px-4 py-3 text-left shadow-2xl backdrop-blur-2xl hover:bg-black/80"
            aria-label="Navigation öffnen"
          >
            <div className="rounded-full bg-[var(--accent-color)] p-2 text-white shadow-lg">
              <Menu className="h-5 w-5" />
            </div>
            <div className="hidden sm:block">
              <p className="text-xs uppercase tracking-wide text-gray-300">Menü</p>
              <p className="text-sm font-semibold text-white">{navTitle}</p>
              {brandMotto && <p className="text-[11px] text-gray-400">{brandMotto}</p>}
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {mobileOpen && (
        <div className="pointer-events-auto border-t border-white/10 bg-black/85 backdrop-blur-md sm:hidden">
          <div className="space-y-3 px-4 py-4">
            <div>
              <p className="text-base font-semibold text-white">{navTitle}</p>
              {navSubtitle && <p className="text-xs text-gray-400">{navSubtitle}</p>}
              {brandMotto && <p className="text-[11px] text-gray-500">{brandMotto}</p>}
            </div>
            {user?.username && <div className="text-sm text-gray-300">Hallo, {user.username}</div>}
            {isAdmin && (
              <div className="flex rounded-lg bg-white/10 p-1 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => handleViewSwitch('member')}
                  className={`flex-1 rounded-md px-3 py-1 ${
                    adminView === 'member'
                      ? 'bg-primary text-white shadow'
                      : 'text-gray-200 hover:bg-white/10'
                  }`}
                >
                  Mitglieder
                </button>
                <button
                  type="button"
                  onClick={() => handleViewSwitch('admin')}
                  className={`flex-1 rounded-md px-3 py-1 ${
                    adminView === 'admin'
                      ? 'bg-primary text-white shadow'
                      : 'text-gray-200 hover:bg-white/10'
                  }`}
                >
                  Admin
                </button>
              </div>
            )}
            {navItems.map(renderNavLink)}
            <button
              onClick={handleSignOut}
              className="flex w-full items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-primary-soft hover:text-white"
            >
              <LogOut className="mr-2 h-4 w-4" /> Abmelden
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {bubbleOpen && (
          <motion.div
            className="pointer-events-auto fixed inset-0 z-40 flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setBubbleOpen(false)}
          >
            <motion.div
              onClick={(event) => event.stopPropagation()}
              className={`space-y-3 rounded-2xl border border-white/10 bg-black/85 p-4 shadow-2xl backdrop-blur-2xl ${
                isSmallScreen
                  ? 'mx-auto my-6 w-[calc(100%-2rem)]'
                  : 'mt-16 mr-6 w-64'
              }`}
              initial={{ scale: 0.9, opacity: 0, y: -12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-gray-400">Navigation</p>
                  <p className="text-sm font-semibold text-white">{navTitle}</p>
                  {brandMotto && (
                    <p className="text-[11px] text-gray-400">{brandMotto}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setBubbleOpen(false)}
                  className="rounded-md p-1 text-gray-300 transition-colors hover:bg-white/10"
                  aria-label="Navigation schließen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {isAdmin && (
                <div className="flex rounded-lg bg-white/10 p-1 text-xs font-medium text-gray-200">
                  <button
                    type="button"
                    onClick={() => handleViewSwitch('member')}
                    className={`flex-1 rounded-md px-2 py-1 ${
                      adminView === 'member'
                        ? 'bg-primary text-white shadow'
                        : 'text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    Mitglieder
                  </button>
                  <button
                    type="button"
                    onClick={() => handleViewSwitch('admin')}
                    className={`flex-1 rounded-md px-2 py-1 ${
                      adminView === 'admin'
                        ? 'bg-primary text-white shadow'
                        : 'text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    Admin
                  </button>
                </div>
              )}
              <div className="flex flex-col space-y-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={handleNavItemClick}
                    className={({ isActive }) =>
                      `${navItemClass} ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'text-gray-200 hover:bg-primary-soft hover:text-white'
                      }`
                    }
                  >
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
              <div className="border-t border-white/10 pt-3">
                {user?.username && <p className="text-xs text-gray-400">Angemeldet als {user.username}</p>}
                <button
                  onClick={handleSignOut}
                  className="mt-2 flex w-full items-center justify-center rounded-md bg-primary-soft px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-color)]"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Abmelden
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
