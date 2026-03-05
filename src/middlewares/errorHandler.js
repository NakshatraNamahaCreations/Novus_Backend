// src/middlewares/errorHandler.js

export const errorHandler = (err, req, res, next) => {
  console.error(err);

  // Prisma connection/timeout errors
  if (err.message?.includes('Timed out fetching connection')) {
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: 'Server is busy, please try again in a moment.'
    });
  }

  // Prisma query errors
  if (err.code?.startsWith('P')) {
    return res.status(500).json({
      success: false,
      code: 'DB_ERROR',
      message: 'Something went wrong, please try again.'
    });
  }

  // Generic fallback
  return res.status(500).json({
    success: false,
    code: 'SERVER_ERROR',
    message: 'Something went wrong.'
  });
};

