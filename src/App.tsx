import { useCallback, useEffect, useState } from 'react';
import { Bell, Bot, LogOut, Menu, UserCheck, X } from 'lucide-react';
import { api, type PlatformState } from './services/api';
import type { TransitNotification, UserAccount, UserRole } from './types';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';
import { NotificationCenter } from './components/NotificationCenter';
import { StudentDashboard, type StudentTab } from './components/StudentDashboard';
import { AdminDashboard, type AdminTab } from './components/AdminDashboard';
import { ProviderDashboard } from './components/ProviderDashboard';

export default function App() {
  const [state, setState] = useState<PlatformState | null>(null);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [aiOpen, setAiOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [notifications, setNotifications] = useState<TransitNotification[]>([]);
  const [liveAlert, setLiveAlert] = useState<TransitNotification | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  const [studentTab, setStudentTab] = useState<StudentTab>('tracker');
  const [adminTab, setAdminTab] = useState<AdminTab>('allocation');

  const refreshState = useCallback(async () => {
    const nextState = await api.getState();
    setState(nextState);
    if (Array.isArray(nextState.notifications)) {
      setNotifications(nextState.notifications);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart');

    async function init() {
      try {
        const [platformState, meRes] = await Promise.all([api.getState(), api.getMe()]);
        if (!active) return;
        setState(platformState);
        if (Array.isArray(platformState.notifications)) {
          setNotifications(platformState.notifications);
        }

        if (meRes.user) {
          setUser(meRes.user);
        } else if (autostart) {
          const role: UserRole =
            autostart === 'admin' || autostart === 'provider' ? autostart : 'student';
          const demoUser = await api.demoLogin(role);
          if (active) {
            setUser(demoUser);
            const refreshed = await api.getState();
            if (active) {
              setState(refreshed);
              setNotifications(refreshed.notifications || []);
            }
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load HALLI.MITRA state.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, []);

  // Real-time Server-Sent Events stream for student arrival & disruption alerts
  useEffect(() => {
    if (!user || user.role !== 'student') {
      setStreamConnected(false);
      return;
    }

    const es = new EventSource(`/api/notifications/stream?userId=${encodeURIComponent(user.id)}`);

    es.addEventListener('connected', () => {
      setStreamConnected(true);
    });

    es.addEventListener('notification', (event) => {
      try {
        const incoming = JSON.parse((event as MessageEvent).data) as TransitNotification;
        setNotifications((prev) => {
          if (prev.some((n) => n.id === incoming.id)) return prev;
          return [incoming, ...prev];
        });
        setLiveAlert(incoming);

        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(incoming.title, { body: incoming.message });
          } catch {
            // ignore browser notification restrictions
          }
        }
      } catch {
        // ignore malformed event payload
      }
    });

    es.addEventListener('state_update', () => {
      void refreshState();
    });

    es.onerror = () => {
      setStreamConnected(false);
    };

    return () => {
      es.close();
      setStreamConnected(false);
    };
  }, [user, refreshState]);

  const handleRequestBrowserPerm = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setBrowserPerm(perm);
  };

  const handleMarkNotifRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    if (liveAlert?.id === id) setLiveAlert(null);
    await api.markNotificationRead(id);
  };

  const handleMarkAllNotifRead = async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setLiveAlert(null);
    await api.markAllNotificationsRead(user.id);
  };

  const handleDemoEnter = async (role: UserRole, activateCrisis = false) => {
    const demoUser = await api.demoLogin(role);
    setUser(demoUser);
    setLiveAlert(null);
    if (activateCrisis) {
      await api.activateExamCrisis();
    }
    await refreshState();
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleLogout = async () => {
    await api.logout();
    setUser(null);
    setNotifications([]);
    setLiveAlert(null);
    setMobileNavOpen(false);
  };

  if (loading && !state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="space-y-2 text-center">
          <p className="font-display text-lg font-bold text-slate-900">HALLI.MITRA</p>
          <p className="text-sm text-slate-500">Loading rural transit network...</p>
        </div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center">
          <p className="font-display text-lg font-bold text-slate-900">Network Unavailable</p>
          <p className="mt-2 text-sm text-red-700">{error || 'Unable to connect to server.'}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LandingPage
          busCount={state.buses.length}
          villageCount={state.nodes.filter((n) => n.kind === 'village').length}
          vehicleCount={state.vehicles.length}
          carpoolCount={state.carpools.length}
          onOpenAuth={(mode) => {
            setAuthMode(mode);
            setAuthModalOpen(true);
          }}
          onDemoEnter={(role, activateCrisis) => void handleDemoEnter(role, activateCrisis)}
        />
        <AuthModal
          open={authModalOpen}
          initialMode={authMode}
          nodes={state.nodes}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            setAuthModalOpen(false);
            void refreshState();
          }}
        />
      </>
    );
  }

  const studentNavItems: { id: StudentTab; label: string }[] = [
    { id: 'tracker', label: 'Smart Bus Tracker' },
    { id: 'optimizer', label: 'AI Route Optimizer' },
    { id: 'alternatives', label: 'Alternatives & Rides' },
    { id: 'carpool', label: 'Carpool & Bikepool' },
    { id: 'field', label: 'Exam Crisis & Field Cases' },
  ];

  const adminNavItems: { id: AdminTab; label: string }[] = [
    { id: 'allocation', label: 'Bus Allocation' },
    { id: 'demand', label: 'Demand Predictor' },
    { id: 'fleet', label: 'Fleet & Roadblocks' },
    { id: 'providers', label: 'Providers & Requests' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white p-5 lg:flex">
        <div>
          <div className="pb-4 border-b border-slate-200">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900">
              HALLI.MITRA
            </span>
            <p className="mt-1 text-xs text-slate-500">ROUTELESS · The Last Mile</p>
          </div>

          <div className="mt-5">
            <p className="text-xs font-medium text-slate-400">Workspace Navigation</p>
            <nav className="mt-2 space-y-1" aria-label="Dashboard sidebar">
              {user.role === 'student' &&
                studentNavItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStudentTab(item.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      studentTab === item.id
                        ? 'bg-teal-50 text-teal-800 font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}

              {user.role === 'admin' &&
                adminNavItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAdminTab(item.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      adminTab === item.id
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}

              {user.role === 'provider' && (
                <div className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">
                  Fleet & Ride Dispatch
                </div>
              )}
            </nav>
          </div>

          {/* Role Switcher for Hackathon / Evaluation */}
          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-xs font-medium text-slate-400">Switch Role View</p>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {([
                { id: 'student', label: 'Student Dashboard' },
                { id: 'admin', label: 'Admin Dashboard' },
                { id: 'provider', label: 'Provider Dashboard' },
              ] as { id: UserRole; label: string }[]).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => void handleDemoEnter(r.id)}
                  className={`rounded-lg border px-3 py-1.5 text-left text-xs font-semibold ${
                    user.role === r.id
                      ? 'border-teal-700 bg-teal-700 text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center gap-2 text-xs text-slate-700">
            <UserCheck className="h-4 w-4 text-teal-700 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{user.name}</p>
              <p className="capitalize text-slate-500">{user.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen((o) => !o)}
                aria-label="Toggle workspace menu"
                className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
              >
                {mobileNavOpen ? (
                  <X className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Menu className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {user.role === 'student'
                    ? 'Student'
                    : user.role === 'admin'
                    ? 'Admin'
                    : 'Provider'}{' '}
                  · {user.name}
                </p>
                <p className="hidden text-xs text-slate-500 sm:block">
                  Unified Rural Student Mobility Ecosystem
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {user.role === 'student' && (
                <button
                  type="button"
                  onClick={() => setNotifOpen(true)}
                  aria-label={
                    notifications.filter((n) => !n.read).length > 0
                      ? `Transit alerts, ${notifications.filter((n) => !n.read).length} unread`
                      : 'Transit alerts'
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Bell className="h-4 w-4 text-slate-700" aria-hidden="true" />
                  <span>Alerts</span>
                  {notifications.filter((n) => !n.read).length > 0 && (
                    <span className="font-mono text-xs font-bold text-amber-700 tabular-nums">
                      ({notifications.filter((n) => !n.read).length})
                    </span>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0"
              >
                <Bot className="h-4 w-4" aria-hidden="true" />
                Ask Transit AI
              </button>
            </div>
          </div>

          {/* Mobile Drawer Menu */}
          {mobileNavOpen && (
            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 lg:hidden">
              <div className="flex flex-wrap gap-1.5">
                {([
                  { id: 'student', label: 'Student' },
                  { id: 'admin', label: 'Admin' },
                  { id: 'provider', label: 'Provider' },
                ] as { id: UserRole; label: string }[]).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      void handleDemoEnter(r.id);
                      setMobileNavOpen(false);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      user.role === r.id
                        ? 'bg-teal-700 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-7xl">
            {user.role === 'student' && (
              <StudentDashboard
                user={user}
                state={state}
                activeTab={studentTab}
                onTabChange={setStudentTab}
                onRefreshState={refreshState}
                notifications={notifications}
                liveAlert={liveAlert}
                streamConnected={streamConnected}
                onDismissLiveAlert={() => setLiveAlert(null)}
                onOpenNotifications={() => setNotifOpen(true)}
                onMarkNotificationRead={(id) => void handleMarkNotifRead(id)}
              />
            )}

            {user.role === 'admin' && (
              <AdminDashboard
                state={state}
                activeTab={adminTab}
                onTabChange={setAdminTab}
                onRefreshState={refreshState}
              />
            )}

            {user.role === 'provider' && (
              <ProviderDashboard
                user={user}
                state={state}
                onRefreshState={refreshState}
              />
            )}
          </div>
        </main>
      </div>

      <AiAssistantDrawer
        open={aiOpen}
        userRole={user.role}
        onClose={() => setAiOpen(false)}
      />

      {user.role === 'student' && (
        <NotificationCenter
          open={notifOpen}
          notifications={notifications}
          streamConnected={streamConnected}
          browserPerm={browserPerm}
          onRequestBrowserPerm={() => void handleRequestBrowserPerm()}
          onMarkRead={(id) => void handleMarkNotifRead(id)}
          onMarkAllRead={() => void handleMarkAllNotifRead()}
          onNavigateTab={(tab) => setStudentTab(tab)}
          onClose={() => setNotifOpen(false)}
        />
      )}
    </div>
  );
}
