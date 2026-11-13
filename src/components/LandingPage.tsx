import { useState } from 'react';
import { ArrowRight, Bus, MapPin, ShieldCheck } from 'lucide-react';
import heroTransitImg from '../assets/images/hero_rural_transit_1794550281814.jpg';
import routeNetworkImg from '../assets/images/feature_route_network_1794550281265.jpg';
import sharedVanImg from '../assets/images/feature_shared_van_1794550285584.jpg';
import type { UserRole } from '../types';
import { StudentFieldStories } from './StudentFieldStories';

interface LandingPageProps {
  busCount: number;
  villageCount: number;
  vehicleCount: number;
  carpoolCount: number;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onDemoEnter: (role: UserRole, activateCrisis?: boolean) => void;
}

const MODULES = [
  {
    num: '01',
    title: 'Smart Bus Tracker',
    desc: 'Interactive OpenStreetMap tracking with simulated GPS telemetry, live seat counts, stop-by-stop ETAs, and instant disruption alerts.',
    meta: 'Live Map · Simulated GPS Mode',
  },
  {
    num: '02',
    title: 'Smart Bus Allocation',
    desc: 'Demand-priority fleet optimizer that distributes students across buses, caps standing overcrowding, and reallocates routes when buses cancel.',
    meta: 'Capacity Optimization · Dynamic Reallocation',
  },
  {
    num: '03',
    title: 'AI Route Optimizer',
    desc: 'A* and Dijkstra graph routing connecting rural pickup shelters to colleges with automatic detours around blocked roads.',
    meta: 'A* Graph Search · Detour Engine',
  },
  {
    num: '04',
    title: 'Alternative Transport System',
    desc: 'Automatically surfaces verified local vans, minibuses, and shared autos ranked by proximity, fare affordability, and safety.',
    meta: 'Disruption Fallback · Emergency Rides',
  },
  {
    num: '05',
    title: 'Student Carpooling & Bikepool',
    desc: 'Matches verified students travelling from the same village along overlapping departure schedules with transparent cost splitting.',
    meta: 'Verified Profiles · Cost Sharing',
  },
  {
    num: '06',
    title: 'Smart Ride Sharing',
    desc: 'Groups co-traveling students into authorized local vehicles with live driver details, registration info, and emergency contact sharing.',
    meta: 'Authorized Fleet · Trip Sharing',
  },
  {
    num: '07',
    title: 'AI Student Demand Predictor',
    desc: 'Ordinary least squares trend model factoring weekdays, holidays, and exam schedules to forecast peak travel hours and fleet sizing.',
    meta: 'Predictive Analytics · Fleet Planning',
  },
];

export function LandingPage({
  busCount,
  villageCount,
  vehicleCount,
  carpoolCount,
  onOpenAuth,
  onDemoEnter,
}: LandingPageProps) {
  const [heroErr, setHeroErr] = useState(false);
  const [routeErr, setRouteErr] = useState(false);
  const [vanErr, setVanErr] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones, gap-8, single-element Brand wordmark, 4 links, 1 CTA */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            HALLI.MITRA
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#modules" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Modules
            </a>
            <a href="#corridors" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Corridors
            </a>
            <a href="#portals" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Portals
            </a>
            <a href="#safety" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              Safety
            </a>
          </nav>

          <button
            type="button"
            onClick={() => onOpenAuth('login')}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 whitespace-nowrap shrink-0"
          >
            Launch Portal
          </button>
        </div>
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
            <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
              <div className="flex flex-col justify-between lg:col-span-6">
                <div>
                  <p className="text-xs font-medium tracking-wide text-teal-700">
                    ROUTELESS — The Last Mile · Mandya–Mysuru Rural Network
                  </p>
                  <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl text-balance leading-[1.12]">
                    No student misses a class due to rural transit gaps.
                  </h1>
                  <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
                    HALLI.MITRA unifies real-time bus tracking, AI demand forecasting, A* route
                    optimization, dynamic fleet allocation, and verified local shared rides into one
                    connected last-mile platform.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onDemoEnter('student')}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-800 whitespace-nowrap shrink-0"
                  >
                    Open Student Dashboard
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register')}
                    className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Register Student Account
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="relative h-full min-h-[280px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {!heroErr ? (
                    <img
                      src={heroTransitImg}
                      alt="Rural college students waiting at a village shelter as a regional shuttle bus arrives"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroErr(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[300px] flex-col items-center justify-center bg-gradient-to-br from-teal-900 to-slate-800 p-8 text-white">
                      <Bus className="h-12 w-12 text-teal-300" aria-hidden="true" />
                      <p className="mt-3 font-display text-lg font-semibold">
                        ROUTELESS Rural Mobility Corridor
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Full-width 4-column KPI strip below hero split */}
            <div className="mt-10 grid grid-cols-2 gap-4 border-t border-slate-200 pt-8 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Connected Villages</p>
                <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                  {villageCount} Villages
                </p>
                <p className="mt-1 text-xs text-slate-600">Across 3 regional college hubs</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Monitored Fleet Buses</p>
                <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                  {busCount} Buses
                </p>
                <p className="mt-1 text-xs text-slate-600">Simulated GPS + live dispatch</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Authorized Backup Vans</p>
                <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                  {vehicleCount} Vehicles
                </p>
                <p className="mt-1 text-xs text-slate-600">Driver & registration verified</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">Active Student Pools</p>
                <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
                  {carpoolCount} Groups
                </p>
                <p className="mt-1 text-xs text-slate-600">Shared village-to-campus rides</p>
              </div>
            </div>
          </div>
        </section>

        {/* Corridors & Asymmetric Story Showcase */}
        <section id="corridors" className="mx-auto max-w-7xl px-6 py-16">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Built for unpredictable rural bus schedules
            </h2>
            <p className="mt-3 text-base text-slate-600">
              When a single morning government bus cancels or overflows, students risk losing an
              entire day of instruction. ROUTELESS connects all seven operational layers so backup
              routing and shared seating trigger automatically.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-2">
              <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
                {!routeErr ? (
                  <img
                    src={routeNetworkImg}
                    alt="Aerial view of paved rural road network connecting villages to a regional college campus"
                    referrerPolicy="no-referrer"
                    onError={() => setRouteErr(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-slate-200 text-slate-700">
                    <MapPin className="h-10 w-10" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="p-6">
                <p className="text-xs font-medium text-slate-500">
                  Graph Optimization · Real-Time Disruption Rerouting
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold text-slate-900">
                  A* Corridor Routing & Dynamic Fleet Reallocation
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Evaluates road quality, congestion, village student density, and live roadblock
                  reports to guide buses and feeder vans through the fastest safe pickup stops.
                </p>
              </div>
            </div>

            <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
                {!vanErr ? (
                  <img
                    src={sharedVanImg}
                    alt="Verified white passenger minivan waiting at a village pickup bay"
                    referrerPolicy="no-referrer"
                    onError={() => setVanErr(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-slate-200 text-slate-700">
                    <ShieldCheck className="h-10 w-10" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between p-6">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Verified Local Providers · Fair Shared Fares
                  </p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-slate-900">
                    Automatic Backup Vans & Student Pools
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Instant matching with authorized cooperative vans, minibuses, and verified
                    student carpools whenever scheduled buses are cancelled or full.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDemoEnter('provider')}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800"
                >
                  Open Provider Portal
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Ground Reality: Real Student Photos & Problems Faced */}
        <section id="ground-reality" className="border-t border-slate-200 bg-slate-50 py-16">
          <div className="mx-auto max-w-7xl px-6">
            <StudentFieldStories
              onSimulateCrisis={() => onDemoEnter('admin', true)}
            />
          </div>
        </section>

        {/* Seven Integrated Modules */}
        <section id="modules" className="border-y border-slate-200 bg-white py-16">
          <div className="mx-auto max-w-7xl px-6">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Seven connected modules sharing one live operational graph
              </h2>
              <p className="mt-3 text-base text-slate-600">
                Status changes in one module immediately propagate across allocation, student alerts,
                alternative ride matching, and AI assistant answers.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m) => (
                <div
                  key={m.num}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-6"
                >
                  <div>
                    <p className="font-mono text-xs font-medium text-teal-700">Module {m.num}</p>
                    <h3 className="mt-2 font-display text-lg font-semibold text-slate-900">
                      {m.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{m.desc}</p>
                  </div>
                  <p className="mt-4 border-t border-slate-200 pt-3 text-xs font-medium text-slate-500">
                    {m.meta}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Role Portals */}
        <section id="portals" className="mx-auto max-w-7xl px-6 py-16">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
                Three role-specific workspaces
              </h2>
              <p className="mt-2 text-base text-slate-600">
                Explore the live system immediately through any role or register a custom student
                profile.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Sign In with Credentials
            </button>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
              <div>
                <p className="text-xs font-medium text-teal-700">Role 01 · Commuter</p>
                <h3 className="mt-2 font-display text-xl font-semibold text-slate-900">
                  Student Dashboard
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Track buses, optimize routes with roadblock detours, discover emergency backup
                  vans, join carpool or bikepool groups, and ask the AI assistant.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDemoEnter('student')}
                className="mt-6 w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
              >
                Enter as Student
              </button>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
              <div>
                <p className="text-xs font-medium text-slate-500">Role 02 · Operations Control</p>
                <h3 className="mt-2 font-display text-xl font-semibold text-slate-900">
                  Administrator Dashboard
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Monitor fleet occupancy, run AI bus allocation, simulate delays or cancellations,
                  verify providers, and forecast corridor demand with Recharts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDemoEnter('admin')}
                className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
              >
                Enter as Administrator
              </button>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6">
              <div>
                <p className="text-xs font-medium text-slate-500">Role 03 · Local Feeder Fleet</p>
                <h3 className="mt-2 font-display text-xl font-semibold text-slate-900">
                  Transport Provider Dashboard
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Register authorized vans or minibuses, toggle seat availability, accept student
                  ride-sharing requests, and update live trip status.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDemoEnter('provider')}
                className="mt-6 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
              >
                Enter as Transport Provider
              </button>
            </div>
          </div>
        </section>

        {/* Safety & Reliability */}
        <section id="safety" className="border-t border-slate-200 bg-white py-14">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">
                  Student safety & data transparency
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Designed specifically for rural students travelling between villages and regional
                  campuses.
                </p>
              </div>
              <div className="space-y-3 text-sm text-slate-700 md:col-span-2 md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">Verified Drivers & Vehicles</p>
                  <p className="mt-1 text-slate-600">
                    Every local van and minibus displays driver name, vehicle registration, and
                    safety verification before booking.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">Emergency Contact & Privacy</p>
                  <p className="mt-1 text-slate-600">
                    Student phone numbers are masked publicly; emergency contacts receive trip-share
                    details during active shared rides.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">Honest Simulated Telemetry</p>
                  <p className="mt-1 text-slate-600">
                    Where live vehicle GPS hardware is absent, tracking panels explicitly label
                    simulated GPS demonstration mode.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-900">Seated Capacity Enforcement</p>
                  <p className="mt-1 text-slate-600">
                    Allocation algorithms cap seated occupancy per bus and trigger backup transport
                    rather than permitting unsafe overcrowding.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p className="font-medium text-slate-700">
            HALLI.MITRA · ROUTELESS: The Last Mile
          </p>
          <p>Rural Student Mobility & AI Transit Coordination Platform</p>
        </div>
      </footer>
    </div>
  );
}
