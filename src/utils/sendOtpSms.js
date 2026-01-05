import axios from "axios";

const SMS_CONFIG = {
  apiId: process.env.BULK_SMS_API_ID,
  apiPassword: process.env.BULK_SMS_API_PASSWORD,
  sender: "NOVLAB",
};

export const sendOtpSms = async (mobile, otp) => {
  try {
    const message = `Your OTP to access your Novus Health Labs account is ${otp}. Please do not share this OTP with anyone. This OTP is valid for 10 minutes.-NOVLAB`;
    

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
        var1: otp ||'1245', 
       
      },
      timeout: 10000,
    });

   
    return response.data;
  } catch (error) {
    console.error("SMS sending failed:", error?.response?.data || error.message);
    throw new Error("Failed to send OTP SMS");
  }
};
