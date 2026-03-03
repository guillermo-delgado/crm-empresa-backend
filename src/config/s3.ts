import { S3Client } from "@aws-sdk/client-s3";

export const getS3Client = () => {
  const region = process.env.AWS_REGION || "eu-west-1";

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("❌ Missing AWS credentials in runtime");
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
};