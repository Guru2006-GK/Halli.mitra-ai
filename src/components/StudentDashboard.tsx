import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Bell,
  Bus as BusIcon,
  Car,
  CheckCircle2,
  Clock,
  Compass,
  Navigation,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { api, type PlatformState } from '../services/api';
import { resolveStudentAssignedBus } from '../engine/notifications';
import type {
  AlternativeOption,
  RouteOptimizationResult,
  TransitNotification,
  UserAccount,
} from '../types';
import { TransitMap } from './TransitMap';
import { StudentFieldStories } from './StudentFieldStories';

export type StudentTab = 'tracker' | 'optimizer' | 'alternatives' | 'carpool' | 'field';

interface StudentDashboardProps {
  user: UserAccount;
  state: PlatformState;
  activeTab: StudentTab;
  onTabChange: (tab: StudentTab) => void;
  onRefreshState: () => Promise<void>;
  notifications: TransitNotification[];
  liveAlert: TransitNotification | null;
  streamConnected: boolean;
  onDismissLiveAlert: () => void;
  onOpenNotifications: () => void;
  onMarkNotificationRead: (id: string) => void;
}

export function StudentDashboard({
  user,
  state,
  activeTab,
  onTabChange,
  onRefreshState,
  notifications,
  liveAlert,
  streamConnected,
  onDismissLiveAlert,
  onOpenNotifications,
  onMarkNotificationRead,
}: StudentDashboardProps) {
  const villages = state.nodes.filter((n) => n.kind === 'village');
  const colleges = state.nodes.filter((n) => n.kind === 'college');

  // Module 1: Bus tracker state
  const [busSearch, setBusSearch] = useState('');
  const [busStatusFilter, setBusStatusFilter] = useState<'ALL' | 'On Time' | 'Delayed' | 'Cancelled'>('ALL');
  const [selectedBusId, setSelectedBusId] = useState<string>(state.buses[0]?.id ?? '');
  const [ticking, setTicking] = useState(false);

  // Student bus seat request
  const [reqVillageId, setReqVillageId] = useState(user.villageId || 'v_kirugavalu');
  const [reqCollegeId, setReqCollegeId] = useState(user.collegeId || 'c_pes_mandya');
  const [reqTime, setReqTime] = useState(user.departureTime || '07:45');
  const [reqFeedback, setReqFeedback] = useState('');

  // Module 3: Route optimizer
  const [optOrigin, setOptOrigin] = useState(user.villageId || 'v_kirugavalu');
  const [optDest, setOptDest] = useState(user.collegeId || 'c_pes_mandya');
  const [optMode, setOptMode] = useState<'fastest' | 'lowest_wait' | 'detour'>('fastest');
  const [blockedEdges, setBlockedEdges] = useState<string[]>([]);
  const [routeResult, setRouteResult] = useState<RouteOptimizationResult | null>(null);
  const [routeAlts, setRouteAlts] = useState<RouteOptimizationResult[]>([]);
  const [routeError, setRouteError] = useState('');
  const [togglingCrisis, setTogglingCrisis] = useState(false);

  // Module 4 & 6: Alternative transport & ride sharing
  const [altVillage, setAltVillage] = useState('v_bannur');
  const [altCollege, setAltCollege] = useState('c_maharaja_mysuru');
  const [altPassengers, setAltPassengers] = useState(2);
  const [alternatives, setAlternatives] = useState<AlternativeOption[]>([]);
  const [rideMessage, setRideMessage] = useState('');
  const [emergencyShareActive, setEmergencyShareActive] = useState(false);

  // Module 5: Carpool / Bikepool
  const [cpFilterVillage, setCpFilterVillage] = useState('ALL');
  const [cpTitle, setCpTitle] = useState('');
  const [cpMode, setCpMode] = useState<'Carpool' | 'Bikepool'>('Bikepool');
  const [cpVillage, setCpVillage] = useState(user.villageId || 'v_kirugavalu');
  const [cpCollege, setCpCollege] = useState(user.collegeId || 'c_pes_mandya');
  const [cpTime, setCpTime] = useState('07:50');
  const [cpSeats, setCpSeats] = useState(4);
  const [cpCost, setCpCost] = useState(20);
  const [cpFeedback, setCpFeedback] = useState('');

  const cancelledBuses = state.buses.filter((b) => b.status === 'Cancelled');
  const assignedBus = resolveStudentAssignedBus({
    userId: user.id,
    villageId: user.villageId,
    collegeId: user.collegeId,
    buses: state.buses,
    transportRequests: state.transportRequests,
  });
  const unreadAlerts = notifications.filter((n) => !n.read);
  const selectedBus = state.buses.find((b) => b.id === selectedBusId) ?? state.buses[0];

  const filteredBuses = state.buses.filter((b) => {
    const matchesQuery =
      !busSearch.trim() ||
      b.busNumber.toLowerCase().includes(busSearch.toLowerCase()) ||
      b.routeName.toLowerCase().includes(busSearch.toLowerCase());
    const matchesStatus = busStatusFilter === 'ALL' || b.status === busStatusFilter;
    return matchesQuery && matchesStatus;
  });

  // Load route optimization whenever optimizer inputs or server roadblocks change
  useEffect(() => {
    if (activeTab !== 'optimizer') return;
    let active = true;
    setRouteError('');
    const serverBlockedIds = state.edges.filter((e) => e.blocked).map((e) => e.id);
    const mergedBlocked = Array.from(new Set([...serverBlockedIds, ...blockedEdges]));
    api
      .optimizeRoute({
        originId: optOrigin,
        destinationId: optDest,
        mode: optMode,
        blockedEdgeIds: mergedBlocked,
      })
      .then((res) => {
        if (!active) return;
        setRouteResult(res.primary);
        setRouteAlts(res.alternatives);
      })
      .catch((err) => {
        if (!active) return;
        setRouteResult(null);
        setRouteError(err instanceof Error ? err.message : 'Unable to optimize route.');
      });
    return () => {
      active = false;
    };
  }, [activeTab, optOrigin, optDest, optMode, blockedEdges, state.edges]);

  // Load alternative vehicles when alternatives tab active
  useEffect(() => {
    if (activeTab !== 'alternatives') return;
    let active = true;
    api
      .getAlternatives(altVillage, altCollege, altPassengers)
      .then((res) => {
        if (active) setAlternatives(res.options);
      })
      .catch(() => {
        if (active) setAlternatives([]);
      });
    return () => {
      active = false;
    };
  }, [activeTab, altVillage, altCollege, altPassengers, state.vehicles]);

  const handleTickGps = async () => {
    setTicking(true);
    try {
      await api.tickBuses();
      await onRefreshState();
    } finally {
      setTicking(false);
    }
  };

  const handleToggleExamCrisis = async () => {
    setTogglingCrisis(true);
    try {
      if (state.examCrisis.active) {
        await api.resolveExamCrisis();
      } else {
        await api.activateExamCrisis();
      }
      await onRefreshState();
    } finally {
      setTogglingCrisis(false);
    }
  };

  const handleOpenFloodDetour = () => {
    setOptOrigin('v_malavalli');
    setOptDest('c_pes_mandya');
    setOptMode('fastest');
    onTabChange('optimizer');
  };

  const handleRequestBus = async (e: FormEvent) => {
    e.preventDefault();
    setReqFeedback('');
    try {
      const res = await api.submitTransportRequest({
        studentId: user.id,
        studentName: user.name,
        villageId: reqVillageId,
        collegeId: reqCollegeId,
        departureTime: reqTime,
      });
      setReqFeedback(
        res.request.status === 'Matched'
          ? `Seat reserved on bus ${res.request.assignedBusNumber}.`
          : 'Bus full or unavailable — request queued and Alternative Transport options unlocked.'
      );
      await onRefreshState();
    } catch (err) {
      setReqFeedback(err instanceof Error ? err.message : 'Could not submit request.');
    }
  };

  const handleBookSharedRide = async (vehicleId?: string) => {
    setRideMessage('');
    try {
      const res = await api.bookRideShare({
        studentId: user.id,
        studentName: user.name,
        originVillageId: altVillage,
        destinationCollegeId: altCollege,
        passengerCount: altPassengers,
        vehicleId,
        emergencySharedWith: user.emergencyContact || '+91 98451 00112',
      });
      setRideMessage(
        `Shared ride requested with ${res.ride.vehicleName} (${res.ride.regNumber}) · ₹${res.ride.sharedFarePerStudentInr}/student · Pickup ETA ${res.ride.etaMinutes} min.`
      );
      await onRefreshState();
    } catch (err) {
      setRideMessage(err instanceof Error ? err.message : 'Unable to book ride.');
    }
  };

  const handleJoinCarpool = async (groupId: string) => {
    setCpFeedback('');
    try {
      await api.joinCarpool(groupId, user.id, user.name);
      setCpFeedback('Joined verified student pool group.');
      await onRefreshState();
    } catch (err) {
      setCpFeedback(err instanceof Error ? err.message : 'Unable to join carpool.');
    }
  };

  const handleCreateCarpool = async (e: FormEvent) => {
    e.preventDefault();
    if (!cpTitle.trim()) return;
    setCpFeedback('');
    const originNode = villages.find((v) => v.id === cpVillage);
    try {
      await api.createCarpool({
        title: cpTitle.trim(),
        mode: cpMode,
        originVillageId: cpVillage,
        destinationCollegeId: cpCollege,
        pickupLandmark: originNode?.pickupPoint || 'Village Main Circle',
        departureTime: cpTime,
        maxSeats: cpSeats,
        estimatedCostPerStudentInr: cpCost,
        creatorId: user.id,
        creatorName: user.name,
      });
      setCpTitle('');
      setCpFeedback('Created new student pool group and listed it for verified commuters.');
      await onRefreshState();
    } catch (err) {
      setCpFeedback(err instanceof Error ? err.message : 'Unable to create carpool.');
    }
  };

  const toggleBlockedEdge = (edgeId: string) => {
    setBlockedEdges((prev) =>
      prev.includes(edgeId) ? prev.filter((id) => id !== edgeId) : [...prev, edgeId]
    );
  };

  const visibleCarpools = state.carpools.filter(
    (c) => cpFilterVillage === 'ALL' || c.originVillageId === cpFilterVillage
  );

  return (
    <div className="space-y-6">
      {/* Real-Time Arrival & Route Disruption Monitor */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <Clock className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-800">
                {streamConnected ? 'Real-Time Alerts Active' : 'Connecting Alert Stream'}
              </span>
              <span aria-hidden="true">·</span>
              <span>10-Min Arrival & Route Disruption Monitor</span>
            </div>
            {assignedBus && (
              <p className="mt-1 text-sm font-medium text-slate-900">
                Assigned Bus <span className="font-mono font-bold">{assignedBus.busNumber}</span> (
                {assignedBus.routeName}) —{' '}
                <span
                  className={`font-semibold tabular-nums ${
                    assignedBus.status === 'Cancelled'
                      ? 'text-red-700'
                      : assignedBus.etaMinutes <= 10
                      ? 'text-amber-700'
                      : 'text-teal-700'
                  }`}
                >
                  {assignedBus.status === 'Cancelled'
                    ? 'Cancelled'
                    : assignedBus.etaMinutes <= 10
                    ? `Arriving in ${assignedBus.etaMinutes} min`
                    : `ETA ${assignedBus.etaMinutes} min`}
                </span>
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenNotifications}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
        >
          <Bell className="h-3.5 w-3.5 text-slate-700" aria-hidden="true" />
          {unreadAlerts.length > 0
            ? `View ${unreadAlerts.length} Alert${unreadAlerts.length > 1 ? 's' : ''}`
            : 'Alert History'}
        </button>
      </div>

      {/* Instant Live SSE Push Notification Banner */}
      {liveAlert && (
        <div
          role="status"
          aria-live="polite"
          className={`flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${
            liveAlert.severity === 'critical'
              ? 'border-red-300 bg-red-50 text-red-950'
              : 'border-amber-300 bg-amber-50 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-3">
            {liveAlert.kind === 'arrival_10min' ? (
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            ) : (
              <AlertTriangle
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  liveAlert.severity === 'critical' ? 'text-red-700' : 'text-amber-700'
                }`}
                aria-hidden="true"
              />
            )}
            <div>
              <p className="text-xs font-semibold">
                {liveAlert.kind === 'arrival_10min' ? '10-Minute Arrival Alert' : 'Route Disruption Alert'}
              </p>
              <p className="mt-0.5 text-sm font-bold">{liveAlert.title}</p>
              <p className="mt-0.5 text-xs">{liveAlert.message}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {liveAlert.actionTab && liveAlert.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  onTabChange(liveAlert.actionTab!);
                  onMarkNotificationRead(liveAlert.id);
                }}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
              >
                {liveAlert.actionLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onDismissLiveAlert}
              aria-label="Dismiss alert"
              className="rounded-lg p-1.5 text-slate-600 hover:bg-white/70 hover:text-slate-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Examination Day Crisis Status & Simulation Strip */}
      {state.examCrisis.active ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-red-950">
                  Examination Day Crisis Active · Exams Within {state.examCrisis.examWindowMinutes} Min
                </p>
                <p className="mt-1 text-xs leading-relaxed text-red-900">
                  2 government buses offline ({cancelledBuses.map((b) => b.busNumber).join(', ')}) ·
                  +40% student demand surge ({state.allocationReport.totalDemand} commuters) ·
                  Malavalli ↔ Kirugavalu flooded.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenFloodDetour}
                className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap"
              >
                Open A* Flood Detour
              </button>
              <button
                type="button"
                onClick={() => {
                  setAltVillage(user.villageId || 'v_kirugavalu');
                  setAltCollege(user.collegeId || 'c_pes_mandya');
                  onTabChange('alternatives');
                }}
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-900 hover:bg-red-100 whitespace-nowrap"
              >
                Book Backup Van
              </button>
              <button
                type="button"
                onClick={() => void handleToggleExamCrisis()}
                disabled={togglingCrisis}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap disabled:opacity-50"
              >
                {togglingCrisis ? 'Restoring...' : 'Restore Normal'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        cancelledBuses.length > 0 && (
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  Service Disruption: {cancelledBuses.map((b) => b.busNumber).join(', ')} cancelled
                </p>
                <p className="mt-0.5 text-xs text-amber-800">
                  {cancelledBuses[0].delayReason || 'Alternative verified local vans are ready for immediate booking.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleToggleExamCrisis()}
                disabled={togglingCrisis}
                className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 whitespace-nowrap disabled:opacity-50"
              >
                {togglingCrisis ? 'Activating...' : 'Simulate Exam Crisis'}
              </button>
              <button
                type="button"
                onClick={() => onTabChange('alternatives')}
                className="rounded-lg bg-amber-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-900 whitespace-nowrap"
              >
                View Alternative Transport
              </button>
            </div>
          </div>
        )
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Student modules">
          {[
            { id: 'tracker', label: '01. Smart Bus Tracker' },
            { id: 'optimizer', label: '03. AI Route Optimizer' },
            { id: 'alternatives', label: '04 & 06. Alternatives & Ride Share' },
            { id: 'carpool', label: '05. Carpool & Bikepool' },
            { id: 'field', label: 'Exam Crisis & Field Cases' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => onTabChange(t.id as StudentTab)}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? 'bg-teal-700 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setEmergencyShareActive((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap shrink-0 ${
            emergencyShareActive
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
        >
          <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
          {emergencyShareActive
            ? `Trip Shared with ${user.emergencyContact || 'Emergency Contact'}`
            : 'Share Trip with Emergency Contact'}
        </button>
      </div>

      {/* MODULE 1: SMART BUS TRACKER */}
      {activeTab === 'tracker' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Live Corridor Bus Map
                </h2>
                <p className="text-xs text-slate-500">
                  Simulated GPS telemetry demonstration · Select any bus pin to view live ETA
                </p>
              </div>
              <button
                type="button"
                onClick={handleTickGps}
                disabled={ticking}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${ticking ? 'animate-spin' : ''}`} aria-hidden="true" />
                Step Simulated GPS
              </button>
            </div>

            <TransitMap
              nodes={state.nodes}
              edges={state.edges}
              buses={state.buses}
              vehicles={state.vehicles}
              selectedBusId={selectedBus?.id}
              onSelectBus={(id) => setSelectedBusId(id)}
            />

            {/* Selected Bus Detail Panel */}
            {selectedBus && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-semibold text-teal-700">
                      Tracking {selectedBus.busNumber} ·{' '}
                      {selectedBus.isSimulatedGps ? 'Simulated GPS Mode' : 'Live GPS'}
                    </p>
                    <h3 className="mt-1 font-display text-base font-bold text-slate-900">
                      {selectedBus.routeName}
                    </h3>
                  </div>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      selectedBus.status === 'On Time'
                        ? 'bg-emerald-50 text-emerald-800'
                        : selectedBus.status === 'Delayed'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-red-50 text-red-800'
                    }`}
                  >
                    {selectedBus.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Estimated Arrival</p>
                    <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {selectedBus.status === 'Cancelled' ? 'Cancelled' : `${selectedBus.etaMinutes} min`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Available Seats</p>
                    <p className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                      {Math.max(0, selectedBus.capacity - selectedBus.occupiedSeats)} / {selectedBus.capacity}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Driver Contact</p>
                    <p className="mt-0.5 font-medium text-slate-900">{selectedBus.driverName}</p>
                  </div>
                </div>

                {selectedBus.nextStops.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-xs font-medium text-slate-500">Upcoming Stops</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-700">
                      {selectedBus.nextStops.map((stop) => (
                        <span key={stop.nodeId} className="font-medium">
                          {stop.name} ({stop.etaMin}m)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right column: Bus Search + Daily Request Form */}
          <div className="space-y-5 lg:col-span-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-base font-bold text-slate-900">
                Available Corridor Buses
              </h3>
              <div className="mt-3 flex flex-col gap-2.5">
                <label htmlFor="bus-search" className="sr-only">
                  Search bus number or village
                </label>
                <input
                  id="bus-search"
                  type="text"
                  value={busSearch}
                  onChange={(e) => setBusSearch(e.target.value)}
                  placeholder="Search bus number or village..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
                <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1">
                  {(['ALL', 'On Time', 'Delayed', 'Cancelled'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setBusStatusFilter(st)}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap ${
                        busStatusFilter === st
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st === 'ALL' ? 'All' : st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                {filteredBuses.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    No buses match this filter. Try clearing the search query.
                  </p>
                ) : (
                  filteredBuses.map((bus) => {
                    const free = Math.max(0, bus.capacity - bus.occupiedSeats);
                    const active = bus.id === selectedBus?.id;
                    return (
                      <button
                        key={bus.id}
                        type="button"
                        onClick={() => setSelectedBusId(bus.id)}
                        className={`w-full rounded-lg border p-3.5 text-left transition-colors ${
                          active
                            ? 'border-teal-700 bg-teal-50/40'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-900">
                            {bus.busNumber}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              bus.status === 'On Time'
                                ? 'text-emerald-700'
                                : bus.status === 'Delayed'
                                ? 'text-amber-700'
                                : 'text-red-700'
                            }`}
                          >
                            {bus.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900">{bus.routeName}</p>
                        <p className="mt-1 text-xs text-slate-500 tabular-nums">
                          {bus.status === 'Cancelled'
                            ? 'Service unavailable — use Alternatives tab'
                            : `ETA ${bus.etaMinutes} min · ${free} seats free of ${bus.capacity}`}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Request Transportation Form */}
            <form onSubmit={handleRequestBus} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-base font-bold text-slate-900">
                Request Daily Seat Allocation
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Reserves a seat on an active bus or flags your village for extra fleet dispatch.
              </p>

              <div className="mt-3.5 space-y-3">
                <div>
                  <label htmlFor="req-village" className="block text-xs font-medium text-slate-700">
                    Pickup Village
                  </label>
                  <select
                    id="req-village"
                    value={reqVillageId}
                    onChange={(e) => setReqVillageId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {villages.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.pickupPoint})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="req-college" className="block text-xs font-medium text-slate-700">
                      Destination College
                    </label>
                    <select
                      id="req-college"
                      value={reqCollegeId}
                      onChange={(e) => setReqCollegeId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {colleges.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="req-time" className="block text-xs font-medium text-slate-700">
                      Preferred Time
                    </label>
                    <input
                      id="req-time"
                      type="time"
                      value={reqTime}
                      onChange={(e) => setReqTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Request Bus Seat
                </button>

                {reqFeedback && (
                  <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-900">
                    {reqFeedback}
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODULE 3: AI ROUTE OPTIMIZER */}
      {activeTab === 'optimizer' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Compass className="h-5 w-5 text-teal-700" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold text-slate-900">
                  A* Rural Route Optimizer
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Computes shortest-time, demand-consolidated, or paved-corridor detour paths across
                18 rural road links.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="opt-origin" className="block text-xs font-medium text-slate-700">
                    Origin Village
                  </label>
                  <select
                    id="opt-origin"
                    value={optOrigin}
                    onChange={(e) => setOptOrigin(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {villages.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="opt-dest" className="block text-xs font-medium text-slate-700">
                    Destination Institution
                  </label>
                  <select
                    id="opt-dest"
                    value={optDest}
                    onChange={(e) => setOptDest(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-700">Optimization Objective</span>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'fastest', label: 'Fastest Time' },
                      { id: 'lowest_wait', label: 'Pickup Density' },
                      { id: 'detour', label: 'Paved Priority' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setOptMode(m.id as typeof optMode)}
                        className={`rounded-lg border px-2.5 py-2 text-xs font-semibold ${
                          optMode === m.id
                            ? 'border-teal-700 bg-teal-700 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs font-medium text-slate-700">
                    Simulate Roadblocks (Watch A* Detour)
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {state.edges.slice(0, 5).map((edge) => {
                      const fromName = state.nodes.find((n) => n.id === edge.from)?.name ?? edge.from;
                      const toName = state.nodes.find((n) => n.id === edge.to)?.name ?? edge.to;
                      const isBlocked = blockedEdges.includes(edge.id) || edge.blocked;
                      return (
                        <label
                          key={edge.id}
                          className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-700">
                            {fromName} ↔ {toName} ({edge.distanceKm} km)
                          </span>
                          <input
                            type="checkbox"
                            checked={isBlocked}
                            onChange={() => toggleBlockedEdge(edge.id)}
                            className="h-4 w-4 accent-red-600"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {routeError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {routeError}
              </div>
            )}

            {routeResult && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Recommended Path
                  </h3>
                  <span className="font-mono text-xs font-semibold text-teal-700 tabular-nums">
                    {routeResult.totalDistanceKm} km · {routeResult.estimatedMinutes} min
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  {routeResult.explanation}
                </p>

                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-medium text-slate-500">Pickup & Drop-off Sequence</p>
                  <ol className="mt-2 space-y-1.5 text-xs text-slate-800">
                    {routeResult.pickupPoints.map((pt, i) => (
                      <li key={pt} className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-teal-700">
                          0{i + 1}
                        </span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {routeAlts.length > 0 && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-xs font-medium text-slate-500">Alternative Computations</p>
                    <div className="mt-2 space-y-1.5">
                      {routeAlts.map((alt) => (
                        <div
                          key={alt.mode}
                          className="flex items-center justify-between text-xs text-slate-600"
                        >
                          <span className="truncate pr-2">{alt.pathNames.join(' → ')}</span>
                          <span className="font-mono shrink-0 tabular-nums">
                            {alt.totalDistanceKm} km / {alt.estimatedMinutes}m
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-7">
            <TransitMap
              nodes={state.nodes}
              edges={state.edges.map((e) => ({
                ...e,
                blocked: e.blocked || blockedEdges.includes(e.id),
              }))}
              buses={state.buses}
              highlightedPath={routeResult?.coordinates ?? null}
              heightClass="h-[560px]"
            />
          </div>
        </div>
      )}

      {/* MODULES 4 & 6: ALTERNATIVE TRANSPORT & SMART RIDE SHARING */}
      {activeTab === 'alternatives' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Verified Alternative Transport & Shared Rides
                  </h2>
                  <p className="text-xs text-slate-500">
                    Ranked by proximity, shared cost affordability, seat capacity, and driver
                    verification.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleBookSharedRide(alternatives[0]?.vehicleId)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                >
                  <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                  Request Emergency Backup Ride
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="alt-village" className="block text-xs font-medium text-slate-700">
                    Pickup Village
                  </label>
                  <select
                    id="alt-village"
                    value={altVillage}
                    onChange={(e) => setAltVillage(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {villages.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="alt-college" className="block text-xs font-medium text-slate-700">
                    Destination College
                  </label>
                  <select
                    id="alt-college"
                    value={altCollege}
                    onChange={(e) => setAltCollege(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="alt-pax" className="block text-xs font-medium text-slate-700">
                    Co-Travelers
                  </label>
                  <input
                    id="alt-pax"
                    type="number"
                    min={1}
                    max={8}
                    value={altPassengers}
                    onChange={(e) => setAltPassengers(Math.max(1, Number(e.target.value)))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>

              {rideMessage && (
                <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs font-medium text-teal-900">
                  {rideMessage}
                </div>
              )}

              <div className="mt-5 space-y-3">
                {alternatives.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                    No authorized vehicles currently match {altPassengers} seats. Reduce group size
                    or check Student Carpooling.
                  </p>
                ) : (
                  alternatives.map((opt, idx) => (
                    <div
                      key={opt.vehicleId}
                      className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-teal-700">
                            {idx === 0 ? 'Top AI Match' : opt.vehicleType}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{opt.regNumber}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Verified Driver
                          </span>
                        </div>
                        <h3 className="font-display text-base font-bold text-slate-900">
                          {opt.vehicleName}
                        </h3>
                        <p className="text-xs text-slate-600">{opt.reason}</p>
                        <p className="text-xs text-slate-500">
                          Driver: {opt.driverName} · Pickup: {opt.pickupLocation} · Safety{' '}
                          {opt.safetyRating}/5
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-row items-center justify-between gap-4 sm:flex-col sm:items-end">
                        <div className="text-left sm:text-right">
                          <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                            ₹{opt.estimatedCostInr}
                            <span className="text-xs font-normal text-slate-500"> /student</span>
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums">
                            ETA {opt.etaMinutes} min · {opt.availableSeats} seats left
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleBookSharedRide(opt.vehicleId)}
                          className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                        >
                          Book Shared Ride
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Active Smart Ride Sharing Bookings */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-base font-bold text-slate-900">
                Your Shared Ride Requests
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Live confirmation status and verified vehicle details shared with your emergency
                contact.
              </p>

              <div className="mt-4 space-y-3">
                {state.rideRequests.map((ride) => (
                  <div
                    key={ride.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {ride.originName} → {ride.destinationName}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          ride.status === 'Accepted' || ride.status === 'Completed'
                            ? 'text-emerald-700'
                            : ride.status === 'Rejected'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {ride.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {ride.vehicleName} ({ride.regNumber}) · Driver: {ride.driverName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 tabular-nums">
                      {ride.passengerCount} student(s) · ₹{ride.sharedFarePerStudentInr}/seat · ETA{' '}
                      {ride.etaMinutes} min
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 5: STUDENT CARPOOLING & BIKEPOOL */}
      {activeTab === 'carpool' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Verified Student Carpool & Bikepool Groups
                </h2>
                <p className="text-xs text-slate-500">
                  Matched by village origin, college destination, and departure window.
                </p>
              </div>
              <div>
                <label htmlFor="cp-filter" className="sr-only">
                  Filter by origin village
                </label>
                <select
                  id="cp-filter"
                  value={cpFilterVillage}
                  onChange={(e) => setCpFilterVillage(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  <option value="ALL">All Villages</option>
                  {villages.map((v) => (
                    <option key={v.id} value={v.id}>
                      From {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {cpFeedback && (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs font-medium text-teal-900">
                {cpFeedback}
              </div>
            )}

            <div className="space-y-3">
              {visibleCarpools.map((group) => {
                const openSeats = Math.max(0, group.maxSeats - group.memberIds.length);
                const alreadyJoined = group.memberIds.includes(user.id);
                return (
                  <div
                    key={group.id}
                    className="rounded-xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-teal-700">
                          {group.mode} · Departs {group.departureTime} · Verified Profiles:{' '}
                          {group.verifiedCount}
                        </p>
                        <h3 className="mt-1 font-display text-base font-bold text-slate-900">
                          {group.title}
                        </h3>
                        <p className="mt-1 text-xs text-slate-600">
                          {group.originName} ({group.pickupLandmark}) → {group.destinationName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-base font-bold text-slate-900 tabular-nums">
                          ₹{group.estimatedCostPerStudentInr}
                          <span className="text-xs font-normal text-slate-500"> /student</span>
                        </p>
                        <p className="text-xs text-slate-500 tabular-nums">
                          {openSeats} of {group.maxSeats} seats open
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
                        <span>Members: {group.memberNames.join(', ')}</span>
                      </div>
                      <button
                        type="button"
                        disabled={alreadyJoined || openSeats === 0}
                        onClick={() => void handleJoinCarpool(group.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {alreadyJoined ? 'Joined' : openSeats === 0 ? 'Group Full' : 'Join Pool Group'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Create New Carpool/Bikepool Form */}
          <div className="lg:col-span-5">
            <form onSubmit={handleCreateCarpool} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <Car className="h-5 w-5 text-teal-700" aria-hidden="true" />
                <h3 className="font-display text-base font-bold text-slate-900">
                  Start a Student Carpool / Bikepool
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Only college-verified peers along your corridor can view and join pickup landmarks.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="cp-title" className="block text-xs font-medium text-slate-700">
                    Group Title
                  </label>
                  <input
                    id="cp-title"
                    type="text"
                    required
                    value={cpTitle}
                    onChange={(e) => setCpTitle(e.target.value)}
                    placeholder="e.g. Malavalli 8 AM Lab Commuters"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cp-mode" className="block text-xs font-medium text-slate-700">
                      Pool Mode
                    </label>
                    <select
                      id="cp-mode"
                      value={cpMode}
                      onChange={(e) => setCpMode(e.target.value as 'Carpool' | 'Bikepool')}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="Bikepool">Bikepool</option>
                      <option value="Carpool">Carpool</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cp-time" className="block text-xs font-medium text-slate-700">
                      Departure Time
                    </label>
                    <input
                      id="cp-time"
                      type="time"
                      value={cpTime}
                      onChange={(e) => setCpTime(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cp-village" className="block text-xs font-medium text-slate-700">
                    Origin Village
                  </label>
                  <select
                    id="cp-village"
                    value={cpVillage}
                    onChange={(e) => setCpVillage(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {villages.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cp-college" className="block text-xs font-medium text-slate-700">
                    Destination College
                  </label>
                  <select
                    id="cp-college"
                    value={cpCollege}
                    onChange={(e) => setCpCollege(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {colleges.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cp-seats" className="block text-xs font-medium text-slate-700">
                      Total Seats
                    </label>
                    <input
                      id="cp-seats"
                      type="number"
                      min={2}
                      max={8}
                      value={cpSeats}
                      onChange={(e) => setCpSeats(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="cp-cost" className="block text-xs font-medium text-slate-700">
                      Shared Cost (₹)
                    </label>
                    <input
                      id="cp-cost"
                      type="number"
                      min={10}
                      max={200}
                      value={cpCost}
                      onChange={(e) => setCpCost(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Create Pool Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EXAM CRISIS SCENARIO & REAL STUDENT FIELD CASES */}
      {activeTab === 'field' && (
        <div className="space-y-8">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs font-semibold text-red-700">
                  Scenario Simulator · Examination Day Stress Test
                </p>
                <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
                  4 Simultaneous Rural Transit Disruptions
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Trigger the full exam-day crisis to observe bus reallocations, A* flood detours,
                  backup van matching, and live SSE alerts in action.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleToggleExamCrisis()}
                disabled={togglingCrisis}
                className={`rounded-lg px-4 py-2.5 text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  state.examCrisis.active
                    ? 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
                    : 'bg-red-700 text-white hover:bg-red-800'
                }`}
              >
                {togglingCrisis
                  ? 'Updating...'
                  : state.examCrisis.active
                  ? 'Restore Normal Operations'
                  : 'Activate Exam Day Crisis'}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">1. Bus Breakdown</p>
                <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                  {cancelledBuses.length} Buses Offline
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {cancelledBuses.length > 0
                    ? cancelledBuses.map((b) => b.busNumber).join(', ')
                    : 'All fleet buses operational'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">2. Demand Surge</p>
                <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                  {state.examCrisis.active ? '+40% Surge' : 'Baseline (1.0×)'}
                </p>
                <p className="mt-1 text-xs text-slate-600 tabular-nums">
                  {state.allocationReport.totalDemand} total village commuters ({state.allocationReport.unservedDemand} overflow)
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">3. Flood Road Blockage</p>
                <p className="mt-1 font-display text-lg font-bold text-slate-900">
                  {state.edges.some((e) => e.blocked) ? 'Malavalli ↔ Kirugavalu' : 'All Corridors Open'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {state.edges.some((e) => e.blocked)
                    ? 'A* detour active via Bannur & Arakeshwar'
                    : 'No flood closures reported'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">4. Exam Time Pressure</p>
                <p className="mt-1 font-display text-lg font-bold text-slate-900 tabular-nums">
                  {state.examCrisis.active ? '< 2 Hours (95 min)' : 'Regular Schedule'}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {state.examCrisis.active
                    ? `${state.examCrisis.urgentCohorts.length} urgent exam cohorts prioritized`
                    : 'Activate crisis to test <2h exam dispatch'}
                </p>
              </div>
            </div>

            {state.examCrisis.active && state.examCrisis.urgentCohorts.length > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                {state.examCrisis.urgentCohorts.map((cohort) => (
                  <div
                    key={cohort.id}
                    className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between font-semibold text-amber-950">
                      <span>{cohort.villageName} → {cohort.collegeName.split(',')[0]}</span>
                      <span className="font-mono text-red-700 tabular-nums">
                        {cohort.minutesUntilExam} min
                      </span>
                    </div>
                    <p className="mt-1 text-amber-900">
                      {cohort.examTitle} · {cohort.studentCount} students
                    </p>
                    <p className="mt-1 font-medium text-teal-800">{cohort.assignedFallback}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <StudentFieldStories onNavigateTab={onTabChange} />
        </div>
      )}
    </div>
  );
}
