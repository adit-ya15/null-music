import pg from 'pg';

const { Pool } = pg;

function sanitizeConnectionString(connectionString) {
    const raw = (connectionString ?? '').toString();
    if (!raw) return raw;

    try {
        const url = new URL(raw);
        // Some hosted providers (including Supabase) include `sslmode=require` in their
        // example URLs. `pg` parses that and may override our explicit `ssl` config.
        // We control TLS via the `ssl` option below, so strip SSL-specific query params.
        for (const key of [
            'sslmode',
            'ssl',
            'requiressl',
            'sslrootcert',
            'sslcert',
            'sslkey',
            'sslpassword',
            'sslcrl',
        ]) {
            url.searchParams.delete(key);
        }
        return url.toString();
    } catch {
        return raw;
    }
}

function shouldUseSsl(connectionString) {
    const explicit = (process.env.DATABASE_SSL ?? '').toString().trim().toLowerCase();
    if (explicit === '0' || explicit === 'false' || explicit === 'off' || explicit === 'no') return false;
    if (explicit === '1' || explicit === 'true' || explicit === 'on' || explicit === 'yes') return true;

    const value = (connectionString ?? '').toString();
    if (!value) return false;

    // Local dev Postgres typically has no TLS.
    if (value.includes('localhost') || value.includes('127.0.0.1')) return false;

    return true;
}

export const pool = new Pool({
    connectionString: sanitizeConnectionString(process.env.DATABASE_URL),
    ssl: shouldUseSsl(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
    max: 10,
});

export async function query(text, params = []) {
    return pool.query(text, params);
}
