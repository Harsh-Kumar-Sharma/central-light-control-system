# Deployment & Operations Runbook

Covers Implementation Plan Phase 7 (Field Deployment & Rollout). This is the
reference stack for local development, staging, and as a starting point for
production — it was built and verified end-to-end against real MySQL 8.4 and
Eclipse Mosquitto 2 containers via Docker Compose (see "What was actually
verified" below), not just written and assumed to work.

## 1. Local / Staging Deployment (Docker Compose)

```bash
cp .env.example .env
# edit .env: set JWT_SECRET, SEED_ADMIN_PASSWORD, MYSQL_ROOT_PASSWORD to real values

docker compose up -d --build
docker compose run --rm backend npm run migrate
docker compose run --rm backend npm run seed
docker compose restart backend   # picks up newly-created tables for MQTT topic subscriptions
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:4000/api (also reachable via the frontend's nginx proxy at :8080/api)
- MySQL: localhost:3306 (root / `$MYSQL_ROOT_PASSWORD`)
- MQTT broker: localhost:1883 (**anonymous, unencrypted** — dev only, see §4)

To re-apply migrations after adding a new `db/*.sql` file:

```bash
docker compose run --rm backend npm run migrate
```

This is safe to run repeatedly — `schema_migrations` tracks what's already
applied and only runs new files (this was NOT true of the first version of
the migration runner; found and fixed during Phase 6/7 testing, see §5).

### Log in

Default Admin credentials are whatever you set as `SEED_ADMIN_USERNAME` /
`SEED_ADMIN_PASSWORD` in `.env`. **Change the password immediately after
first login** — there is no forced-change-on-first-login flow built yet.

## 2. Production Deployment — Open Issues

This repo's Docker Compose stack is **not** a production topology as-is:

| Gap | What's needed |
|---|---|
| TLS | No TLS anywhere in this stack. Production needs a TLS-terminating reverse proxy (or TLS on nginx directly) in front of the frontend container, forwarding `X-Forwarded-Proto: https` to the backend, with `ENFORCE_HTTPS=true` set on the backend. |
| MQTT security | The bundled Mosquitto config (`mosquitto/mosquitto.conf`) allows anonymous, unencrypted connections. SRS §13.2 item 21 (final MQTT broker) and the MQTT security/TLS requirement (SRS Open Issues) are unresolved — do not point this stack's broker config at a real field transmitter. |
| Hosting target | On-prem vs. cloud, container orchestration (if any) beyond Compose — not decided (SRS §13.2 item 21). |
| Secrets | `.env` here is a flat file for local use. Production should use a real secrets manager, not a `.env` file on the host. |
| Backups | MySQL backup/retention policy is TBD (PRD §29 / SRS). The `mysql_data` Docker volume alone is not a backup strategy. |
| CI/CD | Not set up (SRS §13.2 item 22). Images here are built manually via `docker compose build`. |

## 3. Pilot Junction Validation (Implementation Plan §7.2)

Before wider rollout, deploy against **one** real transmitter + a small set
of receivers at a single junction:

1. Register the transmitter and its receivers through the Device Management
   UI (`/devices`) — not directly in the database.
2. Confirm the transmitter's MQTT client actually connects to the same
   broker this backend is configured for (`MQTT_URL`) — a mismatch here is
   silent (see §5, "what wasn't verified").
3. Send a brightness/relay command from `/control` and confirm in `/logs`
   that it reaches `SENT_OVER_LORA`, then either `SUCCESS` (real ACK
   received) or `TIMEOUT` (confirms the timeout sweep is running, but also
   means the ACK correlation in `mqttService.js` didn't match — check the
   backend logs for "no receiver registered" or "no source field" warnings).
4. Record the **actual observed LoRa range** on site — the PRD's ~1 km is a
   nominal target, not a guarantee (PRD §3).
5. Watch `/status` for real heartbeat/online transitions and compare the
   timing against the configured `offline_threshold_seconds`
   (`/configuration`, Admin only).

Do not proceed to staged rollout until this pilot junction has run stably
for an agreed observation period (duration still TBD — not set by this repo).

## 4. Common Failure Modes (SRS §11.3)

| Symptom | Likely cause | Where to look |
|---|---|---|
| Login works but device data is empty | Migrations not run, or run against the wrong `DB_NAME` | `docker compose logs backend`; re-run `npm run migrate` |
| Backend up, MQTT never connects | Wrong `MQTT_URL`, broker not reachable from the backend container's network | `docker compose logs mqtt`, `docker compose logs backend` (look for "MQTT error") |
| Commands stuck at `SENT_OVER_LORA` then flip to `TIMEOUT` | No real transmitter subscribed to that topic, or the transmitter's own address doesn't match `transmitters.lora_address` | Confirm the transmitter is actually publishing/subscribing on `esp/sub`/`esp/pub/<address>` with the address you registered |
| Devices always show `OFFLINE` even though the transmitter is live | Heartbeat/Online topics use `Factory/Lighting/Device<Address>/...` (see mqttService.js) — confirm the real firmware publishes there, not just `esp/pub` | `mosquitto_sub -h <broker> -t 'Factory/Lighting/#' -v` |
| All requests 301-redirect in a loop | `ENFORCE_HTTPS=true` set without a reverse proxy in front forwarding `X-Forwarded-Proto` | Set `ENFORCE_HTTPS=false` unless a real TLS proxy is in place (see §2) |
| A request just hangs, no response | Should not happen — every route is wrapped in `asyncHandler` (see backend/src/middleware/asyncHandler.js) and every MQTT event handler's promise is `.catch()`ed. If you find a new one, it's the same class of bug fixed in Phase 6/7 — wrap it the same way. |

## 5. What Was Actually Verified vs. What Wasn't

This deployment stack was stood up for real with `docker compose up` and
exercised against **real** MySQL 8.4 and Mosquitto 2 containers — not
simulated. Confirmed working:

- Fresh migrations apply cleanly, and re-running `npm run migrate` is now
  idempotent (a real bug — the original runner re-applied every file every
  time and broke on the second run — was found this way and fixed).
- Seeding, login (TC-001), invalid login (TC-002), unauthenticated
  admin-only access (TC-011), and a SQL-injection-shaped login attempt
  (TC-012) — all real HTTP requests against the real containers.
- Full command lifecycle: a brightness command genuinely reaches
  `SENT_OVER_LORA` and, with no real receiver to ACK it, correctly times out
  to `TIMEOUT` after the configured window.
- Role enforcement: a real Operator-role account genuinely gets 403 from an
  Admin-only endpoint.
- The Vue.js frontend, served through the real nginx container, genuinely
  logs in through a browser and renders live data from the backend.
- Two more real bugs found and fixed this way: an unhandled promise
  rejection in the MQTT `connect` handler crashed the whole Node process on
  startup before migrations had run; and a validation-error message was too
  long for its database column, turning an intended 400 response into a 500.

**Not verified** — no real LoRa hardware or real ESP32/RYLR998 transmitter
exists in this environment:

- Whether real firmware publishes on `esp/pub/<address>` in a shape this
  backend's parser actually matches (the ACK-correlation logic and the
  `Factory/Lighting/Device<Address>/...` heartbeat topic are both
  best-effort interpretations of the source material, flagged inline in
  `mqttService.js`).
- Real RF range, real RSSI/SNR values, real group-command broadcast
  behavior.
- Anything requiring the full `integration_protocol.doc` /
  `RYLR998_TX_TEST.ino` files, which were never supplied in full (see PRD
  §2, SRS §13.1 item 1).

## 6. Handover Checklist (Implementation Plan §7.4)

- [ ] Admin/Operator users trained on `/devices`, `/control`, `/groups`, `/status`, `/configuration`
- [ ] Runbook (this document) handed to the operations team
- [ ] Open Issues backlog (SRS §13, PRD §15) reviewed and explicitly accepted or scheduled — not silently dropped
- [ ] Production gaps in §2 above have an owner and a plan
- [ ] Real firmware/protocol files supplied and reconciled against this implementation, per the PRD's own source-of-truth rule

## 7. Control center (road map) and live status

The **Control** page draws each road with its lights; a light's colour is the receiver's live state
(green online, red offline, grey no data) and it glows when a relay is ON. Click a light to see its
relays and brightness and to switch them. Admins design the road under **Edit layout**.

How the app knows a receiver's state (LAN transmitters):

- **Status command** (Devices > edit receiver). Text sent to ask the device for its state, e.g.
  `Tx_{address}_STATUS` (`{address}` = the receiver's network address). The backend sends it to every
  enabled receiver that has one, every *Polling interval* seconds (Configuration page, default 10, minimum 3),
  and reads relay 1/2 and brightness from the reply. Accepted reply shapes: JSON such as
  `{"relay1":true,"relay2":false,"brightness":40}` (also `r1`/`lux` style keys, nested under `status`),
  or plain text like `R1:ON R2:OFF LUX:30`. Anything else is shown as "reply not understood" with the raw text.
- **Online / offline.** A good reply = online. Two silent polls in a row = offline. If the *transmitter* itself
  cannot be reached, everything behind it goes offline at once.
- **Acknowledged commands** also update the stored state (Relay 1 ON acknowledged -> relay 1 is ON), tagged
  "from the last command" so you can tell it apart from "reported by the device".
- A receiver with **no status command** is never polled: its state is only whatever the last acknowledged command set.
- Relay names (Devices > edit receiver) are shown on the map and in the dialog.

Operational notes:

- Run **one backend per site**. Commands and polls to a transmitter are queued so they never overlap, but that
  queue lives inside one backend process; two backends (e.g. a dev server and a Docker one) pointed at the same
  database and devices would poll and command the same transmitter at once.
- All timestamps are exchanged in UTC (`backend/src/db/pool.js`), so "last seen" is right even when the app
  machine and the database server are in different timezones.
- Road drawings are stored as JSON in the `roads` table. Deleting a receiver that is drawn on a road leaves its
  light on the map shown as "?" until you edit the layout and remove or re-link it.

### What the real transmitter actually replies (verified on the bench device)

The LAN transmitter answers every line it receives with a serial-style log, not JSON:

```
SYSTEM >> Tx_2_R1OFF
Send to Address : 2
Command         : R1OFF
LoRa << +OK
Reply Address:2,Message:ACK:R1OFF
```

- `LoRa << +OK` only means the transmitter *sent* the radio packet. The receiver's answer is the
  `Reply Address:<n>,Message:...` line, which can arrive a moment later. A command counts as SUCCESS only when
  that line is an ACK for the **same command** from the **same address**; anything else is recorded as
  ACKNOWLEDGED and the stored relay state is left alone.
- Status query `Tx_2_STATUS` answers `Message:STATUS:R1=0_R2=0`. It does not report brightness, so brightness
  on the map is "from the last command".
- A LoRa link handles one conversation at a time. **Run only one backend against a device.** This was seen
  for real: a second backend (no shared queue with the first one's 5-second poll) sent a command that got
  `+OK` but no receiver ACK, and the relay did not change; the same command through the single backend worked
  every time. For an extra instance (test run, second dev server) set `DISABLE_STATUS_POLLING=true`, and don't
  send device commands from it while another backend is running.
