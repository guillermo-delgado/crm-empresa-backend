import { S3Client } from "@aws-sdk/client-s3";

/* =====================================
   🔎 Validación de entorno AWS
===================================== */
const requiredEnv = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`❌ Missing required env var: ${key}`);
  }
}

/* =====================================
   🚀 Cliente S3
===================================== */
export const s3 = new S3Client({
  region: "eu-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});