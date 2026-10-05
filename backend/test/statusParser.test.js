import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatusReply } from '../src/services/statusParser.js';

const state = (r) => r && { relay1: r.relay1, relay2: r.relay2, brightness: r.brightness };

test('PRD JSON shape with booleans', () => {
  assert.deepEqual(state(parseStatusReply('{"relay1":true,"relay2":false,"brightness":40}')), { relay1: true, relay2: false, brightness: 40 });
});

test('numbers and words are understood as on/off', () => {
  assert.deepEqual(state(parseStatusReply('{"relay1":1,"relay2":"OFF","brightness":"55"}')), { relay1: true, relay2: false, brightness: 55 });
});

test('alias keys (r1, R2, lux, relay_1) are accepted', () => {
  assert.deepEqual(state(parseStatusReply('{"r1":"on","R2":0,"lux":30}')), { relay1: true, relay2: false, brightness: 30 });
  assert.deepEqual(state(parseStatusReply('{"relay_1":true,"Relay 2":true}')), { relay1: true, relay2: true, brightness: null });
});

test('values nested under status/data are found', () => {
  assert.deepEqual(state(parseStatusReply('{"source":1,"status":{"relay1":true,"relay2":false,"brightness":70}}')), { relay1: true, relay2: false, brightness: 70 });
});

test('rssi and snr are carried along', () => {
  const r = parseStatusReply('{"relay1":true,"rssi":-71,"snr":9}');
  assert.equal(r.rssi, -71);
  assert.equal(r.snr, 9);
});

test('plain text: R1:ON R2:OFF LUX:30', () => {
  assert.deepEqual(state(parseStatusReply('R1:ON R2:OFF LUX:30')), { relay1: true, relay2: false, brightness: 30 });
});

test('plain text key=value style', () => {
  assert.deepEqual(state(parseStatusReply('relay1=1,relay2=0,brightness=45')), { relay1: true, relay2: false, brightness: 45 });
});

test('an ACK message states the relay it switched', () => {
  assert.deepEqual(state(parseStatusReply('{"source":1,"message":"ACK:R1ON","rssi":-70,"snr":8}')), { relay1: true, relay2: null, brightness: null });
  assert.deepEqual(state(parseStatusReply('{"message":"ACK:LUX_30"}')), { relay1: null, relay2: null, brightness: 30 });
});

test('out-of-range brightness is ignored, other fields kept', () => {
  assert.deepEqual(state(parseStatusReply('{"relay1":true,"brightness":150}')), { relay1: true, relay2: null, brightness: null });
});

test('unrecognisable or empty replies give null', () => {
  assert.equal(parseStatusReply(''), null);
  assert.equal(parseStatusReply('   '), null);
  assert.equal(parseStatusReply('hello world'), null);
  assert.equal(parseStatusReply('{"foo":"bar"}'), null);
  assert.equal(parseStatusReply('[1,2,3]'), null);
  assert.equal(parseStatusReply(null), null);
  assert.equal(parseStatusReply(undefined), null);
});

test('only rssi/snr is not a state', () => {
  assert.equal(parseStatusReply('{"rssi":-70,"snr":8}'), null);
});

import { parseAckReply, isReplyComplete } from '../src/services/statusParser.js';

const REAL_ACK = 'SYSTEM >> Tx_2_R1OFF\r\n--------------------------------\r\nSend to Address : 2\r\nCommand         : R1OFF\r\n--------------------------------\r\nLoRa << +OK\r\nReply Address:2,Message:ACK:R1OFF\r\n';
const REAL_STATUS = 'SYSTEM >> Tx_2_STATUS\r\n--------------------------------\r\nSend to Address : 2\r\nCommand         : STATUS\r\n--------------------------------\r\nLoRa << +OK\r\nReply Address:2,Message:STATUS:R1=0_R2=0\r\n';

test('ACK: the real serial-style reply from the transmitter', () => {
  assert.deepEqual(parseAckReply(REAL_ACK), { command: 'R1OFF', source: 2, rssi: null, snr: null });
});
test('ACK: JSON shape', () => {
  assert.deepEqual(parseAckReply('{"source":2,"message":"ACK:R1ON","rssi":-70,"snr":8}'), { command: 'R1ON', source: 2, rssi: -70, snr: 8 });
});
test('ACK: not an ACK -> null (status reply, plain OK, junk, empty)', () => {
  assert.equal(parseAckReply(REAL_STATUS), null);
  assert.equal(parseAckReply('LoRa << +OK\r\n'), null);
  assert.equal(parseAckReply('hello'), null);
  assert.equal(parseAckReply(''), null);
  assert.equal(parseAckReply('{"message":"STATUS:R1=0"}'), null);
});
test('ACK: the echoed command alone (no receiver reply) is not an ACK', () => {
  assert.equal(parseAckReply('SYSTEM >> Tx_2_R1OFF\r\n------\r\nSend to Address : 2\r\nCommand         : R1OFF\r\nLoRa << +OK\r\n'), null);
});
test('status: the real serial-style status reply is read', () => {
  const r = parseStatusReply(REAL_STATUS);
  assert.deepEqual(state(r), { relay1: false, relay2: false, brightness: null });
  assert.deepEqual(state(parseStatusReply(REAL_STATUS.replace('R1=0_R2=0', 'R1=1_R2=0'))), { relay1: true, relay2: false, brightness: null });
  assert.deepEqual(state(parseStatusReply(REAL_STATUS.replace('R1=0_R2=0', 'R1=0_R2=1'))), { relay1: false, relay2: true, brightness: null });
});
test('complete reply detection', () => {
  assert.equal(isReplyComplete(REAL_ACK), true);
  assert.equal(isReplyComplete('{"a":1}'), true);
  assert.equal(isReplyComplete('SYSTEM >> Tx_2_R1OFF\r\nLoRa << +OK\r\n'), false);   // transmitter accepted, receiver reply still pending
  assert.equal(isReplyComplete('Reply Address:2,Message:ACK:R1'), false);          // line not ended yet
  assert.equal(isReplyComplete(''), false);
});
