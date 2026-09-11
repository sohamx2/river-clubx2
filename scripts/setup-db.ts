import { existsSync } from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const { ensureSchema,cleanup }=await import('../lib/store');
if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL in .env.local first.');
await ensureSchema();await cleanup();console.log('River Club database is ready.');
