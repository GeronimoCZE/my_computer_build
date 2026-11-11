// pm2 process file: `pm2 start ecosystem.config.cjs`
// Settings such as PORT and the price API keys stay in .env, which server.js reads on start.
// Anything set under `env` below wins over .env.
module.exports = {
  apps: [
    {
      name: 'my-computer-build',
      script: 'server.js',
      cwd: __dirname,
      // one process: the live-price refresher keeps a single cache file and API quota
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
      exp_backoff_restart_delay: 200, // back off if it keeps crashing (bad .env, port taken)
      kill_timeout: 5000,
      time: true, // timestamps in `pm2 logs`
    },
  ],
};
