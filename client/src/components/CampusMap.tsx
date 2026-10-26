import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Link } from "react-router-dom";
import type { ListingCard, Place } from "../lib/api";
import { money0 } from "../lib/format";

const pin = (html: string, cls: string) => L.divIcon({ html, className: cls, iconSize: undefined, iconAnchor: [14, 14] });
const listingIcon = (label: string) =>
  pin(`<span style="display:inline-block;background:#000;color:#FFC904;font:700 12px system-ui;padding:3px 7px;border-radius:999px;border:2px solid #FFC904;white-space:nowrap">${label}</span>`, "");
const spotIcon = pin(
  `<span style="display:grid;place-items:center;width:26px;height:26px;background:#FFC904;border:2px solid #000;border-radius:8px;font:800 12px system-ui;color:#000">P</span>`,
  "",
);
const areaIcon = pin(
  `<span style="display:grid;place-items:center;width:22px;height:22px;background:#fff;border:2px solid #333;border-radius:50%;font:700 10px system-ui;color:#333">A</span>`,
  "",
);

/** Items at the same pickup spot fan out in a small circle so every price pin is clickable. */
function spread(listings: ListingCard[]) {
  const seen = new Map<string, number>();
  return listings.map((l) => {
    const key = `${l.pickup.lat},${l.pickup.lng}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const angle = n * 2.4;
    const r = n === 0 ? 0 : 0.0007 * Math.sqrt(n);
    return { l, pos: [l.pickup.lat + r * Math.sin(angle), l.pickup.lng + r * Math.cos(angle)] as [number, number] };
  });
}

export interface MapProps {
  center: [number, number];
  zoom?: number;
  listings?: ListingCard[];
  spots?: Place[];
  areas?: Place[];
  highlight?: { lat: number; lng: number; label: string } | null;
  height?: number;
  onSpotSelect?: (spot: Place) => void;
}

/** Map tiles come from OpenStreetMap. Markers work even when tiles can't load. */
export function CampusMap({ center, zoom = 15, listings = [], spots = [], areas = [], highlight, height = 420, onSpotSelect }: MapProps) {
  return (
    <div style={{ height }} className="overflow-hidden rounded-card border border-line">
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {spots.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={spotIcon} eventHandlers={onSpotSelect ? { click: () => onSpotSelect(s) } : undefined}>
            <Popup>
              <strong>{s.name}</strong>
              <br />
              Public pickup spot{s.hours ? ` · ${s.hours}` : ""}
              {s.accessibility && (
                <>
                  <br />
                  {s.accessibility}
                </>
              )}
              {onSpotSelect && (
                <>
                  <br />
                  <button style={{ marginTop: 6, fontWeight: 700, textDecoration: "underline" }} onClick={() => onSpotSelect(s)}>
                    Meet here
                  </button>
                </>
              )}
            </Popup>
          </Marker>
        ))}
        {areas.map((a) => (
          <Marker key={a.id} position={[a.lat, a.lng]} icon={areaIcon}>
            <Popup>
              <strong>{a.name}</strong>
              <br />
              Students live here. Meet at a campus spot when you can.
            </Popup>
          </Marker>
        ))}
        {spread(listings).map(({ l, pos }) => (
          <Marker key={l.id} position={pos} icon={listingIcon(`${money0(l.prices.day)}/day`)}>
            <Popup>
              <strong>{l.title}</strong>
              <br />
              {money0(l.prices.day)}/day · {money0(l.hold_amount)} hold · {l.distance_miles} mi
              <br />
              <Link to={`/listings/${l.id}`}>View item</Link>
            </Popup>
          </Marker>
        ))}
        {highlight && (
          <Marker position={[highlight.lat, highlight.lng]} icon={listingIcon(highlight.label)}>
            <Popup>{highlight.label}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

export function MapLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-charcoal">
      <span className="inline-flex items-center gap-1.5">
        <span className="rounded-full border-2 border-gold bg-ink px-1.5 text-[10px] font-bold text-gold">$</span> Item pickup
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="grid h-4 w-4 place-items-center rounded border-2 border-ink bg-gold text-[9px] font-extrabold">P</span> Public campus pickup spot
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-charcoal bg-paper text-[9px] font-bold">A</span> Apartments near campus
      </span>
    </div>
  );
}
