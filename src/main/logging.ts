import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

type LogLevel = 'log' | 'info' | 'warn' | 'error';

let logStream: fs.WriteStream | null = null;
let initialized = false;

// Keep original console methods
const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

function formatLine(level: LogLevel, parts: any[], source: 'Main' | 'Renderer' | 'System' = 'Main') {
  const ts = new Date().toISOString();
  const msg = parts.map(p => {
    try {
      if (typeof p === 'string') return p;
      return JSON.stringify(p);
    } catch {
      return String(p);
    }
  }).join(' ');
  return `[${ts}] [${source}] [${level.toUpperCase()}] ${msg}\n`;
}

function writeLine(line: string) {
  if (logStream && !logStream.destroyed) {
    logStream.write(line);
  }
}

export function initFileLogger() {
  if (initialized) return;
  initialized = true;

  try {
    const logsDir = app.getPath('logs');
    // Ensure directory exists
    fs.mkdirSync(logsDir, { recursive: true });

    const fileBase = (app.getName && app.getName()) || 'app';
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '');
    const logFile = path.join(logsDir, `${fileBase}_${stamp}.log`);

    logStream = fs.createWriteStream(logFile, { flags: 'a' });

    // Header
    writeLine(formatLine('info', [`Log file created at ${logFile}`], 'System'));
    writeLine(formatLine('info', [`App version: ${app.getVersion()}`], 'System'));
    writeLine(formatLine('info', [`Platform: ${process.platform} ${process.arch}`], 'System'));

    // Override console methods (duplicate to stdout and file)
    console.log = (...args: any[]) => {
      originalConsole.log(...args);
      writeLine(formatLine('log', args, 'Main'));
    };
    console.info = (...args: any[]) => {
      originalConsole.info(...args);
      writeLine(formatLine('info', args, 'Main'));
    };
    console.warn = (...args: any[]) => {
      originalConsole.warn(...args);
      writeLine(formatLine('warn', args, 'Main'));
    };
    console.error = (...args: any[]) => {
      originalConsole.error(...args);
      writeLine(formatLine('error', args, 'Main'));
    };

    // Capture unhandled errors in Main
    process.on('uncaughtException', (err) => {
      writeLine(formatLine('error', ['uncaughtException', err.stack || err.message]));
    });
    process.on('unhandledRejection', (reason: any) => {
      writeLine(formatLine('error', ['unhandledRejection', reason && (reason.stack || reason.message) || String(reason)]));
    });

    // Capture console from all WebContents (Renderer)
    app.on('web-contents-created', (_event, contents) => {
      contents.on('console-message', (_e, level, message, line, sourceId) => {
        const mapLevel: Record<number, LogLevel> = { 0: 'log', 1: 'info', 2: 'warn', 3: 'error' };
        const lvl = mapLevel[level] ?? 'log';
        writeLine(formatLine(lvl, [`${message} (${sourceId}:${line})`], 'Renderer'));
      });
    });

    // Close stream on app quit
    app.on('will-quit', () => {
      try {
        writeLine(formatLine('info', ['App will quit'], 'System'));
        logStream?.end();
      } catch {}
    });
  } catch (err) {
    // If logging setup fails, fall back silently
    originalConsole.error('Failed to initialize file logger:', err);
  }
}

