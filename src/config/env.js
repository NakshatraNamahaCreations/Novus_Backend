import dotenv from 'dotenv';

dotenv.config();

// Validate required ENV vars
const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
  'AWS_BUCKET_NAME'
];

required.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`⚠️  Missing environment variable: ${key}`);
  }
});

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,

  dbUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,

  aws: {
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
    bucket: process.env.AWS_BUCKET_NAME,
  }
};

export default env;
