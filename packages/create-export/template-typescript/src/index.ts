// Define your exports here - these will be available to clients

export async function greet(name: string): Promise<string> {
  return `Hello, ${name}!`;
}

export async function add(a: number, b: number): Promise<number> {
  return a + b;
}

// AsyncIterator example - streaming data
export async function* countUp(start: number, end: number): AsyncGenerator<number> {
  for (let i = start; i <= end; i++) {
    await new Promise((r) => setTimeout(r, 100));
    yield i;
  }
}

// Nested object with methods
export const math = {
  async multiply(a: number, b: number): Promise<number> {
    return a * b;
  },
  async factorial(n: number): Promise<number> {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  },
};
