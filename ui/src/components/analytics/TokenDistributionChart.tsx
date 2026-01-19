import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface TokenDistributionProps {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export function TokenDistributionChart({
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
}: TokenDistributionProps) {
  const totalTokens = inputTokens + outputTokens
  const totalCache = cacheReadTokens + cacheWriteTokens
  const cacheHitRatio = totalCache > 0 ? cacheReadTokens / totalCache : 0

  const inputPercent = (inputTokens / totalTokens) * 100
  const outputPercent = (outputTokens / totalTokens) * 100

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">Token Composition</h3>
        <div className="flex h-8 rounded-lg overflow-hidden bg-gray-100">
          <div
            className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${inputPercent}%` }}
            title={`Input: ${inputTokens.toLocaleString()}`}
          >
            {inputPercent > 10 && `${inputPercent.toFixed(0)}%`}
          </div>
          <div
            className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
            style={{ width: `${outputPercent}%` }}
            title={`Output: ${outputTokens.toLocaleString()}`}
          >
            {outputPercent > 10 && `${outputPercent.toFixed(0)}%`}
          </div>
        </div>
        <div className="flex gap-6 mt-3 text-sm">
          <div>
            <p className="text-gray-600">Input</p>
            <p className="font-medium">{inputTokens.toLocaleString()}</p>
            <p className="text-xs text-gray-500">{inputPercent.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-gray-600">Output</p>
            <p className="font-medium">{outputTokens.toLocaleString()}</p>
            <p className="text-xs text-gray-500">{outputPercent.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-sm font-semibold mb-3">Cache Performance</h3>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm">Cache Hit Ratio</span>
              <Badge variant="secondary">{(cacheHitRatio * 100).toFixed(1)}%</Badge>
            </div>
            <div className="flex h-6 rounded-lg overflow-hidden bg-gray-100">
              <div
                className="bg-purple-500"
                style={{ width: `${cacheHitRatio * 100}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 bg-purple-50 rounded-lg">
              <p className="text-gray-600 text-xs">Cache Reads</p>
              <p className="font-medium text-lg">{cacheReadTokens.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <p className="text-gray-600 text-xs">Cache Writes</p>
              <p className="font-medium text-lg">{cacheWriteTokens.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
