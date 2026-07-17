import { describe, expect, it } from "vitest";

import {
  decryptJson,
  encryptBytes,
  encryptJson,
  fromBase64,
  randomKeyBytes,
  wipe,
} from "./aes";
import {
  createWrappedDek,
  deriveKek,
  generateRecoveryCode,
  isValidRecoveryCode,
  normaliseRecoveryCode,
  randomSalt,
  rewrapDek,
  unwrapDek,
  unwrapDekWithRecoveryCode,
  wrapDekWithRecoveryCode,
} from "./keys";
import { assertNoPlaintextLeak, decryptRecord, encryptRecord } from "./record";
import type { RoutingMetadata } from "./types";

// Argon2id is deliberately slow; these keep the suite usable while still
// exercising the real KDF rather than a stub.
const FAST = { memoryKib: 1024, iterations: 1, parallelism: 1 };
const PASS = "correct horse battery staple";

const meta = (over: Partial<RoutingMetadata> = {}): RoutingMetadata => ({
  id: "3f1a8c9e-0000-4000-8000-000000000001",
  orgId: "aaaaaaaa-0000-4000-8000-000000000001",
  updatedAt: "2026-07-17T10:00:00.000Z",
  version: 3,
  ...over,
});

/** Flip a bit in a base64 blob — the "someone altered this" case. */
function corrupt(b64: string): string {
  const bytes = fromBase64(b64);
  if (bytes.length === 0) throw new Error("nothing to corrupt");
  bytes.set([(bytes[0] ?? 0) ^ 0xff], 0);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

describe("AES-256-GCM", () => {
  it("round-trips a record body", async () => {
    const key = randomKeyBytes();
    const body = { customer: "Sri Sai Medicals", total: 245000, gstin: "29ABCDE1234F1Z5" };
    expect(await decryptJson(key, await encryptJson(key, body))).toEqual(body);
  });

  it("never reuses an IV", async () => {
    const key = randomKeyBytes();
    const ivs = new Set<string>();
    for (let i = 0; i < 200; i++) {
      ivs.add((await encryptJson(key, { i })).iv);
    }
    // IV reuse under one key leaks plaintext XOR and enables forgery.
    expect(ivs.size).toBe(200);
  });

  it("produces a 96-bit IV", async () => {
    const e = await encryptJson(randomKeyBytes(), { a: 1 });
    expect(fromBase64(e.iv).length).toBe(12);
  });

  it("gives different ciphertext for identical plaintext", async () => {
    const key = randomKeyBytes();
    const a = await encryptJson(key, { same: "value" });
    const b = await encryptJson(key, { same: "value" });
    expect(a.ct).not.toBe(b.ct);
  });

  it("rejects the wrong key", async () => {
    const e = await encryptJson(randomKeyBytes(), { secret: 1 });
    await expect(decryptJson(randomKeyBytes(), e)).rejects.toThrow(/Decryption failed/);
  });

  it("detects a tampered ciphertext", async () => {
    const key = randomKeyBytes();
    const e = await encryptJson(key, { total: 100 });
    await expect(decryptJson(key, { ...e, ct: corrupt(e.ct) })).rejects.toThrow();
  });

  it("detects tampered AAD", async () => {
    const key = randomKeyBytes();
    const e = await encryptJson(key, { total: 100 }, "org-a");
    await expect(decryptJson(key, { ...e, aad: "org-b" })).rejects.toThrow();
  });

  it("rejects an unknown envelope version", async () => {
    const key = randomKeyBytes();
    const e = await encryptJson(key, { a: 1 });
    await expect(
      decryptJson(key, { ...e, v: 2 as unknown as 1 }),
    ).rejects.toThrow(/Unsupported envelope version/);
  });

  it("rejects a key of the wrong size", async () => {
    const short = new Uint8Array(16) as never;
    await expect(encryptJson(short, { a: 1 })).rejects.toThrow(/32-byte key/);
  });

  it("wipe() zeroes the buffer", () => {
    const k = randomKeyBytes();
    wipe(k);
    expect(k.every((b) => b === 0)).toBe(true);
  });
});

describe("key hierarchy", () => {
  it("derives the KEK deterministically from passphrase + salt", async () => {
    const params = { salt: randomSalt(), ...FAST };
    const a = await deriveKek(PASS, params);
    const b = await deriveKek(PASS, params);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.length).toBe(32);
  });

  it("gives a different KEK for a different salt", async () => {
    const a = await deriveKek(PASS, { salt: randomSalt(), ...FAST });
    const b = await deriveKek(PASS, { salt: randomSalt(), ...FAST });
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("unwraps the DEK with the right passphrase", async () => {
    const { dek, wrapped } = await createWrappedDek(PASS, FAST);
    const out = await unwrapDek(PASS, wrapped);
    expect(Array.from(out)).toEqual(Array.from(dek));
  });

  it("refuses the wrong passphrase", async () => {
    const { wrapped } = await createWrappedDek(PASS, FAST);
    await expect(unwrapDek("wrong passphrase", wrapped)).rejects.toThrow(/Could not unlock/);
  });

  it("does not distinguish a wrong passphrase from a tampered blob", async () => {
    const { wrapped } = await createWrappedDek(PASS, FAST);

    // Actually corrupt the ciphertext — flip a bit in the wrapped DEK.
    const tampered = {
      ...wrapped,
      envelope: { ...wrapped.envelope, ct: corrupt(wrapped.envelope.ct) },
    };

    const wrongPass = await unwrapDek("wrong", wrapped).catch((e: Error) => e.message);
    // Right passphrase, corrupted blob: must fail identically.
    const corrupted = await unwrapDek(PASS, tampered).catch((e: Error) => e.message);

    expect(wrongPass).toBeDefined();
    expect(corrupted).toBeDefined();
    // Same message either way: distinguishing them would be an oracle telling
    // an attacker when they had guessed the passphrase.
    expect(wrongPass).toBe(corrupted);
  });

  it("the wrapped DEK carries its own KDF cost", async () => {
    const { wrapped } = await createWrappedDek(PASS, FAST);
    expect(wrapped.kdf.iterations).toBe(FAST.iterations);
    expect(wrapped.kdf.memoryKib).toBe(FAST.memoryKib);
    // Stored, so raising the cost later cannot lock existing users out.
    expect(await unwrapDek(PASS, wrapped)).toBeDefined();
  });

  it("rejects downgraded KDF params (they are authenticated)", async () => {
    const { wrapped } = await createWrappedDek(PASS, FAST);
    const weakened = { ...wrapped, kdf: { ...wrapped.kdf, iterations: 1, memoryKib: 8 } };
    await expect(unwrapDek(PASS, weakened)).rejects.toThrow(/Could not unlock/);
  });

  it("changing the passphrase keeps the same DEK", async () => {
    const { dek, wrapped } = await createWrappedDek(PASS, FAST);
    const rewrapped = await rewrapDek(dek, "a new passphrase", FAST);
    const out = await unwrapDek("a new passphrase", rewrapped);
    // If the DEK changed, every existing record would become unreadable.
    expect(Array.from(out)).toEqual(Array.from(dek));
    expect(await unwrapDek(PASS, wrapped)).toBeDefined();
  });

  it("requires a passphrase", async () => {
    await expect(deriveKek("", { salt: randomSalt(), ...FAST })).rejects.toThrow(/required/);
  });

  it("rejects an unknown wrapped-key version", async () => {
    const { wrapped } = await createWrappedDek(PASS, FAST);
    await expect(
      unwrapDek(PASS, { ...wrapped, v: 2 as unknown as 1 }),
    ).rejects.toThrow(/Unsupported wrapped-key version/);
  });

  it("rejects an unwrapped key of the wrong size", async () => {
    // A KEK that decrypts to something that is not a 256-bit key: the wrapped
    // blob is authentic but does not contain a DEK.
    const params = { salt: randomSalt(), ...FAST };
    const kek = await deriveKek(PASS, params);
    const envelope = await encryptBytes(kek, new Uint8Array(16), JSON.stringify(params));
    await expect(
      unwrapDek(PASS, { v: 1, kdf: params, envelope }),
    ).rejects.toThrow(/Could not unlock/);
  });
});

describe("recovery code", () => {
  it("generates a valid 24-word code", () => {
    const code = generateRecoveryCode();
    expect(code.split(" ")).toHaveLength(24);
    expect(isValidRecoveryCode(code)).toBe(true);
  });

  it("catches a mistyped word via the checksum", () => {
    const words = generateRecoveryCode().split(" ");
    words[0] = words[0] === "abandon" ? "ability" : "abandon";
    expect(isValidRecoveryCode(words.join(" "))).toBe(false);
  });

  it("tolerates case and stray whitespace", () => {
    const code = generateRecoveryCode();
    expect(isValidRecoveryCode(`  ${code.toUpperCase()}  `.replace(/ /g, "   "))).toBe(true);
    expect(normaliseRecoveryCode(`  A  B `)).toBe("a b");
  });

  it("unlocks the DEK as a second, independent path", async () => {
    const { dek } = await createWrappedDek(PASS, FAST);
    const code = generateRecoveryCode();
    const wrapped = await wrapDekWithRecoveryCode(dek, code);
    const out = await unwrapDekWithRecoveryCode(code, wrapped);
    expect(Array.from(out)).toEqual(Array.from(dek));
  });

  it("refuses a wrong recovery code", async () => {
    const { dek } = await createWrappedDek(PASS, FAST);
    const wrapped = await wrapDekWithRecoveryCode(dek, generateRecoveryCode());
    await expect(
      unwrapDekWithRecoveryCode(generateRecoveryCode(), wrapped),
    ).rejects.toThrow(/Could not unlock/);
  });

  it("refuses a malformed code rather than deriving from garbage", async () => {
    const { dek } = await createWrappedDek(PASS, FAST);
    await expect(wrapDekWithRecoveryCode(dek, "not a real code")).rejects.toThrow(/valid 24-word/);
  });

  it("refuses a malformed code on unwrap too", async () => {
    const { dek } = await createWrappedDek(PASS, FAST);
    const wrapped = await wrapDekWithRecoveryCode(dek, generateRecoveryCode());
    await expect(
      unwrapDekWithRecoveryCode("not a real code", wrapped),
    ).rejects.toThrow(/valid 24-word/);
  });
});

describe("the encryption boundary", () => {
  it("keeps routing metadata plaintext and the body opaque", async () => {
    const dek = randomKeyBytes();
    const m = meta();
    const rec = await encryptRecord(dek, m, { customer: "Ravi", total: 245000 });

    expect(rec.id).toBe(m.id);
    expect(rec.orgId).toBe(m.orgId);
    expect(rec.version).toBe(3);
    // The body must not be readable in the serialised record.
    const wire = JSON.stringify(rec);
    expect(wire).not.toContain("Ravi");
    expect(wire).not.toContain("245000");
  });

  it("round-trips through the boundary", async () => {
    const dek = randomKeyBytes();
    const body = { customer: "Ravi", lines: [{ item: "Crocin", qty: 2 }] };
    const rec = await encryptRecord(dek, meta(), body);
    expect(await decryptRecord(dek, rec)).toEqual(body);
  });

  it("refuses a body moved to another org", async () => {
    const dek = randomKeyBytes();
    const rec = await encryptRecord(dek, meta(), { total: 1 });
    // Exactly the attack the AAD exists to stop: same ciphertext, new tenant.
    const moved = { ...rec, orgId: "bbbbbbbb-0000-4000-8000-000000000002" };
    await expect(decryptRecord(dek, moved)).rejects.toThrow(/moved or altered/);
  });

  it("refuses a body moved to another record id", async () => {
    const dek = randomKeyBytes();
    const rec = await encryptRecord(dek, meta(), { total: 1 });
    const moved = { ...rec, id: "3f1a8c9e-0000-4000-8000-000000000999" };
    await expect(decryptRecord(dek, moved)).rejects.toThrow(/moved or altered/);
  });

  it("refuses a rolled-back version", async () => {
    const dek = randomKeyBytes();
    const rec = await encryptRecord(dek, meta({ version: 5 }), { total: 1 });
    await expect(decryptRecord(dek, { ...rec, version: 4 })).rejects.toThrow(/moved or altered/);
  });

  it("catches business data about to leave in plaintext", () => {
    expect(() =>
      assertNoPlaintextLeak({ id: "1", orgId: "2", customer: "Ravi" }, "sync push"),
    ).toThrow(/sync push would send business data in plaintext: customer/);
  });

  it("allows a payload of pure routing metadata", () => {
    expect(() =>
      assertNoPlaintextLeak({ id: "1", orgId: "2", updatedAt: "x", version: 1, bodyEnc: {} }),
    ).not.toThrow();
  });
});
