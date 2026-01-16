import { MasteringPreset, AudioSettings } from '../types';

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
  isBassEstimated?: boolean; // New Flag for Auto-Estimated Fallback
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
const DB_VERSION = 3; 
const STORE_ANALYSIS = 'analysis';
const STORE_BUFFERS = 'audio_buffers';
const STORE_PRESETS = 'presets';

// Limits for LRU Strategy
const MAX_CACHED_TRACKS = 5; 
const MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB Limit

// Factory Defaults (Updated based on requirements)
const DEFAULT_PRESETS: MasteringPreset[] = [
  {
    id: 'factory_pure_zen',
    name: 'Pure Zen (432Hz)',
    isFactory: true,
    createdAt: 0,
    data: {
      fftSize: 8192,
      smoothingTimeConstant: 0.8,
      saturationType: 'clean',
      bypassBody: false,
      bypassResonance: false,
      bypassAir: false,
      stereoWidth: 1.0,
      sacredGeometryMode: true,
      fibonacciAlignment: true,
      phaseLockEnabled: true,
      cymaticsMode: false,
      binauralMode: false,
      binauralBeatFreq: 8,
      harmonicWarmth: 0.0,
      harmonicClarity: 0.0,
      timbreMorph: 1.0,
      deepZenBass: 0.0,
      spaceResonance: 0.0,
      roomScale: 0.5,
      breathingEnabled: false,
      breathingIntensity: 0.0,
      autoEqEnabled: true,
      autoEqIntensity: 0.5
    }
  },
  {
    id: 'factory_deep_meditation',
    name: 'Deep Meditation',
    isFactory: true,
    createdAt: 0,
    data: {
      fftSize: 8192,
      smoothingTimeConstant: 0.85,
      saturationType: 'tape',
      bypassBody: false,
      bypassResonance: false,
      bypassAir: false,
      stereoWidth: 1.2,
      sacredGeometryMode: false,
      fibonacciAlignment: false,
      phaseLockEnabled: true,
      cymaticsMode: false,
      binauralMode: true,
      binauralBeatFreq: 8,
      harmonicWarmth: 0.3,
      harmonicClarity: 0.0,
      timbreMorph: 1.0,
      deepZenBass: 0.85,
      spaceResonance: 0.3,
      roomScale: 0.8,
      breathingEnabled: true,
      breathingIntensity: 0.4,
      autoEqEnabled: false,
      autoEqIntensity: 0.5
    }
  },
  {
    id: 'factory_solfeggio_528',
    name: 'Solfeggio 528',
    isFactory: true,
    createdAt: 0,
    data: {
      fftSize: 16384, // High Res
      smoothingTimeConstant: 0.7,
      saturationType: 'clean',
      bypassBody: true,
      bypassResonance: false,
      bypassAir: false,
      stereoWidth: 1.1,
      sacredGeometryMode: false,
      fibonacciAlignment: false,
      phaseLockEnabled: false,
      cymaticsMode: true,
      binauralMode: false,
      binauralBeatFreq: 8,
      harmonicWarmth: 0.0,
      harmonicClarity: 0.6,
      timbreMorph: 1.0,
      deepZenBass: 0.0,
      spaceResonance: 0.1,
      roomScale: 0.5,
      breathingEnabled: false,
      breathingIntensity: 0.0,
      autoEqEnabled: true,
      autoEqIntensity: 0.6
    }
  }
];

class CacheService {
  private db: IDBDatabase | null = null;
  private connectionPromise: Promise<IDBDatabase> | null = null;
  private dbDisabled: boolean = false;

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbDisabled) throw new Error("IndexedDB is disabled");
    if (this.db) return this.db;
    
    // If there is a pending connection that failed, clear it to retry
    if (this.connectionPromise) {
        try {
            return await this.connectionPromise;
        } catch (e) {
            this.connectionPromise = null;
            // If the failure resulted in disabling the DB, fail fast
            if (this.dbDisabled) throw new Error("IndexedDB is disabled");
        }
    }

    this.connectionPromise = this.openDBWithRetry();
    return this.connectionPromise;
  }

  private openDBWithRetry(attempt = 0): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            this.dbDisabled = true;
            reject(new Error("IndexedDB not supported"));
            return;
        }

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

            // New Preset Store
            let presetStore: IDBObjectStore;
            if (!db.objectStoreNames.contains(STORE_PRESETS)) {
                presetStore = db.createObjectStore(STORE_PRESETS, { keyPath: 'id' });
                // Seed defaults immediately
                DEFAULT_PRESETS.forEach(preset => presetStore.add(preset));
            }
        };

        request.onsuccess = () => {
            this.db = request.result;
            
            this.db.onversionchange = () => {
                this.closeDB();
            };
            
            this.db.onclose = () => {
                this.closeDB();
            };

            resolve(this.db);
        };

        request.onerror = (event) => {
            event.preventDefault(); // Stop propagation to prevent "Internal error" logs
            const error = request.error;
            
            this.closeDB();
            
            if (attempt === 0) {
                // Downgraded to info to reduce alarm in console if it's transient
                console.info("IndexedDB initialization retry (attempt 1):", error ? error.message : "Unknown error");
                
                try {
                    const delReq = indexedDB.deleteDatabase(DB_NAME);
                    
                    delReq.onsuccess = () => {
                        this.openDBWithRetry(1).then(resolve).catch(reject);
                    };
                    
                    delReq.onerror = (e) => {
                        e.preventDefault();
                        console.warn("Database reset failed. Disabling persistent storage.");
                        this.dbDisabled = true;
                        reject(error);
                    };
                } catch (e) {
                    this.dbDisabled = true;
                    reject(e);
                }
            } else {
                console.warn("IndexedDB unavailable. App will run in memory-only mode.", error);
                this.dbDisabled = true;
                reject(error);
            }
        };
        
        request.onblocked = (event) => {
            event.preventDefault();
            console.warn("IndexedDB blocked. Please close other tabs of this app.");
        };
    });
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
        // Retry logic for transaction errors
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
        reject(e); 
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

      transaction.onerror = (e) => {
          e.preventDefault();
          reject(transaction.error);
      };
    });
  }

  private generateKey(file: File, suffix: string = ''): string {
    return `${file.name}_${file.size}_${file.lastModified}${suffix}`;
  }

  // --- Presets ---
  public async getAllPresets(): Promise<MasteringPreset[]> {
      try {
          const presets = await this.performTransaction(STORE_PRESETS, 'readonly', (store) => {
              return store.getAll();
          }) as MasteringPreset[];
          
          if (!presets || presets.length === 0) {
              return DEFAULT_PRESETS;
          }
          return presets.sort((a, b) => {
              // Factory first, then recent custom
              if (a.isFactory && !b.isFactory) return -1;
              if (!a.isFactory && b.isFactory) return 1;
              return b.createdAt - a.createdAt;
          });
      } catch (e) {
          // Silent fallback to defaults if DB is disabled/broken
          return DEFAULT_PRESETS;
      }
  }

  public async savePreset(preset: MasteringPreset): Promise<void> {
      try {
          await this.performTransaction(STORE_PRESETS, 'readwrite', (store) => {
              return store.put(preset);
          });
      } catch (e) {
          // Silent fail for UX smoothness
      }
  }

  public async deletePreset(id: string): Promise<void> {
      try {
          await this.performTransaction(STORE_PRESETS, 'readwrite', (store) => {
              return store.delete(id);
          });
      } catch (e) {
          // Silent fail
      }
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
        return getRequest; 
      });
    } catch (e) {
      // Ignore save errors silently in fallback mode
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
      
      try {
         const oldKey = this.generateKey(file, `_s${sensitivity}`);
         const oldResult = await this.performTransaction(STORE_ANALYSIS, 'readonly', (store) => store.get(oldKey)) as AnalysisData;
         return oldResult || null;
      } catch {
         return null;
      }

    } catch (e) {
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
      return this.performTransaction(STORE_BUFFERS, 'readwrite', (store) => {
          const index = store.index('timestamp');
          const items: { key: IDBValidKey, size: number }[] = [];
          
          const cursorRequest = index.openCursor(null, 'next'); 

          cursorRequest.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
              if (cursor) {
                  items.push({ key: cursor.primaryKey, size: this.getBufferSize(cursor.value) });
                  cursor.continue();
              } else {
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

      await this.enforceStorageLimits(incomingSize);
      
      await this.performTransaction(STORE_BUFFERS, 'readwrite', (store) => {
          return store.put(data, key);
      });

    } catch (e: any) {
      if (e && e.name === 'QuotaExceededError') {
         console.warn("Quota exceeded. Clearing cache...");
         this.closeDB(); 
         const db = await this.getDB();
         const trans = db.transaction(STORE_BUFFERS, 'readwrite');
         trans.objectStore(STORE_BUFFERS).clear();
      }
      // Catch other potential errors silently to prevent app crash if saving fails
    }
  }

  public async loadBuffer(file: File): Promise<CachedAudioBuffer | null> {
    try {
      const key = this.generateKey(file, '_buffer');
      
      const result = await this.performTransaction(STORE_BUFFERS, 'readwrite', (store) => {
          return store.get(key);
      }) as CachedAudioBuffer;

      if (result) {
         this.performTransaction(STORE_BUFFERS, 'readwrite', (store) => {
             result.timestamp = Date.now();
             store.put(result, key);
         }).catch(() => {}); 
         return result;
      }
      return null;

    } catch (e) {
      return null;
    }
  }
}

export const cacheService = new CacheService();