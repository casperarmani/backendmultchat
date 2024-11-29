"""Session management configuration"""

# Session lifetime in seconds (1 hour)
SESSION_LIFETIME = 3600

# Session refresh threshold in seconds (5 minutes)
SESSION_REFRESH_THRESHOLD = 300

# Cookie security settings
COOKIE_SECURE = True
COOKIE_HTTPONLY = True
COOKIE_SAMESITE = "lax"

# Cleanup interval in seconds (3 hours to reduce overhead with comprehensive cleanup)
# This is increased due to the more thorough cleanup process that now handles:
# - Multiple chat conversations
# - Task queues
# - Rate limiting data
# - Video analysis caches
SESSION_CLEANUP_INTERVAL = 7200  # Changed from 3 hours to 2 hours
