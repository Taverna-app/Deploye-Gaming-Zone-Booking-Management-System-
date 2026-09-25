/**
 * Identifies a file from its first bytes ("magic numbers"). The client-supplied Content-Type and file name are
 * trivially forged, so uploads are accepted or refused on what the bytes really are.
 */
export function detectFileType(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
        return { mime: 'image/jpeg', ext: 'jpg' };
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return { mime: 'image/png', ext: 'png' };
    }
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        return { mime: 'image/webp', ext: 'webp' };
    }
    if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-')
        return { mime: 'application/pdf', ext: 'pdf' };
    return null;
}
const MIME_BY_EXT = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    pdf: 'application/pdf',
};
/** Content-Type for a stored key, from the extension the server itself chose at upload time. */
export const mimeForKey = (key) => MIME_BY_EXT[key.split('.').pop() ?? ''] ?? null;
//# sourceMappingURL=fileType.js.map