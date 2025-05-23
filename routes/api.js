const express = require('express');
const { getDatabase } = require('../config/database');
const ElasticsearchService = require('../services/elasticsearchService');
const router = express.Router();

// Get all clusters
router.get('/clusters', (req, res) => {
  const db = getDatabase();
  
  db.all('SELECT id, name, endpoint, created_at FROM clusters', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Add new cluster
router.post('/clusters', (req, res) => {
  console.log('Received cluster data:', req.body);
  
  const { name, endpoint, username, password } = req.body;
  
  if (!name || !endpoint) {
    console.log('Missing required fields:', { name: !!name, endpoint: !!endpoint });
    return res.status(400).json({ error: 'Name and endpoint are required' });
  }

  // Validate endpoint format
  try {
    new URL(endpoint);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid endpoint URL format' });
  }

  const db = getDatabase();
  const sql = 'INSERT INTO clusters (name, endpoint, username, password) VALUES (?, ?, ?, ?)';
  
  db.run(sql, [name, endpoint, username || null, password || null], function(err) {
    if (err) {
      console.error('Database error:', err);
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(400).json({ error: 'Cluster name already exists' });
      }
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    console.log('Cluster added successfully with ID:', this.lastID);
    res.json({ id: this.lastID, message: 'Cluster added successfully' });
  });
});

// Delete cluster
router.delete('/clusters/:id', (req, res) => {
  const db = getDatabase();
  const clusterId = req.params.id;
  
  db.run('DELETE FROM clusters WHERE id = ?', [clusterId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Cluster not found' });
    }
    res.json({ message: 'Cluster deleted successfully' });
  });
});

// Get comprehensive analysis for a cluster
router.get('/clusters/:id/analysis', async (req, res) => {
  try {
    const clusterId = req.params.id;
    const db = getDatabase();
    
    // Get cluster details
    const cluster = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM clusters WHERE id = ?', [clusterId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const esService = new ElasticsearchService(cluster.endpoint, cluster.username, cluster.password);
    const analysis = await esService.generateRecommendations();
    
    res.json(analysis);
  } catch (error) {
    console.error('Error generating analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get shard analysis for a cluster
router.get('/clusters/:id/shards', async (req, res) => {
  try {
    const clusterId = req.params.id;
    const db = getDatabase();
    
    const cluster = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM clusters WHERE id = ?', [clusterId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const esService = new ElasticsearchService(cluster.endpoint, cluster.username, cluster.password);
    const shardAnalysis = await esService.getShardAnalysis();
    
    res.json(shardAnalysis);
  } catch (error) {
    console.error('Error getting shard analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get allocation analysis for a cluster
router.get('/clusters/:id/allocation', async (req, res) => {
  try {
    const clusterId = req.params.id;
    const db = getDatabase();
    
    const cluster = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM clusters WHERE id = ?', [clusterId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const esService = new ElasticsearchService(cluster.endpoint, cluster.username, cluster.password);
    const allocationAnalysis = await esService.getAllocationAnalysis();
    
    res.json(allocationAnalysis);
  } catch (error) {
    console.error('Error getting allocation analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recovery analysis for a cluster
router.get('/clusters/:id/recovery', async (req, res) => {
  try {
    const clusterId = req.params.id;
    const db = getDatabase();
    
    const cluster = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM clusters WHERE id = ?', [clusterId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const esService = new ElasticsearchService(cluster.endpoint, cluster.username, cluster.password);
    const recoveryAnalysis = await esService.getRecoveryAnalysis();
    
    res.json(recoveryAnalysis);
  } catch (error) {
    console.error('Error getting recovery analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get hot threads for a cluster
router.get('/clusters/:id/hot-threads', async (req, res) => {
  try {
    const clusterId = req.params.id;
    const db = getDatabase();
    
    const cluster = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM clusters WHERE id = ?', [clusterId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!cluster) {
      return res.status(404).json({ error: 'Cluster not found' });
    }

    const esService = new ElasticsearchService(cluster.endpoint, cluster.username, cluster.password);
    const hotThreads = await esService.getHotThreads();
    
    res.json({ hotThreads, timestamp: new Date() });
  } catch (error) {
    console.error('Error getting hot threads:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get metrics for a cluster
router.get('/clusters/:id/metrics', (req, res) => {
  const db = getDatabase();
  const clusterId = req.params.id;
  const timeRange = req.query.timeRange || '1h';
  
  let timeFilter = '';
  switch (timeRange) {
    case '15m':
      timeFilter = "AND timestamp >= datetime('now', '-15 minutes')";
      break;
    case '30m':
      timeFilter = "AND timestamp >= datetime('now', '-30 minutes')";
      break;
    case '1h':
      timeFilter = "AND timestamp >= datetime('now', '-1 hour')";
      break;
    case '6h':
      timeFilter = "AND timestamp >= datetime('now', '-6 hours')";
      break;
    case '12h':
      timeFilter = "AND timestamp >= datetime('now', '-12 hours')";
      break;
    case '1d':
      timeFilter = "AND timestamp >= datetime('now', '-1 day')";
      break;
    case '3d':
      timeFilter = "AND timestamp >= datetime('now', '-3 days')";
      break;
    case '1w':
      timeFilter = "AND timestamp >= datetime('now', '-7 days')";
      break;
    default:
      timeFilter = "AND timestamp >= datetime('now', '-1 hour')";
      break;
  }

  const sql = `
    SELECT 
      node_name,
      node_id,
      node_roles,
      is_master,
      is_data,
      is_ingest,
      cpu_usage,
      memory_usage,
      heap_usage,
      heap_max,
      heap_used_percent,
      disk_usage,
      disk_total,
      disk_used,
      disk_available,
      load_average_1m,
      load_average_5m,
      load_average_15m,
      open_file_descriptors,
      max_file_descriptors,
      indexing_rate,
      search_rate,
      uptime,
      version,
      timestamp
    FROM metrics 
    WHERE cluster_id = ? ${timeFilter}
    ORDER BY timestamp DESC
  `;

  db.all(sql, [clusterId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get index metrics for a cluster
router.get('/clusters/:id/index-metrics', (req, res) => {
  const db = getDatabase();
  const clusterId = req.params.id;
  const timeRange = req.query.timeRange || '1h';
  
  let timeFilter = '';
  switch (timeRange) {
    case '15m':
      timeFilter = "AND timestamp >= datetime('now', '-15 minutes')";
      break;
    case '30m':
      timeFilter = "AND timestamp >= datetime('now', '-30 minutes')";
      break;
    case '1h':
      timeFilter = "AND timestamp >= datetime('now', '-1 hour')";
      break;
    case '6h':
      timeFilter = "AND timestamp >= datetime('now', '-6 hours')";
      break;
    case '12h':
      timeFilter = "AND timestamp >= datetime('now', '-12 hours')";
      break;
    case '1d':
      timeFilter = "AND timestamp >= datetime('now', '-1 day')";
      break;
    case '3d':
      timeFilter = "AND timestamp >= datetime('now', '-3 days')";
      break;
    case '1w':
      timeFilter = "AND timestamp >= datetime('now', '-7 days')";
      break;
    default:
      timeFilter = "AND timestamp >= datetime('now', '-1 hour')";
      break;
  }

  const sql = `
    SELECT 
      index_name,
      size_bytes,
      docs_count,
      search_rate,
      indexing_rate,
      memory_usage,
      primary_shards,
      replica_shards,
      timestamp
    FROM index_metrics 
    WHERE cluster_id = ? ${timeFilter}
    ORDER BY timestamp DESC
  `;

  db.all(sql, [clusterId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get cluster health data
router.get('/clusters/:id/health', (req, res) => {
  const db = getDatabase();
  const clusterId = req.params.id;
  const timeRange = req.query.timeRange || '1h';
  
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

  const sql = `
    SELECT * FROM cluster_health 
    WHERE cluster_id = ? ${timeFilter}
    ORDER BY timestamp DESC
  `;

  db.all(sql, [clusterId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get problematic resources (nodes with high usage)
router.get('/clusters/:id/problems', (req, res) => {
  const db = getDatabase();
  const clusterId = req.params.id;
  const cpuThreshold = req.query.cpuThreshold || 80;
  const memoryThreshold = req.query.memoryThreshold || 85;

  const sql = `
    SELECT 
      node_name,
      node_id,
      node_roles,
      is_master,
      is_data,
      AVG(cpu_usage) as avg_cpu,
      AVG(memory_usage) as avg_memory,
      AVG(heap_used_percent) as avg_heap_percent,
      AVG(disk_usage) as avg_disk,
      AVG(load_average_1m) as avg_load_1m,
      COUNT(*) as sample_count,
      MAX(timestamp) as last_seen
    FROM metrics 
    WHERE cluster_id = ? 
      AND timestamp >= datetime('now', '-15 minutes')
    GROUP BY node_name, node_id
    HAVING avg_cpu > ? OR avg_memory > ?
    ORDER BY avg_cpu DESC, avg_memory DESC
  `;

  db.all(sql, [clusterId, cpuThreshold, memoryThreshold], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get top indices by size
router.get('/clusters/:id/top-indices', (req, res) => {
  const db = getDatabase();
  const clusterId = req.params.id;
  const limit = req.query.limit || 10;

  const sql = `
    SELECT 
      index_name,
      AVG(size_bytes) as avg_size,
      AVG(docs_count) as avg_docs,
      AVG(memory_usage) as avg_memory,
      AVG(search_rate) as avg_search_rate,
      AVG(indexing_rate) as avg_indexing_rate,
      MAX(primary_shards) as primary_shards,
      MAX(replica_shards) as replica_shards
    FROM index_metrics 
    WHERE cluster_id = ? 
      AND timestamp >= datetime('now', '-15 minutes')
    GROUP BY index_name
    ORDER BY avg_size DESC
    LIMIT ?
  `;

  db.all(sql, [clusterId, limit], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get dashboard summary with enhanced metrics
router.get('/clusters/:id/summary', (req, res) => {
  const db = getDatabase();
  const clusterId = req.params.id;

  const queries = {
    nodeCount: `
      SELECT COUNT(DISTINCT node_name) as count 
      FROM metrics 
      WHERE cluster_id = ? 
        AND timestamp >= datetime('now', '-5 minutes')
    `,
    dataNodeCount: `
      SELECT COUNT(DISTINCT node_name) as count 
      FROM metrics 
      WHERE cluster_id = ? 
        AND is_data = 1
        AND timestamp >= datetime('now', '-5 minutes')
    `,
    masterNodeCount: `
      SELECT COUNT(DISTINCT node_name) as count 
      FROM metrics 
      WHERE cluster_id = ? 
        AND is_master = 1
        AND timestamp >= datetime('now', '-5 minutes')
    `,
    avgCpu: `
      SELECT AVG(cpu_usage) as avg_cpu 
      FROM metrics 
      WHERE cluster_id = ? 
        AND timestamp >= datetime('now', '-5 minutes')
    `,
    avgMemory: `
      SELECT AVG(memory_usage) as avg_memory 
      FROM metrics 
      WHERE cluster_id = ? 
        AND timestamp >= datetime('now', '-5 minutes')
    `,
    avgHeap: `
      SELECT AVG(heap_used_percent) as avg_heap 
      FROM metrics 
      WHERE cluster_id = ? 
        AND timestamp >= datetime('now', '-5 minutes')
    `,
    avgDisk: `
      SELECT AVG(disk_usage) as avg_disk 
      FROM metrics 
      WHERE cluster_id = ? 
        AND timestamp >= datetime('now', '-5 minutes')
    `,
    avgLoad: `
      SELECT AVG(load_average_1m) as avg_load 
      FROM metrics 
      WHERE cluster_id = ? 
        AND timestamp >= datetime('now', '-5 minutes')
    `,
    indexCount: `
      SELECT COUNT(DISTINCT index_name) as count 
      FROM index_metrics 
      WHERE cluster_id = ? 
        AND timestamp >= datetime('now', '-5 minutes')
    `,
    totalSize: `
      SELECT SUM(size_bytes) as total_size 
      FROM (
        SELECT index_name, AVG(size_bytes) as size_bytes
        FROM index_metrics 
        WHERE cluster_id = ? 
          AND timestamp >= datetime('now', '-5 minutes')
        GROUP BY index_name
      )
    `,
    totalDocs: `
      SELECT SUM(docs_count) as total_docs 
      FROM (
        SELECT index_name, AVG(docs_count) as docs_count
        FROM index_metrics 
        WHERE cluster_id = ? 
          AND timestamp >= datetime('now', '-5 minutes')
        GROUP BY index_name
      )
    `,
    clusterStatus: `
      SELECT status 
      FROM cluster_health 
      WHERE cluster_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `,
    unassignedShards: `
      SELECT unassigned_shards 
      FROM cluster_health 
      WHERE cluster_id = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `
  };

  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, sql]) => {
    db.get(sql, [clusterId], (err, row) => {
      if (err) {
        console.error(`Error in ${key} query:`, err);
        results[key] = null;
      } else {
        results[key] = row;
      }
      
      completed++;
      if (completed === total) {
        res.json(results);
      }
    });
  });
});

// Get recommendations for a cluster
router.get('/clusters/:id/recommendations', (req, res) => {
  const db = getDatabase();
  const clusterId = req.params.id;
  const resolved = req.query.resolved === 'true';

  const sql = `
    SELECT 
      id,
      recommendation_type,
      category,
      title,
      description,
      impact,
      action,
      priority,
      node_id,
      is_resolved,
      timestamp,
      resolved_at
    FROM recommendations 
    WHERE cluster_id = ? 
      AND is_resolved = ?
    ORDER BY priority ASC, timestamp DESC
    LIMIT 50
  `;

  db.all(sql, [clusterId, resolved ? 1 : 0], (err, rows) => {
    if (err) {
      console.error('Error fetching recommendations:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Mark recommendation as resolved
router.patch('/clusters/:id/recommendations/:recId/resolve', (req, res) => {
  const db = getDatabase();
  const clusterId = req.params.id;
  const recId = req.params.recId;

  const sql = `
    UPDATE recommendations 
    SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP 
    WHERE cluster_id = ? AND id = ?
  `;

  db.run(sql, [clusterId, recId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }
    res.json({ message: 'Recommendation marked as resolved' });
  });
});

module.exports = router;
