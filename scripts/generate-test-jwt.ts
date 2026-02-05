/**
 * Generate Test JWT Token for Local Development
 *
 * This script generates a valid JWT token for testing the API locally
 * WITHOUT requiring a Convex deployment.
 *
 * ⚠️ FOR DEVELOPMENT ONLY - DO NOT USE IN PRODUCTION
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYS_DIR = path.join(__dirname, '.dev-keys');

// Generate RSA key pair if they don't exist
function generateKeyPair(): { privateKey: string; publicKey: string } {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  const privateKeyPath = path.join(KEYS_DIR, 'private.pem');
  const publicKeyPath = path.join(KEYS_DIR, 'public.pem');

  // Check if keys already exist
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    console.log('✓ Using existing RSA keys from', KEYS_DIR);
    return {
      privateKey: fs.readFileSync(privateKeyPath, 'utf8'),
      publicKey: fs.readFileSync(publicKeyPath, 'utf8'),
    };
  }

  // Generate new RSA key pair
  console.log('Generating new RSA key pair...');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  // Save keys to disk
  fs.writeFileSync(privateKeyPath, privateKey);
  fs.writeFileSync(publicKeyPath, publicKey);
  console.log('✓ Keys generated and saved to', KEYS_DIR);

  return { privateKey, publicKey };
}

// Generate JWT token
function generateTestJWT(userId: string = 'dev-user-123', expiresIn: string = '24h'): string {
  const { privateKey } = generateKeyPair();

  const payload = {
    sub: userId, // User ID
    iss: process.env.CONVEX_URL || 'https://dev-local.convex.cloud',
    tokenId: `test-token-${Date.now()}`,
    iat: Math.floor(Date.now() / 1000),
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn,
  });

  return token;
}

// CLI Interface
function main() {
  const args = process.argv.slice(2);
  const userId = args[0] || 'dev-user-123';
  const expiresIn = args[1] || '24h';

  console.log('\n🔐 Generating Test JWT Token\n');
  console.log('User ID:', userId);
  console.log('Expires in:', expiresIn);
  console.log('');

  const token = generateTestJWT(userId, expiresIn);

  console.log('━'.repeat(80));
  console.log('JWT TOKEN (paste this into the admin dashboard):');
  console.log('━'.repeat(80));
  console.log(token);
  console.log('━'.repeat(80));
  console.log('');

  // Decode to show contents
  const decoded = jwt.decode(token, { complete: true });
  console.log('Token payload:');
  console.log(JSON.stringify(decoded?.payload, null, 2));
  console.log('');

  // Save to file for convenience
  const tokenFile = path.join(KEYS_DIR, 'test-token.txt');
  fs.writeFileSync(tokenFile, token);
  console.log('✓ Token saved to:', tokenFile);
  console.log('');

  console.log('💡 Usage:');
  console.log('  1. Copy the token above');
  console.log('  2. Open http://localhost:3000/admin');
  console.log('  3. Paste the token into the login form');
  console.log('');
  console.log('⚠️  This is a DEVELOPMENT token only!');
  console.log('   It will only work if NODE_ENV=development');
  console.log('');
}

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateTestJWT, generateKeyPair };
