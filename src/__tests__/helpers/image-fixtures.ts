import { randomBytes } from "node:crypto";
import sharp from "sharp";

/** Build a valid, unique pixel fixture so parallel tests cannot share recognition evidence. */
export function createUniqueTestImage(): Promise<Buffer> {
  const [r, g, b] = randomBytes(3);
  return sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: { r, g, b },
    },
  }).png().toBuffer();
}
