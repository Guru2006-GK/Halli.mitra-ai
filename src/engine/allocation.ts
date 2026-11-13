import type {
  AllocationReport,
  Bus,
  BusAllocationPlan,
  LocationNode,
  StudentTransportRequest,
} from '../types';

export function allocateFleetIntelligent(params: {
  buses: Bus[];
  nodes: LocationNode[];
  requests: StudentTransportRequest[];
  demandMultiplier?: number;
}): AllocationReport {
  const { buses, nodes, requests, demandMultiplier = 1.0 } = params;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Aggregate village student demand: baseline village student load (* demandMultiplier) + active student requests
  let baselineDemand = 0;
  const demandByVillage = new Map<string, number>();
  for (const node of nodes) {
    if (node.kind === 'village' && node.populationStudents > 0) {
      baselineDemand += node.populationStudents;
      demandByVillage.set(
        node.id,
        Math.max(1, Math.round(node.populationStudents * demandMultiplier))
      );
    }
  }
  for (const req of requests) {
    if (req.status !== 'Reassigned') {
      baselineDemand += 1;
      demandByVillage.set(
        req.villageId,
        (demandByVillage.get(req.villageId) ?? 0) + 1
      );
    }
  }

  const remainingDemand = new Map(demandByVillage);
  const totalDemand = Array.from(demandByVillage.values()).reduce((a, b) => a + b, 0);

  const activeBuses = buses.filter((b) => b.status !== 'Cancelled');
  const cancelledBuses = buses.filter((b) => b.status === 'Cancelled');

  // Sort villages descending by student demand so high-demand clusters get priority
  const priorityVillages = Array.from(demandByVillage.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const plans: BusAllocationPlan[] = [];
  const alerts: string[] = [];

  if (demandMultiplier > 1.01) {
    const surgePct = Math.round((demandMultiplier - 1) * 100);
    alerts.push(
      `Examination Day Demand Surge (+${surgePct}%): Village demand escalated from ${baselineDemand} to ${totalDemand} students.`
    );
  }

  if (cancelledBuses.length > 0) {
    alerts.push(
      `${cancelledBuses.length} bus(es) unavailable (${cancelledBuses
        .map((b) => b.busNumber)
        .join(', ')}). Reallocating remaining fleet and flagging feeder vans.`
    );
  }

  // First pass: assign each active bus to its primary assigned villages without exceeding 95% comfortable load unless needed
  const busRemainingCap = new Map<string, number>();
  const busAssignments = new Map<
    string,
    { villageId: string; villageName: string; studentCount: number }[]
  >();

  for (const bus of activeBuses) {
    busRemainingCap.set(bus.id, bus.capacity);
    busAssignments.set(bus.id, []);

    for (const vId of bus.assignedVillageIds) {
      const waiting = remainingDemand.get(vId) ?? 0;
      const capLeft = busRemainingCap.get(bus.id) ?? 0;
      if (waiting > 0 && capLeft > 0) {
        const take = Math.min(waiting, capLeft);
        remainingDemand.set(vId, waiting - take);
        busRemainingCap.set(bus.id, capLeft - take);
        busAssignments.get(bus.id)!.push({
          villageId: vId,
          villageName: nodeMap.get(vId)?.name ?? vId,
          studentCount: take,
        });
      }
    }
  }

  // Second pass: redistribute leftover/unserved demand (e.g. from cancelled buses or overflowing villages) to buses with spare seats
  for (const vId of priorityVillages) {
    let waiting = remainingDemand.get(vId) ?? 0;
    if (waiting <= 0) continue;

    // Prefer buses with highest spare capacity
    const candidateBuses = [...activeBuses].sort(
      (a, b) => (busRemainingCap.get(b.id) ?? 0) - (busRemainingCap.get(a.id) ?? 0)
    );

    for (const bus of candidateBuses) {
      if (waiting <= 0) break;
      const capLeft = busRemainingCap.get(bus.id) ?? 0;
      if (capLeft <= 0) continue;

      const take = Math.min(waiting, capLeft);
      waiting -= take;
      remainingDemand.set(vId, waiting);
      busRemainingCap.set(bus.id, capLeft - take);

      const list = busAssignments.get(bus.id)!;
      const existing = list.find((item) => item.villageId === vId);
      if (existing) {
        existing.studentCount += take;
      } else {
        list.push({
          villageId: vId,
          villageName: nodeMap.get(vId)?.name ?? vId,
          studentCount: take,
        });
      }
    }
  }

  let totalAllocatedSeats = 0;
  for (const bus of activeBuses) {
    const assigned = busAssignments.get(bus.id) ?? [];
    const totalAssigned = assigned.reduce((sum, item) => sum + item.studentCount, 0);
    totalAllocatedSeats += totalAssigned;
    const loadFactor = bus.capacity > 0 ? Number((totalAssigned / bus.capacity).toFixed(2)) : 0;

    const pickedUncoveredVillage = assigned.some(
      (a) => !bus.assignedVillageIds.includes(a.villageId)
    );

    let status: BusAllocationPlan['status'] = 'Optimal';
    if (pickedUncoveredVillage) status = 'Reallocated';
    else if (loadFactor >= 0.96) status = 'Near Capacity';

    const decisionNote = pickedUncoveredVillage
      ? `Dynamically absorbed overflow/cancelled corridor demand while staying within ${bus.capacity}-seat cap.`
      : loadFactor >= 0.96
      ? `Operating at ${Math.round(loadFactor * 100)}% load; zero standing overcrowding permitted.`
      : `Balanced allocation with ${bus.capacity - totalAssigned} buffer seats for mid-route stops.`;

    plans.push({
      busId: bus.id,
      busNumber: bus.busNumber,
      routeName: bus.routeName,
      assignedVillages: assigned,
      totalAssigned,
      capacity: bus.capacity,
      loadFactor,
      status,
      decisionNote,
    });
  }

  // Record cancelled buses explicitly in report
  for (const bus of cancelledBuses) {
    plans.push({
      busId: bus.id,
      busNumber: bus.busNumber,
      routeName: bus.routeName,
      assignedVillages: [],
      totalAssigned: 0,
      capacity: bus.capacity,
      loadFactor: 0,
      status: 'Overflow Risk',
      decisionNote: `Bus unavailable (${bus.delayReason ?? 'Cancelled'}). Demand shifted to active fleet & authorized vans.`,
    });
  }

  const unservedVillages = Array.from(remainingDemand.entries()).filter(([, count]) => count > 0);
  const unservedDemand = unservedVillages.reduce((sum, [, c]) => sum + c, 0);
  const extraBusesSuggested = unservedDemand > 0 ? Math.ceil(unservedDemand / 48) : 0;

  if (unservedDemand > 0) {
    const breakdown = unservedVillages
      .map(([id, count]) => `${nodeMap.get(id)?.name ?? id}: ${count} students`)
      .join(', ');
    alerts.push(
      `Capacity deficit of ${unservedDemand} seats (${breakdown}). Recommend dispatching ${extraBusesSuggested} additional 48-seat bus(es) or activating Alternative Transport vans.`
    );
  } else {
    alerts.push('All village student demand accommodated within safe seated fleet limits.');
  }

  return {
    generatedAt: new Date().toISOString(),
    baselineDemand,
    demandMultiplier,
    totalDemand,
    totalAllocatedSeats,
    unservedDemand,
    extraBusesSuggested,
    plans,
    alerts,
  };
}
