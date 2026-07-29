require('dotenv').config();

// Fallback field lists for stations whose .dat exports arrive without the
// usual 4 TOA5 header lines. Field order must match the logger's CR-series
// program exactly, since headerless rows are positional.
const stationFieldSchemas = {
  AWS_Uthal_Lasbella: [
    'TIMESTAMP', 'RECORD', 'BattV_Avg', 'PTemp_C_Avg', 'AirTC', 'AirTC_Min', 'AirTC_Max', 'AirTC_Avg',
    'RH', 'RH_Min', 'RH_Max', 'RH_Avg', 'B_Pressure', 'B_Pressure_Min', 'B_Pressure_Max', 'B_Pressure_Avg',
    'WindSpeed_S_WVT', 'WindDir_D1_WVT', 'WindDir_SD1_WVT', 'WindDir', 'WindSpeed', 'WindSpeed_Min', 'WindSpeed_Max',
    'Rain_mm_Tot', 'GHI_Irradiance', 'GHI_Irradiance_Min', 'GHI_Irradiance_Max', 'GHI_Irradiance_Avg',
    'SoilMoist5cm', 'SoilMoist5cm_Min', 'SoilMoist5cm_Max', 'SoilMoist5cm_Avg',
    'SoilTemp5cm', 'SoilTemp5cm_Min', 'SoilTemp5cm_Max', 'SoilTemp5cm_Avg',
    'SoilMoist10cm', 'SoilMoist10cm_Min', 'SoilMoist10cm_Max', 'SoilMoist10cm_Avg',
    'SoilTemp10cm', 'SoilTemp10cm_Min', 'SoilTemp10cm_Max', 'SoilTemp10cm_Avg',
    'SoilMoist20cm', 'SoilMoist20cm_Min', 'SoilMoist20cm_Max', 'SoilMoist20cm_Avg',
    'SoilTemp20cm', 'SoilTemp20cm_Min', 'SoilTemp20cm_Max', 'SoilTemp20cm_Avg',
    'SoilMoist30cm', 'SoilMoist30cm_Min', 'SoilMoist30cm_Max', 'SoilMoist30cm_Avg',
    'SoilTemp30cm', 'SoilTemp30cm_Min', 'SoilTemp30cm_Max', 'SoilTemp30cm_Avg',
    'SoilMoist50cm', 'SoilMoist50cm_Min', 'SoilMoist50cm_Max', 'SoilMoist50cm_Avg',
    'SoilTemp50cm', 'SoilTemp50cm_Min', 'SoilTemp50cm_Max', 'SoilTemp50cm_Avg',
    'SoilMoist100cm', 'SoilMoist100cm_Min', 'SoilMoist100cm_Max', 'SoilMoist100cm_Avg',
    'SoilTemp100cm', 'SoilTemp100cm_Min', 'SoilTemp100cm_Max', 'SoilTemp100cm_Avg',
  ],
};

// Each station is a remote FTP folder identified by a stable id, used to tag
// every ingested row (_station) and to look up a fallback field schema for
// headerless .dat exports. Add more stations by adding more entries here —
// nothing else in the pipeline needs to change.
//
// FTP_REMOTE_DIRS accepts a comma-separated list of "id:remoteDir" pairs
// (e.g. "AWS_Uthal_Lasbella:/AWS_Uthal_Lasbella,AWS_Khairpur:/AWS_Khairpur").
// Falls back to the legacy single-directory FTP_REMOTE_DIR for backward compat.
function parseStations() {
  const raw = process.env.FTP_REMOTE_DIRS;

  if (raw) {
    return raw.split(',').map((entry) => {
      const [id, remoteDir] = entry.split(':').map((part) => part.trim());
      return { id, remoteDir };
    });
  }

  const remoteDir = process.env.FTP_REMOTE_DIR || '/AWS_Uthal_Lasbella';
  const id = remoteDir.replace(/^\/+|\/+$/g, '');
  return [{ id, remoteDir }];
}

module.exports = {
  ftp: {
    host: process.env.FTP_HOST,
    port: Number(process.env.FTP_PORT || 21),
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    secure: process.env.FTP_SECURE === 'true',
  },
  stations: parseStations(),
  mongo: {
    uri: process.env.MONGODB_URI,
    dbName: process.env.MONGODB_DB_NAME || 'aws',
    // Readings are split into one collection per table (e.g. "..._hourly",
    // "..._decmin") since each table has its own growth rate and retention
    // needs. See db.js#dataCollectionName.
    dataCollectionPrefix: process.env.MONGODB_DATA_COLLECTION_PREFIX || 'aws_station_readings',
    stateCollection: process.env.MONGODB_STATE_COLLECTION || 'aws_ftp_sync_state',
  },
  pollCron: process.env.POLL_CRON || '*/10 * * * *',
  port: Number(process.env.PORT || 3000),
  // stations report local time with no timezone info (Pakistan Standard Time, UTC+5, no DST)
  stationUtcOffset: process.env.STATION_UTC_OFFSET || '+05:00',
  stationFieldSchemas,
};
