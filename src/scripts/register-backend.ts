#!/usr/bin/env deno run --allow-net --allow-env
/**
 * Script standalone para registrar backends en el gateway
 * Se puede descargar y ejecutar sin necesidad del proyecto completo
 * 
 * Uso:
 *   deno run -A https://raw.githubusercontent.com/.../register-backend-standalone.ts \
 *     --name=mi-api --use-public-ip --backend-port=3000 --backend-token=secret --daemon
 * 
 * O descargarlo y ejecutar localmente:
 *   curl -O https://raw.githubusercontent.com/.../register-backend-standalone.ts
 *   deno run -A register-backend-standalone.ts --name=mi-api --use-public-ip --daemon
 */

// ============================================================================
// CONFIGURACIÓN - Editar aquí o pasar por variables de entorno
// ============================================================================

const CONFIG = {
  STORAGE_URL: Deno.env.get("STORAGE_URL") || "",
  API_KEY: Deno.env.get("API_KEY") || "",
  ENCRYPTION_KEY: Deno.env.get("ENCRYPTION_KEY") || "",
};

// ============================================================================
// FUNCIONES DE ENCRIPTACIÓN - Base64 + XOR (Simple y reversible)
// ============================================================================

/**
 * Encripta un token usando Base64 + XOR
 * XOR es reversible: XOR(XOR(data, key)) = data
 * @param token - Token a encriptar
 * @param encryptionKey - Clave de encriptación
 * @returns Token encriptado en formato base64
 */
function encryptToken(token: string, encryptionKey: string): string {
  if (!encryptionKey) {
    throw new Error("Encryption key is required");
  }

  const encoder = new TextEncoder();
  const tokenBytes = encoder.encode(token);
  const keyBytes = encoder.encode(encryptionKey);
  
  const xorData = new Uint8Array(tokenBytes.length);
  for (let i = 0; i < tokenBytes.length; i++) {
    xorData[i] = tokenBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return btoa(String.fromCharCode(...xorData));
}

// ============================================================================
// DETECCIÓN DE IP PÚBLICA
// ============================================================================

async function getPublicIP(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.ip;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timeout al obtener IP pública (5s)");
    }
    throw new Error(`Error al obtener IP pública: ${error}`);
  }
}

// ============================================================================
// CARGA DE ARCHIVOS DE CONFIGURACIÓN
// ============================================================================

/**
 * Lee un archivo .env y retorna un objeto con KEY=VALUE
 * @param filePath - Ruta del archivo .env
 * @returns Objeto con pares clave-valor
 */
async function loadEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    const content = await Deno.readTextFile(filePath);
    const config: Record<string, string> = {};
    
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Ignorar líneas vacías y comentadas
      if (!trimmed || trimmed.startsWith("#")) continue;
      
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        config[key.trim()] = value.trim();
      }
    }
    
    return config;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }
    throw new Error(`Error al leer archivo .env '${filePath}': ${error}`);
  }
}

/**
 * Lee un archivo JSON de configuración
 * @param filePath - Ruta del archivo JSON
 * @returns Objeto con la configuración parseada
 */
async function loadJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await Deno.readTextFile(filePath);
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Error: Archivo JSON inválido '${filePath}': ${error.message}`);
    }
    throw new Error(`Error al leer archivo JSON '${filePath}': ${error}`);
  }
}

/**
 * Carga configuración desde archivos de configuración
 * Auto-detecta formatos: register-backend.config.json, .register-backend.env, register.config.json
 * @param configPath - Ruta del archivo de configuración (opcional)
 * @returns Objeto con configuración combinada
 */
async function loadConfigFile(configPath?: string): Promise<Record<string, unknown>> {
  // Si se proporciona ruta explícita, usarla
  if (configPath) {
    if (configPath.endsWith(".json")) {
      return await loadJsonFile(configPath);
    } else {
      return convertEnvToConfig(await loadEnvFile(configPath));
    }
  }

  // Auto-detectar en orden de preferencia
  const possiblePaths = [
    "./register-backend.config.json",
    "./.register-backend.env",
    "./register.config.json",
  ];

  for (const path of possiblePaths) {
    try {
      if (path.endsWith(".json")) {
        const config = await loadJsonFile(path);
        if (Object.keys(config).length > 0) {
          console.log(`📁 Configuración cargada desde: ${path}`);
          return config;
        }
      } else {
        const envConfig = await loadEnvFile(path);
        if (Object.keys(envConfig).length > 0) {
          console.log(`📁 Configuración cargada desde: ${path}`);
          return convertEnvToConfig(envConfig);
        }
      }
    } catch {
      // Ignorar errores y continuar con el siguiente archivo
      continue;
    }
  }

  return {};
}

/**
 * Convierte variables de entorno a objeto de configuración normalizado
 * @param envConfig - Objeto con pares KEY=VALUE de archivo .env
 * @returns Objeto con configuración normalizada
 */
function convertEnvToConfig(envConfig: Record<string, string>): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  const keyMap: Record<string, string> = {
    "NAME": "name",
    "BACKEND_URL": "backend-url",
    "BACKEND_TOKEN": "backend-token",
    "BACKEND_PORT": "backend-port",
    "PREFIX": "prefix",
    "REGISTRY_URL": "registry-url",
    "API_KEY": "api-key",
    "ENCRYPTION_KEY": "encryption-key",
    "USE_PUBLIC_IP": "use-public-ip",
    "DAEMON": "daemon",
  };

  for (const [envKey, value] of Object.entries(envConfig)) {
    const configKey = keyMap[envKey];
    if (configKey) {
      // Convertir valores booleanos
      if (value.toLowerCase() === "true" || value.toLowerCase() === "false") {
        config[configKey] = value.toLowerCase() === "true";
      } else {
        config[configKey] = value;
      }
    }
  }

  return config;
}

// ============================================================================
// REGISTRO EN KV STORAGE
// ============================================================================

async function registerBackend(
  name: string,
  url: string,
  token: string,
  prefix: string | undefined,
  storageUrl: string,
  apiKey: string,
  encryptionKey: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const encryptedToken = encryptToken(token, encryptionKey);

  const timestamp = new Date().toISOString();
  
  const backendData = {
    name,
    url,
    token: encryptedToken,
    prefix: prefix || `/${name}`,
  };

  const backendMetadata = {
    registered_at: metadata?.registered_at as string || timestamp,
    last_update: timestamp,
    ...metadata,
  };

  // Verificar si existe
  let existsResponse;
  try {
    existsResponse = await fetch(`${storageUrl}/collections/backend/${name}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });
  } catch {
    existsResponse = { ok: false, status: 404 } as Response;
  }

  let response;

  // Si existe, actualizar con PUT
  if (existsResponse.ok) {
    response = await fetch(`${storageUrl}/collections/backend/${name}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: backendData,
        metadata: backendMetadata,
      }),
    });
  } else {
    // Si no existe, crear con POST
    response = await fetch(`${storageUrl}/collections/backend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        key: name,
        data: backendData,
        metadata: backendMetadata,
      }),
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Error al registrar: ${response.status} - ${text}`);
  }

  console.log(`✅ Backend '${name}' registrado exitosamente`);
  console.log(`   URL: ${url}`);
  console.log(`   Prefix: ${backendData.prefix}`);
  console.log(`   Timestamp: ${backendMetadata.last_update}`);
}

// ============================================================================
// ARGUMENTOS DE LÍNEA DE COMANDOS
// ============================================================================

interface ParsedArgs {
  name?: string;
  "backend-url"?: string;
  "backend-token"?: string;
  "backend-port"?: string;
  prefix?: string;
  "registry-url"?: string;
  "api-key"?: string;
  "encryption-key"?: string;
  "use-public-ip"?: boolean;
  daemon?: boolean;
  config?: string;
  help?: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--use-public-ip") {
      parsed["use-public-ip"] = true;
      continue;
    }

    if (arg === "--daemon") {
      parsed.daemon = true;
      continue;
    }

    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) {
      const [, key, value] = match;
      parsed[key as keyof ParsedArgs] = value as never;
    }
  }

  return parsed;
}

// ============================================================================
// RESOLUCIÓN DE CONFIGURACIÓN (Cascada: CLI > Archivo > Env Vars > Defaults)
// ============================================================================

/**
 * Resuelve configuración aplicando cascada de prioridad
 * Prioridad: CLI > Archivo Config > Variables de Entorno > Defaults
 * 
 * @param cliArgs - Argumentos parseados de línea de comandos
 * @param fileConfig - Configuración del archivo
 * @returns Configuración resuelta
 */
function resolveConfig(
  cliArgs: ParsedArgs,
  fileConfig: Record<string, unknown>
): ParsedArgs {
  const resolved: ParsedArgs = {};

  // Todas las claves posibles que podemos resolver
  const keys: (keyof ParsedArgs)[] = [
    "name",
    "backend-url",
    "backend-token",
    "backend-port",
    "prefix",
    "registry-url",
    "api-key",
    "encryption-key",
    "use-public-ip",
    "daemon",
  ];

  for (const key of keys) {
    // Nivel 1: Argumentos CLI (máxima prioridad)
    if (cliArgs[key] !== undefined) {
      resolved[key] = cliArgs[key] as never;
      continue;
    }

    // Nivel 2: Archivo de configuración
    if (fileConfig[key] !== undefined) {
      resolved[key] = fileConfig[key] as never;
      continue;
    }

    // Nivel 3: Variables de entorno
    const envKey = getEnvKeyForConfigKey(key);
    if (envKey) {
      const envValue = Deno.env.get(envKey);
      if (envValue !== undefined) {
        if (key === "use-public-ip" || key === "daemon") {
          resolved[key] = (envValue.toLowerCase() === "true") as never;
        } else {
          resolved[key] = envValue as never;
        }
        continue;
      }
    }

    // Nivel 4: CONFIG global (fallback)
    if (key === "registry-url") {
      resolved[key] = CONFIG.STORAGE_URL || undefined;
    } else if (key === "api-key") {
      resolved[key] = CONFIG.API_KEY || undefined;
    } else if (key === "encryption-key") {
      resolved[key] = CONFIG.ENCRYPTION_KEY || undefined;
    }
  }

  // Agregar help si está presente en CLI
  if (cliArgs.help) {
    resolved.help = true;
  }

  return resolved;
}

/**
 * Convierte una clave de configuración a su nombre de variable de entorno
 * @param key - Clave de configuración (ej: "backend-token")
 * @returns Nombre de variable de entorno (ej: "BACKEND_TOKEN")
 */
function getEnvKeyForConfigKey(key: keyof ParsedArgs): string | null {
  const keyMap: Record<string, string> = {
    "name": "REGISTER_BACKEND_NAME",
    "backend-url": "REGISTER_BACKEND_URL",
    "backend-token": "REGISTER_BACKEND_TOKEN",
    "backend-port": "REGISTER_BACKEND_PORT",
    "prefix": "REGISTER_PREFIX",
    "registry-url": "STORAGE_URL",
    "api-key": "API_KEY",
    "encryption-key": "ENCRYPTION_KEY",
    "use-public-ip": "REGISTER_USE_PUBLIC_IP",
    "daemon": "REGISTER_DAEMON",
  };

  return keyMap[key] || null;
}

// ============================================================================
// AYUDA
// ============================================================================

function showHelp(): void {
  console.log(`
Script Standalone de Registro de Backend
=========================================

Uso:
  deno run -A register-backend.ts [opciones]

ARCHIVO DE CONFIGURACIÓN
========================
Auto-detecta archivos de configuración (en orden de preferencia):
  1. register-backend.config.json (JSON)
  2. .register-backend.env (.env)
  3. register.config.json (JSON)

O especifica el archivo explícitamente:
  --config=<ruta>             Ruta al archivo de configuración (.env o .json)

Ejemplo:
  deno run -A register-backend.ts --config=./config.json

OPCIONES OBLIGATORIAS (desde CLI, archivo o env vars):
  --name=<nombre>              Nombre del backend
  --backend-token=<token>      Token secreto del backend
  
  Y una de estas:
    --backend-url=<url>        URL completa del backend
    O
    --use-public-ip            Detectar IP pública automáticamente
    (si usa --use-public-ip, debe incluir --backend-port=<puerto>)

Opciones de configuración del KV Storage:
  --registry-url=<url>         URL del KV Storage (env: STORAGE_URL)
  --api-key=<key>             API key (env: API_KEY)
  --encryption-key=<key>      Clave de encriptación (env: ENCRYPTION_KEY)

Opciones adicionales:
  --prefix=<prefix>           Prefix para el enrutamiento (ej: /miapi)
  --use-public-ip             Detectar IP pública automáticamente
  --backend-port=<puerto>     Puerto del backend (si --use-public-ip)
  --daemon                    Modo daemon: re-registrar cada 30 minutos
  --help, -h                  Mostrar esta ayuda

ORDEN DE PRIORIDAD DE CONFIGURACIÓN
===================================
Las opciones se resuelven en este orden (de mayor a menor prioridad):
  1. Argumentos de línea de comandos (--nombre=valor)
  2. Archivo de configuración (--config=archivo)
  3. Variables de entorno (env vars)
  4. Valores por defecto

Ejemplo: Si especificas --name en CLI y también en el archivo config,
se usará el valor del CLI.

EJEMPLOS
========

1. Registro simple con URL completa (línea de comandos):
   deno run -A register-backend.ts \\
     --name=mi-api \\
     --backend-url=http://192.168.1.100:3000 \\
     --backend-token=secret123 \\
     --prefix=/miapi \\
     --registry-url=https://kv-storage.deno.dev \\
     --api-key=my-key \\
     --encryption-key=my-key

2. Usar archivo de configuración JSON:
   # register-backend.config.json
   {
     "name": "mi-api",
     "backend-url": "http://192.168.1.100:3000",
     "backend-token": "secret123",
     "registry-url": "https://kv-storage.deno.dev",
     "api-key": "my-key",
     "encryption-key": "my-key"
   }
   
   deno run -A register-backend.ts

3. Usar archivo de configuración .env:
   # .register-backend.env
   NAME=mi-api
   BACKEND_URL=http://192.168.1.100:3000
   BACKEND_TOKEN=secret123
   REGISTRY_URL=https://kv-storage.deno.dev
   API_KEY=my-key
   ENCRYPTION_KEY=my-key
   
   deno run -A register-backend.ts

4. Registro con IP pública (para PC detrás de NAT):
   deno run -A register-backend.ts \\
     --name=mi-api \\
     --use-public-ip \\
     --backend-port=3000 \\
     --backend-token=secret123 \\
     --registry-url=https://kv-storage.deno.dev \\
     --api-key=my-key \\
     --encryption-key=my-key \\
     --daemon

5. Combinar archivo config + sobrescribir con CLI:
   # register-backend.config.json tiene backend-url=http://default:3000
   deno run -A register-backend.ts --backend-url=http://override:3000
   # Resultado: usa http://override:3000 (CLI tiene prioridad)

6. Con variables de entorno:
   export STORAGE_URL=https://kv-storage.deno.dev
   export API_KEY=mi-api-key
   export ENCRYPTION_KEY=mi-clave
   
   deno run -A register-backend.ts \\
     --name=productos \\
     --use-public-ip \\
     --backend-port=3000 \\
     --backend-token=token-productos

VARIABLES DE ENTORNO
====================
STORAGE_URL              URL del KV Storage
API_KEY                  API key para autenticación
ENCRYPTION_KEY           Clave para encriptar tokens
REGISTER_BACKEND_NAME    Nombre del backend
REGISTER_BACKEND_URL     URL del backend
REGISTER_BACKEND_TOKEN   Token del backend
REGISTER_BACKEND_PORT    Puerto del backend
REGISTER_PREFIX          Prefix de enrutamiento
REGISTER_USE_PUBLIC_IP   Usar detección de IP pública (true/false)
REGISTER_DAEMON          Modo daemon (true/false)
`);
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

async function main(): Promise<void> {
  // Paso 1: Parsear argumentos de línea de comandos
  const cliArgs = parseArgs(Deno.args);

  if (cliArgs.help) {
    showHelp();
    Deno.exit(0);
  }

  // Paso 2: Cargar archivo de configuración (si existe)
  let fileConfig: Record<string, unknown> = {};
  try {
    fileConfig = await loadConfigFile(cliArgs.config);
  } catch (error) {
    console.error(`❌ Error al cargar configuración:`, error);
    Deno.exit(1);
  }

  // Paso 3: Resolver configuración con cascada de prioridad
  // Prioridad: CLI > Archivo Config > Env Vars > Defaults
  const config = resolveConfig(cliArgs, fileConfig);

  if (config.help) {
    showHelp();
    Deno.exit(0);
  }

  // Paso 4: Validar parámetros obligatorios
  if (!config["registry-url"] || !config["api-key"] || !config["encryption-key"]) {
    console.error("❌ Error: Faltan credenciales");
    console.error("   Proporciona: --registry-url, --api-key, --encryption-key");
    console.error("   O configura: STORAGE_URL, API_KEY, ENCRYPTION_KEY");
    console.error("   O crea un archivo de configuración (register-backend.config.json)");
    console.error("");
    console.error("   Usa --help para más información");
    Deno.exit(1);
  }

  if (!config.name) {
    console.error("❌ Error: --name es obligatorio");
    console.error("   Proporciona: --name=nombre");
    console.error("   O en el archivo de configuración: \"name\": \"nombre\"");
    Deno.exit(1);
  }

  if (!config["backend-token"]) {
    console.error("❌ Error: --backend-token es obligatorio");
    console.error("   Proporciona: --backend-token=token");
    console.error("   O en el archivo de configuración: \"backend-token\": \"token\"");
    Deno.exit(1);
  }

  // Paso 5: Construir URL del backend
  let backendUrl: string;

  if (config["use-public-ip"]) {
    if (!config["backend-port"]) {
      console.error("❌ Error: --backend-port es obligatorio con --use-public-ip");
      Deno.exit(1);
    }

    console.log("🌍 Detectando IP pública...");
    const publicIP = await getPublicIP();
    console.log(`✅ IP pública detectada: ${publicIP}`);
    
    backendUrl = `http://${publicIP}:${config["backend-port"]}`;
  } else if (config["backend-url"]) {
    backendUrl = config["backend-url"];
  } else {
    console.error("❌ Error: Debes proporcionar --backend-url o --use-public-ip + --backend-port");
    Deno.exit(1);
  }

  // Función de registro
  const doRegister = async () => {
    // Si usa IP pública, detectar en cada iteración
    let currentUrl = backendUrl;
    if (config["use-public-ip"] && config["backend-port"]) {
      const publicIP = await getPublicIP();
      currentUrl = `http://${publicIP}:${config["backend-port"]}`;
    }

    await registerBackend(
      config.name!,
      currentUrl,
      config["backend-token"]!,
      config.prefix,
      config["registry-url"]!,
      config["api-key"]!,
      config["encryption-key"]!,
      {
        hostname: Deno.hostname(),
        os: Deno.build.os,
        arch: Deno.build.arch,
      }
    );
  };

  // Paso 6: Registro inicial
  console.log("🚀 Registrando backend...");
  await doRegister();

  // Paso 7: Modo daemon
  if (config.daemon) {
    console.log("");
    console.log("🔄 Modo daemon activado");
    console.log("   Verificación de IP cada 30 minutos");
    console.log("   Solo se registra si la IP cambia");
    console.log("   Presiona Ctrl+C para detener");
    console.log("");

    // Guardar la última IP registrada
    let lastRegisteredIP: string | null = null;
    if (config["use-public-ip"]) {
      try {
        lastRegisteredIP = await getPublicIP();
      } catch {
        // Si falla, se registrará en el próximo intento
      }
    }

    // Verificar cada 30 minutos
    setInterval(async () => {
      try {
        console.log(`[${new Date().toISOString()}] 🔍 Verificando IP...`);
        
        // Si no usa IP pública, siempre registrar
        if (!config["use-public-ip"]) {
          console.log(`[${new Date().toISOString()}] 🔄 Re-registrando (IP estática)...`);
          await doRegister();
          return;
        }

        // Obtener IP actual
        const currentIP = await getPublicIP();
        
        // Comparar con la última registrada
        if (currentIP !== lastRegisteredIP) {
          console.log(`[${new Date().toISOString()}] 🔄 IP cambió de ${lastRegisteredIP} a ${currentIP}`);
          console.log(`[${new Date().toISOString()}] 📝 Registrando nueva IP...`);
          await doRegister();
          lastRegisteredIP = currentIP;
        } else {
          console.log(`[${new Date().toISOString()}] ✅ IP sin cambios (${currentIP})`);
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error en verificación:`, error);
      }
    }, 30 * 60 * 1000);

    // Mantener el proceso vivo
    await new Promise(() => {});
  }
}

// ============================================================================
// EJECUTAR
// ============================================================================

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error("❌ Error fatal:", error);
    Deno.exit(1);
  }
}