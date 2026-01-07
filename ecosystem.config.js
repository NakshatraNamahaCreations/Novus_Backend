module.exports = {
  apps: [
    {
      name: "api",
      script: "npm",
      args: "run start:api",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "report-worker",
      script: "npm",
      args: "run start:report-worker",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "whatsapp-worker",
      script: "npm",
      args: "run start:whatsapp-worker",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "notification-worker",
      script: "npm",
      args: "run start:notification-worker",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "vendor-notification-worker",
      script: "npm",
      args: "run start:vendor-notification-worker",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
