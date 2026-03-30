type Env = Record<string, string | undefined>;

function getProcessEnv(): Env {
  // Vercel/serverless provides `process.env`, but keep TS happy without depending on Node types.
  return (((globalThis as any).process?.env ?? {}) as Env) || {};
}

export function requireEnv(name: string): string {
  const env = getProcessEnv();
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getEnv(name: string): string | undefined {
  const env = getProcessEnv();
  return env[name];
}

