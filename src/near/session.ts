export interface WalletSession {
  accountId: string | null;
  generation: number;
}

export function isWalletSessionCurrent(captured: WalletSession, current: WalletSession): boolean {
  return captured.accountId === current.accountId && captured.generation === current.generation;
}
