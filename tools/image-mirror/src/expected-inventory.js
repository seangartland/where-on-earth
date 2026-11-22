// Design-time snapshot from docs/image-r2-mirror-design.md's Inventory
// table (computed 2026-11-22). Used to detect repository drift: if a live
// inventory run no longer matches this, something in the four data files
// changed since the design was banked and the build must stop and explain
// the drift rather than silently proceeding on different numbers.
export const EXPECTED_INVENTORY_SNAPSHOT = {
  perFile: {
    'assets/locations.json': {
      entries: 803,
      imageReferences: 801,
      exactUniqueUrls: 801,
      hostCounts: { 'thumb.wikimedia.org': 626, 'upload.wikimedia.org': 156, 'commons.wikimedia.org': 19 },
    },
    'assets/locations-bank.json': {
      entries: 479,
      imageReferences: 478,
      exactUniqueUrls: 478,
      hostCounts: { 'thumb.wikimedia.org': 394, 'upload.wikimedia.org': 77, 'commons.wikimedia.org': 7 },
    },
    'assets/locations-bank-quarantine.json': {
      entries: 244,
      imageReferences: 244,
      exactUniqueUrls: 237,
      hostCounts: { 'thumb.wikimedia.org': 187, 'upload.wikimedia.org': 37, 'commons.wikimedia.org': 13 },
    },
    'assets/trivia-bank.json': {
      entries: 1303,
      imageReferences: 1282,
      exactUniqueUrls: 728,
      hostCounts: { 'thumb.wikimedia.org': 553, 'upload.wikimedia.org': 131, 'commons.wikimedia.org': 44 },
    },
  },
  totalMemberships: 2244,
  unionExactUniqueCount: 2114,
  unionHostCounts: { 'thumb.wikimedia.org': 1689, 'upload.wikimedia.org': 362, 'commons.wikimedia.org': 63 },
  crossFileUrlCount: 130,
  canonicalUniqueCount: 2106,
  nonImageGapCounts: {
    'assets/locations.json': 2,
    'assets/locations-bank.json': 1,
    'assets/locations-bank-quarantine.json': 0,
    'assets/trivia-bank.json': 21,
  },
};

// Returns a list of human-readable mismatches between a live buildInventory()
// result and the design-time snapshot above. Empty array means no drift.
export function diffFromExpectedSnapshot(inventory) {
  const mismatches = [];
  for (const [file, expected] of Object.entries(EXPECTED_INVENTORY_SNAPSHOT.perFile)) {
    const actual = inventory.perFile[file];
    if (!actual) {
      mismatches.push(`${file}: missing from live inventory`);
      continue;
    }
    for (const field of ['entries', 'imageReferences', 'exactUniqueUrls']) {
      if (actual[field] !== expected[field]) {
        mismatches.push(`${file}.${field}: expected ${expected[field]}, got ${actual[field]}`);
      }
    }
    for (const host of Object.keys(expected.hostCounts)) {
      if (actual.hostCounts[host] !== expected.hostCounts[host]) {
        mismatches.push(`${file}.hostCounts.${host}: expected ${expected.hostCounts[host]}, got ${actual.hostCounts[host]}`);
      }
    }
  }
  if (inventory.totalMemberships !== EXPECTED_INVENTORY_SNAPSHOT.totalMemberships) {
    mismatches.push(`totalMemberships: expected ${EXPECTED_INVENTORY_SNAPSHOT.totalMemberships}, got ${inventory.totalMemberships}`);
  }
  if (inventory.unionExactUniqueCount !== EXPECTED_INVENTORY_SNAPSHOT.unionExactUniqueCount) {
    mismatches.push(`unionExactUniqueCount: expected ${EXPECTED_INVENTORY_SNAPSHOT.unionExactUniqueCount}, got ${inventory.unionExactUniqueCount}`);
  }
  if (inventory.canonicalUniqueCount !== EXPECTED_INVENTORY_SNAPSHOT.canonicalUniqueCount) {
    mismatches.push(`canonicalUniqueCount: expected ${EXPECTED_INVENTORY_SNAPSHOT.canonicalUniqueCount}, got ${inventory.canonicalUniqueCount}`);
  }
  for (const [file, expectedGaps] of Object.entries(EXPECTED_INVENTORY_SNAPSHOT.nonImageGapCounts)) {
    const actualGaps = (inventory.nonImageGaps[file] || []).length;
    if (actualGaps !== expectedGaps) {
      mismatches.push(`${file}.nonImageGaps: expected ${expectedGaps}, got ${actualGaps}`);
    }
  }
  return mismatches;
}
