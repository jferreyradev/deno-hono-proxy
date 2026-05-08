# Deno Proxy API

Proxy con autenticación JWT que rutea requests a backends registrados en un KV Storage externo.

## Estructura

```
deno-proxy/
├── deno.json
├── .env.example
├── .env                   # gitignored
├── src/
│   ├── main.ts            # Entry point
│   ├── config.ts          # Configuración desde env vars
│   ├── kv-client.ts       # Cliente KV Storage API
│   ├── auth/
│   │   ├── jwt.ts         # Generación y validación JWT
│   │   └── hash.ts        # Hash de contraseñas (PBKDF2)
│   ├── routes/
│   │   ├── auth.ts        # POST /api/auth/login
│   │   ├── admin.ts       # POST /api/admin/users, POST /api/admin/backends
│   │   ├── backends.ts    # GET /api/backends, GET /api/backends/:key
│   │   └── proxy.ts       # Catch-all: /:prefix/*
│   ├── middleware/
│   │   ├── auth.ts        # JWT y admin auth
│   │   └── logger.ts      # Request logging
│   └── seed.ts            # Bootstrap inicial
└── README.md
```

## Setup Local

### 1. Requisitos

- [Deno](https://deno.com/) instalado
- Acceso al KV Storage (ya configurado)

### 2. Inicializar

```bash
# Clonar o crear el proyecto
cd deno-proxy

# Ejecutar seed (genera .env, crea admin y backends)
deno task seed
```

Output del seed:
```
=== Deno Proxy Seed ===

✓ JWT_SECRET generated: N1FP9lvgwtzt6hxMC4UQCfok...
✓ ADMIN_API_KEY generated: d6IQ6WIeNtt5ZuhhR0vI39wX...
✓ .env file created
✓ Admin user created: admin / admin123
✓ Backend 'concecpcion' already exists
✓ Backend 'desa' already exists

=== Deno Deploy Setup ===
Run these commands to configure Deno Deploy:
  deployctl secret add JWT_SECRET "N1FP9lvgwtzt6hxMC4UQCfok..."
  deployctl secret add ADMIN_API_KEY "d6IQ6WIeNtt5ZuhhR0vI39wX..."
```

**Guarda los secretos generados** - los necesitarás para Deno Deploy.

### 3. Correr

```bash
# Desarrollo (con watch)
deno task dev

# Producción
deno task start
```

Servidor corriendo en `http://localhost:8000`

## Endpoints

### Auth

**POST /api/auth/login** - Obtener JWT token

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Consulta de Backends (requiere JWT)

**GET /api/backends** - Listar todos los backends

```bash
curl http://localhost:8000/api/backends \
  -H "Authorization: Bearer <tu-jwt-token>"
```

**GET /api/backends/:key** - Detalle de un backend

```bash
curl http://localhost:8000/api/backends/concecpcion \
  -H "Authorization: Bearer <tu-jwt-token>"
```

### Admin (requiere ADMIN_API_KEY)

**POST /api/admin/users** - Crear usuario

```bash
curl -X POST http://localhost:8000/api/admin/users \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: tu-admin-api-key" \
  -d '{"username":"nuevo","password":"secreto","role":"user"}'
```

**POST /api/admin/backends** - Registrar backend

```bash
curl -X POST http://localhost:8000/api/admin/backends \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: tu-admin-api-key" \
  -d '{"name":"produccion","url":"http://10.0.0.1:3000","token":"backend-token","prefix":"/prod"}'
```

### Proxy (requiere JWT)

**/:prefix/*** - Proxy al backend matching prefix

```bash
# Forward a backend "concecpcion" (prefix /conc)
curl http://localhost:8000/conc/api/datos \
  -H "Authorization: Bearer <tu-jwt-token>"

# Forward a backend "desa" (prefix /desa)
curl http://localhost:8000/desa/api/usuarios \
  -H "Authorization: Bearer <tu-jwt-token>"
```

El proxy:
1. Valida el JWT
2. Extrae el prefix del path (`/conc`, `/desa`)
3. Busca el backend con ese prefix en KV Storage
4. Forward el request al backend con su token
5. Retorna la respuesta del backend

### Health Check

**GET /health** - Sin auth

```bash
curl http://localhost:8000/health
# {"status":"ok"}
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

### 2. Crear proyecto en Deno Deploy

1. Ve a https://dash.deno.com
2. Create project → Selecciona el repo
3. Entry point: `src/main.ts`

### 3. Configurar variables de entorno

En Settings → Secrets del proyecto, agrega:

| Variable | Valor |
|----------|-------|
| `REGISTRY_URL` | `https://kv-storage-api.jferreyradev.deno.net` |
| `API_KEY` | `pi3_141516` |
| `JWT_SECRET` | `<el generado por el seed>` |
| `ADMIN_API_KEY` | `<el generado por el seed>` |

O usa la CLI:

```bash
deployctl secret add JWT_SECRET "N1FP9lvgwtzt6hxMC4UQCfok..."
deployctl secret add ADMIN_API_KEY "d6IQ6WIeNtt5ZuhhR0vI39wX..."
```

### 4. Deploy

El deploy es automático al hacer push a la branch configurada.

## Variables de Entorno

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `REGISTRY_URL` | Sí | - | URL del KV Storage |
| `API_KEY` | Sí | - | API key del KV Storage |
| `JWT_SECRET` | Sí | - | Secreto para firmar JWTs |
| `ADMIN_API_KEY` | Sí | - | Secreto para rutas admin |
| `PORT` | No | `8000` | Puerto del servidor |

## Credenciales por Defecto

| Rol | Username | Password |
|-----|----------|----------|
| Admin | `admin` | `admin123` |

**Cambia la contraseña del admin después del primer login.**

## Flujo de Trabajo

```
1. deno task seed              # Primera vez: genera .env, crea admin
2. deno task dev               # Desarrollo con watch
3. POST /api/auth/login        # Obtener JWT
4. GET /conc/api/datos         # Usar proxy con JWT
5. git push                    # Auto-deploy a Deno Deploy
```
