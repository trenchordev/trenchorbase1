/**
 * agentSchemaValidator.js
 * 
 * Schema validation for ACP agent requests
 * Ensures incoming data matches expected types and formats
 */

/**
 * Tax Scan Request Schema
 * Defines expected structure for tax-scan agent requests
 */
export const TaxScanSchema = {
  type: 'object',
  required: ['tokenAddress'],
  properties: {
    tokenAddress: {
      type: 'string',
      pattern: '^0x[a-fA-F0-9]{40}$',
      description: 'Valid Ethereum address (0x + 40 hex characters)',
      example: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
      minLength: 42,
      maxLength: 42,
    },
    chainId: {
      type: 'integer',
      enum: [8453],
      default: 8453,
      description: 'Chain ID (8453 for Base mainnet, only supported chain)',
    },
  },
  additionalProperties: false,
};

/**
 * Validation error object
 */
class ValidationError {
  constructor(field, message, code, value = null) {
    this.field = field;
    this.message = message;
    this.code = code;
    this.value = value;
  }
}

/**
 * Validate request data against a schema
 * 
 * @param {Object} data - Request data to validate
 * @param {Object} schema - Schema to validate against
 * @returns {Object} { valid: boolean, errors: ValidationError[], data: Object }
 */
export function validateRequest(data, schema) {
  const errors = [];

  // Input is required
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: [
        new ValidationError(
          '_root',
          'Request body must be a JSON object',
          'INVALID_REQUEST_FORMAT',
          data
        ),
      ],
      data: null,
    };
  }

  // Check required fields
  for (const field of schema.required || []) {
    if (!(field in data) || data[field] === null || data[field] === undefined) {
      errors.push(
        new ValidationError(
          field,
          `"${field}" is required`,
          'MISSING_REQUIRED_FIELD',
          data[field]
        )
      );
    }
  }

  // Validate each field
  for (const [key, value] of Object.entries(data)) {
    // Check for unexpected fields
    if (!schema.properties[key]) {
      if (schema.additionalProperties === false) {
        errors.push(
          new ValidationError(
            key,
            `"${key}" is not a recognized field`,
            'UNKNOWN_FIELD',
            value
          )
        );
      }
      continue;
    }

    const propSchema = schema.properties[key];

    // Skip null/undefined in optionals
    if ((value === null || value === undefined) && !schema.required?.includes(key)) {
      continue;
    }

    // Type validation
    let actualType = Array.isArray(value) ? 'array' : typeof value;
    const expectedType = propSchema.type;

    // JSON number/integer compatibility - allow number for integer fields
    if (expectedType === 'integer' && actualType === 'number') {
      actualType = 'integer'; // Accept numbers as integers
    }

    if (actualType !== expectedType) {
      errors.push(
        new ValidationError(
          key,
          `Expected type "${expectedType}", got "${actualType}"`,
          'INVALID_TYPE',
          value
        )
      );
      continue;
    }

    // String validations
    if (propSchema.type === 'string') {
      // Length checks
      if (propSchema.minLength && value.length < propSchema.minLength) {
        errors.push(
          new ValidationError(
            key,
            `Minimum length is ${propSchema.minLength}, got ${value.length}`,
            'STRING_TOO_SHORT',
            value
          )
        );
      }

      if (propSchema.maxLength && value.length > propSchema.maxLength) {
        errors.push(
          new ValidationError(
            key,
            `Maximum length is ${propSchema.maxLength}, got ${value.length}`,
            'STRING_TOO_LONG',
            value
          )
        );
      }

      // Pattern (regex) validation
      if (propSchema.pattern) {
        const regex = new RegExp(propSchema.pattern, 'i');
        if (!regex.test(value)) {
          errors.push(
            new ValidationError(
              key,
              `Value does not match required pattern: ${propSchema.pattern}`,
              'PATTERN_MISMATCH',
              value
            )
          );
        }
      }
    }

    // Enum validation
    if (propSchema.enum) {
      if (!propSchema.enum.includes(value)) {
        errors.push(
          new ValidationError(
            key,
            `Value must be one of: ${propSchema.enum.join(', ')}`,
            'INVALID_ENUM_VALUE',
            value
          )
        );
      }
    }

    // Integer/Number validations
    if (['integer', 'number'].includes(propSchema.type)) {
      if (propSchema.minimum !== undefined && value < propSchema.minimum) {
        errors.push(
          new ValidationError(
            key,
            `Minimum value is ${propSchema.minimum}, got ${value}`,
            'NUMBER_TOO_SMALL',
            value
          )
        );
      }

      if (propSchema.maximum !== undefined && value > propSchema.maximum) {
        errors.push(
          new ValidationError(
            key,
            `Maximum value is ${propSchema.maximum}, got ${value}`,
            'NUMBER_TOO_LARGE',
            value
          )
        );
      }
    }
  }

  // Build clean data object with defaults
  const cleanData = { ...data };
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (!(key in cleanData) && propSchema.default !== undefined) {
      cleanData[key] = propSchema.default;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? cleanData : null,
  };
}

/**
 * Validate tax-scan request specifically
 * 
 * @param {Object} data - Request data
 * @returns {Object} Validation result
 */
export function validateTaxScanRequest(data) {
  return validateRequest(data, TaxScanSchema);
}

/**
 * Validate a Job Offering definition provided by a seller (admin)
 * Expected shape (minimal):
 * {
 *   name: string,
 *   description: string,
 *   priceUSD: number,
 *   requireFunds: boolean,
 *   slaMinutes: integer,
 *   serviceRequirementSchema: { type: 'object', properties: {...}, required: [...], additionalProperties: false },
 *   deliverableRequirementSchema: { ... }
 * }
 */
export function validateJobOfferingDefinition(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [new ValidationError('_root', 'Job offering must be a JSON object', 'INVALID_FORMAT', data)], data: null };
  }

  // Top-level required fields
  const requiredTop = ['name', 'description', 'priceUSD', 'slaMinutes', 'serviceRequirementSchema', 'deliverableRequirementSchema'];
  for (const f of requiredTop) {
    if (!(f in data) || data[f] === null || data[f] === undefined) {
      errors.push(new ValidationError(f, `"${f}" is required`, 'MISSING_REQUIRED_FIELD', data[f]));
    }
  }

  // Basic type checks
  if ('name' in data && typeof data.name !== 'string') {
    errors.push(new ValidationError('name', 'Expected string', 'INVALID_TYPE', data.name));
  }
  if ('description' in data && typeof data.description !== 'string') {
    errors.push(new ValidationError('description', 'Expected string', 'INVALID_TYPE', data.description));
  }
  if ('priceUSD' in data && typeof data.priceUSD !== 'number') {
    errors.push(new ValidationError('priceUSD', 'Expected number', 'INVALID_TYPE', data.priceUSD));
  }
  if ('requireFunds' in data && typeof data.requireFunds !== 'boolean') {
    errors.push(new ValidationError('requireFunds', 'Expected boolean', 'INVALID_TYPE', data.requireFunds));
  }
  if ('slaMinutes' in data && (typeof data.slaMinutes !== 'number' || !Number.isInteger(data.slaMinutes))) {
    errors.push(new ValidationError('slaMinutes', 'Expected integer (minutes)', 'INVALID_TYPE', data.slaMinutes));
  }

  // Validate provided schema objects: ensure they look like { type: 'object', properties: {...} }
  const checkSchemaObj = (schemaObj, fieldName) => {
    if (!schemaObj || typeof schemaObj !== 'object') {
      errors.push(new ValidationError(fieldName, 'Schema must be an object', 'INVALID_SCHEMA', schemaObj));
      return;
    }
    if (schemaObj.type !== 'object') {
      errors.push(new ValidationError(fieldName, 'Top-level schema.type must be "object"', 'INVALID_SCHEMA_TYPE', schemaObj.type));
    }
    if (!schemaObj.properties || typeof schemaObj.properties !== 'object') {
      errors.push(new ValidationError(fieldName, 'Schema must include "properties" object', 'MISSING_SCHEMA_PROPERTIES', schemaObj.properties));
      return;
    }

    // Each property should have a type and a description (description required per docs)
    for (const [pname, pschema] of Object.entries(schemaObj.properties)) {
      if (!pschema || typeof pschema !== 'object') {
        errors.push(new ValidationError(`${fieldName}.${pname}`, 'Property schema must be an object', 'INVALID_PROPERTY_SCHEMA', pschema));
        continue;
      }
      if (!pschema.type) {
        errors.push(new ValidationError(`${fieldName}.${pname}`, 'Property "type" is required', 'MISSING_PROPERTY_TYPE', pschema));
      } else if (!['string', 'number', 'integer', 'boolean', 'object', 'array'].includes(pschema.type)) {
        errors.push(new ValidationError(`${fieldName}.${pname}`, `Unsupported type: ${pschema.type}`, 'UNSUPPORTED_TYPE', pschema.type));
      }
      if (!pschema.description || typeof pschema.description !== 'string' || pschema.description.trim() === '') {
        errors.push(new ValidationError(`${fieldName}.${pname}`, 'Field description is required (provide context for users)', 'MISSING_FIELD_DESCRIPTION', pschema.description));
      }
    }
  };

  if ('serviceRequirementSchema' in data) checkSchemaObj(data.serviceRequirementSchema, 'serviceRequirementSchema');
  if ('deliverableRequirementSchema' in data) checkSchemaObj(data.deliverableRequirementSchema, 'deliverableRequirementSchema');

  const valid = errors.length === 0;
  return { valid, errors, data: valid ? data : null };
}

/**
 * Validate incoming buyer service_requirement against a stored schema object
 * This function simply delegates to validateRequest which already supports
 * property-level checks when the seller provides a schema in the same
 * structure (type, enum, pattern, minLength, maxLength, etc.).
 */
export function validateServiceRequirementAgainstSchema(serviceRequirement, schema) {
  if (!schema || typeof schema !== 'object') {
    return { valid: false, errors: [new ValidationError('_schema', 'No valid schema provided', 'MISSING_SCHEMA', schema)], data: null };
  }
  return validateRequest(serviceRequirement, schema);
}

/**
 * Format validation errors for response
 * 
 * @param {ValidationError[]} errors - Array of validation errors
 * @returns {Object} Formatted error response
 */
export function formatValidationErrors(errors) {
  return {
    error_count: errors.length,
    errors: errors.map(err => ({
      field: err.field,
      message: err.message,
      code: err.code,
    })),
  };
}

export default {
  TaxScanSchema,
  validateRequest,
  validateTaxScanRequest,
  formatValidationErrors,
  ValidationError,
};
