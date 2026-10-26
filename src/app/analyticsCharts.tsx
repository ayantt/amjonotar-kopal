import { useEffect, useRef, useState, type ReactNode } from "react";

/** Role identity colours: the same red/blue as the board tokens. Both pass the palette validator together (CVD and normal-vision). */
export const ROLE_COLOR = { politician: "#b74735", citizen: "#3976a8" } as const;
/** Single-measure colour for series that are not a role, plus its lighter step for a second, related measure. */
export const NEUTRAL = { strong: "#426b4b", soft: "#a9c3ad" } as const;

export const pct = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
export const money = (value: number) => `৳${Math.round(value).toLocaleString("en-BD")}`;
export const titleCase = (text: string) => text.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** A titled card holding one chart, with a table view so the data never depends on colour or hover. */
export function ChartCard({ title, note, children, table, wide }: { title: string; note?: string; children: ReactNode; table?: { head: string[]; rows: Array<Array<string | number>> }; wide?: boolean }) {
  return <section className={`viz-card ${wide ? "viz-wide" : ""}`}>
    <h3>{title}</h3>
    {note && <p className="viz-note">{note}</p>}
    {children}
    {table && <details className="viz-table"><summary>View as table</summary>
      <table className="analytics-table"><thead><tr>{table.head.map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table>
    </details>}
  </section>;
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="viz-kpi"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

export function Legend({ items }: { items: Array<{ name: string; color: string }> }) {
  return <ul className="viz-legend">{items.map((item) => <li key={item.name}><i style={{ background: item.color }} />{item.name}</li>)}</ul>;
}

/** Horizontal bars, sorted by the caller. Every bar carries its own value label, so no hover is needed. */
export function BarList({ rows, color, format = (v: number) => String(v), empty = "No data yet." }: { rows: Array<{ label: string; value: number; detail?: string }>; color: string; format?: (value: number) => string; empty?: string }) {
  const max = Math.max(0, ...rows.map((row) => row.value));
  if (rows.length === 0 || max === 0) return <p className="analytics-empty">{empty}</p>;
  return <ul className="viz-bars">{rows.map((row) => <li key={row.label}>
    <span className="viz-bar-label">{row.label}</span>
    <span className="viz-bar-track"><span className="viz-bar-fill" style={{ width: `${Math.max(1.5, (row.value / max) * 100)}%`, background: color }} /></span>
    <span className="viz-bar-value">{format(row.value)}{row.detail && <small> {row.detail}</small>}</span>
  </li>)}</ul>;
}

/** A single bar split into parts that sum to 100%, for shares of one whole. Segments are separated by a surface-coloured gap. */
export function ShareBar({ parts }: { parts: Array<{ name: string; value: number | null; color: string }> }) {
  const total = parts.reduce((sum, part) => sum + (part.value ?? 0), 0);
  if (total <= 0) return <p className="analytics-empty">No decisions recorded yet.</p>;
  return <div>
    <div className="viz-share" role="img" aria-label={parts.map((part) => `${part.name} ${pct(part.value)}`).join(", ")}>
      {parts.filter((part) => (part.value ?? 0) > 0).map((part) => <span key={part.name} style={{ flexGrow: part.value ?? 0, background: part.color }} />)}
    </div>
    <Legend items={parts.map((part) => ({ name: `${part.name} ${pct(part.value)}`, color: part.color }))} />
  </div>;
}

/** Measures an element so charts draw at real pixel size; fonts then stay readable at any width instead of shrinking with the viewBox. */
function useWidth(fallback: number): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.max(220, Math.floor(element.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const topRounded = (x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + w - radius} Q${x + w},${y} ${x + w},${y + radius} V${y + h} Z`;
};

/** Vertical columns, optionally grouped. Hovering a slot shows every series' value; marks are baseline-anchored with 4px rounded data ends. */
export function ColumnChart({ data, series, ariaLabel, yLabel }: { data: Array<{ label: string; values: number[]; tip?: string }>; series: Array<{ name: string; color: string }>; ariaLabel: string; yLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth(640);
  const height = 190, left = 34, right = 8, top = 14, bottom = 24;
  const innerW = width - left - right, innerH = height - top - bottom;
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(18, (slot - 4) / series.length - 2));
  const groupW = barW * series.length + 2 * (series.length - 1);
  const y = (v: number) => top + innerH - (innerH * v) / max;
  const every = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 52))));
  if (data.every((d) => d.values.every((v) => v === 0))) return <p className="analytics-empty">No data yet.</p>;
  const active = hover === null ? null : data[hover];
  return <div className="viz-chart" ref={ref}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
      {[0, 0.5, 1].map((fraction) => <g key={fraction}>
        <line x1={left} x2={width - right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="currentColor" opacity={fraction === 0 ? 0.4 : 0.12} />
        <text x={left - 5} y={y(max * fraction) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity=".7">{Math.round(max * fraction)}</text>
      </g>)}
      {data.map((d, i) => {
        const x0 = left + slot * i + (slot - groupW) / 2;
        return <g key={d.label}>
          {hover === i && <rect x={left + slot * i} y={top} width={slot} height={innerH} fill="currentColor" opacity=".07" />}
          {d.values.map((v, s) => v > 0 && <path key={s} d={topRounded(x0 + s * (barW + 2), y(v), barW, top + innerH - y(v), 4)} fill={series[s].color} />)}
          {i % every === 0 && <text x={left + slot * i + slot / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="currentColor" opacity=".75">{d.label}</text>}
          <rect x={left + slot * i} y={top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} onMouseMove={() => setHover(i)} />
        </g>;
      })}
    </svg>
    {yLabel && <span className="viz-axis-label">{yLabel}</span>}
    {active && <div className="viz-tip" role="status"><strong>{active.label}</strong>{active.tip ? <span>{active.tip}</span> : series.map((s, i) => <span key={s.name}><i style={{ background: s.color }} />{s.name} {active.values[i]}</span>)}</div>}
  </div>;
}

/** Two-line chart with a crosshair: hovering shows both values for the nearest round. */
export function WealthChart({ points }: { points: Array<{ round: number; politician: number | null; citizen: number | null }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth(640);
  if (points.length < 2) return <p className="analytics-empty">Not enough finished games for a wealth curve yet.</p>;
  const height = 210, left = 46, right = 12, top = 14, bottom = 26;
  const innerW = width - left - right, innerH = height - top - bottom;
  const maxCash = Math.max(1, ...points.flatMap((p) => [p.politician ?? 0, p.citizen ?? 0]));
  const maxRound = points[points.length - 1].round, minRound = points[0].round;
  const x = (round: number) => left + (innerW * (round - minRound)) / Math.max(1, maxRound - minRound);
  const y = (cash: number) => top + innerH - (innerH * cash) / maxCash;
  const path = (key: "politician" | "citizen") => points.filter((p) => p[key] !== null).map((p, i) => `${i ? "L" : "M"}${x(p.round).toFixed(1)},${y(p[key] ?? 0).toFixed(1)}`).join(" ");
  const active = hover === null ? null : points[hover];
  const nearest = (clientX: number, rect: DOMRect) => {
    const round = minRound + ((clientX - rect.left) / rect.width * width - left) / innerW * (maxRound - minRound);
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(p.round - round) < Math.abs(points[best].round - round)) best = i; });
    return best;
  };
  return <div className="viz-chart" ref={ref}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Mean cash per round for Politician and Citizen seats" onMouseLeave={() => setHover(null)} onMouseMove={(event) => setHover(nearest(event.clientX, event.currentTarget.getBoundingClientRect()))}>
      {[0, 0.5, 1].map((fraction) => <g key={fraction}>
        <line x1={left} x2={width - right} y1={y(maxCash * fraction)} y2={y(maxCash * fraction)} stroke="currentColor" opacity={fraction === 0 ? 0.4 : 0.12} />
        <text x={left - 6} y={y(maxCash * fraction) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity=".7">{money(maxCash * fraction)}</text>
      </g>)}
      <text x={left} y={height - 6} fontSize="10" fill="currentColor" opacity=".75">round {minRound}</text>
      <text x={width - right} y={height - 6} textAnchor="end" fontSize="10" fill="currentColor" opacity=".75">round {maxRound}</text>
      <path d={path("politician")} fill="none" stroke={ROLE_COLOR.politician} strokeWidth="2" strokeLinejoin="round" />
      <path d={path("citizen")} fill="none" stroke={ROLE_COLOR.citizen} strokeWidth="2" strokeLinejoin="round" />
      {active && <g>
        <line x1={x(active.round)} x2={x(active.round)} y1={top} y2={top + innerH} stroke="currentColor" opacity=".35" />
        {active.politician !== null && <circle cx={x(active.round)} cy={y(active.politician)} r="4" fill={ROLE_COLOR.politician} stroke="#faf7ef" strokeWidth="2" />}
        {active.citizen !== null && <circle cx={x(active.round)} cy={y(active.citizen)} r="4" fill={ROLE_COLOR.citizen} stroke="#faf7ef" strokeWidth="2" />}
      </g>}
    </svg>
    {active && <div className="viz-tip" role="status"><strong>Round {active.round}</strong>
      <span><i style={{ background: ROLE_COLOR.politician }} />Politician {active.politician === null ? "—" : money(active.politician)}</span>
      <span><i style={{ background: ROLE_COLOR.citizen }} />Citizen {active.citizen === null ? "—" : money(active.citizen)}</span></div>}
    <Legend items={[{ name: "Politician", color: ROLE_COLOR.politician }, { name: "Citizen", color: ROLE_COLOR.citizen }]} />
  </div>;
}
