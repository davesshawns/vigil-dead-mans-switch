import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { erc20Abi, parseUnits } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Shield, PlusCircle, RefreshCw, ArrowDownToLine, ArrowUpFromLine,
  Users, Clock, Zap, ChevronRight, ExternalLink, CheckCircle2,
  AlertTriangle, X, Check, Info,
} from 'lucide-react';
import { VAULT_REGISTRY, CHAIN_ID, CHAIN, USDC, KNOWN_TOKENS } from '@/contract';
import { formatToken, formatDuration, formatAddress, parseOnchainError } from '@/utils/format';
import { useCountdown } from '@/hooks/useCountdown';

// ─── Design tokens ────────────────────────────────────────────────────────────

const glass = {
  card: {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.09)',
  } as React.CSSProperties,
};

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
};

// ─── Interval picker ─────────────────────────────────────────────────────────

type Unit = 'seconds' | 'minutes' | 'hours' | 'days';
const UNITS: Unit[] = ['seconds', 'minutes', 'hours', 'days'];
const UNIT_MUL: Record<Unit, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };

function IntervalInput({ value, onChange, label }: { value: number; onChange: (s: number) => void; label: string }) {
  const [num, setNum] = useState(1);
  const [unit, setUnit] = useState<Unit>('hours');
  const apply = (n: number, u: Unit) => onChange(Math.max(60, n * UNIT_MUL[u]));
  return (
    <div>
      {label && <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: '#94a3b8' }}>{label}</label>}
      <div className="flex gap-2">
        <input type="number" min={1} value={num}
          onChange={e => { const n = Math.max(1, Number(e.target.value)); setNum(n); apply(n, unit); }}
          className="w-20 rounded-xl px-3 py-2 text-sm font-medium outline-none"
          style={{ ...glass.inner, color: '#f9faf3', caretColor: '#acc6e9' }}
        />
        <select value={unit} onChange={e => { const u = e.target.value as Unit; setUnit(u); apply(num, u); }}
          className="flex-1 rounded-xl px-3 py-2 text-sm font-medium outline-none cursor-pointer"
          style={{ ...glass.inner, color: '#f9faf3', appearance: 'none' }}
        >
          {UNITS.map(u => <option key={u} value={u} style={{ background: '#0d1b2f' }}>{u}</option>)}
        </select>
      </div>
      {value < 60 && <p className="text-xs mt-1" style={{ color: '#e86d7a' }}>Minimum 60 seconds</p>}
      <p className="text-xs mt-1" style={{ color: '#64748b' }}>= {formatDuration(value)}</p>
    </div>
  );
}

// ─── Token picker ─────────────────────────────────────────────────────────────

function TokenPicker({ value, onChange }: { value: string; onChange: (addr: string) => void }) {
  const [custom, setCustom] = useState(false);
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: '#94a3b8' }}>Token</label>
      <div className="flex gap-2 mb-2">
        {KNOWN_TOKENS.map(t => (
          <button key={t.address} onClick={() => { onChange(t.address); setCustom(false); }}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition-all"
            style={value === t.address && !custom ? { background: '#acc6e9', color: '#0d1b2f', border: 'none' } : { ...glass.inner, color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.12)' }}
          >{t.symbol}</button>
        ))}
        <button onClick={() => setCustom(true)}
          className="rounded-xl px-4 py-2 text-sm font-semibold transition-all"
          style={custom ? { background: '#acc6e9', color: '#0d1b2f', border: 'none' } : { ...glass.inner, color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.12)' }}
        >Custom</button>
      </div>
      {custom && (
        <input placeholder="0x… ERC-20 token address" className="w-full rounded-xl px-3 py-2 text-sm outline-none mono"
          style={{ ...glass.inner, color: '#f9faf3', caretColor: '#acc6e9' }}
          onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}

// ─── Tx status row ────────────────────────────────────────────────────────────

function TxStatus({ hash, isPending, isConfirming, isSuccess, label }: {
  hash?: `0x${string}`; isPending: boolean; isConfirming: boolean; isSuccess: boolean; label: string;
}) {
  if (!isPending && !isConfirming && !isSuccess) return null;
  return (
    <motion.div {...fadeUp} className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={glass.inner}>
      {(isPending || isConfirming) && <RefreshCw size={13} className="animate-spin" style={{ color: '#acc6e9' }} />}
      {isSuccess && <CheckCircle2 size={13} style={{ color: '#8dd89f' }} />}
      <span style={{ color: isSuccess ? '#8dd89f' : '#acc6e9' }}>
        {isPending ? `Confirm in wallet — ${label}` : isConfirming ? 'Confirming on Arc…' : `${label} confirmed`}
      </span>
      {isSuccess && hash && (
        <a href={`${CHAIN.explorerBase}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="ml-auto">
          <ExternalLink size={11} style={{ color: '#94a3b8' }} />
        </a>
      )}
    </motion.div>
  );
}

// ─── Inline blocker note ──────────────────────────────────────────────────────

function BlockerNote({ text }: { text: string }) {
  return (
    <motion.div {...fadeUp} className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs"
      style={{ background: 'rgba(172,198,233,0.07)', border: '1px solid rgba(172,198,233,0.18)' }}
    >
      <Info size={13} style={{ color: '#acc6e9', flexShrink: 0, marginTop: 1 }} />
      <span style={{ color: '#94a3b8' }}>{text}</span>
    </motion.div>
  );
}

// ─── Setup stepper ────────────────────────────────────────────────────────────

interface SetupStep {
  n: number;
  label: string;
  done: boolean;
  cta: string;
  onClick: () => void;
}

function SetupStepper({ steps }: { steps: SetupStep[] }) {
  const firstPending = steps.find(s => !s.done);
  return (
    <motion.div {...fadeUp} className="rounded-2xl p-5 space-y-1" style={glass.card}>
      <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#acc6e9' }}>
        Setup checklist
      </p>
      {steps.map((step, i) => {
        const isNext = step === firstPending;
        const locked = !step.done && step !== firstPending;
        return (
          <motion.div
            key={i}
            layout
            className="flex items-center gap-3 rounded-xl px-3 py-3"
            style={{
              background: isNext ? 'rgba(172,198,233,0.09)' : 'transparent',
              border: isNext ? '1px solid rgba(172,198,233,0.2)' : '1px solid transparent',
            }}
          >
            {/* Step circle */}
            <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
              style={{
                background: step.done ? 'rgba(141,216,159,0.2)' : isNext ? 'rgba(172,198,233,0.2)' : 'rgba(255,255,255,0.05)',
                border: step.done ? '1.5px solid #8dd89f' : isNext ? '1.5px solid #acc6e9' : '1.5px solid rgba(255,255,255,0.12)',
                color: step.done ? '#8dd89f' : isNext ? '#acc6e9' : '#64748b',
              }}
            >
              {step.done ? <Check size={11} strokeWidth={2.5} /> : step.n}
            </div>
            <span className="flex-1 text-sm" style={{ color: step.done ? '#64748b' : locked ? '#475569' : '#f9faf3', textDecoration: step.done ? 'line-through' : 'none' }}>
              {step.label}
            </span>
            {isNext && (
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={step.onClick}
                className="text-xs font-semibold rounded-lg px-3 py-1.5 flex-shrink-0"
                style={{ background: '#acc6e9', color: '#0d1b2f', border: 'none', cursor: 'pointer' }}
              >
                {step.cta}
              </motion.button>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// ─── Create vault panel ───────────────────────────────────────────────────────

function CreateVault({ onCreated }: { onCreated: () => void }) {
  const [token, setToken] = useState(USDC.address);
  const [interval, setInterval] = useState(3600);
  const [allowAmt, setAllowAmt] = useState('');
  const [allowPeriod, setAllowPeriod] = useState(86400);

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleCreate = useCallback(() => {
    if (interval < 60) return;
    const decimals = token.toLowerCase() === USDC.address.toLowerCase() ? USDC.decimals : 6;
    const allowAmtRaw = allowAmt ? parseUnits(allowAmt, decimals) : 0n;
    const allowPeriodRaw = allowAmtRaw > 0n ? BigInt(allowPeriod) : 0n;
    writeContract({
      ...VAULT_REGISTRY, functionName: 'createVault',
      args: [token as `0x${string}`, BigInt(interval), allowAmtRaw, allowPeriodRaw],
      chainId: CHAIN_ID,
    }, {
      onError: (e) => { toast.error(parseOnchainError(e)); },
    });
  }, [token, interval, allowAmt, allowPeriod, writeContract]);

  if (isSuccess) {
    return (
      <motion.div {...fadeUp} className="rounded-2xl p-8 text-center" style={glass.card}>
        <div className="mx-auto mb-4 flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: 'rgba(141,216,159,0.15)' }}>
          <CheckCircle2 size={28} style={{ color: '#8dd89f' }} />
        </div>
        <p className="display text-xl font-bold mb-1" style={{ color: '#f9faf3' }}>Vault created</p>
        <p className="text-sm mb-5" style={{ color: '#94a3b8' }}>Two more steps and your vault is fully protected.</p>
        <button onClick={onCreated} className="w-full rounded-xl py-3 text-sm font-semibold"
          style={{ background: '#acc6e9', color: '#0d1b2f', border: 'none', cursor: 'pointer' }}>
          Continue setup
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeUp} className="rounded-2xl overflow-hidden" style={glass.card}>
      <div className="h-1 spectral" />
      <div className="p-6 space-y-5">
        <div>
          <h2 className="display text-xl font-bold mb-1" style={{ color: '#f9faf3' }}>Create your vault</h2>
          <p className="text-xs" style={{ color: '#94a3b8' }}>One vault per wallet. You can change settings any time before it triggers.</p>
        </div>
        <TokenPicker value={token} onChange={setToken} />
        <IntervalInput value={interval} onChange={setInterval} label="How long before it triggers if you go silent?" />
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: '#94a3b8' }}>
            Living allowance <span style={{ color: '#64748b', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
          </label>
          <p className="text-xs mb-2" style={{ color: '#64748b' }}>Send a regular amount to beneficiaries while you're still active.</p>
          <div className="flex gap-2">
            <input type="number" min={0} placeholder="0.00" value={allowAmt} onChange={e => setAllowAmt(e.target.value)}
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ ...glass.inner, color: '#f9faf3', caretColor: '#acc6e9' }}
            />
            {allowAmt && Number(allowAmt) > 0 && (
              <div className="flex-1"><IntervalInput value={allowPeriod} onChange={setAllowPeriod} label="" /></div>
            )}
          </div>
          {allowAmt && Number(allowAmt) > 0 && (
            <p className="text-xs mt-1" style={{ color: '#64748b' }}>
              Each beneficiary receives {allowAmt} USDC every {formatDuration(allowPeriod)}.
            </p>
          )}
        </div>
        <motion.button onClick={handleCreate} disabled={isPending || isConfirming || interval < 60}
          whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }}
          className="w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: (isPending || isConfirming) ? 'rgba(172,198,233,0.5)' : '#acc6e9', color: '#0d1b2f', border: 'none', cursor: isPending || isConfirming ? 'not-allowed' : 'pointer' }}
        >
          {isPending ? <><RefreshCw size={14} className="animate-spin" /> Confirm in wallet…</> :
           isConfirming ? <><RefreshCw size={14} className="animate-spin" /> Creating…</> :
           <><Shield size={14} /> Create vault</>}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Beneficiary editor ───────────────────────────────────────────────────────

function BeneficiaryEditor({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const [rows, setRows] = useState([{ wallet: '', bp: '' }]);
  const total = rows.reduce((s, r) => s + (Number(r.bp) || 0), 0);
  const addRow = () => setRows(r => [...r, { wallet: '', bp: '' }]);
  const removeRow = (i: number) => setRows(r => r.filter((_, j) => j !== i));
  const update = (i: number, field: 'wallet' | 'bp', val: string) =>
    setRows(r => r.map((row, j) => j === i ? { ...row, [field]: val } : row));

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const valid = total === 100 && rows.every(r => r.wallet.startsWith('0x') && r.wallet.length === 42 && Number(r.bp) > 0);

  const handleSave = () => {
    writeContract({
      ...VAULT_REGISTRY, functionName: 'setBeneficiaries',
      args: [rows.map(r => r.wallet as `0x${string}`), rows.map(r => Math.round(Number(r.bp) * 100)) as unknown as readonly number[]],
      chainId: CHAIN_ID,
    }, {
      onSuccess: () => toast.success('Beneficiaries saved'),
      onError: (e) => { toast.error(parseOnchainError(e)); },
    });
  };

  if (isSuccess) { onSave(); return null; }

  return (
    <motion.div {...fadeUp} className="rounded-2xl p-5 space-y-4" style={glass.card}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: '#f9faf3' }}>Who gets your USDC?</p>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={16} /></button>
      </div>
      <p className="text-xs" style={{ color: '#64748b' }}>
        Enter wallet addresses and percentage shares. Total must equal 100%. Up to 10 beneficiaries.
      </p>
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input placeholder="0x… wallet address" value={row.wallet} onChange={e => update(i, 'wallet', e.target.value)}
            className="flex-1 rounded-xl px-3 py-2 text-xs mono outline-none"
            style={{ ...glass.inner, color: '#f9faf3', caretColor: '#acc6e9' }} />
          <div className="relative w-16">
            <input type="number" min={0} max={100} placeholder="%" value={row.bp} onChange={e => update(i, 'bp', e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-xs outline-none text-center"
              style={{ ...glass.inner, color: '#f9faf3', caretColor: '#acc6e9' }} />
          </div>
          {rows.length > 1 && (
            <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button onClick={addRow} disabled={rows.length >= 10} className="text-xs flex items-center gap-1"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#acc6e9' }}>
          <PlusCircle size={13} /> Add another
        </button>
        <span className="text-xs font-semibold tabular" style={{ color: total === 100 ? '#8dd89f' : total > 100 ? '#e86d7a' : '#94a3b8' }}>
          {total}% {total === 100 ? '✓' : `— need ${100 - total > 0 ? `${(100 - total).toFixed(0)}% more` : `${(total - 100).toFixed(0)}% less`}`}
        </span>
      </div>
      <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} label="Save" />
      <motion.button onClick={handleSave} disabled={!valid || isPending || isConfirming} whileTap={{ scale: 0.97 }}
        className="w-full rounded-xl py-3 text-sm font-semibold"
        style={{ background: (!valid || isPending || isConfirming) ? 'rgba(172,198,233,0.35)' : '#acc6e9', color: '#0d1b2f', border: 'none', cursor: (!valid || isPending || isConfirming) ? 'not-allowed' : 'pointer' }}
      >
        {isPending ? 'Confirm…' : isConfirming ? 'Saving…' : 'Save beneficiaries'}
      </motion.button>
    </motion.div>
  );
}

// ─── Vault status pill ────────────────────────────────────────────────────────

type VaultStatus = 'active' | 'due-soon' | 'overdue' | 'triggered' | 'empty';

function statusMeta(status: VaultStatus) {
  switch (status) {
    case 'active':    return { label: 'Active',     color: '#8dd89f', bg: 'rgba(141,216,159,0.15)', border: 'rgba(141,216,159,0.3)' };
    case 'due-soon':  return { label: 'Due soon',   color: '#ffcd83', bg: 'rgba(255,205,131,0.15)', border: 'rgba(255,205,131,0.3)' };
    case 'overdue':   return { label: 'Overdue',    color: '#e86d7a', bg: 'rgba(232,109,122,0.15)', border: 'rgba(232,109,122,0.3)' };
    case 'triggered': return { label: 'Triggered',  color: '#e86d7a', bg: 'rgba(232,109,122,0.12)', border: 'rgba(232,109,122,0.35)' };
    case 'empty':     return { label: 'No funds',   color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.2)' };
  }
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

type Panel = 'none' | 'deposit' | 'withdraw' | 'beneficiaries' | 'settings' | 'allowance';

export default function VaultDashboard() {
  const { address } = useAccount();
  const [panel, setPanel] = useState<Panel>('none');
  const [depositAmt, setDepositAmt] = useState('');
  const [fallbackInput, setFallbackInput] = useState('');
  const [newInterval, setNewInterval] = useState(3600);
  const [allowAmt, setAllowAmt] = useState('');
  const [allowPeriod, setAllowPeriod] = useState(86400);

  const { data: vaultData, refetch: refetchVault } = useReadContract({
    ...VAULT_REGISTRY, functionName: 'getVault', args: [address!],
    chainId: CHAIN_ID, query: { enabled: !!address },
  });
  const { data: beneficiariesData, refetch: refetchBeneficiaries } = useReadContract({
    ...VAULT_REGISTRY, functionName: 'getBeneficiaries', args: [address!],
    chainId: CHAIN_ID, query: { enabled: !!address },
  });
  const { data: vaultBal, refetch: refetchBal } = useReadContract({
    ...VAULT_REGISTRY, functionName: 'vaultBalance', args: [address!],
    chainId: CHAIN_ID, query: { enabled: !!address },
  });
  const { data: tokenAllowance, refetch: refetchAllowance } = useReadContract({
    address: USDC.address as `0x${string}`, abi: erc20Abi, functionName: 'allowance',
    args: [address!, VAULT_REGISTRY.address],
    chainId: CHAIN_ID, query: { enabled: !!address },
  });

  const refetchAll = () => { void refetchVault(); void refetchBal(); void refetchAllowance(); void refetchBeneficiaries(); };

  // ── derived state ────────────────────────────────────────────────────────────
  const hasVault = !!vaultData && (vaultData as unknown[])[0] !== '0x0000000000000000000000000000000000000000';
  const vault = hasVault ? {
    token:               (vaultData as unknown[])[0]  as string,
    checkInInterval:     (vaultData as unknown[])[1]  as bigint,
    lastPing:            (vaultData as unknown[])[2]  as bigint,
    active:              (vaultData as unknown[])[3]  as boolean,
    isTriggered:         (vaultData as unknown[])[4]  as boolean,
    totalDeposited:      (vaultData as unknown[])[5]  as bigint,
    fallbackWallet:      (vaultData as unknown[])[6]  as string,
    allowanceAmount:     (vaultData as unknown[])[7]  as bigint,
    allowancePeriod:     (vaultData as unknown[])[8]  as bigint,
    lastAllowanceRelease:(vaultData as unknown[])[9]  as bigint,
    allowanceEnabled:    (vaultData as unknown[])[10] as boolean,
  } : null;

  const balance        = vaultBal as bigint | undefined;
  const tokenDecimals  = USDC.decimals;
  const beneficiaries  = (beneficiariesData as { wallet: string; basisPoints: number; claimed: boolean }[] | undefined) ?? [];
  const hasRecipient   = beneficiaries.length > 0
    || (vault?.fallbackWallet && vault.fallbackWallet !== '0x0000000000000000000000000000000000000000');
  const hasFunds       = !!balance && balance > 0n;
  const triggered      = vault?.isTriggered ?? false;
  const countdown      = useCountdown(vault?.lastPing, vault?.checkInInterval);
  const allowanceCountdown = useCountdown(vault?.lastAllowanceRelease, vault?.allowancePeriod);

  // Vault status
  const vaultStatus: VaultStatus = !hasFunds ? 'empty'
    : triggered ? 'triggered'
    : countdown === 0 ? 'overdue'
    : vault && countdown < Number(vault.checkInInterval) * 0.1 ? 'due-soon'
    : 'active';
  const sm = statusMeta(vaultStatus);

  // Time-bar width (0-100%)
  const timeBarPct = vault && !triggered
    ? Math.min(100, Math.round((countdown / Number(vault.checkInInterval)) * 100))
    : 0;

  // ── write hooks ──────────────────────────────────────────────────────────────
  const { writeContract: doPing, data: pingHash, isPending: pingPending } = useWriteContract();
  const { isLoading: pingConfirming, isSuccess: pingDone } = useWaitForTransactionReceipt({ hash: pingHash });
  const { writeContract: doApprove, data: approveHash, isPending: approvePending } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveDone } = useWaitForTransactionReceipt({ hash: approveHash });
  const { writeContract: doDeposit, data: depositHash, isPending: depositPending } = useWriteContract();
  const { isLoading: depositConfirming, isSuccess: depositDone } = useWaitForTransactionReceipt({ hash: depositHash });
  const { writeContract: doWithdraw, data: withdrawHash, isPending: withdrawPending } = useWriteContract();
  const { isLoading: withdrawConfirming, isSuccess: withdrawDone } = useWaitForTransactionReceipt({ hash: withdrawHash });
  const { writeContract: doFallback, data: fallbackHash, isPending: fallbackPending } = useWriteContract();
  const { isLoading: fallbackConfirming, isSuccess: fallbackDone } = useWaitForTransactionReceipt({ hash: fallbackHash });
  const { writeContract: doInterval, data: intervalHash, isPending: intervalPending } = useWriteContract();
  const { isLoading: intervalConfirming, isSuccess: intervalDone } = useWaitForTransactionReceipt({ hash: intervalHash });
  const { writeContract: doAllowance, data: allowanceHash, isPending: allowancePending } = useWriteContract();
  const { isLoading: allowanceConfirming, isSuccess: allowanceDone } = useWaitForTransactionReceipt({ hash: allowanceHash });
  const { writeContract: doTriggerAllowance, data: triggerAlHash, isPending: triggerAlPending } = useWriteContract();
  const { isLoading: triggerAlConfirming, isSuccess: triggerAlDone } = useWaitForTransactionReceipt({ hash: triggerAlHash });

  // ── action handlers ──────────────────────────────────────────────────────────
  const handlePing = () => doPing({ ...VAULT_REGISTRY, functionName: 'ping', chainId: CHAIN_ID }, {
    onSuccess: () => { toast.success("Confirmed — you're alive, timer reset"); void refetchAll(); },
    onError: (e) => { toast.error(parseOnchainError(e)); },
  });
  const handleApprove = () => doApprove({
    address: USDC.address as `0x${string}`, abi: erc20Abi, functionName: 'approve',
    args: [VAULT_REGISTRY.address, parseUnits(depositAmt || '0', tokenDecimals)], chainId: CHAIN_ID,
  }, {
    onSuccess: () => { toast.success('USDC spending allowed'); void refetchAllowance(); },
    onError: (e) => { toast.error(parseOnchainError(e)); },
  });
  const handleDeposit = () => doDeposit({
    ...VAULT_REGISTRY, functionName: 'deposit',
    args: [parseUnits(depositAmt || '0', tokenDecimals)], chainId: CHAIN_ID,
  }, {
    onSuccess: () => { toast.success('Funds added to vault'); setDepositAmt(''); void refetchAll(); },
    onError: (e) => { toast.error(parseOnchainError(e)); },
  });
  const handleWithdraw = () => doWithdraw({ ...VAULT_REGISTRY, functionName: 'withdrawAll', chainId: CHAIN_ID }, {
    onSuccess: () => { toast.success('Funds returned to your wallet'); void refetchAll(); },
    onError: (e) => { toast.error(parseOnchainError(e)); },
  });
  const handleSetFallback = () => doFallback({
    ...VAULT_REGISTRY, functionName: 'setFallbackWallet',
    args: [fallbackInput as `0x${string}`], chainId: CHAIN_ID,
  }, {
    onSuccess: () => { toast.success('Backup wallet saved'); void refetchAll(); },
    onError: (e) => { toast.error(parseOnchainError(e)); },
  });
  const handleSetInterval = () => doInterval({
    ...VAULT_REGISTRY, functionName: 'setCheckInInterval',
    args: [BigInt(newInterval)], chainId: CHAIN_ID,
  }, {
    onSuccess: () => { toast.success('Schedule updated'); void refetchAll(); },
    onError: (e) => { toast.error(parseOnchainError(e)); },
  });
  const handleSetAllowance = () => doAllowance({
    ...VAULT_REGISTRY, functionName: 'setAllowance',
    args: [parseUnits(allowAmt || '0', tokenDecimals), BigInt(allowPeriod)], chainId: CHAIN_ID,
  }, {
    onSuccess: () => { toast.success('Allowance updated'); void refetchAll(); },
    onError: (e) => { toast.error(parseOnchainError(e)); },
  });
  const handleTriggerAllowance = () => doTriggerAllowance({
    ...VAULT_REGISTRY, functionName: 'triggerAllowance', chainId: CHAIN_ID,
  }, {
    onSuccess: () => { toast.success('Allowance sent to beneficiaries'); void refetchAll(); },
    onError: (e) => { toast.error(parseOnchainError(e)); },
  });

  const approvedEnough = tokenAllowance !== undefined && depositAmt
    ? (tokenAllowance) >= parseUnits(depositAmt, tokenDecimals)
    : false;

  // ── no vault yet ─────────────────────────────────────────────────────────────
  if (!hasVault || !vault) {
    return <CreateVault onCreated={() => { void refetchAll(); }} />;
  }

  // ── setup stepper (shown until all 3 steps done) ──────────────────────────────
  const setupDone = hasRecipient && hasFunds;
  const setupSteps: SetupStep[] = [
    {
      n: 1,
      label: 'Add who gets your USDC',
      done: !!hasRecipient,
      cta: 'Add now',
      onClick: () => setPanel('beneficiaries'),
    },
    {
      n: 2,
      label: 'Add funds to protect',
      done: hasFunds,
      cta: 'Add funds',
      onClick: () => setPanel('deposit'),
    },
    {
      n: 3,
      label: "Check in to start the clock",
      done: hasFunds && !triggered, // once funds are in, first ping proves life
      cta: 'Check in',
      onClick: handlePing,
    },
  ];

  return (
    <div className="space-y-3">

      {/* Setup stepper — visible until vault is fully active */}
      {!setupDone && !triggered && (
        <SetupStepper steps={setupSteps} />
      )}

      {/* Triggered banner */}
      <AnimatePresence>
        {triggered && (
          <motion.div key="triggered" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{ background: 'rgba(234,88,75,0.12)', border: '1px solid rgba(234,88,75,0.35)' }}
          >
            <AlertTriangle size={18} style={{ color: '#e86d7a', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: '#e86d7a' }}>Vault triggered</p>
              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                You missed the check-in window. Deposits and config changes are locked. Your beneficiaries can claim now.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Hero card ── */}
      <motion.div {...fadeUp} className="rounded-2xl overflow-hidden" style={glass.card}>
        <div className="h-1 spectral" />
        <div className="p-6">

          {/* Status pill + balance */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>Vault balance</p>
              <p className="display text-4xl font-bold tabular" style={{ color: '#f9faf3', letterSpacing: '-0.04em' }}>
                {balance !== undefined ? formatToken(balance, tokenDecimals) : '—'}
                <span className="text-lg ml-2 font-semibold" style={{ color: '#64748b' }}>USDC</span>
              </p>
            </div>
            <div className="rounded-full px-3 py-1 text-xs font-semibold mt-1"
              style={{ background: sm.bg, border: `1px solid ${sm.border}`, color: sm.color }}>
              {sm.label}
            </div>
          </div>

          {/* Time remaining bar */}
          {!triggered && hasFunds && vault.active && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs" style={{ color: '#64748b' }}>Time until trigger</span>
                <span className="text-xs font-medium tabular" style={{ color: countdown < 300 ? '#e86d7a' : '#94a3b8' }}>
                  {countdown > 0 ? formatDuration(countdown) : 'Overdue'}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: countdown < 300 ? '#e86d7a' : timeBarPct > 30 ? '#8dd89f' : '#ffcd83' }}
                  initial={false}
                  animate={{ width: `${timeBarPct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {/* No-funds hint */}
          {!hasFunds && !triggered && (
            <p className="text-xs mb-4" style={{ color: '#64748b' }}>
              Add funds to start protecting your USDC. The check-in clock starts once you have a balance.
            </p>
          )}

          {/* Action buttons */}
          {!triggered && (
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handlePing}
                disabled={pingPending || pingConfirming || !hasFunds}
                className="flex-1 rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5"
                style={{
                  background: '#acc6e9', color: '#0d1b2f', border: 'none',
                  cursor: !hasFunds ? 'not-allowed' : 'pointer',
                  opacity: !hasFunds ? 0.4 : 1,
                }}
              >
                {pingPending || pingConfirming ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                I'm alive
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setPanel(p => p === 'deposit' ? 'none' : 'deposit')}
                className="flex-1 rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-1.5"
                style={{ ...glass.inner, color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}
              >
                <ArrowDownToLine size={13} /> Add funds
              </motion.button>
              {hasFunds && (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setPanel(p => p === 'withdraw' ? 'none' : 'withdraw')}
                  className="rounded-xl py-3 px-4 text-sm font-semibold flex items-center justify-center"
                  style={{ ...glass.inner, color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}
                >
                  <ArrowUpFromLine size={13} />
                </motion.button>
              )}
            </div>
          )}

          {/* Ping blocker hint */}
          {!hasFunds && !triggered && (
            <p className="text-xs mt-2" style={{ color: '#475569' }}>
              "I'm alive" is disabled — add funds first so there's something to protect.
            </p>
          )}

          <TxStatus hash={pingHash} isPending={pingPending} isConfirming={pingConfirming} isSuccess={pingDone} label="Check in" />
        </div>
      </motion.div>

      {/* ── Add funds panel ── */}
      <AnimatePresence>
        {panel === 'deposit' && !triggered && (
          <motion.div key="deposit" {...fadeUp} className="rounded-2xl p-5 space-y-3" style={glass.card}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: '#f9faf3' }}>Add funds to vault</p>
              <button onClick={() => setPanel('none')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={15} /></button>
            </div>

            {!hasRecipient && (
              <BlockerNote text="You haven't set any beneficiaries yet. Add them below first — depositing without a recipient means funds could get stuck." />
            )}

            <input type="number" min={0} placeholder="0.00 USDC" value={depositAmt}
              onChange={e => setDepositAmt(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-base outline-none tabular"
              style={{ ...glass.inner, color: '#f9faf3', caretColor: '#acc6e9' }}
            />

            {!approvedEnough ? (
              <>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  Step 1 of 2: Allow the vault to hold your USDC. This is a one-time approval per amount.
                </p>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleApprove}
                  disabled={approvePending || approveConfirming || !depositAmt || !hasRecipient}
                  className="w-full rounded-xl py-3 text-sm font-semibold"
                  style={{ background: '#acc6e9', color: '#0d1b2f', border: 'none',
                    cursor: !hasRecipient ? 'not-allowed' : 'pointer', opacity: !hasRecipient ? 0.5 : 1 }}
                >
                  {approvePending || approveConfirming
                    ? <span className="flex items-center justify-center gap-2"><RefreshCw size={13} className="animate-spin" /> Allowing…</span>
                    : 'Allow USDC spending'}
                </motion.button>
              </>
            ) : (
              <>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  Step 2 of 2: Move USDC into the vault. It stays there until you withdraw or beneficiaries claim.
                </p>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleDeposit}
                  disabled={depositPending || depositConfirming || !depositAmt || !hasRecipient}
                  className="w-full rounded-xl py-3 text-sm font-semibold"
                  style={{ background: '#acc6e9', color: '#0d1b2f', border: 'none',
                    cursor: !hasRecipient ? 'not-allowed' : 'pointer', opacity: !hasRecipient ? 0.5 : 1 }}
                >
                  {depositPending || depositConfirming
                    ? <span className="flex items-center justify-center gap-2"><RefreshCw size={13} className="animate-spin" /> Depositing…</span>
                    : 'Add to vault'}
                </motion.button>
              </>
            )}
            <TxStatus hash={approveHash} isPending={approvePending} isConfirming={approveConfirming} isSuccess={approveDone} label="Allow" />
            <TxStatus hash={depositHash} isPending={depositPending} isConfirming={depositConfirming} isSuccess={depositDone} label="Add funds" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Cash out panel ── */}
      <AnimatePresence>
        {panel === 'withdraw' && !triggered && (
          <motion.div key="withdraw" {...fadeUp} className="rounded-2xl p-5 space-y-3" style={glass.card}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: '#f9faf3' }}>Cash out</p>
              <button onClick={() => setPanel('none')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={15} /></button>
            </div>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Returns {balance ? formatToken(balance, tokenDecimals) : '0'} USDC to your wallet and closes the vault. You can reopen it later.
            </p>
            <motion.button whileTap={{ scale: 0.97 }} onClick={handleWithdraw}
              disabled={withdrawPending || withdrawConfirming}
              className="w-full rounded-xl py-3 text-sm font-semibold"
              style={{ background: 'rgba(232,109,122,0.15)', color: '#e86d7a', border: '1px solid rgba(232,109,122,0.3)', cursor: 'pointer' }}
            >
              {withdrawPending || withdrawConfirming ? 'Processing…' : 'Cash out & close vault'}
            </motion.button>
            <TxStatus hash={withdrawHash} isPending={withdrawPending} isConfirming={withdrawConfirming} isSuccess={withdrawDone} label="Withdraw" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Beneficiaries card ── */}
      <AnimatePresence mode="wait">
        {panel === 'beneficiaries' ? (
          <BeneficiaryEditor key="editor"
            onSave={() => { setPanel('none'); void refetchAll(); }}
            onCancel={() => setPanel('none')}
          />
        ) : (
          <motion.div key="bene-row" {...fadeUp} className="rounded-2xl p-5" style={glass.card}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={15} style={{ color: beneficiaries.length > 0 ? '#8dd89f' : '#64748b' }} />
                <p className="text-sm font-semibold" style={{ color: '#f9faf3' }}>Beneficiaries</p>
                {beneficiaries.length > 0
                  ? <span className="text-xs rounded-full px-2 py-0.5" style={{ background: 'rgba(141,216,159,0.15)', color: '#8dd89f' }}>{beneficiaries.length}</span>
                  : <span className="text-xs rounded-full px-2 py-0.5" style={{ background: 'rgba(232,109,122,0.12)', color: '#e86d7a' }}>None set</span>
                }
              </div>
              {!triggered && (
                <motion.button whileTap={{ scale: 0.94 }} onClick={() => setPanel('beneficiaries')}
                  className="flex items-center gap-1 text-xs font-semibold"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#acc6e9' }}
                >
                  {beneficiaries.length > 0 ? 'Edit' : 'Add'} <ChevronRight size={13} />
                </motion.button>
              )}
            </div>
            {beneficiaries.length > 0 ? (
              <div className="mt-3 space-y-2">
                {beneficiaries.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs" style={{ color: '#94a3b8' }}>
                    <span className="mono">{formatAddress(b.wallet)}</span>
                    <span className="font-semibold tabular" style={{ color: '#cbd5e1' }}>{(b.basisPoints / 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            ) : (
              !triggered && (
                <p className="text-xs mt-2" style={{ color: '#64748b' }}>
                  No one is set to receive your funds yet. Tap Add to set up beneficiaries — required before depositing.
                </p>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Settings / Allowance row ── */}
      <div className="grid grid-cols-2 gap-2">
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => setPanel(p => p === 'settings' ? 'none' : 'settings')}
          className="rounded-2xl p-4 text-left" style={glass.card}>
          <Clock size={15} style={{ color: '#acc6e9', marginBottom: 8 }} />
          <p className="text-xs font-semibold" style={{ color: '#f9faf3' }}>Schedule</p>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>Trigger in {formatDuration(Number(vault.checkInInterval))}</p>
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => setPanel(p => p === 'allowance' ? 'none' : 'allowance')}
          className="rounded-2xl p-4 text-left" style={glass.card}>
          <Zap size={15} style={{ color: '#acc6e9', marginBottom: 8 }} />
          <p className="text-xs font-semibold" style={{ color: '#f9faf3' }}>Allowance</p>
          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
            {vault.allowanceEnabled ? `${formatToken(vault.allowanceAmount, tokenDecimals)} / period` : 'Off'}
          </p>
        </motion.button>
      </div>

      {/* ── Schedule panel ── */}
      <AnimatePresence>
        {panel === 'settings' && !triggered && (
          <motion.div key="settings" {...fadeUp} className="rounded-2xl p-5 space-y-4" style={glass.card}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: '#f9faf3' }}>Check-in schedule</p>
              <button onClick={() => setPanel('none')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={15} /></button>
            </div>
            <p className="text-xs" style={{ color: '#64748b' }}>How long you can go silent before the vault triggers.</p>
            <IntervalInput value={newInterval} onChange={setNewInterval} label="Silence window" />
            <motion.button whileTap={{ scale: 0.97 }} onClick={handleSetInterval}
              disabled={intervalPending || intervalConfirming || newInterval < 60}
              className="w-full rounded-xl py-3 text-sm font-semibold"
              style={{ background: '#acc6e9', color: '#0d1b2f', border: 'none', cursor: 'pointer' }}
            >
              {intervalPending || intervalConfirming ? 'Saving…' : 'Update schedule'}
            </motion.button>
            <TxStatus hash={intervalHash} isPending={intervalPending} isConfirming={intervalConfirming} isSuccess={intervalDone} label="Schedule" />

            <div className="pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: '#f9faf3' }}>Backup wallet</p>
              <p className="text-xs mb-2" style={{ color: '#64748b' }}>
                {vault.fallbackWallet !== '0x0000000000000000000000000000000000000000'
                  ? `Currently: ${formatAddress(vault.fallbackWallet)} — sweeps any unclaimed remainder after 2× the window.`
                  : 'Not set. If any beneficiaries don\'t claim, the remainder stays in the vault indefinitely.'}
              </p>
              <input placeholder="0x… wallet address" value={fallbackInput} onChange={e => setFallbackInput(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-xs mono outline-none mb-2"
                style={{ ...glass.inner, color: '#f9faf3', caretColor: '#acc6e9' }}
              />
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleSetFallback}
                disabled={fallbackPending || fallbackConfirming || !fallbackInput.startsWith('0x')}
                className="w-full rounded-xl py-3 text-sm font-semibold"
                style={{ background: '#acc6e9', color: '#0d1b2f', border: 'none', cursor: 'pointer' }}
              >
                {fallbackPending || fallbackConfirming ? 'Saving…' : 'Set backup wallet'}
              </motion.button>
              <TxStatus hash={fallbackHash} isPending={fallbackPending} isConfirming={fallbackConfirming} isSuccess={fallbackDone} label="Backup wallet" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Allowance panel ── */}
      <AnimatePresence>
        {panel === 'allowance' && (
          <motion.div key="allowance" {...fadeUp} className="rounded-2xl p-5 space-y-4" style={glass.card}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: '#f9faf3' }}>Living allowance</p>
              <button onClick={() => setPanel('none')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={15} /></button>
            </div>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Automatically send a recurring USDC amount to your beneficiaries while you're active — like a regular payment that proves you care.
            </p>
            {!triggered && (
              <>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: '#94a3b8' }}>Amount per beneficiary</label>
                  <input type="number" min={0} placeholder="0.00 USDC" value={allowAmt} onChange={e => setAllowAmt(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ ...glass.inner, color: '#f9faf3', caretColor: '#acc6e9' }}
                  />
                </div>
                {allowAmt && Number(allowAmt) > 0 && (
                  <IntervalInput value={allowPeriod} onChange={setAllowPeriod} label="How often?" />
                )}
                {allowAmt && Number(allowAmt) > 0 && (
                  <p className="text-xs" style={{ color: '#64748b' }}>
                    Each beneficiary receives {allowAmt} USDC every {formatDuration(allowPeriod)}. Anyone can trigger the release once the period elapses.
                  </p>
                )}
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleSetAllowance}
                  disabled={allowancePending || allowanceConfirming}
                  className="w-full rounded-xl py-3 text-sm font-semibold"
                  style={{ background: '#acc6e9', color: '#0d1b2f', border: 'none', cursor: 'pointer' }}
                >
                  {allowancePending || allowanceConfirming ? 'Saving…' : 'Save allowance settings'}
                </motion.button>
                <TxStatus hash={allowanceHash} isPending={allowancePending} isConfirming={allowanceConfirming} isSuccess={allowanceDone} label="Allowance" />
              </>
            )}
            {vault.allowanceEnabled && (
              <div className="pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                <p className="text-xs mb-2" style={{ color: '#94a3b8' }}>
                  {allowanceCountdown > 0
                    ? `Next payout available in ${formatDuration(allowanceCountdown)}`
                    : 'Ready to send — anyone can trigger this now'}
                </p>
                {!triggered && (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleTriggerAllowance}
                    disabled={triggerAlPending || triggerAlConfirming}
                    className="w-full rounded-xl py-3 text-sm font-semibold"
                    style={{ ...glass.inner, color: '#acc6e9', border: '1px solid rgba(172,198,233,0.25)', cursor: 'pointer' }}
                  >
                    {triggerAlPending || triggerAlConfirming ? 'Sending…' : 'Send allowance now'}
                  </motion.button>
                )}
                <TxStatus hash={triggerAlHash} isPending={triggerAlPending} isConfirming={triggerAlConfirming} isSuccess={triggerAlDone} label="Allowance" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
