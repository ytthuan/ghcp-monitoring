import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DASHBOARD_DIR = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_CLICKHOUSE_URL = "http://127.0.0.1:8123" as const;

export interface DashboardDevEnvLoadResult {
  repoRoot: string;
  envPath: string;
  envLoaded: boolean;
}

export function resolveDashboardRepoRoot(fromDir = DASHBOARD_DIR): string {
  return path.resolve(fromDir, "..", "..");
}

export function resolveDashboardRepoEnvPath(
  repoRoot = resolveDashboardRepoRoot(),
): string {
  return path.join(repoRoot, ".env");
}

export function loadDashboardDevEnv(
  repoRoot = resolveDashboardRepoRoot(),
): DashboardDevEnvLoadResult {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const envPath = resolveDashboardRepoEnvPath(resolvedRepoRoot);
  const envLoaded = fs.existsSync(envPath);

  if (envLoaded) {
    process.loadEnvFile(envPath);
  }

  if (!process.env.CLICKHOUSE_URL && !process.env.CLICKHOUSE_HOST) {
    process.env.CLICKHOUSE_URL = LOCAL_CLICKHOUSE_URL;
  }

  return {
    repoRoot: resolvedRepoRoot,
    envPath,
    envLoaded,
  };
}
