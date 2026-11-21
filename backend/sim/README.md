# Device simulator + end-to-end tests

Lets the whole system be exercised without hardware. Nothing here touches a real database or device.

**`simulator.js`** behaves like the bench hardware in `docs/RUNBOOK.md` §7:

| What | How |
|---|---|
| LAN transmitters A (`:9101`, receivers 11-14) and B (`:9102`, receivers 21-23) | TCP server; answers `Tx_<addr>_R1ON / R1OFF / R2ON / R2OFF / LUX_<1-99> / STATUS` with the serial-style log (`LoRa << +OK`, `Reply Address:<n>,Message:ACK:<cmd>`) |
| MQTT transmitter C (receivers 31, 32) | its own embedded broker on `:1885`, command topic `sim/c/cmd`, reply topic `sim/c/reply` |
| Faults | control API on `:4200`: make a receiver `offline`/`silent`, `dropAck`, add `delayMs`, report `sensors`, or take a whole transmitter `down` |

```
GET  http://127.0.0.1:4200/state            every transmitter and receiver (relay1, relay2, brightness)
POST http://127.0.0.1:4200/receiver/A/12    {"offline": true}
POST http://127.0.0.1:4200/transmitter/B    {"down": true}
```

**`e2e.mjs`** (+ `t1..t5`) runs ~280 checks against a running backend: auth, device CRUD and validation, connection tests,
single-light on/off/dim over LAN and MQTT, fault handling, groups (create / edit / delete / all-on / all-off / dim / partial failure),
status polling, offline detection and alarms, heartbeat topics, roads, schedules (including one that fires by itself), tunnels,
sensors and alarm rules, energy reports and CSV export, CAD plan upload, users and permissions, audit log, and bad-input robustness.

## Run it (isolated stack)

Use a **throw-away database**: `e2e.mjs` creates its own devices and expects an empty, freshly migrated one.
Run the backend from a folder that has no `.env`, because `backend/.env` is loaded with `override: true` and may point at a real database.

```powershell
docker run -d --name sim-mysql -e MYSQL_ROOT_PASSWORD=simtest123 -e MYSQL_DATABASE=sim_test -p 3307:3306 mysql:8.4

node backend/sim/simulator.js                       # terminal 1

# terminal 2, from an empty folder (not backend/)
$env:DB_HOST='127.0.0.1'; $env:DB_PORT='3307'; $env:DB_USER='root'; $env:DB_PASSWORD='simtest123'; $env:DB_NAME='sim_test'
$env:JWT_SECRET='simsecret'; $env:MQTT_URL='mqtt://127.0.0.1:1885'; $env:PORT='4100'
$env:SEED_ADMIN_USERNAME='admin'; $env:SEED_ADMIN_PASSWORD='SimAdmin#2026'
node <repo>/backend/src/db/migrate.js; node <repo>/backend/src/db/seed.js
node <repo>/backend/src/server.js

# terminal 3
node backend/sim/e2e.mjs            # everything (~4 minutes: it waits for real polling and a real scheduled run)
node backend/sim/e2e.mjs 6 12       # only sections whose name starts with 6 or 12
```

To use the web UI against it: `API_TARGET=http://localhost:4100` and run the `frontend-sim` entry in `.claude/launch.json` (port 5181).
