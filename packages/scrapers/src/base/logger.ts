import type { ProviderCode } from '@wakacje/shared';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  provider?: ProviderCode;
  searchRunId?: string;
  message: string;
  details?: unknown;
  timestamp: string;
}

/** In-memory log buffer — flushed to DB at the end of a scrape run */
const logBuffer: LogEntry[] = [];

function formatMessage(entry: LogEntry): string {
  const prefix = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.provider ? `[${entry.provider}]` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return `${prefix} ${entry.message}${entry.details ? ` | ${JSON.stringify(entry.details)}` : ''}`;
}

function log(level: LogLevel, message: string, details?: unknown, provider?: ProviderCode, searchRunId?: string): void {
  const entry: LogEntry = {
    level,
    provider,
    searchRunId,
    message,
    details,
    timestamp: new Date().toISOString(),
  };

  logBuffer.push(entry);

  const formatted = formatMessage(entry);

  switch (level) {
    case 'debug':
      // Only log debug in non-production
      if (process.env['NODE_ENV'] !== 'production') {
        console.info(formatted);
      }
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

export const logger = {
  debug: (msg: string, details?: unknown, provider?: ProviderCode) =>
    log('debug', msg, details, provider),
  info: (msg: string, details?: unknown, provider?: ProviderCode) =>
    log('info', msg, details, provider),
  warn: (msg: string, details?: unknown, provider?: ProviderCode) =>
    log('warn', msg, details, provider),
  error: (msg: string, details?: unknown, provider?: ProviderCode) =>
    log('error', msg, details, provider),

  /** Get all buffered log entries for the current run */
  flushBuffer: (): LogEntry[] => {
    const entries = [...logBuffer];
    logBuffer.length = 0;
    return entries;
  },

  /** Get buffer without clearing */
  getBuffer: (): LogEntry[] => [...logBuffer],
};

export type { LogEntry, LogLevel };
