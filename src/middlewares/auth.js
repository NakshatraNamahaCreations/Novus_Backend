import jwt from "jsonwebtoken";
const JWT_SECRET = process.env.JWT_SECRET || "NOVUS!@2025";

export const authenticateUser = (req, res, next) => {
  try {
    let token;

    if (req.cookies?.token) token = req.cookies.token;
    else if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ error: "No token provided. Access denied." });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    next();
  } catch (error) {
    console.error("Auth error:", error.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

