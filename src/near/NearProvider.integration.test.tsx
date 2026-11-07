import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WalletButton from '@/components/WalletButton';
import { NearProvider, useNear } from './NearProvider';

const walletMocks = vi.hoisted(() => ({
  useWalletSelector: vi.fn(),
}));

vi.mock('@near-wallet-selector/react-hook', () => ({
  useWalletSelector: walletMocks.useWalletSelector,
}));

function SessionProbe() {
  const near = useNear();
  return <div data-testid="session">{near.accountId || 'disconnected'}</div>;
}

describe('Wallet Selector provider integration', () => {
  beforeEach(() => {
    localStorage.clear();
    walletMocks.useWalletSelector.mockReset();
  });

  it('connects, switches A → B → A, and disconnects without retaining the wrong session', async () => {
    const signIn = vi.fn();
    const signOut = vi.fn().mockResolvedValue(undefined);
    const setActiveAccount = vi.fn();
    let accounts = [
      { accountId: 'alice.testnet', active: true },
      { accountId: 'bob.testnet', active: false },
    ];
    const selector = {
      store: {
        getState: () => ({ accounts }),
        observable: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) },
      },
      on: vi.fn(() => ({ remove: vi.fn() })),
      setActiveAccount,
    };
    const wallet = {
      metadata: { name: 'Test Wallet' },
      signAndSendTransaction: vi.fn(),
    };

    let signedAccountId: string | null = null;
    walletMocks.useWalletSelector.mockImplementation(() => ({
      signedAccountId,
      wallet: signedAccountId ? wallet : null,
      walletSelector: Promise.resolve(selector),
      signIn,
      signOut,
    }));

    const view = render(
      <NearProvider>
        <SessionProbe />
        <WalletButton />
      </NearProvider>,
    );

    expect(screen.getByTestId('session')).toHaveTextContent('disconnected');
    fireEvent.click(screen.getByRole('button', { name: /connect near/i }));
    expect(signIn).toHaveBeenCalledTimes(1);

    signedAccountId = 'alice.testnet';
    view.rerender(
      <NearProvider>
        <SessionProbe />
        <WalletButton />
      </NearProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('alice.testnet'));
    fireEvent.click(screen.getByRole('button', { name: /alice/i }));
    await screen.findByRole('button', { name: /bob/i });
    fireEvent.click(screen.getByRole('button', { name: /bob/i }));
    await waitFor(() => expect(setActiveAccount).toHaveBeenCalledWith('bob.testnet'));

    accounts = [
      { accountId: 'alice.testnet', active: false },
      { accountId: 'bob.testnet', active: true },
    ];
    signedAccountId = 'bob.testnet';
    view.rerender(
      <NearProvider>
        <SessionProbe />
        <WalletButton />
      </NearProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('bob.testnet'));

    accounts = [
      { accountId: 'alice.testnet', active: true },
      { accountId: 'bob.testnet', active: false },
    ];
    signedAccountId = 'alice.testnet';
    view.rerender(
      <NearProvider>
        <SessionProbe />
        <WalletButton />
      </NearProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('alice.testnet'));

    fireEvent.click(screen.getByRole('button', { name: /alice/i }));
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
