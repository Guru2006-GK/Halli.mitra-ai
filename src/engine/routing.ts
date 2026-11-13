import type { LocationNode, RoadEdge, RouteOptimizationResult } from '../types';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function optimizeRouteAStar(params: {
  nodes: LocationNode[];
  edges: RoadEdge[];
  originId: string;
  destinationId: string;
  mode?: 'fastest' | 'lowest_wait' | 'detour';
  blockedEdgeIds?: string[];
}): RouteOptimizationResult | null {
  const { nodes, edges, originId, destinationId, mode = 'fastest', blockedEdgeIds = [] } = params;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const origin = nodeMap.get(originId);
  const destination = nodeMap.get(destinationId);
  if (!origin || !destination) return null;

  const blockedSet = new Set([
    ...blockedEdgeIds,
    ...edges.filter((e) => e.blocked).map((e) => e.id),
  ]);

  const adj = new Map<string, { to: string; edge: RoadEdge }[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const edge of edges) {
    adj.get(edge.from)?.push({ to: edge.to, edge });
    adj.get(edge.to)?.push({ to: edge.from, edge });
  }

  const edgeCost = (edge: RoadEdge, toNode: LocationNode): number => {
    if (blockedSet.has(edge.id)) {
      return Infinity;
    }
    const timeCost = edge.baseTimeMin * edge.congestionFactor;
    if (mode === 'fastest') {
      return timeCost;
    }
    if (mode === 'lowest_wait') {
      // Rewards passing high-demand village stops to consolidate waiting students while penalizing rural rough segments
      const demandBonus = Math.min(4, (toNode.populationStudents || 0) * 0.06);
      const qualityPenalty = edge.roadQuality === 'rural' ? 3.5 : 0;
      return Math.max(1, timeCost + qualityPenalty - demandBonus);
    }
    // detour mode prefers paved highways even if slightly longer
    return edge.distanceKm * (edge.roadQuality === 'paved' ? 1.0 : 1.35);
  };

  const heuristic = (nodeId: string): number => {
    const n = nodeMap.get(nodeId);
    if (!n) return 0;
    const km = haversineKm(n.lat, n.lng, destination.lat, destination.lng);
    if (mode === 'detour') return km;
    return (km / 50) * 60; // optimistic 50 km/h average rural transit speed in minutes
  };

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, { prevId: string; edge: RoadEdge }>();
  const open = new Set<string>([originId]);

  for (const n of nodes) {
    gScore.set(n.id, Infinity);
    fScore.set(n.id, Infinity);
  }
  gScore.set(originId, 0);
  fScore.set(originId, heuristic(originId));

  while (open.size > 0) {
    let current = '';
    let bestF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }
    if (!current || bestF === Infinity) break;
    if (current === destinationId) break;

    open.delete(current);
    const neighbors = adj.get(current) ?? [];
    for (const { to, edge } of neighbors) {
      const toNode = nodeMap.get(to);
      if (!toNode) continue;
      const weight = edgeCost(edge, toNode);
      if (!Number.isFinite(weight)) continue;

      const tentativeG = (gScore.get(current) ?? Infinity) + weight;
      if (tentativeG < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, { prevId: current, edge });
        gScore.set(to, tentativeG);
        fScore.set(to, tentativeG + heuristic(to));
        open.add(to);
      }
    }
  }

  if (!cameFrom.has(destinationId) && originId !== destinationId) {
    return null;
  }

  const pathNodeIds: string[] = [destinationId];
  const usedEdges: RoadEdge[] = [];
  let cursor = destinationId;
  while (cursor !== originId) {
    const step = cameFrom.get(cursor);
    if (!step) break;
    usedEdges.unshift(step.edge);
    pathNodeIds.unshift(step.prevId);
    cursor = step.prevId;
  }

  const totalDistanceKm = Number(
    usedEdges.reduce((sum, e) => sum + e.distanceKm, 0).toFixed(1)
  );
  const estimatedMinutes = Math.round(
    usedEdges.reduce((sum, e) => sum + e.baseTimeMin * e.congestionFactor, 0)
  );
  const pathNames = pathNodeIds.map((id) => nodeMap.get(id)?.name ?? id);
  const coordinates: [number, number][] = pathNodeIds.map((id) => {
    const n = nodeMap.get(id)!;
    return [n.lat, n.lng];
  });
  const pickupPoints = pathNodeIds.map((id) => nodeMap.get(id)?.pickupPoint ?? id);

  const bypassedBlockedEdges = edges
    .filter((e) => blockedSet.has(e.id))
    .map((e) => {
      const fromName = nodeMap.get(e.from)?.name ?? e.from;
      const toName = nodeMap.get(e.to)?.name ?? e.to;
      return `${fromName} ↔ ${toName}`;
    });

  const modeLabel =
    mode === 'fastest'
      ? 'A* Time-Minimized Shortest Path'
      : mode === 'lowest_wait'
      ? 'Demand-Weighted Consolidation Route'
      : 'Paved-Corridor Detour Route';

  const explanation =
    `${modeLabel}: Evaluated ${edges.length} road segments across ${nodes.length} nodes. ` +
    `Selected ${pathNames.join(' → ')} (${totalDistanceKm} km, ~${estimatedMinutes} min)` +
    (bypassedBlockedEdges.length > 0
      ? `, dynamically routing around ${bypassedBlockedEdges.length} blocked corridor(s): ${bypassedBlockedEdges.join('; ')}.`
      : ' with optimal student pickup coverage.');

  return {
    mode,
    originId,
    destinationId,
    pathNodeIds,
    pathNames,
    coordinates,
    totalDistanceKm,
    estimatedMinutes,
    pickupPoints,
    bypassedBlockedEdges,
    explanation,
  };
}
