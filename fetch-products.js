const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.qsqtoufuwplgmzyvzwvd:openhan1234db@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';

async function fetchProducts() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase...');
    await client.connect();
    
    console.log('Fetching products...');
    const res = await client.query('SELECT "상품코드", "상품명", "옵션" FROM products LIMIT 5000');
    
    const dataDir = path.join(__dirname, 'src', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const dataPath = path.join(dataDir, 'products.json');
    fs.writeFileSync(dataPath, JSON.stringify(res.rows, null, 2));
    
    console.log(`Success! ${res.rows.length} products saved to ${dataPath}`);
  } catch (err) {
    console.error('Error fetching products:', err);
  } finally {
    await client.end();
  }
}

fetchProducts();
