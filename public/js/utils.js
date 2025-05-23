// Utility functions

// Format bytes to human readable format
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format percentage
function formatPercentage(value, decimals = 1) {
    if (isNaN(value)) return '0%';
    return parseFloat(value).toFixed(decimals) + '%';
}

// Format number with commas
function formatNumber(num) {
    if (isNaN(num)) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Get status color based on percentage
function getStatusColor(percentage) {
    if (percentage < 60) return 'green';
    if (percentage < 80) return 'yellow';
    return 'red';
}

// Get status color class
function getStatusColorClass(percentage) {
    if (percentage < 60) return 'success';
    if (percentage < 80) return 'warning';
    return 'error';
}

// Format timestamp to relative time
function formatTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now - time) / 1000);
    
    if (diffInSeconds < 60) {
        return `${diffInSeconds}s ago`;
    } else if (diffInSeconds < 3600) {
        return `${Math.floor(diffInSeconds / 60)}m ago`;
    } else if (diffInSeconds < 86400) {
        return `${Math.floor(diffInSeconds / 3600)}h ago`;
    } else {
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }
}

// Show loading spinner
function showLoading() {
    document.getElementById('loading').style.display = 'block';
}

// Hide loading spinner
function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

// Show alert message
function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    document.body.insertBefore(alertDiv, document.body.firstChild);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.parentNode.removeChild(alertDiv);
        }
    }, 5000);
}

// API request helper
async function apiRequest(url, options = {}) {
    try {
        console.log('Making API request to:', url, 'with options:', options);
        
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        const responseText = await response.text();
        console.log('Response status:', response.status, 'Response text:', responseText);
        
        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = JSON.parse(responseText);
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // If response is not JSON, use the text
                errorMessage = responseText || errorMessage;
            }
            throw new Error(errorMessage);
        }
        
        try {
            return JSON.parse(responseText);
        } catch (e) {
            return responseText;
        }
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Group array by key
function groupBy(array, key) {
    return array.reduce((result, currentValue) => {
        (result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
        return result;
    }, {});
}

// Get unique values from array
function getUniqueValues(array, key) {
    return [...new Set(array.map(item => item[key]))];
}

// Calculate average of array
function calculateAverage(array, key) {
    if (array.length === 0) return 0;
    const sum = array.reduce((acc, item) => acc + (item[key] || 0), 0);
    return sum / array.length;
}

// Sort array by key
function sortBy(array, key, direction = 'asc') {
    return array.sort((a, b) => {
        const aVal = a[key] || 0;
        const bVal = b[key] || 0;
        
        if (direction === 'desc') {
            return bVal - aVal;
        }
        return aVal - bVal;
    });
}

// Validate URL
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Generate random color
function generateRandomColor() {
    const colors = [
        '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#34495e', '#95a5a6', '#e67e22', '#16a085'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Get node colors (consistent colors for same nodes)
const nodeColors = {};
function getNodeColor(nodeName) {
    if (!nodeColors[nodeName]) {
        nodeColors[nodeName] = generateRandomColor();
    }
    return nodeColors[nodeName];
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
