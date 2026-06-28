import { mkdir, readFile, writeFile } from "node:fs/promises";
import dns from "node:dns";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROFILE_URL = "https://src.sjtu.edu.cn/profile/20160/";
const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(__dirname, "../data/edusrc-rank.json");

dns.setDefaultResultOrder("ipv4first");

function extractRank(html) {
  const match = html.match(/Rank\s*[：:]\s*([0-9][0-9,\s]*)/i);
  if (!match) {
    throw new Error("Could not find EDUSRC Rank in profile HTML.");
  }

  const normalized = match[1].replace(/[,\s]/g, "");
  const rank = Number(normalized);

  if (!Number.isSafeInteger(rank)) {
    throw new TypeError(`EDUSRC Rank is not a safe integer: ${match[1]}`);
  }

  return rank;
}

async function readPreviousPayload() {
  try {
    const raw = await readFile(dataPath, "utf8");
    const payload = JSON.parse(raw);
    return Number.isSafeInteger(payload?.rank) ? payload : null;
  } catch {
    return null;
  }
}

function usePreviousRank(previousPayload, error) {
  if (!Number.isSafeInteger(previousPayload?.rank)) {
    return false;
  }

  const reason = error?.message ? `: ${error.message}` : "";
  console.warn(`Skipping EDUSRC rank update; using previous rank ${previousPayload.rank}${reason}`);
  return true;
}

async function fetchProfileHtml() {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(PROFILE_URL, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "OracleNep.github.io rank monitor (+https://oraclenep.github.io/)"
        },
        redirect: "follow",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`EDUSRC profile request failed: ${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      console.warn(`EDUSRC profile request attempt ${attempt} failed: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 3000));
    }
  }

  throw lastError;
}

const previousPayload = await readPreviousPayload();

let html;
try {
  html = await fetchProfileHtml();
} catch (error) {
  if (usePreviousRank(previousPayload, error)) {
    process.exit(0);
  }

  throw error;
}

let rank;
try {
  rank = extractRank(html);
} catch (error) {
  if (usePreviousRank(previousPayload, error)) {
    process.exit(0);
  }

  throw error;
}

const previousRank = previousPayload?.rank ?? null;

if (previousRank === rank) {
  console.log(`EDUSRC rank unchanged: ${rank}`);
  process.exit(0);
}

const payload = {
  source: PROFILE_URL,
  rank,
  updatedAt: new Date().toISOString()
};

await mkdir(dirname(dataPath), { recursive: true });
await writeFile(dataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`EDUSRC rank updated: ${previousRank ?? "none"} -> ${rank}`);
