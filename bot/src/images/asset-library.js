import fs from "node:fs/promises";
import path from "node:path";

export async function loadAssetLibrary(root) {
  const file = path.join(root, "content/image-library/index.json");
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return { file, data: parsed };
  } catch {
    return { file, data: { schemaVersion: 1, updatedAt: new Date(0).toISOString(), assets: [] } };
  }
}

export async function registerAsset(root, asset) {
  const library = await loadAssetLibrary(root);
  const incomingUses = new Set((asset.uses || []).map((use) => `${use.postId}:${use.position}`));
  for (const entry of library.data.assets) {
    if (entry.assetId === asset.assetId) continue;
    entry.uses = (entry.uses || []).filter((use) => !incomingUses.has(`${use.postId}:${use.position}`));
  }
  library.data.assets = library.data.assets.filter((entry) => (entry.uses || []).length > 0 || entry.assetId === asset.assetId);
  const existing = library.data.assets.find((entry) => entry.assetId === asset.assetId);
  if (existing) {
    const known = new Set((existing.uses || []).map((use) => `${use.postId}:${use.position}`));
    for (const use of asset.uses || []) if (!known.has(`${use.postId}:${use.position}`)) existing.uses.push(use);
  } else library.data.assets.push(asset);
  library.data.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(library.file), { recursive: true });
  await fs.writeFile(library.file, JSON.stringify(library.data, null, 2) + "\n");
  return asset;
}

export async function releaseAssetUse(root, { postId, position }) {
  const library = await loadAssetLibrary(root);
  let changed = false;
  for (const entry of library.data.assets) {
    const previousUses = entry.uses || [];
    entry.uses = previousUses.filter((use) => use.postId !== postId || use.position !== position);
    if (entry.uses.length !== previousUses.length) changed = true;
  }
  if (!changed) return;
  library.data.assets = library.data.assets.filter((entry) => (entry.uses || []).length > 0);
  library.data.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(library.file), { recursive: true });
  await fs.writeFile(library.file, JSON.stringify(library.data, null, 2) + "\n");
}
