const axios = require('axios');
const https = require('https');

class ElasticsearchService {
  constructor(endpoint, username = null, password = null) {
    this.endpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    this.auth = username && password ? { username, password } : null;
    
    // Create axios instance with SSL verification disabled for self-signed certificates
    this.client = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      }),
      timeout: 10000
    });
  }

  async makeRequest(path, method = 'GET', data = null) {
    try {
      const config = {
        method,
        url: `${this.endpoint}${path}`,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      if (this.auth) {
        config.auth = this.auth;
      }

      if (data) {
        config.data = data;
      }

      const response = await this.client(config);
      return response.data;
    } catch (error) {
      console.error(`Elasticsearch API error for ${path}:`, error.message);
      throw new Error(`Failed to fetch ${path}: ${error.message}`);
    }
  }

  // Basic cluster info
  async getClusterHealth() {
    return await this.makeRequest('/_cluster/health');
  }

  async getNodesStats() {
    return await this.makeRequest('/_nodes/stats');
  }

  async getIndicesStats() {
    return await this.makeRequest('/_stats');
  }

  async getClusterStats() {
    return await this.makeRequest('/_cluster/stats');
  }

  async getNodeInfo() {
    return await this.makeRequest('/_nodes');
  }

  // Advanced monitoring APIs
  async getCatNodes() {
    return await this.makeRequest('/_cat/nodes?v&format=json');
  }

  async getCatShards() {
    return await this.makeRequest('/_cat/shards?v&format=json&s=store:desc');
  }

  async getCatIndices() {
    return await this.makeRequest('/_cat/indices?v&format=json&s=store.size:desc');
  }

  async getCatAllocation() {
    return await this.makeRequest('/_cat/allocation?v&format=json');
  }

  async getCatRecovery() {
    return await this.makeRequest('/_cat/recovery?v&format=json&active_only=true');
  }

  async getHotThreads() {
    return await this.makeRequest('/_nodes/hot_threads?threads=10&interval=1s&snapshots=5');
  }

  async getClusterState() {
    return await this.makeRequest('/_cluster/state/routing_table,nodes');
  }

  async getPendingTasks() {
    return await this.makeRequest('/_cluster/pending_tasks');
  }

  async getTasksList() {
    return await this.makeRequest('/_tasks?detailed=true&actions=*search*,*index*');
  }

  // Get comprehensive node analysis
  async getComprehensiveNodeAnalysis() {
    const [nodesStats, catNodes, nodeInfo] = await Promise.all([
      this.getNodesStats(),
      this.getCatNodes(),
      this.getNodeInfo()
    ]);

    const analysis = [];

    for (const [nodeId, nodeData] of Object.entries(nodesStats.nodes)) {
      const catNode = catNodes.find(n => n.id === nodeId);
      const nodeInfoData = nodeInfo.nodes[nodeId];
      
      const jvm = nodeData.jvm || {};
      const os = nodeData.os || {};
      const fs = nodeData.fs || {};
      const process = nodeData.process || {};
      const indices = nodeData.indices || {};

      // Calculate critical metrics
      const heapUsedPercent = jvm.mem ? (jvm.mem.heap_used_in_bytes / jvm.mem.heap_max_in_bytes) * 100 : 0;
      const diskUsedPercent = fs.total ? ((fs.total.total_in_bytes - fs.total.available_in_bytes) / fs.total.total_in_bytes) * 100 : 0;
      const loadAvg = os.cpu ? os.cpu.load_average : {};

      // Determine node roles
      const roles = nodeInfoData?.roles || [];
      const isMaster = roles.includes('master');
      const isData = roles.includes('data') || roles.includes('data_hot') || roles.includes('data_warm') || roles.includes('data_cold');
      const isIngest = roles.includes('ingest');

      analysis.push({
        nodeId: nodeId,
        nodeName: nodeData.name,
        nodeRoles: roles,
        isMaster,
        isData,
        isIngest,
        
        // Performance metrics
        cpuUsage: os.cpu ? os.cpu.percent : 0,
        memoryUsage: jvm.mem ? heapUsedPercent : 0,
        heapUsed: jvm.mem ? jvm.mem.heap_used_in_bytes : 0,
        heapMax: jvm.mem ? jvm.mem.heap_max_in_bytes : 0,
        heapUsedPercent,
        diskUsage: diskUsedPercent,
        diskTotal: fs.total ? fs.total.total_in_bytes : 0,
        diskUsed: fs.total ? fs.total.total_in_bytes - fs.total.available_in_bytes : 0,
        diskAvailable: fs.total ? fs.total.available_in_bytes : 0,
        
        // Load averages
        loadAverage1m: loadAvg['1m'] || 0,
        loadAverage5m: loadAvg['5m'] || 0,
        loadAverage15m: loadAvg['15m'] || 0,
        
        // Process info
        openFileDescriptors: process.open_file_descriptors || 0,
        maxFileDescriptors: process.max_file_descriptors || 0,
        
        // Index stats for data nodes
        indexingRate: indices.indexing ? indices.indexing.index_total : 0,
        searchRate: indices.search ? indices.search.query_total : 0,
        
        // From cat nodes
        uptime: catNode?.uptime || '',
        version: catNode?.version || nodeInfoData?.version || '',
        
        timestamp: new Date()
      });
    }

    return analysis;
  }

  // Get shard analysis
  async getShardAnalysis() {
    const [catShards, catIndices] = await Promise.all([
      this.getCatShards(),
      this.getCatIndices()
    ]);

    const shardAnalysis = {
      largestShards: catShards
        .filter(s => s.store && !isNaN(parseFloat(s.store)))
        .sort((a, b) => this.parseSize(b.store) - this.parseSize(a.store))
        .slice(0, 20)
        .map(shard => ({
          index: shard.index,
          shard: shard.shard,
          prirep: shard.prirep,
          state: shard.state,
          docs: parseInt(shard.docs) || 0,
          store: shard.store,
          storeByte: this.parseSize(shard.store),
          node: shard.node,
          nodeId: shard['node.id'] || shard.id
        })),
      
      unassignedShards: catShards
        .filter(s => s.state === 'UNASSIGNED')
        .map(shard => ({
          index: shard.index,
          shard: shard.shard,
          prirep: shard.prirep,
          state: shard.state,
          unassignedReason: shard['unassigned.reason'] || 'unknown'
        })),
      
      shardDistribution: this.analyzeShardDistribution(catShards),
      indexShardCounts: this.getIndexShardCounts(catShards)
    };

    return shardAnalysis;
  }

  // Get allocation analysis  
  async getAllocationAnalysis() {
    const [allocation, clusterHealth] = await Promise.all([
      this.getCatAllocation(),
      this.getClusterHealth()
    ]);

    return {
      nodeAllocations: allocation.map(alloc => ({
        node: alloc.node,
        shards: parseInt(alloc.shards) || 0,
        diskIndices: alloc['disk.indices'],
        diskUsed: alloc['disk.used'],
        diskAvail: alloc['disk.avail'],
        diskTotal: alloc['disk.total'],
        diskPercent: parseFloat(alloc['disk.percent']) || 0,
        host: alloc.host,
        ip: alloc.ip
      })),
      clusterShardStats: {
        activePrimaryShards: clusterHealth.active_primary_shards,
        activeShards: clusterHealth.active_shards,
        relocatingShards: clusterHealth.relocating_shards,
        initializingShards: clusterHealth.initializing_shards,
        unassignedShards: clusterHealth.unassigned_shards
      }
    };
  }

  // Get recovery analysis
  async getRecoveryAnalysis() {
    try {
      const recoveries = await this.getCatRecovery();
      return recoveries.map(recovery => ({
        index: recovery.index,
        shard: recovery.shard,
        time: recovery.time,
        type: recovery.type,
        stage: recovery.stage,
        sourceHost: recovery.source_host,
        sourceNode: recovery.source_node,
        targetHost: recovery.target_host,
        targetNode: recovery.target_node,
        repository: recovery.repository,
        snapshot: recovery.snapshot,
        files: recovery.files,
        filesRecovered: recovery.files_recovered,
        filesPercent: recovery.files_percent,
        filesTotal: recovery.files_total,
        bytes: recovery.bytes,
        bytesRecovered: recovery.bytes_recovered,
        bytesPercent: recovery.bytes_percent,
        bytesTotal: recovery.bytes_total,
        translogOps: recovery.translog_ops,
        translogOpsRecovered: recovery.translog_ops_recovered,
        translogOpsPercent: recovery.translog_ops_percent
      }));
    } catch (error) {
      console.warn('Could not fetch recovery data:', error.message);
      return [];
    }
  }

  // Enhanced comprehensive analysis with actionable insights
  async generateEnhancedRecommendations() {
    try {
      const [nodeAnalysis, shardAnalysis, allocationAnalysis, clusterHealth, clusterStats, pendingTasks, activeTasks] = await Promise.all([
        this.getComprehensiveNodeAnalysis(),
        this.getShardAnalysis(),
        this.getAllocationAnalysis(),
        this.getClusterHealth(),
        this.getClusterStats(),
        this.getPendingTasks(),
        this.getTasksList()
      ]);

      const recommendations = [];
      const detailedAnalysis = {};

      // Enhanced node-level analysis
      const nodeInsights = await this.analyzeNodePerformance(nodeAnalysis, shardAnalysis, recommendations);
      
      // Shard rebalancing recommendations
      const rebalancingInsights = await this.analyzeShardRebalancing(nodeAnalysis, shardAnalysis, recommendations);
      
      // Index-level performance analysis
      const indexInsights = await this.analyzeIndexPerformance(nodeAnalysis, shardAnalysis, recommendations);
      
      // Operations impact analysis
      const operationsInsights = await this.analyzeOperationsImpact(activeTasks, pendingTasks, nodeAnalysis, recommendations);

      // Resource contention analysis
      const contentionInsights = await this.analyzeResourceContention(nodeAnalysis, recommendations);

      detailedAnalysis.nodeInsights = nodeInsights;
      detailedAnalysis.rebalancingInsights = rebalancingInsights;
      detailedAnalysis.indexInsights = indexInsights;
      detailedAnalysis.operationsInsights = operationsInsights;
      detailedAnalysis.contentionInsights = contentionInsights;

      return {
        recommendations,
        nodeAnalysis,
        shardAnalysis,
        allocationAnalysis,
        clusterHealth,
        detailedAnalysis,
        summary: this.generateEnhancedExecutiveSummary(recommendations, nodeAnalysis, clusterHealth, detailedAnalysis)
      };
    } catch (error) {
      console.error('Error generating enhanced recommendations:', error);
      throw error;
    }
  }

  // Analyze node performance with specific insights
  async analyzeNodePerformance(nodeAnalysis, shardAnalysis, recommendations) {
    const insights = {};
    
    nodeAnalysis.forEach(node => {
      const nodeShards = this.getNodeShards(node.nodeId, shardAnalysis);
      const nodeInsight = {
        nodeName: node.nodeName,
        nodeId: node.nodeId,
        roles: node.nodeRoles,
        issues: [],
        shardCount: nodeShards.length,
        largestShards: nodeShards.sort((a, b) => b.storeByte - a.storeByte).slice(0, 5),
        recommendations: []
      };

      // High heap usage analysis
      if (node.heapUsedPercent > 85) {
        const heaviestShards = nodeShards
          .sort((a, b) => b.storeByte - a.storeByte)
          .slice(0, 3);

        nodeInsight.issues.push({
          type: 'HIGH_HEAP_USAGE',
          severity: 'CRITICAL',
          current: `${node.heapUsedPercent.toFixed(1)}%`,
          threshold: '85%',
          impact: 'GC pressure, performance degradation, potential OOM'
        });

        // Specific recommendations
        if (heaviestShards.length > 0) {
          const movableShards = this.findMovableShards(heaviestShards, nodeAnalysis, node.nodeId);
          
          if (movableShards.length > 0) {
            recommendations.push({
              type: 'CRITICAL',
              category: 'SHARD_REBALANCING',
              title: `Rebalance Heavy Shards from ${node.nodeName}`,
              description: `Node ${node.nodeName} (${node.heapUsedPercent.toFixed(1)}% heap) has ${heaviestShards.length} large shards consuming significant memory. Move specific shards to reduce heap pressure.`,
              impact: 'HIGH',
              action: `Move shards: ${movableShards.map(s => `${s.index}[${s.shard}]`).join(', ')} to nodes: ${movableShards.map(s => s.suggestedTarget).join(', ')}`,
              priority: 1,
              nodeId: node.nodeId,
              specifics: {
                shardsToMove: movableShards,
                expectedHeapReduction: this.calculateHeapReduction(movableShards),
                commands: this.generateRebalanceCommands(movableShards)
              }
            });

            nodeInsight.recommendations.push({
              action: 'MOVE_SHARDS',
              shards: movableShards,
              expectedImprovement: `Reduce heap by ~${this.calculateHeapReduction(movableShards).toFixed(1)}%`
            });
          }
        }

        // Alternative recommendations
        recommendations.push({
          type: 'WARNING',
          category: 'MEMORY',
          title: `Increase Heap Size for ${node.nodeName}`,
          description: `Current heap: ${this.formatBytes(node.heapUsed)}/${this.formatBytes(node.heapMax)}. Consider increasing heap size.`,
          impact: 'MEDIUM',
          action: `Increase heap from ${this.formatBytes(node.heapMax)} to ${this.formatBytes(node.heapMax * 1.5)} (but not exceed 50% of RAM)`,
          priority: 2,
          nodeId: node.nodeId,
          specifics: {
            currentHeap: node.heapMax,
            suggestedHeap: node.heapMax * 1.5,
            commands: [`docker run -e "ES_JAVA_OPTS=-Xms${Math.floor(node.heapMax * 1.5 / 1024 / 1024 / 1024)}g -Xmx${Math.floor(node.heapMax * 1.5 / 1024 / 1024 / 1024)}g"`]
          }
        });
      }

      // CPU pressure analysis
      if (node.cpuUsage > 80) {
        const activeOperations = this.analyzeNodeOperations(node);
        
        nodeInsight.issues.push({
          type: 'HIGH_CPU_USAGE',
          severity: 'WARNING',
          current: `${node.cpuUsage.toFixed(1)}%`,
          threshold: '80%',
          impact: 'Query slowdown, indexing delays'
        });

        recommendations.push({
          type: 'WARNING',
          category: 'CPU',
          title: `High CPU Load on ${node.nodeName}`,
          description: `Node ${node.nodeName} shows ${node.cpuUsage.toFixed(1)}% CPU usage. Analysis shows: ${activeOperations.summary}`,
          impact: 'MEDIUM',
          action: `${activeOperations.recommendations.join('; ')}`,
          priority: 2,
          nodeId: node.nodeId,
          specifics: {
            cpuBreakdown: activeOperations.breakdown,
            optimizations: activeOperations.optimizations
          }
        });
      }

      insights[node.nodeId] = nodeInsight;
    });

    return insights;
  }

  // Analyze shard rebalancing opportunities
  async analyzeShardRebalancing(nodeAnalysis, shardAnalysis, recommendations) {
    const rebalancingPlan = {
      imbalancedNodes: [],
      rebalanceOpportunities: [],
      estimatedImpact: {}
    };

    // Find nodes with uneven shard distribution
    const nodeShardCounts = {};
    const nodeShardSizes = {};

    Object.entries(shardAnalysis.shardDistribution).forEach(([nodeName, shardCount]) => {
      const node = nodeAnalysis.find(n => n.nodeName === nodeName);
      if (node) {
        nodeShardCounts[node.nodeId] = shardCount;
        nodeShardSizes[node.nodeId] = this.calculateNodeShardSize(node.nodeId, shardAnalysis);
      }
    });

    const avgShardCount = Object.values(nodeShardCounts).reduce((a, b) => a + b, 0) / Object.keys(nodeShardCounts).length;
    const avgShardSize = Object.values(nodeShardSizes).reduce((a, b) => a + b, 0) / Object.keys(nodeShardSizes).length;

    // Identify imbalanced nodes
    Object.entries(nodeShardCounts).forEach(([nodeId, shardCount]) => {
      const node = nodeAnalysis.find(n => n.nodeId === nodeId);
      const shardSize = nodeShardSizes[nodeId];
      
      if (shardCount > avgShardCount * 1.3 || shardSize > avgShardSize * 1.3) {
        const nodeShards = this.getNodeShards(nodeId, shardAnalysis);
        const movableCandidates = this.findBestShardsToMove(nodeShards, nodeAnalysis, nodeId);

        rebalancingPlan.imbalancedNodes.push({
          nodeId,
          nodeName: node.nodeName,
          currentShardCount: shardCount,
          currentShardSize: shardSize,
          imbalanceRatio: Math.max(shardCount / avgShardCount, shardSize / avgShardSize),
          movableCandidates
        });

        if (movableCandidates.length > 0) {
          recommendations.push({
            type: 'INFO',
            category: 'BALANCE',
            title: `Rebalance Shards from Overloaded ${node.nodeName}`,
            description: `Node has ${shardCount} shards (avg: ${avgShardCount.toFixed(0)}) with ${this.formatBytes(shardSize)} data (avg: ${this.formatBytes(avgShardSize)}). Rebalancing can improve performance.`,
            impact: 'MEDIUM',
            action: `Move ${movableCandidates.length} shards to underutilized nodes: ${movableCandidates.map(s => s.suggestedTarget).join(', ')}`,
            priority: 3,
            nodeId,
            specifics: {
              rebalancePlan: movableCandidates,
              expectedImprovement: 'More even resource distribution, reduced hotspots'
            }
          });
        }
      }
    });

    return rebalancingPlan;
  }

  // Analyze index-level performance
  async analyzeIndexPerformance(nodeAnalysis, shardAnalysis, recommendations) {
    const indexInsights = {};
    
    // Group shards by index
    const indexShards = {};
    shardAnalysis.largestShards.forEach(shard => {
      if (!indexShards[shard.index]) {
        indexShards[shard.index] = [];
      }
      indexShards[shard.index].push(shard);
    });

    Object.entries(indexShards).forEach(([indexName, shards]) => {
      const totalSize = shards.reduce((sum, shard) => sum + shard.storeByte, 0);
      const avgShardSize = totalSize / shards.length;
      const maxShardSize = Math.max(...shards.map(s => s.storeByte));
      const minShardSize = Math.min(...shards.map(s => s.storeByte));
      
      const insight = {
        indexName,
        totalSize,
        shardCount: shards.length,
        avgShardSize,
        maxShardSize,
        minShardSize,
        imbalanceRatio: maxShardSize / minShardSize,
        hotNodes: this.identifyHotNodes(shards, nodeAnalysis),
        issues: []
      };

      // Large shard analysis
      if (maxShardSize > 50 * 1024 * 1024 * 1024) { // 50GB
        insight.issues.push('OVERSIZED_SHARDS');
        
        recommendations.push({
          type: 'WARNING',
          category: 'INDEX_OPTIMIZATION',
          title: `Oversized Shards in Index: ${indexName}`,
          description: `Index ${indexName} has shards up to ${this.formatBytes(maxShardSize)}. Large shards impact recovery time and performance.`,
          impact: 'MEDIUM',
          action: `Consider reindexing with more primary shards. Current: ${shards.filter(s => s.prirep === 'p').length} primary, suggest: ${Math.ceil(totalSize / (30 * 1024 * 1024 * 1024))} primary shards`,
          priority: 3,
          specifics: {
            currentPrimaryShards: shards.filter(s => s.prirep === 'p').length,
            suggestedPrimaryShards: Math.ceil(totalSize / (30 * 1024 * 1024 * 1024)),
            reindexCommand: this.generateReindexCommand(indexName, Math.ceil(totalSize / (30 * 1024 * 1024 * 1024)))
          }
        });
      }

      // Shard imbalance analysis
      if (insight.imbalanceRatio > 2) {
        insight.issues.push('SHARD_IMBALANCE');
        
        recommendations.push({
          type: 'INFO',
          category: 'INDEX_OPTIMIZATION',
          title: `Shard Size Imbalance in Index: ${indexName}`,
          description: `Index ${indexName} has uneven shard sizes (${this.formatBytes(minShardSize)} to ${this.formatBytes(maxShardSize)}). This may indicate uneven data distribution.`,
          impact: 'LOW',
          action: `Review indexing strategy. Consider custom routing or document distribution patterns.`,
          priority: 4,
          specifics: {
            shardSizeDistribution: shards.map(s => ({
              shard: s.shard,
              size: this.formatBytes(s.storeByte),
              node: s.node
            }))
          }
        });
      }

      // Hot node analysis
      if (insight.hotNodes.length > 0) {
        insight.issues.push('HOT_NODES');
        
        recommendations.push({
          type: 'WARNING',
          category: 'SHARD_REBALANCING',
          title: `Hot Nodes Detected for Index: ${indexName}`,
          description: `Index ${indexName} has multiple shards on high-resource nodes: ${insight.hotNodes.map(n => n.nodeName).join(', ')}`,
          impact: 'MEDIUM',
          action: `Redistribute shards from hot nodes to cooler nodes for better performance`,
          priority: 2,
          specifics: {
            hotNodes: insight.hotNodes,
            redistributionPlan: this.generateRedistributionPlan(shards, nodeAnalysis)
          }
        });
      }

      indexInsights[indexName] = insight;
    });

    return indexInsights;
  }

  // Analyze operations impact (bulk operations, searches, etc.)
  async analyzeOperationsImpact(activeTasks, pendingTasks, nodeAnalysis, recommendations) {
    const operationsInsights = {
      activeTasks: activeTasks.nodes || {},
      pendingTasks: pendingTasks.tasks || [],
      impactAnalysis: {},
      recommendations: []
    };

    // Analyze active tasks by node
    Object.entries(operationsInsights.activeTasks).forEach(([nodeId, nodeTasks]) => {
      const node = nodeAnalysis.find(n => n.nodeId === nodeId);
      if (!node) return;

      const taskAnalysis = this.analyzeNodeTasks(nodeTasks, node);
      operationsInsights.impactAnalysis[nodeId] = taskAnalysis;

      if (taskAnalysis.highImpactTasks.length > 0) {
        recommendations.push({
          type: 'WARNING',
          category: 'OPERATIONS',
          title: `High Impact Operations on ${node.nodeName}`,
          description: `Node is running ${taskAnalysis.highImpactTasks.length} resource-intensive operations: ${taskAnalysis.summary}`,
          impact: 'MEDIUM',
          action: taskAnalysis.recommendations.join('; '),
          priority: 2,
          nodeId,
          specifics: {
            operations: taskAnalysis.highImpactTasks,
            optimizations: taskAnalysis.optimizations
          }
        });
      }
    });

    // Analyze pending tasks
    if (operationsInsights.pendingTasks.length > 10) {
      recommendations.push({
        type: 'WARNING',
        category: 'OPERATIONS',
        title: 'High Number of Pending Tasks',
        description: `${operationsInsights.pendingTasks.length} tasks are pending execution. This may indicate cluster congestion.`,
        impact: 'MEDIUM',
        action: 'Review cluster capacity and consider scaling or optimizing operations',
        priority: 2,
        specifics: {
          pendingTaskTypes: this.categorizePendingTasks(operationsInsights.pendingTasks),
          recommendations: [
            'Consider increasing master node capacity',
            'Review bulk operation sizing',
            'Implement operation throttling'
          ]
        }
      });
    }

    return operationsInsights;
  }

  // Analyze resource contention
  async analyzeResourceContention(nodeAnalysis, recommendations) {
    const contentionAnalysis = {
      memoryContention: [],
      cpuContention: [],
      diskContention: [],
      networkContention: []
    };

    // Memory contention analysis
    const highMemoryNodes = nodeAnalysis.filter(n => n.heapUsedPercent > 75);
    if (highMemoryNodes.length > nodeAnalysis.length * 0.5) {
      contentionAnalysis.memoryContention = highMemoryNodes;
      
      recommendations.push({
        type: 'CRITICAL',
        category: 'CLUSTER_SCALING',
        title: 'Cluster-Wide Memory Pressure',
        description: `${highMemoryNodes.length}/${nodeAnalysis.length} nodes show high memory usage. This indicates cluster-wide memory pressure.`,
        impact: 'HIGH',
        action: 'Scale cluster horizontally (add more nodes) or vertically (increase memory per node)',
        priority: 1,
        specifics: {
          affectedNodes: highMemoryNodes.map(n => n.nodeName),
          scalingOptions: [
            `Add ${Math.ceil(highMemoryNodes.length * 0.5)} more data nodes`,
            `Increase memory by 50% on existing nodes`,
            'Implement data tiering (hot/warm/cold)'
          ]
        }
      });
    }

    return contentionAnalysis;
  }

  // Helper methods for enhanced analysis
  getNodeShards(nodeId, shardAnalysis) {
    return shardAnalysis.largestShards.filter(shard => shard.nodeId === nodeId);
  }

  findMovableShards(heaviestShards, nodeAnalysis, sourceNodeId) {
    const movableShards = [];
    const targetNodes = nodeAnalysis
      .filter(n => n.nodeId !== sourceNodeId && n.heapUsedPercent < 70 && n.isData)
      .sort((a, b) => a.heapUsedPercent - b.heapUsedPercent);

    heaviestShards.slice(0, 3).forEach((shard, index) => {
      if (targetNodes[index]) {
        movableShards.push({
          ...shard,
          suggestedTarget: targetNodes[index].nodeName,
          targetNodeId: targetNodes[index].nodeId,
          expectedBenefit: `Reduce source heap by ~${(shard.storeByte / (1024 * 1024 * 1024) * 0.1).toFixed(1)}%`
        });
      }
    });

    return movableShards;
  }

  calculateHeapReduction(movableShards) {
    return movableShards.reduce((total, shard) => {
      return total + (shard.storeByte / (1024 * 1024 * 1024) * 0.1);
    }, 0);
  }

  generateRebalanceCommands(movableShards) {
    return movableShards.map(shard => 
      `curl -X POST "elasticsearch:9200/_cluster/reroute" -H 'Content-Type: application/json' -d'{"commands":[{"move":{"index":"${shard.index}","shard":${shard.shard},"from_node":"${shard.nodeId}","to_node":"${shard.targetNodeId}"}}]}'`
    );
  }

  generateReindexCommand(indexName, suggestedShards) {
    return `curl -X PUT "elasticsearch:9200/${indexName}_reindexed" -H 'Content-Type: application/json' -d'{"settings":{"number_of_shards":${suggestedShards},"number_of_replicas":1}}'`;
  }

  formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  analyzeNodeOperations(node) {
    return {
      summary: `High indexing rate: ${node.indexingRate}, search rate: ${node.searchRate}`,
      recommendations: [
        'Optimize bulk request sizes',
        'Review query patterns',
        'Consider index refresh intervals'
      ],
      breakdown: {
        indexing: node.indexingRate,
        searching: node.searchRate,
        loadAverage: node.loadAverage1m
      },
      optimizations: [
        'Reduce bulk size if > 15MB',
        'Use async search for heavy queries',
        'Implement query caching'
      ]
    };
  }

  calculateNodeShardSize(nodeId, shardAnalysis) {
    return shardAnalysis.largestShards
      .filter(shard => shard.nodeId === nodeId)
      .reduce((total, shard) => total + shard.storeByte, 0);
  }

  findBestShardsToMove(nodeShards, nodeAnalysis, sourceNodeId) {
    return nodeShards
      .sort((a, b) => b.storeByte - a.storeByte)
      .slice(0, 3)
      .map(shard => ({
        ...shard,
        suggestedTarget: this.findBestTargetNode(nodeAnalysis, sourceNodeId),
        reason: 'Balance shard distribution'
      }));
  }

  findBestTargetNode(nodeAnalysis, excludeNodeId) {
    const candidates = nodeAnalysis
      .filter(n => n.nodeId !== excludeNodeId && n.isData && n.heapUsedPercent < 70)
      .sort((a, b) => a.heapUsedPercent - b.heapUsedPercent);
    
    return candidates.length > 0 ? candidates[0].nodeName : 'No suitable target';
  }

  identifyHotNodes(shards, nodeAnalysis) {
    const nodeShardCounts = {};
    shards.forEach(shard => {
      nodeShardCounts[shard.node] = (nodeShardCounts[shard.node] || 0) + 1;
    });

    return Object.entries(nodeShardCounts)
      .filter(([nodeName, count]) => count > 2)
      .map(([nodeName, count]) => {
        const node = nodeAnalysis.find(n => n.nodeName === nodeName);
        return {
          nodeName,
          shardCount: count,
          heapUsage: node ? node.heapUsedPercent : 0
        };
      })
      .filter(n => n.heapUsage > 75);
  }

  generateRedistributionPlan(shards, nodeAnalysis) {
    return shards.map(shard => ({
      current: shard.node,
      suggested: this.findBestTargetNode(nodeAnalysis, shard.nodeId),
      reason: 'Reduce hot node pressure'
    }));
  }

  analyzeNodeTasks(nodeTasks, node) {
    const highImpactTasks = [];
    // This would need actual task data structure analysis
    return {
      highImpactTasks,
      summary: 'Task analysis requires active monitoring',
      recommendations: ['Monitor task queue lengths', 'Optimize heavy operations'],
      optimizations: ['Batch smaller operations', 'Use async processing']
    };
  }

  categorizePendingTasks(pendingTasks) {
    const categories = {};
    pendingTasks.forEach(task => {
      const type = task.source || 'unknown';
      categories[type] = (categories[type] || 0) + 1;
    });
    return categories;
  }

  generateEnhancedExecutiveSummary(recommendations, nodeAnalysis, clusterHealth, detailedAnalysis) {
    const critical = recommendations.filter(r => r.type === 'CRITICAL').length;
    const warnings = recommendations.filter(r => r.type === 'WARNING').length;
    
    const actionableInsights = [
      `${critical} critical issues requiring immediate attention`,
      `${warnings} warnings that should be addressed`,
      `${Object.keys(detailedAnalysis.nodeInsights || {}).length} nodes analyzed for optimization opportunities`
    ];

    return {
      ...this.generateExecutiveSummary(recommendations, nodeAnalysis, clusterHealth),
      actionableInsights,
      detailedAnalysis: {
        nodesWithIssues: Object.values(detailedAnalysis.nodeInsights || {}).filter(n => n.issues.length > 0).length,
        rebalanceOpportunities: detailedAnalysis.rebalancingInsights?.rebalanceOpportunities?.length || 0,
        indexOptimizations: Object.keys(detailedAnalysis.indexInsights || {}).length
      }
    };
  }

  // Analyze and generate node recommendations
  analyzeNodeRecommendations(nodeAnalysis, recommendations) {
    const dataNodes = nodeAnalysis.filter(n => n.isData);
    const masterNodes = nodeAnalysis.filter(n => n.isMaster);
    
    // Check for insufficient master nodes
    if (masterNodes.length < 3) {
      recommendations.push({
        type: 'CRITICAL',
        category: 'CLUSTER_STABILITY',
        title: 'Insufficient Master Nodes',
        description: `You have ${masterNodes.length} master-eligible nodes. For production clusters, you should have at least 3 master-eligible nodes to prevent split-brain scenarios.`,
        impact: 'HIGH',
        action: 'Add more master-eligible nodes',
        priority: 1
      });
    }

    // Check for node resource issues
    nodeAnalysis.forEach(node => {
      // High heap usage
      if (node.heapUsedPercent > 85) {
        recommendations.push({
          type: 'CRITICAL',
          category: 'MEMORY',
          title: `High Heap Usage on ${node.nodeName}`,
          description: `Node ${node.nodeName} is using ${node.heapUsedPercent.toFixed(1)}% of heap memory. This can cause GC pressure and performance issues.`,
          impact: 'HIGH',
          action: 'Increase heap size or reduce data/query load',
          priority: 1,
          nodeId: node.nodeId
        });
      } else if (node.heapUsedPercent > 75) {
        recommendations.push({
          type: 'WARNING',
          category: 'MEMORY',
          title: `Elevated Heap Usage on ${node.nodeName}`,
          description: `Node ${node.nodeName} is using ${node.heapUsedPercent.toFixed(1)}% of heap memory. Monitor closely.`,
          impact: 'MEDIUM',
          action: 'Monitor heap usage and consider optimization',
          priority: 2,
          nodeId: node.nodeId
        });
      }

      // High disk usage
      if (node.diskUsage > 90) {
        recommendations.push({
          type: 'CRITICAL',
          category: 'STORAGE',
          title: `Critical Disk Usage on ${node.nodeName}`,
          description: `Node ${node.nodeName} is using ${node.diskUsage.toFixed(1)}% of disk space. Elasticsearch will start refusing new data at 95%.`,
          impact: 'CRITICAL',
          action: 'Free up disk space immediately or add storage',
          priority: 1,
          nodeId: node.nodeId
        });
      } else if (node.diskUsage > 85) {
        recommendations.push({
          type: 'WARNING',
          category: 'STORAGE',
          title: `High Disk Usage on ${node.nodeName}`,
          description: `Node ${node.nodeName} is using ${node.diskUsage.toFixed(1)}% of disk space.`,
          impact: 'MEDIUM',
          action: 'Plan for additional storage or data cleanup',
          priority: 2,
          nodeId: node.nodeId
        });
      }

      // High CPU usage
      if (node.cpuUsage > 80) {
        recommendations.push({
          type: 'WARNING',
          category: 'CPU',
          title: `High CPU Usage on ${node.nodeName}`,
          description: `Node ${node.nodeName} is using ${node.cpuUsage.toFixed(1)}% CPU. This may indicate heavy query load or inefficient queries.`,
          impact: 'MEDIUM',
          action: 'Investigate query patterns and optimize or scale',
          priority: 2,
          nodeId: node.nodeId
        });
      }

      // High load average
      if (node.loadAverage1m > 4) {
        recommendations.push({
          type: 'WARNING',
          category: 'PERFORMANCE',
          title: `High Load Average on ${node.nodeName}`,
          description: `Node ${node.nodeName} has a 1-minute load average of ${node.loadAverage1m.toFixed(2)}. This indicates system stress.`,
          impact: 'MEDIUM',
          action: 'Investigate system bottlenecks',
          priority: 2,
          nodeId: node.nodeId
        });
      }
    });

    // Check for unbalanced data nodes
    if (dataNodes.length > 1) {
      const diskUsages = dataNodes.map(n => n.diskUsage);
      const maxDisk = Math.max(...diskUsages);
      const minDisk = Math.min(...diskUsages);
      
      if (maxDisk - minDisk > 20) {
        recommendations.push({
          type: 'WARNING',
          category: 'BALANCE',
          title: 'Unbalanced Disk Usage Across Data Nodes',
          description: `Disk usage varies significantly across data nodes (${minDisk.toFixed(1)}% to ${maxDisk.toFixed(1)}%). This may indicate poor shard allocation.`,
          impact: 'MEDIUM',
          action: 'Review shard allocation and rebalance if necessary',
          priority: 3
        });
      }
    }
  }

  // Analyze shard recommendations
  analyzeShardRecommendations(shardAnalysis, recommendations) {
    // Check for unassigned shards
    if (shardAnalysis.unassignedShards.length > 0) {
      recommendations.push({
        type: 'CRITICAL',
        category: 'SHARDS',
        title: 'Unassigned Shards Detected',
        description: `${shardAnalysis.unassignedShards.length} shards are unassigned. This means data is not fully replicated and cluster health is degraded.`,
        impact: 'HIGH',
        action: 'Investigate and resolve shard allocation issues',
        priority: 1,
        details: shardAnalysis.unassignedShards.slice(0, 5)
      });
    }

    // Check for large shards
    const largeShards = shardAnalysis.largestShards.filter(s => s.storeByte > 50 * 1024 * 1024 * 1024); // 50GB
    if (largeShards.length > 0) {
      recommendations.push({
        type: 'WARNING',
        category: 'SHARDS',
        title: 'Large Shards Detected',
        description: `${largeShards.length} shards are larger than 50GB. Large shards can impact performance and recovery times.`,
        impact: 'MEDIUM',
        action: 'Consider re-indexing with more primary shards or implementing index lifecycle management',
        priority: 3,
        details: largeShards.slice(0, 5)
      });
    }

    // Check shard distribution
    const nodeShardCounts = Object.values(shardAnalysis.shardDistribution);
    if (nodeShardCounts.length > 1) {
      const maxShards = Math.max(...nodeShardCounts);
      const minShards = Math.min(...nodeShardCounts);
      
      if (maxShards > minShards * 1.5) {
        recommendations.push({
          type: 'INFO',
          category: 'BALANCE',
          title: 'Uneven Shard Distribution',
          description: `Shards are not evenly distributed across nodes (${minShards} to ${maxShards} shards per node).`,
          impact: 'LOW',
          action: 'Consider rebalancing shards for optimal performance',
          priority: 4
        });
      }
    }
  }

  // Analyze cluster recommendations
  analyzeClusterRecommendations(clusterHealth, clusterStats, nodeAnalysis, recommendations) {
    // Check cluster status
    if (clusterHealth.status === 'red') {
      recommendations.push({
        type: 'CRITICAL',
        category: 'CLUSTER_HEALTH',
        title: 'Cluster Status is RED',
        description: 'Cluster health is RED, indicating some primary shards are not allocated. Data may be unavailable.',
        impact: 'CRITICAL',
        action: 'Immediately investigate and resolve shard allocation issues',
        priority: 1
      });
    } else if (clusterHealth.status === 'yellow') {
      recommendations.push({
        type: 'WARNING',
        category: 'CLUSTER_HEALTH',
        title: 'Cluster Status is YELLOW',
        description: 'Cluster health is YELLOW, indicating some replica shards are not allocated. Data is available but not fully replicated.',
        impact: 'MEDIUM',
        action: 'Investigate replica shard allocation issues',
        priority: 2
      });
    }

    // Check for single node cluster
    if (clusterHealth.number_of_nodes === 1) {
      recommendations.push({
        type: 'WARNING',
        category: 'CLUSTER_STABILITY',
        title: 'Single Node Cluster',
        description: 'Running a single-node cluster provides no redundancy. Node failure will result in data loss.',
        impact: 'HIGH',
        action: 'Add additional nodes for redundancy',
        priority: 2
      });
    }

    // Check data node count
    const dataNodeCount = nodeAnalysis.filter(n => n.isData).length;
    if (dataNodeCount < 2) {
      recommendations.push({
        type: 'WARNING',
        category: 'CLUSTER_STABILITY',
        title: 'Insufficient Data Nodes',
        description: `Only ${dataNodeCount} data node(s) available. Add more data nodes for better performance and redundancy.`,
        impact: 'MEDIUM',
        action: 'Add additional data nodes',
        priority: 3
      });
    }
  }

  // Analyze resource recommendations
  analyzeResourceRecommendations(allocationAnalysis, nodeAnalysis, recommendations) {
    // Check for nodes approaching disk watermarks
    allocationAnalysis.nodeAllocations.forEach(allocation => {
      const diskPercent = allocation.diskPercent;
      
      if (diskPercent > 95) {
        recommendations.push({
          type: 'CRITICAL',
          category: 'STORAGE',
          title: `Node ${allocation.node} Exceeds High Watermark`,
          description: `Node ${allocation.node} is using ${diskPercent}% disk space, exceeding the high watermark (95%). New shards cannot be allocated to this node.`,
          impact: 'CRITICAL',
          action: 'Immediately free up disk space or add storage',
          priority: 1
        });
      } else if (diskPercent > 85) {
        recommendations.push({
          type: 'WARNING',
          category: 'STORAGE',
          title: `Node ${allocation.node} Approaching High Watermark`,
          description: `Node ${allocation.node} is using ${diskPercent}% disk space, approaching the high watermark (95%).`,
          impact: 'MEDIUM',
          action: 'Plan for additional storage or data cleanup',
          priority: 2
        });
      }
    });
  }

  // Generate executive summary
  generateExecutiveSummary(recommendations, nodeAnalysis, clusterHealth) {
    const critical = recommendations.filter(r => r.type === 'CRITICAL').length;
    const warnings = recommendations.filter(r => r.type === 'WARNING').length;
    const dataNodes = nodeAnalysis.filter(n => n.isData).length;
    const masterNodes = nodeAnalysis.filter(n => n.isMaster).length;
    
    const avgHeapUsage = nodeAnalysis.reduce((sum, n) => sum + n.heapUsedPercent, 0) / nodeAnalysis.length;
    const avgDiskUsage = nodeAnalysis.reduce((sum, n) => sum + n.diskUsage, 0) / nodeAnalysis.length;
    const avgCpuUsage = nodeAnalysis.reduce((sum, n) => sum + n.cpuUsage, 0) / nodeAnalysis.length;

    return {
      overallHealth: clusterHealth.status,
      totalNodes: nodeAnalysis.length,
      dataNodes,
      masterNodes,
      criticalIssues: critical,
      warnings,
      avgHeapUsage: avgHeapUsage.toFixed(1),
      avgDiskUsage: avgDiskUsage.toFixed(1),
      avgCpuUsage: avgCpuUsage.toFixed(1),
      topPriority: recommendations.filter(r => r.priority === 1).slice(0, 3)
    };
  }

  // Utility methods
  parseSize(sizeStr) {
    if (!sizeStr || sizeStr === '-') return 0;
    const units = { 'kb': 1024, 'mb': 1024**2, 'gb': 1024**3, 'tb': 1024**4 };
    const match = sizeStr.toLowerCase().match(/^(\d+\.?\d*)\s*([kmgt]?b)$/);
    if (!match) return 0;
    const [, size, unit] = match;
    return parseFloat(size) * (units[unit] || 1);
  }

  analyzeShardDistribution(catShards) {
    const distribution = {};
    catShards.forEach(shard => {
      if (shard.node && shard.node !== 'UNASSIGNED') {
        distribution[shard.node] = (distribution[shard.node] || 0) + 1;
      }
    });
    return distribution;
  }

  getIndexShardCounts(catShards) {
    const indexCounts = {};
    catShards.forEach(shard => {
      if (shard.index) {
        indexCounts[shard.index] = (indexCounts[shard.index] || 0) + 1;
      }
    });
    return indexCounts;
  }

  // Legacy wrapper for backward compatibility
  async generateRecommendations() {
    return await this.generateEnhancedRecommendations();
  }
  async getDetailedNodeMetrics() {
    const analysis = await this.getComprehensiveNodeAnalysis();
    return analysis.map(node => ({
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      cpuUsage: node.cpuUsage,
      memoryUsage: node.memoryUsage,
      heapUsage: node.heapUsed,
      heapMax: node.heapMax,
      diskUsage: node.diskUsage,
      loadAverage: { '1m': node.loadAverage1m },
      openFileDescriptors: node.openFileDescriptors,
      timestamp: node.timestamp
    }));
  }

  async getIndexMetrics() {
    const indicesStats = await this.getIndicesStats();
    const metrics = [];

    for (const [indexName, indexData] of Object.entries(indicesStats.indices || {})) {
      const primaries = indexData.primaries || {};
      const total = indexData.total || {};

      metrics.push({
        indexName: indexName,
        sizeBytes: primaries.store ? primaries.store.size_in_bytes : 0,
        docsCount: primaries.docs ? primaries.docs.count : 0,
        searchRate: total.search ? total.search.query_total : 0,
        indexingRate: total.indexing ? total.indexing.index_total : 0,
        memoryUsage: total.segments ? total.segments.memory_in_bytes : 0,
        timestamp: new Date()
      });
    }

    return metrics;
  }

  async testConnection() {
    try {
      const health = await this.getClusterHealth();
      return {
        success: true,
        clusterName: health.cluster_name,
        status: health.status,
        message: 'Connection successful'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  async getProblematicNodes(cpuThreshold = 80, memoryThreshold = 85) {
    const metrics = await this.getComprehensiveNodeAnalysis();
    return metrics.filter(node => 
      node.cpuUsage > cpuThreshold || node.memoryUsage > memoryThreshold
    );
  }

  async getLargestIndices(limit = 10) {
    const metrics = await this.getIndexMetrics();
    return metrics
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, limit);
  }

  async getMostActiveIndices(limit = 10) {
    const metrics = await this.getIndexMetrics();
    return metrics
      .map(index => ({
        ...index,
        totalActivity: index.searchRate + index.indexingRate
      }))
      .sort((a, b) => b.totalActivity - a.totalActivity)
      .slice(0, limit);
  }
}

module.exports = ElasticsearchService;
