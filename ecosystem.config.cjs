module.exports = {
  apps: [
    {
      name: "uu-movers",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
      time: true,
      max_memory_restart: "256M",
    },
  ],
};
