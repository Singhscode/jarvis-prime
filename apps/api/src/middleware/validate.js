// Request validation middleware — lightweight schema checking.
//
// Zero-dependency request body validation factory.
// Usage:
//   router.post('/', validate({ action: 'string', params: 'object?' }), handler)
//
// Supported types: 'string', 'number', 'boolean', 'object', 'array'
// Append '?' to make a field optional (e.g., 'string?')

import { AppError } from './error-handler.js';

/**
 * Create a validation middleware for request body fields.
 *
 * @param {object} schema  Field definitions: { fieldName: 'type' | 'type?' }
 * @param {string} [source='body']  Where to validate: 'body', 'query', 'params'
 * @returns {Function} Express middleware
 *
 * @example
 *   // Required string 'action', optional object 'params'
 *   validate({ action: 'string', params: 'object?' })
 *
 *   // Validate query parameters
 *   validate({ limit: 'number?', offset: 'number?' }, 'query')
 */
export function validate(schema, source = 'body') {
  return function validationMiddleware(req, res, next) {
    const data = req[source];

    if (!data && source === 'body') {
      throw new AppError('Request body is required', 400, 'VALIDATION_ERROR');
    }

    const errors = [];

    for (const [field, rule] of Object.entries(schema)) {
      const isOptional = rule.endsWith('?');
      const expectedType = isOptional ? rule.slice(0, -1) : rule;
      const value = data?.[field];

      // Check required fields
      if (value === undefined || value === null) {
        if (!isOptional) {
          errors.push(`Missing required field: '${field}'`);
        }
        continue;
      }

      // Type checking
      if (!checkType(value, expectedType)) {
        errors.push(`Field '${field}' must be of type '${expectedType}', got '${typeof value}'`);
      }

      // Empty string check for required strings
      if (!isOptional && expectedType === 'string' && typeof value === 'string' && value.trim() === '') {
        errors.push(`Field '${field}' must not be empty`);
      }
    }

    if (errors.length > 0) {
      throw new AppError(
        `Validation failed: ${errors.join('; ')}`,
        400,
        'VALIDATION_ERROR'
      );
    }

    next();
  };
}

/**
 * Check if a value matches the expected type.
 */
function checkType(value, expectedType) {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && !Array.isArray(value) && value !== null;
    case 'array':
      return Array.isArray(value);
    default:
      return true; // Unknown types pass through
  }
}
