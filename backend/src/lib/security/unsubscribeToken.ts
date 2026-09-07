import { createHmac, timingSafeEqual } from "node:crypto";

const HMAC_ALGORITHM = "sha256";
const TOKEN_DOMAIN = "newsletter-unsubscribe";

/** HMAC-SHA256 em hex: exatamente 64 caracteres hex minúsculos. */
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

/** Epoch em segundos, só dígitos. */
const EXPIRY_PATTERN = /^[0-9]{1,15}$/;

/**
 * 90 dias. O link precisa durar bem mais que o intervalo de envio (semanal),
 * porque descadastrar a partir de um e-mail antigo tem que continuar
 * funcionando — mas não pode valer para sempre se o link vazar.
 */
const TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

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

/** Assina o payload já codificado, para não haver ambiguidade de delimitador. */
function sign(payload: string): string {
  return createHmac(HMAC_ALGORITHM, getSigningKey())
    .update(payload)
    .digest("hex");
}

/**
 * Token opaco: base64url(userId) + "." + expiração (epoch em segundos) + "."
 * + HMAC hex das duas primeiras partes. Sem sessão exigida (AD-006). A
 * expiração entra na assinatura, então não dá para esticar a validade
 * editando o token.
 */
export function generateUnsubscribeToken(
  userId: string,
  now: Date = new Date(),
): string {
  const encodedUserId = Buffer.from(userId, "utf8").toString("base64url");
  const expiresAt = Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${encodedUserId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Retorna o userId se o token for válido, `null` caso contrário (formato
 * errado, HMAC não bate ou token expirado). Comparação via timingSafeEqual
 * (mesmo padrão de `searchableHash.ts`).
 */
export function verifyUnsubscribeToken(
  token: string,
  now: Date = new Date(),
): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedUserId, expiresAt, signature] = parts;
  if (!encodedUserId || !expiresAt || !signature) return null;
  if (!EXPIRY_PATTERN.test(expiresAt)) return null;

  // `Buffer.from(sig, "hex")` trunca silenciosamente no primeiro caractere
  // inválido, então "assinatura válida + lixo no fim" passaria pela
  // comparação de tamanho. Rejeita qualquer coisa fora do formato exato.
  if (!SIGNATURE_PATTERN.test(signature)) return null;

  const userId = Buffer.from(encodedUserId, "base64url").toString("utf8");
  if (!userId) return null;

  const expected = Buffer.from(sign(`${encodedUserId}.${expiresAt}`), "hex");
  const candidate = Buffer.from(signature, "hex");

  const isValid =
    candidate.length === expected.length && timingSafeEqual(candidate, expected);
  if (!isValid) return null;

  // Só checa validade depois de confirmar a assinatura: a expiração é dado
  // assinado, não entrada confiável.
  const isExpired = Number(expiresAt) * 1000 <= now.getTime();
  return isExpired ? null : userId;
}
