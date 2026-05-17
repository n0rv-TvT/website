import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadEnv(path.join(rootDir, ".env"));

const dbPath = path.join(rootDir, "data", "quotes.sqlite");
const backupDir = path.resolve(rootDir, process.env.BACKUP_DIR || "backups");
const retention = Number(process.env.BACKUP_RETENTION || 14);

if (!existsSync(dbPath)) {
  console.error(JSON.stringify({ level: "error", message: "database_not_found", dbPath }));
  process.exit(1);
}

await mkdir(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const backupPath = path.join(backupDir, `quotes-${timestamp}.sqlite`);
const escapedBackupPath = backupPath.replaceAll("'", "''");

const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec(`VACUUM INTO '${escapedBackupPath}'`);
db.close();

await pruneBackups(backupDir, retention);

if (process.env.AWS_S3_BACKUP_URI) {
  uploadToS3(backupPath, process.env.AWS_S3_BACKUP_URI);
}

console.log(JSON.stringify({ level: "info", message: "backup_created", backupPath }));

async function pruneBackups(directory, keepCount) {
  if (!Number.isFinite(keepCount) || keepCount <= 0) return;

  const entries = await readdir(directory);
  const backups = [];

  for (const entry of entries) {
    if (!/^quotes-.+\.sqlite$/.test(entry)) continue;
    const filePath = path.join(directory, entry);
    const fileStat = await stat(filePath);
    backups.push({ filePath, mtimeMs: fileStat.mtimeMs });
  }

  backups.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const backup of backups.slice(keepCount)) {
    await unlink(backup.filePath);
    console.log(JSON.stringify({ level: "info", message: "backup_pruned", backupPath: backup.filePath }));
  }
}

function uploadToS3(filePath, destination) {
  const result = spawnSync("aws", ["s3", "cp", filePath, destination], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(JSON.stringify({ level: "error", message: "s3_upload_failed", destination }));
    process.exit(result.status || 1);
  }
}

function loadEnv(envPath) {
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
