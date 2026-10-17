"""
Seed script to populate the database with sample sponsor data
Run this script after setting up the database to create test sponsors
"""

import asyncio
import sys
from pathlib import Path

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

# Add parent directory to path to import from app
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.models.sponsor import Sponsor, SponsorTier
from config.settings import get_settings

settings = get_settings()

# Sample sponsor data matching the frontend mock data
SAMPLE_SPONSORS = [
    {
        "name": "TechCorp Solutions",
        "logo": "https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=400&h=400&fit=crop",
        "tier": SponsorTier.PLATINUM,
        "description": "Leading technology partner powering our fantasy platform",
        "website": "https://techcorp.example.com",
        "featured": True,
        "active": True,
        "display_order": 1,
    },
    {
        "name": "SportGear Pro",
        "logo": "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=400&h=400&fit=crop",
        "tier": SponsorTier.GOLD,
        "description": "Premium sports equipment and merchandise provider",
        "website": "https://sportgear.example.com",
        "featured": True,
        "active": True,
        "display_order": 2,
    },
    {
        "name": "Cricket Analytics Inc",
        "logo": "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=400&h=400&fit=crop",
        "tier": SponsorTier.GOLD,
        "description": "Advanced cricket statistics and data analytics",
        "website": "https://cricketanalytics.example.com",
        "featured": False,
        "active": True,
        "display_order": 3,
    },
    {
        "name": "GameBoost Energy",
        "logo": "https://images.unsplash.com/photo-1625772452859-1c03d5bf1137?w=400&h=400&fit=crop",
        "tier": SponsorTier.SILVER,
        "description": "Official energy drink partner for peak performance",
        "website": "https://gameboost.example.com",
        "featured": False,
        "active": True,
        "display_order": 4,
    },
    {
        "name": "FastPay Digital",
        "logo": "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400&h=400&fit=crop",
        "tier": SponsorTier.SILVER,
        "description": "Secure and instant payment solutions",
        "website": "https://fastpay.example.com",
        "featured": False,
        "active": True,
        "display_order": 5,
    },
    {
        "name": "CloudHost Pro",
        "logo": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=400&fit=crop",
        "tier": SponsorTier.BRONZE,
        "description": "Reliable cloud infrastructure partner",
        "website": "https://cloudhost.example.com",
        "featured": False,
        "active": True,
        "display_order": 6,
    },
    {
        "name": "MediaStream TV",
        "logo": "https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=400&h=400&fit=crop",
        "tier": SponsorTier.BRONZE,
        "description": "Live streaming and broadcasting partner",
        "website": "https://mediastream.example.com",
        "featured": False,
        "active": True,
        "display_order": 7,
    },
    {
        "name": "FitLife Nutrition",
        "logo": "https://images.unsplash.com/photo-1505682634904-d7c8d95cdc50?w=400&h=400&fit=crop",
        "tier": SponsorTier.BRONZE,
        "description": "Sports nutrition and wellness products",
        "website": "https://fitlife.example.com",
        "featured": False,
        "active": True,
        "display_order": 8,
    },
]


async def seed_sponsors():
    """Seed the database with sample sponsors"""

    # Connect to MongoDB
    client = AsyncIOMotorClient(settings.mongodb_url)

    try:
        # Test connection
        await client.admin.command("ping")
        print(f"✓ Connected to MongoDB at {settings.mongodb_url}")

        # Initialize Beanie
        await init_beanie(
            database=client[settings.mongodb_db_name], document_models=[Sponsor]
        )
        print(f"✓ Initialized Beanie with database: {settings.mongodb_db_name}")

        # Clear existing sponsors (optional - comment out if you want to keep existing data)
        deleted_count = await Sponsor.find_all().delete()
        print(f"✓ Cleared {deleted_count} existing sponsors")

        # Insert sample sponsors
        created_count = 0
        for sponsor_data in SAMPLE_SPONSORS:
            # Check if sponsor already exists
            existing = await Sponsor.find_one(Sponsor.name == sponsor_data["name"])

            if existing:
                print(
                    f"  ⊘ Sponsor '{sponsor_data['name']}' already exists, skipping..."
                )
                continue

            # Create and insert sponsor
            sponsor = Sponsor(**sponsor_data)
            await sponsor.insert()
            created_count += 1
            print(f"  ✓ Created sponsor: {sponsor.name} ({sponsor.tier.value})")

        print(f"\n✓ Successfully created {created_count} sponsors!")

        # Print summary
        total = await Sponsor.find_all().count()
        featured = await Sponsor.find(Sponsor.featured == True).count()
        print(f"\n📊 Summary:")
        print(f"   Total sponsors: {total}")
        print(f"   Featured sponsors: {featured}")

        for tier in SponsorTier:
            count = await Sponsor.find(Sponsor.tier == tier).count()
            print(f"   {tier.value.capitalize()}: {count}")

    except Exception as e:
        print(f"✗ Error seeding sponsors: {e}")
        raise
    finally:
        client.close()
        print("\n✓ Closed database connection")


if __name__ == "__main__":
    print("🌱 Seeding sponsors database...\n")
    asyncio.run(seed_sponsors())
    print("\n✅ Seeding complete!")
