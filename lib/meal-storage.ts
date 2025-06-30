export interface MealRecord {
  id: string
  date: string // YYYY-MM-DD format
  timestamp: string // ISO string
  name: string
  calories: number
  carbs: number
  protein: number
  fat: number
  confidence: number
  image?: string
}

const STORAGE_KEY = "meal_records"

export function saveMealData(meal: MealRecord): void {
  if (typeof window === "undefined") return

  const existingData = getMealData()
  const updatedData = [...existingData, meal]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData))
}

export function getMealData(): MealRecord[] {
  if (typeof window === "undefined") return []

  const data = localStorage.getItem(STORAGE_KEY)
  return data ? JSON.parse(data) : []
}

export function getTodayMeals(): MealRecord[] {
  const today = new Date().toISOString().split("T")[0]
  return getMealData().filter((meal) => meal.date === today)
}

export function getAllMealsGroupedByDate(): { [date: string]: MealRecord[] } {
  const allMeals = getMealData()
  const grouped: { [date: string]: MealRecord[] } = {}

  allMeals.forEach((meal) => {
    if (!grouped[meal.date]) {
      grouped[meal.date] = []
    }
    grouped[meal.date].push(meal)
  })

  // Sort meals within each date by timestamp
  Object.keys(grouped).forEach((date) => {
    grouped[date].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  })

  return grouped
}

export function deleteMealRecord(id: string): void {
  if (typeof window === "undefined") return

  const existingData = getMealData()
  const updatedData = existingData.filter((meal) => meal.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData))
}

export function clearAllMealData(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(STORAGE_KEY)
}

export function getMealById(id: string): MealRecord | undefined {
  return getMealData().find((meal) => meal.id === id)
}
