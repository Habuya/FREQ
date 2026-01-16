export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  level: LogLevel;
  code?: string;
  source?: string;
}

type Listener = (entry: LogEntry) => void;

class LoggerService {
  private listeners: Set<Listener> = new Set();
  private history: LogEntry[] = [];
  private maxHistory = 200;

  constructor() {
      // Boot message
      this.log('Quantum Audio Engine Initialized', 'info', 'BOOT', 'SYS');
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public log(message: string, level: LogLevel = 'info', code?: string, source: string = 'SYS') {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      message,
      level,
      code,
      source
    };

    this.history.unshift(entry);
    if (this.history.length > this.maxHistory) this.history.pop();

    this.listeners.forEach(fn => fn(entry));
  }

  public getHistory() {
    return this.history;
  }
  
  public clear() {
      this.history = [];
      this.log('Log Buffer Cleared', 'info', 'CLR', 'UI');
  }

  // Shortcuts
  public info(msg: string, code?: string) { this.log(msg, 'info', code); }
  public warn(msg: string, code?: string) { this.log(msg, 'warn', code); }
  public error(msg: string, code?: string) { this.log(msg, 'error', code); }
  public success(msg: string, code?: string) { this.log(msg, 'success', code); }
}

export const logger = new LoggerService();