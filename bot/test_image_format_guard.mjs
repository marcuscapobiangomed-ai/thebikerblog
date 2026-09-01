import assert from "node:assert/strict";
import { assertSafeRasterBuffer } from "./src/validation/image-manifest-v2.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);

assert.doesNotThrow(() => assertSafeRasterBuffer(png, "hero.png", "png"));
assert.doesNotThrow(() => assertSafeRasterBuffer(webp, "hero.webp", "webp"));
assert.throws(() => assertSafeRasterBuffer(Buffer.from("icns"), "hero.webp", "webp"), /assinatura binária/);
assert.throws(() => assertSafeRasterBuffer(png, "hero.webp", "webp"), /assinatura binária/);
assert.throws(() => assertSafeRasterBuffer(webp, "hero.jxl", "webp"), /extensão/);

console.log("Image parser format guard tests passed.");
