

import axios from "axios";
import admin from "../../config/firebase.js";
import { PrismaClient } from "@prisma/client";
import { WHATSAPP_TEMPLATES } from "../../templates/whatsapp.templates.js";
import { WhatsAppMessage } from "../../utils/whatsapp.js";
const prisma = new PrismaClient();

export const sendPushNotification = async ({
  token,
  title,
  body,
  image,
  data
}) => {
  try {
    const message = {
      token,
      notification: {
        title: String(title),
        body: String(body),
        ...(image ? { image: String(image) } : {})
      },
      data: data
        ? Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v)])
          )
        : {}
    };

    const response = await admin.messaging().send(message);

    console.log("response",response)

    // ✅ SUCCESS
    return {
      success: true,
      messageId: response
    };

  } catch (error) {
    console.error("FCM ERROR:", error.code, error.message);

    // 🚨 Auto-remove invalid tokens
    if (
      error.code === "messaging/registration-token-not-registered" ||
      error.code === "messaging/invalid-registration-token"
    ) {
      await prisma.patientDevice.deleteMany({
        where: { fcmToken: token }
      });
    }

    return {
      success: false,
      errorCode: error.code,
      errorMessage: error.message
    };
  }
};


// WHATSAPP (mock for now)
export const sendWhatsAppMessage = async ({ to, message }) => {
  try {
   const template = WHATSAPP_TEMPLATES.OTP;

    const result = await WhatsAppMessage({
      phone:to,
      templateId: template.templateId,
      message: template.message,
      variables: template.mapVariables({ name, otp }),
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error(
      "WHATSAPP ERROR:",
      error.response?.data || error.message
    );

    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
};

