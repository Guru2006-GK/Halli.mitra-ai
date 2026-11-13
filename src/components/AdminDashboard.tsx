import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Bus as BusIcon,
  Clock,
  Play,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, type PlatformState } from '../services/api';
import type { BusStatus, DemandPredictionResponse } from '../types';
import { TransitMap } from './TransitMap';

export type AdminTab = 'allocation' | 'demand' | 'fleet' | 'providers';

interface AdminDashboardProps {
  state: PlatformState;
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onRefreshState: () => Promise<void>;
}

const CORRIDOR_OPTIONS = [
  { id: 'corridor_malavalli_mandya', label: 'Malavalli – Kirugavalu – PES Mandya' },
  { id: 'corridor_halaguru_mandya', label: 'Halaguru – Malavalli – PES Mandya' },
  { id: 'corridor_koppa_maddur', label: 'Koppa – Maddur – GFGC Maddur' },
  { id: 'corridor_bannur_mysuru', label: 'Bannur – Srirangapatna – Mysuru' },
  { id: 'corridor_pandavapura_mandya', label: 'Pandavapura – Srirangapatna – Mandya' },
];

export function AdminDashboard({
  state,
  activeTab,
  onTabChange,
  onRefreshState,
}: AdminDashboardProps) {
  const [runningAllocation, setRunningAllocation] = useState(false);
  const [togglingCrisis, setTogglingCrisis] = useState(false);
  const [allocToast, setAllocToast] = useState('');

  // Module 7: Demand Predictor state
  const [corridorId, setCorridorId] = useState('corridor_malavalli_mandya');
  const [isExamPeriod, setIsExamPeriod] = useState(state.examCrisis.active);
  const [isHoliday, setIsHoliday] = useState(false);
  const [busCapacityBasis, setBusCapacityBasis] = useState(50);
  const [demandData, setDemandData] = useState<DemandPredictionResponse>(state.demandForecast);

  useEffect(() => {
    if (state.examCrisis.active) {
      setIsExamPeriod(true);
      setIsHoliday(false);
    }
  }, [state.examCrisis.active]);

  useEffect(() => {
    let active = true;
    api
      .predictDemand({ corridorId, isExamPeriod, isHoliday, busCapacityBasis })
      .then((res) => {
        if (active) setDemandData(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [corridorId, isExamPeriod, isHoliday, busCapacityBasis]);

  const handleToggleExamCrisis = async () => {
    setTogglingCrisis(true);
    setAllocToast('');
    try {
      if (state.examCrisis.active) {
        await api.resolveExamCrisis();
        setIsExamPeriod(false);
        setAllocToast('Normal weekday transit operations restored across all corridors.');
      } else {
        await api.activateExamCrisis();
        setIsExamPeriod(true);
        setAllocToast(
          'Examination Day Crisis simulated: 2 government buses offline, +40% demand surge, Malavalli ↔ Kirugavalu flooded, and <2h exam dispatch active.'
        );
      }
      await onRefreshState();
    } finally {
      setTogglingCrisis(false);
    }
  };

  const handleRunAllocation = async () => {
    setRunningAllocation(true);
    setAllocToast('');
    try {
      const res = await api.runAllocation();
      setAllocToast(
        `AI Allocation completed: ${res.allocationReport.totalAllocatedSeats}/${res.allocationReport.totalDemand} student seats allocated.`
      );
      await onRefreshState();
    } finally {
      setRunningAllocation(false);
    }
  };

  const handleBusStatus = async (busId: string, status: BusStatus, etaOverride?: number) => {
    const reason =
      status === 'Cancelled'
        ? 'Mechanical inspection at depot — reallocation triggered'
        : status === 'Delayed'
        ? 'Weather / road traffic delay (+12 min)'
        : undefined;
    await api.updateBusStatus(busId, status, reason, etaOverride);
    await onRefreshState();
  };

  const handleToggleRoadblock = async (edgeId: string) => {
    await api.toggleEdgeBlock(edgeId);
    await onRefreshState();
  };

  const handleToggleVerify = async (vehicleId: string, current: boolean) => {
    await api.updateVehicle(vehicleId, { verified: !current });
    await onRefreshState();
  };

  const { allocationReport, examCrisis } = state;

  return (
    <div className="space-y-6">
      {/* Examination Day Crisis Simulator Banner */}
      <div
        className={`rounded-xl border p-5 ${
          examCrisis.active
            ? 'border-red-300 bg-red-50'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={`h-4 w-4 ${examCrisis.active ? 'text-red-700' : 'text-amber-700'}`}
                aria-hidden="true"
              />
              <h2 className="font-display text-base font-bold text-slate-900">
                {examCrisis.active
                  ? 'Examination Day Crisis Active · Emergency Coordination Mode'
                  : 'Examination Day Crisis Simulator'}
              </h2>
            </div>
            <p className="text-xs leading-relaxed text-slate-700">
              Stress-tests all 7 modules simultaneously: <strong>2 government buses offline</strong>{' '}
              (technical breakdown), <strong>+40% student demand surge</strong>,{' '}
              <strong>flooded village road (Malavalli ↔ Kirugavalu)</strong>, and{' '}
              <strong>exams starting within 2 hours</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleToggleExamCrisis()}
            disabled={togglingCrisis}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
              examCrisis.active
                ? 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-100'
                : 'bg-red-700 text-white hover:bg-red-800'
            }`}
          >
            {examCrisis.active ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {togglingCrisis ? 'Restoring...' : 'Restore Normal Operations'}
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {togglingCrisis ? 'Activating...' : 'Simulate Exam Day Crisis'}
              </>
            )}
          </button>
        </div>

        {examCrisis.active && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-red-200 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {examCrisis.urgentCohorts.map((cohort) => (
              <div
                key={cohort.id}
                className="rounded-lg border border-red-200 bg-white p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{cohort.villageName}</span>
                  <span className="inline-flex items-center gap-1 font-mono font-bold text-red-700 tabular-nums">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {cohort.minutesUntilExam}m left
                  </span>
                </div>
                <p className="mt-1 text-slate-600">
                  {cohort.examTitle} ({cohort.examStartTime})
                </p>
                <p className="mt-1 font-medium text-teal-800">
                  {cohort.studentCount} surge students · {cohort.assignedFallback}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top KPI Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Total Village Demand{' '}
            {examCrisis.active && (
              <span className="font-semibold text-red-700">(+40% Surge)</span>
            )}
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {allocationReport.totalDemand} Students
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Allocated Bus Seats</p>
          <p className="mt-1 font-display text-2xl font-bold text-teal-700 tabular-nums">
            {allocationReport.totalAllocatedSeats} Seats
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Unserved / Overflow</p>
          <p
            className={`mt-1 font-display text-2xl font-bold tabular-nums ${
              allocationReport.unservedDemand > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {allocationReport.unservedDemand} Students
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Extra Buses Recommended</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {allocationReport.extraBusesSuggested} Buses
          </p>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3" role="tablist" aria-label="Administrator modules">
        {[
          { id: 'allocation', label: '02. Smart Bus Allocation' },
          { id: 'demand', label: '07. AI Demand Predictor' },
          { id: 'fleet', label: '01 & 03. Fleet & Roadblocks' },
          { id: 'providers', label: '06. Providers & Requests' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => onTabChange(t.id as AdminTab)}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === t.id
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* MODULE 2: SMART BUS ALLOCATION */}
      {activeTab === 'allocation' && (
        <div className="space-y-5">
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Intelligent Demand-Priority Bus Allocation
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Prevents overcrowding by enforcing seated capacity limits, prioritizing high-demand
                villages, and dynamically absorbing cancelled routes.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunAllocation}
              disabled={runningAllocation}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              {runningAllocation ? 'Optimizing...' : 'Run AI Allocation'}
            </button>
          </div>

          {allocToast && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-900">
              {allocToast}
            </div>
          )}

          {/* System Alerts */}
          <div className="space-y-2">
            {allocationReport.alerts.map((alert) => (
              <div
                key={alert}
                className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <span>{alert}</span>
              </div>
            ))}
          </div>

          {/* Allocation Plan Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Bus</th>
                    <th className="px-4 py-3">Assigned Villages</th>
                    <th className="px-4 py-3 text-right">Assigned / Cap</th>
                    <th className="px-4 py-3 text-right">Load</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">AI Decision Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allocationReport.plans.map((plan) => (
                    <tr key={plan.busId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 align-top">
                        <p className="font-mono text-xs font-semibold text-slate-900">
                          {plan.busNumber}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{plan.routeName}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-700">
                        {plan.assignedVillages.length === 0 ? (
                          <span className="text-slate-400">None (Bus offline)</span>
                        ) : (
                          plan.assignedVillages
                            .map((v) => `${v.villageName} (${v.studentCount})`)
                            .join(', ')
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        {plan.totalAssigned} / {plan.capacity}
                      </td>
                      <td className="px-4 py-3 align-top text-right font-mono text-xs tabular-nums">
                        {Math.round(plan.loadFactor * 100)}%
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span
                          className={`text-xs font-semibold ${
                            plan.status === 'Optimal'
                              ? 'text-emerald-700'
                              : plan.status === 'Reallocated'
                              ? 'text-teal-700'
                              : plan.status === 'Near Capacity'
                              ? 'text-amber-700'
                              : 'text-red-700'
                          }`}
                        >
                          {plan.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-600">
                        {plan.decisionNote}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 7: AI DEMAND PREDICTOR */}
      {activeTab === 'demand' && (
        <div className="space-y-6">
          {/* Prediction Controls */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-teal-700" aria-hidden="true" />
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    AI Student Demand Predictor
                  </h2>
                  <p className="text-xs text-slate-500">
                    Ordinary Least Squares trend + day-of-week & academic calendar multipliers
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label htmlFor="dem-corridor" className="sr-only">
                    Select corridor
                  </label>
                  <select
                    id="dem-corridor"
                    value={corridorId}
                    onChange={(e) => setCorridorId(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800"
                  >
                    {CORRIDOR_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isExamPeriod}
                    onChange={(e) => {
                      setIsExamPeriod(e.target.checked);
                      if (e.target.checked) setIsHoliday(false);
                    }}
                    className="h-4 w-4 accent-teal-700"
                  />
                  Exam Period (+24%)
                </label>

                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isHoliday}
                    onChange={(e) => {
                      setIsHoliday(e.target.checked);
                      if (e.target.checked) setIsExamPeriod(false);
                    }}
                    className="h-4 w-4 accent-amber-600"
                  />
                  Academic Holiday
                </label>

                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <label htmlFor="bus-cap-basis">Bus Cap:</label>
                  <input
                    id="bus-cap-basis"
                    type="number"
                    min={35}
                    max={65}
                    value={busCapacityBasis}
                    onChange={(e) => setBusCapacityBasis(Number(e.target.value) || 50)}
                    className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
              {demandData.modelSummary}
            </p>
          </div>

          {/* Interactive Recharts Grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-900">
                  7-Day Predicted Student Demand
                </h3>
                <span className="font-mono text-xs text-slate-500">Confidence Band</span>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={demandData.weeklyForecast}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="upperBound"
                      name="Upper Bound"
                      stroke="#94A3B8"
                      fill="#E2E8F0"
                    />
                    <Area
                      type="monotone"
                      dataKey="predictedStudents"
                      name="Predicted Students"
                      stroke="#0F766E"
                      strokeWidth={2.5}
                      fill="#99F6E4"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Peak Travel Hours vs. Dispatch Capacity
                </h3>
                <BarChart3 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={demandData.hourlyProfile}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="hour" tick={{ fontSize: 12, fill: '#475569' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="demand" name="Predicted Boarding" fill="#0F766E" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="capacity" name="Allocated Window Cap" fill="#0F172A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Corridor Growth & Bus Recommendations */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h3 className="font-display text-base font-bold text-slate-900">
                Corridor Demand Growth & Fleet Sizing
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Corridor</th>
                    <th className="px-4 py-3 text-right">Current Daily Avg</th>
                    <th className="px-4 py-3 text-right">Projected Next Week</th>
                    <th className="px-4 py-3 text-right">Growth</th>
                    <th className="px-4 py-3 text-right">Required Buses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {demandData.corridorGrowth.map((cg) => (
                    <tr key={cg.corridorId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{cg.corridorName}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        {cg.currentDailyAvg}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-teal-700 tabular-nums">
                        {cg.projectedNextWeekAvg}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                        +{cg.growthPct}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                        {cg.recommendedBuses}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* FLEET MONITOR & ROADBLOCK CONTROLS */}
      {activeTab === 'fleet' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <BusIcon className="h-5 w-5 text-teal-700" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Fleet Status & Disruption Control
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Toggle any bus between On Time, Delayed, or Cancelled to trigger real-time fleet
                reallocation and student alternative transport alerts.
              </p>

              <div className="mt-4 space-y-3">
                {state.buses.map((bus) => (
                  <div
                    key={bus.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {bus.busNumber}
                        </span>
                        <span className="ml-2 text-xs text-slate-600">{bus.routeName}</span>
                      </div>
                      <span className="font-mono text-xs text-slate-600 tabular-nums">
                        {bus.occupiedSeats}/{bus.capacity} seats
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(['On Time', 'Delayed', 'Cancelled'] as BusStatus[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => void handleBusStatus(bus.id, st)}
                          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                            bus.status === st
                              ? st === 'On Time'
                                ? 'bg-emerald-700 text-white'
                                : st === 'Delayed'
                                ? 'bg-amber-600 text-white'
                                : 'bg-red-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => void handleBusStatus(bus.id, 'On Time', 8)}
                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50"
                      >
                        Dispatch (8m ETA)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-display text-base font-bold text-slate-900">
                Road Corridor Status (Detour Trigger)
              </h3>
              <div className="mt-3 space-y-2">
                {state.edges.slice(0, 6).map((edge) => {
                  const fromName = state.nodes.find((n) => n.id === edge.from)?.name ?? edge.from;
                  const toName = state.nodes.find((n) => n.id === edge.to)?.name ?? edge.to;
                  return (
                    <div
                      key={edge.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-slate-800">
                        {fromName} ↔ {toName} ({edge.distanceKm} km)
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleToggleRoadblock(edge.id)}
                        className={`rounded-md px-2.5 py-1 font-semibold ${
                          edge.blocked
                            ? 'bg-red-600 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {edge.blocked ? 'Blocked (Restore)' : 'Mark Blocked'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <TransitMap
              nodes={state.nodes}
              edges={state.edges}
              buses={state.buses}
              vehicles={state.vehicles}
              heightClass="h-[580px]"
            />
          </div>
        </div>
      )}

      {/* PROVIDERS & STUDENT REQUESTS */}
      {activeTab === 'providers' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Authorized Local Transport Providers
            </h2>
            <div className="mt-4 space-y-3">
              {state.vehicles.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5"
                >
                  <div>
                    <p className="text-xs font-mono text-slate-500">
                      {v.regNumber} · {v.vehicleType} · {v.tripStatus}
                    </p>
                    <p className="mt-0.5 font-semibold text-slate-900">{v.vehicleName}</p>
                    <p className="text-xs text-slate-600">
                      Driver: {v.driverName} · {v.availableSeats}/{v.totalSeats} seats open
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleVerify(v.id, v.verified)}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      v.verified
                        ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                        : 'border border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {v.verified ? 'Verified' : 'Verify Driver'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Student Transportation Requests
            </h2>
            <div className="mt-4 space-y-3">
              {state.transportRequests.map((tr) => (
                <div
                  key={tr.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{tr.studentName}</span>
                    <span
                      className={`text-xs font-semibold ${
                        tr.status === 'Matched'
                          ? 'text-emerald-700'
                          : tr.status === 'Reassigned'
                          ? 'text-teal-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {tr.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {tr.villageName} → {tr.collegeName} · Departs {tr.departureTime}
                  </p>
                  {tr.assignedBusNumber && (
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      Assigned: {tr.assignedBusNumber}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
