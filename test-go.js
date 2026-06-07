const http = require('http');

const data = JSON.stringify({
  language: 'go',
  code: 'package main\nimport "fmt"\nfunc main() { fmt.Println("Hello Go!") }'
});

const options = {
  hostname: 'localhost',
  port: 3003,
  path: '/',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let output = '';
  res.on('data', (d) => {
    output += d;
  });
  res.on('end', () => {
    console.log(output);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
