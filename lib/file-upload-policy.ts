import path from 'path';

const blockedMimePrefixes = ['application/x-msdownload', 'application/x-dosexec'];

const normalizeAllowedList = (allowedFileFormats: string) =>
  allowedFileFormats
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const isSecureUploadAllowed = (params: {
  fileName: string;
  declaredMime: string;
  detectedMime: string;
  allowedFileFormats: string;
}) => {
  const normalizedDeclared = params.declaredMime.trim().toLowerCase();
  const normalizedDetected = params.detectedMime.trim().toLowerCase();
  if (blockedMimePrefixes.some((mime) => normalizedDetected.startsWith(mime) || normalizedDeclared.startsWith(mime))) {
    return false;
  }

  const allowed = normalizeAllowedList(params.allowedFileFormats);
  if (allowed.includes('*')) return normalizedDeclared === normalizedDetected;
  const extension = path.extname(params.fileName).replace('.', '').toLowerCase();
  if (!extension) return false;

  return (
    allowed.includes(extension) &&
    allowed.includes(normalizedDeclared) &&
    normalizedDeclared === normalizedDetected
  );
};
