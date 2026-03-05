
import rateLimit from 'express-rate-limit';

// General API limiter
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

// Strict limiter for auth routes (OTP abuse prevention)
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, 
  message: { error: 'Too many OTP requests, please wait.' }
});