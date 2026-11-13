import type {
  Bus,
  ExamCrisisState,
  ExamUrgentCohort,
  LocationNode,
  RoadEdge,
  StudentTransportRequest,
} from '../types';

export function createDefaultExamCrisis(): ExamCrisisState {
  return {
    active: false,
    demandSurgeMultiplier: 1.0,
    brokenBusIds: [],
    floodedEdgeId: 'e2',
    examWindowMinutes: 105,
    urgentCohorts: [],
    summaryNote: 'Normal weekday operations across Mandya–Mysuru rural corridors.',
  };
}

export function buildUrgentExamCohorts(params: {
  nodes: LocationNode[];
  demandMultiplier: number;
}): ExamUrgentCohort[] {
  const { nodes, demandMultiplier } = params;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return [
    {
      id: 'cohort_kirugavalu_pes',
      villageId: 'v_kirugavalu',
      villageName: nodeMap.get('v_kirugavalu')?.name ?? 'Kirugavalu',
      collegeId: 'c_pes_mandya',
      collegeName: nodeMap.get('c_pes_mandya')?.name ?? 'PES College, Mandya',
      examTitle: 'B.E. / B.Sc. Semester Examination',
      examStartTime: '09:30 AM',
      minutesUntilExam: 95,
      studentCount: Math.round((nodeMap.get('v_kirugavalu')?.populationStudents ?? 48) * demandMultiplier),
      assignedFallback: 'Gramin Express Minibus (16 seats) + A* Detour',
    },
    {
      id: 'cohort_malavalli_pes',
      villageId: 'v_malavalli',
      villageName: nodeMap.get('v_malavalli')?.name ?? 'Malavalli',
      collegeId: 'c_pes_mandya',
      collegeName: nodeMap.get('c_pes_mandya')?.name ?? 'PES College, Mandya',
      examTitle: 'PU & Engineering Morning Exam',
      examStartTime: '09:30 AM',
      minutesUntilExam: 105,
      studentCount: Math.round((nodeMap.get('v_malavalli')?.populationStudents ?? 64) * demandMultiplier),
      assignedFallback: 'Malavalli Youth Shuttle Van + Bannur Flood Detour',
    },
    {
      id: 'cohort_bannur_mysuru',
      villageId: 'v_bannur',
      villageName: nodeMap.get('v_bannur')?.name ?? 'Bannur',
      collegeId: 'c_maharaja_mysuru',
      collegeName: nodeMap.get('c_maharaja_mysuru')?.name ?? "Maharaja's College, Mysuru",
      examTitle: 'Degree Morning Theory Paper',
      examStartTime: '09:45 AM',
      minutesUntilExam: 115,
      studentCount: Math.round((nodeMap.get('v_bannur')?.populationStudents ?? 44) * demandMultiplier),
      assignedFallback: 'Cauvery Student Feeder Van + Bannur–Mysuru Carpool',
    },
  ];
}

export function applyExamCrisisScenario(params: {
  buses: Bus[];
  edges: RoadEdge[];
  nodes: LocationNode[];
  requests: StudentTransportRequest[];
  nowIso?: string;
}): {
  buses: Bus[];
  edges: RoadEdge[];
  requests: StudentTransportRequest[];
  examCrisis: ExamCrisisState;
} {
  const { buses, edges, nodes, requests, nowIso = new Date().toISOString() } = params;
  const brokenBusIds = ['bus_1', 'bus_4'];
  const floodedEdgeId = 'e2'; // Malavalli <-> Kirugavalu major village connector
  const demandSurgeMultiplier = 1.4; // +40% student demand surge

  const nextBuses: Bus[] = buses.map((bus) => {
    if (bus.id === 'bus_1') {
      return {
        ...bus,
        status: 'Cancelled',
        occupiedSeats: 0,
        etaMinutes: 0,
        delayReason:
          'Exam Day Technical Breakdown: Alternator & cooling fault near Kirugavalu — backup vans & carpools dispatched',
      };
    }
    if (bus.id === 'bus_4') {
      return {
        ...bus,
        status: 'Cancelled',
        occupiedSeats: 0,
        etaMinutes: 0,
        delayReason:
          'Exam Day Technical Breakdown: Hydraulic clutch failure at Bannur depot — alternative transport active',
      };
    }
    if (bus.id === 'bus_2') {
      return {
        ...bus,
        status: 'Delayed',
        etaMinutes: Math.max(bus.etaMinutes, 36),
        delayReason:
          'Rerouting around flooded Malavalli ↔ Kirugavalu corridor (+18 min detour)',
      };
    }
    return {
      ...bus,
      occupiedSeats: bus.capacity, // Running at full surge capacity
    };
  });

  const nextEdges: RoadEdge[] = edges.map((edge) =>
    edge.id === floodedEdgeId
      ? { ...edge, blocked: true, congestionFactor: 2.5 }
      : { ...edge, blocked: false }
  );

  const brokenNumbers = new Set(
    nextBuses.filter((b) => brokenBusIds.includes(b.id)).map((b) => b.busNumber)
  );

  const nextRequests: StudentTransportRequest[] = requests.map((req) =>
    req.assignedBusNumber && brokenNumbers.has(req.assignedBusNumber)
      ? {
          ...req,
          needsAlternative: true,
          status: 'Waitlisted',
          assignedBusNumber: undefined,
        }
      : req
  );

  const urgentCohorts = buildUrgentExamCohorts({
    nodes,
    demandMultiplier: demandSurgeMultiplier,
  });

  const examCrisis: ExamCrisisState = {
    active: true,
    demandSurgeMultiplier,
    brokenBusIds,
    floodedEdgeId,
    examWindowMinutes: 95,
    urgentCohorts,
    activatedAt: nowIso,
    summaryNote:
      'Examination Day Crisis Active: 2 government buses offline (KA-11-F-0412, KA-09-F-2290), +40% student demand surge, Malavalli ↔ Kirugavalu road flooded, and 3 exam cohorts starting within 2 hours.',
  };

  return {
    buses: nextBuses,
    edges: nextEdges,
    requests: nextRequests,
    examCrisis,
  };
}

export function restoreNormalOperations(params: {
  buses: Bus[];
  edges: RoadEdge[];
  requests: StudentTransportRequest[];
}): {
  buses: Bus[];
  edges: RoadEdge[];
  requests: StudentTransportRequest[];
  examCrisis: ExamCrisisState;
} {
  const { buses, edges, requests } = params;

  const nextBuses: Bus[] = buses.map((bus) => {
    if (bus.id === 'bus_1') {
      return {
        ...bus,
        status: 'On Time',
        occupiedSeats: 41,
        etaMinutes: 24,
        delayReason: undefined,
      };
    }
    if (bus.id === 'bus_2') {
      return {
        ...bus,
        status: 'Delayed',
        etaMinutes: 39,
        delayReason: 'Heavy morning fog & road resurfacing near Halaguru Cross (+14 min)',
      };
    }
    if (bus.id === 'bus_4') {
      return {
        ...bus,
        status: 'Cancelled',
        occupiedSeats: 0,
        etaMinutes: 0,
        delayReason: 'Hydraulic clutch fault at Bannur depot — alternative transport activated',
      };
    }
    return bus;
  });

  const nextEdges: RoadEdge[] = edges.map((edge) => ({
    ...edge,
    blocked: false,
    congestionFactor: edge.id === 'e2' ? 1.0 : edge.congestionFactor,
  }));

  const nextRequests: StudentTransportRequest[] = requests.map((req) =>
    req.id === 'tr_1'
      ? {
          ...req,
          status: 'Matched',
          needsAlternative: false,
          assignedBusNumber: 'KA-11-F-0412',
        }
      : req
  );

  return {
    buses: nextBuses,
    edges: nextEdges,
    requests: nextRequests,
    examCrisis: createDefaultExamCrisis(),
  };
}
