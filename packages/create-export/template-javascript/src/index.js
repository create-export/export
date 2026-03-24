// Define your exports here - these will be available to clients

// Async function
export async function greet(name) {
  return `Hello, ${name}!`;
}

// Sync function (will be async on client)
export function add(a, b) {
  return a + b;
}

// AsyncIterator for streaming
export async function* countUp(start, end) {
  for (let i = start; i <= end; i++) {
    await new Promise((r) => setTimeout(r, 100));
    yield i;
  }
}

// Nested object with methods
export const math = {
  multiply(a, b) {
    return a * b;
  },
  factorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  },
};

// Class export (Comlink-style)
export class Counter {
  constructor(initial = 0) {
    this.count = initial;
  }

  increment() {
    return ++this.count;
  }

  decrement() {
    return --this.count;
  }

  getCount() {
    return this.count;
  }

  async asyncIncrement() {
    await new Promise((r) => setTimeout(r, 100));
    return ++this.count;
  }
}
