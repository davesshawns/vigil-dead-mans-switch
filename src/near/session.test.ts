import { describe, expect, it } from 'vitest';
import { isWalletSessionCurrent } from './session';

describe('wallet session race protection', () => {
  it('accepts completion only for the same account generation', () => {
    expect(isWalletSessionCurrent(
      { accountId: 'alice.testnet', generation: 4 },
      { accountId: 'alice.testnet', generation: 4 },
    )).toBe(true);
  });

  it('rejects stale completion after account switching', () => {
    expect(isWalletSessionCurrent(
      { accountId: 'alice.testnet', generation: 4 },
      { accountId: 'bob.testnet', generation: 5 },
    )).toBe(false);
  });
});
