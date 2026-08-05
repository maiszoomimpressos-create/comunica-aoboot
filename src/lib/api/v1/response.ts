import { NextResponse } from "next/server";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export function apiOk<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  const body: ApiSuccess<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return NextResponse.json(body, { status });
}

export function apiFail(
  code: string,
  message: string,
  status: number,
  details?: unknown
) {
  const body: ApiError = { success: false, error: { code, message, details } };
  return NextResponse.json(body, { status });
}
