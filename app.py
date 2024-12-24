import os
import logging
import time
import uuid
import asyncio
from datetime import datetime
from typing import Optional, Dict, List
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Depends, status
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2AuthorizationCodeBearer
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from chatbot import Chatbot
from token_middleware import validate_token_usage
from database import get_user_token_balance, update_token_usage
from database import (
    create_user, get_user_by_email, insert_chat_message, get_chat_history,
    insert_video_analysis, get_video_analysis_history, check_user_exists,
    get_user_conversations, create_conversation, get_conversation_messages,
    update_conversation_title, delete_conversation, get_user_token_balance,
    get_user_subscription_tier, initialize_user_tokens
)
from dotenv import load_dotenv
import uvicorn
from supabase.client import create_client, Client
import jwt
from fastapi.responses import Response
from redis_storage import RedisFileStorage
from redis_manager import RedisManager, TaskType, TaskPriority
import secrets
import httpx
from session_config import (
    SESSION_LIFETIME,
    SESSION_REFRESH_THRESHOLD,
    COOKIE_SECURE,
    COOKIE_HTTPONLY,
    COOKIE_SAMESITE,
    SESSION_CLEANUP_INTERVAL
)

# Configure logging with colors and formatting
logging.basicConfig(
    level=logging.INFO,
    format='\033[32m[%(asctime)s] %(levelname)s:\033[0m %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Custom formatter for colored logs
class ColoredFormatter(logging.Formatter):
    green = "\033[32m"
    grey = "\033[37m"
    yellow = "\033[33m"
    red = "\033[31m"
    bold_red = "\033[31;1m"
    reset = "\033[0m"
    format_str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    FORMATS = {
        logging.DEBUG: format_str,  # Default/white color
        logging.INFO: format_str,   # Default/white color
        logging.WARNING: yellow + format_str + reset,
        logging.ERROR: red + format_str + reset,
        logging.CRITICAL: bold_red + format_str + reset
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        # Make HTTP requests green
        if 'HTTP Request:' in record.getMessage():
            log_fmt = self.green + self.format_str + self.reset
        formatter = logging.Formatter(log_fmt, datefmt='%Y-%m-%d %H:%M:%S')
        return formatter.format(oauth2_scheme = OAuth2AuthorizationCodeBearer(tokenUrl="token"))
        return formatter.format(record)

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt, datefmt='%Y-%m-%d %H:%M:%S')
        return formatter.format(record)

# Suppress logs for polling endpoints while keeping format for others
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, 'getMessage'):
            return True
            
        message = record.getMessage()
        # Short-circuit if message contains "Returning cached"
        if "Returning cached" in message:
            return False
            
        # Allow Stripe webhook and checkout logs to pass through
        if "Webhook" in message or "checkout.session.completed" in message or "customer.subscription" in message:
            return True
            
        return not (
            ("GET /conversations/" in message and "/messages" in message) or
            ("HTTP Request: GET" in message and 
             "user_chat_history" in message and 
             "order=TIMESTAMP.desc" in message) or
            ("GET /video_analysis_history" in message) or
            ("HTTP Request: GET" in message and "video_analysis_output" in message) or
            ("GET /user/tokens" in message) or
            ("GET /subscriptions/current" in message) or
            ("GET /subscriptions/current-status" in message) or
            ("GET /api/config" in message) or
            ("HTTP Request: GET" in message and "user_tokens?select=" in message)
        )

# Apply custom formatting to logger
handler = logging.StreamHandler()
handler.setFormatter(ColoredFormatter())
logging.getLogger().handlers = [handler]

# Apply filter to access logs, httpx logs and app logger
endpoint_filter = EndpointFilter()
uvicorn_access = logging.getLogger("uvicorn.access")
uvicorn_access.addFilter(endpoint_filter)
httpx_logger = logging.getLogger("httpx")
httpx_logger.addFilter(endpoint_filter)
app_logger = logging.getLogger(__name__)
app_logger.addFilter(endpoint_filter)

load_dotenv()

redis_url = os.getenv('REDIS_URL')
if not redis_url:
    raise ValueError("REDIS_URL environment variable is not set")

redis_storage = RedisFileStorage(redis_url)
redis_manager = RedisManager(redis_url)

supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_ANON_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("SUPABASE_URL or SUPABASE_ANON_KEY is missing from environment variables")

supabase: Client = create_client(supabase_url, supabase_key)

app = FastAPI(
    title="Video Analysis Chatbot",
    description="A FastAPI application for video analysis with chatbot capabilities",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)
from subscription_routes import router as subscription_router
app.include_router(subscription_router, prefix="/api", tags=["subscriptions"])

# Setup session cleanup background task
@app.on_event("startup")
async def startup_event():
    app.state.start_time = time.time()
    app.state.request_count = 0
    app.state.redis_manager = redis_manager
    app.state.SESSION_REFRESH_THRESHOLD = SESSION_REFRESH_THRESHOLD
    
    async def cleanup_sessions():
        while True:
            await redis_manager.cleanup_expired_sessions()
            await asyncio.sleep(SESSION_CLEANUP_INTERVAL)

    async def process_message_queue():
        while True:
            try:
                # Process high priority message queue
                queue_key = redis_manager._get_queue_key(TaskPriority.HIGH, TaskType.MESSAGE_PROCESSING)
                task = redis_manager.dequeue_task(queue_key)
                
                if task and task.get('payload'):
                    payload = task['payload']
                    user_id = payload.get('user_id')
                    message = payload.get('message')
                    conversation_id = payload.get('conversation_id')
                    
                    if user_id and message:
                        # Process the message with chatbot
                        response_text = await chatbot.send_message(message, conversation_id, user_id)
                        
                        # Store bot response
                        conv_id = uuid.UUID(conversation_id) if conversation_id else None
                        await insert_chat_message(
                            uuid.UUID(user_id),
                            response_text,
                            'bot',
                            conv_id
                        )
                        
                        # Update caches
                        if conversation_id:
                            redis_manager.invalidate_cache(f"conversation:{conversation_id}")
                        redis_manager.invalidate_cache(f"chat_history:{user_id}")
                
            except Exception as e:
                logger.error(f"Error processing message queue: {str(e)}")
                
            # Add a small delay to prevent CPU overload
            await asyncio.sleep(0.1)
    
    asyncio.create_task(cleanup_sessions())
    asyncio.create_task(process_message_queue())

# Configure CORS with specific origin
origins = [
    "http://localhost:5173",
    "http://0.0.0.0:5173",
    "*" #added for testing purposes
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"]
)

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")

chatbot = Chatbot()

from auth import get_current_user

@app.post('/api/signup')
async def signup(
    request: Request,
    email: str = Form(...),
    password: str = Form(...)
):
    try:
        if not redis_manager.check_rate_limit("signup", request.client.host):
            raise HTTPException(
                status_code=429,
                detail="Too many signup attempts. Please try again later."
            )

        # Create user and initialize tokens
        user = await create_user(email, password)
        
        # Initialize tokens and wait for completion
        await initialize_user_tokens(uuid.UUID(user["id"]))
        
        # Auto-login after signup for better UX
        auth_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })

        if not auth_response.user:
            raise HTTPException(
                status_code=500,
                detail="Failed to auto-login after signup"
            )
        
        # Generate session
        session_id = secrets.token_urlsafe(32)
        session_data = {
            "id": str(user.get("id")),
            "email": email,
            "last_refresh": time.time()
        }

        if not redis_manager.set_session(session_id, session_data, SESSION_LIFETIME):
            raise HTTPException(
                status_code=500,
                detail="Failed to create session"
            )

        response = JSONResponse(content={"success": True, "message": "Signup and login successful"})
        response.set_cookie(
            key="session_id",
            value=session_id,
            httponly=COOKIE_HTTPONLY,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=SESSION_LIFETIME
        )
        return response

    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": str(e)}
        )
    except Exception as e:
        logger.error(f"Signup error: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": "Internal server error"}
        )

@app.post('/api/login')
async def login_post(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    response: Response = None
):
    try:
        if not redis_manager.check_rate_limit("login", request.client.host):
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Please try again later."
            )

        auth_response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })

        if not auth_response.user:
            logger.error("Login failed: No user in response")
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Invalid credentials"}
            )

        user = await get_user_by_email(email)
        if not user:
            user = await create_user(email, password)

        session_id = secrets.token_urlsafe(32)
        session_data = {
            "id": str(user.get("id")),
            "email": email,
            "last_refresh": time.time()
        }

        if not redis_manager.set_session(session_id, session_data, SESSION_LIFETIME):
            raise HTTPException(
                status_code=500,
                detail="Failed to create session"
            )

        response = JSONResponse(content={"success": True, "message": "Login successful"})
        response.set_cookie(
            key="session_id",
            value=session_id,
            httponly=COOKIE_HTTPONLY,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=SESSION_LIFETIME
        )
        return response

    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": str(e)}
        )

@app.post('/logout')
async def logout(request: Request):
    session_id = request.cookies.get('session_id')
    if session_id:
        redis_manager.delete_session(session_id)
    
    response = JSONResponse(content={"success": True, "message": "Logout successful"})
    response.delete_cookie(
        key="session_id",
        secure=COOKIE_SECURE,
        httponly=COOKIE_HTTPONLY,
        samesite=COOKIE_SAMESITE
    )
    return response

@app.get("/auth_status")
async def auth_status(request: Request):
    try:
        session_id = request.cookies.get('session_id')
        if not session_id:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content={
                    "authenticated": False,
                    "message": "No session found"
                }
            )

        # Refresh session if it exists
        if await redis_manager.refresh_session(session_id):
            user = await get_current_user(request, return_none=True)
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content={
                    "authenticated": user is not None,
                    "user": user if user else None,
                    "session_status": "active"
                }
            )
        else:
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content={
                    "authenticated": False,
                    "message": "Session expired or invalid"
                }
            )
    except Exception as e:
        logger.error(f"Auth status error: {str(e)}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "authenticated": False,
                "error": str(e),
                "session_status": "error"
            }
        )

@app.get("/", response_class=HTMLResponse)
async def serve_static_app(request: Request):
    return FileResponse("static/index.html")

@app.get("/success")
async def stripe_success(request: Request):
    return FileResponse("static/index.html")



@app.get("/chat_history")
async def get_chat_history_endpoint(request: Request):
    user = await get_current_user(request)
    if not user:
        return JSONResponse(content={"history": []})
    
    cache_key = f"chat_history:{user['id']}"
    cached_history = redis_manager.get_cache(cache_key)
    
    if cached_history:
        logger.info(f"Returning cached chat history for user {user['id']}")
        return JSONResponse(content={"history": cached_history})
        
    history = await get_chat_history(uuid.UUID(user['id']))
    redis_manager.set_cache(cache_key, history)
    return JSONResponse(content={"history": history})

@app.get("/video_analysis_history")
async def get_video_analysis_history_endpoint(request: Request):
    user = await get_current_user(request)
    if not user:
        return JSONResponse(content={"history": []})
    
    cache_key = f"video_history:{user['id']}"
    cached_history = redis_manager.get_cache(cache_key)
    
    if cached_history:
        logger.info(f"Returning cached video history for user {user['id']}")
        return JSONResponse(content={"history": cached_history})
        
    history = await get_video_analysis_history(uuid.UUID(user['id']))
    redis_manager.set_cache(cache_key, history)
    return JSONResponse(content={"history": history})

@app.get("/health")
async def health_check():
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "redis": await redis_manager.health_check(),
            "supabase": {
                "status": "unknown",
                "details": None
            }
        }
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{supabase_url}/health",
                headers={"apikey": supabase_key},
                timeout=5.0
            )
            
            if response.status_code == 200:
                health_status["services"]["supabase"] = {
                    "status": "healthy",
                    "details": response.json()
                }
            else:
                health_status["services"]["supabase"] = {
                    "status": "degraded",
                    "details": {"status_code": response.status_code}
                }
                health_status["status"] = "degraded"
    except Exception as e:
        health_status["services"]["supabase"] = {
            "status": "unhealthy",
            "details": {"error": str(e)}
        }
        health_status["status"] = "unhealthy"
    
    return health_status

@app.get("/metrics")
async def metrics():
    try:
        redis_metrics = await redis_manager.get_metrics()
        
        metrics_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "redis": redis_metrics,
            "app": {
                "uptime": time.time() - app.state.start_time if hasattr(app.state, "start_time") else 0,
                "requests_total": app.state.request_count if hasattr(app.state, "request_count") else 0,
            }
        }
        return metrics_data
    except Exception as e:
        logger.error(f"Error collecting metrics: {str(e)}")
        return {
            "error": "Failed to collect metrics",
            "detail": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@app.post("/conversations")
async def create_conversation_endpoint(
    request: Request,
    title: str = Form(..., description="Title of the conversation")
):
    """Create a new conversation"""
    user = await get_current_user(request)
    try:
        if not user or 'id' not in user:
            raise HTTPException(status_code=401, detail="User not authenticated")
        
        conversation = await create_conversation(uuid.UUID(user['id']), title)
        if not conversation:
            raise HTTPException(status_code=500, detail="Failed to create conversation")
            
        return JSONResponse(content={"success": True, "conversation": conversation})
    except ValueError as e:
        logger.error(f"Validation error creating conversation: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/conversations")
async def get_conversations_endpoint(request: Request):
    """Get all conversations for the current user"""
    user = await get_current_user(request)
    try:
        conversations = await get_user_conversations(uuid.UUID(user['id']))
        return JSONResponse(content={"conversations": conversations})
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages_endpoint(
    conversation_id: str,
    request: Request
):
    """Get all messages in a conversation"""
    user = await get_current_user(request)
    try:
        messages = await get_conversation_messages(uuid.UUID(conversation_id))
        return JSONResponse(content={"messages": messages})
    except Exception as e:
        logger.error(f"Error getting conversation messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/conversations/{conversation_id}")
async def update_conversation_endpoint(
    conversation_id: str,
    request: Request,
    title: str = Form(..., description="New title for the conversation")
):
    """Update a conversation's title"""
    try:
        # Verify user is authenticated
        user = await get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="User not authenticated")

        # Validate conversation ID
        try:
            conv_id = uuid.UUID(conversation_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid conversation ID format")

        # Validate title
        if not title or len(title.strip()) == 0:
            raise HTTPException(status_code=400, detail="Title cannot be empty")

        # Update conversation
        try:
            updated = await update_conversation_title(conv_id, title.strip())
            return JSONResponse(content={"success": True, "conversation": updated})
        except ValueError as ve:
            raise HTTPException(status_code=404, detail=str(ve))
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while updating the conversation"
        )

@app.delete("/conversations/{conversation_id}")
async def delete_conversation_endpoint(
    conversation_id: str,
    request: Request
):
    """Delete a conversation"""
    try:
        # Verify user is authenticated
        user = await get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="User not authenticated")

        # Validate conversation ID
        try:
            conv_id = uuid.UUID(conversation_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid conversation ID format")

        # Delete conversation
        try:
            await delete_conversation(conv_id)
            
            # Clear related caches
            cache_key = f"conversation:{conversation_id}"
            redis_manager.invalidate_cache(cache_key)
            if user and 'id' in user:
                redis_manager.invalidate_cache(f"chat_history:{user['id']}")
                
            return JSONResponse(content={"success": True})
        except ValueError as ve:
            raise HTTPException(status_code=404, detail=str(ve))
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while deleting the conversation"
        )

def convert_time_to_seconds(time_str: str) -> float:
    """Convert HH:MM:SS format to seconds"""
    try:
        # Split the time string into components
        parts = time_str.split(':')
        if len(parts) == 3:
            hours, minutes, seconds = parts
            return float(hours) * 3600 + float(minutes) * 60 + float(seconds)
        elif len(parts) == 2:
            minutes, seconds = parts
            return float(minutes) * 60 + float(seconds)
        else:
            return float(time_str)  # Assume it's already in seconds
    except (ValueError, TypeError) as e:
        logger.error(f"Error converting time to seconds: {str(e)}")
        raise ValueError(f"Invalid time format: {time_str}")

@app.post("/send_message")
async def send_message(
    request: Request,
    message: str = Form(...),
    conversation_id: Optional[str] = Form(None),
    videos: List[UploadFile] = File(None)
):
    user = await get_current_user(request)
    
    try:
        # Process videos asynchronously if present
        if videos:
            for video in videos:
                content = await video.read()
                file_id = str(uuid.uuid4())
                
                # Queue video processing task
                redis_manager.enqueue_task(
                    task_type=TaskType.VIDEO_PROCESSING,
                    payload={
                        "file_id": file_id,
                        "filename": video.filename,
                        "user_id": user["id"]
                    },
                    priority=TaskPriority.HIGH
                )
                
                if await redis_storage.store_file(file_id, content):
                    # Get video duration from metadata (assuming chatbot.analyze_video returns duration)
                    analysis_text, metadata = await chatbot.analyze_video(
                        file_id=file_id,
                        filename=video.filename,
                        conversation_id=conversation_id,
                        user_id=user["id"]
                    )
                    
                    # Validate token usage for video duration
                    if metadata and 'duration' in metadata:
                        # Convert duration to seconds
                        video_duration = convert_time_to_seconds(metadata['duration'])
                        user_id = uuid.UUID(user['id'])
                        
                        # Check if user has enough tokens
                        current_balance = await get_user_token_balance(user_id)
                        tokens_needed = int(video_duration)  # 1 token per second
                        
                        if current_balance < tokens_needed:
                            raise HTTPException(
                                status_code=402,
                                detail=f"Insufficient tokens. Required: {tokens_needed}, Available: {current_balance}"
                            )
                        
                        # Deduct tokens for video processing
                        await update_token_usage(user_id, tokens_needed)
                    
                    # Queue analysis task
                    redis_manager.enqueue_task(
                        task_type=TaskType.VIDEO_ANALYSIS,
                        payload={
                            "file_id": file_id,
                            "analysis": analysis_text,
                            "metadata": metadata,
                            "user_id": user["id"]
                        },
                        priority=TaskPriority.MEDIUM
                    )
                    
                    # Invalidate cache before storing analysis
                    redis_manager.invalidate_analysis_cache(user["id"])
                    # Store analysis in background
                    asyncio.create_task(insert_video_analysis(
                        user_id=uuid.UUID(user['id']),
                        upload_file_name=video.filename,
                        analysis=analysis_text,
                        video_duration=metadata.get('duration') if metadata else None,
                        video_format=metadata.get('format') if metadata else None
                    ))
        
        # Check rate limit for message processing
        if not redis_manager.check_rate_limit("message_processing", f"user:{user['id']}"):
            raise HTTPException(
                status_code=429,
                detail="Too many messages. Please wait a moment before sending more."
            )

        # Queue the message for processing to handle API rate limits
        # This ensures fair processing of messages from concurrent users
        message_task_id = redis_manager.enqueue_task(
            task_type=TaskType.MESSAGE_PROCESSING,
            payload={
                "message": message,
                "conversation_id": conversation_id,
                "user_id": user["id"],
                "timestamp": time.time()
            },
            priority=TaskPriority.HIGH
        )
        
        if not message_task_id:
            raise HTTPException(status_code=500, detail="Failed to queue message")
            
        # Store user message immediately for better UX
        conv_id = uuid.UUID(conversation_id) if conversation_id else None
        await insert_chat_message(uuid.UUID(user['id']), message, 'user', conv_id)
        
        # Get initial acknowledgment
        response_text = "Message received and queued for processing..."
        
        # The actual processing will happen in background worker
        # Original functionality:
        # response_text = await chatbot.send_message(message, conversation_id)
        # The bot response will be inserted by the worker when processing completes
        
        # Update both caches to maintain consistency
        if conversation_id:
            conv_cache_key = f"conversation:{conversation_id}"
            redis_manager.invalidate_cache(conv_cache_key)
        
        # Also update user's chat history cache
        user_cache_key = f"chat_history:{user['id']}"
        redis_manager.invalidate_cache(user_cache_key)
        
        # Get updated token balance
        token_balance = await get_user_token_balance(uuid.UUID(user['id']))
        
        return JSONResponse(content={
            "response": response_text,
            "conversation_id": str(conv_id) if conv_id else None,
            "token_balance": token_balance
        })
        
    except Exception as e:
        logger.error(f"Error processing message: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/user/tokens")
async def get_user_tokens(request: Request):
    """Get user's token balance and subscription information"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        token_balance = await get_user_token_balance(uuid.UUID(user['id']))
        subscription = await get_user_subscription_tier(uuid.UUID(user['id']))
        
        return JSONResponse(content={
            "token_balance": token_balance,
            "subscription": subscription
        })
    except Exception as e:
        logger.error(f"Error getting user tokens: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8080, reload=True, access_log=False)