const { getDatabase } = require('./database');

async function migrateDatabase() {
  const db = getDatabase();
  
  console.log('Starting database migration...');
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Add missing columns to metrics table
      const alterMetricsQueries = [
        'ALTER TABLE metrics ADD COLUMN node_roles TEXT',
        'ALTER TABLE metrics ADD COLUMN is_master BOOLEAN DEFAULT 0',
        'ALTER TABLE metrics ADD COLUMN is_data BOOLEAN DEFAULT 1', // Default to data node for existing records
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
        'ALTER TABLE metrics ADD COLUMN version TEXT'
      ];

      // Add missing columns to index_metrics table
      const alterIndexMetricsQueries = [
        'ALTER TABLE index_metrics ADD COLUMN primary_shards INTEGER',
        'ALTER TABLE index_metrics ADD COLUMN replica_shards INTEGER'
      ];

      // Create new tables if they don't exist
      const createNewTables = [
        `CREATE TABLE IF NOT EXISTS shard_analysis (
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
        )`,
        
        `CREATE TABLE IF NOT EXISTS node_allocation (
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
        )`,
        
        `CREATE TABLE IF NOT EXISTS recovery_analysis (
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
        )`,
        
        `CREATE TABLE IF NOT EXISTS recommendations (
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
        )`,
        
        `CREATE TABLE IF NOT EXISTS hot_threads (
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
        )`,
        
        `CREATE TABLE IF NOT EXISTS performance_baselines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cluster_id INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          metric_type TEXT,
          baseline_value REAL,
          current_value REAL,
          deviation_percent REAL,
          threshold_breached BOOLEAN,
          FOREIGN KEY (cluster_id) REFERENCES clusters (id)
        )`
      ];

      let completedQueries = 0;
      const totalQueries = alterMetricsQueries.length + alterIndexMetricsQueries.length + createNewTables.length;

      function queryComplete(err) {
        if (err && !err.message.includes('duplicate column name')) {
          console.warn('Migration query warning:', err.message);
        }
        completedQueries++;
        if (completedQueries === totalQueries) {
          console.log('Database migration completed successfully!');
          resolve();
        }
      }

      // Execute ALTER TABLE queries for metrics
      alterMetricsQueries.forEach(query => {
        db.run(query, queryComplete);
      });

      // Execute ALTER TABLE queries for index_metrics
      alterIndexMetricsQueries.forEach(query => {
        db.run(query, queryComplete);
      });

      // Execute CREATE TABLE queries for new tables
      createNewTables.forEach(query => {
        db.run(query, queryComplete);
      });
    });
  });
}

// Also provide a function to reset database (for clean start)
async function resetDatabase() {
  const db = getDatabase();
  
  console.log('Resetting database...');
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const tables = [
        'metrics', 'index_metrics', 'cluster_health', 
        'shard_analysis', 'node_allocation', 'recovery_analysis',
        'recommendations', 'hot_threads', 'performance_baselines'
      ];

      let completed = 0;
      
      tables.forEach(table => {
        db.run(`DROP TABLE IF EXISTS ${table}`, (err) => {
          if (err) console.warn(`Warning dropping ${table}:`, err.message);
          completed++;
          if (completed === tables.length) {
            console.log('Database reset completed. Reinitializing...');
            // Re-initialize with new schema
            require('./database').initializeDatabase().then(resolve).catch(reject);
          }
        });
      });
    });
  });
}

module.exports = {
  migrateDatabase,
  resetDatabase
};
