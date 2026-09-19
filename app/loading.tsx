import { RouteSwish } from "@/components/route-change-loader"

export default function RootLoading() {
  return <RouteSwish />
}

function OldRootLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#FFFCF8]/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-10 w-10">
          <div className="absolute inset-0 rounded-full border-2 border-[#78482D]/10" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#E9783D] animate-spin" />
        </div>
        <p className="text-sm font-medium text-[#80685E] animate-pulse">Loading…</p>
      </div>
    </div>
  )
}
