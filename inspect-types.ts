import { Database } from './src/lib/database.types'; type Tables = keyof Database['public']['Tables']; const t: Tables = 'client_intake'; console.log(t);
