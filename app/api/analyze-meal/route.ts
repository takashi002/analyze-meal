import { generateObject } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"

const nutritionSchema = z.object({
  name: z.string().describe("食事の名前（日本語）"),
  calories: z.number().describe("推定カロリー（kcal）"),
  protein: z.number().describe("タンパク質（g）"),
  fat: z.number().describe("脂質（g）"),
  carbs: z.number().describe("炭水化物（g）"),
  confidence: z.number().min(0).max(1).describe("分析の信頼度（0-1）"),
})

export async function POST(request: Request) {
  try {
    console.log("API route called")
    console.log("Environment:", process.env.NODE_ENV)
    console.log("Platform:", process.env.VERCEL ? "Vercel" : "Local")

    // 環境変数の確認
    const apiKey = process.env.ANTHROPIC_API_KEY

    console.log("Environment variables check:")
    console.log("ANTHROPIC_API_KEY exists:", !!process.env.ANTHROPIC_API_KEY)

    if (!apiKey) {
      console.error("No API key found in environment variables")

      const errorMessage = process.env.VERCEL
        ? "APIキーがVercelの環境変数に設定されていません。Vercelダッシュボードで ANTHROPIC_API_KEY を設定してください。"
        : "APIキーが設定されていません。.env.localファイルを確認してください。"

      return Response.json(
        {
          error: errorMessage,
          debug:
            process.env.NODE_ENV === "development"
              ? {
                  hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
                  nodeEnv: process.env.NODE_ENV,
                  platform: process.env.VERCEL ? "Vercel" : "Local",
                }
              : undefined,
        },
        { status: 500 },
      )
    }

    // APIキーが存在する場合は、詳細情報をログに出さない
    if (process.env.NODE_ENV === "development") {
      console.log("API key configured successfully")
    }

    const { image } = await request.json()

    if (!image) {
      console.error("No image provided")
      return Response.json({ error: "画像が提供されていません" }, { status: 400 })
    }

    // 画像データのサイズをチェック
    const imageSizeKB = Math.round((image.length * 3) / 4 / 1024)
    console.log(`Image size: ${imageSizeKB}KB`)

    if (imageSizeKB > 5000) {
      return Response.json({ error: "画像サイズが大きすぎます。より小さな画像をお試しください。" }, { status: 413 })
    }

    console.log("Starting AI analysis...")

    const result = await generateObject({
      model: anthropic("claude-3-5-sonnet-20241022"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "この食事の写真を分析して、料理名、カロリー、PFC（タンパク質・脂質・炭水化物）を推定してください。日本の一般的な食事として分析し、料理名は日本語で回答してください。分析の信頼度も0-1の範囲で評価してください。できるだけ正確な数値を提供してください。",
            },
            {
              type: "image",
              image: image,
            },
          ],
        },
      ],
      schema: nutritionSchema,
      maxTokens: 1000,
    })

    console.log("AI analysis completed:", result.object)

    return Response.json(result.object)
  } catch (error) {
    console.error("Detailed analysis error:", error)

    if (error instanceof Error) {
      console.error("Error message:", error.message)
      console.error("Error stack:", error.stack)

      // Anthropic API特有のエラーをチェック
      if (error.message.includes("401") || error.message.includes("authentication")) {
        return Response.json(
          {
            error: "APIキーが無効です。Vercelの環境変数で正しいAPIキーが設定されているか確認してください。",
          },
          { status: 401 },
        )
      }

      if (error.message.includes("429")) {
        return Response.json(
          { error: "APIの利用制限に達しました。しばらく待ってからお試しください。" },
          { status: 429 },
        )
      }

      if (error.message.includes("400")) {
        return Response.json({ error: "リクエストの形式が正しくありません。画像を確認してください。" }, { status: 400 })
      }

      return Response.json(
        {
          error: `分析中にエラーが発生しました: ${error.message}`,
          details: process.env.NODE_ENV === "development" ? error.stack : undefined,
        },
        { status: 500 },
      )
    }

    return Response.json(
      { error: "予期しないエラーが発生しました。しばらく待ってからお試しください。" },
      { status: 500 },
    )
  }
}
