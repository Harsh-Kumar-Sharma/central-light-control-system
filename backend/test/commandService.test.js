import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandString } from '../src/services/commandService.js';

// Pure-function tests — no DB/MQTT required. Covers the brightness-range
// validation (SRS Open Issue: firmware 1–99 vs protocol 0–100%) and the
// relay command-string construction, both load-bearing for TC-003.

test('brightness: builds Tx_<addr>_LUX_<value> for a valid value', () => {
  const result = buildCommandString(4, 'brightness', { value: 30 });
  assert.equal(result.commandString, 'Tx_4_LUX_30');
  assert.equal(result.command, 'BRIGHTNESS');
});

test('brightness: rejects 0 (below firmware range 1–99)', () => {
  const result = buildCommandString(4, 'brightness', { value: 0 });
  assert.equal(result.error, 'INVALID_PARAMETER');
});

test('brightness: rejects 100 (protocol says 0–100%, firmware caps at 99 — firmware wins)', () => {
  const result = buildCommandString(4, 'brightness', { value: 100 });
  assert.equal(result.error, 'INVALID_PARAMETER');
});

test('brightness: accepts the firmware boundary values 1 and 99', () => {
  assert.equal(buildCommandString(4, 'brightness', { value: 1 }).commandString, 'Tx_4_LUX_1');
  assert.equal(buildCommandString(4, 'brightness', { value: 99 }).commandString, 'Tx_4_LUX_99');
});

test('brightness: rejects a non-integer value', () => {
  const result = buildCommandString(4, 'brightness', { value: 12.5 });
  assert.equal(result.error, 'INVALID_PARAMETER');
});

test('relay1: ON/OFF build the documented R1ON/R1OFF suffixes', () => {
  assert.equal(buildCommandString(4, 'relay1', { state: true }).commandString, 'Tx_4_R1ON');
  assert.equal(buildCommandString(4, 'relay1', { state: false }).commandString, 'Tx_4_R1OFF');
});

test('relay2: ON/OFF build the documented R2ON/R2OFF suffixes', () => {
  assert.equal(buildCommandString(4, 'relay2', { state: true }).commandString, 'Tx_4_R2ON');
  assert.equal(buildCommandString(4, 'relay2', { state: false }).commandString, 'Tx_4_R2OFF');
});

test('relay: rejects a missing/non-boolean state', () => {
  const result = buildCommandString(4, 'relay1', {});
  assert.equal(result.error, 'INVALID_PARAMETER');
});

test('unknown command type is rejected as INVALID_COMMAND', () => {
  const result = buildCommandString(4, 'flashlight', {});
  assert.equal(result.error, 'INVALID_COMMAND');
});
