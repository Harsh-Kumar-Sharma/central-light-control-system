# Site Deployment Guide (Ubuntu)

You do not need to know the code. Run the commands below, in order, on the site machine.
Requirements: Ubuntu (20.04 or newer), internet connection, a user with `sudo`.
Nothing else needs to be installed first - the script installs Docker and everything else.

## 1. Get the code (first time only)

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/Harsh-Kumar-Sharma/central-light-control-system.git
cd central-light-control-system
```

(GitHub will ask for a username and a token/password - use the access you were given.)

## 2. Set the Admin login for this site (optional)

```bash
nano deploy/site.conf
```

Change `SITE_ADMIN_USERNAME` and `SITE_ADMIN_PASSWORD` if told to. Save: `Ctrl+O`, `Enter`, `Ctrl+X`.
Do not use spaces or the characters `$ " ' \` in them.

## 3. Deploy

```bash
sudo ./deploy.sh
```

First run takes about 5-15 minutes (it downloads Docker, base images and packages).
At the end it prints `DEPLOYED.` and the address, for example `http://192.168.1.50/`.

## 4. Open the app

From any laptop or phone on the same network, open in a browser (plain HTTP, no port number):

```
http://<machine-ip>/
```

Log in with the Admin username/password from `deploy/site.conf`. Change the password after first login.

## Everyday commands

| Task | Command |
|---|---|
| Update to the latest version (data is kept) | `cd central-light-control-system && sudo ./deploy.sh` |
| Check status | `sudo docker compose -f docker-compose.site.yml ps` |
| See logs | `sudo docker compose -f docker-compose.site.yml logs -f backend` |
| Restart | `sudo docker compose -f docker-compose.site.yml restart` |
| Stop | `sudo docker compose -f docker-compose.site.yml stop` |

The app starts again automatically after the machine reboots.

## Troubleshooting

- **Page does not open from a phone/laptop:** confirm they are on the same network as the machine, and use the IP printed by the script (`hostname -I`). If another program already uses port 80 on the machine, stop it or ask for a different `FRONTEND_PORT` in `deploy/site.conf`.
- **Script says "app did not become healthy":** send the last 40 lines it printed to the developer.
- **Do NOT delete the Docker volume `mysql_data`** - it holds all the data. Never run `docker compose down -v`.
- Transmitters connect to the MQTT broker at `<machine-ip>:1883` (no password - keep this machine on the internal network only).
