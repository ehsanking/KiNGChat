export const OpenApiSchemas = {
  Error: {
    type: 'object',
    properties: {
      error: { type: 'string' },
      code: { type: 'string' },
    },
  },
  Success: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
    },
    required: ['success'],
  },
} as const;
