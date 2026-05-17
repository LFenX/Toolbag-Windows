import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(root, "src-tauri", "tauri.conf.json");
const targetPath = join(root, "src-tauri", "tauri.release.conf.json");

const pubkey = process.env.TAURI_UPDATER_PUBKEY;
const endpoint =
  process.env.TOOLBAG_UPDATER_ENDPOINT ||
  "https://github.com/LFenX/Toolbag-Windows/releases/latest/download/latest.json";

if (!pubkey) {
  throw new Error("TAURI_UPDATER_PUBKEY is required for release config.");
}

const config = JSON.parse(await readFile(sourcePath, "utf8"));
config.bundle = {
  ...config.bundle,
  createUpdaterArtifacts: true,
};
config.plugins = {
  ...config.plugins,
  updater: {
    pubkey,
    endpoints: [endpoint],
    windows: {
      installMode: "passive",
    },
  },
};

await writeFile(targetPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${targetPath}`);
