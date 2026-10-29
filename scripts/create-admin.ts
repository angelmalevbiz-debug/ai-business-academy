import { createMember } from '../lib/auth';
import { closeDb } from '../lib/db';

async function main() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters). Optionally set ADMIN_NAME.');
  const user = await createMember({ name: process.env.ADMIN_NAME || 'Администратор', email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, ageBand: '18+' }, 'admin');
  console.log(`Administrator created: ${user.email}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Failed to create administrator.'); process.exitCode = 1; }).finally(closeDb);
