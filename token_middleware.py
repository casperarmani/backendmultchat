import functools
from typing import Callable, Any, Optional
from fastapi import HTTPException, Request
import uuid
import logging
from database import get_user_token_balance, update_token_usage

logger = logging.getLogger(__name__)

async def check_token_balance(user_id: uuid.UUID, required_tokens: int) -> bool:
    """Check if user has sufficient tokens for an operation"""
    try:
        current_balance = await get_user_token_balance(user_id)
        return current_balance >= required_tokens
    except Exception as e:
        logger.error(f"Error checking token balance: {str(e)}")
        return False

def validate_token_usage(required_tokens: int = 0, per_minute_tokens: int = 0):
    """
    Decorator to validate token usage before executing an operation
    
    Args:
        required_tokens (int): Base token cost for the operation
        per_minute_tokens (int): Additional tokens per minute of video
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                # Extract user_id from various possible request formats
                user_id = None
                request_obj = None

                # Find request object in args or kwargs
                if args and isinstance(args[0], Request):
                    request_obj = args[0]
                elif 'request' in kwargs and isinstance(kwargs['request'], Request):
                    request_obj = kwargs['request']

                # Case 1: Try to get user from request state/session
                if request_obj:
                    try:
                        # Check request state first
                        if hasattr(request_obj.state, 'user') and hasattr(request_obj.state.user, 'id'):
                            user_id = request_obj.state.user.id
                        # Then check session
                        elif hasattr(request_obj, 'session') and 'user' in request_obj.session:
                            session_user = request_obj.session.get('user', {})
                            if isinstance(session_user, dict) and 'id' in session_user:
                                user_id = session_user['id']
                            elif hasattr(session_user, 'id'):
                                user_id = session_user.id
                    except Exception as e:
                        logger.debug(f"Could not extract user ID from request state/session: {str(e)}")

                # Case 2: Direct user dict in kwargs
                if not user_id and 'user' in kwargs:
                    user_data = kwargs['user']
                    if isinstance(user_data, dict) and 'id' in user_data:
                        user_id = user_data['id']
                    elif hasattr(user_data, 'id'):
                        user_id = user_data.id

                # Case 3: Check request user attribute
                if not user_id and request_obj and hasattr(request_obj, 'user'):
                    user_data = request_obj.user
                    if isinstance(user_data, dict) and 'id' in user_data:
                        user_id = user_data['id']
                    elif hasattr(user_data, 'id'):
                        user_id = user_data.id

                # Case 4: Direct user_id in kwargs
                if not user_id and 'user_id' in kwargs:
                    user_id = kwargs['user_id']

                if not user_id:
                    logger.error("User ID not found in request or arguments")
                    raise HTTPException(
                        status_code=401,
                        detail="User not authenticated - ID not found in request"
                    )

                try:
                    # Ensure user_id is properly converted to UUID
                    user_id = uuid.UUID(str(user_id))
                except ValueError as e:
                    logger.error(f"Invalid user ID format: {str(e)}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid user ID format: {str(e)}"
                    )

                # Calculate total required tokens including video duration if applicable
                total_required_tokens = required_tokens
                if per_minute_tokens > 0 and 'video_duration' in kwargs:
                    try:
                        duration_minutes = float(kwargs['video_duration'])
                        total_required_tokens += int(duration_minutes * per_minute_tokens)
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Could not calculate per-minute token cost: {str(e)}")

                # Check token balance
                if not await check_token_balance(user_id, total_required_tokens):
                    raise HTTPException(
                        status_code=402,
                        detail="Insufficient tokens for this operation"
                    )

                # Execute the function
                result = await func(*args, **kwargs)

                # Update token usage after successful execution
                await update_token_usage(user_id, total_required_tokens)

                return result

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error in token validation: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail="Error processing token validation"
                )

        return wrapper
    return decorator
