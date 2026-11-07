import { JsonRpcProvider, yoctoToNear } from 'near-api-js';
import { CONTRACT_ID, NEAR_EXPLORER_URL, NEAR_RPC_URL } from './config';
import type { BeneficiaryView, VaultState, VaultView } from './types';

export const nearProvider = new JsonRpcProvider({ url: NEAR_RPC_URL });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.trim();
  if (typeof error === 'string') return error;
  try {
    const encoded = JSON.stringify(error);
    if (encoded) return encoded;
  } catch {
    // Fall through to the safe string conversion.
  }
  return String(error);
}

function statusFailure(status: unknown): string | null {
  if (status === 'Failure') return 'Transaction receipt failed';
  if (!isRecord(status) || !('Failure' in status)) return null;
  const failure = status.Failure;
  if (typeof failure === 'string') return failure;
  if (isRecord(failure)) {
    const message = asString(failure.error_message);
    if (message) return message;
    return JSON.stringify(failure);
  }
  return 'Transaction receipt failed';
}

export function extractTransactionHash(outcome: unknown): string | null {
  if (!isRecord(outcome) || !isRecord(outcome.transaction)) return null;
  return asString(outcome.transaction.hash);
}

export function assertFinalExecutionSuccess(outcome: unknown): void {
  if (!isRecord(outcome)) throw new Error('Wallet returned no verifiable transaction outcome.');

  const finality = asString(outcome.final_execution_status);
  if (finality && finality !== 'FINAL') {
    throw new Error(`Transaction did not reach FINAL status (received ${finality}).`);
  }

  const rootFailure = statusFailure(outcome.status);
  if (rootFailure) throw new Error(rootFailure);

  const receipts = outcome.receipts_outcome;
  if (!Array.isArray(receipts)) return;
  for (const receipt of receipts) {
    if (!isRecord(receipt) || !isRecord(receipt.outcome)) continue;
    const failure = statusFailure(receipt.outcome.status);
    if (failure) throw new Error(failure);
  }
}

export async function waitForFinalTransaction(hash: string, signerId: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await nearProvider.viewTransactionStatusWithReceipts({
        txHash: hash,
        accountId: signerId,
        waitUntil: 'FINAL',
      });
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => window.setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to confirm transaction finality.');
}

export async function viewFunctionFinal<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const result: unknown = await nearProvider.callFunction({
    contractId: CONTRACT_ID,
    method,
    args,
    blockQuery: { finality: 'final' },
  });
  return result as T;
}

export async function loadVaults(owner: string): Promise<VaultView[]> {
  return viewFunctionFinal<VaultView[]>('get_vaults', { owner });
}

export async function loadVaultState(owner: string, vaultId: string): Promise<VaultState> {
  const vault_id = Number(vaultId);
  if (!Number.isSafeInteger(vault_id) || vault_id < 0) throw new Error('Invalid vault ID.');
  const [vault, beneficiaries, overdue] = await Promise.all([
    viewFunctionFinal<VaultView | null>('get_vault', { owner, vault_id }),
    viewFunctionFinal<BeneficiaryView[]>('get_beneficiaries', { owner, vault_id }),
    viewFunctionFinal<boolean>('is_overdue', { owner, vault_id }),
  ]);
  return { vault, beneficiaries, overdue };
}

export async function contractIsDeployed(): Promise<boolean> {
  try {
    const code = await nearProvider.viewContractCode({
      contractId: CONTRACT_ID,
      blockQuery: { finality: 'final' },
    });
    return code.code.length > 0;
  } catch (error) {
    if (isUnknownAccountError(error)) return false;
    throw error;
  }
}

export function isUnknownAccountError(error: unknown): boolean {
  const raw = errorText(error);
  const lower = raw.toLowerCase();
  return lower.includes('unknown_account')
    || lower.includes('unknown account')
    || lower.includes('does not exist while viewing');
}

export function parseNearInput(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{0,24})?$/.test(normalized)) throw new Error('Enter a valid NEAR amount.');
  const [whole, fraction = ''] = normalized.split('.');
  const parsed = BigInt(whole) * 10n ** 24n + BigInt(fraction.padEnd(24, '0') || '0');
  if (parsed <= 0n) throw new Error('Amount must be greater than zero.');
  return parsed;
}

export function formatNear(value: string | bigint, decimals = 4): string {
  const formatted = yoctoToNear(typeof value === 'bigint' ? value : BigInt(value), decimals);
  return formatted.replace(/\.?0+$/, '');
}

export function accountExplorerUrl(accountId: string): string {
  return `${NEAR_EXPLORER_URL}/address/${encodeURIComponent(accountId)}`;
}

export function transactionExplorerUrl(hash: string): string {
  return `${NEAR_EXPLORER_URL}/txns/${encodeURIComponent(hash)}`;
}

export function isValidNearAccountId(accountId: string): boolean {
  if (accountId.length < 2 || accountId.length > 64) return false;
  return /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(accountId);
}

export function intervalSecondsToNanoseconds(seconds: number): number {
  const nanoseconds = BigInt(seconds) * 1_000_000_000n;
  if (nanoseconds > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Check-in interval is too large.');
  return Number(nanoseconds);
}

export function describeNearError(error: unknown): string {
  const raw = error instanceof Error ? error.message : errorText(error);
  const lower = raw.toLowerCase();
  if (lower.includes('user rejected') || lower.includes('cancelled') || lower.includes('canceled')) {
    return 'Wallet request was cancelled.';
  }
  if (lower.includes('unknown_account') || lower.includes('does not exist')) {
    return `Contract ${CONTRACT_ID} is not deployed on NEAR Testnet yet.`;
  }
  const known = [
    'VaultAlreadyExists', 'InvalidInterval', 'VaultNotFound', 'AlreadyTriggered', 'NotActive',
    'ZeroAmount', 'TransferPending', 'NoBeneficiaryOrFallback', 'TooManyBeneficiaries',
    'InvalidPercentage', 'DuplicateBeneficiary', 'InvalidTotal', 'ConfigLocked', 'NotEligible',
    'NotTriggered', 'NotBeneficiary', 'AlreadyClaimed', 'NoEntitlement', 'InsufficientBalance',
    'InsufficientStorage', 'FallbackNotReady', 'TooManyVaults',
  ];
  const match = known.find(code => lower.includes(code.toLowerCase()));
  if (match) return match.replace(/([a-z])([A-Z])/g, '$1 $2');
  return raw.length > 220 ? `${raw.slice(0, 217)}…` : raw;
}
