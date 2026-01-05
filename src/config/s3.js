// import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
// import { v4 as uuidv4 } from "uuid";

// // Initialize S3 client (v3)
// export const s3 = new S3Client({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   },
// });

// // ✅ Upload file to S3
// export const uploadToS3 = async (file, folder = "categories") => {
//   const key = `${folder}/${uuidv4()}-${file.originalname}`;

//   await s3.send(
//     new PutObjectCommand({
//       Bucket: process.env.AWS_BUCKET_NAME,
//       Key: key,
//       Body: file.buffer,
//       ContentType: file.mimetype,
//     })
//   );

//   return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
// };

// // ✅ Delete file from S3
// export const deleteFromS3 = async (fileUrl) => {
//   if (!fileUrl) return;

//   const key = fileUrl.split(".amazonaws.com/")[1]; // extract S3 object key

//   await s3.send(
//     new DeleteObjectCommand({
//       Bucket: process.env.AWS_BUCKET_NAME,
//       Key: key,
//     })
//   );
// };



import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

export const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ✅ For Multer file uploads (unchanged)
export const uploadToS3 = async (file, folder = "categories") => {
  try {
    const key = `${folder}/${uuidv4()}-${file.originalname}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (err) {
    console.error("uploadToS3 error:", err);
    throw err;
  }
};

// ✅ NEW: Upload raw buffer (PDF, images, etc.)
export const uploadBufferToS3 = async ({
  buffer,
  key,
  contentType = "application/octet-stream",
}) => {
  try {
    const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );

    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (err) {
    console.error("uploadBufferToS3 error:", err);
    throw err;
  }
};

// ✅ Delete file from S3 (unchanged)
export const deleteFromS3 = async (fileUrl) => {
  try {
    if (!fileUrl) return;

    const key = fileUrl.split(".amazonaws.com/")[1];

    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
      })
    );
  } catch (err) {
    console.error("deleteFromS3 error:", err);
    throw err;
  }
};
