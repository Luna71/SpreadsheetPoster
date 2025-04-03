/**
 * Script to generate a secure random API token
 * Run this with: node generate-token.js
 */

const crypto = require('crypto');

// Generate a secure random token 
const generateToken = (bytes = 32) => {
  const buffer = crypto.randomBytes(bytes);
  return buffer.toString('hex');
};

// Generate and display a token
const token = generateToken();
console.log('\nGenerated API Token:');
console.log('===================');
console.log(token);
console.log('\nAdd this to your .env file:');
console.log('API_TOKEN=' + token);
console.log('\n'); 