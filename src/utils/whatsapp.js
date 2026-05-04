import axios from "axios";

const WABRIDGE_URL = "https://web.wabridge.com/api/createmessage";

const sanitizePhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  // Strip leading 91 country code if already present (12 digits starting with 91)
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
};

export const WhatsAppMessage = async ({
  phone,
  templateId,
  message,
  variables = [],
  buttonVariables = [],
  media = null,
}) => {
  try {
    const cleanPhone = sanitizePhone(phone);

    if (cleanPhone.length !== 10) {
      throw new Error(`Invalid phone number skipped: "${phone}" → "${cleanPhone}" (must be 10 digits)`);
    }

    const payload = {
      "app-key": process.env.WABRIDGE_APP_KEY,
      "auth-key": process.env.WABRIDGE_AUTH_KEY,
      destination_number: "91" + cleanPhone,
      message,
      template_id: templateId,
      device_id: process.env.WABRIDGE_DEVICE_ID,
    };

    if (variables.length) payload.variables = variables;
    if (buttonVariables.length) payload.button_variable = buttonVariables;
    if (media) payload.media = media;

    const response = await axios.post(WABRIDGE_URL, payload, {
      headers: { "Content-Type": "application/json" },
    });

    console.log("response.data", response.data);

    if (response.data?.status === false) {
      throw new Error(`WaBridge rejected message to ${cleanPhone}: ${response.data?.message}`);
    }

    return response.data;
  } catch (error) {
    console.error(
      "WhatsApp API Error:",
      error.response?.data || error.message
    );
    throw error;
  }
};
