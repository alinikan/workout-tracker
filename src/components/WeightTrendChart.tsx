import { useState } from "react";

type Entry = { date: string; weight: number };
type Week = { week: number; startIso: string; endIso: string; average: number | null; loggedDays: number; forgottenDays: number };
const dayMs = 86_400_000;
const stamp = (date: string) => Date.parse(`${date}T12:00:00Z`);
const shortDate = (date: string) => new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(stamp(date));
const number = (value: number) => value.toFixed(1);

/** Calendar spacing, not entry spacing: forgetting five mornings leaves a
 * visible gap. Weekly averages include actual entries only, never zero fills.
 * Weeks without readings break the average line instead of inventing a trend. */
export function weightTrendPresentation(entries: Entry[], weeks: Week[], today: string, days: number | null) {
  const end = stamp(today);
  const start = days === null ? Math.min(end, ...entries.map((entry) => stamp(entry.date)).filter(Number.isFinite)) : end - (days - 1) * dayMs;
  const daily = entries.filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0 && stamp(entry.date) >= start && stamp(entry.date) <= end);
  const weekly = weeks.filter((week) => stamp(week.endIso) >= start && stamp(week.startIso) <= end);
  const values = [...daily.map((entry) => entry.weight), ...weekly.flatMap((week) => week.average === null ? [] : [week.average])];
  const min = values.length ? Math.min(...values) - 0.3 : 0;
  const max = values.length ? Math.max(...values) + 0.3 : 1;
  const x = (date: string) => 36 + ((stamp(date) - start) / Math.max(end - start, dayMs)) * 460;
  const y = (weight: number) => 140 - ((weight - min) / (max - min)) * 116;
  return { start, end, min, max,
    daily: daily.map((entry) => ({ ...entry, x: x(entry.date), y: y(entry.weight) })),
    weekly: weekly.map((week) => ({ ...week, x: x(week.endIso > today ? today : week.endIso), y: week.average === null ? null : y(week.average) })),
  };
}

export function WeightTrendChart({ entries, weeks, today }: { entries: Entry[]; weeks: Week[]; today: string }) {
  const [range, setRange] = useState<number | null>(28);
  const [inspected, setInspected] = useState("");
  const chart = weightTrendPresentation(entries, weeks, today, range);
  const selected = chart.daily.find((point) => point.date === inspected) ?? chart.daily.at(-1);
  const averageSegments = chart.weekly.flatMap((point, index) => {
    const previous = chart.weekly[index - 1];
    return previous?.y !== null && previous && point.y !== null && point.week === previous.week + 1
      ? [`M${previous.x},${previous.y}L${point.x},${point.y}`] : [];
  });
  // Match the coach's evidence gate: compare consecutive finished weeks only
  // after at least four real readings in each. Partial weeks still get dots.
  const comparable = chart.weekly.filter((week) => week.average !== null && week.loggedDays >= 4 && week.endIso < today).slice(-2);
  const [first, last] = comparable;
  return <section className="weight-story-chart" aria-label="Weight trend chart">
    <div className="flow-heading"><div><p className="eyebrow">Body weight</p><h3>See the trend</h3></div><span>kg</span></div>
    <div className="chart-range-control" role="group" aria-label="Weight chart range">
      {[7, 28, 90, null].map((days) => <button key={days ?? "all"} type="button" aria-pressed={range === days}
        onClick={() => { setRange(days); setInspected(""); }}>{days === null ? "All" : `${days} days`}</button>)}
    </div>
    {chart.daily.length ? <>
      <div className="chart-reading" aria-live="polite"><strong>{selected ? number(selected.weight) : "--"} <small>kg</small></strong>
        <span>{selected ? shortDate(selected.date) : "No reading"} · daily measurement</span></div>
      <svg className="weight-story-svg" viewBox="0 0 520 170" role="img" aria-label="Daily weight dots and weekly average line, spaced by calendar date">
        {[chart.min, (chart.min + chart.max) / 2, chart.max].map((value, index) => <g key={index}>
          <path className="story-grid" d={`M36 ${140 - index * 58}H496`} /><text x="0" y={144 - index * 58}>{number(value)}</text>
        </g>)}
        {averageSegments.map((path, index) => <path className="story-average" d={path} key={index} />)}
        {chart.daily.map((point) => <circle className={`story-daily ${point.date === selected?.date ? "inspected" : ""}`} key={point.date}
          cx={point.x} cy={point.y} r={point.date === selected?.date ? 4 : 2.5}><title>{`${shortDate(point.date)}: ${number(point.weight)} kg`}</title></circle>)}
        {chart.weekly.filter((point) => point.y !== null).map((point) => <circle className="story-week" key={point.week} cx={point.x} cy={point.y!} r="4">
          <title>{`Week ${point.week}: ${number(point.average!)} kg average from ${point.loggedDays}/7 mornings`}</title></circle>)}
        <text x="36" y="164">{shortDate(new Date(chart.start).toISOString().slice(0, 10))}</text>
        <text x="496" y="164" textAnchor="end">{shortDate(today)}</text>
      </svg>
      <div className="chart-legend"><span>Daily reading</span><span>Weekly average</span></div>
      <label className="chart-inspect">Inspect a reading
        <select value={selected?.date ?? ""} onChange={(event) => setInspected(event.target.value)}>
          {chart.daily.map((point) => <option key={point.date} value={point.date}>{shortDate(point.date)} - {number(point.weight)} kg</option>)}
        </select>
      </label>
      <p className="chart-coverage">{chart.daily.length} mornings logged in this range. Missing mornings are not counted as zero. The current week's average is provisional.</p>
      {first && last && last.week === first.week + 1
        ? <p className="chart-comparison">Weekly average: {number(first.average!)} kg ({first.loggedDays}/7 readings) to {number(last.average!)} kg ({last.loggedDays}/7 readings).</p>
        : <p className="chart-comparison">Comparisons unlock with 4+ readings in each of two consecutive finished weeks.</p>}
      <p className="chart-coverage">Weight change is not a measurement of fat or muscle.</p>
    </> : <div className="empty-weight-chart"><strong>Your trend starts with one reading</strong><p>Log a morning weight above. Daily readings and weekly averages will appear here.</p></div>}
  </section>;
}
