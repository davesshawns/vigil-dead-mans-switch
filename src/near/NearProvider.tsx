import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { actionCreators } from '@near-js/transactions';
import { useWalletSelector } from '@near-wallet-selector/react-hook';
import type { AccountState } from '@near-wallet-selector/core';
import { CONTRACT_ID, NEAR_NETWORK_ID } from './config';
import {
  assertFinalExecutionSuccess,
  describeNearError,
  extractTransactionHash,
  waitForFinalTransaction,
} from './client';
import type { ContractCall, TransactionRecord } from './types';
import { isWalletSessionCurrent, type WalletSession } from './session';

interface NearContextValue {
  accountId: string | null;
  accounts: AccountState[];
  walletName: string | null;
  connected: boolean;
  networkId: string;
  networkOk: boolean;
  activeTransaction: TransactionRecord | null;
  history: TransactionRecord[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchAccount: (accountId: string) => Promise<void>;
  execute: (call: ContractCall) => Promise<TransactionRecord>;
  clearHistory: () => void;
}

const NearContext = createContext<NearContextValue | null>(null);
type SelectorHook = ReturnType<typeof useWalletSelector>;

class AccountChangedAfterFinalizationError extends Error {}

function historyKey(accountId: string): string {
  return `vigil:transactions:${NEAR_NETWORK_ID}:${CONTRACT_ID}:${accountId}`;
}

function readHistory(accountId: string | null): TransactionRecord[] {
  if (!accountId) return [];
  try {
    const value: unknown = JSON.parse(localStorage.getItem(historyKey(accountId)) || '[]');
    return Array.isArray(value) ? (value as TransactionRecord[]).slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writeHistory(accountId: string, records: TransactionRecord[]): void {
  localStorage.setItem(historyKey(accountId), JSON.stringify(records.slice(0, 20)));
}

export function NearProvider({ children }: { children: React.ReactNode }) {
  const selectorHook = useWalletSelector();
  return (
    <NearSessionProvider
      key={selectorHook.signedAccountId || 'disconnected'}
      selectorHook={selectorHook}
    >
      {children}
    </NearSessionProvider>
  );
}

function NearSessionProvider({ children, selectorHook }: {
  children: React.ReactNode;
  selectorHook: SelectorHook;
}) {
  const sessionRef = useRef<WalletSession>({ accountId: selectorHook.signedAccountId, generation: 0 });
  const [accounts, setAccounts] = useState<AccountState[]>([]);
  const [networkId, setNetworkId] = useState<string>(NEAR_NETWORK_ID);
  const [activeTransaction, setActiveTransaction] = useState<TransactionRecord | null>(null);
  const [history, setHistory] = useState<TransactionRecord[]>(() => readHistory(selectorHook.signedAccountId));

  useEffect(() => {
    let storeSubscription: { unsubscribe: () => void } | null = null;
    let networkSubscription: { remove: () => void } | null = null;
    let cancelled = false;

    void selectorHook.walletSelector?.then(selector => {
      if (cancelled) return;
      const syncAccounts = () => setAccounts(selector.store.getState().accounts);
      syncAccounts();
      storeSubscription = selector.store.observable.subscribe(syncAccounts);
      networkSubscription = selector.on('networkChanged', event => setNetworkId(event.networkId));
    });

    return () => {
      cancelled = true;
      storeSubscription?.unsubscribe();
      networkSubscription?.remove();
    };
  }, [selectorHook.walletSelector]);

  const connect = useCallback(async () => {
    const result: unknown = selectorHook.signIn();
    if (result instanceof Promise) await result;
  }, [selectorHook]);

  const disconnect = useCallback(async () => {
    await selectorHook.signOut();
  }, [selectorHook]);

  const switchAccount = useCallback(async (nextAccountId: string) => {
    const selector = await selectorHook.walletSelector;
    if (!selector) throw new Error('Wallet selector is not ready.');
    if (!selector.store.getState().accounts.some(account => account.accountId === nextAccountId)) {
      throw new Error('That account is not connected to the selected wallet.');
    }
    selector.setActiveAccount(nextAccountId);
  }, [selectorHook.walletSelector]);

  const persist = useCallback((record: TransactionRecord) => {
    const next = [record, ...readHistory(record.accountId).filter(item => item.id !== record.id)].slice(0, 20);
    writeHistory(record.accountId, next);
    if (selectorHook.signedAccountId === record.accountId) setHistory(next);
  }, [selectorHook.signedAccountId]);

  const execute = useCallback(async (call: ContractCall): Promise<TransactionRecord> => {
    const signerId = selectorHook.signedAccountId;
    const wallet = selectorHook.wallet;
    if (!signerId || !wallet) throw new Error('Connect a NEAR wallet first.');
    if (networkId !== NEAR_NETWORK_ID) throw new Error(`Switch the wallet network to ${NEAR_NETWORK_ID}.`);

    const initial: TransactionRecord = {
      id: crypto.randomUUID(),
      label: call.label,
      method: call.method,
      accountId: signerId,
      phase: 'awaiting-wallet',
      createdAt: Date.now(),
    };
    const capturedSession = { ...sessionRef.current };
    setActiveTransaction(initial);
    let transactionHash: string | undefined;

    try {
      const submitted = await wallet.signAndSendTransaction({
        signerId,
        receiverId: CONTRACT_ID,
        actions: [actionCreators.functionCall(call.method, call.args || {}, call.gas, call.deposit || 0n)],
      });
      if (!submitted) throw new Error('Wallet returned without a transaction outcome. Verify the wallet activity before retrying.');

      const hash = extractTransactionHash(submitted);
      if (!hash) throw new Error('Wallet returned an outcome without a transaction hash.');
      transactionHash = hash;

      const finalizing: TransactionRecord = { ...initial, hash, phase: 'finalizing' };
      const selector = await selectorHook.walletSelector;
      const currentAccountId = selector?.store.getState().accounts.find(account => account.active)?.accountId || null;
      if (isWalletSessionCurrent(
        capturedSession,
        { ...sessionRef.current, accountId: currentAccountId },
      )) {
        setActiveTransaction(finalizing);
      }

      const finalOutcome = await waitForFinalTransaction(hash, signerId);
      assertFinalExecutionSuccess(finalOutcome);

      const success: TransactionRecord = {
        ...finalizing,
        phase: 'success',
        finalizedAt: Date.now(),
      };
      persist(success);

      const finalAccountId = selector?.store.getState().accounts.find(account => account.active)?.accountId || null;
      if (!isWalletSessionCurrent(
        capturedSession,
        { ...sessionRef.current, accountId: finalAccountId },
      )) {
        throw new AccountChangedAfterFinalizationError(`Transaction finalized for ${signerId}, but the connected account changed. State was not applied to the new account.`);
      }
      setActiveTransaction(success);
      return success;
    } catch (error) {
      if (error instanceof AccountChangedAfterFinalizationError) throw error;
      const message = describeNearError(error);
      const failure: TransactionRecord = {
        ...initial,
        hash: transactionHash,
        phase: 'failure',
        error: message,
        finalizedAt: Date.now(),
      };
      persist(failure);
      const selector = await selectorHook.walletSelector;
      const currentAccountId = selector?.store.getState().accounts.find(account => account.active)?.accountId || null;
      if (isWalletSessionCurrent(
        capturedSession,
        { ...sessionRef.current, accountId: currentAccountId },
      )) {
        setActiveTransaction(failure);
      }
      throw new Error(message);
    }
  }, [networkId, persist, selectorHook.signedAccountId, selectorHook.wallet, selectorHook.walletSelector, sessionRef]);

  const clearHistory = useCallback(() => {
    const accountId = selectorHook.signedAccountId;
    if (!accountId) return;
    localStorage.removeItem(historyKey(accountId));
    setHistory([]);
  }, [selectorHook.signedAccountId]);

  const value = useMemo<NearContextValue>(() => ({
    accountId: selectorHook.signedAccountId,
    accounts,
    walletName: selectorHook.wallet?.metadata.name || null,
    connected: Boolean(selectorHook.signedAccountId && selectorHook.wallet),
    networkId,
    networkOk: networkId === NEAR_NETWORK_ID,
    activeTransaction,
    history,
    connect,
    disconnect,
    switchAccount,
    execute,
    clearHistory,
  }), [
    accounts, activeTransaction, clearHistory, connect, disconnect, execute, history, networkId,
    selectorHook.signedAccountId, selectorHook.wallet, switchAccount,
  ]);

  return <NearContext.Provider value={value}>{children}</NearContext.Provider>;
}

export function useNear(): NearContextValue {
  const context = useContext(NearContext);
  if (!context) throw new Error('useNear must be used inside NearProvider.');
  return context;
}
