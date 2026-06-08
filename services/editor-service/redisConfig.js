const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Create a no-op fallback client in case Redis is unavailable
const noOpClient = {
  publish: () => Promise.resolve(),
  psubscribe: () => Promise.resolve(),
  on: () => {},
  quit: () => Promise.resolve(),
};

let activePub = noOpClient;
let activeSub = noOpClient;
let redisAvailable = false;

const realPub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
const realSub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });

realPub.on('ready', () => { 
  redisAvailable = true; 
  activePub = realPub;
  console.log('Redis pub client connected'); 
});
realSub.on('ready', () => { 
  activeSub = realSub;
  console.log('Redis sub client connected'); 
});

realPub.on('error', (err) => {
  if (redisAvailable) console.error('Redis Pub Client Error:', err.message);
});
realSub.on('error', (err) => {
  if (redisAvailable) console.error('Redis Sub Client Error:', err.message);
});

realPub.connect().catch(() => {
  console.warn('⚠️  Redis not available — running in single-instance mode (no pub/sub).');
});
realSub.connect().catch(() => {});

// Export delegates whose methods call the active client dynamically
const pubClient = {
  publish: (...args) => activePub.publish(...args),
  on: (...args) => activePub.on(...args),
  quit: (...args) => activePub.quit(...args),
};

const subClient = {
  psubscribe: (...args) => activeSub.psubscribe(...args),
  on: (...args) => activeSub.on(...args),
  quit: (...args) => activeSub.quit(...args),
};

module.exports = { pubClient, subClient };
