// Reconciles the manifest's "ready" rows against a live R2 listing of the
// photos/v1/ prefix, per docs/image-r2-mirror-design.md's metered-pipeline
// accounting: "Any missing, extra, size-mismatched, or hash-metadata-
// mismatched object fails the run and blocks rewrite. Report extra objects
// but never delete them without a separately reviewed cleanup plan."

function expectedKeysFromManifest(manifestRows) {
  const expected = new Map(); // key -> { bytes, sha256 }
  for (const row of manifestRows) {
    if (row.status !== 'ready') continue;
    for (const variant of row.variants || []) {
      if (variant.status !== 'verified') continue;
      expected.set(variant.key, { bytes: variant.bytes, sha256: variant.sha256 });
    }
  }
  return expected;
}

// r2Objects: array of { key, size } as returned by listAllObjects().
export function reconcileManifestWithR2(manifestRows, r2Objects) {
  const expected = expectedKeysFromManifest(manifestRows);
  const actual = new Map(r2Objects.map((obj) => [obj.key, obj]));

  const missing = []; // expected but not present in R2
  const sizeMismatched = [];
  for (const [key, info] of expected) {
    const found = actual.get(key);
    if (!found) {
      missing.push(key);
    } else if (info.bytes != null && found.size !== info.bytes) {
      sizeMismatched.push({ key, expectedBytes: info.bytes, actualBytes: found.size });
    }
  }

  const extra = [...actual.keys()].filter((key) => !expected.has(key));

  return {
    expectedCount: expected.size,
    actualCount: actual.size,
    missing,
    extra,
    sizeMismatched,
    ok: missing.length === 0 && extra.length === 0 && sizeMismatched.length === 0,
  };
}
