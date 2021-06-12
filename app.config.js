module.exports = {
    apps: [
      {
        name: "main",
        script: "./dist/src/main.js",
        instances: 1,
        autorestart: true,
      }, {
        name: "telegraf",
        script: "./dist/src/runTelegrafBot.js",
        instances: 1,
        autorestart: true,
      }]
  };