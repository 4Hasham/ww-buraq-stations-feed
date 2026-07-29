const { MongoClient } = require('mongodb');
const config = require('./config');
const logger = require('./logger');

let client;
let db;
const indexedDataCollections = new Set();

async function connect() {
  if (db) return db;
  client = new MongoClient(config.mongo.uri);
  await client.connect();
  db = client.db(config.mongo.dbName);
  await ensureStateIndexes(db);
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

async function ensureStateIndexes(database) {
  await createIndexSafely(
    database.collection(config.mongo.stateCollection),
    { _station: 1, fileName: 1 },
    { unique: true, name: 'uniq_station_fileName' },
  );
}

async function ensureDataIndexes(collection) {
  if (indexedDataCollections.has(collection.collectionName)) return;

  await createIndexSafely(
    collection,
    { _station: 1, _sourceFile: 1, RECORD: 1 },
    { unique: true, name: 'uniq_station_sourceFile_record' },
  );

  await createIndexSafely(
    collection,
    { _station: 1, TIMESTAMP: -1 },
    { name: 'station_timestamp_desc' },
  );

  indexedDataCollections.add(collection.collectionName);
}

// Readings are split into one collection per table (e.g. Hourly, DecMin)
// since each has its own growth rate/retention needs. The collection is
// created (and its indexes ensured) lazily on first use of a given table,
// so new tables need no config or migration step.
function dataCollectionName(table) {
  const suffix = String(table || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${config.mongo.dataCollectionPrefix}_${suffix}`;
}

async function getDataCollection(table) {
  const database = await connect();
  const collection = database.collection(dataCollectionName(table));
  await ensureDataIndexes(collection);
  return collection;
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
    indexedDataCollections.clear();
  }
}

module.exports = { connect, getDataCollection, getStateCollection, close, dataCollectionName };
