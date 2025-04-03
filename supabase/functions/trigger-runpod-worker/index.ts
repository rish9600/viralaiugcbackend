import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// WARNING: Hardcoding sensitive keys is NOT recommended for production.
// Use environment variables instead.
const RUNPOD_ENDPOINT_URL = Deno.env.get("RUNPOD_ENDPOINT_URL") || "YOUR_RUNPOD_SERVERLESS_ENDPOINT_URL" // e.g., https://api.runpod.ai/v2/your_endpoint_id/runsync
const RUNPOD_API_KEY = Deno.env.get("RUNPOD_API_KEY") || "YOUR_RUNPOD_API_KEY"

// Supabase details (use environment variables in production)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
// Use the Service Role Key for server-side operations ONLY if necessary and secure.
// const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

console.log("Trigger RunPod Worker function initializing...")
console.log(`RunPod Endpoint: ${RUNPOD_ENDPOINT_URL}`)
console.log(`Supabase URL: ${SUPABASE_URL}`)

serve(async (req) => {
  // 1. Check Method and Authorization (Optional but recommended)
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  // Add authorization checks if needed, e.g., using a secret header or Supabase Auth

  // 2. Parse Request Body
  let id: string | null = null
  try {
    const body = await req.json()
    id = body.id // Expecting { "id": "your_video_id" } in the request body
    if (!id) {
      throw new Error("Missing 'id' in request body")
    }
    console.log(`Received request to trigger video generation for ID: ${id}`)
  } catch (error) {
    console.error("Failed to parse request body:", error)
    return new Response(JSON.stringify({ error: `Bad Request: ${error.message}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3. Initialize Supabase Client
  // Use ANON_KEY if row-level security (RLS) allows access.
  // Use SERVICE_ROLE_KEY if you need to bypass RLS (use with extreme caution).
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
     global: { headers: { Authorization: req.headers.get('Authorization')! } }
  });

  try {
    // 4. Fetch data from Supabase
    console.log(`Fetching data for ID: ${id} from generated_videos table...`)
    const { data: videoData, error: dbError } = await supabase
      .from('generated_videos')
      .select('*') // Select all columns needed by the worker
      .eq('id', id)
      .single()

    if (dbError) {
      console.error(`Supabase DB Error for ID ${id}:`, dbError)
      // Check if it's a 'not found' error (PGRST116)
      if (dbError.code === 'PGRST116') {
         return new Response(JSON.stringify({ error: `Record not found for ID: ${id}` }), {
           status: 404,
           headers: { 'Content-Type': 'application/json' },
         })
      }
      return new Response(JSON.stringify({ error: `Database error: ${dbError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!videoData) {
      // Should be caught by PGRST116, but double-check
       return new Response(JSON.stringify({ error: `Record not found for ID: ${id}` }), {
         status: 404,
         headers: { 'Content-Type': 'application/json' },
       })
    }

    console.log(`Successfully fetched data for ID: ${id}`);
    // console.log("Fetched Data:", JSON.stringify(videoData, null, 2)); // Be cautious logging potentially large data

    // 5. Prepare Payload for RunPod
    const runpodPayload = {
      input: {
        id: videoData.id, // Pass the ID
        ...videoData,    // Spread the rest of the fetched data
      },
    }

    // 6. Trigger RunPod Worker
    console.log(`Sending request to RunPod endpoint: ${RUNPOD_ENDPOINT_URL}`);
    const runpodResponse = await fetch(RUNPOD_ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify(runpodPayload),
    });

    // 7. Handle RunPod Response
    console.log(`RunPod response status: ${runpodResponse.status}`);
    const runpodResult = await runpodResponse.json();
    // console.log("RunPod response body:", JSON.stringify(runpodResult, null, 2));

    if (!runpodResponse.ok) {
        console.error(`RunPod API Error (Status: ${runpodResponse.status}):`, runpodResult);
        // Optionally update Supabase status to 'failed' here if the trigger failed
         try {
            await supabase
                .from("generated_videos")
                .update({ status: "failed", error_message: `RunPod trigger failed: ${runpodResult.error || runpodResponse.statusText}` })
                .eq("id", id);
        } catch (updateError) {
            console.error(`Failed to update Supabase status to 'failed' after RunPod error for ID ${id}:`, updateError);
        }
        return new Response(JSON.stringify({ error: 'Failed to trigger RunPod worker', details: runpodResult }), {
            status: runpodResponse.status, // Forward RunPod status
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // RunPod accepted the job (for /runsync, it might include results; for /run, just acknowledgement)
    console.log(`Successfully triggered RunPod worker for ID: ${id}. RunPod response:`, runpodResult);

    // Return success response (might include RunPod job ID if using /run)
    return new Response(JSON.stringify({ success: true, message: 'RunPod worker triggered successfully', runpodResponse: runpodResult }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error(`Unexpected error in Edge Function for ID ${id}:`, error)
     // Attempt to update Supabase status to 'failed' on unexpected errors
    try {
        await supabase
            .from("generated_videos")
            .update({ status: "failed", error_message: `Edge function error: ${error.message}` })
            .eq("id", id);
    } catch (updateError) {
        console.error(`Failed to update Supabase status to 'failed' after unexpected error for ID ${id}:`, updateError);
    }
    return new Response(JSON.stringify({ error: `Internal Server Error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

/*
Example Usage:

1. Set Environment Variables in Supabase Function settings:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - RUNPOD_ENDPOINT_URL (e.g., https://api.runpod.ai/v2/<your_endpoint_id>/runsync)
   - RUNPOD_API_KEY

2. Deploy the function:
   supabase functions deploy trigger-runpod-worker --no-verify-jwt

3. Invoke the function (e.g., using curl or from your app):
   curl -X POST <YOUR_FUNCTION_URL> \
     -H "Authorization: Bearer <YOUR_SUPABASE_ANON_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"id": "<your_generated_video_id>"}'

*/
