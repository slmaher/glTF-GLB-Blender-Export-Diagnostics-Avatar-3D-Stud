/**
 * Reusable glTF / GLB Image & Texture Validation Utilities
 *
 * Implements real validation of glTF images:
 * - BufferView boundary and offset verification
 * - Magic byte inspection (PNG, JPEG, WebP, KTX2)
 * - In-browser decode verification via createImageBitmap / Image
 * - Explicit distinction between embedded GLB binary chunks, data URIs, and external URIs
 * - Never treats undefined/empty URI as an error when an image is embedded via bufferView
 */

export type ImageStorageType = 'Embedded GLB' | 'External URI' | 'Data URI' | 'Unknown';

export type ImageValidationClassification =
  | 'VALID_EMBEDDED'
  | 'VALID_DATA_URI'
  | 'VALID_EXTERNAL'
  | 'EXTERNAL_UNRESOLVED'
  | 'INVALID_BUFFER_VIEW'
  | 'INVALID_BYTE_RANGE'
  | 'EMPTY_IMAGE_DATA'
  | 'DECODE_FAILED';

export interface ImageValidationResult {
  status: 'VALID' | 'WARNING' | 'ERROR';
  classification: ImageValidationClassification;
  storage: ImageStorageType;
  format: string; // 'PNG' | 'JPEG' | 'WEBP' | 'KTX2' | 'UNKNOWN'
  detectedMimeType: string;
  bytesCount: number;
  formattedBytes: string;
  bufferViewIndex?: number;
  byteOffset?: number;
  byteLength?: number;
  decoded: boolean;
  decodeStatus: 'PASS' | 'FAIL' | 'SKIPPED';
  width?: number;
  height?: number;
  previewUrl?: string;
  reason?: string;
  sourceUri?: string;
  diagnostics: string[];
}

/**
 * Format bytes to readable string (e.g. 183 KB)
 */
export function formatImageBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Detect actual image format by inspecting magic bytes signature first,
 * falling back to MIME type and URI extension.
 */
export function detectImageFormat(
  bytes?: Uint8Array | null,
  mimeType?: string,
  uri?: string
): { format: string; mimeType: string } {
  // 1. Magic bytes signature inspection
  if (bytes && bytes.length >= 4) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return { format: 'PNG', mimeType: 'image/png' };
    }

    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { format: 'JPEG', mimeType: 'image/jpeg' };
    }

    // WEBP: RIFF .... WEBP
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 && // 'RIFF'
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50 // 'WEBP'
    ) {
      return { format: 'WEBP', mimeType: 'image/webp' };
    }

    // KTX2: AB 4B 54 58 20 32 30 BB 0D 0A 1A 0A («KTX 20»)
    if (
      bytes.length >= 12 &&
      bytes[0] === 0xab &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x54 &&
      bytes[3] === 0x58 &&
      bytes[4] === 0x20 &&
      bytes[5] === 0x32 &&
      bytes[6] === 0x30
    ) {
      return { format: 'KTX2', mimeType: 'image/ktx2' };
    }

    // GIF: GIF87a or GIF89a
    if (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38
    ) {
      return { format: 'GIF', mimeType: 'image/gif' };
    }
  }

  // 2. MIME type inspection
  if (mimeType) {
    const lowerMime = mimeType.toLowerCase();
    if (lowerMime.includes('png')) return { format: 'PNG', mimeType: 'image/png' };
    if (lowerMime.includes('jpeg') || lowerMime.includes('jpg'))
      return { format: 'JPEG', mimeType: 'image/jpeg' };
    if (lowerMime.includes('webp')) return { format: 'WEBP', mimeType: 'image/webp' };
    if (lowerMime.includes('ktx2') || lowerMime.includes('ktx'))
      return { format: 'KTX2', mimeType: 'image/ktx2' };
  }

  // 3. URI extension inspection
  if (uri) {
    const cleanUri = uri.split('?')[0].split('#')[0].toLowerCase();
    if (cleanUri.endsWith('.png')) return { format: 'PNG', mimeType: 'image/png' };
    if (cleanUri.endsWith('.jpg') || cleanUri.endsWith('.jpeg'))
      return { format: 'JPEG', mimeType: 'image/jpeg' };
    if (cleanUri.endsWith('.webp')) return { format: 'WEBP', mimeType: 'image/webp' };
    if (cleanUri.endsWith('.ktx2')) return { format: 'KTX2', mimeType: 'image/ktx2' };
  }

  return {
    format: mimeType ? mimeType.replace('image/', '').toUpperCase() : 'UNKNOWN',
    mimeType: mimeType || 'application/octet-stream',
  };
}

/**
 * Validate bufferView byte range bounds against the underlying binary buffer.
 */
export function validateBufferViewRange(
  bufferView: any,
  bufferLength: number
): {
  isValid: boolean;
  byteOffset: number;
  byteLength: number;
  reason?: string;
} {
  if (!bufferView) {
    return { isValid: false, byteOffset: 0, byteLength: 0, reason: 'BufferView is undefined' };
  }

  const byteOffset = bufferView.byteOffset || 0;
  const byteLength = bufferView.byteLength || 0;

  if (typeof byteOffset !== 'number' || byteOffset < 0) {
    return {
      isValid: false,
      byteOffset,
      byteLength,
      reason: `Invalid byteOffset: ${byteOffset}`,
    };
  }

  if (typeof byteLength !== 'number' || byteLength <= 0) {
    return {
      isValid: false,
      byteOffset,
      byteLength,
      reason: `BufferView has zero or negative byteLength: ${byteLength}`,
    };
  }

  if (byteOffset + byteLength > bufferLength) {
    return {
      isValid: false,
      byteOffset,
      byteLength,
      reason: `BufferView byte range [${byteOffset}..${byteOffset + byteLength}] exceeds buffer length (${bufferLength})`,
    };
  }

  return { isValid: true, byteOffset, byteLength };
}

/**
 * Decode image bytes in the browser to extract dimensions and verify decodability.
 */
export async function decodeImageBytes(
  bytes: Uint8Array,
  mimeType: string
): Promise<{
  decoded: boolean;
  width?: number;
  height?: number;
  blobUrl?: string;
  error?: string;
}> {
  try {
    const effectiveMime = mimeType || 'image/png';
    const blob = new Blob([bytes as unknown as BlobPart], { type: effectiveMime });
    const blobUrl = URL.createObjectURL(blob);

    // KTX2 requires a specialized transcoder, cannot be decoded via standard 2D ImageBitmap
    if (effectiveMime.includes('ktx2')) {
      return { decoded: true, blobUrl };
    }

    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob);
        const w = bitmap.width;
        const h = bitmap.height;
        bitmap.close();
        return { decoded: true, width: w, height: h, blobUrl };
      } catch {
        // Fallback to Image element if createImageBitmap fails
      }
    }

    if (typeof Image !== 'undefined') {
      const img = new Image();
      const dims = await new Promise<{ width: number; height: number; ok: boolean }>(
        (resolve) => {
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, ok: true });
          img.onerror = () => resolve({ width: 0, height: 0, ok: false });
          img.src = blobUrl;
        }
      );

      if (dims.ok && dims.width > 0) {
        return { decoded: true, width: dims.width, height: dims.height, blobUrl };
      }
      return {
        decoded: false,
        blobUrl,
        error: 'Browser Image element failed to decode image bitstream',
      };
    }

    return { decoded: true, blobUrl };
  } catch (e: any) {
    return { decoded: false, error: e.message || 'Image decode exception' };
  }
}

/**
 * Parse data URI into raw Uint8Array and MIME type.
 */
export function parseDataUri(
  uri: string
): { mimeType: string; bytes: Uint8Array } | null {
  try {
    const match = uri.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return null;
    const mimeType = match[1];
    const base64 = match[2];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return { mimeType, bytes };
  } catch {
    return null;
  }
}

/**
 * Validate an embedded image referenced via bufferView.
 */
export async function validateEmbeddedImage(
  rawImg: any,
  bufferViewIndex: number,
  gltfRaw: any,
  binChunkBytes?: Uint8Array | null
): Promise<ImageValidationResult> {
  const diagnostics: string[] = [];

  // 1. BufferView existence
  const bufferViews = gltfRaw?.bufferViews || [];
  if (bufferViewIndex < 0 || bufferViewIndex >= bufferViews.length) {
    return {
      status: 'ERROR',
      classification: 'INVALID_BUFFER_VIEW',
      storage: 'Embedded GLB',
      format: 'UNKNOWN',
      detectedMimeType: rawImg.mimeType || 'application/octet-stream',
      bytesCount: 0,
      formattedBytes: '0 B',
      bufferViewIndex,
      decoded: false,
      decodeStatus: 'FAIL',
      reason: `BufferView #${bufferViewIndex} does not exist in glTF bufferViews array (length: ${bufferViews.length})`,
      diagnostics: [
        `BufferView #${bufferViewIndex} does not exist in glTF bufferViews array.`,
      ],
    };
  }

  const bv = bufferViews[bufferViewIndex];

  // 2. Buffer existence
  const bufferIndex = bv.buffer ?? 0;
  const buffers = gltfRaw?.buffers || [];
  const bufferMeta = buffers[bufferIndex];

  // Determine available binary bytes
  let targetBufferBytes: Uint8Array | null = null;
  let totalBufferLength = 0;

  if (binChunkBytes && binChunkBytes.byteLength > 0 && bufferIndex === 0) {
    targetBufferBytes = binChunkBytes;
    totalBufferLength = binChunkBytes.byteLength;
  } else if (bufferMeta?.byteLength) {
    totalBufferLength = bufferMeta.byteLength;
  }

  // 3. Validate bufferView range
  const rangeCheck = validateBufferViewRange(bv, totalBufferLength || 999999999);
  if (!rangeCheck.isValid) {
    return {
      status: 'ERROR',
      classification: 'INVALID_BYTE_RANGE',
      storage: 'Embedded GLB',
      format: 'UNKNOWN',
      detectedMimeType: rawImg.mimeType || 'application/octet-stream',
      bytesCount: bv.byteLength || 0,
      formattedBytes: formatImageBytes(bv.byteLength || 0),
      bufferViewIndex,
      byteOffset: bv.byteOffset || 0,
      byteLength: bv.byteLength || 0,
      decoded: false,
      decodeStatus: 'FAIL',
      reason: rangeCheck.reason,
      diagnostics: [rangeCheck.reason || 'BufferView byte range exceeds buffer length.'],
    };
  }

  // 4. Extract actual binary bytes
  let imgSlice: Uint8Array | null = null;
  if (targetBufferBytes) {
    const start = rangeCheck.byteOffset;
    const end = start + rangeCheck.byteLength;
    if (end <= targetBufferBytes.byteLength) {
      imgSlice = targetBufferBytes.subarray(start, end);
    }
  }

  if (imgSlice && imgSlice.byteLength === 0) {
    return {
      status: 'ERROR',
      classification: 'EMPTY_IMAGE_DATA',
      storage: 'Embedded GLB',
      format: 'UNKNOWN',
      detectedMimeType: rawImg.mimeType || 'application/octet-stream',
      bytesCount: 0,
      formattedBytes: '0 B',
      bufferViewIndex,
      byteOffset: rangeCheck.byteOffset,
      byteLength: rangeCheck.byteLength,
      decoded: false,
      decodeStatus: 'FAIL',
      reason: 'BufferView references 0 bytes of image data',
      diagnostics: ['BufferView contains 0 bytes of binary image data.'],
    };
  }

  // 5. Detect format via magic bytes
  const detected = detectImageFormat(imgSlice, rawImg.mimeType);

  // 6. Decode image
  let decoded = false;
  let decodeStatus: 'PASS' | 'FAIL' | 'SKIPPED' = 'SKIPPED';
  let width: number | undefined;
  let height: number | undefined;
  let previewUrl: string | undefined;
  let reason: string | undefined;

  if (imgSlice) {
    const decodeRes = await decodeImageBytes(imgSlice, detected.mimeType);
    previewUrl = decodeRes.blobUrl;
    width = decodeRes.width;
    height = decodeRes.height;
    if (decodeRes.decoded && (decodeRes.width !== 0 || detected.format === 'KTX2')) {
      decoded = true;
      decodeStatus = 'PASS';
    } else {
      decodeStatus = 'FAIL';
      reason = decodeRes.error || 'Failed to decode image pixels';
      diagnostics.push(`Image data could not be decoded: ${reason}`);
    }
  } else {
    // We could not directly slice, but bufferView metadata was strictly valid
    decodeStatus = 'SKIPPED';
  }

  const isError = decodeStatus === 'FAIL';
  return {
    status: isError ? 'ERROR' : 'VALID',
    classification: isError ? 'DECODE_FAILED' : 'VALID_EMBEDDED',
    storage: 'Embedded GLB',
    format: detected.format,
    detectedMimeType: detected.mimeType,
    bytesCount: rangeCheck.byteLength,
    formattedBytes: formatImageBytes(rangeCheck.byteLength),
    bufferViewIndex,
    byteOffset: rangeCheck.byteOffset,
    byteLength: rangeCheck.byteLength,
    decoded,
    decodeStatus,
    width,
    height,
    previewUrl,
    reason,
    diagnostics,
  };
}

/**
 * Validate a glTF image (URI-based or embedded).
 */
export async function validateGltfImage(
  imageIndex: number,
  rawImg: any,
  gltfRaw: any,
  binChunkBytes?: Uint8Array | null
): Promise<ImageValidationResult> {
  if (!rawImg) {
    return {
      status: 'ERROR',
      classification: 'EMPTY_IMAGE_DATA',
      storage: 'Unknown',
      format: 'UNKNOWN',
      detectedMimeType: 'application/octet-stream',
      bytesCount: 0,
      formattedBytes: '0 B',
      decoded: false,
      decodeStatus: 'FAIL',
      reason: `Image #${imageIndex} definition is missing or null`,
      diagnostics: [`Image #${imageIndex} definition is missing or null.`],
    };
  }

  // Case B: Embedded image using bufferView
  // In glTF, embedded images in a GLB binary chunk MUST define bufferView and do NOT require uri!
  if (rawImg.bufferView !== undefined && rawImg.bufferView !== null) {
    return await validateEmbeddedImage(rawImg, rawImg.bufferView, gltfRaw, binChunkBytes);
  }

  // Case A: URI-based image
  if (rawImg.uri) {
    const uri = rawImg.uri;

    // Data URI
    if (uri.startsWith('data:')) {
      const parsedData = parseDataUri(uri);
      if (!parsedData) {
        return {
          status: 'ERROR',
          classification: 'INVALID_BYTE_RANGE',
          storage: 'Data URI',
          format: 'UNKNOWN',
          detectedMimeType: 'application/octet-stream',
          bytesCount: 0,
          formattedBytes: '0 B',
          sourceUri: uri.slice(0, 40) + '...',
          decoded: false,
          decodeStatus: 'FAIL',
          reason: 'Malformed base64 Data URI string',
          diagnostics: ['Data URI could not be decoded from base64 encoding.'],
        };
      }

      const detected = detectImageFormat(parsedData.bytes, parsedData.mimeType);
      const decodeRes = await decodeImageBytes(parsedData.bytes, detected.mimeType);

      return {
        status: decodeRes.decoded ? 'VALID' : 'ERROR',
        classification: decodeRes.decoded ? 'VALID_DATA_URI' : 'DECODE_FAILED',
        storage: 'Data URI',
        format: detected.format,
        detectedMimeType: detected.mimeType,
        bytesCount: parsedData.bytes.byteLength,
        formattedBytes: formatImageBytes(parsedData.bytes.byteLength),
        sourceUri: 'data:' + detected.mimeType + ';base64,...',
        decoded: decodeRes.decoded,
        decodeStatus: decodeRes.decoded ? 'PASS' : 'FAIL',
        width: decodeRes.width,
        height: decodeRes.height,
        previewUrl: decodeRes.blobUrl,
        reason: decodeRes.error,
        diagnostics: decodeRes.error ? [decodeRes.error] : [],
      };
    }

    // External URI (relative or absolute URL)
    const detected = detectImageFormat(null, rawImg.mimeType, uri);
    return {
      status: 'WARNING',
      classification: 'EXTERNAL_UNRESOLVED',
      storage: 'External URI',
      format: detected.format,
      detectedMimeType: detected.mimeType,
      bytesCount: 0,
      formattedBytes: 'External file',
      sourceUri: uri,
      decoded: false,
      decodeStatus: 'SKIPPED',
      reason: `External image asset: "${uri}". Cannot be validated offline without external resource packaging.`,
      diagnostics: [
        `Image references external URI "${uri}". Make sure this file is uploaded alongside the glTF or packaged inside a self-contained GLB.`,
      ],
    };
  }

  // Neither bufferView nor uri exists
  return {
    status: 'ERROR',
    classification: 'EMPTY_IMAGE_DATA',
    storage: 'Unknown',
    format: 'UNKNOWN',
    detectedMimeType: rawImg.mimeType || 'application/octet-stream',
    bytesCount: 0,
    formattedBytes: '0 B',
    decoded: false,
    decodeStatus: 'FAIL',
    reason: 'Image specifies neither bufferView nor uri',
    diagnostics: ['Image definition contains neither a bufferView index nor a URI reference.'],
  };
}
