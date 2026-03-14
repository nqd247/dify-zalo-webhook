import express from "express"

const app = express()
app.use(express.json())

// test route
app.get("/", (req, res) => {
  res.send("ShopQR Zalo AI Webhook running")
})

app.post("/zalo/webhook", async (req, res) => {
  try {
    console.log("==== ZALO WEBHOOK RECEIVED ====")
    console.log(JSON.stringify(req.body, null, 2))

    const body = req.body

    const userId =
      body?.sender?.id ||
      body?.sender?.user_id ||
      body?.data?.sender?.id ||
      body?.data?.sender?.user_id ||
      null

    const messageText =
      body?.message?.text ||
      body?.data?.message?.text ||
      ""

    console.log("userId:", userId)
    console.log("message:", messageText)

    // trả 200 ngay cho Zalo
    res.status(200).send("ok")

    if (!userId) return

    const response = await fetch("https://openapi.zalo.me/v2.0/oa/message", {
      method: "POST",
      headers: {
        access_token: process.env.ZALO_OA_ACCESS_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipient: { user_id: String(userId) },
        message: { text: "ShopQR AI đã nhận tin nhắn." }
      })
    })

    const data = await response.json()

    console.log("ZALO REPLY RESULT:", data)

  } catch (err) {
    console.error("Webhook error:", err)
  }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log("Server running on port", PORT)
})
