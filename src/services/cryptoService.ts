import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 1;

type EncryptedPayload = {
  version: number;
  algorithm: typeof ALGORITHM;
  iv: string;
  authTag: string;
  data: string;
  encoding: "base64";
  createdAt: string;
};

const getEncryptionKey = (): Buffer => {
  const keyBase64 = process.env.ENCRYPTION_KEY?.trim();

  if (!keyBase64) {
    throw new Error("Falta ENCRYPTION_KEY en variables de entorno");
  }

  const key = Buffer.from(keyBase64, "base64");

  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY debe ser una clave base64 válida de 32 bytes");
  }

  return key;
};

const parseEncryptedPayload = (
  encryptedPayload: Buffer | string
): EncryptedPayload => {
  const raw = Buffer.isBuffer(encryptedPayload)
    ? encryptedPayload.toString("utf8")
    : encryptedPayload;

  let payload: EncryptedPayload;

  try {
    payload = JSON.parse(raw) as EncryptedPayload;
  } catch {
    throw new Error("Payload cifrado inválido: no es JSON válido");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Payload cifrado inválido");
  }

  if (payload.version !== VERSION) {
    throw new Error(`Versión de cifrado no soportada: ${payload.version}`);
  }

  if (payload.algorithm !== ALGORITHM) {
    throw new Error(`Algoritmo de cifrado no soportado: ${payload.algorithm}`);
  }

  if (payload.encoding !== "base64") {
    throw new Error(`Encoding de cifrado no soportado: ${payload.encoding}`);
  }

  if (!payload.iv || !payload.authTag || !payload.data) {
    throw new Error("Payload cifrado incompleto");
  }

  return payload;
};

export const encryptBuffer = (input: Buffer): Buffer => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(input),
    cipher.final(),
  ]);

  const payload: EncryptedPayload = {
    version: VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
    encoding: "base64",
    createdAt: new Date().toISOString(),
  };

  return Buffer.from(JSON.stringify(payload), "utf8");
};

export const decryptBuffer = (
  encryptedPayload: Buffer | string
): Buffer => {
  const key = getEncryptionKey();
  const payload = parseEncryptedPayload(encryptedPayload);

  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const encryptedData = Buffer.from(payload.data, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error("IV inválido");
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("AuthTag inválido");
  }

  if (encryptedData.length === 0) {
    throw new Error("Data cifrada vacía");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);
  } catch {
    throw new Error("No se pudo descifrar el contenido. Clave incorrecta o archivo manipulado.");
  }
};

export const encryptText = (text: string): Buffer => {
  return encryptBuffer(Buffer.from(text, "utf8"));
};

export const decryptText = (
  encryptedPayload: Buffer | string
): string => {
  return decryptBuffer(encryptedPayload).toString("utf8");
};

export const encryptJson = (data: unknown): Buffer => {
  return encryptText(JSON.stringify(data));
};

export const decryptJson = <T = any>(
  encryptedPayload: Buffer | string
): T => {
  try {
    return JSON.parse(decryptText(encryptedPayload)) as T;
  } catch {
    throw new Error("No se pudo convertir el contenido descifrado a JSON");
  }
};