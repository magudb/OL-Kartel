/* result-codes.js — offline ES256 result codes and cross-player standings */
(function (global) {
  "use strict";

  const RULESET = "ol2026-v6-water200-bob-casual";
  const ISSUER = "ol2026-browser";
  const AUDIENCE = "ol2026-results";
  const MAX_CODE_LENGTH = 12000;
  const EVENT_IDS = ["minigolf", "freethrows", "stones", "water", "frisbee", "boccia", "bob"];
  const LIMITS = {
    minigolf: [12, 96], freethrows: [0, 6], stones: [0, 100],
    water: [200 / 8.5, 86400], frisbee: [0, 27], boccia: [0, 3200], bob: [-15, 45],
  };
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", { fatal: true });

  function subtleCrypto() {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error("RESULTATKODER KRÆVER EN MODERNE BROWSER MED HTTPS, LOCALHOST ELLER EN LOKAL FIL.");
    }
    return global.crypto.subtle;
  }

  function encodeBytes(bytes) {
    return global.btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeBytes(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
      throw new Error("UGYLDIG RESULTATKODE.");
    }
    const binary = global.atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (encodeBytes(bytes) !== value) throw new Error("UGYLDIG RESULTATKODE.");
    return bytes;
  }

  function encodeJSON(value) {
    return encodeBytes(encoder.encode(JSON.stringify(value)));
  }

  function normalizeName(value) {
    const name = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (!name || name.length > 12 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new Error("ANGIV ET NAVN PÅ 1–12 TEGN.");
    }
    return name;
  }

  function normalizeTournament(value) {
    const tournament = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(tournament)) {
      throw new Error("TURNERINGSKODEN SKAL VÆRE 1–40 TEGN: A–Z, 0–9, BINDESTREG ELLER UNDERSCORE.");
    }
    return tournament;
  }

  function validateScore(id, score) {
    const limits = LIMITS[id];
    if (!limits || !Number.isFinite(score) || score < limits[0] || score > limits[1] ||
      (id !== "water" && !Number.isInteger(score))) {
      throw new Error("UGYLDIG SCORE FOR " + id.toUpperCase() + ".");
    }
    return score;
  }

  function validateScores(scores, complete) {
    if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
      throw new Error("RESULTATET MANGLER DISCIPLINER.");
    }
    const ids = Object.keys(scores);
    if (ids.some((id) => !EVENT_IDS.includes(id)) || (complete && ids.length !== EVENT_IDS.length)) {
      throw new Error("RESULTATET SKAL INDEHOLDE ALLE 7 DISCIPLINER.");
    }
    const clean = {};
    let missing = false;
    for (const id of EVENT_IDS) {
      if (Object.hasOwn(scores, id)) {
        if (missing) throw new Error("GEMTE DISCIPLINER ER IKKE I DEN RIGTIGE RÆKKEFØLGE.");
        clean[id] = validateScore(id, scores[id]);
      } else {
        missing = true;
      }
    }
    return clean;
  }

  function validId(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value);
  }

  function createRun(name, tournament) {
    subtleCrypto();
    const bytes = global.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
    return {
      version: 1, ruleset: RULESET, id,
      name: normalizeName(name), tournament: normalizeTournament(tournament),
      startedAt: Math.floor(Date.now() / 1000), scores: {}, token: "",
    };
  }

  function validateRun(run) {
    if (!run || run.version !== 1 || run.ruleset !== RULESET || !validId(run.id) ||
      !Number.isSafeInteger(run.startedAt) || run.startedAt <= 0 ||
      typeof run.token !== "string" || run.token.length > MAX_CODE_LENGTH) {
      throw new Error("DET GEMTE SPIL ER FRA EN ANDEN VERSION ELLER ER BESKADIGET.");
    }
    return {
      version: 1, ruleset: RULESET, id: run.id,
      name: normalizeName(run.name), tournament: normalizeTournament(run.tournament),
      startedAt: run.startedAt, scores: validateScores(run.scores, false), token: run.token,
    };
  }

  function validatePayload(payload) {
    if (!payload || payload.iss !== ISSUER || payload.aud !== AUDIENCE || payload.version !== 1 ||
      payload.ruleset !== RULESET || !validId(payload.jti) ||
      !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.startedAt) ||
      payload.startedAt <= 0 || payload.iat < payload.startedAt ||
      payload.name !== normalizeName(payload.name) ||
      payload.tournament !== normalizeTournament(payload.tournament)) {
      throw new Error("KODEN ER FRA EN ANDEN SPILVERSION ELLER HAR UGYLDIGT INDHOLD.");
    }
    validateScores(payload.scores, true);
    return payload;
  }

  async function signRun(value) {
    const run = validateRun(value);
    const payload = validatePayload({
      iss: ISSUER, aud: AUDIENCE, version: 1, ruleset: RULESET, jti: run.id,
      name: run.name, tournament: run.tournament, startedAt: run.startedAt,
      iat: Math.max(run.startedAt, Math.floor(Date.now() / 1000)),
      scores: validateScores(run.scores, true),
    });
    const subtle = subtleCrypto();
    // Each completed run signs with its own key. No shared secret is shipped in the app.
    // This protects a shared code's integrity; it does not authenticate gameplay.
    const keys = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    const publicKey = await subtle.exportKey("jwk", keys.publicKey);
    const header = { alg: "ES256", typ: "JWT", jwk: {
      kty: "EC", crv: "P-256", x: publicKey.x, y: publicKey.y,
    } };
    const message = encodeJSON(header) + "." + encodeJSON(payload);
    const signature = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, encoder.encode(message));
    return message + "." + encodeBytes(signature);
  }

  async function verifyToken(value) {
    const token = typeof value === "string" ? value.trim() : "";
    if (!token || token.length > MAX_CODE_LENGTH) throw new Error("UGYLDIG ELLER FOR LANG RESULTATKODE.");
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("RESULTATKODEN SKAL HAVE TRE DELE.");
    let header, payload, signature;
    try {
      header = JSON.parse(decoder.decode(decodeBytes(parts[0])));
      payload = JSON.parse(decoder.decode(decodeBytes(parts[1])));
      signature = decodeBytes(parts[2]);
    } catch (_) {
      throw new Error("RESULTATKODEN KUNNE IKKE LÆSES.");
    }
    const key = header && header.jwk;
    if (!header || header.alg !== "ES256" || header.typ !== "JWT" || header.crit !== undefined ||
      !key || key.kty !== "EC" || key.crv !== "P-256" || key.d !== undefined ||
      typeof key.x !== "string" || typeof key.y !== "string" || signature.length !== 64) {
      throw new Error("RESULTATKODEN HAR EN UGYLDIG SIGNATURTYPE.");
    }
    let verified;
    try {
      if (decodeBytes(key.x).length !== 32 || decodeBytes(key.y).length !== 32) throw new Error("key");
      const subtle = subtleCrypto();
      const publicKey = await subtle.importKey("jwk", {
        kty: "EC", crv: "P-256", x: key.x, y: key.y,
      }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      verified = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature,
        encoder.encode(parts[0] + "." + parts[1]));
    } catch (_) {
      throw new Error("RESULTATKODENS SIGNATUR KUNNE IKKE KONTROLLERES.");
    }
    if (!verified) throw new Error("RESULTATKODEN ER ÆNDRET ELLER HAR EN FORKERT SIGNATUR.");
    return validatePayload(payload);
  }

  async function combineCodes(values) {
    if (!Array.isArray(values) || !values.length || values.length > 64) {
      throw new Error("INDSÆT MINDST ÉN RESULTATKODE.");
    }
    const byRun = new Map();
    const names = new Set();
    let tournament;
    for (const value of values) {
      const token = typeof value === "string" ? value.trim() : "";
      const result = await verifyToken(token);
      if (tournament !== undefined && result.tournament !== tournament) {
        throw new Error("KODERNE ER FRA FORSKELLIGE TURNERINGER.");
      }
      tournament = result.tournament;
      const previous = byRun.get(result.jti);
      if (previous) {
        if (previous.token !== token) throw new Error("SAMME SPIL HAR TO FORSKELLIGE RESULTATKODER.");
        continue;
      }
      if (names.has(result.name)) throw new Error(result.name + " ER ALLEREDE TILFØJET. BRUG UNIKKE SPILLERNAVNE.");
      names.add(result.name);
      byRun.set(result.jti, { token, result });
      if (byRun.size > 8) throw new Error("EN TURNERING KAN HØJST HAVE 8 SPILLERE.");
    }
    const entries = Array.from(byRun.values());
    const players = entries.map(({ result }) => ({ id: result.jti, name: result.name }));
    const history = EVENT_IDS.map((id) => global.Scoring.rankEntries(entries.map(({ result }) => ({
      playerId: result.jti, name: result.name, score: result.scores[id],
    })), global.Events.get(id).lowerIsBetter));
    return {
      tournament, players, history, codes: entries.map(({ token }) => token),
      standings: global.Scoring.standings(history, players),
    };
  }

  global.ResultCodes = {
    RULESET, EVENT_IDS, createRun, validateRun, validateScore, signRun, verifyToken, combineCodes,
  };
})(window);
