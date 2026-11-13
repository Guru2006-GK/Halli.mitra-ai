import { AlertTriangle, Bell, CheckCheck, Clock, X } from 'lucide-react';
import type { TransitNotification } from '../types';
import type { StudentTab } from './StudentDashboard';

interface NotificationCenterProps {
  open: boolean;
  notifications: TransitNotification[];
  streamConnected: boolean;
  browserPerm: NotificationPermission | 'unsupported';
  onRequestBrowserPerm: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigateTab: (tab: StudentTab) => void;
  onClose: () => void;
}

export function NotificationCenter({
  open,
  notifications,
  streamConnected,
  browserPerm,
  onRequestBrowserPerm,
  onMarkRead,
  onMarkAllRead,
  onNavigateTab,
  onClose,
}: NotificationCenterProps) {
  if (!open) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
      role="dialog"
      aria-label="Real-Time Transit Notifications"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Bell className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900">
              Transit Alerts ({unreadCount} unread)
            </h2>
            <p className="text-xs text-slate-500">
              {streamConnected ? 'Real-time alert stream active' : 'Reconnecting alert stream...'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Notifications"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        {browserPerm !== 'unsupported' && browserPerm !== 'granted' ? (
          <button
            type="button"
            onClick={onRequestBrowserPerm}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            Enable Desktop Push Alerts
          </button>
        ) : (
          <span className="text-xs text-slate-500">
            10-min arrival & disruption monitoring
          </span>
        )}
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <Clock className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-slate-800">All clear on your route</p>
            <p className="mt-1 text-xs text-slate-500">
              You will be alerted here when your assigned bus is within 10 minutes or if any route
              disruption occurs.
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border p-3.5 transition-colors ${
                n.read
                  ? 'border-slate-200 bg-white'
                  : n.severity === 'critical'
                  ? 'border-red-200 bg-red-50/70'
                  : 'border-amber-200 bg-amber-50/70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  {n.kind === 'arrival_10min' ? (
                    <Clock className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
                  ) : (
                    <AlertTriangle
                      className={`h-3.5 w-3.5 ${
                        n.severity === 'critical' ? 'text-red-700' : 'text-amber-700'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={
                      n.severity === 'critical' ? 'text-red-800' : 'text-amber-900'
                    }
                  >
                    {n.kind === 'arrival_10min' ? '10-Min Arrival Alert' : 'Route Disruption'}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  {new Date(n.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <h3 className="mt-1.5 text-sm font-bold text-slate-900">{n.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{n.message}</p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5">
                {n.actionTab && n.actionLabel ? (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigateTab(n.actionTab!);
                      onMarkRead(n.id);
                      onClose();
                    }}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                  >
                    {n.actionLabel}
                  </button>
                ) : (
                  <span />
                )}

                {!n.read && (
                  <button
                    type="button"
                    onClick={() => onMarkRead(n.id)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
