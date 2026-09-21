// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mockAfterSalesResult } from '../../supabase/functions/_shared/afterSales';
const id = '11111111-2222-4333-8444-555555555555';
describe('mock after sales', () => {
  it.each(['succeeded','failed','uncertain'])('simulates %s without network', (status) => {
    const network = vi.spyOn(globalThis, 'fetch');
    const result = mockAfterSalesResult('refund',id,status);
    expect(result.status).toBe(status); expect(result.simulated).toBe(true);
    expect(result.providerReference).toContain('MOCK-REFUND-'); expect(network).not.toHaveBeenCalled(); network.mockRestore();
  });
  it('keeps retry references stable and operation specific', () => {
    expect(mockAfterSalesResult('refund',id)).toEqual(mockAfterSalesResult('refund',id));
    expect(mockAfterSalesResult('refund',id).providerReference).not.toBe(mockAfterSalesResult('void',id).providerReference);
  });
  it('rejects malformed identifiers and unsupported outcomes', () => {
    expect(() => mockAfterSalesResult('refund','bad')).toThrow();
    expect(() => mockAfterSalesResult('refund',id,'paid')).toThrow();
  });
});
