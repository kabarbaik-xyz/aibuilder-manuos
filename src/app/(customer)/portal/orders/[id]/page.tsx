import React from "react";
import { PortalOrderDetailView } from "@/features/portal/components/PortalOrderDetailView";

export default async function PortalOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PortalOrderDetailView orderId={id} />;
}
