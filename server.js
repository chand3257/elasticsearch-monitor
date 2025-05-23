const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const cron = require('node-cron');

// Import routes and services
const apiRoutes = require('./routes/api');
const elasticsearchRoutes = require('./routes/elasticsearch');
const { initializeDatabase } = require('./config/database');
const dataCollector = require('./jobs/dataCollector');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for charts
}));
app.use(compression());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api', apiRoutes);
app.use('/elasticsearch', elasticsearchRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('Database initialized successfully');

    // Start data collection job every 30 seconds
    cron.schedule('*/30 * * * * *', async () => {
      try {
        await dataCollector.collectData();
      } catch (error) {
        console.error('Data collection error:', error);
      }
    });

    // Clean old data daily at midnight (keep only last 7 days)
    cron.schedule('0 0 * * *', async () => {
      try {
        await dataCollector.cleanOldData();
      } catch (error) {
        console.error('Data cleanup error:', error);
      }
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Elasticsearch Monitor running on port ${PORT}`);
      console.log(`Dashboard: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();
