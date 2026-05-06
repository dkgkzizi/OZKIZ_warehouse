const { Client } = require('pg');
const client = new Client({
    connectionString: 'postgresql://postgres.qsqtoufuwplgmzyvzwvd:openhan1234db@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        console.log('Connected to Supabase DB');

        // Create table for warehouse state
        await client.query(`
            CREATE TABLE IF NOT EXISTS warehouse_state (
                id INTEGER PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Table warehouse_state created or already exists');

        // Insert initial row if not exists
        await client.query(`
            INSERT INTO warehouse_state (id, data)
            VALUES (1, '{"1F": {"name": "Main Warehouse", "pallets": []}, "2F": {"name": "Sub Storage", "pallets": []}, "3F": {"name": "Overflow", "pallets": []}}')
            ON CONFLICT (id) DO NOTHING
        `);
        console.log('Initial data inserted');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
