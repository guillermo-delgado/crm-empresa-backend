import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "./s3Client";

export const deleteFromS3 = async (key?: string | null) => {
  if (!key) return;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
    })
  );
};