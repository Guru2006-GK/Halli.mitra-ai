import type {
  AllocationReport,
  AlternativeOption,
  Bus,
  BusStatus,
  CarpoolGroup,
  DemandPredictionResponse,
  ExamCrisisState,
  LocationNode,
  RideShareRequest,
  RoadEdge,
  RouteOptimizationResult,
  StudentTransportRequest,
  TransitNotification,
  TransportProviderVehicle,
  UserAccount,
  UserRole,
} from '../types';

export interface PlatformState {
  nodes: LocationNode[];
  edges: RoadEdge[];
  buses: Bus[];
  vehicles: TransportProviderVehicle[];
  carpools: CarpoolGroup[];
  rideRequests: RideShareRequest[];
  transportRequests: StudentTransportRequest[];
  notifications: TransitNotification[];
  allocationReport: AllocationReport;
  demandForecast: DemandPredictionResponse;
  examCrisis: ExamCrisisState;
}

const TOKEN_KEY = 'hm_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getState: () => request<PlatformState>('/api/state'),

  getMe: () => request<{ user: UserAccount | null }>('/api/auth/me'),

  login: async (email: string, password: string) => {
    const res = await request<{ user: UserAccount; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  register: async (payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    villageId?: string;
    collegeId?: string;
    phone?: string;
    emergencyContact?: string;
    departureTime?: string;
  }) => {
    const res = await request<{ user: UserAccount; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(res.token);
    return res.user;
  },

  demoLogin: async (role: UserRole) => {
    const res = await request<{ user: UserAccount; token: string }>('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  logout: async () => {
    await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    setStoredToken(null);
  },

  tickBuses: () => request<{ buses: Bus[] }>('/api/buses/tick', { method: 'POST' }),

  updateBusStatus: (
    busId: string,
    status: BusStatus,
    delayReason?: string,
    etaMinutes?: number
  ) =>
    request<{
      bus: Bus;
      allocationReport: AllocationReport;
      transportRequests: StudentTransportRequest[];
    }>(`/api/buses/${busId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, delayReason, etaMinutes }),
    }),

  runAllocation: () =>
    request<{
      allocationReport: AllocationReport;
      buses: Bus[];
      transportRequests: StudentTransportRequest[];
    }>('/api/allocation/run', { method: 'POST' }),

  optimizeRoute: (payload: {
    originId: string;
    destinationId: string;
    mode?: 'fastest' | 'lowest_wait' | 'detour';
    blockedEdgeIds?: string[];
  }) =>
    request<{ primary: RouteOptimizationResult; alternatives: RouteOptimizationResult[] }>(
      '/api/routes/optimize',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  toggleEdgeBlock: (edgeId: string) =>
    request<{ edge: RoadEdge; edges: RoadEdge[] }>(`/api/edges/${edgeId}/toggle-block`, {
      method: 'POST',
    }),

  submitTransportRequest: (payload: {
    studentId: string;
    studentName: string;
    villageId: string;
    collegeId: string;
    departureTime: string;
  }) =>
    request<{ request: StudentTransportRequest; buses: Bus[] }>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAlternatives: (originVillageId: string, destinationCollegeId: string, passengers = 1) =>
    request<{ options: AlternativeOption[] }>(
      `/api/alternatives?originVillageId=${encodeURIComponent(originVillageId)}&destinationCollegeId=${encodeURIComponent(
        destinationCollegeId
      )}&passengers=${passengers}`
    ),

  createCarpool: (payload: {
    title: string;
    mode: 'Carpool' | 'Bikepool';
    originVillageId: string;
    destinationCollegeId: string;
    pickupLandmark: string;
    departureTime: string;
    maxSeats: number;
    estimatedCostPerStudentInr: number;
    creatorId: string;
    creatorName: string;
  }) =>
    request<{ group: CarpoolGroup; groups: CarpoolGroup[] }>('/api/carpools', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  joinCarpool: (groupId: string, memberId: string, memberName: string) =>
    request<{ group: CarpoolGroup; groups: CarpoolGroup[] }>(`/api/carpools/${groupId}/join`, {
      method: 'POST',
      body: JSON.stringify({ memberId, memberName }),
    }),

  bookRideShare: (payload: {
    studentId: string;
    studentName: string;
    originVillageId: string;
    destinationCollegeId: string;
    passengerCount: number;
    vehicleId?: string;
    emergencySharedWith?: string;
  }) =>
    request<{ ride: RideShareRequest; rideRequests: RideShareRequest[] }>('/api/rides', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRideStatus: (rideId: string, status: RideShareRequest['status']) =>
    request<{
      ride: RideShareRequest;
      vehicles: TransportProviderVehicle[];
      rideRequests: RideShareRequest[];
    }>(`/api/rides/${rideId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  registerVehicle: (payload: {
    providerUserId: string;
    vehicleName: string;
    vehicleType: TransportProviderVehicle['vehicleType'];
    regNumber: string;
    driverName: string;
    driverPhone: string;
    totalSeats: number;
    baseVillageId: string;
    assignedRoute: string;
  }) =>
    request<{ vehicle: TransportProviderVehicle; vehicles: TransportProviderVehicle[] }>(
      '/api/provider/vehicles',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  updateVehicle: (
    vehicleId: string,
    payload: {
      available?: boolean;
      tripStatus?: TransportProviderVehicle['tripStatus'];
      verified?: boolean;
      availableSeats?: number;
    }
  ) =>
    request<{ vehicle: TransportProviderVehicle; vehicles: TransportProviderVehicle[] }>(
      `/api/provider/vehicles/${vehicleId}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    ),

  predictDemand: (params: {
    corridorId: string;
    isExamPeriod: boolean;
    isHoliday: boolean;
    busCapacityBasis?: number;
  }) =>
    request<DemandPredictionResponse>(
      `/api/demand/predict?corridorId=${encodeURIComponent(params.corridorId)}&isExamPeriod=${
        params.isExamPeriod
      }&isHoliday=${params.isHoliday}&busCapacityBasis=${params.busCapacityBasis ?? 50}`
    ),

  chatAi: (message: string, role: UserRole) =>
    request<{ reply: string; source: string; notice?: string }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, role }),
    }),

  getNotifications: (userId?: string) =>
    request<{ notifications: TransitNotification[] }>(
      `/api/notifications${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`
    ),

  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    }),

  markAllNotificationsRead: (userId?: string) =>
    request<{ ok: boolean }>('/api/notifications/read-all', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),

  activateExamCrisis: () =>
    request<PlatformState>('/api/crisis/activate', { method: 'POST' }),

  resolveExamCrisis: () =>
    request<PlatformState>('/api/crisis/resolve', { method: 'POST' }),
};
