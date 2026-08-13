# Scripts — Deno Hono Proxy

Scripts utilitarios para registrar y probar backends en el gateway.

---

## Prerrequisitos de ejecución

- Tener instalado el runtime de **Deno**.
- Verificar instalación con: `deno --version`

Si no lo tenés instalado, seguí la guía oficial: https://docs.deno.com/runtime/getting_started/installation/

---

## Archivos

| Archivo | Descripción |
|---------|-------------|
| `register-backend.ts` | Script standalone para registrar un backend en el KV Storage |
| `kv.ts` | Módulo con utilidades para interactuar con la API de KV Storage |
| `test-api.js` | Script de prueba que consulta el proxy y sus backends |
| `test-kv.js` | Script de prueba que lista los backends desde el KV Storage |
| `register-backend.config.json.example` | Ejemplo de configuración en formato JSON |
| `register-backend.env.example` | Ejemplo de configuración en formato `.env` |

---

## `register-backend.ts`

Script standalone para registrar un backend en el gateway a través del KV Storage. No requiere el proyecto completo: puede descargarse y ejecutarse de forma independiente.

### Uso básico

```bash
# Con URL completa
deno run -A register-backend.ts \
  --name=mi-api \
  --backend-url=http://192.168.1.100:3000 \
  --backend-token=secret123 \
  --prefix=/miapi \
  --registry-url=https://kv-storage-api.jferreyradev.deno.net \
  --api-key=my-key \
  --encryption-key=my-clave

# Con IP pública auto-detectada (útil detrás de NAT)
deno run -A register-backend.ts \
  --name=mi-api \
  --use-public-ip \
  --backend-port=3000 \
  --backend-token=secret123 \
  --registry-url=https://kv-storage-api.jferreyradev.deno.net \
  --api-key=my-key \
  --encryption-key=my-clave \
  --daemon
```

### Opciones

| Opción | Env var equivalente | Descripción |
|--------|---------------------|-------------|
| `--name=<nombre>` | `REGISTER_BACKEND_NAME` | *(Requerido)* Nombre único del backend |
| `--backend-token=<token>` | `REGISTER_BACKEND_TOKEN` | *(Requerido)* Token secreto del backend |
| `--backend-url=<url>` | `REGISTER_BACKEND_URL` | URL completa del backend |
| `--use-public-ip` | `REGISTER_USE_PUBLIC_IP` | Auto-detectar IP pública (alternativa a `--backend-url`) |
| `--backend-port=<puerto>` | `REGISTER_BACKEND_PORT` | Puerto del backend (requerido con `--use-public-ip`) |
| `--prefix=<prefix>` | `REGISTER_PREFIX` | Prefix de enrutamiento, ej: `/miapi` (default: `/<name>`) |
| `--registry-url=<url>` | `STORAGE_URL` | URL del KV Storage |
| `--api-key=<key>` | `API_KEY` | API key del KV Storage |
| `--encryption-key=<key>` | `ENCRYPTION_KEY` | Clave para encriptar el token del backend |
| `--daemon` | `REGISTER_DAEMON` | Modo daemon: re-registra automáticamente cada 30 minutos |
| `--config=<ruta>` | — | Ruta explícita a un archivo de configuración (`.json` o `.env`) |
| `--help`, `-h` | — | Mostrar ayuda |

### Orden de prioridad de configuración

Las opciones se resuelven de mayor a menor prioridad:

1. **Argumentos CLI** (`--nombre=valor`)
2. **Archivo de configuración** (auto-detectado o indicado con `--config`)
3. **Variables de entorno**
4. **Valores por defecto**

### Archivos de configuración (auto-detección)

Si no se pasa `--config`, el script busca en orden:

1. `./register-backend.config.json`
2. `./.register-backend.env`
3. `./register.config.json`

**Ejemplo JSON** (`register-backend.config.json`):

```json
{
  "name": "desa",
  "backend-url": "http://192.168.1.10:3004",
  "backend-token": "mi-token-secreto",
  "backend-port": 3004,
  "prefix": "/desa",
  "registry-url": "https://kv-storage-api.jferreyradev.deno.net",
  "api-key": "mi-api-key",
  "encryption-key": "mi-clave",
  "use-public-ip": false,
  "daemon": false
}
```

**Ejemplo `.env`** (`.register-backend.env`):

```env
NAME=desa
BACKEND_URL=http://192.168.1.10:3004
BACKEND_TOKEN=mi-token-secreto
BACKEND_PORT=3004
PREFIX=/desa
REGISTRY_URL=https://kv-storage-api.jferreyradev.deno.net
API_KEY=mi-api-key
ENCRYPTION_KEY=mi-clave
USE_PUBLIC_IP=false
DAEMON=false
```

Ver los archivos de ejemplo incluidos:
- [`register-backend.config.json.example`](./register-backend.config.json.example)
- [`register-backend.env.example`](./register-backend.env.example)

### Encriptación del token

El script encripta el token del backend antes de guardarlo en el KV Storage usando **Base64 + XOR** con la clave de encriptación indicada. Esto asegura que el token no se almacene en texto plano. La misma clave es necesaria para desencriptarlo al leerlo (ver `kv.ts`).

---

## `kv.ts`

Módulo TypeScript con utilidades para leer backends desde el KV Storage. Puede importarse desde otros scripts de Deno.

### Exports

#### `interface Backend`

```ts
interface Backend {
  key: string;
  name: string;
  url: string;
  prefix: string;
  token?: string;
}
```

#### `getBackendsFromKV(collection?, encryptionKey?)`

Obtiene todos los backends de una colección del KV Storage.

```ts
import { getBackendsFromKV } from "./kv.ts";

const backends = await getBackendsFromKV("backend", "mi-clave");
```

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `collection` | `string` | `"backend"` | Nombre de la colección en el KV Storage |
| `encryptionKey` | `string` | — | Clave para desencriptar tokens (opcional) |

#### `getBackendByName(name, collection?, encryptionKey?)`

Obtiene un backend específico por nombre.

```ts
import { getBackendByName } from "./kv.ts";

const backend = await getBackendByName("desa", "backend", "mi-clave");
```

#### `toProxyBackends(backends)`

Convierte una lista de backends al formato `Map<name, { name, url, token }>` compatible con el proxy.

```ts
import { getBackendsFromKV, toProxyBackends } from "./kv.ts";

const backends = await getBackendsFromKV();
const map = toProxyBackends(backends);
```

---

## `test-kv.js`

Script de prueba que lista todos los backends registrados en el KV Storage.

```bash
# Sin desencriptación de tokens
deno run --allow-net --allow-env test-kv.js

# Con desencriptación de tokens
ENCRYPTION_KEY=mi-clave deno run --allow-net --allow-env test-kv.js
```

**Output esperado:**

```
🧪 Test del KV Storage API

✅ Backends encontrados: 2

📦 desa
   URL: http://181.87.25.165:3004
   Prefix: /desa
   Token: desarrolla...

📦 produccion
   URL: http://10.0.0.1:3000
   Prefix: /prod
   Token: (no hay token)
```

---

## `test-api.js`

Script de prueba que realiza consultas al proxy para verificar que los backends responden correctamente. Consulta `/api/backends` y luego hace requests de prueba a `/ping` y `/query` por cada backend registrado.

```bash
node test-api.js
# o
deno run --allow-net test-api.js
```

> **Nota:** Requiere configurar `BASE_URL` y `PROXY_TOKEN` al inicio del archivo antes de ejecutarlo.

---

## Flujo típico de registro

```
[Tu servidor / PC]                    [KV Storage]              [Proxy Gateway]
       │                                    │                          │
       │  deno run register-backend.ts      │                          │
       │  --name=mi-api                     │                          │
       │  --backend-url=http://...          │                          │
       │  --backend-token=secreto           │                          │
       │                                    │                          │
       │  1. Encripta token (XOR+Base64)    │                          │
       │  2. POST /collections/backend ───► │                          │
       │  ◄──────────────────────────────── │                          │
       │     ✅ Backend registrado           │                          │
       │                                    │                          │
       │                              [En cada request]                │
       │                                    │                          │
       │                                    │ ◄── GET /collections/... │
       │                                    │ ────────────────────────►│
       │                                    │  Backends + tokens encr. │
```
