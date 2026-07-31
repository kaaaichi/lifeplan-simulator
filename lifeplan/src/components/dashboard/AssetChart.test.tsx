// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AssetChart, AssetChartTooltip } from './AssetChart'
import type { ChartPoint, EventMarker } from '../../store/selectors'
import type { TooltipContentProps } from 'recharts'

const series: ChartPoint[] = [
  { year: 2026, age: 34, central: 1_000_000, optimistic: 1_100_000, pessimistic: 900_000, band: 200_000, isActual: false },
  { year: 2027, age: 35, central: 1_200_000, optimistic: 1_400_000, pessimistic: 1_000_000, band: 400_000, isActual: false },
]
const eventMarkers: EventMarker[] = [{ year: 2027, label: '退職', kind: 'retirement' }]

describe('AssetChart', () => {
  it('renders an SVG chart with the event marker label', () => {
    const { container } = render(<AssetChart series={series} eventMarkers={eventMarkers} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByText('退職')).toBeInTheDocument()
  })

  it('merges same-year event markers into a single label instead of overlapping ones', () => {
    const crowded: EventMarker[] = [
      { year: 2027, label: '家電買い替え', kind: 'appliance' },
      { year: 2027, label: '子の進学/卒業', kind: 'school' },
    ]
    render(<AssetChart series={series} eventMarkers={crowded} />)
    expect(screen.getByText('家電買い替え/子の進学/卒業')).toBeInTheDocument()
    expect(screen.queryByText('家電買い替え')).not.toBeInTheDocument()
  })
})

describe('AssetChartTooltip', () => {
  const point: ChartPoint = {
    year: 2027, age: 35, central: 1_200_000, optimistic: 1_400_000, pessimistic: 1_000_000, band: 400_000, isActual: false,
  }

  it('renders nothing when inactive', () => {
    const props = { active: false, payload: [], label: 2027 } as unknown as TooltipContentProps
    const { container } = render(<AssetChartTooltip {...props} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders formatted 楽観/中央/悲観 values for the hovered point', () => {
    const props = { active: true, payload: [{ payload: point }], label: 2027 } as unknown as TooltipContentProps
    render(<AssetChartTooltip {...props} />)
    expect(screen.getByText('2027')).toBeInTheDocument()
    expect(screen.getByText('140万')).toBeInTheDocument()
    expect(screen.getByText('120万')).toBeInTheDocument()
    expect(screen.getByText('100万')).toBeInTheDocument()
  })
})
