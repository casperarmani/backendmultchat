import os
import logging
from datetime import datetime, timezone
logger = logging.getLogger(__name__)
from supabase.client import create_client, Client
from typing import List, Dict, Optional
import uuid
from redis_manager import RedisManager

redis_manager = RedisManager(os.environ.get('REDIS_URL'))

# Initialize Supabase client
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_ANON_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("SUPABASE_URL or SUPABASE_ANON_KEY is missing from environment variables")

supabase: Client = create_client(supabase_url, supabase_key)

async def create_user(email: str, password: str) -> Dict:
    try:
        # Check if user already exists
        existing_user = await get_user_by_email(email)
        if existing_user:
            raise ValueError("User with this email already exists")
            
        # Create user with auth
        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": password
        })
        
        if not auth_response.user:
            raise ValueError("Failed to create user authentication")
            
        # Create user record in users table
        response = supabase.table("users").insert({
            "id": auth_response.user.id,
            "email": email
        }).execute()
        
        return response.data[0] if response.data else {}
    except Exception as e:
        raise ValueError(f"Error creating user: {str(e)}")

async def get_user_by_email(email: str) -> Dict:
    response = supabase.table("users").select("*").eq("email", email).execute()
    return response.data[0] if response.data else {}

async def check_user_exists(user_id: uuid.UUID) -> bool:
    response = supabase.table("users").select("id").eq("id", str(user_id)).execute()
    return len(response.data) > 0

async def insert_chat_message(user_id: uuid.UUID, message: str, chat_type: str = 'text', conversation_id: Optional[uuid.UUID] = None) -> Dict:
    user_exists = await check_user_exists(user_id)
    if not user_exists:
        raise ValueError(f"User with id {user_id} does not exist")
        
    # If no conversation_id is provided, create a new conversation
    if not conversation_id:
        conversation = await create_conversation(user_id)
        conversation_id = uuid.UUID(conversation['id'])
        
    response = supabase.table("user_chat_history").insert({
        "user_id": str(user_id),
        "conversation_id": str(conversation_id),
        "message": message,
        "chat_type": chat_type
    }).execute()
    return response.data[0] if response.data else {}

async def get_chat_history(user_id: uuid.UUID, limit: int = 50) -> List[Dict]:
    response = supabase.table("user_chat_history").select("*").eq("user_id", str(user_id)).order("TIMESTAMP", desc=True).limit(limit).execute()
    return response.data

async def insert_video_analysis(user_id: uuid.UUID, upload_file_name: str, analysis: str, video_duration: Optional[str] = None, video_format: Optional[str] = None) -> Dict:
    response = supabase.table("video_analysis_output").insert({
        "user_id": str(user_id),
        "upload_file_name": upload_file_name,
        "analysis": analysis,
        "video_duration": video_duration,
        "video_format": video_format
    }).execute()
    return response.data[0] if response.data else {}

async def get_video_analysis_history(user_id: uuid.UUID, limit: int = 10) -> List[Dict]:
    response = supabase.table("video_analysis_output").select("*").eq("user_id", str(user_id)).order("TIMESTAMP", desc=True).limit(limit).execute()
    return response.data


async def get_user_conversations(user_id: uuid.UUID, limit: int = 10) -> List[Dict]:
    """Get all conversations for a user"""
    try:
        response = supabase.table("conversations").select("*").eq("user_id", str(user_id)).is_("deleted_at", "null").order("created_at", desc=True).limit(limit).execute()
        return response.data
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        return []

async def create_conversation(user_id: uuid.UUID, title: str = "New Conversation") -> Dict:
    """Create a new conversation for a user"""
    try:
        response = supabase.table("conversations").insert({
            "user_id": str(user_id),
            "title": title,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        return response.data[0] if response.data else {}
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        raise ValueError(f"Failed to create conversation: {str(e)}")

async def get_conversation_messages(conversation_id: uuid.UUID, limit: int = 50) -> List[Dict]:
    """Get all messages in a conversation with caching"""
    try:
        cache_key = f"conversation:{str(conversation_id)}"
        
        # Try to get from cache first
        cached_messages = redis_manager.get_cache(cache_key)
        if cached_messages:
            return cached_messages
            
        # If not in cache, get from database
        response = supabase.table("user_chat_history").select("*").eq("conversation_id", str(conversation_id)).order("TIMESTAMP", desc=True).limit(limit).execute()
        
        if response.data:
            # Cache the results for 5 minutes
            redis_manager.set_cache(cache_key, response.data)
            return response.data
        return []
    except Exception as e:
        logger.error(f"Error getting conversation messages: {str(e)}")
        return []

async def update_conversation_title(conversation_id: uuid.UUID, title: str) -> Dict:
    """Update a conversation's title"""
    try:
        # First check if conversation exists and is not deleted
        check_response = supabase.table("conversations").select("*").eq("id", str(conversation_id)).is_("deleted_at", "null").execute()
        if not check_response.data:
            raise ValueError("Conversation not found or has been deleted")

        # Update the conversation
        response = supabase.table("conversations").update({
            "title": title,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", str(conversation_id)).execute()

        if not response.data:
            raise ValueError("Failed to update conversation")

        return response.data[0]
    except ValueError as e:
        logger.error(f"Validation error updating conversation title: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error updating conversation title: {str(e)}")
        raise ValueError(f"Failed to update conversation title: {str(e)}")

async def delete_conversation(conversation_id: uuid.UUID) -> bool:
    """Soft delete a conversation"""
    try:
        # First check if conversation exists and is not already deleted
        check_response = supabase.table("conversations").select("*").eq("id", str(conversation_id)).is_("deleted_at", "null").execute()
        if not check_response.data:
            raise ValueError("Conversation not found or has been already deleted")

        # Perform soft delete
        response = supabase.table("conversations").update({
            "deleted_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", str(conversation_id)).execute()

        if not response.data:
            raise ValueError("Failed to delete conversation")

        return True
    except ValueError as e:
        logger.error(f"Validation error deleting conversation: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise ValueError(f"Failed to delete conversation: {str(e)}")

# End of file