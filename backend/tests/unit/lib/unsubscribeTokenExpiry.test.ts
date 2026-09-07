import { beforeAll, describe, expect, it } from "vitest";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../../../src/lib/security/unsubscribeToken";

const DIA = 24 * 60 * 60 * 1000;

describe("unsubscribeToken — expiração", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_MASTER_KEY ??= "a".repeat(64);
  });

  const emissao = new Date("2026-01-01T00:00:00.000Z");

  it("aceita o token dentro da validade", () => {
    const token = generateUnsubscribeToken("user-1", emissao);

    const dentro = new Date(emissao.getTime() + 89 * DIA);
    expect(verifyUnsubscribeToken(token, dentro)).toBe("user-1");
  });

  it("rejeita o token depois de 90 dias", () => {
    const token = generateUnsubscribeToken("user-1", emissao);

    const depois = new Date(emissao.getTime() + 91 * DIA);
    expect(verifyUnsubscribeToken(token, depois)).toBeNull();
  });

  it("não deixa esticar a validade editando a expiração do token", () => {
    const token = generateUnsubscribeToken("user-1", emissao);
    const [payload, expiracao, assinatura] = token.split(".");
    const esticado = Number(expiracao) + 365 * 24 * 60 * 60;

    // A expiração entra na assinatura, então mexer nela invalida o token.
    const adulterado = `${payload}.${esticado}.${assinatura}`;
    const depois = new Date(emissao.getTime() + 91 * DIA);
    expect(verifyUnsubscribeToken(adulterado, depois)).toBeNull();
  });

  it("rejeita expiração que não é numérica", () => {
    const token = generateUnsubscribeToken("user-1", emissao);
    const [payload, , assinatura] = token.split(".");

    expect(verifyUnsubscribeToken(`${payload}.abc.${assinatura}`)).toBeNull();
  });
});
