import type { AllocationSlice, TargetRow } from './api';
import { formatUSD, humanize } from './labels';
import { effectiveTarget } from './allocationTargets';
import type { Drill } from './drill';

/** ECharts 5 default category colors — stable palette across chart renders. */
const CHART_CATEGORY_COLORS = [
  '#5470c6',
  '#91cc75',
  '#fac858',
  '#ee6666',
  '#73c0de',
  '#3ba272',
  '#fc8452',
  '#9a60b4',
  '#ea7ccc',
] as const;

export type AllocationChartResult = {
  chartNames: string[];
  option: Record<string, unknown>;
};

type EChartsRenderApi = { getWidth: () => number; getHeight: () => number };

export function buildAllocationChart(args: {
  tableRows: AllocationSlice[];
  targetRows: TargetRow[];
  drill: Drill;
  minorPct: number;
  centerTop: string;
  centerBottom: string;
}): AllocationChartResult {
  const { tableRows, targetRows, drill, minorPct, centerTop, centerBottom } = args;

  const graphic = [
    {
      type: 'text' as const,
      left: 'center',
      top: '44%',
      style: { text: centerTop, fontSize: 11, fill: '#666' },
    },
    {
      type: 'text' as const,
      left: 'center',
      top: '50%',
      style: { text: centerBottom, fontSize: 20, fontWeight: 500, fill: '#222' },
    },
  ];

  const chartNames = tableRows.map((s) => s.name);
  const perSliceTargets = tableRows.map((s) => effectiveTarget(targetRows, drill, s));

  const R_MIN = 0.72;
  const R_BASE = 0.8;
  const R_MAX = 0.88;
  const minor = minorPct;

  let maxAbs = 0;
  for (let i = 0; i < tableRows.length; i++) {
    const t = perSliceTargets[i];
    if (t == null) continue;
    const signed = tableRows[i].pct - t;
    if (Math.abs(signed) > minor) maxAbs = Math.max(maxAbs, Math.abs(signed));
  }

  let acc = 0;
  type ChartItem = {
    name: string;
    start: number;
    end: number;
    outer: number;
    color: string;
    value: number;
    pct: number;
    target: number | null;
    driftAbs: number;
    signed: number;
  };
  const items: ChartItem[] = tableRows.map((s, i) => {
    const t = perSliceTargets[i];
    const start = (acc / 100) * Math.PI * 2;
    acc += s.pct;
    const end = (acc / 100) * Math.PI * 2;
    const signed = t != null ? s.pct - t : 0;
    const driftAbs = Math.abs(signed);
    let outer: number;
    if (t == null || driftAbs <= minor || maxAbs <= 0) {
      outer = R_BASE;
    } else {
      const ratio = driftAbs / maxAbs;
      outer = signed > 0 ? R_BASE + ratio * (R_MAX - R_BASE) : R_BASE - ratio * (R_BASE - R_MIN);
    }
    const color = CHART_CATEGORY_COLORS[i % CHART_CATEGORY_COLORS.length];
    return { name: s.name, start, end, outer, color, value: s.value, pct: s.pct, target: t, driftAbs, signed };
  });

  return {
    chartNames,
    option: {
      tooltip: {
        trigger: 'item' as const,
        formatter: (p: { dataIndex: number }) => {
          const d = items[p.dataIndex];
          if (!d) return '';
          const head = `${humanize(d.name)}: ${d.pct.toFixed(1)}% (${formatUSD(d.value)})`;
          if (d.target == null) return head;
          const sign = d.signed > 0 ? '+' : '';
          return `${head} · target ${d.target.toFixed(1)}% · drift ${sign}${d.signed.toFixed(1)}pp`;
        },
      },
      series: [
        {
          type: 'custom' as const,
          coordinateSystem: 'none' as const,
          silent: true,
          z: 0,
          renderItem: (_params: { dataIndex: number }, ecApi: EChartsRenderApi) => {
            const w = ecApi.getWidth();
            const h = ecApi.getHeight();
            const cx = w / 2;
            const cy = h / 2;
            const R = Math.min(w, h) / 2;
            return {
              type: 'sector' as const,
              shape: {
                cx,
                cy,
                r0: 0.28 * R,
                r: R_BASE * R,
                startAngle: -Math.PI / 2,
                endAngle: -Math.PI / 2 + Math.PI * 2,
                clockwise: true,
              },
              style: { fill: '#e5e7eb', stroke: '#fff', lineWidth: 2 },
            };
          },
          data: [0],
        },
        {
          type: 'custom' as const,
          coordinateSystem: 'none' as const,
          z: 1,
          renderItem: (params: { dataIndex: number }, ecApi: EChartsRenderApi) => {
            const idx = params.dataIndex;
            const d = items[idx];
            if (!d) return { type: 'group' as const, children: [] as const };
            const w = ecApi.getWidth();
            const h = ecApi.getHeight();
            const cx = w / 2;
            const cy = h / 2;
            const R = Math.min(w, h) / 2;
            return {
              type: 'sector' as const,
              shape: {
                cx,
                cy,
                r0: 0.28 * R,
                r: d.outer * R,
                startAngle: -Math.PI / 2 + d.start,
                endAngle: -Math.PI / 2 + d.end,
                clockwise: true,
              },
              style: { fill: d.color, stroke: '#fff', lineWidth: 2 },
              emphasis: { style: { opacity: 0.8 } },
            };
          },
          data: items.map((_, i) => [i]),
        },
      ],
      graphic,
    },
  };
}
