
export interface BassHistoryEntry {
  sensitivity: number;
  frequency: number;
  timestamp: number;
}

export interface AnalysisData {
  pitch: number;
  bassPitch?: number; 
  isHiRes: boolean;
  sensitivity: number;
  bassSensitivity?: number;
  bassHistory?: BassHistoryEntry[];
}

export interface CachedAudioBuffer {
  sampleRate: number;
  channels: Float32Array[];
  timestamp?: number; // Added for LRU
}

// Internal storage structure for unified file analysis
interface StoredFileAnalysis {
  results: Record<number, AnalysisData>;
  history: BassHistoryEntry[];
}

const DB_NAME = 'ZenTunerDB';
const DB_VERSION = 2; 
const STORE_ANALYSIS = 'analysis';
const STORE_BUFFERS = 'audio_buffers';

// Limits for LRU Strategy
const MAX_CACHED_TRACKS = 5; 
const MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB Limit

class CacheService {
  private db: IDBDatabase | null = null;
  private connectionPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const transaction = (e.target as IDBOpenDBRequest).transaction;
        
        if (!db.objectStoreNames.contains(STORE_ANALYSIS)) {
          db.createObjectStore(STORE_ANALYSIS);
        }
        
        let bufferStore: IDBObjectStore;
        if (!db.objectStoreNames.contains(STORE_BUFFERS)) {
          bufferStore = db.createObjectStore(STORE_BUFFERS);
        } else {
          bufferStore = transaction!.objectStore(STORE_BUFFERS);
        }

        if (!bufferStore.indexNames.contains('timestamp')) {
            bufferStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        
        // Robust closure handling
        this.db.onversionchange = () => {
          this.closeDB();
        };
        
        this.db.onclose = () => {
           this.closeDB();
        };

        resolve(this.db);
      };

      request.onerror = () => {
        console.error('IndexedDB open error:', request.error);
        this.closeDB();
        reject(request.error);
      };
      
      request.onblocked = () => {
         console.warn("Database open blocked. Please close other tabs of this app.");
      };
    });

    return this.connectionPromise;
  }

  private closeDB() {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {
        // Ignore errors on close
      }
    }
    this.db = null;
    this.connectionPromise = null;
  }

  // --- Robust Transaction Helper ---
  // Retries transaction if connection is closed or invalid
  private async performTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T> | void
  ): Promise<T> {
    try {
      return await this._runTransaction(storeName, mode, operation);
    } catch (err: any) {
      const isConnectionError = err && (
          err.name === 'InvalidStateError' || 
          err.message?.includes('closed') ||
          err.name === 'ClosureError'
      );

      if (isConnectionError) {
        console.warn('DB closed, retrying transaction...');
        this.closeDB(); // Force reset
        return await this._runTransaction(storeName, mode, operation);
      }
      throw err;
    }
  }

  private async _runTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T> | void
  ): Promise<T> {
    const db = await this.getDB();
    
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = db.transaction(storeName, mode);
      } catch (e) {
        reject(e); // Likely InvalidStateError if DB is closed
        return;
      }

      const store = transaction.objectStore(storeName);
      let request: IDBRequest<T> | void;
      
      try {
        request = operation(store);
      } catch (e) {
        reject(e);
        return;
      }

      transaction.oncomplete = () => {
        resolve(request ? request.result : undefined as T);
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  private generateKey(file: File, suffix: string = ''): string {
    return `${file.name}_${file.size}_${file.lastModified}${suffix}`;
  }

  // --- Analysis Cache ---

  public async saveAnalysis(file: File, data: AnalysisData): Promise<void> {
    try {
      const key = this.generateKey(file, '_master');
      
      await this.performTransaction(STORE_ANALYSIS, 'readwrite', (store) => {
        const getRequest = store.get(key);
        getRequest.onsuccess = () => {
           const existing: StoredFileAnalysis = getRequest.result || { results: {}, history: [] };
           
           existing.results[data.sensitivity] = data;
           
           if (data.bassPitch !== undefined) {
               const newEntry: BassHistoryEntry = {
                   sensitivity: data.bassSensitivity !== undefined ? data.bassSensitivity : data.sensitivity,
                   frequency: data.bassPitch,
                   timestamp: Date.now()
               };
               
               existing.history.push(newEntry);
               existing.history.sort((a, b) => b.timestamp - a.timestamp);
               if (existing.history.length > 20) {
                   existing.history = existing.history.slice(0, 20);
               }
           }
           store.put(existing, key);
        };
        return getRequest; // Return request to keep transaction alive logic consistent, though we act in onsuccess
      });
    } catch (e) {
      console.warn('Failed to save analysis', e);
    }
  }

  public async loadAnalysis(file: File, sensitivity: number = 50): Promise<AnalysisData | null> {
    try {
      const key = this.generateKey(file, '_master');
      
      const result = await this.performTransaction(STORE_ANALYSIS, 'readonly', (store) => {
        return store.get(key);
      }) as StoredFileAnalysis;

      if (result && result.results && result.results[sensitivity]) {
         const data = result.results[sensitivity];
         data.bassHistory = result.history;
         return data;
      }
      
      // Legacy Fallback (Try old single key format)
      try {
         const oldKey = this.generateKey(file, `_s${sensitivity}`);
         const oldResult = await this.performTransaction(STORE_ANALYSIS, 'readonly', (store) => store.get(oldKey)) as AnalysisData;
         return oldResult || null;
      } catch {
         return null;
      }

    } catch (e) {
      console.warn('Failed to load analysis', e);
      return null;
    }
  }

  // --- Audio Buffer Cache with LRU ---

  private getBufferSize(data: CachedAudioBuffer): number {
      let size = 0;
      if (data.channels) {
          for (const ch of data.channels) {
              size += ch.byteLength;
          }
      }
      return size;
  }

  private async enforceStorageLimits(incomingSize: number): Promise<void> {
      // Use performTransaction to handle DB connection retries
      return this.performTransaction(STORE_BUFFERS, 'readwrite', (store) => {
          const index = store.index('timestamp');
          const entriesToDelete: IDBValidKey[] = [];
          const items: { key: IDBValidKey, size: number }[] = [];
          
          const cursorRequest = index.openCursor(null, 'next'); // Oldest first

          cursorRequest.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
              if (cursor) {
                  items.push({ key: cursor.primaryKey, size: this.getBufferSize(cursor.value) });
                  cursor.continue();
              } else {
                  // Cursor done, calculate deletion
                  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
                  let sizeAccumulator = totalSize;
                  let countAccumulator = items.length;

                  for (const item of items) {
                      const isOverCount = (countAccumulator >= MAX_CACHED_TRACKS); 
                      const isOverSize = (sizeAccumulator + incomingSize > MAX_CACHE_SIZE_BYTES);

                      if (isOverCount || isOverSize) {
                          store.delete(item.key);
                          sizeAccumulator -= item.size;
                          countAccumulator--;
                      } else {
                          break; 
                      }
                  }
              }
          };
      });
  }

  public async saveBuffer(file: File, data: CachedAudioBuffer): Promise<void> {
    try {
      const key = this.generateKey(file, '_buffer');
      const incomingSize = this.getBufferSize(data);
      data.timestamp = Date.now();

      // Ensure space (this might reconnect the DB)
      await this.enforceStorageLimits(incomingSize);
      
      // Now save (this might also retry if needed)
      await this.performTransaction(STORE_BUFFERS, 'readwrite', (store) => {
          return store.put(data, key);
      });

    } catch (e: any) {
      if (e && e.name === 'QuotaExceededError') {
         console.warn("Quota exceeded. Clearing cache...");
         this.closeDB(); // Reset connection to be safe
         const db = await this.getDB();
         const trans = db.transaction(STORE_BUFFERS, 'readwrite');
         trans.objectStore(STORE_BUFFERS).clear();
      } else {
         console.warn('Failed to save buffer', e);
      }
    }
  }

  public async loadBuffer(file: File): Promise<CachedAudioBuffer | null> {
    try {
      const key = this.generateKey(file, '_buffer');
      
      const result = await this.performTransaction(STORE_BUFFERS, 'readwrite', (store) => {
          return store.get(key);
      }) as CachedAudioBuffer;

      if (result) {
         // Touch timestamp asynchronously to update LRU, don't wait
         this.performTransaction(STORE_BUFFERS, 'readwrite', (store) => {
             result.timestamp = Date.now();
             store.put(result, key);
         }).catch(() => {}); // Ignore errors on touch
         return result;
      }
      return null;

    } catch (e) {
      console.warn('Failed to load buffer', e);
      return null;
    }
  }
}

export const cacheService = new CacheService();
