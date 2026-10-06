const assert = require("node:assert/strict");
const { webcrypto, createPublicKey, verify } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const root = join(__dirname, "..");
const sandbox = { window: { crypto: webcrypto, btoa, atob }, TextEncoder, TextDecoder };
const context = vm.createContext(sandbox);
for (const file of ["retro", "scoring", "events", "physics", "bob-physics"]) {
  vm.runInContext(readFileSync(join(root, "js", file + ".js"), "utf8"), context);
}
sandbox.Events = sandbox.window.Events;
for (const id of sandbox.Events.ORDER) {
  vm.runInContext(readFileSync(join(root, "js/events", id + ".js"), "utf8"), context);
}
vm.runInContext(readFileSync(join(root, "js/result-codes.js"), "utf8"), context);
const codes = sandbox.window.ResultCodes;
const baseScores = { minigolf: 24, freethrows: 4, stones: 12, water: 24.1234, frisbee: 27, boccia: 200, bob: 35 };
const secondScores = { minigolf: 40, freethrows: 5, stones: 8, water: 26.4, frisbee: 20, boccia: 400, bob: -5 };

function completed(name = "ÅSE", tournament = "OL-2026", scores = baseScores) {
  const run = codes.createRun(name, tournament);
  run.scores = { ...scores };
  return run;
}

function decode(segment) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function signPayload(payload, changeHeader = {}) {
  const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const key = await webcrypto.subtle.exportKey("jwk", keys.publicKey);
  const message = encode({ alg: "ES256", typ: "JWT", jwk: key, ...changeHeader }) + "." + encode(payload);
  const signature = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(message));
  return message + "." + Buffer.from(signature).toString("base64url");
}

test("solo runs normalize names and tournament codes, and retain resumable partial results", () => {
  const run = codes.createRun(" åse ", " ol-2026 ");
  assert.equal(run.name, "ÅSE");
  assert.equal(run.tournament, "OL-2026");
  run.scores.minigolf = 24;
  const restored = codes.validateRun(JSON.parse(JSON.stringify(run)));
  assert.equal(restored.id, run.id);
  assert.equal(restored.scores.minigolf, 24);
  assert.throws(() => codes.createRun("", "OL-2026"));
  assert.throws(() => codes.createRun("ÅSE", "wrong code!"));
  assert.throws(() => codes.validateRun({ ...run, scores: { frisbee: 27 } }));
  assert.throws(() => codes.validateRun({ ...run, ruleset: "old-version" }));
});

test("a completed solo run produces a portable ES256 JWT with seven scores and Unicode names", async () => {
  const run = completed();
  const token = await codes.signRun(run);
  assert.equal(token.split(".").length, 3);
  assert.ok(!/[\s=+\/]/.test(token));
  const payload = await codes.verifyToken(token);
  assert.equal(payload.jti, run.id);
  assert.equal(payload.name, "ÅSE");
  assert.equal(payload.tournament, "OL-2026");
  assert.equal(JSON.stringify(payload.scores), JSON.stringify(baseScores));
  const [header, body, signature] = token.split(".");
  const publicKey = createPublicKey({ key: decode(header).jwk, format: "jwk" });
  assert.ok(verify("sha256", Buffer.from(header + "." + body),
    { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")),
  "an independent verifier must accept the standard ES256 signature");
  assert.equal(decode(header).jwk.d, undefined, "the shared code contains no private key");
});

test("altering scores or the signature invalidates a result code", async () => {
  const token = await codes.signRun(completed());
  const parts = token.split(".");
  const payload = decode(parts[1]);
  payload.scores.minigolf = 12;
  await assert.rejects(codes.verifyToken(parts[0] + "." + encode(payload) + "." + parts[2]), /SIGNATUR/);
  const signature = Buffer.from(parts[2], "base64url");
  signature[0] ^= 1;
  await assert.rejects(codes.verifyToken(parts[0] + "." + parts[1] + "." + signature.toString("base64url")), /SIGNATUR/);
});

test("unsigned, malformed, oversized, and unsupported result codes are rejected", async () => {
  const token = await codes.signRun(completed());
  const parts = token.split(".");
  for (const header of [null, { alg: "none", typ: "JWT" }, { ...decode(parts[0]), alg: "HS256" },
    { ...decode(parts[0]), crit: ["unknown"] }]) {
    await assert.rejects(codes.verifyToken(encode(header) + "." + parts[1] + "." + parts[2]));
  }
  for (const invalid of ["", "abc", "a.b.c", token + "=", "x".repeat(12001), "a.b.c.d"]) {
    await assert.rejects(codes.verifyToken(invalid));
  }
});

test("only complete and valid game scores can be signed or imported", async () => {
  const incomplete = completed();
  delete incomplete.scores.bob;
  await assert.rejects(codes.signRun(incomplete));
  for (const [id, invalid] of [["freethrows", 7], ["frisbee", 28], ["minigolf", 0], ["bob", -16], ["bob", 46], ["water", NaN], ["water", 8], ["stones", 1.2]]) {
    await assert.rejects(codes.signRun(completed("ÅSE", "OL-2026", { ...baseScores, [id]: invalid })));
  }
  const payload = decode((await codes.signRun(completed())).split(".")[1]);
  for (const altered of [{ ...payload, ruleset: "old-version" },
    { ...payload, scores: { ...payload.scores, frisbee: 999 } },
    { ...payload, aud: "another-app" }, { ...payload, scores: { minigolf: 24 } }]) {
    await assert.rejects(codes.verifyToken(await signPayload(altered)));
  }
});

test("combining codes calculates placements from all seven raw scores", async () => {
  const first = await codes.signRun(completed("ÅSE"));
  const second = await codes.signRun(completed("BO", "OL-2026", secondScores));
  const combined = await codes.combineCodes([first, second]);
  assert.equal(combined.history.length, 7);
  assert.equal(combined.players.length, 2);
  assert.equal(combined.standings[0].name, "ÅSE");
  assert.equal(combined.standings[0].points, 13);
  assert.equal(combined.standings[1].points, 8);
  assert.equal(combined.history[0][0].name, "ÅSE", "lower minigolf scores win");
  assert.equal(combined.history[1][0].name, "BO", "higher free-throw scores win");
  assert.equal(combined.history[3][0].name, "ÅSE", "lower swimming times win");
});

test("duplicates cannot add extra points, and mixed tournaments or duplicate names are rejected", async () => {
  const run = completed("ÅSE");
  const token = await codes.signRun(run);
  assert.equal((await codes.combineCodes([token, token])).players.length, 1);
  const otherTournament = await codes.signRun(completed("BO", "OTHER"));
  await assert.rejects(codes.combineCodes([token, otherTournament]), /FORSKELLIGE TURNERINGER/);
  const sameName = await codes.signRun(completed("ÅSE"));
  await assert.rejects(codes.combineCodes([token, sameName]), /ALLEREDE/);
  const differentCodeForSameRun = await codes.signRun(run);
  await assert.rejects(codes.combineCodes([token, differentCodeForSameRun]), /TO FORSKELLIGE/);
});

test("tied totals share the same place in combined tournament standings", async () => {
  const tokens = await Promise.all([
    codes.signRun(completed("ÅSE")), codes.signRun(completed("BO", "OL-2026", secondScores)),
    codes.signRun(completed("CAMILLA")),
  ]);
  const combined = await codes.combineCodes(tokens);
  assert.equal(combined.standings[0].points, 20);
  assert.equal(combined.standings[1].points, 20);
  assert.equal(combined.standings[0].place, 1);
  assert.equal(combined.standings[1].place, 1);
  assert.equal(combined.standings[2].place, 3);
});

test("a collector supports eight players and rejects a ninth", async () => {
  const tokens = await Promise.all(Array.from({ length: 9 }, (_, i) => codes.signRun(completed("SPILLER-" + i))));
  assert.equal((await codes.combineCodes(tokens.slice(0, 8))).players.length, 8);
  await assert.rejects(codes.combineCodes(tokens), /8 SPILLERE/);
});
