import { createUser } from './backend/auth/userStore.mjs';

try {
  const result = await createUser({
    name: 'DiagPg',
    email: `diagpg+${Date.now()}@example.com`,
    password: 'secret123',
  });
  console.log('ok', result?.user?.id || '');
} catch (error) {
  console.log('err', error?.message || '');
  console.log('status', error?.status || '');
  console.log('code', error?.code || '');
  console.log('detail', error?.detail || '');
}
