from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from config.settings import get_settings
from app.models.user import User, RefreshToken, UserProfile

settings = get_settings()

# MongoDB client
client: AsyncIOMotorClient = None


async def connect_to_mongo():
    """Connect to MongoDB and initialize Beanie ODM"""
    global client

    try:
        # Create MongoDB client
        client = AsyncIOMotorClient(settings.mongodb_url)

        # Test connection
        await client.admin.command('ping')
        print(f"✓ Connected to MongoDB at {settings.mongodb_url}")

        # Initialize Beanie with document models
        await init_beanie(
            database=client[settings.mongodb_db_name],
            document_models=[User, RefreshToken, UserProfile]
        )
        print(f"✓ Initialized Beanie ODM with database: {settings.mongodb_db_name}")

    except Exception as e:
        print(f"✗ Failed to connect to MongoDB: {e}")
        raise


async def close_mongo_connection():
    """Close MongoDB connection"""
    global client
    if client:
        client.close()
        print("✓ Closed MongoDB connection")


def get_database():
    """Get MongoDB database instance"""
    if client is None:
        raise Exception("Database not initialized. Call connect_to_mongo() first.")
    return client[settings.mongodb_db_name]
