const ftp = require('basic-ftp');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const config = require('./config');

async function createClient() {
  const client = new ftp.Client(20000);
  client.ftp.verbose = false;
  await client.access({
    host: config.ftp.host,
    port: config.ftp.port,
    user: config.ftp.user,
    password: config.ftp.password,
    secure: config.ftp.secure,
  });
  return client;
}

async function listDatFiles(client, remoteDir) {
  const entries = await client.list(remoteDir);
  return entries.filter((entry) => entry.isFile && entry.name.toLowerCase().endsWith('.dat'));
}

async function downloadFileContent(client, remoteDir, fileName) {
  const tmpPath = path.join(os.tmpdir(), `ftp-${Date.now()}-${fileName}`);
  const remotePath = `${remoteDir.replace(/\/+$/, '')}/${fileName}`;

  await client.downloadTo(tmpPath, remotePath);
  try {
    return await fs.readFile(tmpPath, 'utf8');
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

module.exports = { createClient, listDatFiles, downloadFileContent };
