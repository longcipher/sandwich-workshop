import { ethers } from 'ethers';

// GM I hate JS
export const match = (a, b, caseIncensitive = true) => {
  if (a === null || a === undefined) return false;

  if (Array.isArray(b)) {
    if (caseIncensitive) {
      return b.map((x) => x.toLowerCase()).includes(a.toLowerCase());
    }

    return b.includes(a);
  }

  if (caseIncensitive) {
    return a.toLowerCase() === b.toLowerCase();
  }

  return a === b;
};

// JSON.stringify from bigint is pretty horrendous
// So we have a custom stringify function
export const stringifyBN = (o, toHex = false) => {
  if (o === null || o === undefined) {
    return o;
  } else if (typeof o === 'bigint') {
    if (toHex) {
      return '0x' + o.toString(16);
    }
    return o.toString();
  } else if (Array.isArray(o)) {
    return o.map((x) => stringifyBN(x, toHex));
  } else if (typeof o === 'object') {
    const res = {};
    const keys = Object.keys(o);
    keys.forEach((k) => {
      res[k] = stringifyBN(o[k], toHex);
    });
    return res;
  } else {
    return o;
  }
};

export const toRpcHexString = (bn) => {
  let val = '0x' + bn.toString(16);
  val = val.replace(/^0x0+/, '0x');

  if (val === '0x') {
    val = '0x0';
  }

  return val;
};

export const calcNextBlockBaseFee = (curBlock) => {
  const baseFee = curBlock.baseFeePerGas;
  const gasUsed = curBlock.gasUsed;
  const targetGasUsed = curBlock.gasLimit / 2n;
  const delta = gasUsed - targetGasUsed;

  const newBaseFee = baseFee + (baseFee * delta) / targetGasUsed / 8n;

  // Add 0-9 wei so it becomes a different hash each time
  const rand = BigInt(Math.floor(Math.random() * 10));
  return newBaseFee + rand;
};
