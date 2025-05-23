const express = require('express');
const ElasticsearchService = require('../services/elasticsearchService');
const router = express.Router();

// Test Elasticsearch connection
router.post('/test-connection', async (req, res) => {
  try {
    const { endpoint, username, password } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    const esService = new ElasticsearchService(endpoint, username, password);
    const result = await esService.testConnection();
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Get real-time cluster health
router.post('/cluster-health', async (req, res) => {
  try {
    const { endpoint, username, password } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    const esService = new ElasticsearchService(endpoint, username, password);
    const health = await esService.getClusterHealth();
    
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get real-time node stats
router.post('/node-stats', async (req, res) => {
  try {
    const { endpoint, username, password } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    const esService = new ElasticsearchService(endpoint, username, password);
    const nodeMetrics = await esService.getDetailedNodeMetrics();
    
    res.json(nodeMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get real-time index stats
router.post('/index-stats', async (req, res) => {
  try {
    const { endpoint, username, password } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    const esService = new ElasticsearchService(endpoint, username, password);
    const indexMetrics = await esService.getIndexMetrics();
    
    res.json(indexMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get problematic nodes
router.post('/problematic-nodes', async (req, res) => {
  try {
    const { endpoint, username, password, cpuThreshold = 80, memoryThreshold = 85 } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    const esService = new ElasticsearchService(endpoint, username, password);
    const problematicNodes = await esService.getProblematicNodes(cpuThreshold, memoryThreshold);
    
    res.json(problematicNodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get largest indices
router.post('/largest-indices', async (req, res) => {
  try {
    const { endpoint, username, password, limit = 10 } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    const esService = new ElasticsearchService(endpoint, username, password);
    const largestIndices = await esService.getLargestIndices(limit);
    
    res.json(largestIndices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get most active indices
router.post('/active-indices', async (req, res) => {
  try {
    const { endpoint, username, password, limit = 10 } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required' });
    }

    const esService = new ElasticsearchService(endpoint, username, password);
    const activeIndices = await esService.getMostActiveIndices(limit);
    
    res.json(activeIndices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
