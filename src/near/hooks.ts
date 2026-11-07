import { useQuery } from '@tanstack/react-query';
import { CONTRACT_ID } from './config';
import { contractIsDeployed, loadVaults, loadVaultState, viewFunctionFinal } from './client';

export function myVaultsQueryKey(accountId: string | null) {
  return ['near', CONTRACT_ID, 'my-vaults', accountId] as const;
}

export function vaultStateQueryKey(scope: 'owner' | 'claim', owner: string | null, vaultId: string | null) {
  return ['near', CONTRACT_ID, scope, owner, vaultId] as const;
}

export function useContractAvailability() {
  return useQuery({
    queryKey: ['near', CONTRACT_ID, 'availability'],
    queryFn: contractIsDeployed,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useVaults(owner: string | null) {
  return useQuery({
    queryKey: myVaultsQueryKey(owner),
    queryFn: () => loadVaults(owner || ''),
    enabled: Boolean(owner),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

export function useMyVaultState(accountId: string | null, vaultId: string | null) {
  return useQuery({
    queryKey: vaultStateQueryKey('owner', accountId, vaultId),
    queryFn: () => loadVaultState(accountId || '', vaultId || ''),
    enabled: Boolean(accountId && vaultId !== null),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

export function useClaimVaultState(owner: string | null, vaultId: string | null) {
  return useQuery({
    queryKey: vaultStateQueryKey('claim', owner, vaultId),
    queryFn: () => loadVaultState(owner || '', vaultId || ''),
    enabled: Boolean(owner && vaultId !== null),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

export function useVaultCount(enabled = true) {
  return useQuery({
    queryKey: ['near', CONTRACT_ID, 'vault-count'],
    queryFn: () => viewFunctionFinal<number>('vault_count'),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
