// The four MQTT settings of a transmitter, and how they are checked. No network here, so it is easy to test.

export const DEFAULT_MQTT_PORT = 1883;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const LABEL = '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?';
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`);

export function validHost(host) {
  if (typeof host !== 'string' || host.length === 0 || host.length > 253) return false;
  const m = IPV4.exec(host);
  if (m) return m.slice(1).every((n) => Number(n) <= 255);
  return HOSTNAME.test(host);
}

export const validPort = (p) => Number.isInteger(p) && p >= 1 && p <= 65535;

// Returns an error message, or null when the fields given are fine. Only the fields present are checked;
// `requireAll` (a transmitter that is in MQTT mode) also insists on host and both topics.
export function validateMqttFields(f, { requireAll = false } = {}) {
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  if (has(f.mqttHost)) {
    const host = String(f.mqttHost).trim();
    if (/^[a-z]+:\/\//i.test(host)) return 'Enter just the broker address (an IP or a host name), without mqtt:// in front';
    if (host.includes(':')) return 'Enter the broker address without the port. The port goes in its own box';
    if (!validHost(host)) return 'Broker host must be an IP address or a host name (letters, digits, dots and dashes)';
  }
  if (has(f.mqttPort) && !validPort(Number(f.mqttPort))) return 'Broker port must be a number between 1 and 65535';
  if (has(f.mqttPublishTopic)) {
    const t = String(f.mqttPublishTopic);
    if (t !== t.trim() || t.length > 255 || t.includes('\0')) return 'Command topic must be 1-255 characters with no spaces at either end';
    if (/[+#]/.test(t)) return 'Command topic is where we publish, so it cannot contain the wildcards + or #';
  }
  if (has(f.mqttSubscribeTopic)) {
    const t = String(f.mqttSubscribeTopic);
    if (t !== t.trim() || t.length > 255 || t.includes('\0')) return 'Reply topic must be 1-255 characters with no spaces at either end';
  }
  if (requireAll) {
    if (!has(f.mqttHost)) return 'MQTT mode needs the broker host (IP or host name)';
    if (!has(f.mqttPublishTopic)) return 'MQTT mode needs the command topic (control room → device)';
    if (!has(f.mqttSubscribeTopic)) return 'MQTT mode needs the reply topic (device → control room)';
  }
  return null;
}

// What a connection needs, from a transmitters row; null when the row is not set up for its own broker.
export function mqttConfigOf(row) {
  if (!row || row.connection_mode !== 'mqtt') return null;
  const host = row.mqtt_host?.trim();
  const pub = row.mqtt_publish_topic;
  const sub = row.mqtt_subscribe_topic;
  if (!host || !pub || !sub) return null;
  return { host, port: row.mqtt_port ?? DEFAULT_MQTT_PORT, pub, sub };
}

export const sameConfig = (a, b) => Boolean(a && b) && a.host === b.host && a.port === b.port && a.pub === b.pub && a.sub === b.sub;
