
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vkjucnaldkyaehzswysm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZranVjbmFsZGt5YWVoenN3eXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMjI4ODksImV4cCI6MjA4Njg5ODg4OX0.zBJOkDTMdBeRJvvFG6maH4Erig_fsFoGDwzUKgPw1OI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
