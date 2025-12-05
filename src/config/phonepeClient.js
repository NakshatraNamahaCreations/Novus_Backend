import { StandardCheckoutClient, Env } from 'pg-sdk-node';

const phonepeClient = StandardCheckoutClient.getInstance(
  process.env.PHONEPE_CLIENT_ID,
  process.env.PHONEPE_CLIENT_SECRET,
  Number(process.env.PHONEPE_CLIENT_VERSION),
  Env.SANDBOX
);

export default phonepeClient;
