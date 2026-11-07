import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { useNear } from '@/near/NearProvider';
import { transactionExplorerUrl } from '@/near/client';
import { formatAccount } from '@/utils/format';
import { glass } from '@/ui';

export function ActiveTransaction() {
  const { activeTransaction } = useNear();
  if (!activeTransaction) return null;
  const pending = activeTransaction.phase === 'awaiting-wallet' || activeTransaction.phase === 'finalizing';
  const success = activeTransaction.phase === 'success';
  return (
    <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs" style={glass.inner}>
      {pending && <RefreshCw size={13} className="animate-spin" style={{ color: '#acc6e9', marginTop: 1 }} />}
      {success && <CheckCircle2 size={13} style={{ color: '#8dd89f', marginTop: 1 }} />}
      {activeTransaction.phase === 'failure' && <AlertTriangle size={13} style={{ color: '#e86d7a', marginTop: 1 }} />}
      <div className="min-w-0 flex-1">
        <p style={{ color: success ? '#8dd89f' : activeTransaction.phase === 'failure' ? '#e86d7a' : '#acc6e9' }}>
          {activeTransaction.phase === 'awaiting-wallet' && `Confirm in wallet — ${activeTransaction.label}`}
          {activeTransaction.phase === 'finalizing' && `Waiting for FINAL — ${activeTransaction.label}`}
          {success && `${activeTransaction.label} finalized`}
          {activeTransaction.phase === 'failure' && (activeTransaction.error || `${activeTransaction.label} failed`)}
        </p>
        {activeTransaction.hash && <p className="mono mt-1" style={{ color: '#64748b' }}>{formatAccount(activeTransaction.hash, 12, 8)}</p>}
      </div>
      {activeTransaction.hash && (
        <a href={transactionExplorerUrl(activeTransaction.hash)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={12} style={{ color: '#94a3b8' }} />
        </a>
      )}
    </div>
  );
}

export default function TransactionHistory() {
  const { history, clearHistory } = useNear();
  return (
    <div className="rounded-2xl p-5" style={glass.card}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Recent transactions</p>
        {history.length > 0 && (
          <button onClick={clearHistory} aria-label="Clear local transaction history" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {history.length === 0 ? (
        <p className="text-xs" style={{ color: '#64748b' }}>Confirmed and failed wallet actions will appear here.</p>
      ) : (
        <div className="space-y-2">
          {history.slice(0, 6).map(record => (
            <div key={record.id} className="flex items-center gap-2 text-xs rounded-xl px-3 py-2" style={glass.inner}>
              {record.phase === 'success'
                ? <CheckCircle2 size={12} style={{ color: '#8dd89f' }} />
                : <AlertTriangle size={12} style={{ color: '#e86d7a' }} />}
              <div className="min-w-0 flex-1">
                <p className="truncate" style={{ color: '#cbd5e1' }}>{record.label}</p>
                <p style={{ color: '#64748b' }}>{new Date(record.finalizedAt || record.createdAt).toLocaleString()}</p>
              </div>
              {record.hash && (
                <a href={transactionExplorerUrl(record.hash)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={12} style={{ color: '#94a3b8' }} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
