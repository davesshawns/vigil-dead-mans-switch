import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InjectedWallet, WalletModuleFactory } from '@near-wallet-selector/core';
import { useWalletSelector, WalletSelectorProvider, type SetupParams } from '@near-wallet-selector/react-hook';
import { describe, expect, it } from 'vitest';
import WalletButton from '@/components/WalletButton';
import { NearProvider, useNear } from './NearProvider';

const accounts = [
  { accountId: 'alice.testnet' },
  { accountId: 'bob.testnet' },
];

const walletModule = (() => Promise.resolve({
  id: 'vigil-test-wallet',
  type: 'injected',
  metadata: {
    name: 'Vigil Test Wallet',
    description: 'In-memory Wallet Selector integration wallet',
    iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    deprecated: false,
    available: true,
    downloadUrl: 'https://example.invalid',
  },
  init: () => Promise.resolve({
    signIn: () => Promise.resolve(accounts),
    signOut: () => Promise.resolve(),
    getAccounts: () => Promise.resolve(accounts),
    verifyOwner: () => Promise.resolve(undefined),
    signAndSendTransaction: () => Promise.reject(new Error('Transactions are not used in this test.')),
    signAndSendTransactions: () => Promise.reject(new Error('Transactions are not used in this test.')),
  }),
})) as unknown as WalletModuleFactory;

function SessionProbe() {
  const near = useNear();
  return <div data-testid="real-session">{near.accountId || 'disconnected'}</div>;
}

function WalletTestControls() {
  const selectorHook = useWalletSelector();
  return (
    <button
      onClick={() => {
        void selectorHook.walletSelector
          ?.then(selector => selector.wallet<InjectedWallet>('vigil-test-wallet'))
          .then(wallet => wallet.signIn({ contractId: 'vigil.testnet' }));
      }}
    >
      Sign in test wallet
    </button>
  );
}

describe('real Wallet Selector session integration', () => {
  it('propagates connect, A → B → A switching, and disconnect through the real selector store', async () => {
    const config: SetupParams = {
      network: {
        networkId: 'testnet',
        nodeUrl: 'https://rpc.testnet.near.org',
        helperUrl: 'https://helper.testnet.near.org',
        explorerUrl: 'https://testnet.nearblocks.io',
        indexerUrl: 'https://api.testnet.near.org',
      },
      modules: [walletModule],
      optimizeWalletOrder: false,
    };

    render(
      <WalletSelectorProvider config={config}>
        <NearProvider>
          <SessionProbe />
          <WalletButton />
          <WalletTestControls />
        </NearProvider>
      </WalletSelectorProvider>,
    );

    expect(screen.getByTestId('real-session')).toHaveTextContent('disconnected');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in test wallet' }));
    await waitFor(() => expect(screen.getByTestId('real-session')).toHaveTextContent('alice.testnet'));

    fireEvent.click(screen.getByRole('button', { name: /alice/i }));
    fireEvent.click(await screen.findByRole('button', { name: /bob/i }));
    await waitFor(() => expect(screen.getByTestId('real-session')).toHaveTextContent('bob.testnet'));

    fireEvent.click(screen.getByRole('button', { name: /bob/i }));
    fireEvent.click(await screen.findByRole('button', { name: /alice/i }));
    await waitFor(() => expect(screen.getByTestId('real-session')).toHaveTextContent('alice.testnet'));

    fireEvent.click(screen.getByRole('button', { name: /alice/i }));
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    await waitFor(() => expect(screen.getByTestId('real-session')).toHaveTextContent('disconnected'));
  });
});
