app.post("/zalo/webhook", async (req, res) => {
  try {
    console.log("==== ZALO WEBHOOK RECEIVED ====");
    console.log("RAW BODY:", JSON.stringify(req.body, null, 2));

    const body = req.body;

    const userId =
      body?.sender?.id ||
      body?.sender?.user_id ||
      body?.data?.sender?.id ||
      body?.data?.sender?.user_id ||
      body?.source?.uid ||
      null;

    const messageText =
      body?.message?.text ||
      body?.data?.message?.text ||
      "";

    console.log("Parsed userId:", userId);
    console.log("Parsed messageText:", messageText);

    // trả 200 ngay cho Zalo
    res.status(200).send("ok");

    if (!userId) {
      console.log("No userId found");
      return;
    }

    const response = await fetch("https://openapi.zalo.me/v2.0/oa/message", {
      method: "POST",
      headers: {
        access_token: process.env.ZALO_OA_ACCESS_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipient: { user_id: String(userId) },
        message: { text: "ShopQR AI đã nhận tin nhắn của anh/chị." }
      })
    });

    const data = await response.json();
    console.log("ZALO REPLY RESULT:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("WEBHOOK ERROR:", err);
    if (!res.headersSent) res.status(200).send("ok");
  }
});
