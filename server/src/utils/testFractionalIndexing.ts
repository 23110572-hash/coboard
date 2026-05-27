import { generateKeyBetween, generateNKeysBetween } from "./fractionalIndexing.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("Running fractional indexing tests...");

// Test Case 1: Empty list
const first = generateKeyBetween(null, null);
assert(first === "a0", `Default first key should be 'a0', got '${first}'`);
console.log("✓ Empty list init passed");

// Test Case 2: Prepend
const prepended = generateKeyBetween(null, first);
assert(prepended < first, `Prepended key '${prepended}' should be < '${first}'`);
console.log("✓ Prepend passed:", prepended);

// Test Case 3: Append
const appended = generateKeyBetween(first, null);
assert(appended > first, `Appended key '${appended}' should be > '${first}'`);
console.log("✓ Append passed:", appended);

// Test Case 4: Midpoint insertion
const mid = generateKeyBetween(first, appended);
assert(first < mid && mid < appended, `Mid '${mid}' should be between '${first}' and '${appended}'`);
console.log("✓ Midpoint insertion passed:", mid);

// Test Case 5: Consecutive character insertion
const k1 = "a0";
const k2 = "a1";
const kMid = generateKeyBetween(k1, k2);
assert(k1 < kMid && kMid < k2, `Consecutive mid '${kMid}' should be between '${k1}' and '${k2}'`);
console.log("✓ Consecutive midpoint insertion passed:", kMid);

// Test Case 6: N Keys generation
const nKeys = generateNKeysBetween(null, null, 5);
assert(nKeys.length === 5, "Should generate 5 keys");
for (let i = 0; i < nKeys.length - 1; i++) {
  assert(nKeys[i] < nKeys[i + 1], `Keys should be sorted: ${nKeys[i]} < ${nKeys[i + 1]}`);
}
console.log("✓ N Keys generation passed:", nKeys);

// Test Case 7: Complex boundaries
const edge1 = "Zz";
const edge2 = "a0";
const edgeMid = generateKeyBetween(edge1, edge2);
assert(edge1 < edgeMid && edgeMid < edge2, `Edge mid '${edgeMid}' should be between '${edge1}' and '${edge2}'`);
console.log("✓ Edge cases midpoint passed:", edgeMid);

console.log("All fractional indexing tests completed successfully!");
export {};
