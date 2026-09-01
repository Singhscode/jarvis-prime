import { basename, extname } from 'node:path';
import { createHash } from 'node:crypto';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const TYPES = new Map([
  ['.pdf', 'application/pdf'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.txt', 'text/plain'],
]);

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

function safeFilename(value) {
  if (typeof value !== 'string' || !value || value !== basename(value) || value.length > 240 || value.startsWith('.')
    || /[\u0000-\u001f\u007f]/.test(value)) throw invalid('Attachment filename is invalid.');
  const extension = extname(value).toLowerCase();
  const mediaType = TYPES.get(extension);
  if (!mediaType) throw invalid('Attachment type is not permitted.');
  return { filename: value, mediaType };
}

function hasSignature(buffer, mediaType) {
  if (mediaType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mediaType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mediaType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mediaType === 'text/plain') {
    const text = buffer.toString('utf8');
    return Buffer.from(text, 'utf8').equals(buffer) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
  }
  return false;
}

export function parseCommunicationMessage(req, _res, next) {
  if (!req.is('multipart/form-data')) return next();
  void (async () => {
    const { default: Busboy } = await import('busboy');
    const parser = Busboy({ headers: req.headers, limits: { files: MAX_FILES, fields: 2, fileSize: MAX_BYTES } });
    const fields = {}; const files = []; let parseError = null;
    const fail = (message) => { if (!parseError) parseError = invalid(message); };

    parser.on('field', (name, value) => {
      if (name !== 'body' || Object.hasOwn(fields, name)) fail('Message body is invalid.');
      else fields[name] = value;
    });
    parser.on('file', (name, stream, info) => {
      if (name !== 'attachments' || files.length >= MAX_FILES) { fail('At most five attachments are permitted.'); stream.resume(); return; }
      const chunks = []; let limited = false;
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => { limited = true; fail('Attachment exceeds the permitted size.'); });
      stream.on('error', () => fail('Attachment upload failed.'));
      stream.on('end', () => {
        if (limited || parseError) return;
        try {
          const { filename, mediaType } = safeFilename(info.filename);
          if (info.mimeType !== mediaType) throw invalid('Attachment MIME type does not match its filename.');
          const buffer = Buffer.concat(chunks);
          if (!buffer.length || buffer.length > MAX_BYTES || !hasSignature(buffer, mediaType)) throw invalid('Attachment content does not match its type.');
          files.push({ buffer, filename, mediaType, sizeBytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') });
        } catch (error) { fail(error.message); }
      });
    });
    parser.on('filesLimit', () => fail('At most five attachments are permitted.'));
    parser.on('fieldsLimit', () => fail('Message metadata is invalid.'));
    parser.on('error', () => fail('Message upload failed.'));
    parser.on('finish', () => {
      if (parseError) return next(parseError);
      req.communicationMessage = { body: fields.body, files };
      return next();
    });
    req.pipe(parser);
  })().catch(next);
}
