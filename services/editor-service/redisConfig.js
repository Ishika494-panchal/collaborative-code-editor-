const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const pubClient = new Redis(redisUrl);
const subClient = new Redis(redisUrl);

pubClient.on('error', (err) => console.error('Redis Pub Client Error:', err));
subClient.on('error', (err) => console.error('Redis Sub Client Error:', err));

module.exports = { pubClient, subClient };
