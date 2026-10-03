/** Whether this run rewrites committed snapshots instead of comparing them: the env flag `envName` is `1`. */
export function isUpdateRun(envName: string, env: Record<string, string | undefined> = process.env): boolean {
  return env[envName] === '1';
}
