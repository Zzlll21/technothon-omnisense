import type { SpatialOverview } from "../../lib/spatialOverview";

// Approved schematic geometry. Only the open-office slot maps to the one stored zone.
export const floorSpaces = [
  { id: "open-office", name: "Open Office", x: 40, y: 40, w: 460, h: 280 },
  { id: "conference", name: "Conference Room", x: 520, y: 40, w: 270, h: 280 },
  { id: "meeting", name: "Meeting Room", x: 810, y: 40, w: 230, h: 280 },
  { id: "private", name: "Private Office", x: 40, y: 410, w: 230, h: 180 },
  { id: "collaborative", name: "Collaborative Workspace", x: 290, y: 410, w: 460, h: 180 },
  { id: "pantry", name: "Pantry & shared facilities", x: 770, y: 410, w: 270, h: 180 }
] as const;
export type FloorSpaceId = typeof floorSpaces[number]["id"];

export function FloorPlan({ selected, onSelect, model }: { selected: FloorSpaceId; onSelect: (id: FloorSpaceId) => void; model: SpatialOverview | null }) {
  return <div className="sa-plan-scroll" role="region" tabIndex={0} aria-label="Office floor plan. Scroll horizontally on a narrow screen.">
    <svg className="sa-plan" viewBox="0 0 1080 640" role="group" aria-label="Schematic floor: one supported zone slot and five illustrative spaces">
      <rect x="40" y="40" width="1000" height="550" fill="#f8faf5" />
      {floorSpaces.map(space => <g key={space.id} className={`sa-space ${space.id === "open-office" ? "sa-supported" : ""}`} role="button" tabIndex={0}
        aria-label={`${space.name}. ${space.id === "open-office" ? "Supported zone slot. Inspect stored records." : "Illustrative space. No operational data."}`}
        aria-pressed={selected === space.id} aria-controls="spatial-inspector" onClick={() => onSelect(space.id)} onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(space.id); }
        }}>
        <rect className="sa-room-fill" x={space.x + 4} y={space.y + 4} width={space.w - 8} height={space.h - 8} />
        <text className="sa-room-name" x={space.x + 22} y={space.y + 37}>{space.name}</text>
        <text className="sa-room-meta" x={space.x + 22} y={space.y + 59}>{space.id === "open-office" ? (model ? "Supported SDP zone ↗" : "Supported zone slot · awaiting data") : "Illustrative · no operational data"}</text>
      </g>)}
      <g aria-hidden="true" className="sa-plan-context">
        <rect className="sa-sensing" x="67" y="116" width="194" height="177" rx="2" />
        <rect className="sa-sensing" x="275" y="116" width="194" height="177" rx="2" />
        <Desk x={129} y={130} /><Desk x={337} y={130} /><Desk x={129} y={218} /><Desk x={337} y={218} />
        <Table x={563} y={170} w={181} h={58} n={4} /><Table x={851} y={168} w={146} h={60} n={3} /><Desk x={69} y={487} />
        <g className="sa-furniture"><rect x="191" y="475" width="46" height="75" rx="3" /><rect x="330" y="485" width="100" height="36" rx="9" /><rect x="330" y="528" width="100" height="11" rx="4" /><rect x="451" y="490" width="58" height="48" rx="8" /><rect x="532" y="485" width="100" height="36" rx="9" /><rect x="532" y="528" width="100" height="11" rx="4" /><rect x="797" y="471" width="218" height="24" /><circle cx="840" cy="482" r="8" /><rect x="966" y="474" width="30" height="16" rx="2" /></g>
        <Table x={841} y={533} w={103} h={24} n={2} /><Plant x={469} y={76} /><Plant x={1010} y={76} /><Plant x={701} y={552} /><Plant x={244} y={552} />
        <path className="sa-walls" d="M40 320V40h1000v550H40V410M40 320h362m68 0h30V40m20 280h181m67 0h22V40m20 280h144m66 0h20M40 410h134m65 0h31v180m20-180h363m66 0h31v180m20-180h188m64 0h18" />
        <path className="sa-doors" d="M402 320v-60a60 60 0 0 1 60 60m239 0v-60a60 60 0 0 1 60 60m193 0v-60a60 60 0 0 1 60 60M174 410v60a60 60 0 0 0 60-60m419 0v60a60 60 0 0 0 60-60m245 0v60a60 60 0 0 0 60-60" />
        <path className="sa-windows" d="M85 40h350m130 0h180m100 0h160M40 90v170m1000-170v170M80 590h140m110 0h340m140 0h180" />
        {model?.nodes.map((node, i) => <g key={node.id}><circle className="sa-node" cx={40 + 460 * node.x} cy={40 + 280 * node.y} r="12" /><text className="sa-node-label" x={40 + 460 * node.x} y={44 + 280 * node.y} textAnchor="middle">{String(i + 1).padStart(2, "0")}</text></g>)}
        <text className="sa-corridor" x="540" y="367" textAnchor="middle">CIRCULATION</text><path d="M40 365H12m8-6-8 6 8 6" fill="none" stroke="#6e8063" />
        <text className="sa-north" x="40" y="625">SCHEMATIC FLOOR · NOT TO SCALE</text>
      </g>
    </svg>
  </div>;
}

function Desk({ x, y }: { x: number; y: number }) {
  return <g className="sa-furniture"><rect x={x} y={y} width="70" height="35" rx="2" /><rect x={x + 20} y={y + 5} width="27" height="5" /><path d={`M${x + 28} ${y + 14}h14M${x + 29} ${y + 35}v8m-10 0h30`} /><rect x={x + 23} y={y + 43} width="24" height="17" rx="6" /></g>;
}
function Table({ x, y, w, h, n }: { x: number; y: number; w: number; h: number; n: number }) {
  return <g className="sa-furniture"><rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 4} />{Array.from({ length: n }, (_, i) => <g key={i}><rect x={x + 12 + i * (w - 36) / (n - 1)} y={y - 15} width="20" height="11" rx="4" /><rect x={x + 12 + i * (w - 36) / (n - 1)} y={y + h + 4} width="20" height="11" rx="4" /></g>)}</g>;
}
function Plant({ x, y }: { x: number; y: number }) {
  return <g className="sa-plant"><circle cx={x} cy={y} r="13" /><path d={`m${x - 8} ${y + 4} 16-8m-13-3 10 14m-14-8h18`} /></g>;
}
