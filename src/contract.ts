import artifact from '../contracts/out/VaultRegistry.sol/VaultRegistry.json';
import { getUsdc, requireChain } from '@/onchain-facts';

export const CHAIN_ID = 5042002; // Arc Testnet
export const CHAIN = requireChain(CHAIN_ID);
export const USDC = getUsdc(CHAIN_ID)!;

// Known tokens on Arc Testnet
export const KNOWN_TOKENS = [
  { symbol: 'USDC', address: USDC.address, decimals: USDC.decimals },
  // USDT not natively deployed on Arc Testnet — user can enter custom ERC-20 address
];

export const VAULT_REGISTRY = {
  address: '0xe487f359a0440aa5d917979d7e9024284955be6c' as `0x${string}`,
  abi: artifact.abi,
} as const;
