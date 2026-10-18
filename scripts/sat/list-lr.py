#!/usr/bin/env python3
"""List the 2025 low-resolution mosaic objects as JSON lines."""
import json
import os
from pathlib import Path

import boto3


HERE = Path(__file__).resolve().parent


def load_env():
    values = {}
    for line in (HERE / '.env').read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"\'')
    return values


def main():
    env = load_env()
    client = boto3.client(
        's3',
        endpoint_url='https://eodata.dataspace.copernicus.eu',
        aws_access_key_id=os.environ.get('CDSE_S3_ACCESS_KEY', env.get('CDSE_S3_ACCESS_KEY')),
        aws_secret_access_key=os.environ.get('CDSE_S3_SECRET_KEY', env.get('CDSE_S3_SECRET_KEY')),
    )
    # This endpoint returns empty Contents for high-level recursive
    # listings; descend level by level with a delimiter, then list
    # each block folder's contents (traversal proven by the
    # orchestrator's 2026-10-18 census, which this replaces).
    def list_page(prefix, delimiter=None):
        kwargs = {'Bucket': 'eodata', 'Prefix': prefix, 'MaxKeys': 1000}
        if delimiter:
            kwargs['Delimiter'] = delimiter
        token = None
        contents, prefixes = [], []
        while True:
            if token:
                kwargs['ContinuationToken'] = token
            page = client.list_objects_v2(**kwargs)
            contents += page.get('Contents', [])
            prefixes += page.get('CommonPrefixes', [])
            if not page.get('IsTruncated'):
                return contents, prefixes
            token = page.get('NextContinuationToken')

    base = 'Global-Mosaics/Sentinel-2/S2MSI_L3__MCQ_LR/2025/'
    _, quarters = list_page(base, delimiter='/')
    for quarter in quarters:
        _, days = list_page(quarter['Prefix'], delimiter='/')
        for day in days:
            _, blocks = list_page(day['Prefix'], delimiter='/')
            for block in blocks:
                contents, _ = list_page(block['Prefix'])
                for item in contents:
                    print(json.dumps({'key': item['Key'], 'size': item['Size'], 'etag': item['ETag']}))


if __name__ == '__main__':
    main()
