export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

export function actionOk<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function actionFail(error: {
  code: string;
  message: string;
  details?: unknown;
}): ActionResult<never> {
  return { success: false, error };
}
