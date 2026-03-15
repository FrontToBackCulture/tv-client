// Inline SVG mini-chart illustrations for feed cards
// Decorative — not data-driven. Designed for 400px card width.

import { cn } from "../../lib/cn";

const PALETTE = {
  navy: "#1E3A5F",
  teal: "#0D7D85",
  orange: "#F47206",
  rose: "#E94560",
  green: "#039649",
  cyan: "#4DD8E0",
  light: "#B2E0E3",
};

function BarChart() {
  const bars = [38, 52, 45, 68, 72, 58, 82, 65, 75, 48, 62, 70];
  const max = Math.max(...bars);
  return (
    <svg viewBox="0 0 280 80" className="w-full h-auto">
      {bars.map((h, i) => {
        const barH = (h / max) * 60;
        const colors = [PALETTE.navy, PALETTE.teal, PALETTE.orange, PALETTE.cyan];
        return (
          <rect
            key={i}
            x={i * 23 + 2}
            y={70 - barH}
            width={16}
            height={barH}
            rx={2}
            fill={colors[i % colors.length]}
            opacity={0.85}
          >
            <animate
              attributeName="height"
              from="0"
              to={barH}
              dur={`${0.3 + i * 0.05}s`}
              fill="freeze"
            />
            <animate
              attributeName="y"
              from="70"
              to={70 - barH}
              dur={`${0.3 + i * 0.05}s`}
              fill="freeze"
            />
          </rect>
        );
      })}
      <line x1="0" y1="70" x2="280" y2="70" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
    </svg>
  );
}

function LineTrend() {
  const points = [30, 38, 35, 50, 45, 58, 52, 65, 60, 72, 68, 78];
  const pts2 = [20, 25, 22, 30, 28, 35, 32, 40, 38, 45, 42, 50];
  const max = 85;
  const toPath = (data: number[]) =>
    data.map((v, i) => `${i * 25 + 5},${75 - (v / max) * 65}`).join(" ");

  return (
    <svg viewBox="0 0 280 80" className="w-full h-auto">
      <defs>
        <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PALETTE.teal} stopOpacity="0.3" />
          <stop offset="100%" stopColor={PALETTE.teal} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`5,75 ${toPath(points)} 275,75`}
        fill="url(#grad1)"
      />
      <polyline
        points={toPath(points)}
        fill="none"
        stroke={PALETTE.teal}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animate attributeName="stroke-dasharray" from="0,1000" to="1000,0" dur="1s" fill="freeze" />
      </polyline>
      <polyline
        points={toPath(pts2)}
        fill="none"
        stroke={PALETTE.navy}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="4,3"
        opacity="0.6"
      />
      <line x1="0" y1="75" x2="280" y2="75" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
    </svg>
  );
}

function HorizontalBars() {
  const bars = [
    { w: 92, label: "", color: PALETTE.navy },
    { w: 78, label: "", color: PALETTE.teal },
    { w: 65, label: "", color: PALETTE.orange },
    { w: 52, label: "", color: PALETTE.cyan },
    { w: 40, label: "", color: PALETTE.green },
  ];
  return (
    <svg viewBox="0 0 280 80" className="w-full h-auto">
      {bars.map((b, i) => {
        const pct = (b.w / 100) * 240;
        return (
          <g key={i}>
            <rect
              x="2"
              y={i * 15 + 3}
              width={pct}
              height={10}
              rx={2}
              fill={b.color}
              opacity={0.85}
            >
              <animate attributeName="width" from="0" to={pct} dur={`${0.4 + i * 0.08}s`} fill="freeze" />
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

function PieDonut() {
  const slices = [
    { pct: 38, color: PALETTE.navy },
    { pct: 28, color: PALETTE.teal },
    { pct: 18, color: PALETTE.orange },
    { pct: 16, color: PALETTE.cyan },
  ];
  const cx = 40, cy = 40, r = 32, ir = 18;
  let cumulative = 0;

  return (
    <svg viewBox="0 0 280 80" className="w-full h-auto">
      <g transform="translate(100, 0)">
        {slices.map((s, i) => {
          const start = cumulative;
          cumulative += s.pct;
          const startAngle = (start / 100) * Math.PI * 2 - Math.PI / 2;
          const endAngle = (cumulative / 100) * Math.PI * 2 - Math.PI / 2;
          const largeArc = s.pct > 50 ? 1 : 0;
          const x1 = cx + r * Math.cos(startAngle);
          const y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle);
          const y2 = cy + r * Math.sin(endAngle);
          const ix1 = cx + ir * Math.cos(endAngle);
          const iy1 = cy + ir * Math.sin(endAngle);
          const ix2 = cx + ir * Math.cos(startAngle);
          const iy2 = cy + ir * Math.sin(startAngle);
          return (
            <path
              key={i}
              d={`M${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} L${ix1},${iy1} A${ir},${ir} 0 ${largeArc},0 ${ix2},${iy2} Z`}
              fill={s.color}
              opacity={0.85}
            />
          );
        })}
      </g>
    </svg>
  );
}

function StackedBar() {
  const groups = [
    [30, 20, 15],
    [25, 22, 18],
    [35, 15, 12],
    [28, 25, 10],
  ];
  const colors = [PALETTE.navy, PALETTE.teal, PALETTE.orange];
  return (
    <svg viewBox="0 0 280 80" className="w-full h-auto">
      {groups.map((stack, gi) => {
        let y = 70;
        return (
          <g key={gi}>
            {stack.map((h, si) => {
              const barH = h * 0.9;
              y -= barH;
              return (
                <rect
                  key={si}
                  x={gi * 68 + 10}
                  y={y}
                  width={50}
                  height={barH}
                  rx={si === stack.length - 1 ? 0 : 0}
                  fill={colors[si]}
                  opacity={0.85}
                />
              );
            })}
          </g>
        );
      })}
      <line x1="0" y1="70" x2="280" y2="70" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
    </svg>
  );
}

function Heatmap() {
  // 7 cols (days) x 4 rows (time blocks)
  const data = [
    [3, 5, 4, 7, 8, 9, 6],
    [5, 6, 5, 8, 9, 10, 7],
    [4, 5, 4, 6, 7, 8, 5],
    [2, 3, 2, 4, 5, 6, 3],
  ];
  const max = 10;
  return (
    <svg viewBox="0 0 280 80" className="w-full h-auto">
      {data.map((row, ri) =>
        row.map((v, ci) => {
          const opacity = 0.15 + (v / max) * 0.75;
          return (
            <rect
              key={`${ri}-${ci}`}
              x={ci * 38 + 14}
              y={ri * 18 + 4}
              width={32}
              height={14}
              rx={3}
              fill={PALETTE.teal}
              opacity={opacity}
            />
          );
        })
      )}
    </svg>
  );
}

function KpiGrid() {
  const kpis = [
    { value: "$2.4M", sub: "Revenue" },
    { value: "48.2K", sub: "Receipts" },
    { value: "$49.80", sub: "Avg Check" },
    { value: "+8.3%", sub: "Growth" },
  ];
  return (
    <svg viewBox="0 0 280 80" className="w-full h-auto">
      {kpis.map((k, i) => (
        <g key={i} transform={`translate(${i * 70}, 0)`}>
          <rect x="2" y="5" width="62" height="65" rx="8" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />
          <text x="33" y="35" textAnchor="middle" fill={PALETTE.teal} fontSize="14" fontWeight="800" fontFamily="Inter, sans-serif">{k.value}</text>
          <text x="33" y="52" textAnchor="middle" fill="currentColor" fillOpacity="0.4" fontSize="8" fontWeight="600" fontFamily="Inter, sans-serif">{k.sub}</text>
        </g>
      ))}
    </svg>
  );
}

function FlowDiagram() {
  const steps = ["SQL", "Data", "Charts", "Report"];
  return (
    <svg viewBox="0 0 280 50" className="w-full h-auto">
      {steps.map((label, i) => (
        <g key={i}>
          <rect
            x={i * 70 + 2}
            y={10}
            width={54}
            height={28}
            rx={6}
            fill={i === steps.length - 1 ? PALETTE.teal : PALETTE.navy}
            opacity={0.8 + i * 0.05}
          />
          <text
            x={i * 70 + 29}
            y={28}
            textAnchor="middle"
            fill="white"
            fontSize="9"
            fontWeight="700"
            fontFamily="Inter, sans-serif"
          >
            {label}
          </text>
          {i < steps.length - 1 && (
            <path
              d={`M${i * 70 + 58},24 L${(i + 1) * 70},24`}
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
          )}
        </g>
      ))}
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6" fill="currentColor" fillOpacity="0.3" />
        </marker>
      </defs>
    </svg>
  );
}

const VISUALS: Record<string, () => JSX.Element> = {
  "bar-chart": BarChart,
  "line-trend": LineTrend,
  "horizontal-bars": HorizontalBars,
  "pie-donut": PieDonut,
  "stacked-bar": StackedBar,
  "heatmap": Heatmap,
  "kpi-grid": KpiGrid,
  "flow": FlowDiagram,
};

export function CardVisual({ type, className }: { type: string; className?: string }) {
  const Component = VISUALS[type];
  if (!Component) return null;

  return (
    <div className={cn("mb-4 opacity-90", className)}>
      <Component />
    </div>
  );
}
