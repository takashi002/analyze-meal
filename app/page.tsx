"use client"

import React from "react"

import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, Camera, Loader2, X, RotateCcw, BarChart3, History, Home, AlertCircle } from "lucide-react"
import Image from "next/image"
import { saveMealData, type MealRecord } from "@/lib/meal-storage"
import { getTodayMeals, getAllMealsGroupedByDate } from "@/lib/meal-storage"

interface NutritionData {
  name: string
  calories: number
  protein: number
  fat: number
  carbs: number
  confidence: number
}

type TabType = "analyze" | "today" | "history"

export default function MealAnalyzer() {
  const [activeTab, setActiveTab] = useState<TabType>("analyze")
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [nutritionData, setNutritionData] = useState<NutritionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showFullImage, setShowFullImage] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isCompressing, setIsCompressing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // 画像を圧縮する関数
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      const img = new window.Image()

      img.onload = () => {
        // 最大サイズを設定（長辺800px）
        const maxSize = 800
        let { width, height } = img

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width
            width = maxSize
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height
            height = maxSize
          }
        }

        canvas.width = width
        canvas.height = height

        // 画像を描画
        ctx?.drawImage(img, 0, 0, width, height)

        // JPEG形式で圧縮（品質0.8）
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.8)
        resolve(compressedDataUrl)
      }

      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"))
      img.src = URL.createObjectURL(file)
    })
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setIsCompressing(true)
      setError(null)

      try {
        // ファイルサイズをチェック（10MB以上の場合は警告）
        if (file.size > 10 * 1024 * 1024) {
          setError("画像サイズが大きすぎます。圧縮処理を行います...")
        }

        // 画像を圧縮
        const compressedImage = await compressImage(file)
        setSelectedImage(compressedImage)
        setNutritionData(null)
        setIsSaved(false)
        setError(null)
      } catch (err) {
        setError("画像の処理中にエラーが発生しました。別の画像をお試しください。")
        console.error("Image compression error:", err)
      } finally {
        setIsCompressing(false)
      }
    }
  }

  const handleCameraCapture = () => {
    cameraInputRef.current?.click()
  }

  const handleGallerySelect = () => {
    fileInputRef.current?.click()
  }

  const resetImage = () => {
    setSelectedImage(null)
    setNutritionData(null)
    setError(null)
    setIsSaved(false)
  }

  const analyzeImage = async () => {
    if (!selectedImage) return

    setIsAnalyzing(true)
    setError(null)

    try {
      // データサイズをチェック
      const imageSizeKB = Math.round((selectedImage.length * 3) / 4 / 1024)
      console.log(`画像サイズ: ${imageSizeKB}KB`)

      const response = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: selectedImage }),
      })

      const responseText = await response.text()
      console.log("Response status:", response.status)
      console.log("Response text:", responseText.substring(0, 200) + "...")

      if (!response.ok) {
        let errorData
        try {
          errorData = JSON.parse(responseText)
        } catch {
          errorData = { error: "サーバーから無効な応答が返されました" }
        }

        console.error("API Error:", response.status, errorData)

        if (response.status === 401) {
          throw new Error("APIキーが無効です。設定を確認してください。")
        } else if (response.status === 413) {
          throw new Error("画像サイズが大きすぎます。より小さな画像をお試しください。")
        } else if (response.status === 429) {
          throw new Error("リクエストが多すぎます。しばらく待ってからお試しください。")
        } else if (response.status >= 500) {
          throw new Error(`サーバーエラーが発生しました: ${errorData.error || "不明なエラー"}`)
        } else {
          throw new Error(errorData.error || `分析に失敗しました (エラーコード: ${response.status})`)
        }
      }

      const data = JSON.parse(responseText)
      setNutritionData(data)
    } catch (err) {
      console.error("Analysis error:", err)

      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("画像の分析中に予期しないエラーが発生しました。ネットワーク接続を確認してお試しください。")
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  const saveMeal = () => {
    if (!nutritionData) return

    const mealRecord: MealRecord = {
      id: Date.now().toString(),
      date: new Date().toISOString().split("T")[0],
      timestamp: new Date().toISOString(),
      name: nutritionData.name,
      calories: nutritionData.calories,
      carbs: nutritionData.carbs,
      protein: nutritionData.protein,
      fat: nutritionData.fat,
      confidence: nutritionData.confidence,
      image: selectedImage || undefined,
    }

    saveMealData(mealRecord)
    setIsSaved(true)

    // カスタムイベントを発火してデータ更新を通知
    window.dispatchEvent(new CustomEvent("mealDataUpdated"))
  }

  const calculatePFCRatio = (carbs: number, protein: number, fat: number) => {
    const carbsCal = carbs * 4
    const proteinCal = protein * 4
    const fatCal = fat * 9
    const total = carbsCal + proteinCal + fatCal

    if (total === 0) return "0:0:0"

    const carbsRatio = Math.round((carbsCal / total) * 100)
    const proteinRatio = Math.round((proteinCal / total) * 100)
    const fatRatio = Math.round((fatCal / total) * 100)

    return `${carbsRatio}:${proteinRatio}:${fatRatio}`
  }

  if (activeTab === "today") {
    return <TodaySummary onTabChange={setActiveTab} />
  }

  if (activeTab === "history") {
    return <HistoryView onTabChange={setActiveTab} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-blue-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900 text-center">食事分析アプリ</h1>
          <p className="text-sm text-gray-600 text-center mt-1">写真でカロリー・PFC自動計算</p>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-20">
        {/* 画像アップロード・表示エリア */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {selectedImage ? (
              <div className="relative">
                <div className="relative w-full h-64 cursor-pointer" onClick={() => setShowFullImage(true)}>
                  <Image
                    src={selectedImage || "/placeholder.svg"}
                    alt="アップロードされた食事"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-10 transition-all flex items-center justify-center">
                    <div className="bg-white bg-opacity-80 px-3 py-1 rounded-full text-sm">タップで拡大</div>
                  </div>
                </div>
                <Button
                  onClick={resetImage}
                  size="sm"
                  variant="secondary"
                  className="absolute top-2 right-2 h-8 w-8 p-0 rounded-full"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="p-6 text-center space-y-4">
                <Camera className="w-16 h-16 mx-auto text-gray-400" />
                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-900">食事の写真を追加</h3>
                  <p className="text-sm text-gray-600">カメラで撮影するか、ギャラリーから選択</p>
                  <p className="text-xs text-gray-500">※大きな画像は自動で圧縮されます</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* アクションボタン */}
        {!selectedImage ? (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleCameraCapture}
              size="lg"
              className="h-14 flex flex-col gap-1"
              disabled={isCompressing}
            >
              <Camera className="w-6 h-6" />
              <span className="text-sm">カメラ撮影</span>
            </Button>
            <Button
              onClick={handleGallerySelect}
              variant="outline"
              size="lg"
              className="h-14 flex flex-col gap-1 bg-transparent"
              disabled={isCompressing}
            >
              <Upload className="w-6 h-6" />
              <span className="text-sm">ギャラリー</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button onClick={analyzeImage} disabled={isAnalyzing || isCompressing} size="lg" className="w-full h-14">
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 mr-2" />
                  栄養分析を開始
                </>
              )}
            </Button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={handleCameraCapture}
                variant="outline"
                size="sm"
                className="h-10 bg-transparent"
                disabled={isCompressing}
              >
                <Camera className="w-4 h-4 mr-2" />
                再撮影
              </Button>
              <Button
                onClick={resetImage}
                variant="outline"
                size="sm"
                className="h-10 bg-transparent"
                disabled={isCompressing}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                リセット
              </Button>
            </div>
          </div>
        )}

        {/* 圧縮中表示 */}
        {isCompressing && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm flex items-center">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            画像を圧縮しています...
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start">
            <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* 栄養情報表示 */}
        {nutritionData && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-center">
                <div className="text-lg font-bold text-gray-900">{nutritionData.name}</div>
                <div className="text-sm text-gray-600 mt-1">信頼度: {Math.round(nutritionData.confidence * 100)}%</div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* カロリー表示 */}
              <div className="bg-orange-50 p-4 rounded-xl text-center">
                <div className="text-3xl font-bold text-orange-600">{nutritionData.calories}</div>
                <div className="text-sm text-orange-700 font-medium">カロリー (kcal)</div>
              </div>

              {/* PFC表示（炭水化物、タンパク質、脂質の順） */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 p-3 rounded-lg text-center">
                  <div className="text-xl font-bold text-green-600">{nutritionData.carbs}g</div>
                  <div className="text-xs text-green-700">炭水化物</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg text-center">
                  <div className="text-xl font-bold text-blue-600">{nutritionData.protein}g</div>
                  <div className="text-xs text-blue-700">タンパク質</div>
                </div>
                <div className="bg-yellow-50 p-3 rounded-lg text-center">
                  <div className="text-xl font-bold text-yellow-600">{nutritionData.fat}g</div>
                  <div className="text-xs text-yellow-700">脂質</div>
                </div>
              </div>

              {/* PFC比率 */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-3 text-center">PFC比率</h4>
                <div className="text-center mb-3">
                  <div className="text-lg font-bold text-gray-800">
                    {calculatePFCRatio(nutritionData.carbs, nutritionData.protein, nutritionData.fat)}
                  </div>
                  <div className="text-xs text-gray-600">炭水化物:タンパク質:脂質</div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-green-700">炭水化物</span>
                    <span className="font-semibold text-green-700">
                      {Math.round(((nutritionData.carbs * 4) / nutritionData.calories) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-blue-700">タンパク質</span>
                    <span className="font-semibold text-blue-700">
                      {Math.round(((nutritionData.protein * 4) / nutritionData.calories) * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-yellow-700">脂質</span>
                    <span className="font-semibold text-yellow-700">
                      {Math.round(((nutritionData.fat * 9) / nutritionData.calories) * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* 保存ボタン */}
              <Button
                onClick={saveMeal}
                disabled={isSaved}
                className="w-full h-12"
                variant={isSaved ? "secondary" : "default"}
              >
                {isSaved ? "保存済み ✓" : "食事を記録する"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* フルスクリーン画像表示 */}
      {showFullImage && selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
          onClick={() => setShowFullImage(false)}
        >
          <div className="relative max-w-full max-h-full">
            <Image
              src={selectedImage || "/placeholder.svg"}
              alt="食事の写真"
              width={400}
              height={400}
              className="max-w-full max-h-full object-contain"
            />
            <Button
              onClick={() => setShowFullImage(false)}
              size="sm"
              variant="secondary"
              className="absolute top-2 right-2 h-8 w-8 p-0 rounded-full"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ボトムナビゲーション */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="grid grid-cols-3 h-16">
          <button
            onClick={() => setActiveTab("analyze")}
            className={`flex flex-col items-center justify-center space-y-1 ${
              activeTab === "analyze" ? "text-blue-600 bg-blue-50" : "text-gray-600"
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-xs">分析</span>
          </button>
          <button
            onClick={() => setActiveTab("today")}
            className={`flex flex-col items-center justify-center space-y-1 ${
              activeTab === "today" ? "text-blue-600 bg-blue-50" : "text-gray-600"
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-xs">今日</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex flex-col items-center justify-center space-y-1 ${
              activeTab === "history" ? "text-blue-600 bg-blue-50" : "text-gray-600"
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-xs">履歴</span>
          </button>
        </div>
      </div>

      {/* 隠しinput要素 */}
      <Input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
      <Input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  )
}

// 今日の集計画面コンポーネント
function TodaySummary({ onTabChange }: { onTabChange: (tab: TabType) => void }) {
  const [todayData, setTodayData] = useState<MealRecord[]>([])

  React.useEffect(() => {
    // コンポーネントがマウントされた時とタブが切り替わった時にデータを再読み込み
    const loadTodayData = () => {
      setTodayData(getTodayMeals())
    }

    loadTodayData()

    // ストレージの変更を監視
    const handleStorageChange = () => {
      loadTodayData()
    }

    window.addEventListener("storage", handleStorageChange)

    // カスタムイベントも監視（同じタブ内での変更用）
    window.addEventListener("mealDataUpdated", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
      window.removeEventListener("mealDataUpdated", handleStorageChange)
    }
  }, [])

  const totalCalories = todayData.reduce((sum, meal) => sum + meal.calories, 0)
  const totalCarbs = todayData.reduce((sum, meal) => sum + meal.carbs, 0)
  const totalProtein = todayData.reduce((sum, meal) => sum + meal.protein, 0)
  const totalFat = todayData.reduce((sum, meal) => sum + meal.fat, 0)

  const calculatePFCRatio = (carbs: number, protein: number, fat: number) => {
    const carbsCal = carbs * 4
    const proteinCal = protein * 4
    const fatCal = fat * 9
    const total = carbsCal + proteinCal + fatCal

    if (total === 0) return "0:0:0"

    const carbsRatio = Math.round((carbsCal / total) * 100)
    const proteinRatio = Math.round((proteinCal / total) * 100)
    const fatRatio = Math.round((fatCal / total) * 100)

    return `${carbsRatio}:${proteinRatio}:${fatRatio}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-blue-50">
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900 text-center">今日の合計</h1>
          <p className="text-sm text-gray-600 text-center mt-1">{new Date().toLocaleDateString("ja-JP")}</p>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-20">
        {/* 合計カロリー */}
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-4xl font-bold text-orange-600 mb-2">{totalCalories}</div>
            <div className="text-lg text-orange-700 font-medium">総カロリー (kcal)</div>
          </CardContent>
        </Card>

        {/* 合計PFC */}
        <Card>
          <CardHeader>
            <CardTitle className="text-center">栄養素合計</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">{totalCarbs.toFixed(1)}g</div>
                <div className="text-sm text-green-700">炭水化物</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">{totalProtein.toFixed(1)}g</div>
                <div className="text-sm text-blue-700">タンパク質</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-yellow-600">{totalFat.toFixed(1)}g</div>
                <div className="text-sm text-yellow-700">脂質</div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-3 text-center">PFC比率</h4>
              <div className="text-center mb-3">
                <div className="text-xl font-bold text-gray-800">
                  {calculatePFCRatio(totalCarbs, totalProtein, totalFat)}
                </div>
                <div className="text-sm text-gray-600">炭水化物:タンパク質:脂質</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 今日の食事一覧 */}
        <Card>
          <CardHeader>
            <CardTitle>今日の食事 ({todayData.length}回)</CardTitle>
          </CardHeader>
          <CardContent>
            {todayData.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>まだ食事が記録されていません</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayData.map((meal) => (
                  <div key={meal.id} className="bg-gray-50 p-3 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium">{meal.name}</div>
                      <div className="text-sm text-gray-600">
                        {new Date(meal.timestamp).toLocaleTimeString("ja-JP", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div className="text-center">
                        <div className="font-semibold text-orange-600">{meal.calories}</div>
                        <div className="text-xs text-gray-600">kcal</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-green-600">{meal.carbs}g</div>
                        <div className="text-xs text-gray-600">炭水化物</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-blue-600">{meal.protein}g</div>
                        <div className="text-xs text-gray-600">タンパク質</div>
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-yellow-600">{meal.fat}g</div>
                        <div className="text-xs text-gray-600">脂質</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ボトムナビゲーション */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="grid grid-cols-3 h-16">
          <button
            onClick={() => onTabChange("analyze")}
            className="flex flex-col items-center justify-center space-y-1 text-gray-600"
          >
            <Home className="w-5 h-5" />
            <span className="text-xs">分析</span>
          </button>
          <button
            onClick={() => onTabChange("today")}
            className="flex flex-col items-center justify-center space-y-1 text-blue-600 bg-blue-50"
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-xs">今日</span>
          </button>
          <button
            onClick={() => onTabChange("history")}
            className="flex flex-col items-center justify-center space-y-1 text-gray-600"
          >
            <History className="w-5 h-5" />
            <span className="text-xs">履歴</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// 履歴画面コンポーネント
function HistoryView({ onTabChange }: { onTabChange: (tab: TabType) => void }) {
  const [historyData, setHistoryData] = useState<{ [date: string]: MealRecord[] }>({})

  React.useEffect(() => {
    // コンポーネントがマウントされた時とタブが切り替わった時にデータを再読み込み
    const loadHistoryData = () => {
      setHistoryData(getAllMealsGroupedByDate())
    }

    loadHistoryData()

    // ストレージの変更を監視
    const handleStorageChange = () => {
      loadHistoryData()
    }

    window.addEventListener("storage", handleStorageChange)

    // カスタムイベントも監視（同じタブ内での変更用）
    window.addEventListener("mealDataUpdated", handleStorageChange)

    return () => {
      window.removeEventListener("storage", handleStorageChange)
      window.removeEventListener("mealDataUpdated", handleStorageChange)
    }
  }, [])

  const dates = Object.keys(historyData).sort().reverse()

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-blue-50">
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900 text-center">食事履歴</h1>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-20">
        {dates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>まだ食事の記録がありません</p>
          </div>
        ) : (
          dates.map((date) => {
            const dayMeals = historyData[date]
            const totalCalories = dayMeals.reduce((sum, meal) => sum + meal.calories, 0)
            const totalCarbs = dayMeals.reduce((sum, meal) => sum + meal.carbs, 0)
            const totalProtein = dayMeals.reduce((sum, meal) => sum + meal.protein, 0)
            const totalFat = dayMeals.reduce((sum, meal) => sum + meal.fat, 0)

            return (
              <Card key={date}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex justify-between items-center">
                    <span>{new Date(date).toLocaleDateString("ja-JP")}</span>
                    <span className="text-sm font-normal text-gray-600">{dayMeals.length}回</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* 日別合計 */}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div className="text-center">
                        <div className="font-bold text-orange-600">{totalCalories}</div>
                        <div className="text-xs text-gray-600">kcal</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-green-600">{totalCarbs.toFixed(1)}g</div>
                        <div className="text-xs text-gray-600">炭水化物</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-blue-600">{totalProtein.toFixed(1)}g</div>
                        <div className="text-xs text-gray-600">タンパク質</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-yellow-600">{totalFat.toFixed(1)}g</div>
                        <div className="text-xs text-gray-600">脂質</div>
                      </div>
                    </div>
                  </div>

                  {/* 食事一覧 */}
                  <div className="space-y-2">
                    {dayMeals.map((meal) => (
                      <div key={meal.id} className="bg-white p-3 rounded border">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-medium text-sm">{meal.name}</div>
                          <div className="text-xs text-gray-600">
                            {new Date(meal.timestamp).toLocaleTimeString("ja-JP", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div className="text-center">
                            <div className="font-semibold text-orange-600">{meal.calories}</div>
                            <div className="text-gray-600">kcal</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-green-600">{meal.carbs}g</div>
                            <div className="text-gray-600">炭水化物</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-blue-600">{meal.protein}g</div>
                            <div className="text-gray-600">タンパク質</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-yellow-600">{meal.fat}g</div>
                            <div className="text-gray-600">脂質</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* ボトムナビゲーション */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="grid grid-cols-3 h-16">
          <button
            onClick={() => onTabChange("analyze")}
            className="flex flex-col items-center justify-center space-y-1 text-gray-600"
          >
            <Home className="w-5 h-5" />
            <span className="text-xs">分析</span>
          </button>
          <button
            onClick={() => onTabChange("today")}
            className="flex flex-col items-center justify-center space-y-1 text-gray-600"
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-xs">今日</span>
          </button>
          <button
            onClick={() => onTabChange("history")}
            className="flex flex-col items-center justify-center space-y-1 text-blue-600 bg-blue-50"
          >
            <History className="w-5 h-5" />
            <span className="text-xs">履歴</span>
          </button>
        </div>
      </div>
    </div>
  )
}
