// API service for handling backend communications
const api = {
    async checkAuth() {
        try {
            const response = await fetch('/auth_status');
            const data = await response.json();
            return data.authenticated;
        } catch (error) {
            console.error('Auth check failed:', error);
            return false;
        }
    },

    async login(email, password) {
        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);

        const response = await fetch('/login', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        return response.json();
    },

    async signup(email, password) {
        const formData = new FormData();
        formData.append('email', email);
        formData.append('password', password);

        const response = await fetch('/signup', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Signup failed');
        }

        return response.json();
    },

    async logout() {
        const response = await fetch('/logout', {
            method: 'POST'
        });
        return response.ok;
    },

    async createConversation(title) {
        const formData = new FormData();
        formData.append('title', title);
        const response = await fetch('/conversations', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to create conversation');
        }
        return response.json();
    },

    async getConversations() {
        const response = await fetch('/conversations');
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to fetch conversations');
        }
        return response.json();
    },

    async getConversationMessages(conversationId) {
        const response = await fetch(`/conversations/${conversationId}/messages`);
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to fetch conversation messages');
        }
        return response.json();
    },

    async sendMessage(message, videos = [], conversationId = null) {
        const formData = new FormData();
        formData.append('message', message);
        if (conversationId) {
            formData.append('conversation_id', conversationId);
        }
        
        videos.forEach(video => {
            formData.append('videos', video);
        });

        const response = await fetch('/send_message', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to send message');
        }

        return response.json();
    },

    async updateConversationTitle(conversationId, title) {
        try {
            if (!title || !title.trim()) {
                throw new Error('Title cannot be empty');
            }

            const formData = new FormData();
            formData.append('title', title.trim());
            const response = await fetch(`/conversations/${conversationId}`, {
                method: 'PUT',
                body: formData
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to update conversation title');
            }
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error updating conversation title:', error);
            throw new Error(error.message || 'Failed to update conversation. Please try again.');
        }
    },

    async deleteConversation(conversationId) {
        try {
            if (!conversationId) {
                throw new Error('Invalid conversation ID');
            }

            const response = await fetch(`/conversations/${conversationId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to delete conversation');
            }
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error deleting conversation:', error);
            throw new Error(error.message || 'Failed to delete conversation. Please try again.');
        }
    },

    async getChatHistory() {
        const response = await fetch('/chat_history');
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to fetch chat history');
        }
        return response.json();
    },

    async getVideoAnalysisHistory() {
        const response = await fetch('/video_analysis_history');
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to fetch video analysis history');
        }
        return response.json();
    },

    async checkHealth() {
        try {
            const response = await fetch('/health');
            const health = await response.json();
            return health.status === 'healthy';
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }
};
