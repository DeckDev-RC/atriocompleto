import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sqlPath = path.join(__dirname, '../../supabase/009_create_auto_insights_table.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function applyMigration() {
    console.log('Applying migration...');

    // We can't run arbitrary SQL with the JS client directly unless we have a RPC or something.
    // But wait, the supabaseAdmin.rpc("execute_readonly_query") exists in the codebase!
    // Let's check if there is an "execute_query" (not readonly).

    const { data, error } = await supabase.rpc('execute_readonly_query', {
        query_text: sql
    });

    if (error) {
        console.error('Error applying migration:', error);
        process.exit(1);
    }

    console.log('Migration applied successfully!');
    console.log(data);
}

applyMigration();
