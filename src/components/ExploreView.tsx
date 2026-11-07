import { motion } from 'framer-motion';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useContractAvailability, useVaultCount } from '@/near/hooks';
import { accountExplorerUrl } from '@/near/client';
import { CONTRACT_ID, NEAR_NETWORK_ID } from '@/near/config';
import { fadeUp, glass } from '@/ui';

export default function ExploreView() {
  const availability = useContractAvailability();
  const count = useVaultCount(availability.data === true);
  return (
    <motion.div {...fadeUp} className="space-y-4">
      <div className="rounded-2xl p-6" style={glass.card}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>Registered vaults</p>
        <p className="display text-5xl font-bold" style={{ color: '#f9faf3' }}>{count.data ?? '—'}</p>
        <p className="text-xs mt-2" style={{ color: '#64748b' }}>Native NEAR vault records on {NEAR_NETWORK_ID}</p>
      </div>

      <div className="rounded-2xl p-5 space-y-3" style={glass.card}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} style={{ color: '#acc6e9' }} />
          <p className="text-sm font-semibold" style={{ color: '#f9faf3' }}>Contract authority</p>
        </div>
        <p className="mono text-xs break-all" style={{ color: '#94a3b8' }}>{CONTRACT_ID}</p>
        <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
          Ownership, deadlines, entitlements, claim replay protection, transfers, and storage accounting are enforced by the Rust contract—not this interface.
        </p>
        <a href={accountExplorerUrl(CONTRACT_ID)} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1" style={{ color: '#acc6e9' }}>
          View on NEARBlocks <ExternalLink size={11} />
        </a>
      </div>

      {availability.data === false && (
        <div className="rounded-2xl p-5 text-xs" style={{ ...glass.card, color: '#e9a0aa' }}>
          This prepared contract account is not deployed yet. No live balances or vault states are being fabricated.
        </div>
      )}
    </motion.div>
  );
}
