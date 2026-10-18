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
    paginator = client.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket='eodata', Prefix='Global-Mosaics/Sentinel-2/S2MSI_L3__MCQ_LR/2025/'):
        for item in page.get('Contents', []):
            print(json.dumps({'key': item['Key'], 'size': item['Size'], 'etag': item['ETag']}))


if __name__ == '__main__':
    main()
