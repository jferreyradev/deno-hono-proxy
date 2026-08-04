# Guía Rápida: Registrar un Backend en cada Host

Este documento explica cómo usar el script `register-backend.ts` para registrar un backend en el gateway desde cualquier host.

## Prerrequisitos

Necesitás tener 3 credenciales del gateway:

| Variable | Descripción |
|----------|-------------|
| `STORAGE_URL` | URL del KV Storage del gateway |
| `API_KEY` | API key de autenticación |
| `ENCRYPTION_KEY` | Clave de encriptación de tokens |

---

## Opciones de Registro

### Opción 1: Línea de comandos directa

La forma más simple, pasando todos los parámetros directamente:

```bash
deno run -A src/scripts/register-backend.ts \
  --name=mi-api \
  --backend-url=http://192.168.1.100:3000 \
  --backend-token=mi-token-secreto \
  --prefix=/miapi \
  --registry-url=https://tu-kv-storage.deno.dev \
  --api-key=mi-api-key \
  --encryption-key=mi-clave
```

---

### Opción 2: Archivo de configuración JSON (recomendado por host)

Crear `register-backend.config.json` en el directorio del host:

```json
{
  "name": "mi-api",
  "backend-url": "http://192.168.1.100:3000",
  "backend-token": "mi-token-secreto",
  "prefix": "/miapi",
  "registry-url": "https://tu-kv-storage.deno.dev",
  "api-key": "mi-api-key",
  "encryption-key": "mi-clave"
}
```

Luego ejecutar simplemente:

```bash
deno run -A register-backend.ts
```

El script auto-detecta archivos de configuración en este orden:
1. `register-backend.config.json`
2. `.register-backend.env`
3. `register.config.json`

O especificar el archivo explícitamente:

```bash
deno run -A register-backend.ts --config=./mi-config.json
```

---

### Opción 3: Archivo `.env`

Crear `.register-backend.env`:

```env
NAME=mi-api
BACKEND_URL=http://192.168.1.100:3000
BACKEND_TOKEN=mi-token-secreto
REGISTRY_URL=https://tu-kv-storage.deno.dev
API_KEY=mi-api-key
ENCRYPTION_KEY=mi-clave
```

Luego ejecutar:

```bash
deno run -A register-backend.ts
```

---

### Opción 4: Variables de entorno

Exportar las credenciales del gateway una sola vez y omitirlas en el comando:

```bash
export STORAGE_URL=https://tu-kv-storage.deno.dev
export API_KEY=mi-api-key
export ENCRYPTION_KEY=mi-clave

deno run -A register-backend.ts \
  --name=mi-api \
  --backend-url=http://192.168.1.100:3000 \
  --backend-token=mi-token-secreto
```

Variables de entorno disponibles:

| Variable | Descripción |
|----------|-------------|
| `STORAGE_URL` | URL del KV Storage |
| `API_KEY` | API key para autenticación |
| `ENCRYPTION_KEY` | Clave para encriptar tokens |
| `REGISTER_BACKEND_NAME` | Nombre del backend |
| `REGISTER_BACKEND_URL` | URL del backend |
| `REGISTER_BACKEND_TOKEN` | Token del backend |
| `REGISTER_BACKEND_PORT` | Puerto del backend |
| `REGISTER_PREFIX` | Prefix de enrutamiento |
| `REGISTER_USE_PUBLIC_IP` | Usar detección de IP pública (`true`/`false`) |
| `REGISTER_DAEMON` | Modo daemon (`true`/`false`) |

---

## Casos especiales

### Host con IP dinámica (detrás de NAT/router)

Usar `--use-public-ip` para detectar la IP pública automáticamente:

```bash
deno run -A register-backend.ts \
  --name=mi-api \
  --use-public-ip \
  --backend-port=3000 \
  --backend-token=mi-token-secreto \
  --registry-url=https://tu-kv-storage.deno.dev \
  --api-key=mi-api-key \
  --encryption-key=mi-clave
```

### Modo daemon (IP que puede cambiar)

Agrega `--daemon` para re-registrar automáticamente cada 30 minutos si la IP cambia:

```bash
deno run -A register-backend.ts \
  --name=mi-api \
  --use-public-ip \
  --backend-port=3000 \
  --backend-token=mi-token-secreto \
  --registry-url=https://tu-kv-storage.deno.dev \
  --api-key=mi-api-key \
  --encryption-key=mi-clave \
  --daemon
```

> El daemon verifica cada 30 minutos y solo re-registra si la IP cambió. Presioná `Ctrl+C` para detenerlo.

---

## Prioridad de configuración

Cuando se combinan múltiples fuentes, se aplica la siguiente prioridad (de mayor a menor):

| Prioridad | Fuente |
|-----------|--------|
| 1 (mayor) | Argumentos `--clave=valor` en CLI |
| 2 | Archivo de configuración (`--config=archivo`) |
| 3 | Variables de entorno |
| 4 (menor) | Valores por defecto |

**Ejemplo:** Si `register-backend.config.json` tiene `backend-url=http://default:3000` pero pasás `--backend-url=http://override:3000` por CLI, se usará `http://override:3000`.

---

## Referencia rápida de parámetros

| Parámetro CLI | Descripción | Obligatorio |
|---------------|-------------|-------------|
| `--name=<nombre>` | Nombre del backend | ✅ |
| `--backend-token=<token>` | Token secreto del backend | ✅ |
| `--backend-url=<url>` | URL completa del backend | ✅ (o `--use-public-ip`) |
| `--use-public-ip` | Detectar IP pública automáticamente | ✅ (o `--backend-url`) |
| `--backend-port=<puerto>` | Puerto del backend (requerido con `--use-public-ip`) | Condicional |
| `--registry-url=<url>` | URL del KV Storage | ✅ |
| `--api-key=<key>` | API key del gateway | ✅ |
| `--encryption-key=<key>` | Clave de encriptación | ✅ |
| `--prefix=<prefix>` | Prefix para enrutamiento (ej: `/miapi`) | No |
| `--daemon` | Modo daemon: re-registrar cada 30 min | No |
| `--config=<ruta>` | Ruta a archivo de configuración | No |
| `--help`, `-h` | Mostrar ayuda | No |

---

## Ayuda

```bash
deno run -A register-backend.ts --help
```
