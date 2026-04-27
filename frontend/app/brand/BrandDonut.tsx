'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { tokens, viz } from './tokens';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

function usePrefersDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setDark(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);
  return dark;
}

export function BrandDonut() {
  const dark = usePrefersDark();
  const t = dark ? tokens.dark : tokens.light;
  const v = dark ? viz.dark : viz.light;

  const slices = useMemo(
    () => [
      { name: 'Cash', value: 5, color: v.cash },
      { name: 'US equity', value: 45, color: v.usEquity },
      { name: 'Intl equity', value: 20, color: v.intlEquity },
      { name: 'Fixed income', value: 25, color: v.fixedIncome },
      { name: 'Real estate', value: 5, color: v.realEstate },
    ],
    [v],
  );

  const option = useMemo(
    () => ({
      animation: false,
      tooltip: { show: false },
      graphic: [
        {
          type: 'text' as const,
          left: 'center' as const,
          top: '44%',
          style: {
            text: 'TOTAL',
            fontSize: 11,
            fontWeight: 500,
            fontFamily: 'var(--font-inter), system-ui, sans-serif',
            fill: t.mutedForeground,
            letterSpacing: 1,
          },
        },
        {
          type: 'text' as const,
          left: 'center' as const,
          top: '52%',
          style: {
            text: '$1.28M',
            fontSize: 22,
            fontWeight: 500,
            fontFamily: 'var(--font-jbm), ui-monospace, monospace',
            fill: t.brand,
          },
        },
      ],
      series: [
        {
          type: 'pie' as const,
          radius: ['28%', '80%'],
          center: ['50%', '50%'],
          startAngle: 90,
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            scale: false,
            itemStyle: { opacity: 0.85 },
          },
          data: slices.map((s) => ({
            name: s.name,
            value: s.value,
            itemStyle: {
              color: s.color,
              borderColor: t.background,
              borderWidth: 2,
            },
          })),
        },
      ],
    }),
    [t, slices],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
      <div style={{ width: 240, height: 240 }}>
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 240,
        }}
      >
        {slices.map((s) => (
          <li
            key={s.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--font-inter), system-ui, sans-serif',
              fontSize: 11,
              color: t.mutedForeground,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: s.color,
                display: 'inline-block',
              }}
              aria-hidden
            />
            <span>{s.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
