import type { ReactNode } from "react";
import type { AppSnapshot } from "@/domain/types";
import type { FormField } from "@/shared/ui/dialog";

export type Values = Record<string, string | boolean | string[]>;
export interface Editor {
  title: string;
  description?: string;
  children?: ReactNode;
  fields: FormField[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
  submit: (values: Values) => Promise<void>;
}
export interface ViewProps {
  state: AppSnapshot;
  disabled: boolean;
  command: (action: string, payload: Record<string, unknown>) => Promise<unknown>;
  account: (
    path: string,
    payload: Record<string, unknown>,
  ) => Promise<{ message?: string; inviteUrl?: string }>;
  edit: (editor: Editor) => void;
  run: (action: () => Promise<unknown>) => void;
  inspect: (visitId: string) => void;
  navigate: (view: string) => void;
}
