import logging
import time
import uuid
from fastapi import HTTPException, Request
from typing import Optional, Dict

logger = logging.getLogger(__name__)

async def get_current_user(request: Request, return_none: bool = False) -> Optional[Dict]:
    """Get the current user from the session"""
    try:
        session_id = request.cookies.get('session_id')
        if not session_id:
            logger.debug("No session ID in request")
            if return_none:
                return None
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Get redis_manager from app state
        redis_manager = request.app.state.redis_manager
        
        is_valid, session_data = redis_manager.validate_session(session_id)
        if not is_valid or not session_data:
            logger.debug("Invalid or expired session")
            if return_none:
                return None
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        if not isinstance(session_data, dict) or 'id' not in session_data:
            logger.warning("Malformed session data encountered")
            if return_none:
                return None
            raise HTTPException(status_code=401, detail="Invalid session data")

        # Check if session needs refresh
        current_time = time.time()
        last_refresh = session_data.get('last_refresh', 0)
        if current_time - last_refresh > request.app.state.SESSION_REFRESH_THRESHOLD:
            await redis_manager.refresh_session(session_id)

        return session_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_current_user: {str(e)}")
        if return_none:
            return None
        raise HTTPException(status_code=401, detail="Authentication error")
