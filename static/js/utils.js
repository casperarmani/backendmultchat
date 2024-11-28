// Utility functions
const utils = {
    formatDate(timestamp) {
        return new Date(timestamp).toLocaleString();
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
