import axios from "axios";

const WABRIDGE_URL = "https://web.wabridge.com/api/createmessage";

export const WhatsAppMessage = async ({
  phone,
  templateId,
  message,
  variables = [],
  buttonVariables = [],
  media = null,
}) => {
  try {
    const payload = {
      "app-key": process.env.WABRIDGE_APP_KEY,
      "auth-key": process.env.WABRIDGE_AUTH_KEY,
      destination_number: phone,
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

    return response.data;
  } catch (error) {
    console.error(
      "WhatsApp API Error:",
      error.response?.data || error.message
    );
    throw error;
  }
};
