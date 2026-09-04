import { createHmac, timingSafeEqual } from "node:crypto";

const HMAC_ALGORITHM = "sha256";
const TOKEN_DOMAIN = "newsletter-unsubscribe";

/** HMAC-SHA256 em hex: exatamente 64 caracteres hex minúsculos. */
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Chave derivada de ENCRYPTION_MASTER_KEY com domain separation (AD-006), pra
 * não reutilizar a master key diretamente nem exigir um novo secret.
 */
function getSigningKey(): Buffer {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY?.trim();

  if (!masterKey) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY is required for unsubscribe tokens",
    );
  }

  return createHmac(HMAC_ALGORITHM, masterKey).update(TOKEN_DOMAIN).digest();
}

function sign(userId: string): string {
  return createHmac(HMAC_ALGORITHM, getSigningKey())
    .update(userId)
    .digest("hex");
}

/**
 * Token opaco e determinístico: base64url(userId) + "." + HMAC hex do
 * userId. Sem sessão exigida (AD-006).
 */
export function generateUnsubscribeToken(userId: string): string {
  const encodedUserId = Buffer.from(userId, "utf8").toString("base64url");
  return `${encodedUserId}.${sign(userId)}`;
}

/**
 * Retorna o userId se o token for válido, `null` caso contrário (formato
 * errado, HMAC não bate). Comparação via timingSafeEqual (mesmo padrão de
 * `searchableHash.ts`).
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [encodedUserId, signature] = parts;
  if (!encodedUserId || !signature) return null;

  // `Buffer.from(sig, "hex")` trunca silenciosamente no primeiro caractere
  // inválido, então "assinatura válida + lixo no fim" passaria pela
  // comparação de tamanho. Rejeita qualquer coisa fora do formato exato.
  if (!SIGNATURE_PATTERN.test(signature)) return null;

  const userId = Buffer.from(encodedUserId, "base64url").toString("utf8");
  if (!userId) return null;

  const expected = Buffer.from(sign(userId), "hex");
  const candidate = Buffer.from(signature, "hex");

  const isValid =
    candidate.length === expected.length && timingSafeEqual(candidate, expected);

  return isValid ? userId : null;
}
