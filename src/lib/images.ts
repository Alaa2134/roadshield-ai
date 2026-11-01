import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type PreparedImage = { uri: string; width: number; height: number };

const MAX_EDGE = 1600;

/**
 * Normalises a captured/picked photo before it leaves the phone:
 *  - downsizes the longest edge to 1600 px (faster upload, enough for inspection and AI),
 *  - re-encodes as JPEG, which writes a fresh file WITHOUT the original EXIF block
 *    (GPS tags, device model, timestamps), so no hidden metadata is uploaded.
 */
export async function prepareImage(uri: string, width?: number, height?: number): Promise<PreparedImage> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height) {
    const longest = Math.max(width, height);
    if (longest > MAX_EDGE) {
      if (width >= height) ctx.resize({ width: MAX_EDGE });
      else ctx.resize({ height: MAX_EDGE });
    }
  } else {
    ctx.resize({ width: MAX_EDGE });
  }
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

function draftDir(draftId: string): Directory {
  const root = new Directory(Paths.document, 'drafts');
  if (!root.exists) root.create({ intermediates: true });
  const dir = new Directory(root, draftId);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copies a prepared image into durable app storage so offline drafts survive restarts. */
export async function persistDraftImage(draftId: string, source: PreparedImage, name: string): Promise<PreparedImage> {
  const dir = draftDir(draftId);
  const target = new File(dir, `${name}.jpg`);
  if (target.exists) target.delete();
  await new File(source.uri).copy(target);
  return { uri: target.uri, width: source.width, height: source.height };
}

/** Writes a base64 JPEG (e.g. the privacy-redacted image from the AI service) next to the draft. */
export async function writeBase64Image(draftId: string, name: string, base64: string, w: number, h: number): Promise<PreparedImage> {
  const target = new File(draftDir(draftId), `${name}.jpg`);
  if (target.exists) target.delete();
  target.create();
  await target.write(base64, { encoding: 'base64' });
  return { uri: target.uri, width: w, height: h };
}

export function deleteDraftFiles(draftId: string) {
  try {
    const dir = new Directory(Paths.document, 'drafts', draftId);
    if (dir.exists) dir.delete();
  } catch {
    // best effort
  }
}

export function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}
