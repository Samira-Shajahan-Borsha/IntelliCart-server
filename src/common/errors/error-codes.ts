/**
 * Stable application error codes from PRD 13.4 (plus transport-level codes from PRD 4.4).
 * `rpcCode` must match the numeric code declared for the same name in rpc/shopwise.ridl.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: { status: 422, rpcCode: 1000 },
  BAD_REQUEST: { status: 400, rpcCode: 1001 },
  UNAUTHENTICATED: { status: 401, rpcCode: 1002 },
  FORBIDDEN: { status: 403, rpcCode: 1003 },
  NOT_FOUND: { status: 404, rpcCode: 1004 },
  CONFLICT: { status: 409, rpcCode: 1005 },
  INSUFFICIENT_STOCK: { status: 409, rpcCode: 1006 },
  PRICE_CHANGED: { status: 409, rpcCode: 1007 },
  INVALID_ORDER_TRANSITION: { status: 409, rpcCode: 1008 },
  RATE_LIMITED: { status: 429, rpcCode: 1009 },
  AI_PROVIDER_UNAVAILABLE: { status: 503, rpcCode: 1010 },
  AI_TOOL_FAILED: { status: 502, rpcCode: 1011 },
  FORECAST_UNAVAILABLE: { status: 503, rpcCode: 1012 },
  IMAGE_PROCESSING_FAILED: { status: 422, rpcCode: 1013 },
  PAYLOAD_TOO_LARGE: { status: 413, rpcCode: 1014 },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, rpcCode: 1015 },
  SERVICE_UNAVAILABLE: { status: 503, rpcCode: 1016 },
  INTERNAL_ERROR: { status: 500, rpcCode: 1017 },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
