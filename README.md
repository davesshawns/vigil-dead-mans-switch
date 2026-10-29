# Vigil — USDC Dead Man's Switch

Vigil is a multi-vault USDC dead man's switch on Arc. Any wallet creates a personal vault, deposits USDC, and assigns beneficiaries with percentage shares. If the owner misses a check-in deadline, beneficiaries can claim automatically. An optional living allowance drips USDC to beneficiaries on a schedule while the owner is still active.

Built with [Arc Studio](https://studio.arc.io)

## Tech Stack

- React 18, Vite, TypeScript, Tailwind CSS
- wagmi v2, viem v2, ConnectKit
- Solidity 0.8.28, Foundry (forge)

## Prerequisites

- Node.js 18+ and bun
- A browser wallet (MetaMask, Coinbase Wallet, etc.)
- Testnet USDC on Arc Testnet (use the "Get test USDC" button in Arc Studio sidebar)

## Development

```bash
bun install
bun run dev
```

## Build

```bash
bun install --frozen-lockfile
bun run build
```

For Vercel, use the Vite preset, `bun run build` as the build command, and
`dist` as the output directory. Frontend builds use the checked-in
`src/abi/VaultRegistry.json` and do not require Foundry or `contracts/out`.

The ABI is exported from `contracts/VaultRegistry.sol` and includes its
functions, events, constructor, and custom errors. Deployment metadata is not
the frontend ABI source: the deployment scripts can rewrite that metadata
without preserving its ABI.

After changing the contract interface, regenerate the ABI using Foundry
(version in `.foundry-version`, compiler settings in `foundry.toml`), then
commit the updated JSON with the contract change:

```bash
forge inspect contracts/VaultRegistry.sol:VaultRegistry abi --json > /tmp/vigil-vault-registry-abi.json && cp /tmp/vigil-vault-registry-abi.json src/abi/VaultRegistry.json
bun run build
```

## Test Contracts

```bash
bun run contracts:test
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID for wallet modal (optional — injected wallets work without it) |
| `RPC_PROXY_BASE_URL` | RPC proxy base URL (optional outside Arc Studio) |
| `RPC_PROXY_TOKEN` | RPC proxy auth token (optional outside Arc Studio) |
| `RPC_PROXY_CHAINS` | Comma-separated Compass chain keys (optional outside Arc Studio) |

## Deployed Contracts (Arc Testnet)

- **VaultRegistry**: `0xd94877562ee9e4be3cabfa21eade92372df28e6c`
  - Explorer: https://explorer.testnet.arc.io/address/0xd94877562ee9e4be3cabfa21eade92372df28e6c
  - Deploy tx: `0x55b3ba737f95b1a43bfbc092d6ee51cdf0b9bce125f8b5db8d00124c5b285ef6`
