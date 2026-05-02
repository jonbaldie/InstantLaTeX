function add(a, b) {
  return a + b;
}

describe('Smoke test', () => {
  it('should add two numbers correctly', () => {
    expect(add(2, 3)).toBe(5);
  });
});
