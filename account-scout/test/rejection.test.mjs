import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.SCOUT_URL;

test("Google ID-token rejection paths", { skip: !base }, async () => {
  const post = (body) =>
    fetch(`${base}/scout/google-id-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  let response = await post({});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "MISSING_ID_TOKEN");

  response = await post({ idToken: "not-a-jwt" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "MALFORMED_ID_TOKEN");

  const segment = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const wrongAudience = `${segment({ alg: "none" })}.${segment({ aud: "wrong.example" })}.x`;
  response = await post({ idToken: wrongAudience });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "WRONG_AUDIENCE");
});
