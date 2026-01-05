const { StandardCheckoutClient, Env } = require("pg-sdk-node");


const {
  PHONEPE_CLIENT_ID,
  PHONEPE_CLIENT_SECRET,
  PHONEPE_CLIENT_VERSION,
  PHONEPE_ENV,
} = process.env;

class PhonePeClient {
  constructor() {
    if (!PhonePeClient.instance) {
      this.client = StandardCheckoutClient.getInstance(
        PHONEPE_CLIENT_ID,
        PHONEPE_CLIENT_SECRET,
        parseInt(PHONEPE_CLIENT_VERSION),
        PHONEPE_ENV === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX
      );
      PhonePeClient.instance = this;
    }
    return PhonePeClient.instance;
  }

  getClient() {
    return this.client;
  }
}

module.exports = new PhonePeClient();
