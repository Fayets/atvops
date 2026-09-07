# Deploy de ATV Ops en el VPS

Mismo patrón que el resto de los sistemas: repo en `/opt/atv-ops`, un
`docker-compose.yml` con backend + frontend, nginx del host por subdominio.

| | Puerto host | Interno |
|---|---|---|
| backend (FastAPI) | **8012** | 8000 |
| frontend (nginx estático) | **8092** | 80 |
| dominio | `ops.atvos.io` | |

## Primera vez

```bash
cd /opt && git clone <remoto> atv-ops && cd atv-ops
mkdir -p /opt/atv-ops/data/fotos
cp backend/.env.template backend/.env && nano backend/.env   # ver abajo
cp deploy/ops.atvos.io.conf /etc/nginx/sites-enabled/ops.atvos.io
nginx -t && systemctl reload nginx
certbot --nginx -d ops.atvos.io
docker compose up -d --build
curl -s https://ops.atvos.io/health
```

## `backend/.env` en el server

```ini
DB_PROVIDER=postgres
DB_SCHEMA=ops
DB_HOST=<host de la Neon compartida>
DB_PORT=5432
DB_USER=<usuario>
DB_PASS=<clave>
DB_NAME=neondb
DB_SSLMODE=require

SEED_FRANCO_PASSWORD=<clave real de franco>
SEED_MAURI_PASSWORD=<clave real de mauri>
SECRET_KEY=<cadena larga aleatoria>

CORS_ORIGINS=https://ops.atvos.io
TRANSCRIPTS_BASE_PATH=/opt/atv-clients/transcripts

ATV_CLIENTS_API_URL=https://clients.atvos.io
ATV_CLIENTS_AGENT_KEY=<misma que ADMIN_API_KEY de atv-clients>
ATV_MKT_API_URL=http://72.60.244.220:8001
ATV_MKT_AGENT_KEY=<key>
```

Al arrancar, el backend crea el esquema `ops` en la base compartida, sus
tablas (`usuarios`, `integrantes`, `reuniones`, `reunion_integrante`, `ideas`)
y siembra a `franco` (admin) y `mauri` (csm) con las claves del `.env`.
Sin `SEED_*_PASSWORD` **no** crea ese usuario: en el server no hay claves por
defecto.

## Cada deploy

```bash
cd /opt/atv-ops && git config pull.rebase false && git pull origin master && docker compose up -d --build
```

## Qué monta

- `/opt/atv-clients/transcripts` → solo lectura: los transcripts del bot de
  Discord de ATV Clients. Es la fuente de Fulfillment; no se duplica nada.
- `/opt/atv-ops/data` → fotos de integrantes. La base ya no vive acá.
