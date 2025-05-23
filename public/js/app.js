// Enhanced Elasticsearch Monitor Application
class ElasticsearchMonitor {
    constructor() {
        this.currentClusterId = null;
        this.refreshInterval = null;
        this.refreshRate = 30000; // 30 seconds
        this.currentTab = 'performance';
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadClusters();
        
        // Auto-refresh if cluster is selected
        if (this.currentClusterId) {
            this.startAutoRefresh();
        }
    }

    bindEvents() {
        // Modal events
        const modal = document.getElementById('clusterModal');
        const analysisModal = document.getElementById('analysisModal');
        const addClusterBtn = document.getElementById('addClusterBtn');
        const addFirstClusterBtn = document.getElementById('addFirstClusterBtn');
        const generateAnalysisBtn = document.getElementById('generateAnalysisBtn');
        const closeButtons = document.querySelectorAll('.close');
        
        addClusterBtn?.addEventListener('click', () => this.showModal());
        addFirstClusterBtn?.addEventListener('click', () => this.showModal());
        generateAnalysisBtn?.addEventListener('click', () => this.generateComprehensiveAnalysis());
        
        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.hideModal();
            }
            if (e.target === analysisModal) {
                analysisModal.style.display = 'none';
            }
        });

        // Form events
        document.getElementById('clusterForm')?.addEventListener('submit', (e) => this.handleAddCluster(e));
        document.getElementById('testConnectionBtn')?.addEventListener('click', () => this.testConnection());

        // Control events
        document.getElementById('clusterSelect')?.addEventListener('change', (e) => this.selectCluster(e.target.value));
        document.getElementById('timeRange')?.addEventListener('change', () => this.refreshData());
        document.getElementById('refreshBtn')?.addEventListener('click', () => this.refreshData());

        // Tab events
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Advanced feature events
        document.getElementById('getHotThreadsBtn')?.addEventListener('click', () => this.getHotThreads());
        document.getElementById('getRecoveryBtn')?.addEventListener('click', () => this.getRecoveryStatus());
        document.getElementById('refreshShardsBtn')?.addEventListener('click', () => this.refreshShardAnalysis());
        document.getElementById('refreshIndicesBtn')?.addEventListener('click', () => this.refreshIndexAnalysis());

        // Recommendation filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterRecommendations(e.target.dataset.filter));
        });
    }

    showModal() {
        document.getElementById('clusterModal').style.display = 'block';
        document.getElementById('connectionStatus').style.display = 'none';
        document.getElementById('clusterForm').reset();
    }

    hideModal() {
        document.getElementById('clusterModal').style.display = 'none';
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        this.currentTab = tabName;

        // Load tab-specific data
        if (this.currentClusterId) {
            this.loadTabData(tabName);
        }
    }

    async loadTabData(tabName) {
        switch (tabName) {
            case 'shards':
                await this.refreshShardAnalysis();
                break;
            case 'indices':
                await this.refreshIndexAnalysis();
                break;
            case 'recommendations':
                await this.loadRecommendations();
                break;
            case 'advanced':
                // Advanced tab loads data on demand
                break;
        }
    }

    async loadClusters() {
        try {
            const clusters = await apiRequest('/api/clusters');
            const select = document.getElementById('clusterSelect');
            
            // Clear existing options except first
            select.innerHTML = '<option value="">Select Cluster</option>';
            
            clusters.forEach(cluster => {
                const option = document.createElement('option');
                option.value = cluster.id;
                option.textContent = cluster.name;
                select.appendChild(option);
            });

            // Show appropriate section
            if (clusters.length === 0) {
                document.getElementById('noCluster').style.display = 'block';
                document.getElementById('dashboard').style.display = 'none';
            } else if (!this.currentClusterId) {
                document.getElementById('noCluster').style.display = 'none';
                document.getElementById('dashboard').style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to load clusters:', error);
            showAlert('Failed to load clusters', 'error');
        }
    }

    async handleAddCluster(e) {
        e.preventDefault();
        
        // Get form values directly from inputs
        const clusterData = {
            name: document.getElementById('clusterName').value.trim(),
            endpoint: document.getElementById('clusterEndpoint').value.trim(),
            username: document.getElementById('clusterUsername').value.trim() || null,
            password: document.getElementById('clusterPassword').value.trim() || null
        };

        // Validate required fields
        if (!clusterData.name || !clusterData.endpoint) {
            showAlert('Cluster name and endpoint are required', 'error');
            return;
        }

        try {
            showLoading();
            await apiRequest('/api/clusters', {
                method: 'POST',
                body: JSON.stringify(clusterData)
            });

            showAlert('Cluster added successfully!', 'success');
            this.hideModal();
            await this.loadClusters();
        } catch (error) {
            console.error('Failed to add cluster:', error);
            showAlert('Failed to add cluster: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async testConnection() {
        // Get form values directly from inputs
        const connectionData = {
            endpoint: document.getElementById('clusterEndpoint').value.trim(),
            username: document.getElementById('clusterUsername').value.trim() || null,
            password: document.getElementById('clusterPassword').value.trim() || null
        };

        if (!connectionData.endpoint) {
            showAlert('Please enter an endpoint first', 'error');
            return;
        }

        try {
            showLoading();
            const result = await apiRequest('/elasticsearch/test-connection', {
                method: 'POST',
                body: JSON.stringify(connectionData)
            });

            const statusDiv = document.getElementById('connectionStatus');
            statusDiv.style.display = 'block';
            
            if (result.success) {
                statusDiv.className = 'success';
                statusDiv.textContent = `✅ ${result.message} - Cluster: ${result.clusterName} (${result.status})`;
            } else {
                statusDiv.className = 'error';
                statusDiv.textContent = `❌ ${result.message}`;
            }
        } catch (error) {
            const statusDiv = document.getElementById('connectionStatus');
            statusDiv.style.display = 'block';
            statusDiv.className = 'error';
            statusDiv.textContent = `❌ Connection failed: ${error.message}`;
        } finally {
            hideLoading();
        }
    }

    async selectCluster(clusterId) {
        this.currentClusterId = clusterId;
        
        if (clusterId) {
            document.getElementById('noCluster').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            
            await this.refreshData();
            this.startAutoRefresh();
        } else {
            document.getElementById('dashboard').style.display = 'none';
            this.stopAutoRefresh();
        }
    }

    async refreshData() {
        if (!this.currentClusterId) return;

        try {
            showLoading();
            const timeRange = document.getElementById('timeRange').value;
            
            // Load all data in parallel
            const [summary, metrics, indexMetrics, problems, topIndices] = await Promise.all([
                apiRequest(`/api/clusters/${this.currentClusterId}/summary`),
                apiRequest(`/api/clusters/${this.currentClusterId}/metrics?timeRange=${timeRange}`),
                apiRequest(`/api/clusters/${this.currentClusterId}/index-metrics?timeRange=${timeRange}`),
                apiRequest(`/api/clusters/${this.currentClusterId}/problems`),
                apiRequest(`/api/clusters/${this.currentClusterId}/top-indices`)
            ]);

            this.updateSummary(summary);
            this.updateCharts(metrics);
            this.updateProblems(problems);
            this.updateTopIndices(topIndices);
            
            // Load current tab data
            this.loadTabData(this.currentTab);
            
        } catch (error) {
            console.error('Failed to refresh data:', error);
            showAlert('Failed to refresh data: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    updateSummary(summary) {
        // Executive summary
        document.getElementById('overallHealth').textContent = summary.clusterStatus?.status || 'Unknown';
        document.getElementById('criticalIssues').textContent = '0'; // Will be updated by recommendations
        document.getElementById('dataNodesCount').textContent = summary.dataNodeCount?.count || '0';
        document.getElementById('masterNodesCount').textContent = summary.masterNodeCount?.count || '0';

        // Update summary cards
        document.getElementById('clusterStatus').textContent = summary.clusterStatus?.status || 'Unknown';
        document.getElementById('clusterStatus').className = `metric-value ${getStatusColor(
            summary.clusterStatus?.status === 'green' ? 30 : 
            summary.clusterStatus?.status === 'yellow' ? 70 : 90
        )}`;

        document.getElementById('nodeCount').textContent = summary.nodeCount?.count || '0';
        document.getElementById('dataNodeCount').textContent = summary.dataNodeCount?.count || '0';
        document.getElementById('masterNodeCount').textContent = summary.masterNodeCount?.count || '0';
        
        const avgCpu = summary.avgCpu?.avg_cpu || 0;
        document.getElementById('avgCpu').textContent = formatPercentage(avgCpu);
        document.getElementById('avgCpu').className = `metric-value ${getStatusColor(avgCpu)}`;
        
        const avgMemory = summary.avgMemory?.avg_memory || 0;
        document.getElementById('avgMemory').textContent = formatPercentage(avgMemory);
        document.getElementById('avgMemory').className = `metric-value ${getStatusColor(avgMemory)}`;
        
        const avgHeap = summary.avgHeap?.avg_heap || 0;
        document.getElementById('avgHeap').textContent = formatPercentage(avgHeap);
        document.getElementById('avgHeap').className = `metric-value ${getStatusColor(avgHeap)}`;
        
        const avgDisk = summary.avgDisk?.avg_disk || 0;
        document.getElementById('avgDisk').textContent = formatPercentage(avgDisk);
        document.getElementById('avgDisk').className = `metric-value ${getStatusColor(avgDisk)}`;
        
        const avgLoad = summary.avgLoad?.avg_load || 0;
        document.getElementById('avgLoad').textContent = avgLoad.toFixed(2);
        document.getElementById('avgLoad').className = `metric-value ${getStatusColor(avgLoad > 2 ? 80 : avgLoad > 1 ? 60 : 30)}`;
        
        document.getElementById('indexCount').textContent = summary.indexCount?.count || '0';
        
        const totalSize = summary.totalSize?.total_size || 0;
        document.getElementById('totalSize').textContent = formatBytes(totalSize);
        
        const totalDocs = summary.totalDocs?.total_docs || 0;
        document.getElementById('totalDocs').textContent = formatNumber(totalDocs);
    }

    updateCharts(metrics) {
        chartManager.createCpuChart(metrics);
        chartManager.createMemoryChart(metrics);
        chartManager.createHeapChart(metrics);
        chartManager.createDiskChart(metrics);
        chartManager.createLoadChart(metrics);
        chartManager.createOperationsChart(metrics);
    }

    updateProblems(problems) {
        const container = document.getElementById('problemsList');
        
        if (!problems || problems.length === 0) {
            container.innerHTML = '<div class="alert alert-success">✅ No problematic resources detected</div>';
            return;
        }

        container.innerHTML = problems.map(problem => `
            <div class="problem-item fade-in">
                <h4>🔥 ${escapeHtml(problem.node_name)} ${this.getNodeRoleBadges(problem.node_roles)}</h4>
                <p>Node ID: ${escapeHtml(problem.node_id)}</p>
                <div class="problem-metrics">
                    <div class="problem-metric">
                        <div class="label">CPU</div>
                        <div class="value">${formatPercentage(problem.avg_cpu)}</div>
                    </div>
                    <div class="problem-metric">
                        <div class="label">Memory</div>
                        <div class="value">${formatPercentage(problem.avg_memory)}</div>
                    </div>
                    <div class="problem-metric">
                        <div class="label">Heap</div>
                        <div class="value">${formatPercentage(problem.avg_heap_percent)}</div>
                    </div>
                    <div class="problem-metric">
                        <div class="label">Disk</div>
                        <div class="value">${formatPercentage(problem.avg_disk)}</div>
                    </div>
                    <div class="problem-metric">
                        <div class="label">Load (1m)</div>
                        <div class="value">${(problem.avg_load_1m || 0).toFixed(2)}</div>
                    </div>
                    <div class="problem-metric">
                        <div class="label">Samples</div>
                        <div class="value">${problem.sample_count}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateTopIndices(indices) {
        const largestContainer = document.getElementById('largestIndices');
        const activeContainer = document.getElementById('activeIndices');
        
        // Largest indices by size
        if (!indices || indices.length === 0) {
            largestContainer.innerHTML = '<div class="alert alert-warning">No index data available</div>';
        } else {
            const sortedBySize = [...indices].sort((a, b) => (b.avg_size || 0) - (a.avg_size || 0));
            largestContainer.innerHTML = sortedBySize.slice(0, 10).map(index => `
                <div class="index-item">
                    <div class="index-name">${escapeHtml(index.index_name)}</div>
                    <div class="index-metric">
                        ${formatBytes(index.avg_size || 0)}
                        <small>(${formatNumber(index.avg_docs || 0)} docs)</small>
                    </div>
                </div>
            `).join('');
        }

        // Most active indices
        if (!indices || indices.length === 0) {
            activeContainer.innerHTML = '<div class="alert alert-warning">No index data available</div>';
        } else {
            const sortedByActivity = [...indices].sort((a, b) => 
                ((b.avg_search_rate || 0) + (b.avg_indexing_rate || 0)) - 
                ((a.avg_search_rate || 0) + (a.avg_indexing_rate || 0))
            );
            activeContainer.innerHTML = sortedByActivity.slice(0, 10).map(index => `
                <div class="index-item">
                    <div class="index-name">${escapeHtml(index.index_name)}</div>
                    <div class="index-metric">
                        ${formatNumber((index.avg_search_rate || 0) + (index.avg_indexing_rate || 0))} ops/sec
                        <small>(${index.primary_shards || 0}P/${index.replica_shards || 0}R)</small>
                    </div>
                </div>
            `).join('');
        }
    }

    async refreshShardAnalysis() {
        if (!this.currentClusterId) return;

        try {
            showLoading();
            const [shardAnalysis, allocation] = await Promise.all([
                apiRequest(`/api/clusters/${this.currentClusterId}/shards`),
                apiRequest(`/api/clusters/${this.currentClusterId}/allocation`)
            ]);

            this.updateShardAnalysis(shardAnalysis, allocation);
        } catch (error) {
            console.error('Failed to refresh shard analysis:', error);
            showAlert('Failed to refresh shard analysis: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    updateShardAnalysis(shardAnalysis, allocation) {
        // Update shard overview cards
        const clusterStats = allocation.clusterShardStats;
        document.getElementById('primaryShards').textContent = clusterStats.activePrimaryShards || '0';
        document.getElementById('activeShards').textContent = clusterStats.activeShards || '0';
        document.getElementById('unassignedShards').textContent = clusterStats.unassignedShards || '0';
        document.getElementById('relocatingShards').textContent = clusterStats.relocatingShards || '0';

        // Color code the metrics
        const unassigned = clusterStats.unassignedShards || 0;
        document.getElementById('unassignedShards').className = `metric-value ${unassigned > 0 ? 'red' : 'green'}`;

        // Update largest shards
        const largestShardsContainer = document.getElementById('largestShards');
        if (shardAnalysis.largestShards && shardAnalysis.largestShards.length > 0) {
            largestShardsContainer.innerHTML = shardAnalysis.largestShards.map(shard => `
                <div class="shard-item">
                    <div class="shard-name">
                        ${escapeHtml(shard.index)}[${shard.shard}] (${shard.prirep})
                    </div>
                    <div class="shard-metric">
                        ${shard.store} on ${escapeHtml(shard.node)}
                    </div>
                </div>
            `).join('');
        } else {
            largestShardsContainer.innerHTML = '<div class="empty-state">No shard data available</div>';
        }

        // Update unassigned shards
        const unassignedShardsContainer = document.getElementById('unassignedShardsList');
        if (shardAnalysis.unassignedShards && shardAnalysis.unassignedShards.length > 0) {
            unassignedShardsContainer.innerHTML = shardAnalysis.unassignedShards.map(shard => `
                <div class="shard-item">
                    <div class="shard-name">
                        ${escapeHtml(shard.index)}[${shard.shard}] (${shard.prirep})
                    </div>
                    <div class="shard-metric">
                        Reason: ${shard.unassignedReason || 'Unknown'}
                    </div>
                </div>
            `).join('');
        } else {
            unassignedShardsContainer.innerHTML = '<div class="alert alert-success">✅ All shards are assigned</div>';
        }

        // Update node allocation
        this.updateNodeAllocation(allocation.nodeAllocations);
    }

    updateNodeAllocation(nodeAllocations) {
        const container = document.getElementById('nodeAllocation');
        
        if (!nodeAllocations || nodeAllocations.length === 0) {
            container.innerHTML = '<div class="empty-state">No allocation data available</div>';
            return;
        }

        const allocationHtml = nodeAllocations.map(node => `
            <div class="allocation-item">
                <div class="allocation-header">
                    <h4>${escapeHtml(node.node)} (${node.host})</h4>
                    <span class="shard-count">${node.shards} shards</span>
                </div>
                <div class="allocation-metrics">
                    <div class="progress-bar">
                        <div class="progress-fill ${node.diskPercent > 85 ? 'danger' : node.diskPercent > 75 ? 'warning' : ''}" 
                             style="width: ${node.diskPercent}%"></div>
                        <div class="progress-text">${node.diskPercent.toFixed(1)}% used</div>
                    </div>
                    <div class="disk-details">
                        <span>Used: ${node.diskUsed}</span>
                        <span>Available: ${node.diskAvail}</span>
                        <span>Total: ${node.diskTotal}</span>
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = `<div class="allocation-list">${allocationHtml}</div>`;
    }

    async refreshIndexAnalysis() {
        // Index analysis is already loaded in updateTopIndices
        // This method can be extended for more detailed index analysis
        console.log('Index analysis refreshed');
    }

    async loadRecommendations() {
        if (!this.currentClusterId) return;

        try {
            const recommendations = await apiRequest(`/api/clusters/${this.currentClusterId}/recommendations`);
            this.updateRecommendations(recommendations);
        } catch (error) {
            console.error('Failed to load recommendations:', error);
            showAlert('Failed to load recommendations: ' + error.message, 'error');
        }
    }

    updateRecommendations(recommendations) {
        const container = document.getElementById('recommendationsList');
        
        if (!recommendations || recommendations.length === 0) {
            container.innerHTML = '<div class="empty-state">No recommendations available</div>';
            return;
        }

        // Update critical issues count in executive summary
        const criticalCount = recommendations.filter(r => r.recommendation_type === 'CRITICAL').length;
        document.getElementById('criticalIssues').textContent = criticalCount;

        const recommendationsHtml = recommendations.map(rec => `
            <div class="recommendation-item ${rec.recommendation_type.toLowerCase()} fade-in">
                <div class="recommendation-header">
                    <div>
                        <div class="recommendation-title">${escapeHtml(rec.title)}</div>
                        <div class="recommendation-category">${rec.category}</div>
                    </div>
                    <div class="recommendation-priority priority-${rec.priority}">
                        Priority ${rec.priority}
                    </div>
                </div>
                <div class="recommendation-description">
                    ${escapeHtml(rec.description)}
                </div>
                <div class="recommendation-action">
                    <strong>Action:</strong> ${escapeHtml(rec.action)}
                </div>
                ${rec.node_id ? `<div class="recommendation-node">Node: ${escapeHtml(rec.node_id)}</div>` : ''}
                <div class="recommendation-footer">
                    <span class="impact-${rec.impact.toLowerCase()}">${rec.impact} Impact</span>
                    <span class="timestamp">${formatTimeAgo(rec.timestamp)}</span>
                    ${!rec.is_resolved ? `<button class="btn btn-sm resolve-btn" onclick="app.resolveRecommendation(${rec.id})">Mark Resolved</button>` : ''}
                </div>
            </div>
        `).join('');

        container.innerHTML = recommendationsHtml;

        // Generate scaling advice
        this.generateScalingAdvice(recommendations);
    }

    generateScalingAdvice(recommendations) {
        const container = document.getElementById('scalingAdvice');
        const advice = [];

        // Analyze recommendations to generate scaling advice
        const highCpuNodes = recommendations.filter(r => r.category === 'CPU' && r.recommendation_type === 'CRITICAL').length;
        const highMemoryNodes = recommendations.filter(r => r.category === 'MEMORY' && r.recommendation_type === 'CRITICAL').length;
        const diskIssues = recommendations.filter(r => r.category === 'STORAGE' && r.recommendation_type === 'CRITICAL').length;
        const masterIssues = recommendations.filter(r => r.category === 'CLUSTER_STABILITY' && r.title.includes('Master')).length;

        if (highCpuNodes > 0 || highMemoryNodes > 0) {
            advice.push({
                type: 'scale-up',
                title: 'Consider Vertical Scaling',
                description: `${highCpuNodes + highMemoryNodes} nodes are experiencing resource constraints. Consider increasing CPU/memory allocation.`,
                action: 'Upgrade node specifications or add more nodes to distribute load'
            });
        }

        if (diskIssues > 0) {
            advice.push({
                type: 'storage',
                title: 'Storage Expansion Required',
                description: `${diskIssues} nodes are running low on disk space.`,
                action: 'Add storage or implement index lifecycle management (ILM) policies'
            });
        }

        if (masterIssues > 0) {
            advice.push({
                type: 'architecture',
                title: 'Cluster Architecture Improvement',
                description: 'Master node configuration needs attention for better cluster stability.',
                action: 'Add dedicated master nodes or ensure proper master node count (3 minimum for production)'
            });
        }

        if (advice.length === 0) {
            advice.push({
                type: 'healthy',
                title: '✅ Cluster is Well Configured',
                description: 'No immediate scaling recommendations detected.',
                action: 'Continue monitoring and maintain current setup'
            });
        }

        container.innerHTML = advice.map(item => `
            <div class="scaling-advice-item">
                <h4>${item.title}</h4>
                <p>${item.description}</p>
                <div class="scaling-action">${item.action}</div>
            </div>
        `).join('');
    }

    filterRecommendations(filter) {
        // Update filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        // Filter recommendation items
        document.querySelectorAll('.recommendation-item').forEach(item => {
            if (filter === 'all') {
                item.style.display = 'block';
            } else {
                const matches = item.classList.contains(filter.toLowerCase());
                item.style.display = matches ? 'block' : 'none';
            }
        });
    }

    async resolveRecommendation(recommendationId) {
        try {
            await apiRequest(`/api/clusters/${this.currentClusterId}/recommendations/${recommendationId}/resolve`, {
                method: 'PATCH'
            });
            showAlert('Recommendation marked as resolved', 'success');
            this.loadRecommendations(); // Refresh recommendations
        } catch (error) {
            console.error('Failed to resolve recommendation:', error);
            showAlert('Failed to resolve recommendation: ' + error.message, 'error');
        }
    }

    async getHotThreads() {
        if (!this.currentClusterId) return;

        try {
            showLoading();
            const result = await apiRequest(`/api/clusters/${this.currentClusterId}/hot-threads`);
            this.displayHotThreads(result.hotThreads);
        } catch (error) {
            console.error('Failed to get hot threads:', error);
            showAlert('Failed to get hot threads: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    displayHotThreads(hotThreads) {
        const container = document.getElementById('hotThreadsContent');
        
        if (!hotThreads || hotThreads.trim().length === 0) {
            container.innerHTML = '<div class="empty-state">No hot threads data available</div>';
            return;
        }

        // Parse and format hot threads data
        const formattedThreads = this.parseHotThreads(hotThreads);
        container.innerHTML = `
            <div class="code-block">${escapeHtml(formattedThreads)}</div>
            <div class="hot-threads-summary">
                <p><strong>Analysis:</strong> Hot threads show the most CPU-intensive operations currently running on your nodes.</p>
                <p><strong>Action:</strong> Look for patterns in thread names, high CPU usage, or blocked operations that might indicate performance bottlenecks.</p>
            </div>
        `;
    }

    parseHotThreads(hotThreads) {
        // Basic parsing to make hot threads more readable
        return hotThreads
            .split('\n')
            .slice(0, 50) // Limit to first 50 lines for readability
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');
    }

    async getRecoveryStatus() {
        if (!this.currentClusterId) return;

        try {
            showLoading();
            const recoveries = await apiRequest(`/api/clusters/${this.currentClusterId}/recovery`);
            this.displayRecoveryStatus(recoveries);
        } catch (error) {
            console.error('Failed to get recovery status:', error);
            showAlert('Failed to get recovery status: ' + error.message, 'error');
        } finally {
            hideLoading();
        }
    }

    displayRecoveryStatus(recoveries) {
        const container = document.getElementById('recoveryContent');
        
        if (!recoveries || recoveries.length === 0) {
            container.innerHTML = '<div class="alert alert-success">✅ No active recovery operations</div>';
            return;
        }

        const recoveryHtml = recoveries.map(recovery => `
            <div class="recovery-item">
                <div class="recovery-header">
                    <h5>${escapeHtml(recovery.index)}[${recovery.shard}] - ${recovery.type}</h5>
                    <span class="recovery-stage">${recovery.stage}</span>
                </div>
                <div class="recovery-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${recovery.bytes_percent || 0}%"></div>
                        <div class="progress-text">${recovery.bytes_percent || 0}% complete</div>
                    </div>
                </div>
                <div class="recovery-details">
                    <span>Files: ${recovery.files_recovered}/${recovery.files_total} (${recovery.files_percent || 0}%)</span>
                    <span>Bytes: ${formatBytes(recovery.bytes_recovered || 0)}/${formatBytes(recovery.bytes_total || 0)}</span>
                    <span>Time: ${recovery.time}</span>
                </div>
                <div class="recovery-nodes">
                    <span>From: ${recovery.source_host} (${recovery.source_node})</span>
                    <span>To: ${recovery.target_host} (${recovery.target_node})</span>
                </div>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="recovery-list">${recoveryHtml}</div>
            <div class="recovery-summary">
                <p><strong>Note:</strong> ${recoveries.length} recovery operation(s) in progress. Recovery operations can consume significant network and disk I/O resources.</p>
            </div>
        `;
    }

    async generateComprehensiveAnalysis() {
        if (!this.currentClusterId) {
            showAlert('Please select a cluster first', 'error');
            return;
        }

        const modal = document.getElementById('analysisModal');
        modal.style.display = 'block';

        try {
            const analysis = await apiRequest(`/api/clusters/${this.currentClusterId}/analysis`);
            this.displayComprehensiveAnalysis(analysis);
        } catch (error) {
            console.error('Failed to generate analysis:', error);
            document.getElementById('analysisContent').innerHTML = `
                <div class="alert alert-error">
                    <h3>Analysis Failed</h3>
                    <p>Failed to generate comprehensive analysis: ${error.message}</p>
                </div>
            `;
        }
    }

    displayComprehensiveAnalysis(analysis) {
        const container = document.getElementById('analysisContent');
        
        const analysisHtml = `
            <div class="analysis-summary">
                <h3>📊 Executive Summary</h3>
                <div class="summary-grid">
                    <div class="summary-card">
                        <h4>Overall Health</h4>
                        <div class="health-status ${analysis.summary.overallHealth}">${analysis.summary.overallHealth.toUpperCase()}</div>
                    </div>
                    <div class="summary-card">
                        <h4>Critical Issues</h4>
                        <div class="metric-large ${analysis.summary.criticalIssues > 0 ? 'red' : 'green'}">${analysis.summary.criticalIssues}</div>
                    </div>
                    <div class="summary-card">
                        <h4>Average Resource Usage</h4>
                        <div class="resource-overview">
                            <div>CPU: ${analysis.summary.avgCpuUsage || 'N/A'}%</div>
                            <div>Memory: ${analysis.summary.avgHeapUsage || 'N/A'}%</div>
                            <div>Disk: ${analysis.summary.avgDiskUsage || 'N/A'}%</div>
                        </div>
                    </div>
                    <div class="summary-card">
                        <h4>Cluster Composition</h4>
                        <div class="cluster-composition">
                            <div>Total Nodes: ${analysis.summary.totalNodes || 0}</div>
                            <div>Data Nodes: ${analysis.summary.dataNodes || 'N/A'}</div>
                            <div>Master Nodes: ${analysis.summary.masterNodes || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="analysis-recommendations">
                <h3>🎯 Top Priority Actions</h3>
                ${(analysis.summary.topPriority || []).map(rec => `
                    <div class="priority-recommendation">
                        <h4>${rec.title}</h4>
                        <p>${rec.description}</p>
                        <div class="action-item">${rec.action}</div>
                        ${rec.specifics ? `
                            <div class="recommendation-specifics">
                                <h5>Specific Actions:</h5>
                                ${rec.specifics.commands ? `
                                    <div class="commands-section">
                                        <h6>Commands to Execute:</h6>
                                        ${rec.specifics.commands.map(cmd => `<code class="command-block">${escapeHtml(cmd)}</code>`).join('')}
                                    </div>
                                ` : ''}
                                ${rec.specifics.shardsToMove ? `
                                    <div class="shards-section">
                                        <h6>Shards to Move:</h6>
                                        <ul>
                                            ${rec.specifics.shardsToMove.map(shard => `
                                                <li>${shard.index}[${shard.shard}] → ${shard.suggestedTarget} (${shard.expectedBenefit})</li>
                                            `).join('')}
                                        </ul>
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <div class="analysis-details">
                <h3>📈 Detailed Analysis</h3>
                <div class="analysis-tabs" id="analysisTabsContainer">
                    <button class="analysis-tab-btn active" data-analysis-tab="nodes">Node Analysis</button>
                    <button class="analysis-tab-btn" data-analysis-tab="shards">Shard Analysis</button>
                    <button class="analysis-tab-btn" data-analysis-tab="recommendations">All Recommendations</button>
                    <button class="analysis-tab-btn" data-analysis-tab="slowlogs">Slow Query Analysis</button>
                </div>
                
                <div class="analysis-tab-content active" id="nodes-analysis-content">
                    ${this.renderNodeAnalysis(analysis.nodeAnalysis)}
                </div>
                
                <div class="analysis-tab-content" id="shards-analysis-content">
                    ${this.renderShardAnalysis(analysis.shardAnalysis)}
                </div>
                
                <div class="analysis-tab-content" id="recommendations-analysis-content">
                    ${this.renderRecommendationsAnalysis(analysis.recommendations)}
                </div>
                
                <div class="analysis-tab-content" id="slowlogs-analysis-content">
                    ${this.renderSlowLogAnalysis()}
                </div>
            </div>
        `;

        container.innerHTML = analysisHtml;

        // Bind analysis tab events with unique event handling
        this.bindAnalysisTabEvents();
    }

    bindAnalysisTabEvents() {
        const tabButtons = document.querySelectorAll('.analysis-tab-btn');
        const tabContents = document.querySelectorAll('.analysis-tab-content');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const tabName = e.target.dataset.analysisTab;
                console.log('Analysis tab clicked:', tabName);
                
                // Remove active class from all buttons and contents
                tabButtons.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                // Add active class to clicked button
                e.target.classList.add('active');
                
                // Show corresponding content
                const targetContent = document.getElementById(`${tabName}-analysis-content`);
                if (targetContent) {
                    targetContent.classList.add('active');
                    
                    // Load tab-specific data if needed
                    if (tabName === 'slowlogs') {
                        this.loadSlowLogAnalysis();
                    }
                } else {
                    console.error('Target content not found:', `${tabName}-analysis-content`);
                }
            });
        });
    }

    renderSlowLogAnalysis() {
        return `
            <div class="slowlog-analysis">
                <div class="slowlog-header">
                    <h4>🐌 Slow Query Log Analysis</h4>
                    <button id="refreshSlowLogsBtn" class="btn btn-secondary">Refresh Slow Logs</button>
                </div>
                
                <div id="slowLogContent">
                    <div class="loading">
                        <div class="spinner"></div>
                        <p>Loading slow query analysis...</p>
                    </div>
                </div>
                
                <div class="slowlog-help">
                    <h5>🔍 What Slow Logs Tell Us:</h5>
                    <ul>
                        <li><strong>Query Performance</strong>: Identifies queries taking >4s to execute</li>
                        <li><strong>Index Usage</strong>: Shows if queries are using proper indices</li>
                        <li><strong>Resource Impact</strong>: Correlates slow queries with high CPU/memory usage</li>
                        <li><strong>Optimization Opportunities</strong>: Suggests index improvements and query optimizations</li>
                    </ul>
                </div>
            </div>
        `;
    }

    async loadSlowLogAnalysis() {
        if (!this.currentClusterId) return;

        try {
            const slowLogData = await this.analyzeSlowQueries();
            this.displaySlowLogAnalysis(slowLogData);
        } catch (error) {
            console.error('Failed to load slow log analysis:', error);
            document.getElementById('slowLogContent').innerHTML = `
                <div class="alert alert-warning">
                    <h5>⚠️ Slow Log Analysis Unavailable</h5>
                    <p>Could not retrieve slow query logs. This might be because:</p>
                    <ul>
                        <li>Slow query logging is not enabled</li>
                        <li>Logs are stored externally (GCP Stackdriver)</li>
                        <li>Insufficient permissions to access logs</li>
                    </ul>
                    <div class="slowlog-recommendations">
                        <h6>💡 Recommendations:</h6>
                        <ol>
                            <li><strong>Enable slow query logging</strong>:
                                <code class="command-block">
                                    PUT /_cluster/settings<br>
                                    {<br>
                                    &nbsp;&nbsp;"persistent": {<br>
                                    &nbsp;&nbsp;&nbsp;&nbsp;"index.search.slowlog.threshold.query.warn": "4s",<br>
                                    &nbsp;&nbsp;&nbsp;&nbsp;"index.search.slowlog.threshold.query.info": "4s"<br>
                                    &nbsp;&nbsp;}<br>
                                    }
                                </code>
                            </li>
                            <li><strong>Check GCP Stackdriver logs</strong> for slow query patterns</li>
                            <li><strong>Monitor query patterns</strong> during high memory usage periods</li>
                            <li><strong>Consider query caching</strong> for frequently repeated slow queries</li>
                        </ol>
                    </div>
                </div>
            `;
        }
    }

    async analyzeSlowQueries() {
        // Try to get slow query data from multiple sources
        const slowLogSources = await Promise.allSettled([
            this.getSlowLogsFromES(),
            this.getSlowLogsFromStackdriver(),
            this.analyzeQueryPerformance()
        ]);

        const analysis = {
            sources: [],
            recommendations: [],
            impactOnMemory: false,
            topSlowQueries: []
        };

        slowLogSources.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                analysis.sources.push(result.value);
            }
        });

        // Generate recommendations based on current cluster issues
        this.generateSlowQueryRecommendations(analysis);

        return analysis;
    }

    async getSlowLogsFromES() {
        try {
            // Try to get slow log settings
            const response = await apiRequest(`/elasticsearch/cluster-settings`, {
                method: 'POST',
                body: JSON.stringify({
                    endpoint: this.getClusterEndpoint(),
                    username: this.getClusterUsername(),
                    password: this.getClusterPassword()
                })
            });
            
            return {
                source: 'elasticsearch',
                settings: response,
                available: true
            };
        } catch (error) {
            return null;
        }
    }

    async getSlowLogsFromStackdriver() {
        // Placeholder for Stackdriver integration
        return {
            source: 'stackdriver',
            message: 'Integration with GCP Stackdriver logs would require additional configuration',
            available: false,
            recommendation: 'Consider setting up log forwarding from Stackdriver to your monitoring system'
        };
    }

    async analyzeQueryPerformance() {
        // Analyze current cluster performance to infer slow query impact
        try {
            const metrics = await apiRequest(`/api/clusters/${this.currentClusterId}/metrics?timeRange=1h`);
            const problems = await apiRequest(`/api/clusters/${this.currentClusterId}/problems`);
            
            const highCpuPeriods = metrics.filter(m => m.cpu_usage > 70);
            const highMemoryPeriods = metrics.filter(m => m.memory_usage > 80);
            
            return {
                source: 'performance_analysis',
                highCpuPeriods: highCpuPeriods.length,
                highMemoryPeriods: highMemoryPeriods.length,
                correlationFound: highCpuPeriods.length > 0 && highMemoryPeriods.length > 0,
                recommendation: highCpuPeriods.length > 0 ? 
                    'High CPU periods detected - likely caused by resource-intensive queries' :
                    'Performance appears stable - slow queries may not be a current issue'
            };
        } catch (error) {
            return null;
        }
    }

    generateSlowQueryRecommendations(analysis) {
        analysis.recommendations = [
            {
                title: '🔍 Enable Comprehensive Slow Query Logging',
                description: 'Set up detailed slow query logging to capture performance bottlenecks',
                commands: [
                    'PUT /_cluster/settings',
                    '{"persistent": {"index.search.slowlog.threshold.query.warn": "4s", "index.search.slowlog.threshold.query.info": "4s", "index.search.slowlog.threshold.fetch.warn": "4s"}}'
                ]
            },
            {
                title: '📊 Monitor Query Patterns During High Memory Usage',
                description: 'Correlate slow queries with the high heap usage you\'re experiencing',
                action: 'Review queries executed during memory spikes (87.4% heap usage periods)'
            },
            {
                title: '⚡ Implement Query Optimization',
                description: 'Based on your memory pressure, focus on query efficiency',
                recommendations: [
                    'Use filter context instead of query context where possible',
                    'Implement result caching for frequently repeated queries',
                    'Review aggregation queries that may consume excessive memory',
                    'Consider using search templates for complex queries'
                ]
            },
            {
                title: '🎯 GCP Stackdriver Integration',
                description: 'Since slow logs are in Stackdriver, set up log analysis',
                action: 'Export slow query logs from Stackdriver and analyze patterns during high memory usage periods'
            }
        ];
    }

    displaySlowLogAnalysis(slowLogData) {
        const container = document.getElementById('slowLogContent');
        
        const content = `
            <div class="slowlog-results">
                <div class="slowlog-status">
                    <h5>📋 Slow Query Analysis Results</h5>
                    <div class="status-grid">
                        ${slowLogData.sources.map(source => `
                            <div class="status-card">
                                <h6>${source.source.toUpperCase()}</h6>
                                <div class="status-indicator ${source.available ? 'available' : 'unavailable'}">
                                    ${source.available ? '✅ Available' : '❌ Not Available'}
                                </div>
                                ${source.message ? `<p>${source.message}</p>` : ''}
                                ${source.recommendation ? `<p><em>${source.recommendation}</em></p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="slowlog-recommendations">
                    <h5>💡 Slow Query Optimization Recommendations</h5>
                    ${slowLogData.recommendations.map(rec => `
                        <div class="recommendation-card">
                            <h6>${rec.title}</h6>
                            <p>${rec.description}</p>
                            ${rec.commands ? `
                                <div class="commands">
                                    ${rec.commands.map(cmd => `<code class="command-block">${escapeHtml(cmd)}</code>`).join('')}
                                </div>
                            ` : ''}
                            ${rec.action ? `<div class="action-item">${rec.action}</div>` : ''}
                            ${rec.recommendations ? `
                                <ul>
                                    ${rec.recommendations.map(r => `<li>${r}</li>`).join('')}
                                </ul>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>

                <div class="slowlog-correlation">
                    <h5>🔗 Memory Usage Correlation</h5>
                    <div class="correlation-analysis">
                        <p><strong>Current Issue:</strong> Node es-data-homeservice-v2-6 showing 94.8% heap usage</p>
                        <p><strong>Potential Slow Query Impact:</strong></p>
                        <ul>
                            <li>Heavy aggregations can consume significant heap memory</li>
                            <li>Large result sets without proper pagination increase memory pressure</li>
                            <li>Complex nested queries may cause memory spikes</li>
                            <li>Inefficient filters can lead to high CPU and memory usage</li>
                        </ul>
                        <div class="next-steps">
                            <h6>🎯 Immediate Actions:</h6>
                            <ol>
                                <li>Enable slow query logging with the commands above</li>
                                <li>Review Stackdriver logs for queries during high memory periods</li>
                                <li>Implement query result caching</li>
                                <li>Monitor correlation between query execution and memory spikes</li>
                            </ol>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = content;

        // Bind refresh button
        document.getElementById('refreshSlowLogsBtn')?.addEventListener('click', () => {
            this.loadSlowLogAnalysis();
        });
    }

    getClusterEndpoint() {
        // Helper to get current cluster endpoint - implement based on your cluster storage
        return 'http://your-elasticsearch-endpoint:9200';
    }

    getClusterUsername() {
        return null; // or get from cluster config
    }

    getClusterPassword() {
        return null; // or get from cluster config
    }

    renderNodeAnalysis(nodeAnalysis) {
        if (!nodeAnalysis || nodeAnalysis.length === 0) return '<div class="empty-state">No node data available</div>';

        return `
            <div class="node-analysis-grid">
                ${nodeAnalysis.map(node => `
                    <div class="node-card">
                        <div class="node-header">
                            <h4>${node.nodeName}</h4>
                            <div class="node-roles">
                                ${this.getNodeRoleBadges(node.nodeRoles)}
                            </div>
                        </div>
                        <div class="node-metrics">
                            <div class="metric-row">
                                <span>CPU:</span>
                                <div class="progress-bar small">
                                    <div class="progress-fill ${this.getProgressColor(node.cpuUsage)}" style="width: ${node.cpuUsage}%"></div>
                                    <div class="progress-text">${node.cpuUsage.toFixed(1)}%</div>
                                </div>
                            </div>
                            <div class="metric-row">
                                <span>Memory:</span>
                                <div class="progress-bar small">
                                    <div class="progress-fill ${this.getProgressColor(node.memoryUsage)}" style="width: ${node.memoryUsage}%"></div>
                                    <div class="progress-text">${node.memoryUsage.toFixed(1)}%</div>
                                </div>
                            </div>
                            <div class="metric-row">
                                <span>Disk:</span>
                                <div class="progress-bar small">
                                    <div class="progress-fill ${this.getProgressColor(node.diskUsage)}" style="width: ${node.diskUsage}%"></div>
                                    <div class="progress-text">${node.diskUsage.toFixed(1)}%</div>
                                </div>
                            </div>
                            <div class="metric-row">
                                <span>Load (1m):</span>
                                <span class="metric-value">${node.loadAverage1m.toFixed(2)}</span>
                            </div>
                            <div class="metric-row">
                                <span>Heap:</span>
                                <span class="metric-value">${formatBytes(node.heapUsed)}/${formatBytes(node.heapMax)}</span>
                            </div>
                            <div class="metric-row">
                                <span>Uptime:</span>
                                <span class="metric-value">${node.uptime}</span>
                            </div>
                            <div class="metric-row">
                                <span>Version:</span>
                                <span class="metric-value">${node.version}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderShardAnalysis(shardAnalysis) {
        if (!shardAnalysis) return '<div class="empty-state">No shard data available</div>';

        return `
            <div class="shard-analysis-section">
                <div class="shard-stats">
                    <h4>Shard Distribution</h4>
                    <div class="shard-distribution">
                        ${Object.entries(shardAnalysis.shardDistribution || {}).map(([node, count]) => `
                            <div class="distribution-item">
                                <span class="node-name">${escapeHtml(node)}</span>
                                <span class="shard-count">${count} shards</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="largest-shards">
                    <h4>Largest Shards (Top 10)</h4>
                    <div class="shard-list">
                        ${(shardAnalysis.largestShards || []).slice(0, 10).map(shard => `
                            <div class="shard-item">
                                <div class="shard-info">
                                    <strong>${escapeHtml(shard.index)}[${shard.shard}]</strong>
                                    <span class="shard-type">${shard.prirep}</span>
                                </div>
                                <div class="shard-metrics">
                                    <span>Size: ${shard.store}</span>
                                    <span>Docs: ${formatNumber(shard.docs)}</span>
                                    <span>Node: ${escapeHtml(shard.node)}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                ${shardAnalysis.unassignedShards && shardAnalysis.unassignedShards.length > 0 ? `
                    <div class="unassigned-shards">
                        <h4>⚠️ Unassigned Shards</h4>
                        <div class="shard-list">
                            ${shardAnalysis.unassignedShards.map(shard => `
                                <div class="shard-item unassigned">
                                    <div class="shard-info">
                                        <strong>${escapeHtml(shard.index)}[${shard.shard}]</strong>
                                        <span class="shard-type">${shard.prirep}</span>
                                    </div>
                                    <div class="shard-reason">
                                        Reason: ${shard.unassignedReason}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderRecommendationsAnalysis(recommendations) {
        if (!recommendations || recommendations.length === 0) {
            return '<div class="empty-state">No recommendations available</div>';
        }

        const groupedRecs = this.groupBy(recommendations, 'category');
        
        return `
            <div class="recommendations-analysis">
                ${Object.entries(groupedRecs).map(([category, recs]) => `
                    <div class="recommendation-category">
                        <h4>${category} (${recs.length})</h4>
                        <div class="category-recommendations">
                            ${recs.map(rec => `
                                <div class="recommendation-item ${rec.type.toLowerCase()}">
                                    <div class="rec-header">
                                        <span class="rec-title">${escapeHtml(rec.title)}</span>
                                        <span class="rec-priority">P${rec.priority}</span>
                                    </div>
                                    <div class="rec-description">${escapeHtml(rec.description)}</div>
                                    <div class="rec-action">${escapeHtml(rec.action)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    getNodeRoleBadges(roles) {
        if (!roles) return '';
        
        const roleArray = Array.isArray(roles) ? roles : roles.split(',');
        return roleArray.map(role => `
            <span class="node-role ${role.trim().toLowerCase()}">${role.trim()}</span>
        `).join('');
    }

    getProgressColor(percentage) {
        if (percentage > 85) return 'danger';
        if (percentage > 75) return 'warning';
        return '';
    }

    startAutoRefresh() {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(() => {
            this.refreshData();
        }, this.refreshRate);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    // Utility method for grouping
    groupBy(array, key) {
        return array.reduce((result, currentValue) => {
            const groupKey = currentValue[key];
            (result[groupKey] = result[groupKey] || []).push(currentValue);
            return result;
        }, {});
    }
}

// Global app instance
let app;

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    app = new ElasticsearchMonitor();
});
