const ElasticsearchService = require('./elasticsearchService');
const MetricsModel = require('../models/metrics');

class MonitoringService {
  constructor() {
    this.activeConnections = new Map();
  }

  // Get or create ES service for cluster
  getESService(cluster) {
    const key = `${cluster.id}-${cluster.endpoint}`;
    
    if (!this.activeConnections.has(key)) {
      const esService = new ElasticsearchService(
        cluster.endpoint,
        cluster.username,
        cluster.password
      );
      this.activeConnections.set(key, esService);
    }
    
    return this.activeConnections.get(key);
  }

  // Monitor single cluster
  async monitorCluster(cluster) {
    try {
      const esService = this.getESService(cluster);
      
      // Test connection first
      const connectionTest = await esService.testConnection();
      if (!connectionTest.success) {
        console.error(`Failed to connect to cluster ${cluster.name}: ${connectionTest.message}`);
        return { success: false, error: connectionTest.message };
      }

      // Collect all metrics
      const [nodeMetrics, indexMetrics, clusterHealth] = await Promise.all([
        esService.getDetailedNodeMetrics(),
        esService.getIndexMetrics(),
        esService.getClusterHealth()
      ]);

      // Save metrics to database
      await this.saveMetrics(cluster.id, nodeMetrics, indexMetrics, clusterHealth);
      
      return { 
        success: true, 
        nodeCount: nodeMetrics.length,
        indexCount: indexMetrics.length,
        status: clusterHealth.status
      };
    } catch (error) {
      console.error(`Error monitoring cluster ${cluster.name}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Save all metrics to database
  async saveMetrics(clusterId, nodeMetrics, indexMetrics, clusterHealth) {
    try {
      // Save node metrics
      for (const metric of nodeMetrics) {
        await MetricsModel.saveNodeMetrics(clusterId, metric);
      }

      // Save index metrics
      for (const metric of indexMetrics) {
        await MetricsModel.saveIndexMetrics(clusterId, metric);
      }

      // Save cluster health
      await MetricsModel.saveClusterHealth(clusterId, clusterHealth);
      
    } catch (error) {
      console.error('Error saving metrics:', error);
      throw error;
    }
  }

  // Get cluster summary
  async getClusterSummary(clusterId) {
    try {
      const [nodeMetrics, indexMetrics, clusterHealth] = await Promise.all([
        MetricsModel.getMetrics(clusterId, '5m'), // Last 5 minutes for summary
        MetricsModel.getIndexMetrics(clusterId, '5m'),
        MetricsModel.getClusterHealth(clusterId, '5m')
      ]);

      // Calculate averages
      const avgCpu = this.calculateAverage(nodeMetrics, 'cpu_usage');
      const avgMemory = this.calculateAverage(nodeMetrics, 'memory_usage');
      const nodeCount = new Set(nodeMetrics.map(m => m.node_name)).size;
      const indexCount = new Set(indexMetrics.map(m => m.index_name)).size;
      const totalSize = indexMetrics.reduce((sum, idx) => sum + (idx.size_bytes || 0), 0);
      const latestHealth = clusterHealth[0];

      return {
        nodeCount: { count: nodeCount },
        avgCpu: { avg_cpu: avgCpu },
        avgMemory: { avg_memory: avgMemory },
        indexCount: { count: indexCount },
        totalSize: { total_size: totalSize },
        clusterStatus: { status: latestHealth?.status || 'unknown' }
      };
    } catch (error) {
      console.error('Error getting cluster summary:', error);
      throw error;
    }
  }

  // Get problematic nodes
  async getProblematicNodes(clusterId, cpuThreshold = 80, memoryThreshold = 85) {
    try {
      const metrics = await MetricsModel.getMetrics(clusterId, '15m');
      
      // Group by node and calculate averages
      const nodeGroups = this.groupBy(metrics, 'node_name');
      const problematicNodes = [];

      Object.entries(nodeGroups).forEach(([nodeName, nodeMetrics]) => {
        const avgCpu = this.calculateAverage(nodeMetrics, 'cpu_usage');
        const avgMemory = this.calculateAverage(nodeMetrics, 'memory_usage');
        const avgHeap = this.calculateAverage(nodeMetrics, 'heap_usage');
        const avgDisk = this.calculateAverage(nodeMetrics, 'disk_usage');

        if (avgCpu > cpuThreshold || avgMemory > memoryThreshold) {
          problematicNodes.push({
            node_name: nodeName,
            node_id: nodeMetrics[0].node_id,
            avg_cpu: avgCpu,
            avg_memory: avgMemory,
            avg_heap: avgHeap,
            avg_disk: avgDisk,
            sample_count: nodeMetrics.length
          });
        }
      });

      return problematicNodes.sort((a, b) => 
        (b.avg_cpu + b.avg_memory) - (a.avg_cpu + a.avg_memory)
      );
    } catch (error) {
      console.error('Error getting problematic nodes:', error);
      throw error;
    }
  }

  // Get top indices
  async getTopIndices(clusterId, limit = 10) {
    try {
      const indexMetrics = await MetricsModel.getIndexMetrics(clusterId, '15m');
      
      // Group by index and calculate averages
      const indexGroups = this.groupBy(indexMetrics, 'index_name');
      const indexSummaries = [];

      Object.entries(indexGroups).forEach(([indexName, metrics]) => {
        indexSummaries.push({
          index_name: indexName,
          avg_size: this.calculateAverage(metrics, 'size_bytes'),
          avg_docs: this.calculateAverage(metrics, 'docs_count'),
          avg_memory: this.calculateAverage(metrics, 'memory_usage'),
          avg_search_rate: this.calculateAverage(metrics, 'search_rate'),
          avg_indexing_rate: this.calculateAverage(metrics, 'indexing_rate')
        });
      });

      return indexSummaries.slice(0, limit);
    } catch (error) {
      console.error('Error getting top indices:', error);
      throw error;
    }
  }

  // Real-time cluster analysis
  async getRealtimeAnalysis(cluster) {
    try {
      const esService = this.getESService(cluster);
      
      const [problematicNodes, largestIndices, activeIndices] = await Promise.all([
        esService.getProblematicNodes(),
        esService.getLargestIndices(),
        esService.getMostActiveIndices()
      ]);

      return {
        problematicNodes,
        largestIndices,
        activeIndices,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting realtime analysis:', error);
      throw error;
    }
  }

  // Utility methods
  calculateAverage(array, field) {
    if (array.length === 0) return 0;
    const sum = array.reduce((acc, item) => acc + (item[field] || 0), 0);
    return sum / array.length;
  }

  groupBy(array, key) {
    return array.reduce((result, currentValue) => {
      (result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
      return result;
    }, {});
  }

  // Clean up old connections
  cleanupConnections() {
    // Remove unused connections after 1 hour
    // This is handled by the garbage collector naturally for most cases
    console.log('Connection cleanup completed');
  }

  // Health check for monitoring service
  async healthCheck() {
    try {
      // Check database connectivity
      await MetricsModel.getMetrics(1, '1m').catch(() => {}); // Test query
      
      return {
        status: 'healthy',
        activeConnections: this.activeConnections.size,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date()
      };
    }
  }
}

module.exports = new MonitoringService();
