import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatusReply } from '../src/services/statusParser.js';

const sensors = (reply) => parseStatusReply(reply)?.sensors;

test('sensor values in a JSON status reply', () => {
  const r = parseStatusReply('{"relay1":true,"relay2":false,"brightness":40,"ambient":320,"motion":true,"voltage":231.5,"current":0.64,"power":148,"energy":12.5,"temperature":41}');
  assert.equal(r.relay1, true);
  assert.equal(r.brightness, 40);
  assert.deepEqual(r.sensors, { ambient: 320, motion: true, voltage: 231.5, current: 0.64, power: 148, energy: 12.5, temperature: 41 });
});

test('"lux" above 100 is ambient light, never a dimming level', () => {
  const r = parseStatusReply('{"relay1":true,"lux":320}');
  assert.equal(r.sensors.ambient, 320);
  assert.equal(r.brightness, null);
});

test('"lux" next to an explicit brightness key is ambient light', () => {
  const r = parseStatusReply('{"relay1":true,"brightness":40,"lux":55}');
  assert.equal(r.brightness, 40);
  assert.equal(r.sensors.ambient, 55);
});

test('"lux" alone and small stays the legacy dimming level', () => {
  const r = parseStatusReply('{"r1":"on","R2":0,"lux":30}');
  assert.equal(r.brightness, 30);
  assert.equal(r.sensors.ambient, null);
});

test('alias keys and nesting for sensors', () => {
  const r = parseStatusReply('{"status":{"relay1":1,"Volts":229,"watts":"150","PIR":"off","temp":38.5}}');
  assert.equal(r.sensors.voltage, 229);
  assert.equal(r.sensors.power, 150);
  assert.equal(r.sensors.motion, false);
  assert.equal(r.sensors.temperature, 38.5);
});

test('values outside a believable range are dropped', () => {
  const r = parseStatusReply('{"relay1":true,"voltage":99999,"temperature":900,"power":-5}');
  assert.equal(r.sensors.voltage, null);
  assert.equal(r.sensors.temperature, null);
  assert.equal(r.sensors.power, null);
});

test('plain text sensors', () => {
  const s = sensors('R1:ON R2:OFF voltage=230 current:0.5 power=118 ambient=410 motion:on');
  assert.deepEqual(s, { ambient: 410, motion: true, voltage: 230, current: 0.5, power: 118, energy: null, temperature: null });
});

test('plain text "LUX 320" is ambient light, "LUX:30" stays the dimming level', () => {
  const a = parseStatusReply('R1:ON LUX 320');
  assert.equal(a.sensors.ambient, 320);
  assert.equal(a.brightness, null);
  const b = parseStatusReply('R1:ON LUX:30');
  assert.equal(b.brightness, 30);
  assert.equal(b.sensors.ambient, null);
});

test('a reply with only sensors is still a status reply', () => {
  const r = parseStatusReply('{"power":148,"voltage":230}');
  assert.ok(r);
  assert.equal(r.relay1, null);
  assert.equal(r.sensors.power, 148);
});

test('a reply with no sensors has all sensor fields null', () => {
  const r = parseStatusReply('{"relay1":true}');
  assert.ok(Object.values(r.sensors).every((v) => v === null));
});
