import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/testUtils';
import { MetricsPeriodSelector, PERIOD_CONFIG } from '../MetricsPeriodSelector';

describe('MetricsPeriodSelector', () => {
  it('renders with default value', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<MetricsPeriodSelector value="3h" onChange={onChange} />);
    
    expect(getByRole('combobox')).toBeDefined();
  });

  it('PERIOD_CONFIG has correct hours', () => {
    expect(PERIOD_CONFIG['3h'].hours).toBe(3);
    expect(PERIOD_CONFIG['24h'].hours).toBe(24);
    expect(PERIOD_CONFIG['7d'].hours).toBe(168);
  });
});
