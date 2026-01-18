import fc from 'fast-check';

/**
 * Example Property-Based Test
 * 
 * This is a template for writing property-based tests using fast-check.
 * Each property test should:
 * 1. Reference the design document property number
 * 2. Run at least 100 iterations
 * 3. Test a universal property that should hold for all inputs
 */

describe('Example Property-Based Tests', () => {
  // Feature: discord-improvements, Property Example: Addition is commutative
  test('addition is commutative', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer(),
        (a, b) => {
          // Property: a + b should equal b + a for all integers
          expect(a + b).toBe(b + a);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: discord-improvements, Property Example: Array reverse is involutive
  test('reversing an array twice returns original', () => {
    fc.assert(
      fc.property(
        fc.array(fc.anything()),
        (arr) => {
          // Property: reverse(reverse(arr)) should equal arr
          const reversed = [...arr].reverse();
          const doubleReversed = [...reversed].reverse();
          expect(doubleReversed).toEqual(arr);
        }
      ),
      { numRuns: 100 }
    );
  });
});
