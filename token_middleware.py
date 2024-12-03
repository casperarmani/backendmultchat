import functools
from typing import Callable, Any
from fastapi import HTTPException
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
                
                # Case 1: Direct user dict in kwargs
                if 'user' in kwargs and isinstance(kwargs['user'], dict) and 'id' in kwargs['user']:
                    user_id = kwargs['user']['id']
                
                # Case 2: Request object with user attribute
                elif args and hasattr(args[0], 'user'):
                    if isinstance(args[0].user, dict) and 'id' in args[0].user:
                        user_id = args[0].user['id']
                    elif hasattr(args[0].user, 'id'):
                        user_id = args[0].user.id
                
                # Case 3: Direct user_id in kwargs
                elif 'user_id' in kwargs:
                    user_id = kwargs['user_id']
                
                if not user_id:
                    logger.error("User ID not found in request")
                    raise HTTPException(status_code=401, detail="User not authenticated")
                
                try:
                    # Ensure user_id is properly converted to UUID
                    user_id = uuid.UUID(str(user_id))
                except ValueError as e:
                    logger.error(f"Invalid user ID format: {str(e)}")
                    raise HTTPException(status_code=400, detail="Invalid user ID format")
                
                # Calculate total required tokens including video duration if applicable
                total_required_tokens = required_tokens
                if per_minute_tokens > 0 and 'video_duration' in kwargs:
                    try:
                        duration_minutes = float(kwargs['video_duration'])
                        total_required_tokens += int(duration_minutes * per_minute_tokens)
                    except (ValueError, TypeError):
                        logger.warning("Could not calculate per-minute token cost")
                
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
