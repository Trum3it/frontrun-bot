export type RuntimeEnv = {
  userAddresses: string[];
  proxyWallet: string;
  privateKey: string;
  mongoUri?: string;
  rpcUrl: string;
  fetchIntervalSeconds: number;
  tradeMultiplier: number;
  retryLimit: number;
  aggregationEnabled: boolean;
  aggregationWindowSeconds: number;
  usdcContractAddress: string;
  debugEnabled: boolean;
  maxSlippagePercent: number;
  healthCheckPort: number;
};

/**
 * Validates that a string is a valid Ethereum address
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validates that a string is a valid private key (with or without 0x prefix)
 */
function isValidPrivateKey(key: string): boolean {
  const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
  return /^[a-fA-F0-9]{64}$/.test(cleanKey);
}

/**
 * Validates that a string is a valid URL
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'wss:' || parsed.protocol === 'ws:';
  } catch {
    return false;
  }
}

/**
 * Validates that a number is within a valid range
 */
function validateRange(value: number, min: number, max: number, name: string): void {
  if (isNaN(value) || !isFinite(value)) {
    throw new Error(`${name} must be a valid number, got: ${value}`);
  }
  if (value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}, got: ${value}`);
  }
}

export function loadEnv(): RuntimeEnv {
  const parseList = (val: string | undefined): string[] => {
    if (!val) return [];
    try {
      const maybeJson = JSON.parse(val);
      if (Array.isArray(maybeJson)) return maybeJson.map(String);
    } catch (_) {
      // not JSON, parse as comma separated
    }
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const required = (name: string, v: string | undefined): string => {
    if (!v) throw new Error(`Missing required env var: ${name}`);
    return v;
  };

  // Parse raw values
  const userAddresses = parseList(process.env.USER_ADDRESSES);
  const proxyWallet = required('PROXY_WALLET', process.env.PROXY_WALLET);
  const privateKey = required('PRIVATE_KEY', process.env.PRIVATE_KEY);
  const rpcUrl = required('RPC_URL', process.env.RPC_URL);
  const usdcContractAddress = process.env.USDC_CONTRACT_ADDRESS || '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
  const fetchIntervalSeconds = Number(process.env.FETCH_INTERVAL ?? 1);
  const tradeMultiplier = Number(process.env.TRADE_MULTIPLIER ?? 1.0);
  const retryLimit = Number(process.env.RETRY_LIMIT ?? 3);
  const aggregationWindowSeconds = Number(process.env.TRADE_AGGREGATION_WINDOW_SECONDS ?? 300);
  const maxSlippagePercent = Number(process.env.MAX_SLIPPAGE_PERCENT ?? 2.0);
  const healthCheckPort = Number(process.env.HEALTH_CHECK_PORT ?? 3000);

  // Validate user addresses
  if (userAddresses.length === 0) {
    throw new Error('USER_ADDRESSES must contain at least one trader address');
  }
  for (const addr of userAddresses) {
    if (!isValidAddress(addr)) {
      throw new Error(`Invalid trader address in USER_ADDRESSES: ${addr}. Must be a valid Ethereum address (0x...)`);
    }
  }

  // Validate proxy wallet
  if (!isValidAddress(proxyWallet)) {
    throw new Error(`Invalid PROXY_WALLET: ${proxyWallet}. Must be a valid Ethereum address (0x...)`);
  }

  // Validate private key
  if (!isValidPrivateKey(privateKey)) {
    throw new Error('Invalid PRIVATE_KEY. Must be a 64-character hexadecimal string (with or without 0x prefix)');
  }

  // Validate RPC URL
  if (!isValidUrl(rpcUrl)) {
    throw new Error(`Invalid RPC_URL: ${rpcUrl}. Must be a valid HTTP/HTTPS/WSS/WS URL`);
  }

  // Validate USDC contract address
  if (!isValidAddress(usdcContractAddress)) {
    throw new Error(`Invalid USDC_CONTRACT_ADDRESS: ${usdcContractAddress}. Must be a valid Ethereum address`);
  }

  // Validate numeric ranges
  validateRange(fetchIntervalSeconds, 0.1, 3600, 'FETCH_INTERVAL');
  validateRange(tradeMultiplier, 0, 100, 'TRADE_MULTIPLIER');
  validateRange(retryLimit, 0, 10, 'RETRY_LIMIT');
  validateRange(aggregationWindowSeconds, 0, 86400, 'TRADE_AGGREGATION_WINDOW_SECONDS');
  validateRange(maxSlippagePercent, 0, 100, 'MAX_SLIPPAGE_PERCENT');
  validateRange(healthCheckPort, 1000, 65535, 'HEALTH_CHECK_PORT');

  // Validate MongoDB URI if provided
  if (process.env.MONGO_URI && !isValidUrl(process.env.MONGO_URI)) {
    throw new Error(`Invalid MONGO_URI: ${process.env.MONGO_URI}. Must be a valid MongoDB connection string`);
  }

  const env: RuntimeEnv = {
    userAddresses,
    proxyWallet,
    privateKey,
    mongoUri: process.env.MONGO_URI,
    rpcUrl,
    fetchIntervalSeconds,
    tradeMultiplier,
    retryLimit,
    aggregationEnabled: String(process.env.TRADE_AGGREGATION_ENABLED ?? 'false') === 'true',
    aggregationWindowSeconds,
    usdcContractAddress,
    debugEnabled: String(process.env.DEBUG ?? 'false') === 'true',
    maxSlippagePercent,
    healthCheckPort,
  };

  return env;
}

