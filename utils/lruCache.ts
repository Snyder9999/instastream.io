export class SimpleLRUCache<K, V> {
  private capacity: number;
  private map: Map<K, V>;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.map = new Map<K, V>();
  }

  get(key: K): V | undefined {
    const item = this.map.get(key);
    if (item !== undefined) {
      // Refresh key by deleting and re-inserting
      this.map.delete(key);
      this.map.set(key, item);
    }
    return item;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      // Delete the oldest item (first in Map iteration)
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        this.map.delete(firstKey);
      }
    }
    this.map.set(key, value);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
