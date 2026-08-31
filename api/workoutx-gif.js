const GIF_ID_PATTERN = /^[0-9A-Za-z_-]{1,32}$/;

function setNoStore(response) {
  response.setHeader("Cache-Control", "no-store");
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    setNoStore(response);
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const apiKey = process.env.WORKOUTX_API_KEY;
  const requestedId = Array.isArray(request.query.id) ? request.query.id[0] : request.query.id;

  if (!apiKey) {
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
