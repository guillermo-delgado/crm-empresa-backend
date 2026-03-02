import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "./s3Client";

export const generarUrlFirmada = async (key: string) => {
  if (!process.env.AWS_S3_BUCKET) {
    throw new Error("AWS_S3_BUCKET no está definido en .env");
  }

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
  });

  const url = await getSignedUrl(s3, command, {
    expiresIn: 60 * 5, // 5 minutos
  });

  return url;
};