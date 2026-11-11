#!/usr/bin/env node
/* Encode one lesson into encrypted HLS and upload it to the private R2
 * bucket through the Cloudflare CLI.
 *
 *   node tools/upload-lesson/upload.mjs --lesson <lessonId> --input <file.mp4>
 *
 * What it does:
 *   1. ffmpeg -> one 720p H.264/AAC rendition (~1.5 Mbps), 10s HLS segments,
 *      AES-128 encrypted with a FRESH random key per lesson.
 *   2. uploads with `npx wrangler r2 object put <bucket>/<key> --file <file>`
 *      (no S3 keys needed).
 *   3. prints the uploaded size and warns when the bucket approaches the free
 *      tier limit (10 GB; we warn at 8 GB).
 *
 * Safety:
 *   - the key is generated locally and NEVER printed, never committed;
 *   - the working directory (segments, playlist, key) is git-ignored;
 *   - the bucket stays PRIVATE: no public r2.dev URL, no custom domain.
 *
 * Honest scope: AES-128 HLS is NOT DRM. It raises the cost of copying and
 * makes a leak traceable. It does not make the video impossible to capture.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK_ROOT = join(HERE, "work");

/** Free tier: 10 GB stored. We warn at 8 GB so there is room to react. */
const FREE_TIER_GB = 10;
const WARN_AT_GB = 8;

function parseArgs(argv) {
  const args = { bucket: "kinetech", currentGb: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--lesson") args.lesson = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--bucket") args.bucket = argv[++i];
    else if (arg === "--current-gb") args.currentGb = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node tools/upload-lesson/upload.mjs --lesson <lessonId> --input <file.mp4>

Options:
  --lesson <id>        the lesson id (uuid) — must match videos.id
  --input <file.mp4>   the source video
  --bucket <name>      R2 bucket (default: kinetech)
  --current-gb <n>     current bucket usage in GB (optional, for the warning)
`);
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) fail(`${command} could not be started: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed (exit ${result.status})`);
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size;
  }
  return total;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.lesson || !args.input) {
  usage();
  process.exit(args.help ? 0 : 2);
}

const lessonId = String(args.lesson).trim();
if (!/^[A-Za-z0-9-]{6,64}$/.test(lessonId)) {
  fail(`--lesson must be the lesson id (uuid), got "${lessonId}"`);
}
const input = resolve(String(args.input));
if (!existsSync(input)) fail(`input file not found: ${input}`);

// ffmpeg is required.
const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
if (ffmpeg.error || ffmpeg.status !== 0) {
  fail("ffmpeg is required (install it, then run this script again)");
}

const lessonDir = join(WORK_ROOT, lessonId);
const segDir = join(lessonDir, "lessons", lessonId, "seg");
const keysDir = join(lessonDir, "keys");
rmSync(lessonDir, { recursive: true, force: true });
mkdirSync(segDir, { recursive: true });
mkdirSync(keysDir, { recursive: true });

// A FRESH random key per lesson (16 bytes = AES-128). Never printed, never
// committed: it lives in the git-ignored working directory and goes straight
// to the private `keys/` prefix in R2.
const key = randomBytes(16);
const keyPath = join(keysDir, `${lessonId}.key`);
writeFileSync(keyPath, key);

// A random IV per lesson (the segments of one lesson share it — ffmpeg's HLS
// muxer writes one key line per playlist).
const iv = randomBytes(16);

// ffmpeg's key info file format (verified with ffmpeg 6.1):
//   line 1: the key URI written into the playlist  (the Worker rewrites it)
//   line 2: the local path ffmpeg reads the 16 key bytes from
//   line 3: the IV as bare hex (no 0x prefix)
const keyInfoPath = join(lessonDir, "keyinfo");
writeFileSync(
  keyInfoPath,
  `keys/${lessonId}.key\n${keyPath}\n${iv.toString("hex")}\n`,
);

const playlistPath = join(lessonDir, "lessons", lessonId, "index.m3u8");
const segmentPattern = join(segDir, "seg%05d.ts");

console.log(`\n▸ Encoding ${lessonId}`);
console.log(`  source   ${input}`);
console.log(`  720p H.264/AAC · ~1.5 Mbps · 10s segments · AES-128 (fresh key)`);

run("ffmpeg", [
  "-y",
  "-i", input,
  "-vf", "scale=-2:720",
  // Always 4:2:0 — some sources are 4:4:4 and x264's High profile cannot
  // encode that; this also keeps the stream compatible with every device.
  "-pix_fmt", "yuv420p",
  "-c:v", "libx264",
  "-profile:v", "high",
  "-level", "4.0",
  "-preset", "medium",
  "-b:v", "1500k",
  "-maxrate", "1500k",
  "-bufsize", "3000k",
  "-c:a", "aac",
  "-b:a", "128k",
  "-ac", "2",
  "-ar", "44100",
  "-hls_time", "10",
  "-hls_playlist_type", "vod",
  "-hls_list_size", "0",
  "-hls_segment_filename", segmentPattern,
  "-hls_key_info_file", keyInfoPath,
  playlistPath,
]);

if (!existsSync(playlistPath)) fail("ffmpeg produced no playlist");

// Upload: playlist, segments, then the key into the private prefix.
function put(objectPath, file, contentType) {
  console.log(`  → ${objectPath}`);
  run("npx", [
    "wrangler",
    "r2",
    "object",
    "put",
    `${args.bucket}/${objectPath}`,
    "--file",
    file,
    // --remote is required: without it wrangler writes to its LOCAL store.
    "--remote",
    "--content-type",
    contentType,
  ]);
}

console.log(`\n▸ Uploading to R2 bucket "${args.bucket}"`);
put(`lessons/${lessonId}/index.m3u8`, playlistPath, "application/vnd.apple.mpegurl");
const segments = readdirSync(segDir).filter((name) => name.endsWith(".ts")).sort();
for (const name of segments) {
  put(`lessons/${lessonId}/seg/${name}`, join(segDir, name), "video/mp2t");
}
put(`keys/${lessonId}.key`, keyPath, "application/octet-stream");

// Size report + free tier warning.
const lessonBytes = dirSize(join(lessonDir, "lessons", lessonId)) + statSync(keyPath).size;
const lessonGb = lessonBytes / 1024 / 1024 / 1024;
const projectedGb = Number(args.currentGb || 0) + lessonGb;

console.log(`\n▸ Uploaded ${segments.length} segments + playlist + key`);
console.log(`  lesson size : ${humanSize(lessonBytes)} (${lessonGb.toFixed(3)} GB)`);
if (args.currentGb) {
  console.log(`  bucket usage: ~${args.currentGb} GB + this lesson = ~${projectedGb.toFixed(2)} GB`);
}
if (projectedGb >= WARN_AT_GB) {
  console.log(
    `\n⚠ WARNING: the bucket would reach ~${projectedGb.toFixed(2)} GB (free tier is ${FREE_TIER_GB} GB).`,
  );
  console.log("  Delete old lessons or upgrade the plan. Check the real usage in the Cloudflare dashboard.");
} else {
  console.log(`  free tier    : ${FREE_TIER_GB} GB — ${projectedGb.toFixed(2)} GB used, watch the usage notifications.`);
}

console.log(`\n▸ Point the lesson at R2 (run in the Supabase SQL editor):`);
console.log(`  update video_sources`);
console.log(`     set source = 'r2', src_url = 'r2:${lessonId}'`);
console.log(`   where video_id = '${lessonId}';`);
console.log(
  `\n  (The 'r2:' marker works even before the source column migration is applied.)\n`,
);
