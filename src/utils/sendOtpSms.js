import axios from "axios";

const SMS_CONFIG = {
  apiId: process.env.BULK_SMS_API_ID,
  apiPassword: process.env.BULK_SMS_API_PASSWORD,
  sender: "HDTSMS",
};

export const sendOtpSms = async (mobile, otp) => {
  try {
    const message = `THIS IS TEST MESSAGE TO START BULK SMS SERVICE WITH {#var#} HENCE DIGITAL`;

    const url = "https://bulksmsplans.com/api/verify";

    const response = await axios.get(url, {
      params: {
        api_id: SMS_CONFIG.apiId,
        api_password: SMS_CONFIG.apiPassword,
        sms_type: "Transactional",
        sms_encoding: "text",
        sender: SMS_CONFIG.sender,
        number: mobile,
        message,
        var1: otp, // 👈 template variable
      },
      timeout: 10000,
    });

    console.log("response.data",response.data)
    return response.data;
  } catch (error) {
    console.error("SMS sending failed:", error?.response?.data || error.message);
    throw new Error("Failed to send OTP SMS");
  }
};
