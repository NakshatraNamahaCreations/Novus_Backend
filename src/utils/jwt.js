import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "NOVUS!@2025";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"; // change if you want

export function signPatientToken(patient) {
  // Keep payload small (don’t put sensitive info)
  const payload = {
    id: patient.id,
    contactNo: patient.contactNo,
    role: "PATIENT",
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
