import { createRequire } from 'module';

const require = createRequire(import.meta.url);

import { Common } from '@ethereumjs/common';
import {
  AccessListEIP2930Transaction,
  FeeMarketEIP1559Transaction,
  LegacyTransaction,
} from '@ethereumjs/tx';
import { ethers } from 'ethers';
import fetch from 'node-fetch';
import { authKeyWallet } from './constants.js';
import { stringifyBN, toRpcHexString } from './utils.js';

let _fbId = 1;
export const fbRequest = async (url, method, params) => {
  const body = JSON.stringify({
    method: method,
    params: params,
    id: _fbId++,
    jsonrpc: '2.0',
  });

  const signature = await authKeyWallet.signMessage(ethers.id(body));
  const headers = {
    'X-Flashbots-Signature': `${authKeyWallet.address}:${signature}`,
    'Content-Type': 'application/json',
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body,
  }).then((x) => x.json());

  return resp;
};

export const sendBundleFlashbots = async (signedTxs, targetBlockNumber) => {
  const params = [
    {
      txs: signedTxs,
      blockNumber: toRpcHexString(BigInt(targetBlockNumber)),
      minTimestamp: 0,
      maxTimestamp: Math.floor(Date.now() / 1000) + 60,
      revertingTxHashes: [],
    },
  ];
  const resp = await fbRequest('https://relay.flashbots.net', 'eth_sendBundle', params);
  return resp.result;
};

// Helper function to help catch the various ways errors can be thrown from simulation
// This helper function is needed as simulation response has may ways where the
// error can be thrown.... which is not documented
export const sanityCheckSimulationResponse = (sim) => {
  // Contains first revert
  if (sim.firstRevert) {
    throw new Error(sim.firstRevert.revert);
  }

  // Simulation error type
  const simE = sim;
  if (simE.error) {
    throw new Error(simE.error.message);
  }

  // Another type of silent error
  // This has to be checked last
  const errors = sim.results
    .filter((x) => x.error !== undefined)
    .map((x) => x.error + ' ' + (x.revert || ''));
  if (errors.length > 0) {
    throw new Error(errors.join(', '));
  }

  return sim;
};

export const callBundleFlashbots = async (signedTxs, targetBlockNumber) => {
  const params = [
    {
      txs: signedTxs,
      blockNumber: toRpcHexString(BigInt(targetBlockNumber)),
      stateBlockNumber: toRpcHexString(BigInt(targetBlockNumber - 1)),
    },
  ];
  const resp = await fbRequest('https://relay.flashbots.net', 'eth_callBundle', params);
  return resp.result;
};

export const getRawTransaction = (tx) => {
  const common = new Common({ chain: 1n, hardfork: 'london' });

  // Parse the tx data for reconstruction
  const txData = {
    nonce: BigInt(tx.nonce || '0x0'),
    gasPrice: tx.gasPrice ? BigInt(tx.gasPrice) : undefined,
    gasLimit: BigInt(tx.gasLimit || '0x0'),
    to: tx.to,
    value: BigInt(tx.value || '0x0'),
    data: tx.data || '0x',
    chainId: 1n,
  };

  let unsignedTx;

  // Create the appropriate transaction type
  if (tx.type === null || tx.type === 0 || tx.type === undefined) {
    // Legacy transaction (type 0)
    unsignedTx = LegacyTransaction.fromTxData(txData, { common });
  } else if (tx.type === 1) {
    // EIP-2930 transaction
    unsignedTx = AccessListEIP2930Transaction.fromTxData(txData, { common });
  } else if (tx.type === 2) {
    // EIP-1559 transaction
    unsignedTx = FeeMarketEIP1559Transaction.fromTxData(txData, { common });
  } else {
    throw new Error('Invalid tx type');
  }

  // Get the serialized transaction
  const raw = '0x' + unsignedTx.serialize().toString('hex');

  // Verify the hash matches
  if (ethers.keccak256(raw) !== tx.hash) {
    throw new Error('Invalid tx signature');
  }

  return raw;
};
