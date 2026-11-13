import { useState, type FormEvent } from 'react';
import { Check, Plus, ShieldCheck, Truck, X } from 'lucide-react';
import { api, type PlatformState } from '../services/api';
import type { RideShareRequest, TransportProviderVehicle, UserAccount } from '../types';

interface ProviderDashboardProps {
  user: UserAccount;
  state: PlatformState;
  onRefreshState: () => Promise<void>;
}

export function ProviderDashboard({ user, state, onRefreshState }: ProviderDashboardProps) {
  const villages = state.nodes.filter((n) => n.kind === 'village');

  const [vehicleName, setVehicleName] = useState('');
  const [vehicleType, setVehicleType] =
    useState<TransportProviderVehicle['vehicleType']>('Authorized Van');
  const [regNumber, setRegNumber] = useState('');
  const [driverName, setDriverName] = useState(user.name);
  const [driverPhone, setDriverPhone] = useState(user.phone || '+91 99002 77341');
  const [totalSeats, setTotalSeats] = useState(12);
  const [baseVillageId, setBaseVillageId] = useState('v_kirugavalu');
  const [assignedRoute, setAssignedRoute] = useState('Kirugavalu – PES Mandya');
  const [feedback, setFeedback] = useState('');

  const handleRegisterVehicle = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback('');
    try {
      await api.registerVehicle({
        providerUserId: user.id,
        vehicleName,
        vehicleType,
        regNumber,
        driverName,
        driverPhone,
        totalSeats,
        baseVillageId,
        assignedRoute,
      });
      setVehicleName('');
      setRegNumber('');
      setFeedback('Vehicle registered and added to verified local feeder fleet.');
      await onRefreshState();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to register vehicle.');
    }
  };

  const handleToggleAvailable = async (v: TransportProviderVehicle) => {
    await api.updateVehicle(v.id, { available: !v.available });
    await onRefreshState();
  };

  const handleTripStatus = async (
    v: TransportProviderVehicle,
    tripStatus: TransportProviderVehicle['tripStatus']
  ) => {
    await api.updateVehicle(v.id, { tripStatus });
    await onRefreshState();
  };

  const handleRideAction = async (
    rideId: string,
    status: RideShareRequest['status']
  ) => {
    await api.updateRideStatus(rideId, status);
    await onRefreshState();
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Registered Feeder Vehicles</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {state.vehicles.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Active / Standby Units</p>
          <p className="mt-1 font-display text-2xl font-bold text-teal-700 tabular-nums">
            {state.vehicles.filter((v) => v.available).length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Open Ride Requests</p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-700 tabular-nums">
            {state.rideRequests.filter((r) => r.status === 'Pending').length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Free Feeder Seats</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {state.vehicles
              .filter((v) => v.available)
              .reduce((s, v) => s + v.availableSeats, 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Incoming Ride Requests + Fleet Vehicles */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Student Shared Ride Requests
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Accepting a request reserves seats on your assigned vehicle and notifies the student.
            </p>

            <div className="mt-4 space-y-3">
              {state.rideRequests.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No ride-sharing requests yet.
                </p>
              ) : (
                state.rideRequests.map((ride) => (
                  <div
                    key={ride.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-900">{ride.studentName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{ride.passengerCount} student(s)</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
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
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {ride.originName} ({ride.pickupPoint}) → {ride.destinationName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        Assigned: {ride.vehicleName} · Shared fare ₹{ride.sharedFarePerStudentInr}/seat
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      {ride.status === 'Pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRideAction(ride.id, 'Accepted')}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRideAction(ride.id, 'Rejected')}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            Reject
                          </button>
                        </>
                      )}
                      {ride.status === 'Accepted' && (
                        <button
                          type="button"
                          onClick={() => void handleRideAction(ride.id, 'En Route')}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Start Trip
                        </button>
                      )}
                      {ride.status === 'En Route' && (
                        <button
                          type="button"
                          onClick={() => void handleRideAction(ride.id, 'Completed')}
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          Mark Completed
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Manage Vehicles & Trip Status
            </h2>
            <div className="mt-4 space-y-3">
              {state.vehicles.map((v) => (
                <div
                  key={v.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-800">{v.regNumber}</span>
                        <span aria-hidden="true">·</span>
                        <span>{v.vehicleType}</span>
                        {v.verified && (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            Verified
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 font-display text-base font-bold text-slate-900">
                        {v.vehicleName}
                      </h3>
                      <p className="text-xs text-slate-600">
                        Route: {v.assignedRoute} · Driver: {v.driverName} · Seats:{' '}
                        <span className="font-mono tabular-nums">
                          {v.availableSeats}/{v.totalSeats}
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggleAvailable(v)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        v.available
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {v.available ? 'Available for Dispatch' : 'Offline'}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-3">
                    <span className="mr-1 text-xs font-medium text-slate-500">Trip Status:</span>
                    {(['Standby', 'Boarding', 'En Route', 'Completed'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => void handleTripStatus(v, st)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                          v.tripStatus === st
                            ? 'bg-slate-900 text-white'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Register New Vehicle */}
        <div className="lg:col-span-5">
          <form onSubmit={handleRegisterVehicle} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-teal-700" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold text-slate-900">
                Register Feeder Vehicle
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Add an authorized local van, minibus, or shared auto to assist rural student
              corridors.
            </p>

            {feedback && (
              <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-900">
                {feedback}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="pv-name" className="block text-xs font-medium text-slate-700">
                  Vehicle Name / Operator
                </label>
                <input
                  id="pv-name"
                  type="text"
                  required
                  value={vehicleName}
                  onChange={(e) => setVehicleName(e.target.value)}
                  placeholder="e.g. Mandya Express Traveller"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pv-type" className="block text-xs font-medium text-slate-700">
                    Vehicle Type
                  </label>
                  <select
                    id="pv-type"
                    value={vehicleType}
                    onChange={(e) =>
                      setVehicleType(e.target.value as TransportProviderVehicle['vehicleType'])
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="Authorized Van">Authorized Van</option>
                    <option value="Minibus">Minibus</option>
                    <option value="Shared Auto">Shared Auto</option>
                    <option value="School Feeder">School Feeder</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pv-reg" className="block text-xs font-medium text-slate-700">
                    Registration Number
                  </label>
                  <input
                    id="pv-reg"
                    type="text"
                    required
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value)}
                    placeholder="KA-11-C-5521"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pv-driver" className="block text-xs font-medium text-slate-700">
                    Driver Name
                  </label>
                  <input
                    id="pv-driver"
                    type="text"
                    required
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="pv-phone" className="block text-xs font-medium text-slate-700">
                    Driver Phone
                  </label>
                  <input
                    id="pv-phone"
                    type="text"
                    required
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pv-village" className="block text-xs font-medium text-slate-700">
                    Base Village
                  </label>
                  <select
                    id="pv-village"
                    value={baseVillageId}
                    onChange={(e) => setBaseVillageId(e.target.value)}
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
                  <label htmlFor="pv-seats" className="block text-xs font-medium text-slate-700">
                    Total Seats
                  </label>
                  <input
                    id="pv-seats"
                    type="number"
                    min={3}
                    max={30}
                    value={totalSeats}
                    onChange={(e) => setTotalSeats(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pv-route" className="block text-xs font-medium text-slate-700">
                  Assigned Feeder Route
                </label>
                <input
                  id="pv-route"
                  type="text"
                  value={assignedRoute}
                  onChange={(e) => setAssignedRoute(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Register Vehicle
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
