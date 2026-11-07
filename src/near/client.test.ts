import { describe, expect, it } from 'vitest';
import {
  assertFinalExecutionSuccess,
  describeNearError,
  extractTransactionHash,
  formatNear,
  intervalSecondsToNanoseconds,
  isUnknownAccountError,
  isValidNearAccountId,
  parseNearInput,
} from './client';

function successfulOutcome(): {
  final_execution_status: string;
  status: unknown;
  transaction: { hash: string };
  receipts_outcome: Array<{ outcome: { status: unknown } }>;
} {
  return {
    final_execution_status: 'FINAL',
    status: { SuccessValue: '' },
    transaction: { hash: 'ExampleHash' },
    receipts_outcome: [
      { outcome: { status: { SuccessValue: '' } } },
      { outcome: { status: { SuccessReceiptId: 'receipt' } } },
    ],
  };
}

describe('NEAR transaction verification', () => {
  it('accepts only a final outcome whose receipts all succeeded', () => {
    const outcome = successfulOutcome();
    expect(() => assertFinalExecutionSuccess(outcome)).not.toThrow();
    expect(extractTransactionHash(outcome)).toBe('ExampleHash');
  });

  it('rejects a detached failed transfer receipt even when the root call succeeded', () => {
    const outcome = successfulOutcome();
    outcome.receipts_outcome.push({
      outcome: { status: { Failure: { error_message: 'account does not exist', error_type: 'ActionError' } } },
    });
    expect(() => assertFinalExecutionSuccess(outcome)).toThrow('account does not exist');
  });

  it('does not treat a non-final result as success', () => {
    const outcome = successfulOutcome();
    outcome.final_execution_status = 'EXECUTED';
    expect(() => assertFinalExecutionSuccess(outcome)).toThrow('did not reach FINAL');
  });
});

describe('NEAR values and contract inputs', () => {
  it('parses exact decimal NEAR values without floating point arithmetic', () => {
    expect(parseNearInput('1.25')).toBe(1_250_000_000_000_000_000_000_000n);
    expect(formatNear(parseNearInput('1.25'))).toBe('1.25');
    expect(() => parseNearInput('0')).toThrow('greater than zero');
    expect(() => parseNearInput('1.0000000000000000000000001')).toThrow('valid NEAR');
  });

  it('validates testnet account identifiers used for beneficiaries', () => {
    expect(isValidNearAccountId('dragon-beneficiary1.testnet')).toBe(true);
    expect(isValidNearAccountId('alice.near')).toBe(true);
    expect(isValidNearAccountId('Alice.testnet')).toBe(false);
    expect(isValidNearAccountId('bad..testnet')).toBe(false);
  });

  it('converts supported schedule seconds to exact nanoseconds', () => {
    expect(intervalSecondsToNanoseconds(300)).toBe(300_000_000_000);
  });

  it('maps contract and wallet failures to meaningful messages', () => {
    expect(describeNearError(new Error('Smart contract panicked: AlreadyClaimed'))).toBe('Already Claimed');
    expect(describeNearError(new Error('User rejected request'))).toBe('Wallet request was cancelled.');
  });

  it('distinguishes a missing contract account from an unrelated RPC failure', () => {
    expect(isUnknownAccountError({ name: 'UNKNOWN_ACCOUNT', cause: 'missing' })).toBe(true);
    expect(isUnknownAccountError(new Error('account does not exist while viewing'))).toBe(true);
    expect(isUnknownAccountError(new Error('503 upstream unavailable'))).toBe(false);
    expect(isUnknownAccountError(undefined)).toBe(false);
  });
});
