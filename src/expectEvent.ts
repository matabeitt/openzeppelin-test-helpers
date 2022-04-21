import { web3, BN } from './setup';
import { expect } from 'chai';
import { flatten } from 'lodash';
import { deprecate } from 'util';

function expectEvent (receipt: any, eventName: any, eventArgs: any = {}) {
  // truffle contract receipts have a 'logs' object, with an array of objects
  // with 'event' and 'args' properties, containing the event name and actual
  // values.
  // web3 contract receipts instead have an 'events' object, with properties
  // named after emitted events, each containing an object with 'returnValues'
  // holding the event data, or an array of these if multiple were emitted.

  // The simplest way to handle both of these receipts is to convert the web3
  // event format into the truffle one.

  if (isWeb3Receipt(receipt)) {
    const logs = flatten(Object.keys(receipt.events).map(name => {
      if (Array.isArray(receipt.events[name])) {
        return receipt.events[name].map((event: any) => ({ event: name, args: event.returnValues }));
      } else {
        return ({ event: name, args: receipt.events[name].returnValues });
      }
    }));

    return inLogs(logs, eventName, eventArgs);
  } else if (isTruffleReceipt(receipt)) {
    return inLogs(receipt.logs, eventName, eventArgs);
  } else {
    throw new Error('Unknown transaction receipt object');
  }
}

function notExpectEvent (receipt: any, eventName: any) {
  if (isWeb3Receipt(receipt)) {
    // We don't need arguments for the assertion, so let's just map it to the expected format.
    const logsWithoutArgs = Object.keys(receipt.events).map(name => {
      return { event: name };
    });
    notInLogs(logsWithoutArgs, eventName);
  } else if (isTruffleReceipt(receipt)) {
    notInLogs(receipt.logs, eventName);
  } else {
    throw new Error('Unknown transaction receipt object');
  }
}

function inLogs (logs: any, eventName: any, eventArgs: any = {}) {
  const events = logs.filter((e:any) => e.event === eventName);
  expect(events.length > 0).to.equal(true, `No '${eventName}' events found`);

  const exception: any = [];
  const event = events.find(function (e:any) {
    for (const [k, v] of Object.entries(eventArgs)) {
      try {
        contains(e.args, k, v);
      } catch (error) {
        exception.push(error);
        return false;
      }
    }
    return true;
  });

  if (event === undefined) {
    throw exception[0];
  }

  return event;
}

function notInLogs (logs: any, eventName: any) {
  // eslint-disable-next-line no-unused-expressions
  expect(logs.find((e: any) => e.event === eventName), `Event ${eventName} was found`).to.be.undefined;
}

async function inConstruction (contract: any, eventName: any, eventArgs: any = {}) {
  if (!isTruffleContract(contract)) {
    throw new Error('expectEvent.inConstruction is only supported for truffle-contract objects');
  }

  return inTransaction(contract.transactionHash, contract.constructor, eventName, eventArgs);
}

async function notInConstruction (contract: any, eventName: any) {
  if (!isTruffleContract(contract)) {
    throw new Error('expectEvent.inConstruction is only supported for truffle-contract objects');
  }
  return notInTransaction(contract.transactionHash, contract.constructor, eventName);
}

async function inTransaction (txHash: any, emitter: any, eventName: any, eventArgs: any = {}) {
  const receipt = await web3.eth.getTransactionReceipt(txHash);

  const logs = decodeLogs(receipt.logs, emitter, eventName);
  return inLogs(logs, eventName, eventArgs);
}

async function notInTransaction (txHash: any, emitter: any, eventName: any) {
  const receipt = await web3.eth.getTransactionReceipt(txHash);

  const logs = decodeLogs(receipt.logs, emitter, eventName);
  notInLogs(logs, eventName);
}

// This decodes longs for a single event type, and returns a decoded object in
// the same form truffle-contract uses on its receipts
function decodeLogs (logs: any, emitter: any, eventName: any) {
  let abi: any;
  let address: any;
  if (isWeb3Contract(emitter)) {
    abi = emitter.options.jsonInterface;
    address = emitter.options.address;
  } else if (isTruffleContract(emitter)) {
    abi = emitter.abi;
    try {
      address = emitter.address;
    } catch (e) {
      address = null;
    }
  } else {
    throw new Error('Unknown contract object');
  }

  let eventABI = abi.filter((x: any) => x.type === 'event' && x.name === eventName);
  if (eventABI.length === 0) {
    throw new Error(`No ABI entry for event '${eventName}'`);
  } else if (eventABI.length > 1) {
    throw new Error(`Multiple ABI entries for event '${eventName}', only uniquely named events are supported`);
  }

  eventABI = eventABI[0];

  // The first topic will equal the hash of the event signature
  const eventSignature = `${eventName}(${eventABI.inputs.map((input: any) => input.type).join(',')})`;
  const eventTopic = web3.utils.sha3(eventSignature);

  // Only decode events of type 'EventName'
  return logs
    .filter((log: any) => log.topics.length > 0 && log.topics[0] === eventTopic && (!address || log.address === address))
    .map((log: any) => web3.eth.abi.decodeLog(eventABI.inputs, log.data, log.topics.slice(1)))
    .map((decoded: any) => ({ event: eventName, args: decoded }));
}

function contains (args: any, key: any, value: any) {
  expect(key in args).to.equal(true, `Event argument '${key}' not found`);

  if (value === null) {
    expect(args[key]).to.equal(null,
      `expected event argument '${key}' to be null but got ${args[key]}`);
  } else if (isBN(args[key]) || isBN(value)) {
    const actual = isBN(args[key]) ? args[key].toString() : args[key];
    const expected = isBN(value) ? value.toString() : value;
    // @ts-ignore
    expect(args[key]).to.be.bignumber.equal(value,
      `expected event argument '${key}' to have value ${expected} but got ${actual}`);
  } else {
    expect(args[key]).to.be.deep.equal(value,
      `expected event argument '${key}' to have value ${value} but got ${args[key]}`);
  }
}

function isBN (object: any) {
  return BN.isBN(object) || object instanceof BN;
}

function isWeb3Receipt (receipt: any) {
  return 'events' in receipt && typeof receipt.events === 'object';
}

function isTruffleReceipt (receipt: any) {
  return 'logs' in receipt && typeof receipt.logs === 'object';
}

function isWeb3Contract (contract: any) {
  return 'options' in contract && typeof contract.options === 'object';
}

function isTruffleContract (contract: any) {
  return 'abi' in contract && typeof contract.abi === 'object';
}

expectEvent.inLogs = deprecate(inLogs, 'expectEvent.inLogs() is deprecated. Use expectEvent() instead.');
expectEvent.inConstruction = inConstruction;
expectEvent.inTransaction = inTransaction;

expectEvent.notEmitted = notExpectEvent;
(expectEvent.notEmitted as any).inConstruction = notInConstruction;
(expectEvent.notEmitted as any).inTransaction = notInTransaction;

expectEvent.not = {};
(expectEvent.not as any).inConstruction = deprecate(
  notInConstruction,
  'expectEvent.not is deprecated. Use expectEvent.notEmitted instead.'
);
(expectEvent.not as any).inTransaction = deprecate(
  notInTransaction,
  'expectEvent.not is deprecated. Use expectEvent.notEmitted instead.'
);

module.exports = expectEvent;
