const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create a no-op fallback client in case Redis is unavailable
function createNoOpClient() {
  return {
    publish: () => Promise.resolve(),
    psubscribe: () => Promise.resolve(),
    on: () => {},
    quit: () => Promise.resolve(),
  };
}

let pubClient, subClient;
let redisAvailable = false;

try {
  pubClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
  subClient = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });

  pubClient.on('ready', () => { redisAvailable = true; console.log('Redis pub client connected'); });
  subClient.on('ready', () => { console.log('Redis sub client connected'); });

  pubClient.on('error', (err) => {
    if (redisAvailable) console.error('Redis Pub Client Error:', err.message);
  });
  subClient.on('error', (err) => {
    if (redisAvailable) console.error('Redis Sub Client Error:', err.message);
  });

  pubClient.connect().catch(() => {
    console.warn('⚠️  Redis not available — running in single-instance mode (no pub/sub).');
    pubClient = createNoOpClient();
    subClient = createNoOpClient();
  });
  subClient.connect().catch(() => {});
} catch(e) {
  console.warn('⚠️  Redis not available — running in single-instance mode (no pub/sub).');
  pubClient = createNoOpClient();
  subClient = createNoOpClient();
}

module.exports = { pubClient, subClient };
