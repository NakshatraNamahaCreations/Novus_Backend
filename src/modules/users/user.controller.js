
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

const JWT_SECRET = process.env.JWT_SECRET || "NOVUS!@2025";
import prisma from '../../lib/prisma.js';

function parseIdArray(value) {
  if (!value) return [];

  if (Array.isArray(value)) return value.map((x) => Number(x)).filter(Number.isFinite);

  if (typeof value === "string") {
    const v = value.trim();
    if (!v) return [];

    if (v.startsWith("[")) {
      try {
        const arr = JSON.parse(v);
        return Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
      } catch (e) {
        return [];
      }
    }

    return v
      .split(",")
      .map((x) => Number(x.trim()))
      .filter(Number.isFinite);
  }

  return [];
}

// ✅ CREATE User
export const createUser = async (req, res) => {
  try {
    const { name, email, phone, city, password, role, rights, diagnosticCenterIds } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const dcs = parseIdArray(diagnosticCenterIds); // ✅ optional

    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        city,
        password: hashedPassword,
        role,
        rights: typeof rights === "string" ? JSON.parse(rights) : rights || {},

        // ✅ only add if provided
        ...(dcs.length > 0
          ? {
              assignedDiagnosticCenters: {
                createMany: {
                  data: dcs.map((dcId) => ({ diagnosticCenterId: dcId })),
                  skipDuplicates: true,
                },
              },
            }
          : {}),
      },
      include: {
        assignedDiagnosticCenters: {
          include: {
            diagnosticCenter: { select: { id: true, name: true } },
          },
        },
      },
    });

    return res.status(201).json({ message: "User created successfully", user });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ error: "Failed to create user" });
  }
};

// ✅ READ ALL Users
export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, name, email, city, role, status, search } = req.query;

    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const skip = (pageNumber - 1) * pageSize;

    const filters = {};

    if (name) filters.name = { contains: name, mode: "insensitive" };
    if (email) filters.email = { contains: email, mode: "insensitive" };
    if (city) filters.city = { contains: city, mode: "insensitive" };
    if (role) filters.role = { equals: role };
    if (status) filters.status = { equals: status };

    if (search) {
      filters.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: filters,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          assignedDiagnosticCenters: {
            include: { diagnosticCenter: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.user.count({ where: filters }),
    ]);

    return res.json({
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages: Math.ceil(total / pageSize),
      users,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
};

// ✅ READ single User by ID
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: Number(id) },
      include: {
        assignedDiagnosticCenters: {
          include: { diagnosticCenter: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ error: "Failed to fetch user" });
  }
};

// ✅ UPDATE User
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      city,
      password,
      status,
      isActive,
      role,
      rights,
      diagnosticCenterIds, // ✅ changed
    } = req.body;

    const userId = Number(id);

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) return res.status(404).json({ error: "User not found" });

    let updatedPassword = existing.password;
    if (password) updatedPassword = await bcrypt.hash(password, 10);

    const hasDcIdsKey = Object.prototype.hasOwnProperty.call(req.body, "diagnosticCenterIds");
    const dcs = parseIdArray(diagnosticCenterIds);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name,
          email,
          phone,
          city,
          password: updatedPassword,
          status,
          isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
          role,
          rights: typeof rights === "string" ? JSON.parse(rights) : rights || existing.rights,
        },
      });

      // ✅ only touch assignments IF diagnosticCenterIds field was sent
      if (hasDcIdsKey) {
        await tx.userDiagnosticCenter.deleteMany({ where: { userId } });

        if (dcs.length > 0) {
          await tx.userDiagnosticCenter.createMany({
            data: dcs.map((dcId) => ({ userId, diagnosticCenterId: dcId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.user.findUnique({
        where: { id: userId },
        include: {
          assignedDiagnosticCenters: {
            include: { diagnosticCenter: { select: { id: true, name: true } } },
          },
        },
      });
    });

    return res.json({ message: "User updated successfully", user: updated });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({ error: "Failed to update user" });
  }
};

// ✅ DELETE User
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.user.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) return res.status(404).json({ error: "User not found" });

    await prisma.user.delete({ where: { id: Number(id) } });

    return res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    return res.status(500).json({ error: "Failed to delete user" });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        assignedDiagnosticCenters: { select: { diagnosticCenterId: true } }, // ✅ changed
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: "Invalid password" });

    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: true },
    });

    // ✅ assigned diagnostic center ids
    const diagnosticCenterIds = (user.assignedDiagnosticCenters || []).map(
      (x) => x.diagnosticCenterId
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, diagnosticCenterIds },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 2 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        rights: user.rights,
        diagnosticCenterIds, // ✅ return to frontend
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
};

export const logoutUser = async (req, res) => {
  try {
    if (req.user?.id) {
      await prisma.user.update({
        where: { id: req.user.id },
        data: { isActive: false, status: "inactive" },
      });
    }

    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Error logging out:", error);
    return res.status(500).json({ error: "Logout failed" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    const tokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { email },
      data: { resetToken: hashedToken, resetTokenExpiry: tokenExpiry },
    });

    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/reset-password?token=${resetToken}`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"Novus Admin" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Password Reset Request - Novus Admin Dashboard",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2 style="color: #0d6efd;">Novus Admin - Password Reset</h2>
          <p>Hi <strong>${user.name || "User"}</strong>,</p>
          <p>You requested to reset your password. Click the button below to reset it. This link will expire in <strong>15 minutes</strong>.</p>
          <p>
            <a href="${resetUrl}" 
               style="display:inline-block;background-color:#0d6efd;color:#fff;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:bold;">
              Reset Password
            </a>
          </p>
          <p>If the button doesn’t work, copy and paste this link into your browser:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <hr/>
          <p style="font-size: 0.9em; color: #888;">If you didn’t request this, please ignore this email. Your password remains safe.</p>
        </div>
      `,
    });

    return res.json({ message: "Password reset email sent successfully" });
  } catch (error) {
    console.error("Error in forgotPassword:", error);
    return res.status(500).json({ error: "Failed to send reset email" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password)
      return res.status(400).json({ error: "Token and new password required" });

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await prisma.user.findFirst({
      where: { resetToken: hashedToken, resetTokenExpiry: { gt: new Date() } },
    });

    if (!user) return res.status(400).json({ error: "Invalid or expired reset token" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, resetToken: null, resetTokenExpiry: null },
    });

    return res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    return res.status(500).json({ error: "Failed to reset password" });
  }
};

export const changePassword = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. No token provided." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Current, new, and confirm passwords are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New password and confirm password do not match" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters long" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ error: "Current password is incorrect" });

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    return res.status(500).json({ error: "Failed to change password" });
  }
};

export const changePassword1 = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "All password fields are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password do not match" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: "Current password is incorrect" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "Failed to change password" });
  }
};

export const getCurrentUser = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const userId = Number(req.user.id);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        rights: true,

        // ✅ changed to diagnostic centers
        assignedDiagnosticCenters: {
          select: {
            id: true,
            diagnosticCenterId: true,
            diagnosticCenter: {
              select: {
                id: true,
                name: true,
                // keep if these exist on DiagnosticCenter model
                address: true,
                pincode: true,
                cityId: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, user });
  } catch (error) {
    console.error("getCurrentUser error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch user info" });
  }
};

export const updateCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name.trim(),
        phone,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        rights: true,
      },
    });

    return res.json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
};
