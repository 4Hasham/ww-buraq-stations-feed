require('dotenv').config();

const http = require('http');
const cron = require('node-cron');
const config = require('./config');
const logger = require('./logger');
const { pollOnce } = require('./poller');
const { connect, close } = require('./db');

let isPolling = false;

async function runPoll() {
  if (isPolling) {
    logger.warn('Previous poll is still running — skipping this tick');
    return;
  }

  isPolling = true;
  try {
    await pollOnce();
  } catch (err) {
    logger.error('Poll cycle failed', err);
  } finally {
    isPolling = false;
  }
}

function validateConfig() {
  const missing = [];
  if (!config.ftp.host) missing.push('FTP_HOST');
  if (!config.ftp.user) missing.push('FTP_USER');
  if (!config.ftp.password) missing.push('FTP_PASSWORD');
  if (!config.mongo.uri) missing.push('MONGODB_URI');

  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down...');
  await close();
  process.exit(0);
}

async function main() {
  validateConfig();
  await connect();

  // Railway health checks expect the service to bind to $PORT.
  http
    .createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    })
    .listen(config.port, () => logger.info(`Health check server listening on port ${config.port}`));

  cron.schedule(config.pollCron, runPoll);
  logger.info(`Scheduled FTP poll with cron "${config.pollCron}" against ${config.ftp.remoteDir}`);

  await runPoll();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  logger.error('Fatal error during startup', err);
  process.exit(1);
});
