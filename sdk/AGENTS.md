# AGENTS.md

This directory owns the public Pons v2 TypeScript integration boundary: reviewed ABIs,
deployment metadata, deterministic transaction builders, receipt verification, read helpers,
and runtime-neutral protocol arithmetic.

Keep the SDK runtime-neutral:

- do not select wallets, RPC transports, gas, nonce, or application authorization policies;
- expose stable subpath exports and machine-readable SDK error codes;
- pin published deployments to chain ID, factory address, creation block, and runtime code hash;
- never require contract source, Foundry output, secrets, or a sibling checkout at build time;
- use exact bigint arithmetic for protocol amounts;
- run `npm test` before release.

The Solidity contracts in the repository root remain the protocol source of truth. The SDK is
a consumer boundary and must not silently broaden or reinterpret their behavior.
