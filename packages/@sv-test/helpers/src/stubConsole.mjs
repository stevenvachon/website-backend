import { vi } from 'vitest';

export default () =>
  vi.stubGlobal('console', {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  });
