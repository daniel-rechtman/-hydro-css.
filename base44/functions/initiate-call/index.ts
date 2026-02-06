import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { target_number, source_url, source_page_title, contact_name } = body;

    if (!target_number) {
      return new Response(
        JSON.stringify({ error: "target_number is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get user's phone configuration
    const configs = await base44.entities.PhoneConfig.filter(
      { is_active: true },
      { limit: 1 }
    );

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active phone configuration found. Please set up your phone number first." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const phoneConfig = configs[0];
    const userPhone = phoneConfig.phone_number;

    // Log the call attempt
    const callLog = await base44.entities.CallLog.create({
      target_number,
      source_url: source_url || "",
      source_page_title: source_page_title || "",
      contact_name: contact_name || "",
      status: "initiated",
      call_method: phoneConfig.twilio_enabled ? "twilio_bridge" : "tel_link",
    });

    // If Twilio bridging is enabled, initiate the call via Twilio
    // This requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER
    // to be configured as environment variables / secrets in Base44
    if (phoneConfig.twilio_enabled) {
      try {
        const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
        const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

        if (!twilioSid || !twilioAuth || !twilioPhone) {
          // Update log status to failed
          await base44.entities.CallLog.update(callLog.id, { status: "failed" });
          return new Response(
            JSON.stringify({ error: "Twilio credentials not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        // Twilio REST API to initiate a call
        // First calls the user's phone, then connects to the target number
        const twiml = `<Response><Say language="he-IL">מחבר אותך עכשיו</Say><Dial>${target_number}</Dial></Response>`;

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`;
        const twilioBody = new URLSearchParams({
          To: userPhone,
          From: twilioPhone,
          Twiml: twiml,
        });

        const twilioResponse = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            Authorization: "Basic " + btoa(`${twilioSid}:${twilioAuth}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: twilioBody,
        });

        if (!twilioResponse.ok) {
          const errorBody = await twilioResponse.text();
          console.error("Twilio error:", errorBody);
          await base44.entities.CallLog.update(callLog.id, { status: "failed" });
          return new Response(
            JSON.stringify({ error: "Failed to initiate call via Twilio", details: errorBody }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        const twilioData = await twilioResponse.json();
        await base44.entities.CallLog.update(callLog.id, { status: "connected" });

        return new Response(
          JSON.stringify({
            success: true,
            method: "twilio_bridge",
            call_sid: twilioData.sid,
            message: "Call initiated! Your phone will ring shortly.",
            call_log_id: callLog.id,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      } catch (twilioError) {
        console.error("Twilio bridge error:", twilioError);
        await base44.entities.CallLog.update(callLog.id, { status: "failed" });
        return new Response(
          JSON.stringify({ error: "Twilio bridge error", details: String(twilioError) }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Default: return tel: URI for the extension to handle
    return new Response(
      JSON.stringify({
        success: true,
        method: "tel_link",
        tel_uri: `tel:${target_number}`,
        user_phone: userPhone,
        message: "Call logged. Use tel: link to dial.",
        call_log_id: callLog.id,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("initiate-call error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
