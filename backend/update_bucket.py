from supabase import create_client, Client
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

url: str = os.environ.get('SUPABASE_URL')
key: str = os.environ.get('SUPABASE_SERVICE_KEY')
supabase: Client = create_client(url, key)

try:
    print('Creating bucket customer-confirmations...')
    res = supabase.storage.create_bucket('customer-confirmations', options={'public': True})
    print(res)
except Exception as e:
    print(f'Error creating bucket: {e}')

try:
    print('Listing buckets...')
    res = supabase.storage.list_buckets()
    for b in res:
        print(b.name)
except Exception as e:
    print(f'Error listing buckets: {e}')
