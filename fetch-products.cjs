const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.qsqtoufuwplgmzyvzwvd:openhan1234db@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';

async function fetchAllProducts() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase to fetch 63k+ products...');
    await client.connect();
    
    // Fetch ALL products with necessary fields only
    const res = await client.query('SELECT "상품코드", "상품명", "옵션" FROM products');
    
    const dataDir = path.join(__dirname, 'src', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const dataPath = path.join(dataDir, 'products.json');
    // Save as minified JSON to save space
    fs.writeFileSync(dataPath, JSON.stringify(res.rows));
    
    console.log(`Success! All ${res.rows.length} products saved to ${dataPath}`);
  } catch (err) {
    console.error('Error fetching products:', err);
  } finally {
    await client.end();
  }
}

fetchAllProducts();
