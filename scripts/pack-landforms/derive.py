"""Derive the natural-landform subset of the landmarks bank.

Run from the repository root:
    python3 scripts/pack-landforms/derive.py
"""
import json
import re
from pathlib import Path


PATTERN = re.compile(
    r"mount|\bmt(?:\.|[\s-])|peak|volcano|summit|crater|lake|lago|lagoon|loch|falls|foss|"
    r"canyon|gorge|glacier|desert|salar|salt flat|cave|cliff|fjord|fiord|geyser|"
    r"national park|national monument",
    re.IGNORECASE,
)
ADDITIONS = {
    'Uluru', 'Zhangjiajie', 'Ha Long Bay', 'Jokulsarlon', 'Jökulsárlón',
    'Trolltunga', 'Chocolate Hills', 'Dead Sea', 'Torres del Paine',
    'Yosemite Valley', 'Kjeragbolten', 'Aitutaki Lagoon',
}
EXCLUSIONS = {
    'Dome of the Rock', 'Dome Fuji Station', 'Gateway Arch', 'Grise Fiord',
    'Uyuni Salt Flats', 'Lakehurst Hindenburg Site', 'Pueblo Bonito', 'Vardzia',
    # Built structures banked with the 2026-10-30 landmark additions whose
    # names trip the pattern ('Caves' sites and two mountains in name only);
    # they belong to Landmarks, not Landforms.
    'Ajanta Caves', 'Ellora Caves', 'Mount Rushmore', 'Sugarloaf Mountain',
    # Same pattern trap from the 2026-10-30 audit-2 landmark additions,
    # caught when chunk 7 regenerated the set: a cave temple and an estate
    # that is a mountain in name only; both belong to Landmarks.
    'Batu Caves', 'Mount Vernon',
}
# Entries Sean added to the mechanically derived core in the curated 121 review.
# These are stable bank ids so similarly named places cannot be pulled in by
# accident; the name+country resolution was audited against pack-lists.json.
# Scrub 3 (2026-10-30) removed eight curated ids together with their
# bank entries (quarantined on measured obscurity): ak-baital-pass,
# balanced-rock-utah, champagne-pool, great-sea-reef, nourlangie-rock,
# piedra-del-cocuy, serra-da-capivara-boqueirao, yolyn-am-mongolia.
# Four more dropped landforms (blyde-river-canyon, halemaumau-crater,
# monkey-gorge-zimbabwe, pohutu-geyser) entered only through the name
# pattern and leave with their bank entries on their own.
# Scrub 4 (2026-10-30, the under-100-views/day threshold cut) removed 22
# more curated ids together with their bank entries: aletsch-glacier,
# belize-barrier-reef, colca-canyon, emi-koussi-chad, fish-river-canyon,
# franz-josef-glacier, ilulissat-icefjord, kirkjufell-iceland,
# laguna-colorada-viewpoint, moeraki-boulders, phong-nha-ke-bang,
# pico-do-fogo-cape-verde, piton-de-la-fournaise, pitons-of-saint-lucia,
# seljalandsfoss, sossusvlei, sossusvlei-dead-vlei, spitzkoppe,
# tsingy-de-bemaraha, valle-de-la-luna-chile, waitomo-glowworm-caves,
# yosemite-falls. The cut's other 15 landforms (dettifoss,
# el-tatio-geysers, etosha-national-park, fiordland-national-park,
# flaming-cliffs-bayanzag, geirangerfjord-no, jokulsarlon-glacier-lagoon,
# kjeragbolten, lifou-cliffs, mt-ngauruhoe, mt-orohena, mt-yasur,
# sagarmatha-national-park, skógafoss-d34-43, thabana-ntlenyana-summit)
# entered only through the name pattern (or the ADDITIONS names, for
# jokulsarlon-glacier-lagoon and kjeragbolten) and leave on their own.
CURATED_ADDITION_IDS = {
    'angel-falls', 'bering-strait', 'grand-canyon',
    'great-barrier-reef', 'iguazu-falls',
    'k2', 'mount-etna', 'mount-everest-summit', 'niagara-falls',
    'strait-of-gibraltar',
    'victoria-falls',
    'giants-causeway', 'milford-sound', 'mount-elbrus',
    'perito-moreno-glacier', 'table-mountain',
    'badlands-national-park', 'badwater-basin',
    'ben-nevis', 'black-forest', 'challenger-deep',
    'daintree-rainforest', 'danakil-depression', 'danube-delta',
    'delicate-arch-utah', 'denali',
    'fitz-roy-laguna-de-los-tres', 'geysir-d34-42',
    'grand-prismatic-yellowstone', 'great-blue-hole',
    'half-dome-us', 'horseshoe-bend', 'hunga-tonga-2022-eruption',
    'jungfrau', 'kakadu', 'krakatoa-1883-eruption',
    'lencois-maranhenses', 'masai-mara',
    'mauna-kea', 'mont-blanc',
    'monument-valley-mitten', 'okefenokee-swamp',
    'old-faithful-yellowstone', 'pamukkale-turkey',
    'preikestolen-pulpit-rock', 'redwood-national-and-state-parks',
    'richat-structure', 'rock-of-gibraltar', 'sea-of-galilee',
    'snowdon', 'son-doong-vietnam',
    'thingvellir',
    'twelve-apostles',
    'vatnajökull-d34-44', 'wadi-rum',
    # The 49 landforms added 2026-10-30 (chunk 3 of the pack additions):
    # listed explicitly so membership never depends on the name pattern.
    'aconcagua', 'antelope-canyon', 'aoraki-mount-cook',
    'atacama', 'bay-of-fundy', 'bryce-canyon',
    'cappadocia', 'carlsbad-caverns', 'caspian-sea',
    'devils-tower', 'eiger',
    'gobi', 'guilin-karst', 'huangshan',
    'kaieteur-falls', 'kalahari', 'kilauea', 'lake-tahoe',
    'lake-tanganyika', 'lake-toba', 'mammoth-cave', 'mauna-loa',
    'mount-ararat', 'mount-olympus', 'mount-rainier', 'mount-roraima',
    'mount-st-helens', 'mount-tambora', 'mount-vinson', 'namib',
    'okavango-delta', 'puncak-jaya', 'rhine-falls', 'rub-al-khali',
    'sahara', 'santorini-caldera', 'stromboli',
    'the-wave', 'tugela-falls', 'verdon-gorge',
    # The 19 whole-river extent cards added 2026-10-30 (chunk 4 of the pack
    # additions): listed explicitly so membership never depends on the name
    # pattern (river names carry no formation word). Paraná and Murray were
    # held at the Natural Earth coverage gate and are NOT members.
    'amazon-river', 'amur-river', 'congo-river', 'danube-river',
    'ganges-river', 'indus-river', 'lena-river', 'mackenzie-river',
    'mekong-river', 'mississippi-river', 'niger-river', 'nile-river',
    'ob-irtysh-river', 'volga-river', 'yangtze-river', 'yellow-river',
    'yenisei-river', 'yukon-river', 'zambezi-river',
    # The 10 landforms added 2026-10-30 (chunk 7, the audit-2 glaring
    # tier): four radius areas, four whole-river extent cards and two
    # point mountains, listed explicitly on the same precedent. The
    # tier's eleventh entry, the River Thames, was held at the Natural
    # Earth coverage gate (267 of 346 km, 77%) and is NOT a member.
    'amazon-rainforest', 'aral-sea', 'socotra', 'mojave-desert',
    'rhine-river', 'euphrates-river', 'colorado-river', 'missouri-river',
    'mount-sinai', 'kangchenjunga',
}


def main():
    bank = json.loads(Path('assets/locations-landmarks-sol.json').read_text())
    bank_ids = {item['id'] for item in bank}
    missing_additions = CURATED_ADDITION_IDS - bank_ids
    if missing_additions:
        raise ValueError(f'curated landform ids missing from bank: {sorted(missing_additions)}')
    selected = set(CURATED_ADDITION_IDS)
    for item in bank:
        name = item.get('short', '')
        if name in EXCLUSIONS:
            continue
        # The id is the bank's stable, unaccented name slug and sometimes
        # preserves a formation word omitted by the display name.
        if PATTERN.search(f"{name} {item['id']}") or name in ADDITIONS:
            selected.add(item['id'])
    selected = sorted(selected)
    body = ',\n'.join(f"  {item_id!r}" for item_id in selected)
    Path('src/meta/pack-landforms.js').write_text(
        '// Natural formations in assets/locations-landmarks-sol.json. Generated by\n'
        '// scripts/pack-landforms/derive.py; edit the derivation rules, not this file.\n'
        f'export const PACK_LANDFORM_IDS = new Set([\n{body},\n]);\n'
    )
    print(f'{len(selected)} landforms')
    print(json.dumps(selected))


if __name__ == '__main__':
    main()
