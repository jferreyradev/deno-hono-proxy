# Flujo de Trabajo — Deno Proxy

## Arquitectura General

```
┌──────────┐     ┌──────────────────────────────────┐     ┌──────────────┐
│ Cliente  │────▶│         Deno Proxy               │────▶│ Backend      │
│ (curl,   │     │  src/main.ts                     │     │ Destino      │
│  app,    │     │  ┌────────────────────────────┐  │     │ (API propia) │
│  etc.)   │     │  │ Middleware: logger, auth    │  │     └──────────────┘
│          │     │  │ Router:                     │  │                   
│          │     │  │  /health                    │  │     ┌──────────────┐
│          │     │  │  /api/admin/backends  (POST)│  │     │ KV Storage   │
│          │     │  │  /api/backends        (GET) │  │     │ (externo)    │
│          │     │  │  /:prefix/*           (ALL) │  │     │              │
│          │     │  └────────────────────────────┘  │     │              │
└──────────┘     └──────────────────────────────────┘     └──────────────┘
```

---

## Componentes

| Archivo | Rol |
|---|---|
| `src/main.ts` | Entry point. Monta todas las rutas e inicia el servidor. |
| `src/config.ts` | Lee variables de entorno y las exporta como objeto `config`. |
| `src/kv-client.ts` | Cliente HTTP para el KV Storage externo (CRUD de backends). |
| `src/middleware/auth.ts` | Middlewares `bearerAuth` y `adminAuth`. |
| `src/middleware/logger.ts` | Logging de requests. |
| `src/routes/proxy.ts` | Proxy reverso: recibe request, la reenvía al backend destino. |
| `src/routes/admin.ts` | Registro de backends (admin). |
| `src/routes/backends.ts` | Consulta de backends registrados. |
| `src/seed.ts` | Script de bootstrap: genera `.env` con tokens y seed de backends iniciales. |

---

## Flujo de Autenticación

### Capa 1: Cliente → Proxy

El cliente debe enviar el header `Authorization: Bearer <PROXY_TOKEN>`.

El middleware `bearerAuth` (`src/middleware/auth.ts:4`) lo valida contra `config.proxyToken`. Si no coincide, responde `401 Unauthorized`.

```bash
# Ejemplo
curl https://proxy.deno.dev/conc/api/datos \
  -H "Authorization: Bearer mi-proxy-token"
```

### Capa 2: Admin → Proxy

El admin debe enviar el header `X-Admin-Token: <ADMIN_API_KEY>`.

El middleware `adminAuth` (`src/middleware/auth.ts:16`) lo valida contra `config.adminApiKey`. Si no coincide, responde `403 Forbidden`.

```bash
curl -X POST https://proxy.deno.dev/api/admin/backends \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: mi-admin-key" \
  -d '{ ... }'
```

### Capa 3: Proxy → Backend

El proxy **reemplaza** el header `Authorization` por `Bearer <backend.token desencriptado>`.

- Lee `backend.token` del KV Storage (encriptado)
- Lo desencripta con `ENCRYPTION_KEY`
- Envía el token en texto plano al backend destino

El cliente **nunca** conoce el token del backend.

---

## Flujo de Encriptación de Tokens

### Al registrar un backend

```
Texto plano          Encryptación                   KV Storage
"mi-token-secreto" ──────────────▶ "XyZ...AbC==" ──────────▶ guardado
                  encryptToken()    (XOR + base64)          encriptado
```

La función `encryptToken()` en `src/routes/admin.ts`:
1. Codifica el token a UTF-8 bytes
2. Aplica XOR byte a byte con `ENCRYPTION_KEY` (se repite cíclicamente)
3. Codifica el resultado en base64

### Al reenviar una request al backend

```
KV Storage                       Desencryptación             Backend
"XyZ...AbC==" ──────────────────▶ "mi-token-secreto" ──────▶ Bearer
               decryptToken()     (base64 decode + XOR)      enviado
```

La función `decryptToken()` en `src/routes/proxy.ts`:
1. Decodifica base64 a bytes
2. Aplica XOR byte a byte con `ENCRYPTION_KEY`
3. Decodifica UTF-8 a texto plano

Ambas funciones usan el mismo algoritmo XOR simétrico con la misma clave.

---

## Flujo de una Request Completa

```
Cliente                          Proxy                           KV Storage          Backend
  │                                │                                │                   │
  │  1. GET /conc/api/datos        │                                │                   │
  │     Authorization: Bearer XXX  │                                │                   │
  │ ──────────────────────────────▶│                                │                   │
  │                                │                                │                   │
  │                                │  2. bearerAuth valida token    │                   │
  │                                │     ¿PROXY_TOKEN? ──no──▶ 401 │                   │
  │                                │     ──sí── continúa            │                   │
  │                                │                                │                   │
  │                                │  3. Extrae prefix "/conc"      │                   │
  │                                │                                │                   │
  │                                │  4. GET /collections/backend   │                   │
  │                                │ ──────────────────────────────▶│                   │
  │                                │ ◀──────────────────────────────│                   │
  │                                │    [{ prefix: "/conc",         │                   │
  │                                │       token: "DwYa...", ... }] │                   │
  │                                │                                │                   │
  │                                │  5. Busca backend por prefix   │                   │
  │                                │     Encuentra "concecpcion"    │                   │
  │                                │                                │                   │
  │                                │  6. Construye targetUrl:       │                   │
  │                                │     http://181.91.92.113:3008  │                   │
  │                                │     /api/datos                 │                   │
  │                                │                                │                   │
  │                                │  7. Desencripta token:         │                   │
  │                                │     decryptToken("DwYa...")    │                   │
  │                                │     → "DwYaDBYDAgFa"           │                   │
  │                                │                                │                   │
  │                                │  8. GET /api/datos             │                   │
  │                                │     Authorization: Bearer      │                   │
  │                                │     DwYaDBYDAgFa               │                   │
  │                                │ ───────────────────────────────────────────────▶│
  │                                │                                │                   │
  │                                │  9. Respuesta del backend      │                   │
  │                                │ ◀───────────────────────────────────────────────│
  │                                │                                │                   │
  │                                │ 10. Agrega headers:            │                   │
  │                                │     X-Proxied-By: deno-proxy   │                   │
  │                                │     X-Backend: concecpcion     │                   │
  │                                │                                │                   │
  │ 11. Respuesta al cliente       │                                │                   │
  │ ◀──────────────────────────────│                                │                   │
  │                                │                                │                   │
```

---

## Registro de Backends (Admin)

### Request

```http
POST /api/admin/backends
Content-Type: application/json
X-Admin-Token: <ADMIN_API_KEY>

{
  "name": "produccion",
  "url": "http://10.0.0.1:3000",
  "token": "token-en-texto-plano",
  "prefix": "/prod"
}
```

### Proceso

1. `adminAuth` valida el `X-Admin-Token` contra `ADMIN_API_KEY`
2. Valida que `name`, `url`, `token`, `prefix` estén presentes
3. `encryptToken()` encripta el `token` con `ENCRYPTION_KEY`
4. `createBackend()` guarda en KV Storage el objeto con el token ya encriptado

### Respuesta

```json
{
  "message": "Backend registered",
  "name": "produccion"
}
```

---

## Seed Inicial

El script `seed.ts` realiza el bootstrap inicial:

1. Genera `PROXY_TOKEN` y `ADMIN_API_KEY` aleatorios si no existen
2. Escribe el archivo `.env`
3. Crea backends predefinidos en KV Storage con tokens **ya encriptados** (deben estar pre-encriptados con `ENCRYPTION_KEY`)

```bash
deno task seed
```

---

## Variables de Entorno

| Variable | Dónde se usa | Función |
|---|---|---|
| `REGISTRY_URL` | `kv-client.ts` | URL base del KV Storage externo |
| `API_KEY` | `kv-client.ts` | Bearer token para autenticarse contra el KV Storage |
| `PROXY_TOKEN` | `middleware/auth.ts` | Token que el cliente envía para usar el proxy |
| `ADMIN_API_KEY` | `middleware/auth.ts` | Token que el admin envía vía `X-Admin-Token` |
| `ENCRYPTION_KEY` | `routes/proxy.ts`, `routes/admin.ts` | Clave XOR para encriptar/desencriptar tokens de backends |
| `PORT` | `main.ts` | Puerto del servidor (no aplica en Deno Deploy) |

### Diagrama de dependencia entre variables

```
Cliente ──── PROXY_TOKEN ────▶ Proxy ──── ENCRYPTION_KEY ────▶ Backend
 Admin ───── ADMIN_API_KEY ──▶ Proxy
 Proxy ───── API_KEY ─────────▶ KV Storage
```
