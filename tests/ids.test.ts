import { expect, it, vi } from 'vitest';
import { newId } from '../src/ids';

it('uses native randomUUID when available', () => {
  const native = vi.fn(() => '12345678-1234-4123-8123-123456789abc' as const);
  const random = vi.fn();
  expect(newId({ randomUUID: native, getRandomValues: random })).toBe('12345678-1234-4123-8123-123456789abc');
  expect(native).toHaveBeenCalledOnce();
  expect(random).not.toHaveBeenCalled();
});

it('creates unique version 4 IDs from secure random bytes without randomUUID', () => {
  const source = { getRandomValues: crypto.getRandomValues.bind(crypto) };
  const ids = Array.from({ length: 100 }, () => newId(source));
  expect(new Set(ids).size).toBe(100);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

it('sets the version and variant without discarding the other random bits', () => {
  const source = { getRandomValues: (<T extends ArrayBufferView | null>(array: T): T => {
    (array as Uint8Array).fill(255); return array;
  }) };
  expect(newId(source)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
});
