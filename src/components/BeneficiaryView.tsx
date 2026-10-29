import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Search, Users, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, Zap } from 'lucide-react';
import { VAULT_REGISTRY, CHAIN_ID, CHAIN, USDC } from '@/contract';
import { formatToken, formatDuration, formatAddress, parseOnchainError } from '@/utils/format';
import { useCountdown } from '@/hooks/useCountdown';

const glass = {
  card: {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.10)',
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

export default function BeneficiaryView() {
  const { address: connectedAddress } = useAccount();
  const [ownerInput, setOwnerInput] = useState('');
  const [lookupOwner, setLookupOwner] = useState('');

  const tokenDecimals = USDC.decimals;

  // ── reads ─────────────────────────────────────────────────────────────────
  const { data: vaultData } = useReadContract({
    ...VAULT_REGISTRY,
    functionName: 'getVault',
    args: [lookupOwner as `0x${string}`],
    chainId: CHAIN_ID,
    query: { enabled: lookupOwner.length === 42 },
  });

  const { data: beneficiariesData, refetch: refetchBene } = useReadContract({
    ...VAULT_REGISTRY,
    functionName: 'getBeneficiaries',
    args: [lookupOwner as `0x${string}`],
    chainId: CHAIN_ID,
    query: { enabled: lookupOwner.length === 42 },
  });

  const { data: vaultBal, refetch: refetchBal } = useReadContract({
    ...VAULT_REGISTRY,
    functionName: 'vaultBalance',
    args: [lookupOwner as `0x${string}`],
    chainId: CHAIN_ID,
    query: { enabled: lookupOwner.length === 42 },
  });

  // ── derived ───────────────────────────────────────────────────────────────
  const hasVault = !!vaultData && (vaultData as unknown[])[0] !== '0x0000000000000000000000000000000000000000';
  const vault = hasVault ? {
    token: (vaultData as unknown[])[0] as string,
    checkInInterval: (vaultData as unknown[])[1] as bigint,
    lastPing: (vaultData as unknown[])[2] as bigint,
    active: (vaultData as unknown[])[3] as boolean,
    isTriggered: (vaultData as unknown[])[4] as boolean,
    totalDeposited: (vaultData as unknown[])[5] as bigint,
    fallbackWallet: (vaultData as unknown[])[6] as string,
    allowanceAmount: (vaultData as unknown[])[7] as bigint,
    allowancePeriod: (vaultData as unknown[])[8] as bigint,
    lastAllowanceRelease: (vaultData as unknown[])[9] as bigint,
    allowanceEnabled: (vaultData as unknown[])[10] as boolean,
  } : null;

  const balance = vaultBal as bigint | undefined;
  const beneficiaries = Array.isArray(beneficiariesData)
    ? (beneficiariesData as Array<{ wallet: string; basisPoints: number; claimed: boolean }>)
    : [];

  const myEntry = beneficiaries.find(b => b.wallet.toLowerCase() === connectedAddress?.toLowerCase());
  const myShare = myEntry ? (myEntry.basisPoints / 100).toFixed(1) : null;
  const myAmount = myEntry && vault
    ? (vault.totalDeposited * BigInt(myEntry.basisPoints)) / 10_000n
    : null;

  const isFallback = connectedAddress && vault?.fallbackWallet
    ? vault.fallbackWallet.toLowerCase() === connectedAddress.toLowerCase()
    : false;

  const fallbackCountdown = useCountdown(vault?.lastPing, vault ? vault.checkInInterval * 2n : undefined);
  const fallbackWindowOpen = !!(vault?.isTriggered) && fallbackCountdown === 0;

  const allowanceCountdown = useCountdown(vault?.lastAllowanceRelease, vault?.allowancePeriod);

  // ── writes ────────────────────────────────────────────────────────────────
  const { writeContract: doClaim, data: claimHash, isPending: claimPending } = useWriteContract();
  const { isLoading: claimConfirming, isSuccess: claimDone } = useWaitForTransactionReceipt({ hash: claimHash });

  const { writeContract: doFallback, data: fallbackHash, isPending: fallbackPending } = useWriteContract();
  const { isLoading: fallbackConfirming, isSuccess: fallbackDone } = useWaitForTransactionReceipt({ hash: fallbackHash });

  const { writeContract: doRelease, data: releaseHash, isPending: releasePending } = useWriteContract();
  const { isLoading: releaseConfirming, isSuccess: releaseDone } = useWaitForTransactionReceipt({ hash: releaseHash });

  const handleClaim = () => {
    doClaim({
      ...VAULT_REGISTRY,
      functionName: 'claim',
      args: [lookupOwner as `0x${string}`],
      chainId: CHAIN_ID,
    }, {
      onSuccess: () => { toast.success('Claimed successfully'); void refetchBal(); void refetchBene(); },
      onError: (e) => { toast.error(parseOnchainError(e)); },
    });
  };

  const handleFallbackClaim = () => {
    doFallback({
      ...VAULT_REGISTRY,
      functionName: 'fallbackClaim',
      args: [lookupOwner as `0x${string}`],
      chainId: CHAIN_ID,
    }, {
      onSuccess: () => { toast.success('Fallback sweep complete'); void refetchBal(); },
      onError: (e) => { toast.error(parseOnchainError(e)); },
    });
  };

  const handleReleaseAllowance = () => {
    doRelease({
      ...VAULT_REGISTRY,
      functionName: 'releaseAllowance',
      args: [lookupOwner as `0x${string}`],
      chainId: CHAIN_ID,
    }, {
      onSuccess: () => { toast.success('Allowance released'); void refetchBal(); },
      onError: (e) => { toast.error(parseOnchainError(e)); },
    });
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <motion.div {...fadeUp} className="rounded-2xl overflow-hidden" style={glass.card}>
        <div className="h-1 spectral" />
        <div className="p-5">
          <p className="text-sm font-semibold mb-3" style={{ color: '#f9faf3' }}>Look up a vault</p>
          <div className="flex gap-2">
            <input
              placeholder="Vault owner address (0x…)"
              value={ownerInput}
              onChange={e => setOwnerInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setLookupOwner(ownerInput)}
              className="flex-1 rounded-xl px-3 py-2 text-sm mono outline-none"
              style={{ ...glass.inner, color: '#f9faf3', caretColor: '#acc6e9' }}
            />
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setLookupOwner(ownerInput)}
              className="rounded-xl px-4 py-2"
              style={{ background: '#acc6e9', color: '#0d1b2f', border: 'none', cursor: 'pointer' }}
            >
              <Search size={15} />
            </motion.button>
          </div>
          {connectedAddress && (
            <button
              onClick={() => { setOwnerInput(connectedAddress); setLookupOwner(connectedAddress); }}
              className="text-xs mt-2"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              Use my address
            </button>
          )}
        </div>
      </motion.div>

      {/* Result */}
      <AnimatePresence mode="wait">
        {lookupOwner && !hasVault && lookupOwner.length === 42 && (
          <motion.div key="no-vault" {...fadeUp} className="rounded-2xl p-5 text-center" style={glass.card}>
            <p className="text-sm" style={{ color: '#94a3b8' }}>No vault found for this address.</p>
          </motion.div>
        )}

        {hasVault && vault && (
          <motion.div key="vault-info" {...fadeUp} className="space-y-3">
            {/* Vault status card */}
            <div className="rounded-2xl p-5 space-y-3" style={glass.card}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Vault</p>
                <span
                  className="text-xs font-semibold rounded-full px-3 py-1"
                  style={vault.isTriggered
                    ? { background: 'rgba(232,109,122,0.15)', color: '#e86d7a' }
                    : { background: 'rgba(141,216,159,0.12)', color: '#8dd89f' }}
                >
                  {vault.isTriggered ? 'Triggered' : 'Active'}
                </span>
              </div>
              <p className="mono text-xs" style={{ color: '#64748b' }}>{formatAddress(lookupOwner)}</p>
              <p className="display text-3xl font-bold tabular" style={{ color: '#f9faf3', letterSpacing: '-0.03em' }}>
                {balance !== undefined ? formatToken(balance, tokenDecimals) : '—'}
                <span className="text-base ml-1.5 font-semibold" style={{ color: '#94a3b8' }}>USDC</span>
              </p>
              <p className="text-xs" style={{ color: '#64748b' }}>
                Check-in every {formatDuration(Number(vault.checkInInterval))}
              </p>
            </div>

            {/* My share */}
            {myEntry && (
              <motion.div {...fadeUp} className="rounded-2xl p-5 space-y-3" style={glass.card}>
                <div className="flex items-center gap-2">
                  <Users size={14} style={{ color: '#acc6e9' }} />
                  <p className="text-sm font-semibold" style={{ color: '#f9faf3' }}>Your Share</p>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="display text-2xl font-bold tabular" style={{ color: '#f9faf3' }}>
                      {myAmount !== null ? formatToken(myAmount, tokenDecimals) : '—'} USDC
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{myShare}% of vault</p>
                  </div>
                  {myEntry.claimed && (
                    <span className="text-xs font-semibold flex items-center gap-1" style={{ color: '#8dd89f' }}>
                      <CheckCircle2 size={13} /> Claimed
                    </span>
                  )}
                </div>

                {vault.isTriggered && !myEntry.claimed && (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleClaim}
                    disabled={claimPending || claimConfirming}
                    className="w-full rounded-xl py-3 text-sm font-semibold"
                    style={{ background: '#acc6e9', color: '#0d1b2f', border: 'none', cursor: 'pointer' }}
                  >
                    {claimPending || claimConfirming
                      ? <span className="flex items-center justify-center gap-2"><RefreshCw size={13} className="animate-spin" /> Claiming…</span>
                      : 'Claim My Share'}
                  </motion.button>
                )}

                {!vault.isTriggered && (
                  <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={glass.inner}>
                    <AlertTriangle size={12} style={{ color: '#ffcd83' }} />
                    <span style={{ color: '#94a3b8' }}>Vault hasn't triggered yet — claims are not available.</span>
                  </div>
                )}

                <TxStatus hash={claimHash} isPending={claimPending} isConfirming={claimConfirming} isSuccess={claimDone} label="Claim" />
              </motion.div>
            )}

            {/* Fallback sweep */}
            {isFallback && (
              <motion.div {...fadeUp} className="rounded-2xl p-5 space-y-3" style={glass.card}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>Fallback Wallet</p>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  {fallbackWindowOpen
                    ? `You can sweep all remaining USDC as the fallback wallet.`
                    : `Fallback window opens in ${formatDuration(fallbackCountdown)}.`}
                </p>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleFallbackClaim}
                  disabled={!fallbackWindowOpen || fallbackPending || fallbackConfirming}
                  className="w-full rounded-xl py-3 text-sm font-semibold"
                  style={fallbackWindowOpen
                    ? { background: '#acc6e9', color: '#0d1b2f', border: 'none', cursor: 'pointer' }
                    : { background: 'rgba(172,198,233,0.15)', color: '#64748b', border: 'none', cursor: 'not-allowed' }}
                >
                  {fallbackPending || fallbackConfirming ? 'Sweeping…' : 'Sweep Remaining Funds'}
                </motion.button>
                <TxStatus hash={fallbackHash} isPending={fallbackPending} isConfirming={fallbackConfirming} isSuccess={fallbackDone} label="Fallback sweep" />
              </motion.div>
            )}

            {/* Allowance release */}
            {vault.allowanceEnabled && beneficiaries.length > 0 && !vault.isTriggered && (
              <motion.div {...fadeUp} className="rounded-2xl p-5 space-y-3" style={glass.card}>
                <div className="flex items-center gap-2">
                  <Zap size={14} style={{ color: '#acc6e9' }} />
                  <p className="text-sm font-semibold" style={{ color: '#f9faf3' }}>Living Allowance</p>
                </div>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  {formatToken(vault.allowanceAmount, tokenDecimals)} USDC per beneficiary every {formatDuration(Number(vault.allowancePeriod))}.
                </p>
                <p className="text-xs" style={{ color: allowanceCountdown === 0 ? '#8dd89f' : '#64748b' }}>
                  {allowanceCountdown === 0 ? 'Ready to release now' : `Next release in ${formatDuration(allowanceCountdown)}`}
                </p>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleReleaseAllowance}
                  disabled={allowanceCountdown > 0 || releasePending || releaseConfirming}
                  className="w-full rounded-xl py-3 text-sm font-semibold"
                  style={allowanceCountdown === 0
                    ? { background: '#acc6e9', color: '#0d1b2f', border: 'none', cursor: 'pointer' }
                    : { background: 'rgba(172,198,233,0.15)', color: '#64748b', border: 'none', cursor: 'not-allowed' }}
                >
                  {releasePending || releaseConfirming ? 'Releasing…' : 'Release Allowance'}
                </motion.button>
                <TxStatus hash={releaseHash} isPending={releasePending} isConfirming={releaseConfirming} isSuccess={releaseDone} label="Allowance" />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
