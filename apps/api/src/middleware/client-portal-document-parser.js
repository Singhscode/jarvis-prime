function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  return error;
}

export function parseClientPortalDocument(req, _res, next) {
  if (!req.is('multipart/form-data')) return next(validationError('Client Portal document upload requires multipart/form-data.'));
  void (async () => {
    const { default: Busboy } = await import('busboy');
    const parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 4, fileSize: 10 * 1024 * 1024 } });
    const fields = {}; let uploadedFile = null; let parseError = null;
    const fail = (message) => { if (!parseError) parseError = validationError(message); };
    parser.on('field', (name, value) => { if (Object.hasOwn(fields, name)) fail('Duplicate document metadata field.'); else fields[name] = value; });
    parser.on('file', (name, stream, info) => {
      if (name !== 'file' || uploadedFile) { fail('Only one document file is permitted.'); stream.resume(); return; }
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => fail('Document file exceeds the permitted size.'));
      stream.on('error', () => fail('Document upload failed.'));
      stream.on('end', () => { uploadedFile = { buffer: Buffer.concat(chunks), mimeType: info.mimeType }; });
    });
    parser.on('filesLimit', () => fail('Only one document file is permitted.'));
    parser.on('fieldsLimit', () => fail('Too many document metadata fields.'));
    parser.on('error', () => fail('Document upload failed.'));
    parser.on('finish', () => {
      if (parseError) return next(parseError);
      if (!uploadedFile) return next(validationError('One document file is required.'));
      req.body = fields; req.clientPortalDocument = uploadedFile;
      return next();
    });
    req.pipe(parser);
  })().catch(next);
}
