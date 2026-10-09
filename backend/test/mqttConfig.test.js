import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MQTT_PORT, mqttConfigOf, sameConfig, validHost, validPort, validateMqttFields } from '../src/services/mqttConfig.js';

test('host: an IP or a host name, nothing else', () => {
  for (const ok of ['192.168.1.10', '46.202.167.32', 'localhost', 'broker.example.com', 'mqtt-1.my-company.co.in', 'a']) assert.ok(validHost(ok), ok);
  for (const bad of ['', 'mqtt://host', 'host:1883', '999.1.1.1', '-bad.com', 'bad-.com', 'has space', 'a..b', 'x'.repeat(300), '/path', 'host/']) assert.ok(!validHost(bad), bad);
});

test('port range', () => {
  assert.ok(validPort(1883) && validPort(1) && validPort(65535));
  assert.ok(!validPort(0) && !validPort(70000) && !validPort(1.5) && !validPort(NaN));
});

test('each field is checked with a message a person can act on', () => {
  assert.match(validateMqttFields({ mqttHost: 'mqtt://broker' }), /without mqtt:\/\//);
  assert.match(validateMqttFields({ mqttHost: 'broker:1883' }), /port goes in its own box/);
  assert.match(validateMqttFields({ mqttHost: 'bad host' }), /IP address or a host name/);
  assert.match(validateMqttFields({ mqttPort: 99999 }), /1 and 65535/);
  assert.match(validateMqttFields({ mqttPublishTopic: 'cmd/#' }), /cannot contain the wildcards/);
  assert.match(validateMqttFields({ mqttPublishTopic: ' cmd' }), /no spaces at either end/);
  assert.equal(validateMqttFields({ mqttSubscribeTopic: 'devices/+/reply' }), null, 'a reply topic may use a wildcard');
  assert.equal(validateMqttFields({ mqttHost: '10.0.0.5', mqttPort: '1883', mqttPublishTopic: 'ars/cmd', mqttSubscribeTopic: 'ars/reply' }), null);
});

test('MQTT mode needs host and both topics', () => {
  assert.match(validateMqttFields({}, { requireAll: true }), /broker host/);
  assert.match(validateMqttFields({ mqttHost: 'h' }, { requireAll: true }), /command topic/);
  assert.match(validateMqttFields({ mqttHost: 'h', mqttPublishTopic: 'a' }, { requireAll: true }), /reply topic/);
  assert.equal(validateMqttFields({ mqttHost: 'h', mqttPublishTopic: 'a', mqttSubscribeTopic: 'b' }, { requireAll: true }), null);
  assert.equal(validateMqttFields({}, { requireAll: false }), null, 'LAN transmitters are not asked for MQTT settings');
});

test('config from a row: the port defaults to 1883; other modes and half-set rows give none', () => {
  const row = { connection_mode: 'mqtt', mqtt_host: ' broker.local ', mqtt_port: null, mqtt_publish_topic: 'ars/cmd', mqtt_subscribe_topic: 'ars/reply' };
  assert.deepEqual(mqttConfigOf(row), { host: 'broker.local', port: DEFAULT_MQTT_PORT, pub: 'ars/cmd', sub: 'ars/reply' });
  assert.equal(mqttConfigOf({ ...row, mqtt_port: 8883 }).port, 8883);
  assert.equal(mqttConfigOf({ ...row, connection_mode: 'lan' }), null);
  assert.equal(mqttConfigOf({ ...row, mqtt_publish_topic: null }), null);
  assert.equal(mqttConfigOf(null), null);
  assert.ok(sameConfig(mqttConfigOf(row), mqttConfigOf({ ...row })));
  assert.ok(!sameConfig(mqttConfigOf(row), mqttConfigOf({ ...row, mqtt_port: 1884 })));
});
