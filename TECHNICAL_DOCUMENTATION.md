# Video Analysis and Chat Application Technical Documentation

## Table of Contents
- [System Architecture](#system-architecture)
- [Frontend Implementation](#frontend-implementation)
- [Backend Implementation](#backend-implementation)
- [Database Schema](#database-schema)
- [Authentication System](#authentication-system)
- [Token Management](#token-management)
- [Session Handling](#session-handling)
- [Video Processing Pipeline](#video-processing-pipeline)
- [Redis Integration](#redis-integration)
- [Security Features](#security-features)

## System Architecture

The application implements a modern client-server architecture with the following key components:

1. **Frontend Layer**:
   - Pure JavaScript implementation for optimal performance
   - DOM fragment optimization for efficient rendering
   - Modular structure with separate concerns (auth.js, utils.js, api.js, chat.js)

2. **Backend Layer**:
   - FastAPI framework for high-performance async operations
   - Comprehensive middleware system for authentication and token validation
   - Redis-based caching and task queue system
   - Supabase integration for database operations

3. **Data Layer**:
   - PostgreSQL database through Supabase
   - Redis for caching and session management
   - File storage system for video processing

## Frontend Implementation

### Authentication Module (auth.js)
The frontend authentication system implements a comprehensive user management system with the following features:

1. **Authentication Flows**:
   ```javascript
   document.addEventListener('DOMContentLoaded', () => {
       // Form handlers
       const loginForm = document.getElementById('login-form');
       const signupForm = document.getElementById('signup-form');
       // Clean separation of concerns
       signupForm.addEventListener('submit', async (e) => {
           // Auto-initialize app after successful signup
           await api.signup(email, password);
           await checkAuthStatus();
           await updateTokenInfo();
       });
   });
   ```
   - Clean separation of login/signup flows
   - Automatic initialization after authentication
   - Session-based token management
   - Health status monitoring every 30 seconds

2. **Session Management**:
   - Automatic token refresh mechanism
   - Session validation on each page load
   - Secure cookie handling
   - Real-time connection status updates

3. **State Cleanup**:
   Comprehensive cleanup on logout:
   ```javascript
   // Clean up state
   window.chatHistory = [];
   window.analysisHistory = [];
   window.conversations = [];
   window.currentConversationId = null;
   ```
   - Chat history clearance
   - Analysis history removal
   - Active conversation cleanup
   - Poll interval management

4. **Error Handling**:
   - Comprehensive error capture
   - User-friendly error messages
   - Automatic retry mechanism
   - Connection status feedback

### Token Management Module (token-handler.js)
Implements sophisticated token and subscription management:

1. **State Management**:
   ```javascript
   class TokenHandler {
       constructor() {
           this.isAuthenticated = false;
           this.retryCount = 0;
           this.maxRetries = 3;
           this.retryDelay = 1000;
           this.cachedTokenInfo = null;
           this.lastFetchTime = 0;
           this.cacheDuration = 30000;
       }
   }
   ```
   - Authentication state tracking
   - Retry mechanism with exponential backoff
   - Cache management with TTL
   - Real-time balance updates

2. **Token Information Handling**:
   - Cached token balance retrieval
   - Subscription tier tracking
   - Automatic refresh mechanism
   - Force refresh capability

3. **Display Management**:
   ```javascript
   updateDisplays(tokenText, planText) {
       const tokenElement = document.getElementById('current-tokens');
       const planElement = document.getElementById('current-plan');
       if (tokenElement) tokenElement.textContent = tokenText;
       if (planElement) planElement.textContent = planText;
   }
   ```
   - Real-time token balance display
   - Subscription plan information
   - Loading state management
   - Error state handling

4. **Performance Optimization**:
   - Request debouncing
   - Cache-first approach
   - Automatic retry on failure
   - Background refresh

### Utility Module (utils.js)
Provides core utilities for:
- Date formatting with fallback handling
- HTML sanitization
- Connection status management
- Section visibility control
- Success/error notifications

## Backend Implementation
### API Integration Module (api.js)
The application implements a comprehensive API client with the following features:

1. **Core API Methods**:
   ```javascript
   const api = {
       async checkAuth()
       async login(email, password)
       async signup(email, password)
       async logout()
       async createConversation(title)
       async getConversations()
       async sendMessage(message, videos, conversationId)
       async getVideoAnalysisHistory()
       async checkHealth()
   }
   ```

2. **Error Handling**:
   - Comprehensive try-catch blocks
   - Request timeout management
   - Network error recovery
   - Token validation errors
   - Rate limiting handling

3. **Request Features**:
   - FormData for file uploads
   - JSON request/response handling
   - Authentication headers
   - Response validation
   - Error message extraction

4. **Performance Optimization**:
   - Response caching
   - Request debouncing
   - Connection pooling
   - Automatic retry logic
   - Health check monitoring

### Chat Implementation Module (chat.js)
Implements real-time chat functionality with video analysis capabilities:

1. **Message Management**:
   - Real-time message sending/receiving
   - Video file handling
   - Progress tracking
   - Message history
   - Conversation contexts

2. **Video Processing**:
   - Multiple file upload support
   - Progress indicators
   - Format validation
   - Duration checks
   - Token validation

3. **UI Updates**:
   - Dynamic message rendering
   - Loading states
   - Error notifications
   - Token balance updates
   - Connection status

4. **Optimization**:
   - Message queuing
   - Background processing
   - Cache management
   - Memory optimization
   - Connection pooling

### Core Application (app.py)
The FastAPI application implements:

1. **Middleware Stack**:
   - CORS with specific origin control
   - GZip compression for responses
   - Trusted host validation
   - Custom colored logging system
   - Request rate limiting

2. **Background Tasks**:
   - Session cleanup
   - Message queue processing
   - Health monitoring

3. **API Endpoints**:
   ```python
   - /signup: User registration with automatic login
   - /login: Authentication with session creation
   - /logout: Session cleanup
   - /auth_status: Session validation
   - /chat_history: Paginated chat history
   - /video_analysis_history: Video analysis records
   - /conversations/*: Conversation management
   - /send_message: Message handling with video support
   ```

### Token Management System (token_middleware.py)
The token management system implements a sophisticated validation and tracking mechanism:

1. **Token Validation Decorator**:
   ```python
   @validate_token_usage(video_duration: float = None)
   ```
   - Validates token requirements before operation execution
   - Handles both standard operations and video processing
   - Implements automatic token deduction
   - Provides comprehensive error handling

2. **Duration-Based Calculation**:
   - Converts various time formats (HH:MM:SS, MM:SS, seconds)
   - Implements 1:1 token to second ratio for video processing
   - Handles floating-point durations
   - Validates format consistency

3. **Balance Management**:
   - Real-time balance checking through database queries
   - Atomic update operations for token deduction
   - Prevents negative balance scenarios
   - Implements rollback on failed operations

4. **Error Handling**:
   - Comprehensive logging system
   - Detailed error messages for debugging
   - User-friendly error responses
   - Transaction management for token operations

## Database Schema

The database implements a sophisticated structure with the following key components:

### Core Tables:

1. **users**
   ```sql
   - id (uuid, NOT NULL, DEFAULT: gen_random_uuid())
   - email (text, NOT NULL)
   - created_at (timestamp with time zone)
   - updated_at (timestamp with time zone)
   ```
   Primary user information table with automatic UUID generation and timestamp tracking.

2. **conversations**
   ```sql
   - id (uuid, NOT NULL, DEFAULT: gen_random_uuid())
   - user_id (uuid, NOT NULL)
   - title (text, NOT NULL, DEFAULT: 'New Conversation')
   - created_at (timestamp with time zone)
   - updated_at (timestamp with time zone)
   - deleted_at (timestamp with time zone, soft delete)
   ```
   Implements soft delete for data retention and recovery.

3. **user_chat_history**
   ```sql
   - id (bigint, NOT NULL)
   - user_id (uuid, NOT NULL)
   - conversation_id (uuid, NOT NULL)
   - message (text, NOT NULL)
   - chat_type (text, DEFAULT: 'text')
   - TIMESTAMP (timestamp with time zone)
   - vector (USER-DEFINED) - For similarity search
   ```
   Includes vector storage for advanced search capabilities.

2. **conversations**
   - User-specific conversations
   - Soft delete support
   - Title and metadata

3. **user_chat_history**
   - Message storage
   - Conversation linking
   - Vector storage for search
   - Timestamps and soft delete

4. **video_analysis_output**
   - Analysis results
   - Video metadata
   - Token usage tracking
   - Vector embeddings

5. **token_usage**
   - Usage tracking
   - Timestamp-based records
   - User association

### Subscription Management:
1. **subscription_tiers**
   - Tier definitions
   - Token allocations
   - Pricing information

2. **user_tokens**
   - Current balances
   - Tier associations
   - Usage tracking

## Authentication System

The authentication system implements:

1. **Session Management**:
   - Redis-based session storage
   - Configurable lifetime (3600s default)
   - Refresh mechanism (300s threshold)
   - Automatic cleanup

2. **Security Features**:
   - Secure cookie handling
   - HTTPS enforcement
   - Rate limiting
   - XSS protection

3. **State Management**:
   ```python
   - Session creation
   - Validation
   - Refresh
   - Cleanup
   ```

## Token Management

The token system implements:

1. **Usage Tracking**:
   - Per-operation validation
   - Balance maintenance
   - Usage history
   - Automatic deduction

2. **Video Processing**:
   - Duration-based calculation
   - Pre-upload validation
   - Balance checks
   - Usage recording

## Session Handling

Session management implements:

1. **Configuration**:
   ```python
   - SESSION_LIFETIME = 3600
   - SESSION_REFRESH_THRESHOLD = 300
   - COOKIE_SECURE = True
   - COOKIE_HTTPONLY = True
   - COOKIE_SAMESITE = "lax"
   ```

2. **Features**:
   - Redis-based storage
   - Automatic cleanup
   - Refresh mechanism
   - Security hardening

## Video Processing Pipeline

The video processing system implements:

1. **Upload Flow**:
   - Multi-file support
   - Progress tracking
   - Duration validation
   - Token validation

2. **Processing**:
   - Async task queue
   - Priority handling
   - Result caching
   - Error recovery

3. **Analysis Storage**:
   - Metadata extraction
   - Result vectorization
   - Token usage tracking
   - Cache management

## Redis Integration

Redis serves as a crucial component for caching, session management, and task queuing:

1. **Session Management**:
   ```python
   Configuration:
   - SESSION_LIFETIME = 3600  # 1 hour
   - SESSION_REFRESH_THRESHOLD = 300  # 5 minutes
   - SESSION_CLEANUP_INTERVAL = 7200  # 2 hours
   ```
   Implements secure session handling with:
   - Automatic cleanup of expired sessions
   - Configurable lifetime and refresh thresholds
   - Secure cookie management (HTTPOnly, SameSite)

2. **Task Queue System**:
   ```python
   Priorities:
   - HIGH: Immediate message processing
   - MEDIUM: Video analysis tasks
   - LOW: Background cleanup tasks
   ```
   Features:
   - Priority-based message processing
   - Asynchronous video analysis
   - Background task management
   - Error recovery mechanisms

3. **Caching Layer**:
   - Chat history with user-specific invalidation
   - Video analysis results with metadata
   - Token balances for performance
   - Session data with expiration
   - Rate limiting data

4. **File Storage**:
   - Temporary video file storage
   - Processing queue management
   - Cleanup routines
   - Error handling and recovery

2. **Task Queue**:
   - Message processing
   - Video analysis
   - Priority management
   - Error handling

3. **Rate Limiting**:
   - Request tracking
   - User-specific limits
   - Endpoint-specific rules

## Security Features

The application implements comprehensive security measures:

1. **Authentication**:
   - Session-based
   - Token refresh
   - Rate limiting
   - Secure cookies

2. **Data Protection**:
   - Input sanitization
   - XSS prevention
   - CORS control
   - HTTPS enforcement

3. **Resource Protection**:
   - Rate limiting
   - Token validation
   - Session management
   - Error handling

4. **Monitoring**:
   - Health checks
   - Error logging
   - Usage tracking
   - Performance metrics

## Conclusion

The application implements a robust, scalable architecture with:
- Modern frontend optimization techniques
- High-performance async backend
- Comprehensive security measures
- Efficient resource management
- Scalable data storage
- Reliable caching system

The system is designed for high availability and performance while maintaining strong security and user isolation.
