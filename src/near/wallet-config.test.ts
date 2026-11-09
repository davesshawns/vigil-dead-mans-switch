import { describe, expect, it } from 'vitest';
import type { Network } from '@near-wallet-selector/core';
import { NEAR_NETWORK_ID, NEAR_RPC_URL, walletSelectorConfig } from './config';

describe('wallet selector configuration', () => {
  it('targets NEAR Testnet', () => {
    const network = walletSelectorConfig.network as Network;
    expect(network.networkId).toBe(NEAR_NETWORK_ID);
    expect(network.nodeUrl).toBe(NEAR_RPC_URL);
    expect(network.helperUrl).toBe('https://helper.testnet.near.org');
    expect(network.explorerUrl).toBe('https://testnet.nearblocks.io');
    expect(network.indexerUrl).toBe('https://api.testnet.near.org');
  });

  it('registers MyNearWallet, Meteor Wallet, Here Wallet, and Sender modules', () => {
    expect(walletSelectorConfig.modules).toHaveLength(4);
    for (const moduleFactory of walletSelectorConfig.modules) {
      expect(typeof moduleFactory).toBe('function');
    }
  });
});
