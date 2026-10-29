import { useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { VAULT_REGISTRY, CHAIN_ID } from '../contract';

// Typed result from getVault()
export interface VaultInfo {
  token: string;
  checkInInterval: bigint;
  lastPing: bigint;
  active: boolean;
  isTriggered: boolean;
  totalDeposited: bigint;
  fallbackWallet: string;
  allowanceAmount: bigint;
  allowancePeriod: bigint;
  lastAllowanceRelease: bigint;
  allowanceEnabled: boolean;
}

export interface BeneficiaryInfo {
  wallet: string;
  basisPoints: number;
  claimed: boolean;
}

export function useVault(owner: string | undefined) {
  const enabled = !!owner;

  const hasVault = useReadContract({
    ...VAULT_REGISTRY,
    functionName: 'hasVault',
    args: owner ? [owner as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    query: { enabled },
  });

  const vault = useReadContract({
    ...VAULT_REGISTRY,
    functionName: 'getVault',
    args: owner ? [owner as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: enabled && !!hasVault.data },
  });

  const beneficiaries = useReadContract({
    ...VAULT_REGISTRY,
    functionName: 'getBeneficiaries',
    args: owner ? [owner as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: enabled && !!hasVault.data },
  });

  const vaultBalance = useReadContract({
    ...VAULT_REGISTRY,
    functionName: 'vaultBalance',
    args: owner ? [owner as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: enabled && !!hasVault.data },
  });

  const rawVault = vault.data as readonly [string, bigint, bigint, boolean, boolean, bigint, string, bigint, bigint, bigint, boolean] | undefined;

  const vaultInfo: VaultInfo | undefined = rawVault ? {
    token: rawVault[0],
    checkInInterval: rawVault[1],
    lastPing: rawVault[2],
    active: rawVault[3],
    isTriggered: rawVault[4],
    totalDeposited: rawVault[5],
    fallbackWallet: rawVault[6],
    allowanceAmount: rawVault[7],
    allowancePeriod: rawVault[8],
    lastAllowanceRelease: rawVault[9],
    allowanceEnabled: rawVault[10],
  } : undefined;

  const beneficiaryList = (beneficiaries.data as readonly { wallet: string; basisPoints: number; claimed: boolean }[] | undefined)?.map(b => ({
    wallet: b.wallet,
    basisPoints: b.basisPoints,
    claimed: b.claimed,
  })) ?? [];

  return {
    hasVault: hasVault.data as boolean | undefined,
    vault: vaultInfo,
    beneficiaries: beneficiaryList,
    vaultBalance: vaultBalance.data as bigint | undefined,
    isLoading: hasVault.isLoading || vault.isLoading,
    refetch: () => {
      void hasVault.refetch();
      void vault.refetch();
      void beneficiaries.refetch();
      void vaultBalance.refetch();
    },
  };
}

export function useTokenInfo(tokenAddress: string | undefined) {
  const enabled = !!tokenAddress && tokenAddress !== '0x0000000000000000000000000000000000000000';
  const symbol = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'symbol',
    chainId: CHAIN_ID,
    query: { enabled },
  });
  const decimals = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'decimals',
    chainId: CHAIN_ID,
    query: { enabled },
  });
  return {
    symbol: symbol.data,
    decimals: decimals.data,
  };
}

export function useTokenBalance(tokenAddress: string | undefined, account: string | undefined) {
  const enabled = !!tokenAddress && !!account;
  return useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: account ? [account as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    query: { enabled },
  });
}

export function useTokenAllowance(tokenAddress: string | undefined, owner: string | undefined, spender: string | undefined) {
  const enabled = !!tokenAddress && !!owner && !!spender;
  return useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: (owner && spender) ? [owner as `0x${string}`, spender as `0x${string}`] : undefined,
    chainId: CHAIN_ID,
    query: { enabled },
  });
}
