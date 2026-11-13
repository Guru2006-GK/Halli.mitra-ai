import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORICAL_DEMAND_RECORDS,
  LOCATION_NODES,
  ROAD_EDGES,
  SEED_BUSES,
  SEED_CARPOOLS,
  SEED_PROVIDER_VEHICLES,
  SEED_TRANSPORT_REQUESTS,
} from '../data/networkSeed';
import { optimizeRouteAStar } from './routing';
import { allocateFleetIntelligent } from './allocation';
import { predictStudentDemand } from './demand';
import { matchCarpoolGroups, recommendAlternativeTransport } from './matching';
import { evaluateStudentNotifications } from './notifications';

test('A* route optimizer finds valid village-to-college path and detours around blocked edges', () => {
  const normal = optimizeRouteAStar({
    nodes: LOCATION_NODES,
    edges: ROAD_EDGES,
    originId: 'v_kirugavalu',
    destinationId: 'c_pes_mandya',
    mode: 'fastest',
  });
  assert.ok(normal);
  assert.equal(normal.pathNodeIds[0], 'v_kirugavalu');
  assert.equal(normal.pathNodeIds[normal.pathNodeIds.length - 1], 'c_pes_mandya');
  assert.ok(normal.pathNodeIds.includes('j_guthalu'));

  // Block Kirugavalu -> Guthalu edge ('e3'), expect detour via Bannur & Arakeshwar
  const detour = optimizeRouteAStar({
    nodes: LOCATION_NODES,
    edges: ROAD_EDGES,
    originId: 'v_kirugavalu',
    destinationId: 'c_pes_mandya',
    mode: 'fastest',
    blockedEdgeIds: ['e3'],
  });
  assert.ok(detour);
  assert.ok(!detour.pathNodeIds.includes('j_guthalu'));
  assert.ok(detour.pathNodeIds.includes('v_bannur'));
  assert.ok(detour.totalDistanceKm > normal.totalDistanceKm);
});

test('Intelligent bus allocation prevents overcrowding and flags capacity deficit when buses are cancelled', () => {
  const report = allocateFleetIntelligent({
    buses: SEED_BUSES,
    nodes: LOCATION_NODES,
    requests: SEED_TRANSPORT_REQUESTS,
  });
  assert.ok(report.totalDemand > 0);
  assert.ok(report.totalAllocatedSeats > 0);
  for (const plan of report.plans) {
    assert.ok(plan.totalAssigned <= plan.capacity);
  }
  assert.ok(report.extraBusesSuggested >= 1);
  assert.ok(report.alerts.length >= 1);
});

test('Demand predictor adjusts for exam periods and holidays', () => {
  const regular = predictStudentDemand({
    history: HISTORICAL_DEMAND_RECORDS,
    corridorId: 'corridor_malavalli_mandya',
    isExamPeriod: false,
    isHoliday: false,
  });
  const exam = predictStudentDemand({
    history: HISTORICAL_DEMAND_RECORDS,
    corridorId: 'corridor_malavalli_mandya',
    isExamPeriod: true,
    isHoliday: false,
  });
  const holiday = predictStudentDemand({
    history: HISTORICAL_DEMAND_RECORDS,
    corridorId: 'corridor_malavalli_mandya',
    isExamPeriod: false,
    isHoliday: true,
  });
  assert.equal(regular.weeklyForecast.length, 7);
  const regTotal = regular.weeklyForecast.reduce((s, d) => s + d.predictedStudents, 0);
  const examTotal = exam.weeklyForecast.reduce((s, d) => s + d.predictedStudents, 0);
  const holTotal = holiday.weeklyForecast.reduce((s, d) => s + d.predictedStudents, 0);
  assert.ok(examTotal > regTotal);
  assert.ok(holTotal < regTotal);
});

test('Alternative transport recommender ranks verified local vehicles and carpool matcher sorts by departure time', () => {
  const alts = recommendAlternativeTransport({
    vehicles: SEED_PROVIDER_VEHICLES,
    nodes: LOCATION_NODES,
    originVillageId: 'v_kirugavalu',
    destinationCollegeId: 'c_pes_mandya',
    passengerCount: 2,
  });
  assert.ok(alts.length >= 2);
  assert.equal(alts[0].vehicleId, 'pv_1');
  assert.ok(alts[0].verified);

  const pools = matchCarpoolGroups({
    groups: SEED_CARPOOLS,
    originVillageId: 'v_kirugavalu',
    departureTime: '07:45',
  });
  assert.equal(pools.length, 1);
  assert.equal(pools[0].id, 'cp_1');
});

test('Student notifications trigger at <= 10 min ETA and on route disruptions with idempotent deduplication', () => {
  const dedup = new Set<string>();

  // ETA 24 min -> no 10-min arrival alert
  const initial = evaluateStudentNotifications({
    userId: 'u_student_1',
    villageId: 'v_kirugavalu',
    collegeId: 'c_pes_mandya',
    buses: SEED_BUSES,
    edges: ROAD_EDGES,
    nodes: LOCATION_NODES,
    transportRequests: SEED_TRANSPORT_REQUESTS,
    existingDedupKeys: dedup,
  });
  assert.equal(initial.length, 0);

  // Assigned bus ETA drops to 9 min -> triggers arrival_10min
  const busesArrivingSoon = SEED_BUSES.map((b) =>
    b.busNumber === 'KA-11-F-0412' ? { ...b, etaMinutes: 9 } : b
  );
  const arrivalNotifs = evaluateStudentNotifications({
    userId: 'u_student_1',
    villageId: 'v_kirugavalu',
    collegeId: 'c_pes_mandya',
    buses: busesArrivingSoon,
    edges: ROAD_EDGES,
    nodes: LOCATION_NODES,
    transportRequests: SEED_TRANSPORT_REQUESTS,
    existingDedupKeys: dedup,
  });
  assert.equal(arrivalNotifs.length, 1);
  assert.equal(arrivalNotifs[0].kind, 'arrival_10min');

  // Re-evaluating same state produces 0 duplicates
  const duplicateCheck = evaluateStudentNotifications({
    userId: 'u_student_1',
    villageId: 'v_kirugavalu',
    collegeId: 'c_pes_mandya',
    buses: busesArrivingSoon,
    edges: ROAD_EDGES,
    nodes: LOCATION_NODES,
    transportRequests: SEED_TRANSPORT_REQUESTS,
    existingDedupKeys: dedup,
  });
  assert.equal(duplicateCheck.length, 0);

  // Roadblock on assigned corridor ('e3') + bus cancellation -> triggers route_disruption alerts
  const blockedEdges = ROAD_EDGES.map((e) => (e.id === 'e3' ? { ...e, blocked: true } : e));
  const cancelledBus = busesArrivingSoon.map((b) =>
    b.busNumber === 'KA-11-F-0412'
      ? { ...b, status: 'Cancelled' as const, delayReason: 'Engine breakdown' }
      : b
  );
  const disruptionNotifs = evaluateStudentNotifications({
    userId: 'u_student_1',
    villageId: 'v_kirugavalu',
    collegeId: 'c_pes_mandya',
    buses: cancelledBus,
    edges: blockedEdges,
    nodes: LOCATION_NODES,
    transportRequests: SEED_TRANSPORT_REQUESTS,
    existingDedupKeys: dedup,
  });
  assert.equal(disruptionNotifs.length, 2);
  assert.ok(disruptionNotifs.every((n) => n.kind === 'route_disruption'));
});

import { applyExamCrisisScenario, restoreNormalOperations } from './crisis';

test('Examination Day Crisis triggers 2 bus breakdowns, +40% demand surge, flooded road detour, and <2h urgent notifications', () => {
  const baselineReport = allocateFleetIntelligent({
    buses: SEED_BUSES,
    nodes: LOCATION_NODES,
    requests: SEED_TRANSPORT_REQUESTS,
    demandMultiplier: 1.0,
  });

  const crisis = applyExamCrisisScenario({
    buses: SEED_BUSES,
    edges: ROAD_EDGES,
    nodes: LOCATION_NODES,
    requests: SEED_TRANSPORT_REQUESTS,
    nowIso: '2026-11-13T07:35:00.000Z',
  });

  assert.equal(crisis.examCrisis.active, true);
  assert.equal(crisis.examCrisis.demandSurgeMultiplier, 1.4);
  assert.equal(crisis.buses.filter((b) => b.status === 'Cancelled').length, 2);
  assert.equal(crisis.edges.find((e) => e.id === 'e2')?.blocked, true);
  assert.ok(crisis.examCrisis.urgentCohorts.length >= 3);
  assert.ok(crisis.examCrisis.urgentCohorts.every((c) => c.minutesUntilExam <= 120));

  // Verify A* still detours Malavalli -> PES Mandya around flooded Malavalli <-> Kirugavalu (e2)
  const floodDetour = optimizeRouteAStar({
    nodes: LOCATION_NODES,
    edges: crisis.edges,
    originId: 'v_malavalli',
    destinationId: 'c_pes_mandya',
    mode: 'fastest',
  });
  assert.ok(floodDetour);
  assert.ok(floodDetour.pathNodeIds.includes('v_bannur'));
  assert.ok(!floodDetour.pathNodeIds.includes('v_kirugavalu'));
  assert.ok(floodDetour.bypassedBlockedEdges.includes('Malavalli ↔ Kirugavalu'));

  // Verify +40% surge allocation escalates demand above baseline
  const crisisReport = allocateFleetIntelligent({
    buses: crisis.buses,
    nodes: LOCATION_NODES,
    requests: crisis.requests,
    demandMultiplier: crisis.examCrisis.demandSurgeMultiplier,
  });
  assert.ok(crisisReport.totalDemand >= Math.round(baselineReport.totalDemand * 1.35));
  assert.ok(crisisReport.unservedDemand > baselineReport.unservedDemand);

  // Verify SSE evaluator emits crisis alert
  const alerts = evaluateStudentNotifications({
    userId: 'u_student_1',
    villageId: 'v_kirugavalu',
    collegeId: 'c_pes_mandya',
    buses: crisis.buses,
    edges: crisis.edges,
    nodes: LOCATION_NODES,
    transportRequests: crisis.requests,
    examCrisis: crisis.examCrisis,
  });
  assert.ok(alerts.some((a) => a.title.includes('Exam Day Crisis')));

  // Verify restore cleans up crisis state
  const restored = restoreNormalOperations({
    buses: crisis.buses,
    edges: crisis.edges,
    requests: crisis.requests,
  });
  assert.equal(restored.examCrisis.active, false);
  assert.equal(restored.edges.find((e) => e.id === 'e2')?.blocked, false);
});

