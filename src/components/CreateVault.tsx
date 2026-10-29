import { useState } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseUnits } from 'viem';
import { toast } from 'sonner';
import { Shield, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { VAULT_REGISTRY, CHAIN_ID, USDC } from '../contract';
import { parseOnchainError } from '../utils/format';

const glass = {
  card: {
    background: 'var(--surface)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid var(--border)',
    borderRadius: '24px',
    padding: '24px',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    padding: '16px',
  } as React.CSSProperties,
};

const INTERVAL_PRESETS = [
  { label: '2 min (demo)', value: 120 },
  { label: '1 day', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: '30 days', value: 2592000 },
  { label: '90 days', value: 7776000 },
];

const ALLOWANCE_PERIOD_PRESETS = [
  { label: 'Weekly', value: 604800 },
  { label: 'Monthly', value: 2592000 },
  { label: 'Quarterly', value: 7776000 },
];

interface Props {
  onCreated: () => void;
  walletChainId: number | undefined;
}

export default function CreateVault({ onCreated, walletChainId }: Props) {
  const { switchChain } = useSwitchChain();
  const isWrongChain = walletChainId !== CHAIN_ID;

  // Token choice
  const [tokenMode, setTokenMode] = useState<'usdc' | 'custom'>('usdc');
  const [customToken, setCustomToken] = useState('');
  const tokenAddress = tokenMode === 'usdc' ? USDC.address : customToken;

  // Interval
  const [intervalPreset, setIntervalPreset] = useState(604800);
  const [customInterval, setCustomInterval] = useState('');
  const intervalSecs = customInterval ? parseInt(customInterval) : intervalPreset;

  // Allowance (optional)
  const [showAllowance, setShowAllowance] = useState(false);
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [allowancePeriod, setAllowancePeriod] = useState(2592000);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  if (isSuccess) {
    toast.success('Vault created!');
    onCreated();
  }

  const handleCreate = () => {
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return; }
    if (!tokenAddress || tokenAddress.length !== 42) { toast.error('Enter a valid token address.'); return; }
    if (intervalSecs < 60) { toast.error('Interval must be at least 60 seconds.'); return; }

    let parsedAllowance = 0n;
    let parsedPeriod = 0n;
    if (showAllowance && allowanceAmount) {
      try {
        parsedAllowance = parseUnits(allowanceAmount, 6);
        parsedPeriod = BigInt(allowancePeriod);
      } catch {
        toast.error('Invalid allowance amount.');
        return;
      }
    }

    writeContract({
      ...VAULT_REGISTRY,
      functionName: 'createVault',
      args: [tokenAddress as `0x${string}`, BigInt(intervalSecs), parsedAllowance, parsedPeriod],
      chainId: CHAIN_ID,
    }, {
      onError: (e) => toast.error(parseOnchainError(e)),
    });
  };

  const busy = isPending || isConfirming;

  return (
    <div className="min-h-dvh px-4 py-8 flex items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
      <div className="w-full max-w-md space-y-4">
        <div className="text-center mb-2">
          <div className="inline-flex size-14 items-center justify-center rounded-2xl mb-3" style={{ background: 'var(--surface-muted)' }}>
            <Shield size={28} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Create Your Vault</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>A personal dead man's switch. Anyone can create one vault per wallet.</p>
        </div>

        <div style={glass.card} className="space-y-4">
          {/* Token */}
          <div style={glass.inner}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Token</p>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setTokenMode('usdc')}
                className="flex-1 rounded-xl py-2 text-sm font-semibold transition-all"
                style={{ background: tokenMode === 'usdc' ? 'var(--accent)' : 'var(--surface-muted)', color: tokenMode === 'usdc' ? '#fff' : 'var(--ink)', border: '1px solid var(--border)' }}
              >USDC</button>
              <button
                onClick={() => setTokenMode('custom')}
                className="flex-1 rounded-xl py-2 text-sm font-semibold transition-all"
                style={{ background: tokenMode === 'custom' ? 'var(--accent)' : 'var(--surface-muted)', color: tokenMode === 'custom' ? '#fff' : 'var(--ink)', border: '1px solid var(--border)' }}
              >Custom ERC-20</button>
            </div>
            {tokenMode === 'custom' && (
              <input
                placeholder="0x token address..."
                value={customToken}
                onChange={e => setCustomToken(e.target.value)}
                className="mono w-full bg-transparent text-xs outline-none placeholder:text-slate-300 mt-1"
                style={{ color: 'var(--ink)' }}
              />
            )}
            {tokenMode === 'usdc' && (
              <p className="text-xs mono" style={{ color: 'var(--subtle)' }}>{USDC.address}</p>
            )}
          </div>

          {/* Check-in interval */}
          <div style={glass.inner}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>Check-in interval</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {INTERVAL_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => { setIntervalPreset(p.value); setCustomInterval(''); }}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
                  style={{ background: (intervalPreset === p.value && !customInterval) ? 'var(--accent)' : 'var(--surface-muted)', color: (intervalPreset === p.value && !customInterval) ? '#fff' : 'var(--ink)', border: '1px solid var(--border)' }}
                >{p.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Custom seconds..."
                value={customInterval}
                min={60}
                onChange={e => setCustomInterval(e.target.value)}
                className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-300"
                style={{ color: 'var(--ink)' }}
              />
              <span className="text-xs shrink-0" style={{ color: 'var(--subtle)' }}>seconds</span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
              Must ping at least once every {intervalSecs >= 86400 ? `${Math.floor(intervalSecs / 86400)}d` : `${intervalSecs}s`} to keep vault locked.
            </p>
          </div>

          {/* Monthly allowance (optional) */}
          <div style={glass.inner}>
            <button
              onClick={() => setShowAllowance(v => !v)}
              className="flex w-full items-center justify-between"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-left" style={{ color: 'var(--muted)' }}>Living Allowance</p>
                <p className="text-xs text-left mt-0.5" style={{ color: 'var(--subtle)' }}>Optional — drip tokens to beneficiaries while active</p>
              </div>
              {showAllowance ? <ChevronUp size={16} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--muted)' }} />}
            </button>
            {showAllowance && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={allowanceAmount}
                    min={0}
                    step="0.01"
                    onChange={e => setAllowanceAmount(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-bold tabular-nums outline-none placeholder:text-slate-300"
                    style={{ color: 'var(--ink)' }}
                  />
                  <span className="text-xs font-medium shrink-0" style={{ color: 'var(--subtle)' }}>per beneficiary</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALLOWANCE_PERIOD_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setAllowancePeriod(p.value)}
                      className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
                      style={{ background: allowancePeriod === p.value ? 'var(--accent)' : 'var(--surface-muted)', color: allowancePeriod === p.value ? '#fff' : 'var(--ink)', border: '1px solid var(--border)' }}
                    >{p.label}</button>
                  ))}
                </div>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                  After adding beneficiaries, each receives {allowanceAmount || '?'} {tokenMode === 'usdc' ? 'USDC' : 'tokens'} every {allowancePeriod === 604800 ? 'week' : allowancePeriod === 2592000 ? 'month' : 'quarter'}.
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleCreate}
            disabled={busy || (!tokenAddress)}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {busy
              ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />{isPending ? 'Confirm in wallet…' : 'Creating vault…'}</span>
              : isWrongChain ? 'Switch to Arc Testnet'
              : 'Create My Vault'}
          </button>
        </div>
      </div>
    </div>
  );
}
