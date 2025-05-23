const { getDatabase } = require('../config/database');

class MetricsModel {
  // Get metrics for a cluster within time range
  static async getMetrics(clusterId, timeRange = '1h') {
    const db = getDatabase();
    let timeFilter = '';
    
    switch (timeRange) {
      case '15m':
        timeFilter = "AND timestamp >= datetime('now', '-15 minutes')";
        break;
      case '30m':
        timeFilter = "AND timestamp >= datetime('now', '-30 minutes')";
        break;
      case '1h':
      default:
        timeFilter = "AND timestamp >= datetime('now', '-1 hour')";
        break;
    }

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM metrics 
        WHERE cluster_id = ? ${timeFilter}
        ORDER BY timestamp DESC
      `;
      
      db.all(sql, [clusterId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get index metrics for a cluster
  static async getIndexMetrics(clusterId, timeRange = '1h') {
    const db = getDatabase();
    let timeFilter = '';
    
    switch (timeRange) {
      case '15m':
        timeFilter = "AND timestamp >= datetime('now', '-15 minutes')";
        break;
      case '30m':
        timeFilter = "AND timestamp >= datetime('now', '-30 minutes')";
        break;
      case '1h':
      default:
        timeFilter = "AND timestamp >= datetime('now', '-1 hour')";
        break;
    }

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM index_metrics 
        WHERE cluster_id = ? ${timeFilter}
        ORDER BY timestamp DESC
      `;
      
      db.all(sql, [clusterId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get cluster health data
  static async getClusterHealth(clusterId, timeRange = '1h') {
    const db = getDatabase();
    let timeFilter = '';
    
    switch (timeRange) {
      case '15m':
        timeFilter = "AND timestamp >= datetime('now', '-15 minutes')";
        break;
      case '30m':
        timeFilter = "AND timestamp >= datetime('now', '-30 minutes')";
        break;
      case '1h':
      default:
        timeFilter = "AND timestamp >= datetime('now', '-1 hour')";
        break;
    }

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM cluster_health 
        WHERE cluster_id = ? ${timeFilter}
        ORDER BY timestamp DESC
      `;
      
      db.all(sql, [clusterId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Save node metrics
  static async saveNodeMetrics(clusterId, metrics) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO metrics (
          cluster_id, node_name, node_id, cpu_usage, memory_usage,
          heap_usage, disk_usage, load_average
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(sql, [
        clusterId,
        metrics.nodeName,
        metrics.nodeId,
        metrics.cpuUsage,
        metrics.memoryUsage,
        metrics.heapUsage,
        metrics.diskUsage,
        metrics.loadAverage
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Save index metrics
  static async saveIndexMetrics(clusterId, metrics) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO index_metrics (
          cluster_id, index_name, size_bytes, docs_count,
          search_rate, indexing_rate, memory_usage
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(sql, [
        clusterId,
        metrics.indexName,
        metrics.sizeBytes,
        metrics.docsCount,
        metrics.searchRate,
        metrics.indexingRate,
        metrics.memoryUsage
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Save cluster health
  static async saveClusterHealth(clusterId, health) {
    const db = getDatabase();
    
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO cluster_health (
          cluster_id, status, number_of_nodes, number_of_data_nodes,
          active_primary_shards, active_shards, relocating_shards,
          initializing_shards, unassigned_shards
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(sql, [
        clusterId,
        health.status,
        health.number_of_nodes,
        health.number_of_data_nodes,
        health.active_primary_shards,
        health.active_shards,
        health.relocating_shards,
        health.initializing_shards,
        health.unassigned_shards
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Clean old data
  static async cleanOldData(hoursToKeep = 1) {
    const db = getDatabase();
    const cutoffTime = new Date(Date.now() - hoursToKeep * 60 * 60 * 1000).toISOString();
    
    const tables = ['metrics', 'index_metrics', 'cluster_health'];
    
    for (const table of tables) {
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM ${table} WHERE timestamp < ?`, [cutoffTime], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}

module.exports = MetricsModel;
