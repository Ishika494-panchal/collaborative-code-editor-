const fs = require('fs');
const targetPath = './src/app/config.ts';
const apiUrl = process.env.API_URL || "http://localhost:3000";
const socketUrl = process.env.SOCKET_URL || apiUrl;

const envConfigFile = `
export const config = {
   apiUrl: '${apiUrl}',
   socketUrl: '${socketUrl}'
};
`;
fs.writeFileSync(targetPath, envConfigFile);
console.log('Environment configuration generated at ' + targetPath);
