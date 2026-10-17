"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/ui/resource-state";
import { Tabs } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/api/client";

interface ApiKeyDto {
  id: string;
  name: string;
  maskedKey: string;
  scopes: string[];
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  lastUsedAt?: string;
}

interface WebhookEndpointDto {
  id: string;
  url: string;
  events: string[];
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
}

export default function IntegrationsSettingsPage() {
  const [activeTab, setActiveTab] = useState<"keys" | "webhooks">("keys");
  const queryClient = useQueryClient();

  // API Keys
  const keysQuery = useQuery({
    queryKey: ["integrations", "api-keys"],
    queryFn: async () => {
      const res = await apiRequest<{ data: ApiKeyDto[] }>("/api/integrations/api-keys");
      return res.data;
    },
    enabled: activeTab === "keys",
  });

  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState("order.read, inventory.read");
  const [newlyCreatedKeySecret, setNewlyCreatedKeySecret] = useState<string | null>(null);

  const createKeyMutation = useMutation({
    mutationFn: async (input: { name: string; scopes: string[] }) => {
      return apiRequest<{ data: { apiKey: ApiKeyDto; rawKey: string } }>("/api/integrations/api-keys", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["integrations", "api-keys"] });
      setNewlyCreatedKeySecret(res.data.rawKey);
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("/api/integrations/api-keys/" + id + "/revoke", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations", "api-keys"] });
    },
  });

  // Webhooks
  const webhooksQuery = useQuery({
    queryKey: ["integrations", "webhooks"],
    queryFn: async () => {
      const res = await apiRequest<{ data: WebhookEndpointDto[] }>("/api/integrations/webhooks");
      return res.data;
    },
  });

  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [subscribedEvents, setSubscribedEvents] = useState("order.released, task.completed, shipment.dispatched");

  const registerWebhookMutation = useMutation({
    mutationFn: async (input: { url: string; secret?: string; subscribedEvents: string[] }) => {
      return apiRequest("/api/integrations/webhooks", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations", "webhooks"] });
      setShowWebhookModal(false);
      setWebhookUrl("");
      setWebhookSecret("");
    },
  });

  return (
    <div className="page-stack">
      <PageHeader
        title="Integrations & Developer Access"
        description="Manage workspace REST API keys with granular scopes and configure real-time outbound webhook endpoints."
        actions={
          activeTab === "keys" ? (
            <Button
              variant="primary"
              onClick={() => {
                setNewlyCreatedKeySecret(null);
                setKeyName("");
                setShowKeyModal(true);
              }}
              icon="plus"
            >
              Generate API Key
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => setShowWebhookModal(true)}
              icon="plus"
            >
              Register Webhook
            </Button>
          )
        }
      />

      {/* Tabs */}
      <Tabs
        ariaLabel="Integration settings sections"
        activeId={activeTab}
        onChange={setActiveTab}
        items={[
          {
            id: "keys",
            label: "REST API Keys",
            icon: "lock",
            count: keysQuery.data?.length ?? 0,
          },
          {
            id: "webhooks",
            label: "Webhook Endpoints",
            icon: "network",
            count: webhooksQuery.data?.length ?? 0,
          },
        ]}
      />

      {/* TAB 1: API Keys */}
      {activeTab === "keys" && (
        <div className="space-y-4">
          {keysQuery.isLoading ? (
            <LoadingState message="Loading API keys..." />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white border-line">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-surface text-muted font-semibold uppercase tracking-wider border-line">
                    <th className="py-3 px-4">Key Name</th>
                    <th className="py-3 px-4 font-mono">Masked Token</th>
                    <th className="py-3 px-4">Scopes</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {(!keysQuery.data || keysQuery.data.length === 0) ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted">
                        No API keys generated yet. Click Generate API Key to create one.
                      </td>
                    </tr>
                  ) : (
                    keysQuery.data.map((key) => (
                      <tr key={key.id} className="hover:bg-surface-muted transition-colors">
                        <td className="py-3 px-4 font-semibold text-ink">
                          {key.name}
                        </td>
                        <td className="py-3 px-4 font-mono text-muted">
                          {key.maskedKey}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.map((s, idx) => (
                              <Badge key={idx} variant="default">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={key.status === "ACTIVE" ? "success" : "danger"}>
                            {key.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted">
                          {new Date(key.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {key.status === "ACTIVE" && (
                            <Button
                              size="small"
                              onClick={() => revokeKeyMutation.mutate(key.id)}
                              disabled={revokeKeyMutation.isPending}
                            >
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Webhooks */}
      {activeTab === "webhooks" && (
        <div className="space-y-4">
          {webhooksQuery.isLoading ? (
            <LoadingState message="Loading webhook endpoints..." />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white border-line">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b bg-surface text-muted font-semibold uppercase tracking-wider border-line">
                    <th className="py-3 px-4">Endpoint URL</th>
                    <th className="py-3 px-4">Subscribed Events</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-ink">
                  {(!webhooksQuery.data || webhooksQuery.data.length === 0) ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-muted">
                        No webhook endpoints registered yet. Click Register Webhook to configure.
                      </td>
                    </tr>
                  ) : (
                    webhooksQuery.data.map((wh) => (
                      <tr key={wh.id} className="hover:bg-surface-muted transition-colors">
                        <td className="py-3 px-4 font-mono font-medium text-ink">
                          {wh.url}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {wh.events.map((ev, idx) => (
                              <Badge key={idx} variant="blue">
                                {ev}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={wh.status === "ACTIVE" ? "success" : "default"}>
                            {wh.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-muted">
                          {new Date(wh.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Generate API Key Modal */}
      {showKeyModal && (
        <Dialog
          isOpen
          onClose={() => { setShowKeyModal(false); setNewlyCreatedKeySecret(null); }}
          title="Generate REST API Key"
          size="md"
          pending={createKeyMutation.isPending}
        >
          {newlyCreatedKeySecret ? (
            <div className="space-y-4">
              <div className="p-4 bg-success-soft border border-line rounded-xl text-xs space-y-2">
                <div className="font-bold text-success uppercase">
                  API Key Successfully Generated!
                </div>
                <p className="text-ink">
                  Please copy and securely store this key now. For security purposes, you will not be able to view it again.
                </p>
                <div className="p-3 bg-surface border border-line rounded font-mono text-xs select-all break-all text-ink font-semibold">
                  {newlyCreatedKeySecret}
                </div>
              </div>

              <div className="dialog-actions">
                <Button
                  variant="primary"
                  onClick={() => { setShowKeyModal(false); setNewlyCreatedKeySecret(null); }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createKeyMutation.mutate({
                  name: keyName.trim(),
                  scopes: keyScopes.split(",").map((s) => s.trim()).filter(Boolean),
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Key Application Name
                </label>
                <Input
                  type="text"
                  required
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. ERP System Ingestion Connector"
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Granular Scopes (comma-separated)
                </label>
                <Input
                  type="text"
                  required
                  value={keyScopes}
                  onChange={(e) => setKeyScopes(e.target.value)}
                  placeholder="e.g. order.read, inventory.read, task.execute_assigned"
                  className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink font-mono"
                />
                <span className="text-xs text-muted block mt-1">
                  Allowed permissions for this API client. Access is strictly scoped to this workspace.
                </span>
              </div>

              <div className="dialog-actions">
                <Button onClick={() => setShowKeyModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={createKeyMutation.isPending || !keyName}>
                  {createKeyMutation.isPending ? "Generating..." : "Generate Key"}
                </Button>
              </div>
            </form>
          )}
        </Dialog>
      )}

      {/* Register Webhook Modal */}
      {showWebhookModal && (
        <Dialog
          isOpen
          onClose={() => setShowWebhookModal(false)}
          title="Register Outbound Webhook"
          size="md"
          pending={registerWebhookMutation.isPending}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              registerWebhookMutation.mutate({
                url: webhookUrl.trim(),
                secret: webhookSecret.trim() || undefined,
                subscribedEvents: subscribedEvents.split(",").map((ev) => ev.trim()).filter(Boolean),
              });
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                HTTPS Webhook Endpoint URL
              </label>
              <Input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://api.yourcompany.com/webhooks/manuos"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                HMAC Verification Secret (Optional)
              </label>
              <Input
                type="text"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Custom secret used to generate X-ManuOS-Signature"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Subscribed Event Topics (comma-separated)
              </label>
              <Input
                type="text"
                required
                value={subscribedEvents}
                onChange={(e) => setSubscribedEvents(e.target.value)}
                placeholder="order.released, task.completed, shipment.dispatched, telemetry.alert"
                className="w-full bg-surface border border-line rounded px-3 py-2 text-xs text-ink font-mono"
              />
            </div>

            <div className="dialog-actions">
              <Button onClick={() => setShowWebhookModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={registerWebhookMutation.isPending || !webhookUrl}>
                {registerWebhookMutation.isPending ? "Registering..." : "Save Webhook"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
