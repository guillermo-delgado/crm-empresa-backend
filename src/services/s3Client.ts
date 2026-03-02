import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: "eu-west-1", // 🔥 explícito
  endpoint: "https://s3.eu-west-1.amazonaws.com",
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});