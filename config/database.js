const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'monitoring.db');

let db;

function getDatabase() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
      console.log('Connected to SQLite database');
    });
  }
  return db;
}

async function initializeDatabase() {
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Elasticsearch clusters table
      db.run(`
        CREATE TABLE IF NOT EXISTS clusters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          endpoint TEXT NOT NULL,
          username TEXT,
          password TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Enhanced metrics table with more detailed node information
      db.run(`
        CREATE TABLE IF NOT EXISTS metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          node_name TEXT,
          node_id TEXT,
          node_roles TEXT,
          is_master BOOLEAN DEFAULT 0,
          is_data BOOLEAN DEFAULT 1,
          is_ingest BOOLEAN DEFAULT 0,
          cpu_usage REAL,
          memory_usage REAL,
          heap_usage REAL,
          heap_max REAL,
          heap_used_percent REAL,
          disk_usage REAL,
          disk_total BIGINT,
          disk_used BIGINT,
          disk_available BIGINT,
          load_average_1m REAL,
          load_average_5m REAL,
          load_average_15m REAL,
          open_file_descriptors INTEGER,
          max_file_descriptors INTEGER,
          indexing_rate REAL,
          search_rate REAL,
          uptime TEXT,
          version TEXT,
          load_average REAL,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )
      `);

      // Index metrics table
      db.run(`
        CREATE TABLE IF NOT EXISTS index_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          index_name TEXT,
          size_bytes BIGINT,
          docs_count BIGINT,
          search_rate REAL,
          indexing_rate REAL,
          memory_usage REAL,
          primary_shards INTEGER,
          replica_shards INTEGER,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )
      `);

      // Cluster health table
      db.run(`
        CREATE TABLE IF NOT EXISTS cluster_health (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT,
          number_of_nodes INTEGER,
          number_of_data_nodes INTEGER,
          active_primary_shards INTEGER,
          active_shards INTEGER,
          relocating_shards INTEGER,
          initializing_shards INTEGER,
          unassigned_shards INTEGER,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )
      `);

      // Shard analysis table (Fixed column names to match usage)
      db.run(`
        CREATE TABLE IF NOT EXISTS shard_analysis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          index_name TEXT,
          shard_number TEXT,
          shard_type TEXT,
          state TEXT,
          docs_count INTEGER,
          store_size TEXT,
          store_bytes BIGINT,
          node_name TEXT,
          node_id TEXT,
          unassigned_reason TEXT,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )
      `);

      // Node allocation analysis table (Fixed column names)
      db.run(`
        CREATE TABLE IF NOT EXISTS node_allocation (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          node_name TEXT,
          shards_count INTEGER,
          disk_indices TEXT,
          disk_used TEXT,
          disk_available TEXT,
          disk_total TEXT,
          disk_percent REAL,
          host TEXT,
          ip TEXT,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )
      `);

      // Recovery analysis table
      db.run(`
        CREATE TABLE IF NOT EXISTS recovery_analysis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          index_name TEXT,
          shard_number TEXT,
          recovery_time TEXT,
          recovery_type TEXT,
          stage TEXT,
          source_host TEXT,
          source_node TEXT,
          target_host TEXT,
          target_node TEXT,
          files_total INTEGER,
          files_recovered INTEGER,
          files_percent REAL,
          bytes_total BIGINT,
          bytes_recovered BIGINT,
          bytes_percent REAL,
          translog_ops INTEGER,
          translog_ops_recovered INTEGER,
          translog_ops_percent REAL,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )
      `);

      // Recommendations table (Fixed column names)
      db.run(`
        CREATE TABLE IF NOT EXISTS recommendations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          recommendation_type TEXT,
          category TEXT,
          title TEXT,
          description TEXT,
          impact TEXT,
          action TEXT,
          priority INTEGER,
          node_id TEXT,
          is_resolved BOOLEAN DEFAULT FALSE,
          resolved_at DATETIME,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )
      `);

      // Hot threads analysis table
      db.run(`
        CREATE TABLE IF NOT EXISTS hot_threads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          node_name TEXT,
          node_id TEXT,
          thread_info TEXT,
          cpu_time REAL,
          blocked_time REAL,
          waited_time REAL,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )
      `);

      // Performance baselines table
      db.run(`
        CREATE TABLE IF NOT EXISTS performance_baselines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          metric_type TEXT,
          baseline_value REAL,
          current_value REAL,
          deviation_percent REAL,
          threshold_breached BOOLEAN,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )
      `, async (err) => {
        if (err) {
          reject(err);
        } else {
          // Try to run migration for existing database
          try {
            await runMigration();
            resolve();
          } catch (migrationError) {
            console.warn('Migration warning:', migrationError.message);
            resolve(); // Continue even if migration has warnings
          }
        }
      });
    });
  });
}

async function runMigration() {
  const db = getDatabase();
  
  // Check if we need migration by testing for a new column
  return new Promise((resolve, reject) => {
    db.get("PRAGMA table_info(metrics)", (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Check if new columns exist
      db.all("PRAGMA table_info(metrics)", (err, columns) => {
        if (err) {
          reject(err);
          return;
        }
        
        const columnNames = columns.map(col => col.name);
        const hasNewColumns = columnNames.includes('node_roles') && 
                             columnNames.includes('is_master') && 
                             columnNames.includes('is_data');
        
        if (!hasNewColumns) {
          console.log('Running database migration...');
          runColumnMigration().then(resolve).catch(reject);
        } else {
          console.log('Database already up to date');
          resolve();
        }
      });
    });
  });
}

async function runColumnMigration() {
  const db = getDatabase();
  
  const alterQueries = [
    'ALTER TABLE metrics ADD COLUMN node_roles TEXT',
    'ALTER TABLE metrics ADD COLUMN is_master BOOLEAN DEFAULT 0',
    'ALTER TABLE metrics ADD COLUMN is_data BOOLEAN DEFAULT 1',
    'ALTER TABLE metrics ADD COLUMN is_ingest BOOLEAN DEFAULT 0',
    'ALTER TABLE metrics ADD COLUMN heap_max REAL',
    'ALTER TABLE metrics ADD COLUMN heap_used_percent REAL',
    'ALTER TABLE metrics ADD COLUMN disk_total BIGINT',
    'ALTER TABLE metrics ADD COLUMN disk_used BIGINT',
    'ALTER TABLE metrics ADD COLUMN disk_available BIGINT',
    'ALTER TABLE metrics ADD COLUMN load_average_1m REAL',
    'ALTER TABLE metrics ADD COLUMN load_average_5m REAL',
    'ALTER TABLE metrics ADD COLUMN load_average_15m REAL',
    'ALTER TABLE metrics ADD COLUMN open_file_descriptors INTEGER',
    'ALTER TABLE metrics ADD COLUMN max_file_descriptors INTEGER',
    'ALTER TABLE metrics ADD COLUMN indexing_rate REAL',
    'ALTER TABLE metrics ADD COLUMN search_rate REAL',
    'ALTER TABLE metrics ADD COLUMN uptime TEXT',
    'ALTER TABLE metrics ADD COLUMN version TEXT',
    'ALTER TABLE index_metrics ADD COLUMN primary_shards INTEGER',
    'ALTER TABLE index_metrics ADD COLUMN replica_shards INTEGER'
  ];
  
  return new Promise((resolve) => {
    let completed = 0;
    
    alterQueries.forEach(query => {
      db.run(query, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration warning:', err.message);
        }
        completed++;
        if (completed === alterQueries.length) {
          console.log('Database migration completed');
          resolve();
        }
      });
    });
  });
}

module.exports = {
  getDatabase,
  initializeDatabase
};
