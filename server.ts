import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  HISTORICAL_DEMAND_RECORDS,
  LOCATION_NODES,
  ROAD_EDGES,
  SEED_BUSES,
  SEED_CARPOOLS,
  SEED_PROVIDER_VEHICLES,
  SEED_RIDE_REQUESTS,
  SEED_TRANSPORT_REQUESTS,
  SEED_USERS,
} from './src/data/networkSeed';
import { allocateFleetIntelligent } from './src/engine/allocation';
import { predictStudentDemand } from './src/engine/demand';
import { matchCarpoolGroups, recommendAlternativeTransport } from './src/engine/matching';
import { optimizeRouteAStar } from './src/engine/routing';
import { evaluateStudentNotifications } from './src/engine/notifications';
import {
  applyExamCrisisScenario,
  createDefaultExamCrisis,
  restoreNormalOperations,
} from './src/engine/crisis';
import type {
  Bus,
  BusStatus,
  CarpoolGroup,
  ExamCrisisState,
  LocationNode,
  RideShareRequest,
  RoadEdge,
  StudentTransportRequest,
  TransitNotification,
  TransportProviderVehicle,
  UserAccount,
  UserRole,
} from './src/types';

interface StoredUser extends UserAccount {
  passwordHash: string;
}

interface AppStore {
  users: StoredUser[];
  nodes: LocationNode[];
  edges: RoadEdge[];
  buses: Bus[];
  vehicles: TransportProviderVehicle[];
  carpools: CarpoolGroup[];
  rideRequests: RideShareRequest[];
  transportRequests: StudentTransportRequest[];
  notifications: TransitNotification[];
  examCrisis: ExamCrisisState;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'halli-mitra-routeless-session-key';

function hashPassword(password: string, salt?: string): string {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return `${s}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash === 'demo') return password === 'demo123' || password === 'demo';
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
}

function signToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof parsed.uid === 'string' ? parsed.uid : null;
  } catch {
    return null;
  }
}

function createInitialStore(): AppStore {
  return {
    users: structuredClone(SEED_USERS),
    nodes: structuredClone(LOCATION_NODES),
    edges: structuredClone(ROAD_EDGES),
    buses: structuredClone(SEED_BUSES),
    vehicles: structuredClone(SEED_PROVIDER_VEHICLES),
    carpools: structuredClone(SEED_CARPOOLS),
    rideRequests: structuredClone(SEED_RIDE_REQUESTS),
    transportRequests: structuredClone(SEED_TRANSPORT_REQUESTS),
    notifications: [],
    examCrisis: createDefaultExamCrisis(),
  };
}

function loadStore(): AppStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as AppStore;
      if (!Array.isArray(parsed.notifications)) parsed.notifications = [];
      if (!parsed.examCrisis) parsed.examCrisis = createDefaultExamCrisis();
      return parsed;
    }
  } catch {
    // Fall back to fresh seed store if file is unreadable
  }
  const initial = createInitialStore();
  saveStore(initial);
  return initial;
}

function saveStore(store: AppStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function sanitizeUser(user: StoredUser): UserAccount {
  const { passwordHash: _pw, ...safe } = user;
  return safe;
}

function getAuthenticatedUser(req: Request, store: AppStore): StoredUser | null {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map((c) => c.trim());
    const match = cookies.find((c) => c.startsWith('hm_session='));
    if (match) token = decodeURIComponent(match.slice('hm_session='.length));
  }
  const uid = verifyToken(token);
  if (!uid) return null;
  return store.users.find((u) => u.id === uid) ?? null;
}

function buildPublicSnapshot(store: AppStore, viewer: StoredUser | null) {
  const demandMultiplier = store.examCrisis.active
    ? store.examCrisis.demandSurgeMultiplier
    : 1.0;

  const allocationReport = allocateFleetIntelligent({
    buses: store.buses,
    nodes: store.nodes,
    requests: store.transportRequests,
    demandMultiplier,
  });

  const demandForecast = predictStudentDemand({
    history: HISTORICAL_DEMAND_RECORDS,
    corridorId: 'corridor_malavalli_mandya',
    isExamPeriod: store.examCrisis.active,
    isHoliday: false,
  });

  // Protect sensitive phone numbers in public carpool listings
  const safeRideRequests = store.rideRequests.map((r) => {
    const isOwnerOrAdminOrProvider =
      viewer &&
      (viewer.role === 'admin' || viewer.role === 'provider' || viewer.id === r.studentId);
    return {
      ...r,
      emergencySharedWith: isOwnerOrAdminOrProvider ? r.emergencySharedWith : 'Protected',
    };
  });

  const viewerNotifications = viewer
    ? store.notifications.filter((n) => n.userId === viewer.id)
    : [];

  return {
    nodes: store.nodes,
    edges: store.edges,
    buses: store.buses,
    vehicles: store.vehicles,
    carpools: store.carpools,
    rideRequests: safeRideRequests,
    transportRequests: store.transportRequests,
    notifications: viewerNotifications,
    allocationReport,
    demandForecast,
    examCrisis: store.examCrisis,
  };
}

function buildFallbackAssistantReply(question: string, store: AppStore): string {
  const q = question.toLowerCase();
  const activeBuses = store.buses.filter((b) => b.status !== 'Cancelled');
  const cancelledBuses = store.buses.filter((b) => b.status === 'Cancelled');
  const allocation = allocateFleetIntelligent({
    buses: store.buses,
    nodes: store.nodes,
    requests: store.transportRequests,
  });

  if (q.includes('cancel') || q.includes('alternative') || q.includes('unavailable')) {
    const alts = recommendAlternativeTransport({
      vehicles: store.vehicles,
      nodes: store.nodes,
      originVillageId: cancelledBuses[0]?.assignedVillageIds[0] ?? 'v_bannur',
      destinationCollegeId: cancelledBuses[0]?.destinationNodeId ?? 'c_maharaja_mysuru',
      passengerCount: 1,
    });
    const top = alts[0];
    return (
      `Currently ${cancelledBuses.length} bus(es) are cancelled (${cancelledBuses
        .map((b) => `${b.busNumber} on ${b.routeName}`)
        .join(', ') || 'none'}). ` +
      (top
        ? `Top verified alternative: ${top.vehicleName} (${top.vehicleType}, Reg ${top.regNumber}) driven by ${top.driverName}, arriving at ${top.pickupLocation} in ~${top.etaMinutes} min for ₹${top.estimatedCostInr}/student (${top.availableSeats} seats left).`
        : 'All buses are currently operating.')
    );
  }

  if (q.includes('tomorrow') || q.includes('how many bus') || q.includes('demand') || q.includes('predict')) {
    const forecast = predictStudentDemand({
      history: HISTORICAL_DEMAND_RECORDS,
      corridorId: 'corridor_malavalli_mandya',
    });
    const nextDay = forecast.weeklyForecast[0];
    const totalBuses = forecast.corridorGrowth.reduce((s, c) => s + c.recommendedBuses, 0);
    return (
      `For ${nextDay.date} (${nextDay.label}), the Malavalli–Kirugavalu–PES Mandya corridor projects ${nextDay.predictedStudents} students ` +
      `(requiring ${nextDay.recommendedBuses} bus(es) at 50-seat capacity). Across all 5 rural corridors, the demand predictor recommends ${totalBuses} buses total during morning peak (07:30–08:30 AM).`
    );
  }

  if (q.includes('fastest') || q.includes('route') || q.includes('detour')) {
    const fastest = optimizeRouteAStar({
      nodes: store.nodes,
      edges: store.edges,
      originId: 'v_kirugavalu',
      destinationId: 'c_pes_mandya',
      mode: 'fastest',
    });
    return fastest
      ? `${fastest.explanation}`
      : 'No open road path found due to active corridor closures.';
  }

  if (q.includes('other student') || q.includes('carpool') || q.includes('bikepool') || q.includes('pool')) {
    return (
      `There are ${store.carpools.length} active verified student carpool/bikepool groups: ` +
      store.carpools
        .map(
          (c) =>
            `${c.title} (${c.mode}, departs ${c.departureTime} from ${c.pickupLandmark}, ${c.maxSeats - c.memberIds.length} seats open, ₹${c.estimatedCostPerStudentInr}/student)`
        )
        .join('; ') +
      '.'
    );
  }

  if (q.includes('arrive') || q.includes('eta') || q.includes('which bus') || q.includes('college')) {
    return (
      `Active buses right now: ` +
      activeBuses
        .map(
          (b) =>
            `${b.busNumber} (${b.routeName}) — ${b.status}, ETA ${b.etaMinutes} min, ${b.capacity - b.occupiedSeats} seats free`
        )
        .join(' | ') +
      `. Current fleet utilization: ${allocation.totalAllocatedSeats}/${allocation.totalDemand} student seats allocated.`
    );
  }

  return (
    `HALLI.MITRA Network Summary: ${activeBuses.length} active buses, ${cancelledBuses.length} cancelled, ` +
    `${store.vehicles.filter((v) => v.available).length} verified local vans/autos on standby, and ` +
    `${store.carpools.length} active student carpool groups. Ask me about specific buses, ETAs, roadblocks, carpools, or tomorrow's predicted demand.`
  );
}

async function startServer() {
  const app = express();
  app.use(express.json());

  let store = loadStore();

  const sseClients = new Set<{ res: Response; userId: string }>();

  function syncAndBroadcastNotifications() {
    const existingKeys = new Set(store.notifications.map((n) => n.dedupKey));
    const newlyCreated: TransitNotification[] = [];

    for (const user of store.users) {
      if (user.role !== 'student') continue;
      const generated = evaluateStudentNotifications({
        userId: user.id,
        villageId: user.villageId,
        collegeId: user.collegeId,
        buses: store.buses,
        edges: store.edges,
        nodes: store.nodes,
        transportRequests: store.transportRequests,
        examCrisis: store.examCrisis,
        existingDedupKeys: existingKeys,
      });
      if (generated.length > 0) {
        newlyCreated.push(...generated);
      }
    }

    if (newlyCreated.length > 0) {
      store.notifications.unshift(...newlyCreated);
      store.notifications = store.notifications.slice(0, 100);
    }

    for (const client of sseClients) {
      try {
        for (const notif of newlyCreated) {
          if (notif.userId === client.userId) {
            client.res.write(`event: notification\ndata: ${JSON.stringify(notif)}\n\n`);
          }
        }
        client.res.write(`event: state_update\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // Evaluate initial state notifications cleanly
  syncAndBroadcastNotifications();
  saveStore(store);

  // Real-time Server-Sent Events stream for student notifications
  app.get('/api/notifications/stream', (req: Request, res: Response) => {
    const authUser = getAuthenticatedUser(req, store);
    const userId =
      authUser?.id ||
      (typeof req.query.userId === 'string' && req.query.userId) ||
      'u_student_1';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const client = { res, userId };
    sseClients.add(client);

    res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

    const keepAlive = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(client);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(client);
    });
  });

  app.get('/api/notifications', (req: Request, res: Response) => {
    const viewer = getAuthenticatedUser(req, store);
    const userId = viewer?.id || (typeof req.query.userId === 'string' ? req.query.userId : 'u_student_1');
    const items = store.notifications.filter((n) => n.userId === userId);
    res.json({ notifications: items });
  });

  app.post('/api/notifications/:id/read', (req: Request, res: Response) => {
    const notif = store.notifications.find((n) => n.id === req.params.id);
    if (notif) {
      notif.read = true;
      saveStore(store);
    }
    res.json({ ok: true, notifications: store.notifications });
  });

  app.post('/api/notifications/read-all', (req: Request, res: Response) => {
    const viewer = getAuthenticatedUser(req, store);
    const userId = viewer?.id || req.body?.userId || 'u_student_1';
    store.notifications = store.notifications.map((n) =>
      n.userId === userId ? { ...n, read: true } : n
    );
    saveStore(store);
    res.json({ ok: true });
  });

  // Auth routes
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { name, email, password, role, villageId, collegeId, phone, emergencyContact, departureTime } =
      req.body ?? {};
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }
    const cleanEmail = String(email).trim().toLowerCase();
    if (store.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    const validRole: UserRole =
      role === 'admin' || role === 'provider' || role === 'student' ? role : 'student';

    const newUser: StoredUser = {
      id: `u_${crypto.randomUUID().slice(0, 8)}`,
      name: String(name).trim(),
      email: cleanEmail,
      role: validRole,
      villageId: villageId || 'v_kirugavalu',
      collegeId: collegeId || 'c_pes_mandya',
      phone: phone || '+91 98000 00000',
      emergencyContact: emergencyContact || '+91 98000 11111',
      departureTime: departureTime || '07:45',
      verified: true,
      passwordHash: hashPassword(String(password)),
    };

    store.users.push(newUser);
    saveStore(store);

    const token = signToken(newUser.id);
    res.setHeader('Set-Cookie', `hm_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
    res.json({ user: sanitizeUser(newUser), token });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const user = store.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
    if (!user || !verifyPassword(String(password), user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
    const token = signToken(user.id);
    res.setHeader('Set-Cookie', `hm_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
    res.json({ user: sanitizeUser(user), token });
  });

  app.post('/api/auth/demo', (req: Request, res: Response) => {
    const role: UserRole =
      req.body?.role === 'admin' || req.body?.role === 'provider' ? req.body.role : 'student';
    const user = store.users.find((u) => u.role === role) ?? store.users[0];
    const token = signToken(user.id);
    res.setHeader('Set-Cookie', `hm_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
    res.json({ user: sanitizeUser(user), token });
  });

  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req, store);
    res.json({ user: user ? sanitizeUser(user) : null });
  });

  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', 'hm_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    res.json({ ok: true });
  });

  // Unified platform state
  app.get('/api/state', (req: Request, res: Response) => {
    const viewer = getAuthenticatedUser(req, store);
    res.json(buildPublicSnapshot(store, viewer));
  });

  // Simulated live GPS telemetry step
  app.post('/api/buses/tick', (_req: Request, res: Response) => {
    const nodeMap = new Map(store.nodes.map((n) => [n.id, n]));
    store.buses = store.buses.map((bus) => {
      if (bus.status === 'Cancelled' || bus.pathNodeIds.length < 2) return bus;
      const nextIdx = (bus.progressIndex + 1) % bus.pathNodeIds.length;
      const currNode = nodeMap.get(bus.pathNodeIds[bus.progressIndex]);
      const nextNode = nodeMap.get(bus.pathNodeIds[nextIdx]);
      if (!currNode || !nextNode) return bus;

      // Interpolate halfway or advance node
      const midLat = Number(((bus.lat + nextNode.lat) / 2).toFixed(5));
      const midLng = Number(((bus.lng + nextNode.lng) / 2).toFixed(5));
      const reached = Math.abs(midLat - nextNode.lat) < 0.004 && Math.abs(midLng - nextNode.lng) < 0.004;

      return {
        ...bus,
        lat: reached ? nextNode.lat : midLat,
        lng: reached ? nextNode.lng : midLng,
        currentNodeId: reached ? nextNode.id : bus.currentNodeId,
        progressIndex: reached ? nextIdx : bus.progressIndex,
        etaMinutes: bus.etaMinutes > 6 ? Math.max(4, bus.etaMinutes - 5) : 24,
        isSimulatedGps: true,
      };
    });
    syncAndBroadcastNotifications();
    saveStore(store);
    res.json({ buses: store.buses });
  });

  // Module 1 & 2: Update bus status + trigger dynamic reallocation
  app.post('/api/buses/:id/status', (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, delayReason, etaMinutes } = req.body ?? {};
    const validStatuses: BusStatus[] = ['On Time', 'Delayed', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid bus status.' });
      return;
    }
    const idx = store.buses.findIndex((b) => b.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Bus not found.' });
      return;
    }
    const bus = store.buses[idx];
    const nextEta =
      typeof etaMinutes === 'number'
        ? etaMinutes
        : status === 'Cancelled'
        ? 0
        : status === 'Delayed'
        ? Math.max(bus.etaMinutes + 12, 28)
        : Math.max(bus.etaMinutes, 18);

    store.buses[idx] = {
      ...bus,
      status,
      delayReason: status === 'On Time' ? undefined : delayReason || bus.delayReason || `${status} reported by Operations Control`,
      etaMinutes: nextEta,
      occupiedSeats: status === 'Cancelled' ? 0 : bus.occupiedSeats || Math.round(bus.capacity * 0.78),
    };

    // Reflect disruption on affected student requests
    if (status === 'Cancelled') {
      store.transportRequests = store.transportRequests.map((tr) =>
        tr.assignedBusNumber === bus.busNumber
          ? { ...tr, needsAlternative: true, status: 'Waitlisted', assignedBusNumber: undefined }
          : tr
      );
    }

    syncAndBroadcastNotifications();
    saveStore(store);
    const demandMultiplier = store.examCrisis.active
      ? store.examCrisis.demandSurgeMultiplier
      : 1.0;
    const allocationReport = allocateFleetIntelligent({
      buses: store.buses,
      nodes: store.nodes,
      requests: store.transportRequests,
      demandMultiplier,
    });
    res.json({ bus: store.buses[idx], allocationReport, transportRequests: store.transportRequests });
  });

  // Module 2: Run AI Bus Allocation
  app.post('/api/allocation/run', (_req: Request, res: Response) => {
    const demandMultiplier = store.examCrisis.active
      ? store.examCrisis.demandSurgeMultiplier
      : 1.0;
    const allocationReport = allocateFleetIntelligent({
      buses: store.buses,
      nodes: store.nodes,
      requests: store.transportRequests,
      demandMultiplier,
    });

    // Update bus occupiedSeats cleanly based on allocation plans
    for (const plan of allocationReport.plans) {
      const bus = store.buses.find((b) => b.id === plan.busId);
      if (bus && bus.status !== 'Cancelled') {
        bus.occupiedSeats = plan.totalAssigned;
      }
    }

    // Reassign waitlisted student requests if a bus covers their village
    store.transportRequests = store.transportRequests.map((reqItem) => {
      if (reqItem.status !== 'Waitlisted') return reqItem;
      const plan = allocationReport.plans.find((p) =>
        p.assignedVillages.some((v) => v.villageId === reqItem.villageId)
      );
      if (plan) {
        return {
          ...reqItem,
          status: 'Reassigned',
          assignedBusNumber: plan.busNumber,
          needsAlternative: false,
        };
      }
      return reqItem;
    });

    syncAndBroadcastNotifications();
    saveStore(store);
    res.json({ allocationReport, buses: store.buses, transportRequests: store.transportRequests });
  });

  // Module 3: AI Route Optimizer (A* / Dijkstra)
  app.post('/api/routes/optimize', (req: Request, res: Response) => {
    const { originId, destinationId, mode, blockedEdgeIds } = req.body ?? {};
    if (!originId || !destinationId) {
      res.status(400).json({ error: 'Origin and destination are required.' });
      return;
    }
    const fastest = optimizeRouteAStar({
      nodes: store.nodes,
      edges: store.edges,
      originId,
      destinationId,
      mode: mode || 'fastest',
      blockedEdgeIds: Array.isArray(blockedEdgeIds) ? blockedEdgeIds : [],
    });
    const lowestWait = optimizeRouteAStar({
      nodes: store.nodes,
      edges: store.edges,
      originId,
      destinationId,
      mode: 'lowest_wait',
      blockedEdgeIds: Array.isArray(blockedEdgeIds) ? blockedEdgeIds : [],
    });
    const detour = optimizeRouteAStar({
      nodes: store.nodes,
      edges: store.edges,
      originId,
      destinationId,
      mode: 'detour',
      blockedEdgeIds: Array.isArray(blockedEdgeIds) ? blockedEdgeIds : [],
    });

    if (!fastest) {
      res.status(404).json({ error: 'All corridors between the selected village and college are currently blocked.' });
      return;
    }

    res.json({
      primary: fastest,
      alternatives: [lowestWait, detour].filter(Boolean),
    });
  });

  app.post('/api/edges/:id/toggle-block', (req: Request, res: Response) => {
    const edge = store.edges.find((e) => e.id === req.params.id);
    if (!edge) {
      res.status(404).json({ error: 'Road edge not found.' });
      return;
    }
    edge.blocked = !edge.blocked;
    syncAndBroadcastNotifications();
    saveStore(store);
    res.json({ edge, edges: store.edges });
  });

  // Examination Day Crisis Simulator endpoints
  app.post('/api/crisis/activate', (req: Request, res: Response) => {
    const viewer = getAuthenticatedUser(req, store);
    const result = applyExamCrisisScenario({
      buses: store.buses,
      edges: store.edges,
      nodes: store.nodes,
      requests: store.transportRequests,
    });
    store.buses = result.buses;
    store.edges = result.edges;
    store.transportRequests = result.requests;
    store.examCrisis = result.examCrisis;
    syncAndBroadcastNotifications();
    saveStore(store);
    res.json(buildPublicSnapshot(store, viewer));
  });

  app.post('/api/crisis/resolve', (req: Request, res: Response) => {
    const viewer = getAuthenticatedUser(req, store);
    const result = restoreNormalOperations({
      buses: store.buses,
      edges: store.edges,
      requests: store.transportRequests,
    });
    store.buses = result.buses;
    store.edges = result.edges;
    store.transportRequests = result.requests;
    store.examCrisis = result.examCrisis;
    syncAndBroadcastNotifications();
    saveStore(store);
    res.json(buildPublicSnapshot(store, viewer));
  });

  // Student Transport Request submission
  app.post('/api/requests', (req: Request, res: Response) => {
    const { studentId, studentName, villageId, collegeId, departureTime } = req.body ?? {};
    if (!villageId || !collegeId) {
      res.status(400).json({ error: 'Village and destination college are required.' });
      return;
    }
    const village = store.nodes.find((n) => n.id === villageId);
    const college = store.nodes.find((n) => n.id === collegeId);
    if (!village || !college) {
      res.status(400).json({ error: 'Invalid village or college ID.' });
      return;
    }

    const matchingBus = store.buses.find(
      (b) =>
        b.status !== 'Cancelled' &&
        b.assignedVillageIds.includes(villageId) &&
        b.occupiedSeats < b.capacity
    );

    if (matchingBus) {
      matchingBus.occupiedSeats += 1;
    }

    const newReq: StudentTransportRequest = {
      id: `tr_${crypto.randomUUID().slice(0, 6)}`,
      studentId: studentId || 'guest_student',
      studentName: studentName || 'Student Rider',
      villageId,
      villageName: village.name,
      collegeId,
      collegeName: college.name,
      departureTime: departureTime || '07:45',
      needsAlternative: !matchingBus,
      status: matchingBus ? 'Matched' : 'Waitlisted',
      assignedBusNumber: matchingBus?.busNumber,
      createdAt: new Date().toISOString(),
    };

    store.transportRequests.unshift(newReq);
    syncAndBroadcastNotifications();
    saveStore(store);
    res.status(201).json({ request: newReq, buses: store.buses });
  });

  // Module 4: Alternative Transport Recommendations
  app.get('/api/alternatives', (req: Request, res: Response) => {
    const originVillageId = String(req.query.originVillageId || 'v_bannur');
    const destinationCollegeId = String(req.query.destinationCollegeId || 'c_maharaja_mysuru');
    const passengerCount = Math.max(1, Number(req.query.passengers || 1));

    const options = recommendAlternativeTransport({
      vehicles: store.vehicles,
      nodes: store.nodes,
      originVillageId,
      destinationCollegeId,
      passengerCount,
    });
    res.json({ options });
  });

  // Module 5: Student Carpooling & Bikepooling
  app.get('/api/carpools', (req: Request, res: Response) => {
    const groups = matchCarpoolGroups({
      groups: store.carpools,
      originVillageId: req.query.originVillageId ? String(req.query.originVillageId) : undefined,
      destinationCollegeId: req.query.destinationCollegeId ? String(req.query.destinationCollegeId) : undefined,
      departureTime: req.query.departureTime ? String(req.query.departureTime) : undefined,
    });
    res.json({ groups });
  });

  app.post('/api/carpools', (req: Request, res: Response) => {
    const {
      title,
      mode,
      originVillageId,
      destinationCollegeId,
      pickupLandmark,
      departureTime,
      maxSeats,
      estimatedCostPerStudentInr,
      creatorId,
      creatorName,
    } = req.body ?? {};

    if (!title || !originVillageId || !destinationCollegeId || !departureTime) {
      res.status(400).json({ error: 'Title, village, college, and departure time are required.' });
      return;
    }

    const origin = store.nodes.find((n) => n.id === originVillageId);
    const dest = store.nodes.find((n) => n.id === destinationCollegeId);
    if (!origin || !dest) {
      res.status(400).json({ error: 'Invalid village or college selected.' });
      return;
    }

    const group: CarpoolGroup = {
      id: `cp_${crypto.randomUUID().slice(0, 6)}`,
      title: String(title).trim(),
      mode: mode === 'Bikepool' ? 'Bikepool' : 'Carpool',
      originVillageId,
      originName: origin.name,
      destinationCollegeId,
      destinationName: dest.name,
      pickupLandmark: pickupLandmark || origin.pickupPoint,
      departureTime: String(departureTime),
      maxSeats: Math.max(2, Math.min(8, Number(maxSeats || 4))),
      memberIds: [creatorId || 'u_student_1'],
      memberNames: [creatorName || 'Verified Student'],
      verifiedCount: 1,
      estimatedCostPerStudentInr: Math.max(10, Number(estimatedCostPerStudentInr || 20)),
      createdBy: creatorName || 'Verified Student',
      safetyNote: 'College ID verified · Parent emergency contact check-in enabled',
    };

    store.carpools.unshift(group);
    saveStore(store);
    res.status(201).json({ group, groups: store.carpools });
  });

  app.post('/api/carpools/:id/join', (req: Request, res: Response) => {
    const group = store.carpools.find((c) => c.id === req.params.id);
    if (!group) {
      res.status(404).json({ error: 'Carpool group not found.' });
      return;
    }
    const memberId = String(req.body?.memberId || 'u_student_1');
    const memberName = String(req.body?.memberName || 'Ananya Gowda');

    if (group.memberIds.includes(memberId)) {
      res.json({ group, message: 'Already a member of this group.' });
      return;
    }
    if (group.memberIds.length >= group.maxSeats) {
      res.status(409).json({ error: 'This carpool group is already full.' });
      return;
    }
    group.memberIds.push(memberId);
    group.memberNames.push(memberName);
    group.verifiedCount += 1;
    saveStore(store);
    res.json({ group, groups: store.carpools });
  });

  // Module 6: Smart Ride Sharing
  app.post('/api/rides', (req: Request, res: Response) => {
    const {
      studentId,
      studentName,
      originVillageId,
      destinationCollegeId,
      passengerCount,
      vehicleId,
      emergencySharedWith,
    } = req.body ?? {};

    if (!originVillageId || !destinationCollegeId) {
      res.status(400).json({ error: 'Origin village and destination college are required.' });
      return;
    }

    const origin = store.nodes.find((n) => n.id === originVillageId);
    const dest = store.nodes.find((n) => n.id === destinationCollegeId);
    if (!origin || !dest) {
      res.status(400).json({ error: 'Invalid location ID.' });
      return;
    }

    const pax = Math.max(1, Math.min(8, Number(passengerCount || 1)));
    const ranked = recommendAlternativeTransport({
      vehicles: store.vehicles,
      nodes: store.nodes,
      originVillageId,
      destinationCollegeId,
      passengerCount: pax,
    });

    const chosen = vehicleId ? ranked.find((r) => r.vehicleId === vehicleId) ?? ranked[0] : ranked[0];
    if (!chosen) {
      res.status(409).json({ error: 'No verified provider vehicles currently have enough open seats.' });
      return;
    }

    const newRide: RideShareRequest = {
      id: `rs_${crypto.randomUUID().slice(0, 6)}`,
      studentId: studentId || 'u_student_1',
      studentName: studentName || 'Ananya Gowda',
      originVillageId,
      originName: origin.name,
      destinationCollegeId,
      destinationName: dest.name,
      passengerCount: pax,
      pickupPoint: chosen.pickupLocation,
      preferredVehicleId: chosen.vehicleId,
      vehicleName: chosen.vehicleName,
      driverName: chosen.driverName,
      regNumber: chosen.regNumber,
      sharedFarePerStudentInr: chosen.estimatedCostInr,
      etaMinutes: chosen.etaMinutes,
      status: 'Pending',
      emergencySharedWith: emergencySharedWith || '+91 98451 00112',
      createdAt: new Date().toISOString(),
    };

    store.rideRequests.unshift(newRide);
    saveStore(store);
    res.status(201).json({ ride: newRide, rideRequests: store.rideRequests });
  });

  app.post('/api/rides/:id/status', (req: Request, res: Response) => {
    const ride = store.rideRequests.find((r) => r.id === req.params.id);
    if (!ride) {
      res.status(404).json({ error: 'Ride request not found.' });
      return;
    }
    const { status } = req.body ?? {};
    const allowed: RideShareRequest['status'][] = ['Pending', 'Accepted', 'En Route', 'Completed', 'Rejected'];
    if (!allowed.includes(status)) {
      res.status(400).json({ error: 'Invalid ride status.' });
      return;
    }

    const prevStatus = ride.status;
    ride.status = status;

    const vehicle = store.vehicles.find((v) => v.id === ride.preferredVehicleId);
    if (vehicle) {
      if (prevStatus === 'Pending' && status === 'Accepted') {
        vehicle.availableSeats = Math.max(0, vehicle.availableSeats - ride.passengerCount);
        vehicle.tripStatus = 'Boarding';
      } else if (status === 'En Route') {
        vehicle.tripStatus = 'En Route';
      } else if (status === 'Completed' || status === 'Rejected') {
        if (prevStatus === 'Accepted' || prevStatus === 'En Route') {
          vehicle.availableSeats = Math.min(vehicle.totalSeats, vehicle.availableSeats + ride.passengerCount);
        }
        vehicle.tripStatus = status === 'Completed' ? 'Completed' : vehicle.tripStatus;
      }
    }

    saveStore(store);
    res.json({ ride, vehicles: store.vehicles, rideRequests: store.rideRequests });
  });

  // Transport Provider vehicle registration & availability management
  app.post('/api/provider/vehicles', (req: Request, res: Response) => {
    const {
      providerUserId,
      vehicleName,
      vehicleType,
      regNumber,
      driverName,
      driverPhone,
      totalSeats,
      baseVillageId,
      assignedRoute,
    } = req.body ?? {};

    if (!vehicleName || !regNumber || !driverName) {
      res.status(400).json({ error: 'Vehicle name, registration number, and driver name are required.' });
      return;
    }
    const baseNode = store.nodes.find((n) => n.id === (baseVillageId || 'v_kirugavalu')) ?? store.nodes[0];
    const seats = Math.max(3, Math.min(30, Number(totalSeats || 10)));

    const vehicle: TransportProviderVehicle = {
      id: `pv_${crypto.randomUUID().slice(0, 6)}`,
      providerUserId: providerUserId || 'u_provider_1',
      vehicleName: String(vehicleName).trim(),
      vehicleType: vehicleType || 'Authorized Van',
      regNumber: String(regNumber).trim().toUpperCase(),
      driverName: String(driverName).trim(),
      driverPhone: driverPhone || '+91 98450 00000',
      verified: true,
      totalSeats: seats,
      availableSeats: seats,
      baseVillageId: baseNode.id,
      lat: baseNode.lat,
      lng: baseNode.lng,
      costPerKm: 3.2,
      baseFare: 15,
      safetyRating: 4.8,
      available: true,
      assignedRoute: assignedRoute || `${baseNode.name} – Campus Feeder`,
      tripStatus: 'Standby',
    };

    store.vehicles.unshift(vehicle);
    saveStore(store);
    res.status(201).json({ vehicle, vehicles: store.vehicles });
  });

  app.patch('/api/provider/vehicles/:id', (req: Request, res: Response) => {
    const vehicle = store.vehicles.find((v) => v.id === req.params.id);
    if (!vehicle) {
      res.status(404).json({ error: 'Vehicle not found.' });
      return;
    }
    const { available, tripStatus, verified, availableSeats } = req.body ?? {};
    if (typeof available === 'boolean') vehicle.available = available;
    if (typeof verified === 'boolean') vehicle.verified = verified;
    if (typeof availableSeats === 'number') {
      vehicle.availableSeats = Math.max(0, Math.min(vehicle.totalSeats, availableSeats));
    }
    if (tripStatus && ['Standby', 'Boarding', 'En Route', 'Completed'].includes(tripStatus)) {
      vehicle.tripStatus = tripStatus;
    }
    saveStore(store);
    res.json({ vehicle, vehicles: store.vehicles });
  });

  // Module 7: AI Student Demand Predictor
  app.get('/api/demand/predict', (req: Request, res: Response) => {
    const corridorId = String(req.query.corridorId || 'corridor_malavalli_mandya');
    const isExamPeriod = req.query.isExamPeriod === 'true';
    const isHoliday = req.query.isHoliday === 'true';
    const busCapacityBasis = Math.max(30, Math.min(70, Number(req.query.busCapacityBasis || 50)));

    const prediction = predictStudentDemand({
      history: HISTORICAL_DEMAND_RECORDS,
      corridorId,
      isExamPeriod,
      isHoliday,
      busCapacityBasis,
    });
    res.json(prediction);
  });

  // Conversational AI Assistant powered by Gemini (@google/genai)
  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    const { message, role } = req.body ?? {};
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message text is required.' });
      return;
    }

    const demandMultiplier = store.examCrisis.active
      ? store.examCrisis.demandSurgeMultiplier
      : 1.0;
    const allocation = allocateFleetIntelligent({
      buses: store.buses,
      nodes: store.nodes,
      requests: store.transportRequests,
      demandMultiplier,
    });
    const forecast = predictStudentDemand({
      history: HISTORICAL_DEMAND_RECORDS,
      corridorId: 'corridor_malavalli_mandya',
      isExamPeriod: store.examCrisis.active,
    });

    const contextSummary = {
      userRole: role || 'student',
      examCrisis: store.examCrisis,
      activeBuses: store.buses.map((b) => ({
        busNumber: b.busNumber,
        route: b.routeName,
        status: b.status,
        etaMinutes: b.etaMinutes,
        freeSeats: Math.max(0, b.capacity - b.occupiedSeats),
        delayReason: b.delayReason || null,
        telemetry: b.isSimulatedGps ? 'Simulated GPS' : 'Live GPS',
      })),
      blockedRoads: store.edges.filter((e) => e.blocked).map((e) => `${e.from} <-> ${e.to}`),
      availableAlternativeVehicles: store.vehicles
        .filter((v) => v.available && v.verified)
        .map((v) => ({
          name: v.vehicleName,
          type: v.vehicleType,
          regNumber: v.regNumber,
          driver: v.driverName,
          seatsLeft: v.availableSeats,
          baseVillage: v.baseVillageId,
          baseFareInr: v.baseFare,
        })),
      carpoolGroups: store.carpools.map((c) => ({
        title: c.title,
        mode: c.mode,
        from: c.originName,
        to: c.destinationName,
        departs: c.departureTime,
        openSeats: c.maxSeats - c.memberIds.length,
        fareInr: c.estimatedCostPerStudentInr,
      })),
      allocationAlerts: allocation.alerts,
      tomorrowForecast: forecast.weeklyForecast[0],
      corridorGrowth: forecast.corridorGrowth,
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      const reply = buildFallbackAssistantReply(message, store);
      res.json({ reply, source: 'engine-grounded' });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: message,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are the transit assistant for HALLI.MITRA (ROUTELESS – The Last Mile), a rural student transportation platform. ' +
            'Answer concisely (3-5 sentences max) with exact bus numbers, ETAs, costs in INR, pickup points, and safety guidance using ONLY the live operational context provided below. ' +
            'Clearly note when bus tracking is in Simulated GPS mode if asked about live location. Never invent fake buses or routes.\n\n' +
            `LIVE NETWORK CONTEXT:\n${JSON.stringify(contextSummary)}`,
        },
      });

      const reply = response.text?.trim() || buildFallbackAssistantReply(message, store);
      res.json({ reply, source: 'gemini-4-hydrogen' });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Gemini request failed';
      // Fall back gracefully with transparent source note if transient API/quota error occurs
      const reply = buildFallbackAssistantReply(message, store);
      res.json({ reply, source: 'engine-grounded', notice: errMsg });
    }
  });

  // Vite or static serving
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`HALLI.MITRA server listening on http://localhost:${port}`);
  });
}

startServer();
