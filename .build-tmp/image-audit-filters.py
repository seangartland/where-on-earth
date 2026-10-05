#!/usr/bin/env python3
import json
import os
import re

# Use assets/locations.json as source
with open('/home/hatch/workspace/map-game/demo/assets/locations.json') as f:
    locations = json.load(f)

flagged = []
total = len(locations)

hat_keywords = re.compile(r'fez|hat|beret|cap|helmet|beanie|bowler|fedora|trilby', re.I)
swim_keywords = re.compile(r'swim|swimming|channel|crossing|d-day|dday|normandy|landing|beach|troops', re.I)
map_keywords = re.compile(r'map|world map|globe|atlas|cartography|chart|diagram', re.I)
logo_keywords = re.compile(r'logo|emblem|crest|coat of arms|flag|banner', re.I)
meme_keywords = re.compile(r'meme|template|placeholder|default|missing|not found|404|no-image', re.I)
commons_bad = re.compile(r'commons\.wikimedia\.org.*(icon|template|default|placeholder)', re.I)

for loc in locations:
    name = loc.get('name', '')
    clue = loc.get('clue', '')
    fact = loc.get('fact', '')
    image_url = loc.get('image', '') or ''
    
    name_lower = name.lower()
    combined = f"{name} {clue} {fact}".lower()
    
    # Fez city vs hat
    if name_lower == 'fez, morocco' or name_lower == 'fez':
        if hat_keywords.search(image_url) and 'fez' in image_url.lower():
            flag = True
            # Often hat photos have "fez" prominently
            flagged.append({
                'id': loc['id'],
                'current_image_url': image_url,
                'reason': 'city_name_gets_hat_image'
            })
            continue
    
    # Swim/channel events with war imagery
    if swim_keywords.search(name_lower):
        if re.search(r'd-day|normandy|invasion|troops|soldier|landing craft|omaha|utah|operation overlord', combined + ' ' + image_url, re.I):
            flagged.append({
                'id': loc['id'],
                'current_image_url': image_url,
                'reason': 'event_type_mismatch_war_image'
            })
            continue
    
    # Generic map for descriptive location
    if map_keywords.search(image_url) and not 'map' in name_lower:
        flagged.append({
            'id': loc['id'],
            'current_image_url': image_url,
            'reason': 'generic_map_instead_of_location'
        })
        continue
    
    # Logo/crest for geographic settlements
    if logo_keywords.search(image_url):
        if any(word in name_lower for word in ['city', 'town', 'village', 'district', 'neighborhood', 'suburb']):
            flagged.append({
                'id': loc['id'],
                'current_image_url': image_url,
                'reason': 'settlement_shows_logo_crest'
            })
            continue
    
    # Placeholder images
    if commons_bad.search(image_url) or meme_keywords.search(image_url):
        flagged.append({
            'id': loc['id'],
            'current_image_url': image_url,
            'reason': 'generic_placeholder'
        })
        continue

os.makedirs('/home/hatch/workspace/map-game/demo/.build-tmp', exist_ok=True)
with open('/home/hatch/workspace/map-game/demo/.build-tmp/flagged-candidates.json', 'w') as f:
    json.dump(flagged, f, indent=2)

print(f'Total locations: {total}')
print(f'Flagged candidates: {len(flagged)}')
