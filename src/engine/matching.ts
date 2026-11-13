import type {
  AlternativeOption,
  CarpoolGroup,
  LocationNode,
  TransportProviderVehicle,
} from '../types';

function approxKm(a: LocationNode, b: LocationNode): number {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 108;
  return Math.max(1.5, Math.sqrt(dLat * dLat + dLng * dLng));
}

export function recommendAlternativeTransport(params: {
  vehicles: TransportProviderVehicle[];
  nodes: LocationNode[];
  originVillageId: string;
  destinationCollegeId: string;
  passengerCount?: number;
}): AlternativeOption[] {
  const { vehicles, nodes, originVillageId, destinationCollegeId, passengerCount = 1 } = params;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const origin = nodeMap.get(originVillageId);
  const destination = nodeMap.get(destinationCollegeId);
  if (!origin || !destination) return [];

  const tripKm = approxKm(origin, destination);

  return vehicles
    .filter((v) => v.verified && v.available && v.availableSeats >= passengerCount)
    .map((v) => {
      const baseNode = nodeMap.get(v.baseVillageId) ?? origin;
      const deadheadKm = approxKm(baseNode, origin);
      const etaMinutes = Math.max(4, Math.round((deadheadKm / 34) * 60 + 3));
      const estimatedCostInr = Math.round(v.baseFare + tripKm * v.costPerKm * 0.35);

      // Multi-objective suitability score (0-100): proximity, affordability, safety, seat headroom
      const proximityScore = Math.max(0, 35 - deadheadKm * 1.1);
      const costScore = Math.max(0, 30 - estimatedCostInr * 0.45);
      const safetyScore = (v.safetyRating / 5) * 25;
      const seatScore = Math.min(10, v.availableSeats);
      const score = Math.round(proximityScore + costScore + safetyScore + seatScore);

      const reason =
        deadheadKm < 4
          ? `Stationed locally at ${baseNode.name} · Fastest pickup (${etaMinutes} min) & verified driver`
          : `Authorized ${v.vehicleType.toLowerCase()} within ${deadheadKm.toFixed(1)} km · ₹${estimatedCostInr}/student shared rate`;

      return {
        vehicleId: v.id,
        vehicleName: v.vehicleName,
        vehicleType: v.vehicleType,
        regNumber: v.regNumber,
        driverName: v.driverName,
        driverPhone: v.driverPhone,
        verified: v.verified,
        pickupLocation: origin.pickupPoint,
        etaMinutes,
        estimatedCostInr,
        availableSeats: v.availableSeats,
        safetyRating: v.safetyRating,
        score,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 480;
  return h * 60 + m;
}

export function matchCarpoolGroups(params: {
  groups: CarpoolGroup[];
  originVillageId?: string;
  destinationCollegeId?: string;
  departureTime?: string;
}): CarpoolGroup[] {
  const { groups, originVillageId, destinationCollegeId, departureTime } = params;
  const targetMin = departureTime ? parseMinutes(departureTime) : null;

  return [...groups]
    .filter((g) => {
      if (originVillageId && g.originVillageId !== originVillageId) return false;
      if (destinationCollegeId && g.destinationCollegeId !== destinationCollegeId) return false;
      return true;
    })
    .sort((a, b) => {
      const aOpen = a.maxSeats - a.memberIds.length;
      const bOpen = b.maxSeats - b.memberIds.length;
      if (targetMin !== null) {
        const diffA = Math.abs(parseMinutes(a.departureTime) - targetMin);
        const diffB = Math.abs(parseMinutes(b.departureTime) - targetMin);
        if (diffA !== diffB) return diffA - diffB;
      }
      return bOpen - aOpen;
    });
}
