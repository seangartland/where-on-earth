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
}
# Entries Sean added to the mechanically derived core in the curated 121 review.
# These are stable bank ids so similarly named places cannot be pulled in by
# accident; the name+country resolution was audited against pack-lists.json.
CURATED_ADDITION_IDS = {
    'ak-baital-pass', 'angel-falls', 'bering-strait', 'grand-canyon',
    'great-barrier-reef', 'iguazu-falls',
    'k2', 'mount-etna', 'mount-everest-summit', 'niagara-falls',
    'strait-of-gibraltar',
    'victoria-falls',
    'giants-causeway', 'milford-sound', 'mount-elbrus',
    'perito-moreno-glacier', 'table-mountain',
    'badlands-national-park', 'badwater-basin', 'balanced-rock-utah',
    'ben-nevis', 'black-forest', 'challenger-deep', 'champagne-pool',
    'daintree-rainforest', 'danakil-depression', 'danube-delta',
    'delicate-arch-utah', 'denali', 'emi-koussi-chad',
    'fitz-roy-laguna-de-los-tres', 'geysir-d34-42',
    'grand-prismatic-yellowstone', 'great-blue-hole', 'great-sea-reef',
    'half-dome-us', 'horseshoe-bend', 'hunga-tonga-2022-eruption',
    'jungfrau', 'kakadu', 'kirkjufell-iceland', 'krakatoa-1883-eruption',
    'laguna-colorada-viewpoint', 'lencois-maranhenses', 'masai-mara',
    'mauna-kea', 'moeraki-boulders', 'mont-blanc',
    'monument-valley-mitten', 'nourlangie-rock', 'okefenokee-swamp',
    'old-faithful-yellowstone', 'pamukkale-turkey', 'phong-nha-ke-bang',
    'pico-do-fogo-cape-verde', 'piedra-del-cocuy',
    'piton-de-la-fournaise', 'pitons-of-saint-lucia',
    'preikestolen-pulpit-rock', 'redwood-national-and-state-parks',
    'richat-structure', 'rock-of-gibraltar', 'sea-of-galilee',
    'serra-da-capivara-boqueirao', 'snowdon', 'son-doong-vietnam',
    'sossusvlei', 'sossusvlei-dead-vlei', 'spitzkoppe', 'thingvellir',
    'tsingy-de-bemaraha', 'twelve-apostles', 'valle-de-la-luna-chile',
    'vatnajökull-d34-44', 'wadi-rum', 'yolyn-am-mongolia',
    # The 49 landforms added 2026-10-30 (chunk 3 of the pack additions):
    # listed explicitly so membership never depends on the name pattern.
    'aconcagua', 'aletsch-glacier', 'antelope-canyon', 'aoraki-mount-cook',
    'atacama', 'bay-of-fundy', 'belize-barrier-reef', 'bryce-canyon',
    'cappadocia', 'carlsbad-caverns', 'caspian-sea', 'colca-canyon',
    'devils-tower', 'eiger', 'fish-river-canyon', 'franz-josef-glacier',
    'gobi', 'guilin-karst', 'huangshan', 'ilulissat-icefjord',
    'kaieteur-falls', 'kalahari', 'kilauea', 'lake-tahoe',
    'lake-tanganyika', 'lake-toba', 'mammoth-cave', 'mauna-loa',
    'mount-ararat', 'mount-olympus', 'mount-rainier', 'mount-roraima',
    'mount-st-helens', 'mount-tambora', 'mount-vinson', 'namib',
    'okavango-delta', 'puncak-jaya', 'rhine-falls', 'rub-al-khali',
    'sahara', 'santorini-caldera', 'seljalandsfoss', 'stromboli',
    'the-wave', 'tugela-falls', 'verdon-gorge', 'waitomo-glowworm-caves',
    'yosemite-falls',
    # The 19 whole-river extent cards added 2026-10-30 (chunk 4 of the pack
    # additions): listed explicitly so membership never depends on the name
    # pattern (river names carry no formation word). Paraná and Murray were
    # held at the Natural Earth coverage gate and are NOT members.
    'amazon-river', 'amur-river', 'congo-river', 'danube-river',
    'ganges-river', 'indus-river', 'lena-river', 'mackenzie-river',
    'mekong-river', 'mississippi-river', 'niger-river', 'nile-river',
    'ob-irtysh-river', 'volga-river', 'yangtze-river', 'yellow-river',
    'yenisei-river', 'yukon-river', 'zambezi-river',
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
