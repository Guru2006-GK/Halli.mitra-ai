import type {
  Bus,
  ExamCrisisState,
  LocationNode,
  RoadEdge,
  StudentTransportRequest,
  TransitNotification,
} from '../types';

export function resolveStudentAssignedBus(params: {
  userId: string;
  villageId?: string;
  collegeId?: string;
  buses: Bus[];
  transportRequests: StudentTransportRequest[];
}): Bus | undefined {
  const { userId, villageId, collegeId, buses, transportRequests } = params;

  const userReq = transportRequests.find(
    (r) => r.studentId === userId && r.assignedBusNumber
  );
  if (userReq?.assignedBusNumber) {
    const byNumber = buses.find((b) => b.busNumber === userReq.assignedBusNumber);
    if (byNumber) return byNumber;
  }

  if (villageId) {
    const byVillageAndCollege = buses.find(
      (b) =>
        b.assignedVillageIds.includes(villageId) &&
        (!collegeId || b.destinationNodeId === collegeId)
    );
    if (byVillageAndCollege) return byVillageAndCollege;

    const byVillage = buses.find((b) => b.assignedVillageIds.includes(villageId));
    if (byVillage) return byVillage;
  }

  return buses[0];
}

export function evaluateStudentNotifications(params: {
  userId: string;
  villageId?: string;
  collegeId?: string;
  buses: Bus[];
  edges: RoadEdge[];
  nodes: LocationNode[];
  transportRequests: StudentTransportRequest[];
  examCrisis?: ExamCrisisState;
  existingDedupKeys?: Set<string>;
  nowIso?: string;
}): TransitNotification[] {
  const {
    userId,
    villageId,
    collegeId,
    buses,
    edges,
    nodes,
    transportRequests,
    examCrisis,
    existingDedupKeys = new Set<string>(),
    nowIso = new Date().toISOString(),
  } = params;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const assignedBus = resolveStudentAssignedBus({
    userId,
    villageId,
    collegeId,
    buses,
    transportRequests,
  });

  const created: TransitNotification[] = [];
  const pushIfNew = (item: Omit<TransitNotification, 'id' | 'createdAt' | 'read'>) => {
    if (existingDedupKeys.has(item.dedupKey)) return;
    existingDedupKeys.add(item.dedupKey);
    created.push({
      ...item,
      id: `notif_${item.dedupKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      read: false,
      createdAt: nowIso,
    });
  };

  if (assignedBus) {
    const pickupNode = villageId ? nodeMap.get(villageId) : nodeMap.get(assignedBus.currentNodeId);
    const pickupPoint = pickupNode?.pickupPoint ?? 'your village pickup shelter';
    const freeSeats = Math.max(0, assignedBus.capacity - assignedBus.occupiedSeats);

    // 1. 10-minute arrival threshold alert
    if (
      assignedBus.status !== 'Cancelled' &&
      assignedBus.etaMinutes > 0 &&
      assignedBus.etaMinutes <= 10
    ) {
      pushIfNew({
        dedupKey: `arrival_10min:${userId}:${assignedBus.id}:${assignedBus.progressIndex}`,
        userId,
        kind: 'arrival_10min',
        severity: 'warning',
        title: `Bus ${assignedBus.busNumber} arriving in ${assignedBus.etaMinutes} min`,
        message: `Head to ${pickupPoint}. ${freeSeats} seated spot(s) available on ${assignedBus.routeName}.`,
        busNumber: assignedBus.busNumber,
        actionTab: 'tracker',
        actionLabel: 'Track Bus',
      });
    }

    // 2. Assigned bus disruption alert (Delayed or Cancelled)
    if (assignedBus.status === 'Cancelled' || assignedBus.status === 'Delayed') {
      pushIfNew({
        dedupKey: `bus_disruption:${userId}:${assignedBus.id}:${assignedBus.status}:${assignedBus.delayReason ?? ''}`,
        userId,
        kind: 'route_disruption',
        severity: assignedBus.status === 'Cancelled' ? 'critical' : 'warning',
        title:
          assignedBus.status === 'Cancelled'
            ? `Assigned bus ${assignedBus.busNumber} cancelled`
            : `Assigned bus ${assignedBus.busNumber} delayed`,
        message:
          assignedBus.delayReason ||
          (assignedBus.status === 'Cancelled'
            ? 'Your regular bus is unavailable. Verified alternative vans are ready.'
            : `Updated ETA is ${assignedBus.etaMinutes} min.`),
        busNumber: assignedBus.busNumber,
        actionTab: assignedBus.status === 'Cancelled' ? 'alternatives' : 'tracker',
        actionLabel:
          assignedBus.status === 'Cancelled' ? 'View Alternative Transport' : 'Inspect Route',
      });
    }
  }

  // 3. Roadblock / route disruption along assigned bus path or student's village edges
  const relevantNodeIds = new Set<string>(assignedBus?.pathNodeIds ?? []);
  if (villageId) relevantNodeIds.add(villageId);

  for (const edge of edges) {
    if (!edge.blocked) continue;
    const touchesAssignedPath =
      assignedBus?.pathNodeIds.some((nId, idx) => {
        const nextId = assignedBus.pathNodeIds[idx + 1];
        if (!nextId) return false;
        return (
          (edge.from === nId && edge.to === nextId) ||
          (edge.to === nId && edge.from === nextId)
        );
      }) ?? false;

    const touchesVillage = villageId ? edge.from === villageId || edge.to === villageId : false;

    if (touchesAssignedPath || touchesVillage) {
      const fromName = nodeMap.get(edge.from)?.name ?? edge.from;
      const toName = nodeMap.get(edge.to)?.name ?? edge.to;
      pushIfNew({
        dedupKey: `road_disruption:${userId}:${edge.id}`,
        userId,
        kind: 'route_disruption',
        severity: 'critical',
        title: `Route disruption: ${fromName} ↔ ${toName} blocked`,
        message:
          'A road closure affects your corridor. Open AI Route Optimizer for an active A* detour or check alternative transport.',
        busNumber: assignedBus?.busNumber,
        actionTab: 'optimizer',
        actionLabel: 'Open Detour Route',
      });
    }
  }

  // 4. Examination Day Crisis priority dispatch alert
  if (examCrisis?.active) {
    const cohort = examCrisis.urgentCohorts.find((c) => c.villageId === villageId) ?? examCrisis.urgentCohorts[0];
    const surgePct = Math.round((examCrisis.demandSurgeMultiplier - 1) * 100);
    pushIfNew({
      dedupKey: `exam_crisis:${userId}:${examCrisis.activatedAt ?? 'active'}`,
      userId,
      kind: 'route_disruption',
      severity: 'critical',
      title: cohort
        ? `Exam Day Crisis: ${cohort.examTitle} in ${cohort.minutesUntilExam} min`
        : 'Exam Day Crisis: Backup Dispatch Activated',
      message: `${examCrisis.brokenBusIds.length} government buses offline, +${surgePct}% demand surge, and road flooding active. ${
        cohort ? `Fallback: ${cohort.assignedFallback}.` : 'Use Alternative Transport or A* Detour immediately.'
      }`,
      actionTab: 'alternatives',
      actionLabel: 'View Backup Transport',
    });
  }

  return created;
}
