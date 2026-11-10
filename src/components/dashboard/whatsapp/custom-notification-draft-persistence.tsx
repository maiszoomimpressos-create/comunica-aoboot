"use client";

import { useEffect, useRef } from "react";
import {
  clearCustomNotificationDraft,
  isDraftEmpty,
  loadCustomNotificationDraft,
  saveCustomNotificationDraft,
  type CustomNotificationDraftV1,
} from "@/lib/notifications/custom-notification-draft-storage";

type DraftValue = Omit<CustomNotificationDraftV1, "v">;

/**
 * Saves the in-progress custom-function draft to sessionStorage and, on
 * mount only, restores a stored draft when the parent is still empty.
 * Does not overwrite a live non-empty form (so a hot-reload that preserved
 * parent state is left untouched, then persisted).
 */
export function CustomNotificationDraftPersistence({
  tenantSlug,
  connectionId,
  value,
  onRestore,
}: {
  tenantSlug: string;
  connectionId: string;
  value: DraftValue;
  onRestore: (draft: CustomNotificationDraftV1) => void;
}) {
  const didRestore = useRef(false);
  const valueRef = useRef(value);
  const onRestoreRef = useRef(onRestore);
  valueRef.current = value;
  onRestoreRef.current = onRestore;

  useEffect(() => {
    if (didRestore.current) return;
    if (!isDraftEmpty(valueRef.current)) return;
    const stored = loadCustomNotificationDraft(tenantSlug, connectionId);
    if (!stored) return;
    didRestore.current = true;
    onRestoreRef.current(stored);
  }, [tenantSlug, connectionId]);

  useEffect(() => {
    if (isDraftEmpty(value)) return;
    saveCustomNotificationDraft(tenantSlug, connectionId, value);
  }, [tenantSlug, connectionId, value]);

  return null;
}

export function clearPersistedCustomNotificationDraft(tenantSlug: string, connectionId: string) {
  clearCustomNotificationDraft(tenantSlug, connectionId);
}