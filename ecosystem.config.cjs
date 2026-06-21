module.exports = {
  apps: [
    {
      name: "ocpp-vcp-backend",
      script: "index_16.ts",
      interpreter: "node",
      interpreter_args: "node_modules/tsx/dist/cli.mjs",
      env: {
        NODE_ENV: "production",
      },
      // Give the process up to 3 seconds to shutdown cleanly when PM2 sends SIGINT/SIGTERM
      kill_timeout: 3000,
    },
  ],
};
