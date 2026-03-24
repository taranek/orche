import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  createWriteStream,
} from "node:fs";
import path from "node:path";
import https from "node:https";

const REPO = "taranek/orche";
const TAG_PREFIX = "review-v";

// Pin review binary version to the CLI version
const CLI_VERSION = (() => {
  try {
    const pkgPath = new URL("../package.json", import.meta.url).pathname;
    return JSON.parse(readFileSync(pkgPath, "utf-8")).version as string;
  } catch {
    return null;
  }
})();
const ORCHE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".orche",
  "review"
);
const BIN_DIR = path.join(ORCHE_DIR, "bin");
const VERSION_FILE = path.join(ORCHE_DIR, "version.json");
const LOCK_FILE = path.join(ORCHE_DIR, ".downloading");

interface VersionInfo {
  version: string;
  downloadedAt: string;
  lastCheckedAt: string;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: ReleaseAsset[];
}

function readVersionInfo(): VersionInfo | null {
  if (!existsSync(VERSION_FILE)) return null;
  try {
    return JSON.parse(readFileSync(VERSION_FILE, "utf-8")) as VersionInfo;
  } catch {
    return null;
  }
}

function writeVersionInfo(info: VersionInfo): void {
  mkdirSync(ORCHE_DIR, { recursive: true });
  writeFileSync(VERSION_FILE, JSON.stringify(info, null, 2));
}

function getPlatformKey(): { platform: string; arch: string; ext: string } {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (process.platform === "darwin") {
    return { platform: "mac", arch, ext: "zip" };
  }
  if (process.platform === "linux") {
    return { platform: "linux", arch, ext: "tar.gz" };
  }
  throw new Error(`unsupported platform: ${process.platform}`);
}

function getExecutablePath(): string {
  if (process.platform === "darwin") {
    return path.join(BIN_DIR, "orche-review.app", "Contents", "MacOS", "orche-review");
  }
  return path.join(BIN_DIR, "orche-review", "orche-review");
}

function fetchJson<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const get = (requestUrl: string) => {
      https.get(
        requestUrl,
        { headers: { "User-Agent": "orche-cli", Accept: "application/vnd.github+json" } },
        (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            get(res.headers.location!);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} from ${requestUrl}`));
            return;
          }
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(JSON.parse(data) as T));
          res.on("error", reject);
        }
      ).on("error", reject);
    };
    get(url);
  });
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(dest), { recursive: true });
    const file = createWriteStream(dest);

    const get = (requestUrl: string) => {
      https.get(requestUrl, { headers: { "User-Agent": "orche-cli" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location!);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          reject(new Error(`HTTP ${res.statusCode} downloading ${requestUrl}`));
          return;
        }

        const totalBytes = parseInt(res.headers["content-length"] || "0", 10);
        let downloadedBytes = 0;

        res.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          if (totalBytes > 0) {
            const pct = Math.round((downloadedBytes / totalBytes) * 100);
            const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
            const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
            process.stderr.write(`\r  downloading: ${mb}/${totalMb} MB (${pct}%)`);
          }
        });

        res.pipe(file);
        file.on("finish", () => {
          if (totalBytes > 0) process.stderr.write("\n");
          file.close();
          resolve();
        });
        file.on("error", reject);
      }).on("error", reject);
    };
    get(url);
  });
}

async function findRelease(): Promise<{
  version: string;
  downloadUrl: string;
} | null> {
  const releases = await fetchJson<GitHubRelease[]>(
    `https://api.github.com/repos/${REPO}/releases`
  );

  // Find release matching CLI version, or fall back to latest review release
  const targetTag = CLI_VERSION ? `${TAG_PREFIX}${CLI_VERSION}` : null;
  const reviewRelease = targetTag
    ? releases.find((r) => r.tag_name === targetTag)
    : releases.find((r) => r.tag_name.startsWith(TAG_PREFIX));

  if (!reviewRelease) return null;

  const version = reviewRelease.tag_name.slice(TAG_PREFIX.length);
  const { platform, arch, ext } = getPlatformKey();

  // Match asset by platform and arch in filename
  const asset = reviewRelease.assets.find((a) => {
    const name = a.name.toLowerCase();
    if (!name.includes(platform) || !name.endsWith(`.${ext}`) || name.includes("blockmap")) return false;
    if (arch === "arm64") return name.includes("arm64");
    return !name.includes("arm64");
  });

  if (!asset) return null;
  return { version, downloadUrl: asset.browser_download_url };
}

async function downloadAndExtract(
  url: string,
  version: string
): Promise<void> {
  const tmpDir = path.join(ORCHE_DIR, ".tmp");
  mkdirSync(tmpDir, { recursive: true });

  const { ext } = getPlatformKey();
  const archivePath = path.join(tmpDir, `orche-review.${ext}`);

  await download(url, archivePath);

  // Clean existing bin directory
  execSync(`rm -rf "${BIN_DIR}"`);
  mkdirSync(BIN_DIR, { recursive: true });

  // Extract
  if (ext === "zip") {
    execSync(`unzip -q -o "${archivePath}" -d "${BIN_DIR}"`);
    // Clear macOS quarantine
    try {
      execSync(`xattr -cr "${BIN_DIR}"`, { stdio: "ignore" });
    } catch {
      // xattr may not exist on all systems
    }
  } else {
    execSync(`tar xzf "${archivePath}" -C "${BIN_DIR}"`);
  }

  // Ensure executable permissions on Linux
  if (process.platform === "linux") {
    const executablePath = getExecutablePath();
    if (existsSync(executablePath)) {
      execSync(`chmod +x "${executablePath}"`);
    }
  }

  // Write version info
  writeVersionInfo({
    version,
    downloadedAt: new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
  });

  // Cleanup
  execSync(`rm -rf "${tmpDir}"`);
}

function acquireLock(): boolean {
  if (existsSync(LOCK_FILE)) {
    try {
      const lockTime = parseInt(readFileSync(LOCK_FILE, "utf-8"), 10);
      // Stale if older than 10 minutes
      if (Date.now() - lockTime < 10 * 60 * 1000) return false;
    } catch {
      // corrupt lock, proceed
    }
  }
  mkdirSync(ORCHE_DIR, { recursive: true });
  writeFileSync(LOCK_FILE, String(Date.now()));
  return true;
}

function releaseLock(): void {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

export async function getReviewBinaryPath(): Promise<string> {
  const executablePath = getExecutablePath();
  const info = readVersionInfo();
  const needsDownload = !info || !existsSync(executablePath)
    || (CLI_VERSION && info.version !== CLI_VERSION);

  if (!needsDownload) return executablePath;

  if (info && CLI_VERSION && info.version !== CLI_VERSION) {
    console.log(`review app version mismatch (${info.version} → ${CLI_VERSION}), updating...`);
  } else {
    console.log("review app not found, downloading...");
  }

  if (!acquireLock()) {
    throw new Error("another download is in progress — try again in a moment");
  }
  try {
    const release = await findRelease();
    if (!release) {
      throw new Error(
        "no review app release found — check https://github.com/taranek/orche/releases"
      );
    }
    await downloadAndExtract(release.downloadUrl, release.version);
  } finally {
    releaseLock();
  }

  return executablePath;
}
