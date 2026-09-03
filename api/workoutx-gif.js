// Vercel serverless function for optional WorkoutX exercise GIFs.
//
// The browser calls /api/workoutx-gif?id=..., and this function calls WorkoutX with the private
// WORKOUTX_API_KEY stored on the server. That keeps the key out of the client bundle and lets the
// app fail gracefully when GIF support is not configured.

// IDs are intentionally constrained before we build the upstream URL. This protects the proxy from
// being used as an arbitrary fetch endpoint.
const GIF_ID_PATTERN = /^[0-9A-Za-z_-]{1,32}$/;

function setNoStore(response) {
  // Error responses should not be cached; a missing key or temporary upstream error should recover
  // as soon as the environment variable or service is fixed.
  response.setHeader("Cache-Control", "no-store");
}

export default async function handler(request, response) {
  // Only GET is needed because the endpoint returns a GIF for one known exercise ID.
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    setNoStore(response);
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const apiKey = process.env.WORKOUTX_API_KEY;
  const requestedId = Array.isArray(request.query.id) ? request.query.id[0] : request.query.id;

  if (!apiKey) {
    // 404 hides the optional integration when the key is absent. The React app simply falls back to
    // YouTube and written cues.
    setNoStore(response);
    response.status(404).json({ error: "workoutx_not_configured" });
    return;
  }

  if (!requestedId || !GIF_ID_PATTERN.test(requestedId)) {
    setNoStore(response);
    response.status(400).json({ error: "invalid_gif_id" });
    return;
  }

  try {
    // Fetch the real GIF from WorkoutX, then stream the bytes back from our own domain so the PWA
    // can display it like a normal same-origin image.
    const upstream = await fetch(`https://api.workoutxapp.com/v1/gifs/${requestedId}.gif`, {
      headers: {
        Accept: "image/gif",
        "X-WorkoutX-Key": apiKey,
      },
    });

    if (!upstream.ok) {
      setNoStore(response);
      response.status(upstream.status).json({ error: "workoutx_fetch_failed" });
      return;
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "image/gif");
    response.setHeader("Content-Length", String(body.byteLength));
    // Successful GIFs can be cached. They are static exercise demos, so caching improves gym-floor
    // performance and reduces API calls.
    response.setHeader(
      "Cache-Control",
      "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
    );
    response.status(200).send(body);
  } catch (error) {
    setNoStore(response);
    response.status(502).json({
      error: "workoutx_unavailable",
      message: error instanceof Error ? error.message : "Could not fetch the GIF.",
    });
  }
}
