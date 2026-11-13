import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Bus, LocationNode, RoadEdge, TransportProviderVehicle } from '../types';

interface TransitMapProps {
  nodes: LocationNode[];
  edges: RoadEdge[];
  buses?: Bus[];
  vehicles?: TransportProviderVehicle[];
  selectedBusId?: string | null;
  highlightedPath?: [number, number][] | null;
  onSelectBus?: (busId: string) => void;
  heightClass?: string;
}

export function TransitMap({
  nodes,
  edges,
  buses = [],
  vehicles = [],
  selectedBusId,
  highlightedPath,
  onSelectBus,
  heightClass = 'h-[420px]',
}: TransitMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onSelectBusRef = useRef(onSelectBus);
  onSelectBusRef.current = onSelectBus;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [12.46, 76.9],
      zoom: 10,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = layerGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;

    group.clearLayers();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Draw road network edges
    for (const edge of edges) {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) continue;

      const polyline = L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        {
          color: edge.blocked ? '#DC2626' : '#64748B',
          weight: edge.blocked ? 3.5 : 2,
          opacity: edge.blocked ? 0.9 : 0.45,
          dashArray: edge.blocked ? '6, 6' : undefined,
        }
      );

      polyline.bindPopup(
        `<div style="font-family:DM Sans,sans-serif;font-size:12px;">
          <strong>${from.name} &harr; ${to.name}</strong><br/>
          ${edge.distanceKm} km &middot; ${edge.baseTimeMin} min &middot; ${edge.roadQuality}<br/>
          Status: <strong style="color:${edge.blocked ? '#DC2626' : '#0F766E'}">${
            edge.blocked ? 'Road Blocked (Detour Active)' : 'Open'
          }</strong>
        </div>`
      );
      polyline.addTo(group);
    }

    // Draw optimized A* route if provided
    if (highlightedPath && highlightedPath.length >= 2) {
      const routeLine = L.polyline(highlightedPath, {
        color: '#0F766E',
        weight: 5,
        opacity: 0.92,
      });
      routeLine.addTo(group);
      map.fitBounds(routeLine.getBounds(), { padding: [52, 52], maxZoom: 12 });
    }

    // Draw village, junction, and college nodes
    for (const node of nodes) {
      const isCollege = node.kind === 'college';
      const isJunction = node.kind === 'junction';
      const color = isCollege ? '#0F172A' : isJunction ? '#64748B' : '#0F766E';

      const marker = L.circleMarker([node.lat, node.lng], {
        radius: isCollege ? 8 : isJunction ? 5 : 6,
        color: '#FFFFFF',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      });

      marker.bindPopup(
        `<div style="font-family:DM Sans,sans-serif;font-size:12px;">
          <strong>${node.name}</strong> (${node.kind})<br/>
          Pickup: ${node.pickupPoint}<br/>
          ${node.populationStudents > 0 ? `Daily Student Demand: ${node.populationStudents}` : 'Campus Destination'}
        </div>`
      );
      marker.addTo(group);
    }

    // Draw buses (Live Simulated GPS)
    for (const bus of buses) {
      const isSelected = bus.id === selectedBusId;
      const statusColor =
        bus.status === 'Cancelled'
          ? '#DC2626'
          : bus.status === 'Delayed'
          ? '#D97706'
          : '#0F766E';

      const busIcon = L.divIcon({
        className: 'hm-bus-pin',
        html: `<div style="
          background:${statusColor};
          color:#fff;
          border:2px solid ${isSelected ? '#0F172A' : '#FFFFFF'};
          border-radius:6px;
          padding:2px 6px;
          font-family:JetBrains Mono,monospace;
          font-size:11px;
          font-weight:600;
          white-space:nowrap;
          box-shadow:0 2px 6px rgba(15,23,42,0.25);
        ">${bus.busNumber}</div>`,
        iconSize: [94, 24],
        iconAnchor: [47, 12],
      });

      const marker = L.marker([bus.lat, bus.lng], { icon: busIcon, zIndexOffset: 600 });
      const freeSeats = Math.max(0, bus.capacity - bus.occupiedSeats);
      marker.bindPopup(
        `<div style="font-family:DM Sans,sans-serif;font-size:12px;">
          <strong>${bus.busNumber}</strong> &middot; ${bus.status}<br/>
          ${bus.routeName}<br/>
          Seats: ${freeSeats} free / ${bus.capacity} total<br/>
          ETA: ${bus.status === 'Cancelled' ? 'Service Cancelled' : `${bus.etaMinutes} min`}<br/>
          <em>${bus.isSimulatedGps ? 'Simulated GPS Telemetry Mode' : 'Live GPS'}</em>
        </div>`
      );
      marker.on('click', () => {
        onSelectBusRef.current?.(bus.id);
      });
      marker.addTo(group);
    }

    // Draw verified alternative vehicles with subtle south-east offset so they never cover bus badges
    for (const v of vehicles) {
      if (!v.available) continue;
      const vanIcon = L.divIcon({
        className: 'hm-van-pin',
        html: `<div style="
          background:#FFFFFF;
          color:#0F172A;
          border:1.5px solid #0F766E;
          border-radius:4px;
          padding:1px 5px;
          font-family:DM Sans,sans-serif;
          font-size:10px;
          font-weight:600;
          white-space:nowrap;
          box-shadow:0 1px 4px rgba(15,23,42,0.16);
        ">${v.vehicleType === 'Minibus' ? 'VAN' : 'ALT'} ${v.availableSeats}s</div>`,
        iconSize: [58, 20],
        iconAnchor: [29, -10],
      });

      const marker = L.marker([v.lat - 0.014, v.lng + 0.014], {
        icon: vanIcon,
        zIndexOffset: 300,
      });
      marker.bindPopup(
        `<div style="font-family:DM Sans,sans-serif;font-size:12px;">
          <strong>${v.vehicleName}</strong> (${v.regNumber})<br/>
          Driver: ${v.driverName} &middot; ${v.tripStatus}<br/>
          Available Seats: ${v.availableSeats}/${v.totalSeats}
        </div>`
      );
      marker.addTo(group);
    }
  }, [nodes, edges, buses, vehicles, selectedBusId, highlightedPath]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      <div ref={containerRef} className={`w-full ${heightClass}`} data-testid="transit-map" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-teal-700" />
            Village Stop
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-900" />
            College Campus
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-teal-700" />
            On Time Bus
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-amber-600" />
            Delayed Bus
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-red-600" />
            Cancelled / Blocked
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-500">
          Simulated GPS Telemetry Mode · OpenStreetMap
        </span>
      </div>
    </div>
  );
}
