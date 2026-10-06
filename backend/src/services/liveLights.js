import { pool } from '../db/pool.js';

const tri = (v) => (v === null || v === undefined ? null : Boolean(v)); // unknown stays null

// Live info for lights, in the shape the light control dialog expects.
// ids = array of receiver ids, or null for every receiver.
export async function loadLiveLights(ids = null) {
  if (Array.isArray(ids) && ids.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT r.id AS receiverId, r.device_name AS name, r.lora_address AS address, r.network_id AS networkId,
            r.status AS receiverStatus, r.relay1_name AS relay1Name, r.relay2_name AS relay2Name,
            r.latitude, r.longitude,
            (r.status_command IS NOT NULL AND r.status_command <> '') AS hasStatusCommand,
            t.name AS transmitterName, t.connection_mode AS transmitterMode, t.status AS transmitterStatus,
            ds.online, ds.relay1, ds.relay2, ds.brightness, ds.rssi, ds.snr,
            ds.last_seen AS lastSeen, ds.state_source AS stateSource, ds.state_at AS stateAt
     FROM receivers r
     JOIN transmitters t ON t.id = r.parent_transmitter_id
     LEFT JOIN device_status ds ON ds.receiver_id = r.id
     ${ids ? 'WHERE r.id IN (?)' : ''}
     ORDER BY r.id`,
    ids ? [ids] : []
  );
  return rows.map((r) => ({
    ...r,
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    enabled: r.receiverStatus === 'active' && r.transmitterStatus === 'active',
    hasStatusCommand: Boolean(r.hasStatusCommand),
    online: tri(r.online),
    relay1: tri(r.relay1),
    relay2: tri(r.relay2),
  }));
}
