#!/usr/bin/env tsx

import bcrypt from 'bcrypt';
import { query, closePool } from '../src/db/index.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createAdminUser() {
  try {
    console.log('=== Create Admin User ===\n');

    // Get user input
    const email = await question('Email: ');
    const password = await question('Password: ');
    const confirmPassword = await question('Confirm Password: ');
    const name = await question('Name (optional): ');

    // Validate
    if (!email || !password) {
      console.error('Error: Email and password are required');
      process.exit(1);
    }

    if (password !== confirmPassword) {
      console.error('Error: Passwords do not match');
      process.exit(1);
    }

    if (password.length < 8) {
      console.error('Error: Password must be at least 8 characters');
      process.exit(1);
    }

    // Check if user already exists
    const existing = await query(
      'SELECT id FROM admin_users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      console.error(`Error: User with email ${email} already exists`);
      process.exit(1);
    }

    // Hash password
    console.log('\nHashing password...');
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const result = await query(
      `INSERT INTO admin_users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [email.toLowerCase(), passwordHash, name || null]
    );

    const user = result.rows[0];

    console.log('\n✅ Admin user created successfully!');
    console.log('\nUser Details:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.name || 'N/A'}`);
    console.log(`  Created: ${user.created_at}`);
    console.log('\nYou can now login at: http://YOUR_VPS_IP:3000/admin');
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  } finally {
    rl.close();
    await closePool();
  }
}

createAdminUser();
