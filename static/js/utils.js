// Utility functions
const utils = {
    formatDate(timestamp) {
        try {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            // Check if date is valid
            if (isNaN(date.getTime())) {
                console.error('Invalid date:', timestamp);
                return 'Invalid date';
            }
            return date.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'Invalid date';
        }
    },

    showError(message) {
        alert(message);
    },

    sanitizeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    updateConnectionStatus(isConnected) {
        const indicator = document.getElementById('connection-status');
        indicator.className = `status-indicator ${isConnected ? 'connected' : ''}`;
    },

    showSection(sectionId) {
        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('hidden');
        });
        document.getElementById(sectionId).classList.remove('hidden');
    }
};
