// Enhanced Chart management
class ChartManager {
    constructor() {
        this.charts = {};
        this.defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 15
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                },
                x: {
                    display: false
                }
            }
        };
    }

    createChart(canvasId, type, data, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        // Destroy existing chart if it exists
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
        }

        const chartOptions = {
            ...this.defaultOptions,
            ...options
        };

        this.charts[canvasId] = new Chart(ctx, {
            type: type,
            data: data,
            options: chartOptions
        });

        return this.charts[canvasId];
    }

    updateChart(canvasId, newData) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].data = newData;
            this.charts[canvasId].update('none');
        }
    }

    destroyChart(canvasId) {
        if (this.charts[canvasId]) {
            this.charts[canvasId].destroy();
            delete this.charts[canvasId];
        }
    }

    destroyAllCharts() {
        Object.keys(this.charts).forEach(chartId => {
            this.destroyChart(chartId);
        });
    }

    // Create CPU usage chart
    createCpuChart(metrics) {
        const nodeData = this.prepareNodeData(metrics, 'cpu_usage');
        
        const data = {
            labels: nodeData.labels,
            datasets: nodeData.datasets.map(dataset => ({
                ...dataset,
                borderColor: getNodeColor(dataset.label),
                backgroundColor: getNodeColor(dataset.label) + '20',
                fill: true,
                tension: 0.4
            }))
        };

        return this.createChart('cpuChart', 'line', data);
    }

    // Create memory usage chart
    createMemoryChart(metrics) {
        const nodeData = this.prepareNodeData(metrics, 'memory_usage');
        
        const data = {
            labels: nodeData.labels,
            datasets: nodeData.datasets.map(dataset => ({
                ...dataset,
                borderColor: getNodeColor(dataset.label),
                backgroundColor: getNodeColor(dataset.label) + '20',
                fill: true,
                tension: 0.4
            }))
        };

        return this.createChart('memoryChart', 'line', data);
    }

    // Create heap usage chart
    createHeapChart(metrics) {
        const nodeData = this.prepareNodeData(metrics, 'heap_used_percent');
        
        const data = {
            labels: nodeData.labels,
            datasets: nodeData.datasets.map(dataset => ({
                ...dataset,
                borderColor: getNodeColor(dataset.label),
                backgroundColor: getNodeColor(dataset.label) + '20',
                fill: true,
                tension: 0.4
            }))
        };

        return this.createChart('heapChart', 'line', data, {
            ...this.defaultOptions,
            scales: {
                ...this.defaultOptions.scales,
                y: {
                    ...this.defaultOptions.scales.y,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + '%';
                        }
                    }
                }
            }
        });
    }

    // Create disk usage chart
    createDiskChart(metrics) {
        const nodeData = this.prepareNodeData(metrics, 'disk_usage');
        
        const data = {
            labels: nodeData.labels,
            datasets: nodeData.datasets.map(dataset => ({
                ...dataset,
                borderColor: getNodeColor(dataset.label),
                backgroundColor: getNodeColor(dataset.label) + '20',
                fill: true,
                tension: 0.4
            }))
        };

        return this.createChart('diskChart', 'line', data);
    }

    // Create load average chart
    createLoadChart(metrics) {
        const nodeData = this.prepareNodeData(metrics, 'load_average_1m');
        
        const data = {
            labels: nodeData.labels,
            datasets: nodeData.datasets.map(dataset => ({
                ...dataset,
                borderColor: getNodeColor(dataset.label),
                backgroundColor: getNodeColor(dataset.label) + '20',
                fill: true,
                tension: 0.4
            }))
        };

        return this.createChart('loadChart', 'line', data, {
            ...this.defaultOptions,
            scales: {
                ...this.defaultOptions.scales,
                y: {
                    beginAtZero: true,
                    max: undefined, // Don't limit load average
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(2);
                        }
                    }
                }
            }
        });
    }

    // Create operations chart (search vs indexing)
    createOperationsChart(metrics) {
        if (!metrics || metrics.length === 0) return null;

        // Aggregate search and indexing rates by timestamp
        const timestamps = [...new Set(metrics.map(m => m.timestamp))].sort();
        const labels = timestamps.map(ts => {
            const date = new Date(ts);
            return date.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
            });
        });

        const searchRates = timestamps.map(timestamp => {
            const metricsAtTime = metrics.filter(m => m.timestamp === timestamp);
            return metricsAtTime.reduce((sum, m) => sum + (m.search_rate || 0), 0);
        });

        const indexingRates = timestamps.map(timestamp => {
            const metricsAtTime = metrics.filter(m => m.timestamp === timestamp);
            return metricsAtTime.reduce((sum, m) => sum + (m.indexing_rate || 0), 0);
        });

        const data = {
            labels: labels,
            datasets: [
                {
                    label: 'Search Operations',
                    data: searchRates,
                    borderColor: '#3498db',
                    backgroundColor: '#3498db20',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Indexing Operations',
                    data: indexingRates,
                    borderColor: '#e74c3c',
                    backgroundColor: '#e74c3c20',
                    fill: true,
                    tension: 0.4
                }
            ]
        };

        return this.createChart('operationsChart', 'line', data, {
            ...this.defaultOptions,
            scales: {
                ...this.defaultOptions.scales,
                y: {
                    beginAtZero: true,
                    max: undefined,
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value) + ' ops';
                        }
                    }
                }
            }
        });
    }

    // Prepare node data for charts
    prepareNodeData(metrics, field) {
        if (!metrics || metrics.length === 0) {
            return { labels: [], datasets: [] };
        }

        // Group metrics by node
        const nodeGroups = groupBy(metrics, 'node_name');
        const timestamps = [...new Set(metrics.map(m => m.timestamp))].sort();
        
        // Create labels (show only time, limit to prevent overcrowding)
        const labels = timestamps.map(ts => {
            const date = new Date(ts);
            return date.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
            });
        });

        // Create datasets for each node
        const datasets = Object.keys(nodeGroups).map(nodeName => {
            const nodeMetrics = nodeGroups[nodeName];
            
            // Create data points for each timestamp
            const data = timestamps.map(timestamp => {
                const metric = nodeMetrics.find(m => m.timestamp === timestamp);
                return metric ? (metric[field] || 0) : null;
            });

            return {
                label: nodeName,
                data: data,
                pointRadius: 2,
                pointHoverRadius: 4,
                borderWidth: 2
            };
        });

        return { labels, datasets };
    }

    // Create node role distribution chart
    createNodeRoleChart(nodeAnalysis) {
        if (!nodeAnalysis || nodeAnalysis.length === 0) return null;

        const roleCounts = {};
        nodeAnalysis.forEach(node => {
            const roles = Array.isArray(node.nodeRoles) ? node.nodeRoles : (node.nodeRoles || '').split(',');
            roles.forEach(role => {
                const cleanRole = role.trim();
                if (cleanRole) {
                    roleCounts[cleanRole] = (roleCounts[cleanRole] || 0) + 1;
                }
            });
        });

        const data = {
            labels: Object.keys(roleCounts),
            datasets: [{
                data: Object.values(roleCounts),
                backgroundColor: [
                    '#e74c3c', // master
                    '#3498db', // data
                    '#27ae60', // ingest
                    '#f39c12', // coordinating
                    '#9b59b6'  // other
                ]
            }]
        };

        return this.createChart('nodeRoleChart', 'doughnut', data, {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        });
    }

    // Create shard size distribution chart
    createShardSizeChart(shardAnalysis) {
        if (!shardAnalysis || !shardAnalysis.largestShards) return null;

        const shards = shardAnalysis.largestShards.slice(0, 10);
        
        const data = {
            labels: shards.map(s => `${s.index}[${s.shard}]`),
            datasets: [{
                label: 'Shard Size (GB)',
                data: shards.map(s => (s.storeByte || 0) / (1024 * 1024 * 1024)),
                backgroundColor: shards.map(() => generateRandomColor() + '80'),
                borderColor: shards.map(() => generateRandomColor()),
                borderWidth: 1
            }]
        };

        return this.createChart('shardSizeChart', 'bar', data, {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + ' GB';
                        }
                    }
                },
                x: {
                    display: true,
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        });
    }

    // Create cluster health timeline chart
    createHealthTimelineChart(healthData) {
        if (!healthData || healthData.length === 0) return null;

        const timestamps = healthData.map(h => new Date(h.timestamp));
        const labels = timestamps.map(ts => ts.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit'
        }));

        // Convert status to numeric values for charting
        const statusValues = healthData.map(h => {
            switch (h.status) {
                case 'green': return 100;
                case 'yellow': return 50;
                case 'red': return 0;
                default: return 25;
            }
        });

        const data = {
            labels: labels,
            datasets: [{
                label: 'Cluster Health',
                data: statusValues,
                borderColor: '#27ae60',
                backgroundColor: statusValues.map(v => {
                    if (v === 100) return '#27ae6040';
                    if (v === 50) return '#f39c1240';
                    return '#e74c3c40';
                }),
                fill: true,
                stepped: true
            }]
        };

        return this.createChart('healthTimelineChart', 'line', data, {
            ...this.defaultOptions,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            if (value === 100) return 'GREEN';
                            if (value === 50) return 'YELLOW';
                            if (value === 0) return 'RED';
                            return '';
                        }
                    }
                }
            }
        });
    }

    // Update all charts with new data
    updateAllCharts(data) {
        if (data.metrics) {
            this.createCpuChart(data.metrics);
            this.createMemoryChart(data.metrics);
            this.createHeapChart(data.metrics);
            this.createDiskChart(data.metrics);
            this.createLoadChart(data.metrics);
            this.createOperationsChart(data.metrics);
        }
    }
}

// Global chart manager instance
const chartManager = new ChartManager();
