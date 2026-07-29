const { MongoClient } = require('mongodb');
const config = require('./config');
const logger = require('./logger');

let client;
let db;

async function connect() {
  if (db) return db;
  client = new MongoClient(config.mongo.uri);
  await client.connect();
  db = client.db(config.mongo.dbName);
  await ensureIndexes(db);
  logger.info(`Connected to MongoDB database "${config.mongo.dbName}"`);
  return db;
}

async function createIndexSafely(collection, spec, options) {
  try {
    await collection.createIndex(spec, options);
  } catch (err) {
    if (err.code === 14031 || err.codeName === 'OutOfDiskSpace') {
      logger.warn(`Skipped index creation for "${options.name}": MongoDB server is low on disk space.`);
    } else {
      throw err;
    }
  }
}

async function ensureIndexes(database) {
  await createIndexSafely(
    database.collection(config.mongo.dataCollection),
    { _station: 1, _sourceFile: 1, RECORD: 1 },
    { unique: true, name: 'uniq_station_sourceFile_record' },
  );

  await createIndexSafely(
    database.collection(config.mongo.stateCollection),
    { _station: 1, fileName: 1 },
    { unique: true, name: 'uniq_station_fileName' },
  );
}

async function getDataCollection() {
  const database = await connect();
  return database.collection(config.mongo.dataCollection);
}

async function getStateCollection() {
  const database = await connect();
  return database.collection(config.mongo.stateCollection);
}

async function close() {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}

module.exports = { connect, getDataCollection, getStateCollection, close };
