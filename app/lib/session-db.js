// Re-export db helpers supaya route auth bisa import dari satu tempat
// tanpa duplikasi koneksi.
export { getDb, schemaReady } from './db';
