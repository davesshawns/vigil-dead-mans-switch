import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import type { SetupParams } from '@near-wallet-selector/react-hook';

export const NEAR_NETWORK_ID = 'testnet' as const;
const rpcUrlValue: unknown = import.meta.env.VITE_NEAR_RPC_URL;
const contractIdValue: unknown = import.meta.env.VITE_NEAR_CONTRACT_ID;
export const NEAR_RPC_URL: string = typeof rpcUrlValue === 'string' && rpcUrlValue.length > 0
  ? rpcUrlValue
  : 'https://rpc.testnet.near.org';
export const NEAR_EXPLORER_URL = 'https://testnet.nearblocks.io';
export const CONTRACT_ID: string = typeof contractIdValue === 'string' && contractIdValue.length > 0
  ? contractIdValue
  : 'vigilvault.vigilowner.testnet';

export const walletSelectorConfig: SetupParams = {
  network: {
    networkId: NEAR_NETWORK_ID,
    nodeUrl: NEAR_RPC_URL,
    helperUrl: 'https://helper.testnet.near.org',
    explorerUrl: NEAR_EXPLORER_URL,
    indexerUrl: 'https://api.testnet.near.org',
  },
  modules: [setupMyNearWallet()],
  optimizeWalletOrder: true,
};

export const GAS = {
  standard: 30_000_000_000_000n,
  storage: 100_000_000_000_000n,
  transfer: 150_000_000_000_000n,
} as const;

export const ONE_NEAR = 1_000_000_000_000_000_000_000_000n;
export const STORAGE_DEPOSIT = ONE_NEAR;
export const MIN_INTERVAL_SECONDS = 60;
export const MAX_UI_INTERVAL_SECONDS = 90 * 24 * 60 * 60;

export const CHANGE_METHODS = [
  'create_vault',
  'deposit',
  'ping',
  'set_check_in_interval',
  'set_beneficiaries',
  'set_fallback',
  'withdraw_all',
  'trigger_inheritance',
  'claim',
  'claim_fallback',
] as const;
