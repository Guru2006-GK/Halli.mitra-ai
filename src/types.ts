export type UserRole = 'student' | 'admin' | 'provider';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  villageId?: string;
  collegeId?: string;
  phone: string;
  emergencyContact?: string;
  departureTime?: string;
  vehicleId?: string;
  verified: boolean;
}

export interface LocationNode {
  id: string;
  name: string;
  kind: 'village' | 'college' | 'junction';
  lat: number;
  lng: number;
  populationStudents: number;
  pickupPoint: string;
}

export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
  baseTimeMin: number;
  roadQuality: 'paved' | 'rural' | 'ghat';
  blocked: boolean;
  congestionFactor: number;
}

export type BusStatus = 'On Time' | 'Delayed' | 'Cancelled';

export interface Bus {
  id: string;
  busNumber: string;
  routeId: string;
  routeName: string;
  capacity: number;
  occupiedSeats: number;
  currentNodeId: string;
  destinationNodeId: string;
  lat: number;
  lng: number;
  etaMinutes: number;
  status: BusStatus;
  delayReason?: string;
  isSimulatedGps: boolean;
  driverName: string;
  driverPhone: string;
  assignedVillageIds: string[];
  pathNodeIds: string[];
  progressIndex: number;
  nextStops: { nodeId: string; name: string; etaMin: number }[];
}

export interface BusAllocationPlan {
  busId: string;
  busNumber: string;
  routeName: string;
  assignedVillages: { villageId: string; villageName: string; studentCount: number }[];
  totalAssigned: number;
  capacity: number;
  loadFactor: number;
  status: 'Optimal' | 'Near Capacity' | 'Overflow Risk' | 'Reallocated';
  decisionNote: string;
}

export interface AllocationReport {
  generatedAt: string;
  baselineDemand?: number;
  demandMultiplier?: number;
  totalDemand: number;
  totalAllocatedSeats: number;
  unservedDemand: number;
  extraBusesSuggested: number;
  plans: BusAllocationPlan[];
  alerts: string[];
}

export interface RouteOptimizationResult {
  mode: 'fastest' | 'lowest_wait' | 'detour';
  originId: string;
  destinationId: string;
  pathNodeIds: string[];
  pathNames: string[];
  coordinates: [number, number][];
  totalDistanceKm: number;
  estimatedMinutes: number;
  pickupPoints: string[];
  bypassedBlockedEdges: string[];
  explanation: string;
}

export interface TransportProviderVehicle {
  id: string;
  providerUserId: string;
  vehicleName: string;
  vehicleType: 'Authorized Van' | 'Minibus' | 'Shared Auto' | 'School Feeder';
  regNumber: string;
  driverName: string;
  driverPhone: string;
  verified: boolean;
  totalSeats: number;
  availableSeats: number;
  baseVillageId: string;
  lat: number;
  lng: number;
  costPerKm: number;
  baseFare: number;
  safetyRating: number;
  available: boolean;
  assignedRoute: string;
  tripStatus: 'Standby' | 'Boarding' | 'En Route' | 'Completed';
}

export interface AlternativeOption {
  vehicleId: string;
  vehicleName: string;
  vehicleType: TransportProviderVehicle['vehicleType'];
  regNumber: string;
  driverName: string;
  driverPhone: string;
  verified: boolean;
  pickupLocation: string;
  etaMinutes: number;
  estimatedCostInr: number;
  availableSeats: number;
  safetyRating: number;
  score: number;
  reason: string;
}

export interface CarpoolGroup {
  id: string;
  title: string;
  mode: 'Carpool' | 'Bikepool';
  originVillageId: string;
  originName: string;
  destinationCollegeId: string;
  destinationName: string;
  pickupLandmark: string;
  departureTime: string;
  maxSeats: number;
  memberIds: string[];
  memberNames: string[];
  verifiedCount: number;
  estimatedCostPerStudentInr: number;
  createdBy: string;
  safetyNote: string;
}

export interface RideShareRequest {
  id: string;
  studentId: string;
  studentName: string;
  originVillageId: string;
  originName: string;
  destinationCollegeId: string;
  destinationName: string;
  passengerCount: number;
  pickupPoint: string;
  preferredVehicleId?: string;
  vehicleName?: string;
  driverName?: string;
  regNumber?: string;
  sharedFarePerStudentInr: number;
  etaMinutes: number;
  status: 'Pending' | 'Accepted' | 'En Route' | 'Completed' | 'Rejected';
  emergencySharedWith?: string;
  createdAt: string;
}

export interface StudentTransportRequest {
  id: string;
  studentId: string;
  studentName: string;
  villageId: string;
  villageName: string;
  collegeId: string;
  collegeName: string;
  departureTime: string;
  needsAlternative: boolean;
  status: 'Matched' | 'Waitlisted' | 'Reassigned';
  assignedBusNumber?: string;
  createdAt: string;
}

export interface HistoricalDemandRecord {
  date: string;
  dayOfWeek: string;
  isWeekend: boolean;
  isExamPeriod: boolean;
  isHoliday: boolean;
  corridorId: string;
  corridorName: string;
  actualStudents: number;
}

export interface DemandForecastPoint {
  label: string;
  date: string;
  predictedStudents: number;
  lowerBound: number;
  upperBound: number;
  recommendedBuses: number;
  isPeakDay: boolean;
}

export interface HourlyDemandPoint {
  hour: string;
  demand: number;
  capacity: number;
  isPeak: boolean;
}

export interface CorridorGrowth {
  corridorId: string;
  corridorName: string;
  currentDailyAvg: number;
  projectedNextWeekAvg: number;
  growthPct: number;
  recommendedBuses: number;
}

export interface DemandPredictionResponse {
  corridorId: string;
  corridorName: string;
  isExamPeriod: boolean;
  isHoliday: boolean;
  busCapacityBasis: number;
  weeklyForecast: DemandForecastPoint[];
  hourlyProfile: HourlyDemandPoint[];
  corridorGrowth: CorridorGrowth[];
  modelSummary: string;
}

export interface TransitNotification {
  id: string;
  dedupKey: string;
  userId: string;
  kind: 'arrival_10min' | 'route_disruption' | 'allocation_update';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  busNumber?: string;
  actionTab?: 'tracker' | 'optimizer' | 'alternatives' | 'carpool';
  actionLabel?: string;
  read: boolean;
  createdAt: string;
}

export interface ExamUrgentCohort {
  id: string;
  villageId: string;
  villageName: string;
  collegeId: string;
  collegeName: string;
  examTitle: string;
  examStartTime: string;
  minutesUntilExam: number;
  studentCount: number;
  assignedFallback: string;
}

export interface ExamCrisisState {
  active: boolean;
  demandSurgeMultiplier: number;
  brokenBusIds: string[];
  floodedEdgeId: string;
  examWindowMinutes: number;
  urgentCohorts: ExamUrgentCohort[];
  activatedAt?: string;
  summaryNote: string;
}

export interface StudentFieldCase {
  id: string;
  imagePath: string;
  imageAlt: string;
  badge: string;
  title: string;
  problemFaced: string;
  solutionSummary: string;
  affectedCorridor: string;
  targetTab: 'tracker' | 'optimizer' | 'alternatives' | 'carpool';
  actionLabel: string;
}
