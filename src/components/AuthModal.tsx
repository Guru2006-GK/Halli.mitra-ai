import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { LocationNode, UserAccount, UserRole } from '../types';
import { api } from '../services/api';

interface AuthModalProps {
  open: boolean;
  initialMode: 'login' | 'register';
  nodes: LocationNode[];
  onClose: () => void;
  onSuccess: (user: UserAccount) => void;
}

export function AuthModal({ open, initialMode, nodes, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('ananya@student.hallimitra.in');
  const [password, setPassword] = useState('demo123');
  const [role, setRole] = useState<UserRole>('student');
  const [villageId, setVillageId] = useState('v_kirugavalu');
  const [collegeId, setCollegeId] = useState('c_pes_mandya');
  const [phone, setPhone] = useState('+91 98451 22410');
  const [emergencyContact, setEmergencyContact] = useState('+91 98451 00112');
  const [departureTime, setDepartureTime] = useState('07:45');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const villages = nodes.filter((n) => n.kind === 'village');
  const colleges = nodes.filter((n) => n.kind === 'college');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register({
              name,
              email,
              password,
              role,
              villageId,
              collegeId,
              phone,
              emergencyContact,
              departureTime,
            });
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async (demoRole: UserRole) => {
    setError('');
    setLoading(true);
    try {
      const user = await api.demoLogin(demoRole);
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="auth-modal-title" className="font-display text-xl font-bold text-slate-900">
              {mode === 'login' ? 'Sign in to HALLI.MITRA' : 'Register for ROUTELESS'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {mode === 'login'
                ? 'Access your Student, Administrator, or Transport Provider workspace.'
                : 'Create a verified commuter or provider profile.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
              mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {mode === 'register' && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-medium text-slate-700">
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Karthik M."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-role" className="block text-xs font-medium text-slate-700">
                    Account Role
                  </label>
                  <select
                    id="auth-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  >
                    <option value="student">Student Commuter</option>
                    <option value="provider">Transport Provider</option>
                    <option value="admin">Transit Administrator</option>
                  </select>
                </div>
              </div>

              {role === 'student' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="auth-village" className="block text-xs font-medium text-slate-700">
                      Home Village
                    </label>
                    <select
                      id="auth-village"
                      value={villageId}
                      onChange={(e) => setVillageId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                    >
                      {villages.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="auth-college" className="block text-xs font-medium text-slate-700">
                      College / School
                    </label>
                    <select
                      id="auth-college"
                      value={collegeId}
                      onChange={(e) => setCollegeId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                    >
                      {colleges.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="auth-phone" className="block text-xs font-medium text-slate-700">
                    Phone Number
                  </label>
                  <input
                    id="auth-phone"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-emergency" className="block text-xs font-medium text-slate-700">
                    Emergency Contact
                  </label>
                  <input
                    id="auth-emergency"
                    type="text"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-depart" className="block text-xs font-medium text-slate-700">
                    Departure Time
                  </label>
                  <input
                    id="auth-depart"
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@college.edu"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-teal-700 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
          >
            {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="text-xs font-medium text-slate-500">Quick 1-Click Role Access</p>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleDemo('student')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              Student Demo
            </button>
            <button
              type="button"
              onClick={() => handleDemo('admin')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              Admin Demo
            </button>
            <button
              type="button"
              onClick={() => handleDemo('provider')}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              Provider Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
