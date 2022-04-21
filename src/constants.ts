import { BN } from './setup';

export const ZERO_ADDRESS: string = '0x0000000000000000000000000000000000000000';
export const ZERO_BYTES32: string = '0x0000000000000000000000000000000000000000000000000000000000000000';
export const MAX_UINT256: any = new BN('2').pow(new BN('256')).sub(new BN('1'));
export const MIN_UINT256: any = new BN('2').pow(new BN('256')).mul(new BN('-1'));
