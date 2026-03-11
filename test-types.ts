import { Database } from './src/lib/database.types'; type CI = Database['public']['Tables']['client_intake']['Row']; const ci: CI = {} as any; console.log(ci.weight_kg);
