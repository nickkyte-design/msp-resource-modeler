export const ENV = {
  supabaseUrl: process.env.SUPABASE_URL || 'https://vkxryacaewoqgiilvtst.supabase.co',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  databaseUrl: process.env.DATABASE_URL || '',
  blobToken: process.env.BLOB_READ_WRITE_TOKEN || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || '3000',
};

if (!ENV.databaseUrl && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL is required in production');
}

if (!ENV.supabaseServiceKey && process.env.NODE_ENV === 'production') {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production');
}
