import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Users, Eye } from 'lucide-react';
import VaultDashboard from '@/components/VaultDashboard';
import BeneficiaryView from '@/components/BeneficiaryView';
import { VAULT_REGISTRY, CHAIN_ID } from '@/contract';
import { formatAddress } from '@/utils/format';

const tabs = [
  { id: 'vault', label: 'My Vault', icon: Shield },
  { id: 'beneficiary', label: 'Claim', icon: Users },
  { id: 'explore', label: 'Explore', icon: Eye },
] as const;

type Tab = (typeof tabs)[number]['id'];

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] },
};

export default function App() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>('vault');

  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #0d1b2f 0%, #0f2540 55%, #122d45 100%)' }}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{ position: 'absolute', top: '6%', left: '10%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,140,220,0.13) 0%, transparent 70%)', filter: 'blur(70px)' }} />
        <div style={{ position: 'absolute', bottom: '12%', right: '6%', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(172,198,233,0.09) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-md px-4 pb-24 pt-6">
        {/* Header */}
        <motion.header
          className="mb-8 flex items-center justify-between"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div>
            <div className="flex items-center gap-2">
              {/* Logo mark */}
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #acc6e9 0%, #7aa8d8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={15} color="#0d1b2f" strokeWidth={2.5} />
              </div>
              <span className="display text-xl font-bold" style={{ color: '#f9faf3', letterSpacing: '-0.03em' }}>
                Vigil
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>USDC inheritance vault</p>
          </div>
          <ConnectKitButton />
        </motion.header>

        {/* Hero copy (only before connect) */}
        <AnimatePresence mode="wait">
          {!isConnected && (
            <motion.div key="hero" {...fadeUp} className="mb-8 text-center py-10">
              <div
                className="mx-auto mb-5 flex items-center justify-center"
                style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(172,198,233,0.12)', border: '1.5px solid rgba(172,198,233,0.22)' }}
              >
                <Shield size={34} style={{ color: '#acc6e9' }} strokeWidth={1.8} />
              </div>
              <h1 className="display text-3xl font-bold mb-3" style={{ color: '#f9faf3', letterSpacing: '-0.04em' }}>
                Your funds.<br />On your terms.
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: '#94a3b8', maxWidth: '26ch', margin: '0 auto' }}>
                Set a check-in schedule. If you go silent, your USDC finds the right hands automatically.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content */}
        <AnimatePresence mode="wait">
          {isConnected ? (
            <motion.div key="app" {...fadeUp}>
              <AnimatePresence mode="wait">
                {tab === 'vault' && <motion.div key="vault" {...fadeUp}><VaultDashboard /></motion.div>}
                {tab === 'beneficiary' && <motion.div key="beneficiary" {...fadeUp}><BeneficiaryView /></motion.div>}
                {tab === 'explore' && <motion.div key="explore" {...fadeUp}><ExploreView /></motion.div>}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div key="cta" {...fadeUp} className="mt-4 flex justify-center">
              <ConnectKitButton label="Connect wallet to get started" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom tab bar — only when connected */}
      <AnimatePresence>
        {isConnected && (
          <motion.nav
            key="tabs"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 pb-safe"
            style={{
              background: 'rgba(13,27,47,0.88)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
              paddingTop: 10,
            }}
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <motion.button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  whileTap={{ scale: 0.92 }}
                  className="flex flex-col items-center gap-0.5 px-5 py-1 rounded-xl transition-colors"
                  style={{ color: active ? '#acc6e9' : '#64748b', background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 60 }}
                >
                  <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                  <span className="text-xs font-medium" style={{ letterSpacing: '0.01em' }}>{t.label}</span>
                  {active && (
                    <motion.div
                      layoutId="tab-pill"
                      className="absolute bottom-0 h-0.5 w-8 rounded-full"
                      style={{ background: '#acc6e9' }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                </motion.button>
              );
            })}
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Explore view (simple vault counter) ──────────────────────────────────────

function ExploreView() {
  const { data: count } = useReadContract({
    ...VAULT_REGISTRY,
    functionName: 'vaultCount',
    chainId: CHAIN_ID,
  });

  const { data: firstOwner } = useReadContract({
    ...VAULT_REGISTRY,
    functionName: 'vaultOwners',
    args: [0n],
    chainId: CHAIN_ID,
  });

  const countBig = count as bigint | undefined;

  return (
    <motion.div {...fadeUp} className="space-y-4">
      <div
        className="rounded-2xl p-6"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>
          Active Vaults
        </p>
        <p className="display text-5xl font-bold tabular" style={{ color: '#f9faf3', letterSpacing: '-0.04em' }}>
          {countBig !== undefined ? countBig.toString() : '—'}
        </p>
        <p className="text-xs mt-2" style={{ color: '#64748b' }}>
          Vaults registered on Arc Mainnet
        </p>
      </div>

      {typeof firstOwner === 'string' && firstOwner !== '0x0000000000000000000000000000000000000000' && (
        <div
          className="rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#94a3b8' }}>
            First Vault Owner
          </p>
          <span className="mono text-sm" style={{ color: '#cbd5e1' }}>{formatAddress(firstOwner)}</span>
        </div>
      )}
    </motion.div>
  );
}
