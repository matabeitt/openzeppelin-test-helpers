import { toWei } from 'web3-utils';
import { BN } from './setup';

export function ether (n: any) {
  return new BN(toWei(n, 'ether'));
};
