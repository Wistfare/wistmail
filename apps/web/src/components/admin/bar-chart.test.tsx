import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BarChart } from './bar-chart'

describe('BarChart', () => {
  it('renders one rect per data point', () => {
    const { container } = render(
      <BarChart
        data={[
          { date: '2026-05-04', count: 1 },
          { date: '2026-05-05', count: 2 },
          { date: '2026-05-06', count: 0 },
        ]}
      />,
    )
    expect(container.querySelectorAll('rect')).toHaveLength(3)
  })

  it('marks the tallest bar as active', () => {
    const { container } = render(
      <BarChart
        data={[
          { date: '2026-05-04', count: 1 },
          { date: '2026-05-05', count: 5 },
          { date: '2026-05-06', count: 0 },
        ]}
      />,
    )
    const bars = container.querySelectorAll('rect')
    expect(bars[1].getAttribute('data-active')).toBe('true')
    expect(bars[0].getAttribute('data-active')).toBe('false')
    expect(bars[2].getAttribute('data-active')).toBe('false')
  })

  it('respects an explicit highlightIndex', () => {
    const { container } = render(
      <BarChart
        highlightIndex={0}
        data={[
          { date: '2026-05-04', count: 3 },
          { date: '2026-05-05', count: 5 },
        ]}
      />,
    )
    const bars = container.querySelectorAll('rect')
    expect(bars[0].getAttribute('data-active')).toBe('true')
    expect(bars[1].getAttribute('data-active')).toBe('false')
  })

  it('exposes the aria-label as the SVG title', () => {
    render(
      <BarChart
        ariaLabel="Last 7 days delivery"
        data={[{ date: '2026-05-04', count: 1 }]}
      />,
    )
    expect(screen.getByText('Last 7 days delivery')).toBeInTheDocument()
  })

  it('renders an empty SVG when given zero data', () => {
    const { container } = render(<BarChart data={[]} />)
    expect(container.querySelectorAll('rect')).toHaveLength(0)
  })
})
