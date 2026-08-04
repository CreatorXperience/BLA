/**
 * Result pattern — services return Result<T, E> so controllers never reach
 * into service internals and error mapping stays centralized.
 */

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw result.error;
  }
  return result.value;
}
