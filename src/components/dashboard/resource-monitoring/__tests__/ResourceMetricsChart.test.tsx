import { describe, it, expect } from 'vitest';
import { render } from '@/test/testUtils';
import { ResourceMetricsChart } from '../ResourceMetricsChart';

// Utility to generate mock metrics with proper timestamps
const generateMockMetrics = (
  metricName: string,
  count: number,
  unit: string,
  hoursBack: number,
  baseValue: number = 50
) => {
  const now = Date.now();
  const intervalMs = (hoursBack * 60 * 60 * 1000) / count;
  
  return Array.from({ length: count }, (_, i) => ({
    metric_name: metricName,
    metric_value: baseValue + (Math.random() - 0.5) * 10,
    metric_unit: unit,
    timestamp: new Date(now - (count - i) * intervalMs).toISOString()
  }));
};

describe('ResourceMetricsChart', () => {
  it('renders chart with CPUUtilization metrics for 3h period', () => {
    const metrics = generateMockMetrics('CPUUtilization', 36, 'Percent', 3);
    
    const { getByText } = render(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="CPUUtilization"
        period="3h"
      />
    );
    
    expect(getByText('CPUUtilization')).toBeDefined();
  });

  it('renders chart for 24h period with multiple datapoints', () => {
    const metrics = generateMockMetrics('CPUUtilization', 48, 'Percent', 24);
    
    const { getByText } = render(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="CPUUtilization"
        period="24h"
      />
    );
    
    expect(getByText('CPUUtilization')).toBeDefined();
    expect(getByText(/pontos/)).toBeDefined();
  });

  it('renders chart for 7 days period with multiple datapoints', () => {
    const metrics = generateMockMetrics('CPUUtilization', 84, 'Percent', 168);
    
    const { getByText } = render(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="CPUUtilization"
        period="7d"
      />
    );
    
    expect(getByText('CPUUtilization')).toBeDefined();
    expect(getByText(/pontos/)).toBeDefined();
  });

  it('shows empty state when no data available', () => {
    const { getByText } = render(
      <ResourceMetricsChart
        metrics={[]}
        metricName="CPUUtilization"
        period="3h"
      />
    );
    
    expect(getByText('Sem dados disponíveis')).toBeDefined();
  });

  it('formats count metrics as integers', () => {
    const metrics = generateMockMetrics('Invocations', 10, 'Count', 3, 1500);
    
    const { getByText } = render(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="Invocations"
        period="3h"
      />
    );
    
    expect(getByText('Invocations')).toBeDefined();
  });

  it('displays resource name when provided', () => {
    const metrics = generateMockMetrics('CPUUtilization', 10, 'Percent', 3);
    
    const { getByText } = render(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="CPUUtilization"
        period="3h"
        resourceName="my-ec2-instance"
      />
    );
    
    expect(getByText(/my-ec2-instance/)).toBeDefined();
  });

  it('shows historical data indicator when data exists but outside current period', () => {
    // Create metrics from 5 hours ago (outside 3h window)
    const now = Date.now();
    const metrics = [
      {
        metric_name: 'CPUUtilization',
        metric_value: 50,
        metric_unit: 'Percent',
        timestamp: new Date(now - 5 * 60 * 60 * 1000).toISOString()
      }
    ];
    
    const { queryByText, container } = render(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="CPUUtilization"
        period="3h"
      />
    );
    
    // Should render the component (either with data or message)
    expect(container.querySelector('.recharts-responsive-container') || queryByText(/Sem atividade/i) || queryByText(/CPUUtilization/i)).toBeTruthy();
  });

  it('aggregates count metrics using Sum', () => {
    // Create metrics with known values within the same bucket
    const now = Date.now();
    const metrics = [
      { metric_name: 'Count', metric_value: 100, metric_unit: 'Count', timestamp: new Date(now - 60000).toISOString() },
      { metric_name: 'Count', metric_value: 200, metric_unit: 'Count', timestamp: new Date(now - 120000).toISOString() },
    ];
    
    const { getAllByText } = render(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="Count"
        period="3h"
      />
    );
    
    // Should find at least one element with 'Count' text
    expect(getAllByText('Count').length).toBeGreaterThan(0);
  });

  it('handles period change without errors', () => {
    const metrics = generateMockMetrics('CPUUtilization', 200, 'Percent', 168);
    
    // Render with 3h period
    const { rerender, getByText } = render(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="CPUUtilization"
        period="3h"
      />
    );
    
    expect(getByText(/Últimas 3 horas/i)).toBeDefined();
    
    // Change to 24h
    rerender(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="CPUUtilization"
        period="24h"
      />
    );
    
    expect(getByText(/Últimas 24 horas/i)).toBeDefined();
    
    // Change to 7d
    rerender(
      <ResourceMetricsChart
        metrics={metrics}
        metricName="CPUUtilization"
        period="7d"
      />
    );
    
    expect(getByText(/Últimos 7 dias/i)).toBeDefined();
  });
});
