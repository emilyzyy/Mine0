export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SchemaError(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export function assertArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SchemaError(`${label} must be an array.`);
  }

  return value;
}

export function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SchemaError(`${label} must be a non-empty string.`);
  }

  return value;
}

export function assertNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new SchemaError(`${label} must be a valid number.`);
  }

  return value;
}

export function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new SchemaError(`${label} must be a boolean.`);
  }

  return value;
}

export function assertOptionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return assertString(value, label);
}

export function assertStringArray(value: unknown, label: string): string[] {
  return assertArray(value, label).map((entry, index) =>
    assertString(entry, `${label}[${index}]`),
  );
}

export function assertLiteral<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  const parsed = assertString(value, label);
  if (!allowed.includes(parsed as T)) {
    throw new SchemaError(`${label} must be one of: ${allowed.join(", ")}.`);
  }

  return parsed as T;
}

export function assertRecordOfNumbers(
  value: unknown,
  label: string,
): Record<string, number> {
  const objectValue = assertObject(value, label);
  const result: Record<string, number> = {};

  for (const [key, entry] of Object.entries(objectValue)) {
    result[key] = assertNumber(entry, `${label}.${key}`);
  }

  return result;
}
