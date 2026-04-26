'use client';

import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { DestinationSummary } from '@/app/api/map/route';

interface Props {
  destinations: DestinationSummary[];
}

function priceColor(price: number, min: number, max: number): string {
  // green (cheap) → yellow → red (expensive)
  const ratio = max === min ? 0 : (price - min) / (max - min);
  if (ratio < 0.33) return '#22c55e';
  if (ratio < 0.66) return '#f59e0b';
  return '#ef4444';
}

export default function DestinationMap({ destinations }: Props) {
  const prices = destinations.map((d) => d.minPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  return (
    <MapContainer
      center={[35, 18]}
      zoom={4}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {destinations.map((d) => (
        <CircleMarker
          key={d.destination}
          center={[d.lat, d.lng]}
          radius={12 + Math.min(d.offerCount / 50, 10)}
          pathOptions={{
            color: priceColor(d.minPrice, min, max),
            fillColor: priceColor(d.minPrice, min, max),
            fillOpacity: 0.75,
            weight: 2,
          }}
        >
          <Popup>
            <div className="text-sm min-w-[160px]">
              <div className="font-bold text-slate-800 mb-1">{d.label}</div>
              <div className="text-slate-600">
                Od <span className="font-semibold text-green-700">{d.minPrice.toLocaleString('pl-PL')} zl</span>
              </div>
              <div className="text-slate-500 text-xs mt-1">
                {d.hotelCount} hoteli &bull; {d.offerCount} ofert
              </div>
              <a
                href={`/?destinations=${d.destination}`}
                className="mt-2 block text-center bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700"
              >
                Pokaz oferty
              </a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
