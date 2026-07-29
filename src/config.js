require('dotenv').config();

module.exports = {
  ftp: {
    host: process.env.FTP_HOST,
    port: Number(process.env.FTP_PORT || 21),
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    secure: process.env.FTP_SECURE === 'true',
    remoteDir: process.env.FTP_REMOTE_DIR || '/AWS_Uthal_Lasbella',
  },
  mongo: {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB_NAME || 'aws',
    dataCollection: process.env.MONGODB_DATA_COLLECTION || 'aws_station_readings',
    stateCollection: process.env.MONGODB_STATE_COLLECTION || 'aws_ftp_sync_state',
  },
  pollCron: process.env.POLL_CRON || '*/10 * * * *',
  port: Number(process.env.PORT || 3000),
  // stations report local time with no timezone info (Pakistan Standard Time, UTC+5, no DST)
  stationUtcOffset: process.env.STATION_UTC_OFFSET || '+05:00',
};
