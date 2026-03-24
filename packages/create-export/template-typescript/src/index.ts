// Define your exports here - these will be available to clients

// Async function
export async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

// Sync function (will be async on client)
export function add(a: number, b: number): number {
  return a + b;
}

// AsyncIterator for streaming
export async function* countUp(start: number, end: number): AsyncGenerator<number> {
  for (let i = start; i <= end; i++) {
    await new Promise((r) => setTimeout(r, 100));
    yield i;
  }
}

// Nested object with methods
export const math = {
  multiply(a: number, b: number): number {
    return a * b;
  },
  factorial(n: number): number {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  },
};

// Class export (Comlink-style)
export class Counter {
  private count: number;

  constructor(initial: number = 0) {
    this.count = initial;
  }

  increment(): number {
    return ++this.count;
  }

  decrement(): number {
    return --this.count;
  }

  getCount(): number {
    return this.count;
  }

  async asyncIncrement(): Promise<number> {
    await new Promise((r) => setTimeout(r, 100));
    return ++this.count;
  }
}
