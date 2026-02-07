import bcrypt from 'bcrypt';
import { query, closePool } from '../src/db/index.js';

async function createAdmin() {
  try {
    const email = 'fernanhick@gmail.com';
    const password = 'fErchOhIck@4521!';
    const name = 'Fernando';

    console.log('Hashing password...');
    const passwordHash = await bcrypt.hash(password, 10);

    console.log('Creating admin user...');
    const result = await query(
      `INSERT INTO admin_users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [email.toLowerCase(), passwordHash, name]
    );

    const user = result.rows[0];

    console.log('\n✅ Admin user created successfully!');
    console.log('\nUser Details:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.name}`);
    console.log(`  Created: ${user.created_at}`);
    console.log('\nYou can now login at: http://88.97.222.2:3000/admin');

  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

createAdmin();
