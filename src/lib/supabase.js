import { createClient } from '@supabase/supabase-js';

// 프로젝트 ID: qsqtoufuwplgmzyvzwvd
const SUPABASE_URL = 'https://qsqtoufuwplgmzyvzwvd.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
