# Deno Proxy API

Proxy autenticado con Bearer token que rutea requests a backends registrados en un KV Storage externo.

## Estructura

```
deno-proxy/
├── deno.json
├── .env.example
├── .env                   # gitignored
├── client.js              # Demo client
├── src/
│   ├── main.ts            # Entry point
│   ├── config.ts          # Config desde env vars
│   ├── kv-client.ts       # Cliente HTTP para KV Storage
│   ├── seed.ts            # Bootstrap: genera .env + seed backends
│   ├── routes/
│   │   ├── admin.ts       # POST /api/admin/backends
│   │   ├── backends.ts    # GET /api/backends, GET /api/backends/:key
│   │   └── proxy.ts       # Catch-all: /:prefix/*
│   ├── middleware/
│   │   ├── auth.ts        # bearerAuth + adminAuth
│   │   └── logger.ts      # Request logging
└── README.md
```

## Setup Local

```bash
# Requisito: Deno instalado

# 1. Generar .env con tokens + seed backends en KV
deno task seed

# 2. Iniciar servidor
deno task dev    # http://localhost:8000
```

### Output del seed

```
=== Deno Proxy Seed ===

✓ PROXY_TOKEN generated: aBcDeFgHiJkLmNoPqRsTuVwXyZ...
✓ ADMIN_API_KEY generated: d6IQ6WIeNtt5ZuhhR0vI39wX...
✓ .env file created
✓ Backend 'concecpcion' already exists
✓ Backend 'desa' already exists
```

## Endpoints

### GET /health
Health check, no requiere auth.

```bash
curl http://localhost:8000/health
```

```json
{ "status": "ok" }
```

### GET /api/backends
Lista todos los backends registrados.

```bash
curl http://localhost:8000/api/backends \
  -H "Authorization: Bearer <PROXY_TOKEN>"
```

```json
{
  "backends": [
    {
      "key": "concecpcion",
      "data": { "name": "concecpcion", "url": "http://181.91.92.113:3008", "token": "DwYaDBYDAgFa", "prefix": "/conc" },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "count": 1
}
```

### GET /api/backends/:key
Detalle de un backend por su key.

```bash
curl http://localhost:8000/api/backends/concecpcion \
  -H "Authorization: Bearer <PROXY_TOKEN>"
```

```json
{
  "key": "concecpcion",
  "data": { "name": "concecpcion", "url": "http://181.91.92.113:3008", "token": "DwYaDBYDAgFa", "prefix": "/conc" },
  "createdAt": "...",
  "updatedAt": "...",
  "metadata": {}
}
```

### POST /api/admin/backends
Registra un nuevo backend.

```bash
curl -X POST http://localhost:8000/api/admin/backends \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: <ADMIN_API_KEY>" \
  -d '{"name":"produccion","url":"http://10.0.0.1:3000","token":"backend-token","prefix":"/prod"}'
```

```json
{ "message": "Backend registered", "name": "produccion" }
```

### /:prefix/*
Proxy reverso a un backend registrado.

```bash
curl http://localhost:8000/conc/api/datos \
  -H "Authorization: Bearer <PROXY_TOKEN>"
```

El proxy reenvía la request al backend cuyo prefix coincida, autenticándose con el token propio del backend. Responde con lo que devuelva el backend destino.

## Flujo de tokens

```
Cliente                      Proxy                        Backend destino
  │                           │                              │
  │  Bearer PROXY_TOKEN       │                              │
  │ ─────────────────────►    │                              │
  │                           │  Busca prefix en KV Storage  │
  │                           │  ─────────►                  │
  │                           │  ◄─────────                  │
  │                           │                              │
  │                           │  Bearer backend.token        │
  │                           │  ─────────────────────►      │
  │                           │  ◄─────────────────────      │
  │ ◄─────────────────────    │                              │
```

- **PROXY_TOKEN** (`.env`) → autentica al cliente contra el proxy
- **backend.token** (KV Storage) → autentica al proxy contra cada API destino
- **ADMIN_API_KEY** (`.env`) → autentica al admin para registrar backends

## Variables de Entorno

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `REGISTRY_URL` | Sí | - | URL del KV Storage |
| `API_KEY` | Sí | - | API key del KV Storage |
| `PROXY_TOKEN` | Sí | - | Token Bearer para acceder al proxy y listar backends |
| `ADMIN_API_KEY` | Sí | - | Token (header X-Admin-Token) para rutas admin |
| `PORT` | No | `8000` | Puerto del servidor |

## client.js

Script demo que prueba todos los endpoints. Lee `.env` automáticamente.

```bash
deno run --allow-net --allow-read client.js
# o con Node 18+
node client.js
```

## Deploy a Deno Deploy

### 1. Push a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tu-user/deno-proxy.git
git push -u origin main
```

### 2. Crear proyecto

1. Ve a https://dash.deno.com
2. Create project → Selecciona el repo
3. Entry point: `src/main.ts`

### 3. Configurar secrets

```bash
deployctl secret add PROXY_TOKEN "<del-.env>"
deployctl secret add ADMIN_API_KEY "<del-.env>"
deployctl secret add REGISTRY_URL "https://kv-storage-api.jferreyradev.deno.net"
deployctl secret add API_KEY "pi3_141516"
```

El deploy es automático al push.
