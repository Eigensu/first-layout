import gspread
from google.oauth2.service_account import Credentials
import logging
import os
import json
from datetime import datetime
from typing import Dict, Any, List
from beanie import PydanticObjectId
from app.models.player import Player
from app.models.team import Team
from config.settings import settings

logger = logging.getLogger(__name__)

# Scope for Google Sheets API
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

async def sync_players_from_sheet(credentials_path: str, spreadsheet_id: str, sheet_name: str = "Fantasy & MVP Player List"):
    """
    Connects to Google Sheets using a service account and syncs 'Total Points' to MVP player points in the database.
    """
    try:
        # Load credentials
        google_creds_json = settings.google_credentials_json
        if google_creds_json:
            creds_dict = json.loads(google_creds_json)
            credentials = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
        else:
            credentials = Credentials.from_service_account_file(credentials_path, scopes=SCOPES)
        
        # Authorize gspread
        client = gspread.authorize(credentials)
        
        # Open the spreadsheet
        sheet = client.open_by_key(spreadsheet_id).worksheet(sheet_name)
        
        # Get all records as a list of dictionaries
        # Expected Columns: Player | Category | Team | MVP Won | Games Played | Total Points
        # head=2 is required because row 1 is a merged title row "JPL 2026 - Player Points Summary"
        records = sheet.get_all_records(head=2)
        
        updated_count = 0
        not_found_count = 0
        updated_player_ids = []
        
        for row in records:
            player_name = str(row.get("Player", "")).strip()
            team_name = str(row.get("Team", "")).strip()
            total_points_str = str(row.get("Total Points", "0")).strip()
            
            if not player_name:
                continue
                
            try:
                # Handle possible comma separators or strange formats in points
                total_points_str = total_points_str.replace(',', '')
                total_points = float(total_points_str) if total_points_str else 0.0
            except ValueError:
                total_points = 0.0
                
            # Find the player in the database
            # Strategy: Match strictly by Name AND Team
            player = await Player.find_one({"name": player_name, "team": team_name})
                
            if player:
                # Only update and save if the points actually changed to avoid unnecessary DB writes
                if player.points != total_points:
                    player.points = total_points
                    await player.save()
                    updated_count += 1
                    updated_player_ids.append(str(player.id))
            else:
                not_found_count += 1
                logger.warning(f"Player '{player_name}' (Team: '{team_name}') not found in DB.")
                
        # Recalculate team points if any player points were updated
        if updated_player_ids:
            logger.info("Recalculating team points for updated players...")
            # Find all teams that contain at least one of the updated players
            impacted_teams = await Team.find({"player_ids": {"$in": updated_player_ids}}).to_list()
            
            # Fetch all players needed across all impacted teams in a single query
            all_player_ids = set()
            team_player_ids_map = {}
            for team in impacted_teams:
                player_object_ids = []
                for pid in team.player_ids:
                    try:
                        obj_id = PydanticObjectId(pid)
                        player_object_ids.append(obj_id)
                        all_player_ids.add(obj_id)
                    except (TypeError, ValueError):
                        continue
                team_player_ids_map[team.id] = player_object_ids
                
            players = []
            if all_player_ids:
                players = await Player.find({"_id": {"$in": list(all_player_ids)}}).to_list()
                
            # Build lookup of player -> points
            player_points_map = {p.id: float(p.points or 0.0) for p in players}
            
            # Update each team's total using the pre-fetched points
            for team in impacted_teams:
                player_object_ids = team_player_ids_map.get(team.id, [])
                total = sum(player_points_map.get(obj_id, 0.0) for obj_id in player_object_ids)
                
                # If your logic requires Captain/Vice-Captain multipliers, apply them here.
                # For example:
                # if team.captain_id:
                #     try:
                #         cap_id = PydanticObjectId(team.captain_id)
                #         total += player_points_map.get(cap_id, 0.0) * 1.0 # Extra 1x for captain (total 2x)
                #     except: pass
                # if team.vice_captain_id:
                #     try:
                #         vc_id = PydanticObjectId(team.vice_captain_id)
                #         total += player_points_map.get(vc_id, 0.0) * 0.5 # Extra 0.5x for VC (total 1.5x)
                #     except: pass
                
                team.total_points = total
                team.updated_at = datetime.utcnow()
                await team.save()

        logger.info(f"Sync complete. Updated {updated_count} players. {not_found_count} players not found.")
        return {"success": True, "updated": updated_count, "not_found": not_found_count}
        
    except Exception as e:
        logger.error(f"Error syncing from Google Sheets: {str(e)}")
        raise e
