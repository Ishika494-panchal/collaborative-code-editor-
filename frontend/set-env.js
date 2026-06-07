const fs = require('fs');
const targetPath = './src/app/config.ts';
const envConfigFile = `
export const config = {
   apiUrl: '${process.env.API_URL || "http://localhost:3000"}',
   socketUrl: '${process.env.SOCKET_URL || "http://localhost:3002"}'
};
`;
fs.writeFileSync(targetPath, envConfigFile);
console.log('Environment configuration generated at ' + targetPath);
