export class Queue<T> {
  private _oldestIndex: number;
  private _newestIndex: number;
  private _storage: Record<string, T>;

  constructor() {
    this._oldestIndex = 1;
    this._newestIndex = 1;
    this._storage = {};
  }
  getStorage(): Record<string, T> {
    return this._storage;
  }
  getSize(): number {
    return this._newestIndex - this._oldestIndex;
  }
  enqueue(data: T): void {
    this._storage[this._newestIndex] = data;
    this._newestIndex++;
  }
  dequeue(): T | undefined {
    const oldestIndex = this._oldestIndex;
    const newestIndex = this._newestIndex;
    let deletedData;

    if (oldestIndex !== newestIndex) {
      deletedData = this._storage[oldestIndex];
      delete this._storage[oldestIndex];
      this._oldestIndex++;

      return deletedData;
    }
  }
  peek(): T | undefined {
    const oldestIndex = this._oldestIndex;
    const newestIndex = this._newestIndex;
    let data;

    if (oldestIndex !== newestIndex) {
      data = this._storage[oldestIndex];

      return data;
    }
  }
}

exports.Queue = Queue;
