import { S3Client } from "@aws-sdk/client-s3";

console.log("========== AWS DEBUG ==========");
console.log("AWS_REGION:", process.env.AWS_REGION);
console.log(
  "AWS_ACCESS_KEY_ID:",
  process.env.AWS_ACCESS_KEY_ID ? "OK" : "MISSING"
);
console.log(
  "AWS_SECRET_ACCESS_KEY:",
  process.env.AWS_SECRET_ACCESS_KEY ? "OK" : "MISSING"
);
console.log(
  "AWS_S3_BUCKET:",
  process.env.AWS_S3_BUCKET ? "OK" : "MISSING"
);
console.log("================================");

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});