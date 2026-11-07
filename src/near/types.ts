export interface VaultView {
  vault_id: string;
  owner: string;
  check_in_interval_ns: string;
  last_ping_ns: string;
  deadline_ns: string;
  active: boolean;
  total_deposited: string;
  vault_balance: string;
  beneficiaries_set: boolean;
  fallback_account: string | null;
  inheritance_triggered: boolean;
  distributable_snapshot: string;
  pending_count: string;
  next_transfer_nonce: string;
  pending_withdrawal: boolean;
  pending_fallback: boolean;
  storage_reserved: string;
}

export interface BeneficiaryView {
  account_id: string;
  share_percent: number;
  entitlement: string;
  claimed: boolean;
  claimed_amount: string;
  transfer_pending: boolean;
}

export interface VaultState {
  vault: VaultView | null;
  beneficiaries: BeneficiaryView[];
  overdue: boolean;
}

export type TransactionPhase =
  | 'awaiting-wallet'
  | 'finalizing'
  | 'success'
  | 'failure';

export interface TransactionRecord {
  id: string;
  label: string;
  method: string;
  accountId: string;
  phase: TransactionPhase;
  hash?: string;
  error?: string;
  createdAt: number;
  finalizedAt?: number;
}

export interface ContractCall {
  label: string;
  method: string;
  args?: Record<string, unknown>;
  gas: bigint;
  deposit?: bigint;
}
