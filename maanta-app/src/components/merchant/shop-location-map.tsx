"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default Leaflet marker icons break under bundlers — use CDN assets, same as
// the shopper browse map.
const pinIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/**
 * Recentre only when the caller says a NEW fix arrived.
 *
 * Recentering on every position change would fight the merchant: each drag
 * would yank the map back under their finger. `recenterKey` is bumped by the
 * caller when a fresh device reading lands, and never when the merchant moves
 * the pin themselves.
 */
function Recentre({ position, recenterKey }: { position: [number, number] | null; recenterKey: number }) {
  const map = useMap();
  const applied = useRef<number | null>(null);
  useEffect(() => {
    if (!position) return;
    if (applied.current === recenterKey) return;
    applied.current = recenterKey;
    map.setView(position, Math.max(map.getZoom(), 18));
  }, [map, position, recenterKey]);
  return null;
}

function TapToPlace({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onMove(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

/**
 * The shop pin the merchant confirms during onboarding (D162).
 *
 * Read-write by design: tapping the map or dragging the marker moves the pin,
 * which is the manual fallback the ruling requires for a denied permission, an
 * unavailable fix, or a reading too coarse to identify one shop entrance. The
 * component never asks for a position itself — the merchant's explicit
 * "Locate my shop" is the only thing that does — so nothing here tracks anyone.
 */
export function ShopLocationMap({
  lat,
  lng,
  centre,
  recenterKey,
  onMove,
}: {
  /** Confirmed-or-proposed pin. Null means nothing placed yet. */
  lat: number | null;
  lng: number | null;
  /** Where to open the map when there is no pin — the node centroid. */
  centre: [number, number];
  recenterKey: number;
  onMove: (lat: number, lng: number) => void;
}) {
  const position: [number, number] | null = lat != null && lng != null ? [lat, lng] : null;

  return (
    <MapContainer
      center={position ?? centre}
      zoom={position ? 18 : 16}
      className="h-56 w-full rounded-card"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <TapToPlace onMove={onMove} />
      <Recentre position={position} recenterKey={recenterKey} />
      {position ? (
        <Marker
          position={position}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const { lat: nextLat, lng: nextLng } = e.target.getLatLng();
              onMove(nextLat, nextLng);
            },
          }}
        />
      ) : null}
    </MapContainer>
  );
}
