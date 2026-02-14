# LongEntry Market Scanner — Setup Guide

This guide walks you through every step to get the LongEntry Market Scanner running. It assumes you have never used a terminal before. Every command is explained before you run it.

**What you'll set up:**
1. Your VPS (Linux server) with the required software
2. A PostgreSQL database to store market data
3. The Python backend (API server)
4. The React frontend (dashboard website)
5. Nginx (web server to make it all accessible)
6. Automatic startup and backups
7. MetaTrader 5 with DataSender on 14 charts

**Time estimate:** 1–2 hours if you follow step by step.

---

## Part 0 — Can I Use My Existing VPS?

**Yes.** The LongEntry scanner is lightweight. It needs about 200MB of RAM and a few hundred MB of disk space. You can run it alongside your existing GBPJPY bot without issues.

### Step 0.1 — Connect to your VPS

**SSH** is how you connect to your Linux server remotely. You type commands in a **terminal** (a text-based window), and they run on your server.

**On Windows:** Open the built-in **Windows Terminal** or **PowerShell** (search for it in the Start menu). Then type:

```bash
ssh root@YOUR_VPS_IP
```

Replace `YOUR_VPS_IP` with your server's IP address (e.g., `49.12.345.67`). Enter your password when asked. You won't see the characters as you type — that's normal.

**On Mac:** Open the **Terminal** app (search with Spotlight). Same command as above.

> **Tip:** If you used an SSH key when setting up your VPS (Hetzner gives you this option), you won't need a password. If you're unsure, try connecting — it will either ask for a password or just log you in.

### Step 0.2 — Check available resources

Once connected, run these two commands to see if your server has enough space:

This shows how much **RAM (memory)** is available:
```bash
free -h
```

You should see something like:
```
              total        used        free
Mem:          3.8Gi       1.2Gi       2.1Gi
```

You need at least **1GB free** in the "free" or "available" column.

This shows how much **disk space** is available:
```bash
df -h /
```

You should see something like:
```
Filesystem      Size  Used Avail Use%
/dev/sda1        38G   12G   24G  34%
```

You need at least **5GB** in the "Avail" column. If both checks look good, you're ready to continue.

---

## Part 1 — Install Required Software

We need to install several programs on your server. Each command below will be explained.

### Step 1.1 — Update the package list

This tells your server to check for the latest versions of all available software. Always do this first.

```bash
apt update
```

> **Note:** If you're logged in as `root` (which is typical for Hetzner), you can run commands directly. If you see "Permission denied", add `sudo` before any command (e.g., `sudo apt update`).

### Step 1.2 — Install Python

**Python** is the programming language our backend is built with. We need version 3.11 or newer.

```bash
apt install -y python3 python3-pip python3-venv
```

The `-y` flag means "answer yes to all questions automatically."

Check it installed correctly:
```bash
python3 --version
```

You should see something like `Python 3.11.2` or higher. Any version 3.11+ is fine.

### Step 1.3 — Install PostgreSQL

**PostgreSQL** (often called "Postgres") is a database — it stores all the candle data, market info, and analysis results.

```bash
apt install -y postgresql postgresql-contrib
```

Check it's running:
```bash
systemctl status postgresql
```

You should see a green dot or the word `active (running)`. Press `q` to exit this screen.

### Step 1.4 — Install Node.js

**Node.js** is needed to build the frontend dashboard. We'll install version 20.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

The first line downloads the installer. The second line installs Node.js.

Check it worked:
```bash
node --version
```

You should see `v20.x.x` (any 20.x version is fine).

### Step 1.5 — Install Nginx

**Nginx** (pronounced "engine-x") is a web server. It will serve your dashboard to your browser and forward API requests to the Python backend.

```bash
apt install -y nginx
```

### Step 1.6 — Install Git

**Git** is version control software — it lets you download the project code from GitHub.

```bash
apt install -y git
```

### Step 1.7 — Verify everything

Run this to confirm all tools are installed:

```bash
python3 --version && node --version && psql --version && nginx -v && git --version
```

You should see version numbers for all five tools. If any shows "command not found", go back and re-run that install step.

---

## Part 2 — Set Up the Database

### Step 2.1 — Create a database user and database

PostgreSQL has its own user system. We'll create a user called `longentry` with a password, and a database also called `longentry`.

Open the PostgreSQL command prompt:
```bash
sudo -u postgres psql
```

Your terminal prompt will change to `postgres=#`. Now run these commands one at a time:

```sql
CREATE USER longentry WITH PASSWORD 'pick-a-strong-password-here';
```

> **Important:** Replace `pick-a-strong-password-here` with an actual password. Write it down — you'll need it later. Use letters, numbers, and dashes. Avoid special characters like `'` or `$` in the password as they can cause issues.

```sql
CREATE DATABASE longentry OWNER longentry;
```

```sql
\q
```

The `\q` command exits the PostgreSQL prompt. You're back to the normal terminal.

### Step 2.2 — Download the project code

You're still in the SSH terminal connected to your VPS. Now we'll download the project code from GitHub onto your server.

`/opt` is a standard folder on Linux servers for installing optional software — it's the right place for our project.

```bash
cd /opt
git clone https://github.com/manuham/LongEntry-Marketscanner.git longentry
cd /opt/longentry
```

What each command does:
- `cd /opt` — moves into the `/opt` folder on your VPS
- `git clone ...` — downloads the entire project from GitHub into a new folder called `longentry`
- `cd /opt/longentry` — moves into the downloaded project folder

From now on, `/opt/longentry/` is where the project lives on your server. All the remaining steps happen inside this folder.

> **Note:** If the repo is private, you may need to authenticate with GitHub. Git will prompt you for credentials.

### Step 2.3 — Create the database tables

Run the migration file — this creates all the tables the app needs:

```bash
psql -U longentry -d longentry -f /opt/longentry/backend/migrations/001_initial.sql
```

If you see an error like `Peer authentication failed for user "longentry"`, you need to edit PostgreSQL's authentication config. This tells PostgreSQL to accept password logins.

Open the config file in the **nano** text editor:

```bash
nano /etc/postgresql/*/main/pg_hba.conf
```

You'll see a file full of comments (lines starting with `#`). The lines you need are near the **bottom** of the file.

**How to get to the bottom:** Press `Ctrl+End` (hold Ctrl, then press the End key). This jumps to the very last line.

You should see lines that look like this:

```
local   all             postgres                                peer
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
```

**Find the line that says `local   all   all   peer`** (the second `local` line). Use the arrow keys to move your cursor onto the word `peer` on that line.

**Change `peer` to `md5`:**
1. Press the `Delete` key 4 times to delete the word `peer`
2. Type `md5`

The line should now read:
```
local   all             all                                     md5
```

> **Important:** Only change the line that says `local all all` — do NOT change the first line that says `local all postgres`.

**Save and exit nano:**
1. Press `Ctrl+O` (the letter O, not zero) — this means "save"
2. Press `Enter` to confirm the filename
3. Press `Ctrl+X` to exit nano

**Restart PostgreSQL** so it picks up the change:

```bash
systemctl restart postgresql
```

Now try the migration command again:

```bash
psql -U longentry -d longentry -f /opt/longentry/backend/migrations/001_initial.sql
```

When asked for a password, type the one you chose in Step 2.1 and press Enter. (You won't see the characters as you type — that's normal.)

### Step 2.4 — Load the 14 market symbols

```bash
psql -U longentry -d longentry -f /opt/longentry/backend/migrations/002_seed_markets.sql
```

### Step 2.5 — Verify the database

```bash
psql -U longentry -d longentry -c "SELECT symbol, name, category FROM markets ORDER BY category, symbol;"
```

You should see a table with 14 rows:
```
 symbol  |      name      | category
---------+----------------+-----------
 XAGUSD  | Silver         | commodity
 XAUUSD  | Gold           | commodity
 AUS200  | ASX 200        | index
 EU50    | Euro Stoxx 50  | index
 FRA40   | CAC 40         | index
 GER40   | DAX 40         | index
 HK50    | Hang Seng 50   | index
 JP225   | Nikkei 225     | index
 N25     | AEX 25         | index
 SPN35   | IBEX 35        | index
 UK100   | FTSE 100       | index
 US100   | Nasdaq 100     | index
 US30    | Dow Jones 30   | index
 US500   | S&P 500        | index
(14 rows)
```

If you see all 14 markets, the database is set up correctly.

---

## Part 3 — Set Up the Backend

### Step 3.1 — Create a Python virtual environment

A **virtual environment** is an isolated space for Python packages so they don't conflict with other programs on your server.

```bash
cd /opt/longentry/backend
python3 -m venv venv
```

This creates a `venv/` folder. Now **activate** it:

```bash
source venv/bin/activate
```

Your prompt will now show `(venv)` at the beginning. This means you're inside the virtual environment. All Python commands will use this isolated space.

### Step 3.2 — Install Python packages

```bash
pip install -r requirements.txt
```

This reads the `requirements.txt` file and installs all the packages the backend needs (FastAPI, database drivers, etc.). It will show a lot of output — that's normal. Wait for it to finish.

### Step 3.3 — Generate your API key

The **API key** is a secret password that the MetaTrader scripts use to authenticate with your server. Without it, no one can send data to or read data from your API.

First, generate a random key:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

This prints a random string like: `kG7xM_2vN8pLqR5wT0yJ4bH6aD9cF1eI`

**Write this down or save it somewhere safe.** You will need it twice:
1. In the server's `.env` file (as a hash)
2. In MetaTrader 5 (as the actual key)

### Step 3.4 — Hash the API key

The server doesn't store your API key directly — it stores a **hash** (a one-way fingerprint). This is more secure.

Replace `YOUR_KEY_HERE` with the key you just generated:

```bash
python3 -c "import hashlib; print(hashlib.sha256(b'YOUR_KEY_HERE').hexdigest())"
```

For example, if your key was `kG7xM_2vN8pLqR5wT0yJ4bH6aD9cF1eI`, you would run:

```bash
python3 -c "import hashlib; print(hashlib.sha256(b'kG7xM_2vN8pLqR5wT0yJ4bH6aD9cF1eI').hexdigest())"
```

This prints a long hex string like: `a1b2c3d4e5f6...` (64 characters). Copy this hash.

### Step 3.5 — Create the configuration file

Copy the example config:

```bash
cp .env.example .env
```

Now edit it:

```bash
nano .env
```

Fill in the values. Your file should look like this:

```
LE_DATABASE_URL=postgresql://longentry:pick-a-strong-password-here@localhost:5432/longentry
LE_API_KEY_HASH=a1b2c3d4e5f6...paste-your-64-char-hash-here
LE_LOG_LEVEL=INFO
LE_LOG_DIR=/var/log/longentry
LE_MAX_ACTIVE_MARKETS=6
LE_MIN_FINAL_SCORE=40.0
```

**What each line means:**
- `LE_DATABASE_URL` — How to connect to PostgreSQL. Replace the password with the one from Step 2.1.
- `LE_API_KEY_HASH` — The hash you generated in Step 3.4.
- `LE_LOG_LEVEL` — How much detail to log. `INFO` is good for normal use.
- `LE_LOG_DIR` — Where log files are saved.
- `LE_MAX_ACTIVE_MARKETS` — How many markets to trade each week (5–6 recommended).
- `LE_MIN_FINAL_SCORE` — Minimum score to activate a market. Below this, it stays inactive.

Save and exit: press `Ctrl+O`, then `Enter`, then `Ctrl+X`.

### Step 3.6 — Create the log directory

```bash
mkdir -p /var/log/longentry
```

### Step 3.7 — Test the backend

Make sure you're still in the backend directory with the virtual environment active:

```bash
cd /opt/longentry/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

You should see output like:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Open a **second terminal window**, connect to your VPS via SSH again, and test:

```bash
curl http://localhost:8000/api/health
```

You should see:
```json
{"status":"ok"}
```

If you see this, your backend is working. Go back to the first terminal and press `Ctrl+C` to stop it. We'll set it up to run automatically later.

---

## Part 4 — Build the Frontend

### Step 4.1 — Install frontend dependencies

```bash
cd /opt/longentry/frontend
npm install
```

This downloads all the JavaScript libraries needed. It may take a minute or two and show some warnings — that's normal.

### Step 4.2 — Build for production

```bash
npm run build
```

This compiles the React app into plain HTML, CSS, and JavaScript files. They end up in a `dist/` folder:

```bash
ls dist/
```

You should see files like `index.html` and an `assets/` folder. These are the files Nginx will serve to your browser.

---

## Part 5 — Set Up Nginx (Web Server)

**Nginx** does two things for us:
1. Serves the frontend dashboard files to your browser
2. Forwards any `/api/` requests to the Python backend running on port 8000

### Step 5.1 — Create the Nginx configuration

```bash
nano /etc/nginx/sites-available/longentry
```

Paste this entire block. Replace `YOUR_VPS_IP` with your actual server IP address:

```nginx
server {
    listen 80;
    server_name YOUR_VPS_IP;

    # Frontend — serve the built React app
    root /opt/longentry/frontend/dist;
    index index.html;

    # API requests — forward to Python backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Increase timeout for large candle uploads
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        client_max_body_size 50M;
    }

    # For any other URL, serve index.html (React handles routing)
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

### Step 5.2 — Enable the site

Create a shortcut (called a **symlink**) so Nginx knows about this config:

```bash
ln -sf /etc/nginx/sites-available/longentry /etc/nginx/sites-enabled/longentry
```

Remove the default site so it doesn't interfere:

```bash
rm -f /etc/nginx/sites-enabled/default
```

### Step 5.3 — Test and reload Nginx

Test that the config file has no syntax errors:

```bash
nginx -t
```

You should see:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

If you see errors, double-check the config file from Step 5.1.

Reload Nginx to apply the changes:

```bash
systemctl reload nginx
```

### Step 5.4 — Verify in your browser

The frontend won't fully work yet (the backend isn't running permanently), but you can check that Nginx is serving files. Open your browser and visit:

```
http://YOUR_VPS_IP
```

You should see the LongEntry dashboard page (it will show a loading or error state since the backend isn't running yet — that's fine for now).

---

## Part 6 — Run the Backend as a Service

Right now, the backend only runs when you manually start it. If your server reboots, it would stop. A **systemd service** makes it start automatically.

### Step 6.1 — Create the service file

```bash
nano /etc/systemd/system/longentry.service
```

Paste this:

```ini
[Unit]
Description=LongEntry Market Scanner API
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/longentry/backend
Environment=PATH=/opt/longentry/backend/venv/bin:/usr/bin:/bin
ExecStart=/opt/longentry/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

**What this does:**
- `After=` — Waits for the network and database to be ready before starting
- `WorkingDirectory=` — Runs from the backend folder
- `ExecStart=` — The command to start the API server
- `Restart=always` — If it crashes, restart it automatically
- `--host 127.0.0.1` — Only accepts local connections (Nginx handles external access)

### Step 6.2 — Start the service

```bash
systemctl daemon-reload
systemctl enable longentry
systemctl start longentry
```

- `daemon-reload` — Tells systemd about the new service file
- `enable` — Makes it start automatically on boot
- `start` — Starts it right now

### Step 6.3 — Verify it's running

```bash
systemctl status longentry
```

You should see `active (running)` in green. Press `q` to exit.

Test the API through Nginx:

```bash
curl http://localhost/api/health
```

You should see:
```json
{"status":"ok"}
```

### Step 6.4 — Check the dashboard

Open your browser and go to `http://YOUR_VPS_IP`. You should now see the LongEntry dashboard with 14 market cards. They'll all show "No data yet" since we haven't uploaded any candle data — that's expected.

> **If the page doesn't load:** Check the backend logs with `journalctl -u longentry -n 50` to see if there are any errors.

---

## Part 7 — Set Up Database Backups

### Step 7.1 — Create the backup directory

```bash
mkdir -p /var/backups/longentry
```

### Step 7.2 — Set up password-free database access for backups

The backup script needs to connect to PostgreSQL without typing a password. Create a `.pgpass` file:

```bash
nano /root/.pgpass
```

Add this line (replace the password):

```
localhost:5432:longentry:longentry:pick-a-strong-password-here
```

Save and exit. Then set the correct permissions (PostgreSQL requires this):

```bash
chmod 600 /root/.pgpass
```

### Step 7.3 — Test the backup manually

```bash
bash /opt/longentry/scripts/backup_db.sh
```

You should see:
```
[date] Starting backup...
[date] Backup saved to /var/backups/longentry/longentry_20260214_153000.sql.gz (size)
[date] Cleaned up backups older than 7 days
```

### Step 7.4 — Schedule automatic daily backups

Open the **crontab** (a schedule for automatic tasks):

```bash
crontab -e
```

If it asks which editor to use, choose `nano` (usually option 1).

Add this line at the bottom of the file:

```
0 3 * * * /bin/bash /opt/longentry/scripts/backup_db.sh >> /var/log/longentry/backup.log 2>&1
```

Save and exit.

**What this means:** `0 3 * * *` = "At 3:00 AM, every day." The backup will run automatically and log its output.

---

## Part 8 — Set Up MetaTrader 5

### Step 8.1 — Add the 14 symbols to Market Watch

1. Open MetaTrader 5
2. In the **Market Watch** panel (left side), right-click and select **Symbols** (or press `Ctrl+U`)
3. Search for and add each of these 14 symbols. Your broker (FTMO) may use slightly different names — search for the base name:

| Search for | FTMO Symbol | Full Name |
|-----------|-------------|-----------|
| XAUUSD | XAUUSD | Gold |
| XAGUSD | XAGUSD | Silver |
| US500 / SP500 | US500 | S&P 500 |
| US100 / NAS100 | US100 | Nasdaq 100 |
| US30 / DJ30 | US30 | Dow Jones 30 |
| GER40 / DAX40 | GER40 | DAX 40 |
| AUS200 | AUS200 | ASX 200 |
| UK100 / FTSE | UK100 | FTSE 100 |
| JP225 / NI225 | JP225 | Nikkei 225 |
| SPN35 / IBEX | SPN35 | IBEX 35 |
| EU50 / STOXX50 | EU50 | Euro Stoxx 50 |
| FRA40 / CAC40 | FRA40 | CAC 40 |
| HK50 / HSI | HK50 | Hang Seng 50 |
| N25 / AEX | N25 | AEX 25 |

4. For each symbol, select it and click **Show**
5. Close the Symbols window

> **Important:** The symbol names in the DataSender must exactly match what your broker uses. If your broker calls S&P 500 "SP500.s" instead of "US500", you'll need to note the difference — we'll handle mappings in a later phase.

### Step 8.2 — Open 14 charts

For each of the 14 symbols:
1. In Market Watch, right-click the symbol
2. Click **Chart Window**
3. In the new chart, right-click → **Timeframe** → **H1** (or click the "H1" button in the toolbar)

You should now have 14 chart windows open, all on the H1 timeframe.

> **Tip:** You can arrange them using **Window** → **Tile Horizontally** to see them all at once. They'll be small, but that's fine — the DataSender doesn't need you to look at the charts.

### Step 8.3 — Install the DataSender EA

1. In MetaTrader 5, click **File** → **Open Data Folder**
2. A file explorer window opens. Navigate to: `MQL5` → `Experts`
3. Copy the `DataSender.mq5` file from the project (it's in the `mql5/` folder) into this `Experts` folder
4. Go back to MetaTrader 5
5. In the **Navigator** panel (left side, below Market Watch), right-click **Expert Advisors** → **Refresh**
6. You should see `DataSender` appear in the list

### Step 8.4 — Compile the EA

1. Double-click `DataSender` in the Navigator to open it in **MetaEditor**
2. Press **F7** (or click the **Compile** button)
3. At the bottom, you should see `0 error(s), 0 warning(s)` (some warnings are OK, errors are not)
4. Close MetaEditor and go back to MetaTrader 5

### Step 8.5 — Allow web requests

The DataSender needs permission to send data to your server:

1. In MetaTrader 5, go to **Tools** → **Options**
2. Click the **Expert Advisors** tab
3. Check the box: **Allow WebRequest for listed URL**
4. Click **Add** (or the `+` button) and enter your server URL: `http://YOUR_VPS_IP`
5. Click **OK**

> **Note:** Use `http://` (not `https://`) for now. We'll add SSL later if needed.

### Step 8.6 — Attach DataSender to all 14 charts

For each of the 14 charts:

1. In the **Navigator** panel, find `DataSender` under Expert Advisors
2. Drag it onto the chart (or double-click it while the chart is active)
3. A settings window appears. Go to the **Inputs** tab:
   - **ServerURL**: `http://YOUR_VPS_IP/api` (your VPS IP with `/api` at the end)
   - **APIKey**: paste the API key you generated in Step 3.3 (the original key, NOT the hash)
   - Leave other settings at their defaults
4. Go to the **Common** tab:
   - Check **Allow Algo Trading**
5. Click **OK**

Repeat for all 14 charts.

> **Important:** Make sure the **AutoTrading** button in the MT5 toolbar is enabled (it should be green). If it's red, click it to enable it.

### Step 8.7 — Verify

Check the **Experts** tab at the bottom of MetaTrader 5 (if you don't see it, go to **View** → **Toolbox** → **Experts** tab).

You should see initialization messages for each symbol:
```
[DataSender] Initialized for XAUUSD | Last upload: never
[DataSender] Initialized for US500 | Last upload: never
...
```

The DataSender will automatically upload data on the next Friday. If you want to test it immediately, you can temporarily change the day-of-week check (but this is optional — it's fine to just wait for Friday).

---

## You're Done!

Here's what you now have running:

| Component | Status | How to check |
|-----------|--------|-------------|
| PostgreSQL | Running, 14 markets seeded | `psql -U longentry -d longentry -c "SELECT count(*) FROM markets;"` |
| Backend API | Running as a service on port 8000 | `curl http://localhost/api/health` |
| Frontend | Built and served by Nginx | Visit `http://YOUR_VPS_IP` in your browser |
| Nginx | Running, proxying API requests | `systemctl status nginx` |
| Backups | Daily at 3 AM | `ls /var/backups/longentry/` |
| DataSender | Attached to 14 charts in MT5 | Check the Experts tab in MT5 |

**What happens next:**
- On Friday, the DataSender will upload ~2 years of H1 candle data to your server (first run takes a few minutes)
- Your dashboard will then show actual price data for all 14 markets
- In later phases, we'll add the analytics engine, backtest engine, and the trading EA

---

## Appendix A — Troubleshooting

### "Connection refused" when testing the backend

The backend isn't running. Check its status:
```bash
systemctl status longentry
```

If it's not running, check the logs for errors:
```bash
journalctl -u longentry -n 30
```

Common causes:
- Wrong database password in `.env`
- PostgreSQL not running (`systemctl start postgresql`)
- Port 8000 already in use by something else

### "Permission denied" errors

If you see "Permission denied" when running commands, add `sudo` before the command:
```bash
sudo systemctl restart longentry
```

### Dashboard shows "Loading..." forever

1. Check the backend: `curl http://localhost/api/health`
2. Check Nginx: `systemctl status nginx`
3. Check the browser console (press F12 → Console tab) for error messages
4. Make sure the API key is set in the dashboard (localStorage)

### DataSender shows errors in MT5

- **"WebRequest failed"** — Check that you added the server URL in Tools → Options → Expert Advisors → Allow WebRequest
- **"Invalid API key"** — Make sure you're using the original key (not the hash) in the EA inputs, and the hash in the `.env` file
- **"Unknown symbol"** — The symbol name in MT5 doesn't match what's in the database. Check what your broker calls the symbol and update accordingly.

### Database is full / disk space issues

Check disk space:
```bash
df -h /
```

Check database size:
```bash
psql -U longentry -d longentry -c "SELECT pg_size_pretty(pg_database_size('longentry'));"
```

If old backups are taking up space:
```bash
ls -lh /var/backups/longentry/
```

### How to read logs

Backend API logs:
```bash
journalctl -u longentry -f
```
(The `-f` flag shows live logs. Press `Ctrl+C` to stop.)

Or read the log files directly:
```bash
ls /var/log/longentry/
cat /var/log/longentry/api.log
```

---

## Appendix B — Quick Reference

Commands you'll use most often:

| Action | Command |
|--------|---------|
| Connect to VPS | `ssh root@YOUR_VPS_IP` |
| Check backend status | `systemctl status longentry` |
| Restart backend | `systemctl restart longentry` |
| View live backend logs | `journalctl -u longentry -f` |
| Check Nginx status | `systemctl status nginx` |
| Reload Nginx config | `systemctl reload nginx` |
| Test API health | `curl http://localhost/api/health` |
| Check database | `psql -U longentry -d longentry` |
| Count candles in DB | `psql -U longentry -d longentry -c "SELECT count(*) FROM candles;"` |
| Run a backup manually | `bash /opt/longentry/scripts/backup_db.sh` |
| Rebuild the frontend | `cd /opt/longentry/frontend && npm run build` |
| Check disk space | `df -h /` |
| Check memory usage | `free -h` |

---

*Setup Guide Version: 1.0 — Feb 14, 2026*
