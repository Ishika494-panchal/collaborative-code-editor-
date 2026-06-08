const http = require('http');

http.get('http://localhost:3000/auth/github', (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Body:', data.substring(0, 1000));
  });
}).on('error', (err) => {
  console.error('Error contacting http://localhost:3000/auth/github:', err.message);
});
