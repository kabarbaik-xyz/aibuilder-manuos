import React from "react";
import { ShopFloorTodayView } from "@/features/execution/components/ShopFloorTodayView";

export const metadata = {
  title: "Today's Shop Floor Schedule | ManuOS",
  description: "Live shift overview, running work sessions, and today's task queue for the operator.",
};

export default function ShopFloorTodayPage() {
  return <ShopFloorTodayView />;
}
