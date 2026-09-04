import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cryptoMocks = vi.hoisted(() => ({
  timingSafeEqual: vi.fn(),
  actualTimingSafeEqual: null as unknown as typeof import("node:crypto").timingSafeEqual,
}));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  cryptoMocks.actualTimingSafeEqual = actual.timingSafeEqual;
  cryptoMocks.timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return {
    ...actual,
    timingSafeEqual: cryptoMocks.timingSafeEqual,
  };
});

import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../../../../src/lib/security/unsubscribeToken";

const originalMasterKey = process.env.ENCRYPTION_MASTER_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  // Restaura a implementação real a cada teste, já que vi.clearAllMocks()
  // some com o mockImplementation configurado no vi.mock acima.
  cryptoMocks.timingSafeEqual.mockImplementation(
    cryptoMocks.actualTimingSafeEqual,
  );
  process.env.ENCRYPTION_MASTER_KEY =
    "0000000000000000000000000000000000000000000000000000000000000000";
});

afterEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = originalMasterKey;
});

const USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";

describe("unsubscribeToken", () => {
  it("gera um token determinístico para o mesmo userId", () => {
    const first = generateUnsubscribeToken(USER_ID);
    const second = generateUnsubscribeToken(USER_ID);

    expect(first).toBe(second);
    expect(first).toContain(".");
  });

  it("retorna o userId original para um token válido", () => {
    const token = generateUnsubscribeToken(USER_ID);

    expect(verifyUnsubscribeToken(token)).toBe(USER_ID);
  });

  it("usa timingSafeEqual para comparar a assinatura", () => {
    const token = generateUnsubscribeToken(USER_ID);

    verifyUnsubscribeToken(token);

    expect(cryptoMocks.timingSafeEqual).toHaveBeenCalled();
  });

  it.each([
    ["sem ponto separador", "token-sem-ponto"],
    ["com múltiplos pontos", "a.b.c"],
    ["com segmento vazio antes do ponto", `.${"a".repeat(64)}`],
    ["com segmento vazio depois do ponto", "abc."],
  ])("retorna null para token malformado: %s", (_label, malformed) => {
    expect(verifyUnsubscribeToken(malformed)).toBeNull();
  });

  it("retorna null quando a assinatura é adulterada (1 char trocado)", () => {
    const token = generateUnsubscribeToken(USER_ID);
    const [encodedUserId, signature] = token.split(".");

    const flippedChar = signature[0] === "0" ? "1" : "0";
    const tamperedSignature = flippedChar + signature.slice(1);
    const tamperedToken = `${encodedUserId}.${tamperedSignature}`;

    expect(verifyUnsubscribeToken(tamperedToken)).toBeNull();
  });

  it("retorna null quando o payload de userId é trocado (assinatura de outro usuário)", () => {
    const tokenA = generateUnsubscribeToken(USER_ID);
    const tokenB = generateUnsubscribeToken(OTHER_USER_ID);
    const [, signatureB] = tokenB.split(".");
    const [encodedUserIdA] = tokenA.split(".");

    const forgedToken = `${encodedUserIdA}.${signatureB}`;

    expect(verifyUnsubscribeToken(forgedToken)).toBeNull();
  });
});
