/**
 * Builders for the PRD canonical envelope (PRD 4.2). `status` always equals the HTTP
 * status the transport returns, and `success` is true only for 2xx.
 */
export interface Envelope<T> {
  status: number;
  success: true;
  message: string;
  data: T;
}

export interface EmptyEnvelope {
  status: number;
  success: true;
  message: string;
}

export const ok = <T>(message: string, data: T): Envelope<T> => ({
  status: 200,
  success: true,
  message,
  data,
});

export const created = <T>(message: string, data: T): Envelope<T> => ({
  status: 201,
  success: true,
  message,
  data,
});

export const empty = (message: string): EmptyEnvelope => ({
  status: 200,
  success: true,
  message,
});
