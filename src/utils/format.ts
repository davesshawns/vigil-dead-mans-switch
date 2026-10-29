import { formatUnits } from 'viem';

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatToken(raw: bigint, decimals: number): string {
  return parseFloat(formatUnits(raw, decimals)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 && d === 0) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

export function parseOnchainError(error: unknown): string {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes('user rejected') || msg.includes('user denied')) return 'Transaction cancelled.';
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient balance.';
  if (msg.includes('alreadytriggered')) return 'Vault has triggered — this action is no longer available.';
  if (msg.includes('zeroamount') || (msg.includes('zero') && msg.includes('amount'))) return 'Deposit USDC before checking in.';
  if (msg.includes('nobeneficiaryorfallback')) return 'Set at least one beneficiary or fallback wallet before depositing.';
  if (msg.includes('configlocked')) return 'Cannot change settings after the vault has triggered.';
  if (msg.includes('reverted')) return 'Transaction failed — check vault state and try again.';
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error — please retry.';
  return 'Something went wrong. Please try again.';
}
