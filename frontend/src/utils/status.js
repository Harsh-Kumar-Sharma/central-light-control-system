// Maps command/device status strings to a badge colour class (see styles/theme.css).
const COLORS = {
  SUCCESS: 'green',
  ACKNOWLEDGED: 'green',
  ONLINE: 'green',
  ACTIVE: 'green',
  SENT_OVER_LORA: 'blue',
  SENT_TO_TRANSMITTER: 'blue',
  QUEUED: 'blue',
  CREATED: 'gray',
  PARTIAL_SUCCESS: 'amber',
  TIMEOUT: 'amber',
  NO_ACK: 'amber',
  FAILED: 'red',
  OFFLINE: 'red',
  DEVICE_OFFLINE: 'red',
  TRANSMITTER_OFFLINE: 'red',
  INVALID_COMMAND: 'red',
  INVALID_PARAMETER: 'red',
  DISABLED: 'red',
  INACTIVE: 'gray',
};

export function badgeClass(status) {
  return COLORS[String(status ?? '').toUpperCase()] ?? 'gray';
}
