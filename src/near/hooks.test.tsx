import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultState } from './types';
import { loadVaultState } from './client';
import { useMyVaultState, vaultStateQueryKey } from './hooks';

vi.mock('./client', () => ({
  contractIsDeployed: vi.fn(),
  loadVaults: vi.fn(),
  loadVaultState: vi.fn(),
  viewFunctionFinal: vi.fn(),
}));

function stateFor(owner: string): VaultState {
  return {
    vault: {
      owner,
      vault_id: '0',
      check_in_interval_ns: '60000000000',
      last_ping_ns: '1000000000000',
      deadline_ns: '1060000000000',
      active: true,
      total_deposited: '0',
      vault_balance: '0',
      beneficiaries_set: false,
      fallback_account: null,
      inheritance_triggered: false,
      distributable_snapshot: '0',
      pending_count: '0',
      next_transfer_nonce: '0',
      pending_withdrawal: false,
      pending_fallback: false,
      storage_reserved: '1',
    },
    beneficiaries: [],
    overdue: false,
  };
}

describe('connected-account vault isolation', () => {
  beforeEach(() => {
    vi.mocked(loadVaultState).mockReset();
    vi.mocked(loadVaultState).mockImplementation((owner, vaultId) => {
      const state = stateFor(owner);
      if (state.vault) state.vault.vault_id = vaultId;
      return Promise.resolve(state);
    });
  });

  it('loads and caches the vault for the active account after switching', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(
      ({ accountId, vaultId }: { accountId: string; vaultId: string }) => useMyVaultState(accountId, vaultId),
      { initialProps: { accountId: 'alice.testnet', vaultId: '0' }, wrapper },
    );

    await waitFor(() => expect(result.current.data?.vault?.owner).toBe('alice.testnet'));
    rerender({ accountId: 'bob.testnet', vaultId: '3' });
    await waitFor(() => expect(result.current.data?.vault?.owner).toBe('bob.testnet'));

    expect(loadVaultState).toHaveBeenNthCalledWith(1, 'alice.testnet', '0');
    expect(loadVaultState).toHaveBeenNthCalledWith(2, 'bob.testnet', '3');
    expect(queryClient.getQueryData<VaultState>(vaultStateQueryKey('owner', 'alice.testnet', '0'))?.vault?.owner)
      .toBe('alice.testnet');
    expect(queryClient.getQueryData<VaultState>(vaultStateQueryKey('owner', 'bob.testnet', '3'))?.vault?.owner)
      .toBe('bob.testnet');
  });
});
