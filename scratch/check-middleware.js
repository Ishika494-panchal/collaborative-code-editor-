const { createProxyMiddleware } = require('http-proxy-middleware');
console.log('Type of createProxyMiddleware:', typeof createProxyMiddleware);
const wsProxy = createProxyMiddleware({
  target: 'http://localhost:3002',
  changeOrigin: true,
  ws: true
});
console.log('wsProxy properties:', Object.keys(wsProxy));
console.log('Type of wsProxy.upgrade:', typeof wsProxy.upgrade);
