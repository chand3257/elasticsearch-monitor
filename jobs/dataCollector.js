const { getDatabase } = require('../config/database');
const ElasticsearchService = require('../services/elasticsearchService');

class DataCollector {
  async getClusters() {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM clusters', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async collectData() {
    try {
      const clusters = await this.getClusters();
      
      for (const cluster of clusters) {
        await this.collectClusterData(cluster);
      }
    } catch (error) {
      console.error('Data collection error:', error);
    }
  }

  async collectClusterData(cluster) {
    try {
      const esService = new ElasticsearchService(
        cluster.endpoint,
        cluster.username,
        cluster.password
      );

      // Test connection first
      const connectionTest = await esService.testConnection();
      if (!connectionTest.success) {
        console.error(`Failed to connect to cluster ${cluster.name}: ${connectionTest.message}`);
        return;
      }

      // Collect cluster health
      await this.saveClusterHealth(cluster.id, esService);
      
      // Collect node metrics
      await this.saveNodeMetrics(cluster.id, esService);
      
      // Collect index metrics
      await this.saveIndexMetrics(cluster.id, esService);

      console.log(`Successfully collected data for cluster: ${cluster.name}`);
    } catch (error) {
      console.error(`Error collecting data for cluster ${cluster.name}:`, error);
    }
  }

  async saveClusterHealth(clusterId, esService) {
    try {
      const health = await esService.getClusterHealth();
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
    } catch (error) {
      console.error('Error saving cluster health:', error);
    }
  }

  async saveNodeMetrics(clusterId, esService) {
    try {
      const nodeMetrics = await esService.getComprehensiveNodeAnalysis();
      const db = getDatabase();

      for (const metric of nodeMetrics) {
        await new Promise((resolve, reject) => {
          const sql = `
            INSERT INTO metrics (
              cluster_id, node_name, node_id, node_roles, is_master, is_data, is_ingest,
              cpu_usage, memory_usage, heap_usage, heap_max, heap_used_percent,
              disk_usage, disk_total, disk_used, disk_available,
              load_average_1m, load_average_5m, load_average_15m,
              open_file_descriptors, max_file_descriptors,
              indexing_rate, search_rate, uptime, version, load_average
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          db.run(sql, [
            clusterId,
            metric.nodeName,
            metric.nodeId,
            Array.isArray(metric.nodeRoles) ? metric.nodeRoles.join(',') : metric.nodeRoles,
            metric.isMaster ? 1 : 0,
            metric.isData ? 1 : 0,
            metric.isIngest ? 1 : 0,
            metric.cpuUsage,
            metric.memoryUsage,
            metric.heapUsed,
            metric.heapMax,
            metric.heapUsedPercent,
            metric.diskUsage,
            metric.diskTotal,
            metric.diskUsed,
            metric.diskAvailable,
            metric.loadAverage1m,
            metric.loadAverage5m,
            metric.loadAverage15m,
            metric.openFileDescriptors,
            metric.maxFileDescriptors,
            metric.indexingRate,
            metric.searchRate,
            metric.uptime,
            metric.version,
            metric.loadAverage1m // Keep backward compatibility with old load_average field
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      console.error('Error saving node metrics:', error);
    }
  }

  async saveIndexMetrics(clusterId, esService) {
    try {
      const indexMetrics = await esService.getIndexMetrics();
      const db = getDatabase();

      for (const metric of indexMetrics) {
        await new Promise((resolve, reject) => {
          const sql = `
            INSERT INTO index_metrics (
              cluster_id, index_name, size_bytes, docs_count,
              search_rate, indexing_rate, memory_usage
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `;

          db.run(sql, [
            clusterId,
            metric.indexName,
            metric.sizeBytes,
            metric.docsCount,
            metric.searchRate,
            metric.indexingRate,
            metric.memoryUsage
          ], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    } catch (error) {
      console.error('Error saving index metrics:', error);
    }
  }

  async cleanOldData() {
    const db = getDatabase();
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week retention

    const tables = ['metrics', 'index_metrics', 'cluster_health'];
    
    for (const table of tables) {
      await new Promise((resolve, reject) => {
        db.run(`DELETE FROM ${table} WHERE timestamp < ?`, [oneWeekAgo], (err) => {
          if (err) {
            console.error(`Error cleaning old data from ${table}:`, err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    console.log('Old data cleaned successfully (keeping last 7 days)');
  }
}

module.exports = new DataCollector();
