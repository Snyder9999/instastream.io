export class SimpleLRUCache<K, V> {
    private capacity: number;
    private cache: Map<K, V>;

    constructor(capacity: number) {
      if (capacity <= 0) {
        throw new Error("Capacity must be positive");
      }
      this.capacity = capacity;
      this.cache = new Map();
    }

    get(key: K): V | undefined {
      if (!this.cache.has(key)) {
        return undefined;
      }
      // Refresh the key by deleting and re-setting
      const value = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key: K, value: V): void {
      if (this.cache.has(key)) {
        // Update value and refresh position
        this.cache.delete(key);
      } else if (this.cache.size >= this.capacity) {
        // Evict least recently used (first item in Map)
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(key, value);
    }

    clear(): void {
      this.cache.clear();
    }
}
