// MCP server: lets Claude (or another AI app) answer questions about the portal's data. READ-ONLY.
//
// How sign-in works:
//   1. Claude calls this function with no login and gets "401, sign in at <our Supabase Auth>".
//   2. The admin is sent to the portal's /oauth/consent page, logs in with their normal admin login,
//      and clicks Approve.
//   3. Claude gets a token for that admin. Every call below runs as the admin, so the database's
//      security rules (RLS) decide what can be read. The tools themselves never write.
//
// Deploy:  npx supabase functions deploy mcp --use-api --no-verify-jwt
// (--no-verify-jwt is required: the sign-in check happens in this code, and the first
//  "how do I sign in?" request has no login yet.)
// Connector URL for Claude:  https://<project-ref>.supabase.co/functions/v1/mcp

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { pipeline } from 'npm:@supabase/middleware@1';
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@^1.6.0';
import { createMcpHandler } from 'npm:@modelcontextprotocol/server@^2.4.0';
import { createServer, type Row } from './tools.ts';

const PAGE = 1000;
const MAX_ROWS = 20000;

Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
    async (req, { supabase }) => {
      // Reads a whole table as the signed-in admin (RLS applies), a page at a time.
      const readRows = async (table: string): Promise<Row[]> => {
        const rows: Row[] = [];
        for (let from = 0; from < MAX_ROWS; from += PAGE) {
          const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
          if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
          rows.push(...(data as Row[]));
          if (data.length < PAGE) break;
        }
        return rows;
      };

      const handler = createMcpHandler(() => createServer(readRows), {
        onerror: (error) => console.error('MCP request failed', error),
      });
      return handler.fetch(req);
    },
  ),
);
