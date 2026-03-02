import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "../config/s3";

export const uploadToS3 = async (
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderPath: string
) => {
  const bucket = process.env.AWS_S3_BUCKET as string;

  const key = `${folderPath}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  });

  await s3.send(command);

  return {
    bucket,
    key,
    url: `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
  };
};