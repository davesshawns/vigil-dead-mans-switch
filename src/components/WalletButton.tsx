import { useState } from 'react';
import { ChevronDown, LogOut, RefreshCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useNear } from '@/near/NearProvider';
import { formatAccount } from '@/utils/format';
import { glass, primaryButton } from '@/ui';

export default function WalletButton() {
  const near = useNear();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      await near.connect();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to open the wallet selector.');
    } finally {
      setBusy(false);
    }
  };

  if (!near.connected || !near.accountId) {
    return (
      <button
        onClick={() => void connect()}
        disabled={busy}
        className="rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-2"
        style={{ ...primaryButton, opacity: busy ? 0.7 : 1 }}
      >
        {busy ? <RefreshCw size={13} className="animate-spin" /> : <Wallet size={13} />}
        Connect NEAR
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(value => !value)}
        className="rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-2"
        style={{ ...glass.inner, color: '#f9faf3', cursor: 'pointer' }}
      >
        <span className="mono">{formatAccount(near.accountId, 10, 6)}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-2xl p-2 z-50"
          style={{ ...glass.card, background: 'rgba(13,27,47,0.98)' }}
        >
          <p className="px-3 py-2 text-xs" style={{ color: '#64748b' }}>
            {near.walletName || 'NEAR wallet'} · {near.networkId}
          </p>
          {near.accounts.map(account => (
            <button
              key={account.accountId}
              onClick={() => {
                setOpen(false);
                void near.switchAccount(account.accountId).catch(error => toast.error(error instanceof Error ? error.message : 'Account switch failed.'));
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-xs mono"
              style={{
                background: account.active ? 'rgba(172,198,233,0.12)' : 'transparent',
                border: 'none',
                color: account.active ? '#acc6e9' : '#cbd5e1',
                cursor: 'pointer',
              }}
            >
              {formatAccount(account.accountId, 18, 10)}
            </button>
          ))}
          <button
            onClick={() => { setOpen(false); void connect(); }}
            className="w-full rounded-xl px-3 py-2 text-left text-xs flex items-center gap-2"
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <RefreshCw size={12} /> Switch wallet
          </button>
          <button
            onClick={() => {
              setOpen(false);
              void near.disconnect().catch(error => toast.error(error instanceof Error ? error.message : 'Disconnect failed.'));
            }}
            className="w-full rounded-xl px-3 py-2 text-left text-xs flex items-center gap-2"
            style={{ background: 'transparent', border: 'none', color: '#e86d7a', cursor: 'pointer' }}
          >
            <LogOut size={12} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
