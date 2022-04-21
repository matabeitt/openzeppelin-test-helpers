import { web3 } from './setup';
const ethjsABI = require('ethjs-abi');

function findMethod (abi: any, name: any, args: any) {
  for (let i = 0; i < abi.length; i++) {
    if (abi[i].type === 'function') {
      const methodArgs = abi[i].inputs.map((input: any) => input.type).join(',');
      if ((abi[i].name === name) && (methodArgs === args)) {
        return abi[i];
      }
    }
  }
}

async function transaction (target: any, name: any, argsTypes: any, argsValues: any, opts: any = {}) {
  const abiMethod = findMethod(target.abi, name, argsTypes);
  const encodedData = ethjsABI.encodeMethod(abiMethod, argsValues);

  opts.from = opts.from || (await web3.eth.getAccounts())[0];

  return web3.eth.sendTransaction({ data: encodedData, to: target.address, ...opts });
}

function ether (from: any, to: any, value: any) {
  return web3.eth.sendTransaction({ from, to, value, gasPrice: 0 });
}

export const send = {
  transaction,
  ether,
};
